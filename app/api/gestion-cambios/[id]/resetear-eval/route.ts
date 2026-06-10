import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accionesGestion } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const periodo: 30 | 90 = body.periodo === 90 ? 90 : 30

  const [accion] = await db.select({
    id:               accionesGestion.id,
    estado:           accionesGestion.estado,
    eval30Completada: accionesGestion.eval30Completada,
    eval90Completada: accionesGestion.eval90Completada,
  }).from(accionesGestion).where(eq(accionesGestion.id, id))

  if (!accion) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!['EN_EVALUACION', 'COMPLETADO'].includes(accion.estado))
    return NextResponse.json({ error: 'Estado no permite resetear evaluación' }, { status: 409 })

  const patch: Record<string, any> = { actualizadoEn: new Date() }

  if (periodo === 30) {
    patch.eval30Completada  = false
    patch.eval30Fecha       = null
    patch.eval30SlaPct      = null
    patch.eval30MttrMin     = null
    patch.eval30Iei         = null
    patch.eval30Nincidentes = null
    patch.eval30Detalle     = null
    patch.eval30Nota        = null
    patch.penalidadEstimada = null
    patch.estado            = 'EJECUTADO'
  } else {
    patch.eval90Completada  = false
    patch.eval90Fecha       = null
    patch.eval90SlaPct      = null
    patch.eval90MttrMin     = null
    patch.eval90Iei         = null
    patch.eval90Nincidentes = null
    patch.eval90Detalle     = null
    patch.eval90Nota        = null
    patch.penalidadEstimada = null
    patch.estado            = 'EN_EVALUACION'
  }

  const [updated] = await db.update(accionesGestion)
    .set(patch)
    .where(eq(accionesGestion.id, id))
    .returning()

  return NextResponse.json(updated)
}
