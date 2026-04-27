import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [updated] = await db.update(incidentes)
    .set({ estado: 'CANCELADO', horaFin: new Date(), actualizadoEn: new Date() })
    .where(eq(incidentes.id, id))
    .returning()

  return NextResponse.json(updated)
}
