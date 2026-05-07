import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { escalamientos } from '@/drizzle/schema'
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

  const envio = fields.horaEnvioCorreo instanceof Date ? fields.horaEnvioCorreo : null
  const resp  = fields.horaRespuesta   instanceof Date ? fields.horaRespuesta   : null
  if (envio && resp) {
    fields.tiempoRespuestaMin = Math.round((resp.getTime() - envio.getTime()) / 60000)
  } else {
    fields.tiempoRespuestaMin = null
  }

  const [updated] = await db.update(escalamientos).set(fields).where(eq(escalamientos.id, id)).returning()
  return NextResponse.json(updated)
}
