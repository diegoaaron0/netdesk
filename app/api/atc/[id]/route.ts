import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { atcLlamadas, escalamientos } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'escalamientos.respuesta')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const fields: any = {}

  if ('notas' in body) fields.notas = body.notas ?? null

  // Corrección manual de horas de la llamada (no toca el escalamiento)
  if ('inicio' in body || 'fin' in body) {
    const [existing] = await db.select({ inicio: atcLlamadas.inicio, fin: atcLlamadas.fin })
      .from(atcLlamadas).where(eq(atcLlamadas.id, id))
    const nuevoInicio = 'inicio' in body
      ? (body.inicio ? new Date(body.inicio) : existing?.inicio ?? null)  // inicio es NOT NULL: si llega vacío, se conserva
      : existing?.inicio ?? null
    const nuevoFin = 'fin' in body
      ? (body.fin ? new Date(body.fin) : null)
      : existing?.fin ?? null
    if ('inicio' in body && body.inicio) fields.inicio = nuevoInicio
    if ('fin' in body) fields.fin = nuevoFin
    if (nuevoInicio && nuevoFin) {
      const d = Math.round((new Date(nuevoFin).getTime() - new Date(nuevoInicio).getTime()) / 60000)
      fields.duracionMin = d >= 0 ? d : null
    } else {
      fields.duracionMin = null
    }
  }

  if (body.finalizar) {
    const [existing] = await db.select({ inicio: atcLlamadas.inicio, escalamientoId: atcLlamadas.escalamientoId })
      .from(atcLlamadas).where(eq(atcLlamadas.id, id))
    const fin = new Date()
    fields.fin = fin
    fields.duracionMin = existing?.inicio
      ? Math.round((fin.getTime() - new Date(existing.inicio).getTime()) / 60000)
      : null

    // Finalizar llamada = primera respuesta del proveedor (si el escalamiento aún no tiene)
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
  if (!can(session, 'escalamientos.respuesta')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  await db.delete(atcLlamadas).where(eq(atcLlamadas.id, id))
  return NextResponse.json({ ok: true })
}
