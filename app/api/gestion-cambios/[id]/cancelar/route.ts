import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accionesGestion } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

// Cancela una acción que aún no se ha ejecutado (PROPUESTO o APROBADO).
// Una vez ejecutada (COMPLETADA) ya no se puede cancelar: el cambio ya ocurrió.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const motivo: string = body.motivo?.trim() ?? ''

  const [current] = await db.select({
    estado:      accionesGestion.estado,
    creadoPorId: accionesGestion.creadoPorId,
  }).from(accionesGestion).where(eq(accionesGestion.id, id))
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  if (!['PROPUESTO', 'APROBADO'].includes(current.estado))
    return NextResponse.json({ error: 'Solo se puede cancelar una acción PROPUESTA o APROBADA (aún no ejecutada)' }, { status: 409 })

  // Puede cancelar: quien la creó, o quien puede aprobar (Gerencia)
  const userId   = (session.user as any)?.id
  const esCreador = current.creadoPorId === userId
  if (!esCreador && !can(session, 'gestion-cambios.aprobar'))
    return NextResponse.json({ error: 'Sin permiso para cancelar esta acción' }, { status: 403 })

  const [updated] = await db.update(accionesGestion)
    .set({ estado: 'CANCELADO', rechazadoMotivo: motivo || null, actualizadoEn: new Date() })
    .where(eq(accionesGestion.id, id))
    .returning()

  return NextResponse.json(updated)
}
