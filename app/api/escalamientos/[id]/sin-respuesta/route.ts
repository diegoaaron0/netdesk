import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { escalamientos } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function PUT(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'escalamientos.respuesta')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [updated] = await db.update(escalamientos)
    .set({ noHuboRespuesta: true, estadoCronometro: 'VENCIDO' })
    .where(eq(escalamientos.id, id))
    .returning()

  return NextResponse.json(updated)
}
