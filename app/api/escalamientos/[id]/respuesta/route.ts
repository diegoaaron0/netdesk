import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { escalamientos } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  const [esc] = await db.select({ horaEnvioCorreo: escalamientos.horaEnvioCorreo })
    .from(escalamientos).where(eq(escalamientos.id, id))

  const horaRespuesta = new Date()
  const tiempoRespuestaMin = esc?.horaEnvioCorreo
    ? Math.round((horaRespuesta.getTime() - new Date(esc.horaEnvioCorreo).getTime()) / 60000)
    : null

  const [updated] = await db.update(escalamientos)
    .set({
      horaRespuesta,
      tiempoRespuestaMin,
      estadoCronometro: 'RESPONDIDO',
      respuestaTexto:         body.respuestaProveedor      ?? null,
      tiempoEstimadoSolucion: body.tiempoEstimadoSolucion  ?? null,
    })
    .where(eq(escalamientos.id, id))
    .returning()

  return NextResponse.json(updated)
}
