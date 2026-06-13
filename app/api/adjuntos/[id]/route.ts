import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adjuntos } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  await db.delete(adjuntos).where(eq(adjuntos.id, id))
  return NextResponse.json({ ok: true })
}
