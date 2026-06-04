import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routersExternos, routerFotos } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [router] = await db.select().from(routersExternos).where(eq(routersExternos.id, id))
  if (!router) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const fotos = await db.select().from(routerFotos).where(eq(routerFotos.routerId, id))

  const historial = await db.execute(sql`
    SELECT
      h.id, h.accion, h.fecha_ingreso, h.fecha_retorno, h.tiempo_uso_min, h.nota,
      t.codigo AS tienda_codigo, t.nombre_cc AS tienda_nombre,
      u.nombre AS registrado_por,
      i.codigo AS incidente_codigo
    FROM router_historial h
    JOIN tiendas t ON h.tienda_id = t.id
    LEFT JOIN usuarios u ON h.registrado_por_id = u.id
    LEFT JOIN incidentes i ON h.incidente_id = i.id
    WHERE h.router_id = ${id}
    ORDER BY h.fecha_ingreso DESC
  `)

  return NextResponse.json({ ...router, fotos, historial })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, any> = {}
  const allowed = ['ip', 'password', 'chip', 'plan', 'tipoConexion', 'codigo']
  for (const k of allowed) {
    if (k in body) patch[k] = body[k] ?? null
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })

  const [updated] = await db.update(routersExternos).set(patch).where(eq(routersExternos.id, id)).returning()
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [router] = await db.select({ estado: routersExternos.estado }).from(routersExternos).where(eq(routersExternos.id, id))
  if (!router) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (router.estado !== 'DISPONIBLE') {
    return NextResponse.json({ error: 'Solo se puede eliminar un router DISPONIBLE' }, { status: 409 })
  }

  await db.update(routersExternos).set({ activo: false }).where(eq(routersExternos.id, id))
  return NextResponse.json({ ok: true })
}
