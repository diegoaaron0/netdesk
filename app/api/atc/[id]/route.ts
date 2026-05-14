import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { atcLlamadas } from '@/drizzle/schema'
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
    const [existing] = await db.select({ inicio: atcLlamadas.inicio })
      .from(atcLlamadas).where(eq(atcLlamadas.id, id))
    const fin = new Date()
    fields.fin = fin
    fields.duracionMin = existing?.inicio
      ? Math.round((fin.getTime() - new Date(existing.inicio).getTime()) / 60000)
      : null
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
