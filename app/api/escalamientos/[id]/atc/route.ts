import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { atcLlamadas, escalamientos } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const now = new Date()

  const [created] = await db.insert(atcLlamadas).values({
    escalamientoId: id,
    inicio: now,
  }).returning()

  // Auto-set hora_respuesta en el escalamiento si todavía no tiene
  const [esc] = await db.select({ horaRespuesta: escalamientos.horaRespuesta })
    .from(escalamientos).where(eq(escalamientos.id, id))
  if (esc && !esc.horaRespuesta) {
    await db.update(escalamientos)
      .set({ horaRespuesta: now })
      .where(eq(escalamientos.id, id))
  }

  return NextResponse.json(created, { status: 201 })
}
