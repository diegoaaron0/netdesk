import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { atcLlamadas, escalamientos } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const fields: any = {}

  if ('notas' in body) fields.notas = body.notas ?? null

  if (body.finalizar) {
    const [existing] = await db.select({ inicio: atcLlamadas.inicio, escalamientoId: atcLlamadas.escalamientoId })
      .from(atcLlamadas).where(eq(atcLlamadas.id, id))
    const fin = new Date()
    fields.fin = fin
    fields.duracionMin = existing?.inicio
      ? Math.round((fin.getTime() - new Date(existing.inicio).getTime()) / 60000)
      : null

    // Al finalizar la llamada = se obtuvo el ticket → registrar como primera respuesta si aún no tiene
    if (existing?.escalamientoId) {
      const [esc] = await db.select({ horaRespuesta: escalamientos.horaRespuesta, horaEnvioCorreo: escalamientos.horaEnvioCorreo })
        .from(escalamientos).where(eq(escalamientos.id, existing.escalamientoId))
      if (esc && !esc.horaRespuesta) {
        const tiempoRespuestaMin = esc.horaEnvioCorreo
          ? Math.round((fin.getTime() - new Date(esc.horaEnvioCorreo).getTime()) / 60000)
          : null
        await db.update(escalamientos)
          .set({ horaRespuesta: fin, tiempoRespuestaMin, estadoCronometro: 'RESPONDIDO' })
          .where(eq(escalamientos.id, existing.escalamientoId))
      }
    }
  }

  const [updated] = await db.update(atcLlamadas).set(fields).where(eq(atcLlamadas.id, id)).returning()
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  await db.delete(atcLlamadas).where(eq(atcLlamadas.id, id))
  return NextResponse.json({ ok: true })
}
