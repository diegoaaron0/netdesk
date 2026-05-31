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

  const horaRespuesta = body.horaRespuesta ? new Date(body.horaRespuesta) : new Date()
  if (esc?.horaEnvioCorreo && horaRespuesta < new Date(esc.horaEnvioCorreo))
    return NextResponse.json({ error: 'hora_respuesta no puede ser anterior a hora_envio_correo' }, { status: 400 })
  const tiempoRespuestaMin = esc?.horaEnvioCorreo
    ? Math.round((horaRespuesta.getTime() - new Date(esc.horaEnvioCorreo).getTime()) / 60000)
    : null

  const [updated] = await db.update(escalamientos)
    .set({
      horaRespuesta,
      tiempoRespuestaMin,
      estadoCronometro: 'RESPONDIDO',
      respuestaTexto:         body.respuestaTexto          ?? null,
      tiempoEstimadoSolucion: body.tiempoEstimadoSolucion  ?? null,
    })
    .where(eq(escalamientos.id, id))
    .returning()

  return NextResponse.json(updated)
}
