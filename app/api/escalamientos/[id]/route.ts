import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { escalamientos, incidentes, adjuntos, atcLlamadas } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'escalamientos.crear')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const fields: any = {}
  if ('horaEnvioCorreo' in body) fields.horaEnvioCorreo = body.horaEnvioCorreo ? new Date(body.horaEnvioCorreo) : null
  if ('horaRespuesta'   in body) fields.horaRespuesta   = body.horaRespuesta   ? new Date(body.horaRespuesta)   : null
  if ('respuestaTexto'  in body) fields.respuestaTexto  = body.respuestaTexto  ?? null

  const envio = fields.horaEnvioCorreo instanceof Date ? fields.horaEnvioCorreo : null
  const resp  = fields.horaRespuesta   instanceof Date ? fields.horaRespuesta   : null
  if (envio && resp) {
    fields.tiempoRespuestaMin = Math.round((resp.getTime() - envio.getTime()) / 60000)
  } else if ('horaRespuesta' in body || 'horaEnvioCorreo' in body) {
    fields.tiempoRespuestaMin = null
  }

  const [updated] = await db.update(escalamientos).set(fields).where(eq(escalamientos.id, id)).returning()
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'escalamientos.crear')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [esc] = await db.select({
    id: escalamientos.id,
    incidenteId: escalamientos.incidenteId,
    horaEnvioCorreo: escalamientos.horaEnvioCorreo,
  }).from(escalamientos).where(eq(escalamientos.id, id))

  if (!esc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await db.delete(adjuntos).where(eq(adjuntos.escalamientoId, id))
  await db.delete(atcLlamadas).where(eq(atcLlamadas.escalamientoId, id))
  await db.delete(escalamientos).where(eq(escalamientos.id, id))

  // Si ya no hay escalamientos en este incidente, revertir estado
  const remaining = await db.select({ id: escalamientos.id })
    .from(escalamientos)
    .where(eq(escalamientos.incidenteId, esc.incidenteId))

  if (remaining.length === 0) {
    await db.update(incidentes)
      .set({ estado: 'ABIERTO', actualizadoEn: new Date() })
      .where(eq(incidentes.id, esc.incidenteId))
  }

  return NextResponse.json({ ok: true })
}
