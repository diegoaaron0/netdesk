import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fichasNiveles } from '@/drizzle/schema'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; nivelId: string }> }) {
  const { id, nivelId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [existing] = await db
    .select({ id: fichasNiveles.id })
    .from(fichasNiveles)
    .where(and(eq(fichasNiveles.id, nivelId), eq(fichasNiveles.fichaId, id)))
    .limit(1)

  if (!existing) return NextResponse.json({ error: 'Nivel no encontrado' }, { status: 404 })

  const body = await req.json()
  const allowed: Record<string, unknown> = {}
  const fields = [
    'nivel', 'nombreContacto', 'email', 'celular',
    'tiempoRespSev1',
    'correosCopia', 'whatsapp', 'canal', 'horarioAtencion',
    'tiempoEsperadoSolucion', 'instruccion', 'activo',
  ] as const

  for (const f of fields) {
    if (f in body) allowed[f] = body[f]
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const [updated] = await db
    .update(fichasNiveles)
    .set(allowed as any)
    .where(eq(fichasNiveles.id, nivelId))
    .returning()

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; nivelId: string }> }) {
  const { id, nivelId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [existing] = await db
    .select({ id: fichasNiveles.id })
    .from(fichasNiveles)
    .where(and(eq(fichasNiveles.id, nivelId), eq(fichasNiveles.fichaId, id)))
    .limit(1)

  if (!existing) return NextResponse.json({ error: 'Nivel no encontrado' }, { status: 404 })

  await db.delete(fichasNiveles).where(eq(fichasNiveles.id, nivelId))
  return NextResponse.json({ ok: true })
}
