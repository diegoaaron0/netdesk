import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routersExternos } from '@/drizzle/schema'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const rows = await db.execute(sql`
      SELECT
        r.id,
        r.codigo,
        r.ip,
        r.password,
        r.chip,
        r.plan,
        r.tipo_conexion,
        r.estado,
        r.activo,
        r.creado_en,
        r.tienda_actual_id,
        r.fotos,
        r.almacen_actual,
        t.codigo    AS tienda_codigo,
        t.nombre_cc AS tienda_nombre,
        t.distrito  AS tienda_distrito,
        COALESCE((
          SELECT ROUND(EXTRACT(EPOCH FROM SUM(
            COALESCE(i2.cont_hora_desactivacion, NOW()) - i2.cont_hora_activacion
          )) / 60)::int
          FROM incidentes i2
          WHERE i2.router_externo_id = r.id
            AND i2.cont_hora_activacion IS NOT NULL
        ), 0) AS tiempo_total_min,
        (
          SELECT i3.cont_hora_activacion
          FROM incidentes i3
          WHERE i3.router_externo_id = r.id
            AND i3.cont_hora_activacion IS NOT NULL
            AND i3.cont_hora_desactivacion IS NULL
            AND i3.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
          ORDER BY i3.cont_hora_activacion DESC
          LIMIT 1
        ) AS fecha_ingreso_actual,
        (
          SELECT i4.cont_observacion
          FROM incidentes i4
          WHERE i4.router_externo_id = r.id
            AND i4.cont_hora_activacion IS NOT NULL
            AND i4.cont_hora_desactivacion IS NULL
            AND i4.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
          ORDER BY i4.cont_hora_activacion DESC
          LIMIT 1
        ) AS cont_observacion_actual
      FROM routers_externos r
      LEFT JOIN tiendas t ON r.tienda_actual_id = t.id
      WHERE r.activo = true
      ORDER BY r.codigo
    `)
    return NextResponse.json(Array.from(rows as any[]))
  } catch (err: unknown) {
    const msg = (err as any)?.cause?.message ?? (err as any)?.message ?? String(err)
    console.error('[routers-externos GET]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  if (!body.codigo?.trim()) return NextResponse.json({ error: 'Código requerido' }, { status: 400 })

  const [created] = await db.insert(routersExternos).values({
    codigo:       body.codigo.trim().toUpperCase(),
    ip:           body.ip           ?? null,
    password:     body.password     ?? null,
    chip:         body.chip         ?? null,
    plan:         body.plan         ?? null,
    tipoConexion: body.tipoConexion ?? null,
    estado:       'DISPONIBLE',
  }).returning()

  return NextResponse.json(created, { status: 201 })
}
