import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rol = (session.user as any)?.rol
  if (rol !== 'SUPERVISOR') return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde') ?? new Date(Date.now() - 7 * 86400000).toISOString()
  const hasta = searchParams.get('hasta') ?? new Date().toISOString()

  // Provider ranking with T2avg (min from registro to first email) and T3avg (N1 response time)
  const proveedoresRows = await db.execute(sql`
    SELECT
      p.nombre,
      COUNT(DISTINCT i.id)::int AS total,
      ROUND(AVG(i.mttr_minutos))::int AS mttr_avg,
      ROUND(AVG(
        CASE WHEN e.hora_envio_correo IS NOT NULL
          THEN EXTRACT(EPOCH FROM (e.hora_envio_correo - i.hora_registro)) / 60
        END
      ))::int AS t2_avg,
      ROUND(AVG(e.tiempo_respuesta_min))::int AS t3_avg
    FROM incidentes i
    LEFT JOIN tiendas t ON i.tienda_id = t.id
    LEFT JOIN proveedores p ON t.proveedor_id = p.id
    LEFT JOIN LATERAL (
      SELECT hora_envio_correo, tiempo_respuesta_min
      FROM escalamientos
      WHERE incidente_id = i.id
      ORDER BY creado_en
      LIMIT 1
    ) e ON true
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro < ${hasta}::timestamptz
    GROUP BY p.id, p.nombre
    ORDER BY COUNT(DISTINCT i.id) DESC
  `)

  // Top 10 tiendas by incident count
  const topTiendasRows = await db.execute(sql`
    SELECT
      t.codigo,
      t.nombre_cc AS nombre,
      t.distrito,
      COUNT(i.id)::int AS total,
      ROUND(AVG(i.mttr_minutos))::int AS mttr_avg
    FROM incidentes i
    LEFT JOIN tiendas t ON i.tienda_id = t.id
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro < ${hasta}::timestamptz
    GROUP BY t.id, t.codigo, t.nombre_cc, t.distrito
    ORDER BY COUNT(i.id) DESC
    LIMIT 10
  `)

  // MTTR by zona: Lima vs Provincia (using provincia field; Lima = 'Lima')
  const mttrZonaRows = await db.execute(sql`
    SELECT
      CASE WHEN LOWER(t.provincia) = 'lima' THEN 'Lima' ELSE 'Provincia' END AS zona,
      COUNT(i.id)::int AS total,
      ROUND(AVG(i.mttr_minutos))::int AS mttr_avg
    FROM incidentes i
    LEFT JOIN tiendas t ON i.tienda_id = t.id
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro < ${hasta}::timestamptz
      AND i.estado = 'RESUELTO'
      AND i.mttr_minutos IS NOT NULL
    GROUP BY zona
  `)

  // Incidents by day for line chart
  const byDayRows = await db.execute(sql`
    SELECT
      TO_CHAR(i.hora_registro AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS dia,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE i.estado = 'RESUELTO')::int AS resueltos
    FROM incidentes i
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro < ${hasta}::timestamptz
    GROUP BY dia
    ORDER BY dia
  `)

  // Distribution by tipo
  const byTipoRows = await db.execute(sql`
    SELECT
      i.tipo,
      COUNT(*)::int AS total
    FROM incidentes i
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro < ${hasta}::timestamptz
    GROUP BY i.tipo
    ORDER BY COUNT(*) DESC
  `)

  return NextResponse.json({
    proveedores: proveedoresRows,
    topTiendas: topTiendasRows,
    mttrZona: mttrZonaRows,
    byDay: byDayRows,
    byTipo: byTipoRows,
  })
}
