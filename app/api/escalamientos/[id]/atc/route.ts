import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { atcLlamadas, escalamientos } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'escalamientos.respuesta')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const now = new Date()

  const [created] = await db.insert(atcLlamadas).values({
    escalamientoId: id,
    inicio: now,
  }).returning()

  return NextResponse.json(created, { status: 201 })
}
