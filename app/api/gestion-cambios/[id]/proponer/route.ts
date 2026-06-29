import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accionesGestion, usuarios, fichas } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { sendMail } from '@/lib/mailer'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const fichaNuevaId: string | null = body.fichaNuevaId ?? null

  const [current] = await db.select({
    estado:           accionesGestion.estado,
    titulo:           accionesGestion.titulo,
    tipo:             accionesGestion.tipo,
    tiendaId:         accionesGestion.tiendaId,
    proveedorNuevoId: accionesGestion.proveedorNuevoId,
  }).from(accionesGestion).where(eq(accionesGestion.id, id))
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (current.estado !== 'BORRADOR')
    return NextResponse.json({ error: 'Solo se puede proponer desde BORRADOR' }, { status: 409 })

  // CAMBIO_PROVEEDOR: la ficha del nuevo proveedor es OBLIGATORIA y se adjunta aquí, al proponer.
  let fichaParaGuardar: string | undefined = undefined
  if (current.tipo === 'CAMBIO_PROVEEDOR') {
    if (!fichaNuevaId)
      return NextResponse.json({ error: 'Debes adjuntar la ficha del nuevo proveedor antes de proponer' }, { status: 400 })
    const [f] = await db.select({
      tiendaId: fichas.tiendaId, proveedorId: fichas.proveedorId, estado: fichas.estado,
    }).from(fichas).where(eq(fichas.id, fichaNuevaId)).limit(1)
    if (!f)
      return NextResponse.json({ error: 'La ficha indicada no existe' }, { status: 400 })
    if (f.tiendaId !== current.tiendaId)
      return NextResponse.json({ error: 'La ficha no pertenece a la tienda de la acción' }, { status: 400 })
    if (current.proveedorNuevoId && f.proveedorId !== current.proveedorNuevoId)
      return NextResponse.json({ error: 'La ficha no corresponde al proveedor nuevo' }, { status: 400 })
    if (f.estado !== 'BORRADOR')
      return NextResponse.json({ error: 'La ficha debe estar en BORRADOR (se activará al ejecutar)' }, { status: 400 })
    fichaParaGuardar = fichaNuevaId
  }

  const [updated] = await db.update(accionesGestion)
    .set({ estado: 'PROPUESTO', fichaNuevaId: fichaParaGuardar, actualizadoEn: new Date() })
    .where(eq(accionesGestion.id, id))
    .returning()

  // Notificar a gerencia
  try {
    const gerentes = await db.select({ email: usuarios.email, nombre: usuarios.nombre })
      .from(usuarios)
      .where(eq(usuarios.rol, 'GERENCIA'))
    for (const g of gerentes) {
      if (g.email) {
        sendMail({
          to: g.email,
          subject: `📋 Nueva acción propuesta: ${current.titulo} — NetDesk`,
          text: `Se ha registrado una nueva acción en Gestión de Cambios que requiere tu aprobación.\n\nAcción: ${current.titulo}\n\nIngresa a NetDesk > Gestión de Cambios para revisarla.`,
        }).catch(() => {})
      }
    }
  } catch { /* mail no crítico */ }

  return NextResponse.json(updated)
}
