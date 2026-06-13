import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adjuntos } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const incidenteId    = req.nextUrl.searchParams.get('incidenteId')
  const escalamientoId = req.nextUrl.searchParams.get('escalamientoId')
  const contexto       = req.nextUrl.searchParams.get('contexto')
  if (!incidenteId && !escalamientoId) return NextResponse.json([])

  const { and, isNull } = await import('drizzle-orm')

  const baseFilter = incidenteId
    ? eq(adjuntos.incidenteId, incidenteId)
    : eq(adjuntos.escalamientoId, escalamientoId!)

  const contextoFilter = contexto
    ? eq(adjuntos.contexto, contexto)
    : isNull(adjuntos.contexto)

  const data = await db.select({
    id: adjuntos.id,
    url: adjuntos.url,
    nombre: adjuntos.nombre,
    tipo: adjuntos.tipo,
    tamanoBytes: adjuntos.tamanoBytes,
    creadoEn: adjuntos.creadoEn,
  }).from(adjuntos).where(
    incidenteId ? baseFilter : and(baseFilter, contextoFilter)
  )

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const [adj] = await db.insert(adjuntos).values({
    url: body.url,
    nombre: body.nombre,
    tipo: body.tipo ?? null,
    tamanoBytes: body.tamanoBytes ?? null,
    incidenteId: body.incidenteId ?? null,
    escalamientoId: body.escalamientoId ?? null,
    contexto: body.contexto ?? null,
  }).returning()

  return NextResponse.json(adj, { status: 201 })
}
