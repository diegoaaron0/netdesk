import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { atcLlamadas } from '@/drizzle/schema'
import { auth } from '@/auth'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [created] = await db.insert(atcLlamadas).values({
    escalamientoId: id,
    inicio: new Date(),
  }).returning()

  return NextResponse.json(created, { status: 201 })
}
