import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, escalamientos } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'escalamientos.crear')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()

  const estadoMap: Record<number, any> = { 1: 'ESCALADO_N1', 2: 'ESCALADO_N2', 3: 'ESCALADO_N3' }
  const nuevoEstado = estadoMap[body.nivel] ?? 'ESCALADO_N1'

  const creadoPorId = (session.user as any)?.id ?? null

  // Insert del escalamiento + cambio de estado del incidente en una sola transacción:
  // evita un escalamiento registrado sin que el incidente refleje el estado ESCALADO_Nx.
  const esc = await db.transaction(async (tx) => {
    const [created] = await tx.insert(escalamientos).values({
      incidenteId:      id,
      nivel:            body.nivel,
      fichaNivelId:     body.fichaNivelId     ?? null,
      contactoEscalado: body.contactoEscalado,
      emailContacto:    body.emailContacto,
      telefonoContacto: body.telefonoContacto ?? null,
      tiempoEstimadoSolucion: body.tiempoEstimadoSolucion ?? null,
      cuerpoCorreo:     body.cuerpoCorreo     ?? null,
      creadoPorId,
    }).returning()

    await tx.update(incidentes)
      .set({ estado: nuevoEstado, actualizadoEn: new Date() })
      .where(eq(incidentes.id, id))

    return created
  })

  return NextResponse.json(esc, { status: 201 })
}
