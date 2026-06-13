import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accionesGestion, usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { sendMail } from '@/lib/mailer'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!can(session, 'gestion-cambios.aprobar'))
    return NextResponse.json({ error: 'Solo Gerencia puede rechazar acciones' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const rechazadoMotivo: string = body.rechazadoMotivo?.trim() ?? ''
  if (!rechazadoMotivo)
    return NextResponse.json({ error: 'rechazadoMotivo es requerido' }, { status: 400 })

  const [current] = await db.select({
    estado:      accionesGestion.estado,
    titulo:      accionesGestion.titulo,
    creadoPorId: accionesGestion.creadoPorId,
  }).from(accionesGestion).where(eq(accionesGestion.id, id))
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (current.estado !== 'PROPUESTO')
    return NextResponse.json({ error: 'Solo se puede rechazar desde PROPUESTO' }, { status: 409 })

  const aprobadoPorNombre = (session.user as any)?.nombre ?? 'Gerencia'

  const [updated] = await db.update(accionesGestion)
    .set({ estado: 'RECHAZADO', rechazadoMotivo, actualizadoEn: new Date() })
    .where(eq(accionesGestion.id, id))
    .returning()

  if (current.creadoPorId) {
    const [resp] = await db.select({ email: usuarios.email })
      .from(usuarios).where(eq(usuarios.id, current.creadoPorId))
    if (resp?.email) {
      sendMail({
        to: resp.email,
        subject: `❌ Acción rechazada: ${current.titulo} — NetDesk`,
        text: `Tu acción "${current.titulo}" fue rechazada por ${aprobadoPorNombre}.\nMotivo: ${rechazadoMotivo}`,
      }).catch(() => {})
    }
  }

  return NextResponse.json(updated)
}
