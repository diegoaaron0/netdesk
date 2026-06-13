import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routersExternos } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [router] = await db.select().from(routersExternos).where(eq(routersExternos.id, id))
  if (!router) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Historial combinado: activaciones desde incidentes + movimientos físicos desde router_historial
  const historial = await db.execute(sql`
    SELECT
      'ACTIVACIÓN'               AS accion,
      t.codigo                   AS tienda_codigo,
      t.nombre_cc                AS tienda_nombre,
      i.cont_hora_activacion     AS fecha_ingreso,
      i.cont_hora_desactivacion  AS fecha_retorno,
      CASE
        WHEN i.cont_hora_desactivacion IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (i.cont_hora_desactivacion - i.cont_hora_activacion)) / 60)::int
        ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - i.cont_hora_activacion)) / 60)::int
      END                        AS tiempo_uso_min,
      i.cont_rendimiento         AS nota,
      i.codigo                   AS incidente_codigo,
      NULL                       AS almacen_origen,
      NULL                       AS almacen_destino
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    WHERE i.router_externo_id = ${id}
      AND i.cont_hora_activacion IS NOT NULL

    UNION ALL

    SELECT
      h.accion,
      t.codigo                   AS tienda_codigo,
      t.nombre_cc                AS tienda_nombre,
      h.fecha_ingreso,
      h.fecha_retorno,
      h.tiempo_uso_min,
      h.nota,
      NULL                       AS incidente_codigo,
      h.almacen_origen,
      h.almacen_destino
    FROM router_historial h
    LEFT JOIN tiendas t ON h.tienda_id = t.id
    WHERE h.router_id = ${id}

    ORDER BY fecha_ingreso DESC NULLS LAST
  `)

  return NextResponse.json({ ...router, historial: Array.from(historial as any[]) })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'mantenimiento.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const patch: Record<string, any> = {}
  const allowed = ['ip', 'password', 'chip', 'plan', 'tipoConexion', 'codigo', 'fotos']
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
  if (!can(session, 'mantenimiento.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [router] = await db.select({ estado: routersExternos.estado }).from(routersExternos).where(eq(routersExternos.id, id))
  if (!router) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (router.estado !== 'DISPONIBLE') {
    return NextResponse.json({ error: 'Solo se puede eliminar un router DISPONIBLE' }, { status: 409 })
  }

  await db.update(routersExternos).set({ activo: false }).where(eq(routersExternos.id, id))
  return NextResponse.json({ ok: true })
}
