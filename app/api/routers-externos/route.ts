import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routersExternos, routerHistorial, tiendas } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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
      t.codigo  AS tienda_codigo,
      t.nombre_cc AS tienda_nombre,
      t.distrito  AS tienda_distrito,
      -- Tiempo activo acumulado (minutos) desde todos los despliegues
      COALESCE((
        SELECT SUM(
          CASE
            WHEN h.fecha_retorno IS NOT NULL THEN h.tiempo_uso_min
            ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - h.fecha_ingreso)) / 60)::int
          END
        )
        FROM router_historial h
        WHERE h.router_id = r.id AND h.accion = 'DESPLIEGUE'
      ), 0)::int AS tiempo_total_min,
      -- Entrada actual a tienda (si aplica)
      (
        SELECT h2.fecha_ingreso
        FROM router_historial h2
        WHERE h2.router_id = r.id AND h2.fecha_retorno IS NULL
          AND h2.accion IN ('DESPLIEGUE','TRASLADO')
        ORDER BY h2.fecha_ingreso DESC
        LIMIT 1
      ) AS fecha_ingreso_actual
    FROM routers_externos r
    LEFT JOIN tiendas t ON r.tienda_actual_id = t.id
    WHERE r.activo = true
    ORDER BY r.codigo
  `)

  return NextResponse.json(rows)
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
