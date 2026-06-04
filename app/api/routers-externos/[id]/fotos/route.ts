import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routerFotos } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  if (!body.url?.trim()) return NextResponse.json({ error: 'URL requerida' }, { status: 400 })

  const [foto] = await db.insert(routerFotos).values({
    routerId:    id,
    url:         body.url.trim(),
    descripcion: body.descripcion ?? null,
    tamanoBytes: body.tamanoBytes ?? null,
  }).returning()

  return NextResponse.json(foto, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: _routerId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const fotoId = req.nextUrl.searchParams.get('fotoId')
  if (!fotoId) return NextResponse.json({ error: 'fotoId requerido' }, { status: 400 })

  await db.delete(routerFotos).where(eq(routerFotos.id, fotoId))
  return NextResponse.json({ ok: true })
}
