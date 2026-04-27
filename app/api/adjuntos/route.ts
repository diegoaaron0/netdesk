import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adjuntos } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const incidenteId = req.nextUrl.searchParams.get('incidenteId')
  if (!incidenteId) return NextResponse.json([])

  const data = await db.select({
    id: adjuntos.id,
    url: adjuntos.url,
    nombre: adjuntos.nombre,
    tipo: adjuntos.tipo,
    tamanoBytes: adjuntos.tamanoBytes,
    creadoEn: adjuntos.creadoEn,
  }).from(adjuntos).where(eq(adjuntos.incidenteId, incidenteId))

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const [adj] = await db.insert(adjuntos).values({
    url: body.url,
    nombre: body.nombre,
    tipo: body.tipo ?? null,
    tamanoBytes: body.tamanoBytes ?? null,
    incidenteId: body.incidenteId ?? null,
    escalamientoId: body.escalamientoId ?? null,
  }).returning()

  return NextResponse.json(adj, { status: 201 })
}
