import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adjuntos } from '@/drizzle/schema'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  if (!body.url?.trim()) return NextResponse.json({ error: 'URL requerida' }, { status: 400 })

  const [foto] = await db.insert(adjuntos).values({
    url:             body.url.trim(),
    nombre:          body.nombre ?? body.descripcion ?? 'Foto equipo',
    tipo:            body.tipo ?? null,
    tamanoBytes:     body.tamanoBytes ?? null,
    routerExternoId: id,
    contexto:        body.descripcion ?? null,
  }).returning()

  return NextResponse.json(foto, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: _routerId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const fotoId = req.nextUrl.searchParams.get('fotoId')
  if (!fotoId) return NextResponse.json({ error: 'fotoId requerido' }, { status: 400 })

  await db.delete(adjuntos).where(
    and(eq(adjuntos.id, fotoId), eq(adjuntos.routerExternoId, _routerId))
  )
  return NextResponse.json({ ok: true })
}
