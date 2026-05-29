import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gruposMasivos, incidentes, tiendas, usuarios } from '@/drizzle/schema'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/auth'

async function getGrupoWithIncidentes(id: string) {
  const [grupo] = await db.select().from(gruposMasivos).where(eq(gruposMasivos.id, id))
  if (!grupo) return null

  const linked = await db.select({
    id:           incidentes.id,
    codigo:       incidentes.codigo,
    estado:       incidentes.estado,
    tipo:         incidentes.tipo,
    horaRegistro: incidentes.horaRegistro,
    tiendaCodigo: tiendas.codigo,
    tiendaNombre: tiendas.nombreCc,
    tiendaDistrito: tiendas.distrito,
    agenteName:   usuarios.nombre,
  })
    .from(incidentes)
    .leftJoin(tiendas, eq(incidentes.tiendaId, tiendas.id))
    .leftJoin(usuarios, eq(incidentes.registradoPorId, usuarios.id))
    .where(eq(incidentes.grupoMasivoId, id))

  return { ...grupo, incidentes: linked }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const data = await getGrupoWithIncidentes(id)
  if (!data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const set: any = {}
  if ('razon'  in body) set.razon  = body.razon?.trim() ?? null
  if ('motivo' in body) set.motivo = body.motivo?.trim() ?? null

  if (Object.keys(set).length === 0) return NextResponse.json({ error: 'Sin campos' }, { status: 400 })

  const [updated] = await db.update(gruposMasivos).set(set).where(eq(gruposMasivos.id, id)).returning()
  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const data = await getGrupoWithIncidentes(id)
  return NextResponse.json(data)
}
