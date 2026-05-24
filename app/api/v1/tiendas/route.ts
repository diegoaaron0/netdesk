import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { apiKeyAuth } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const authErr = apiKeyAuth(req)
  if (authErr) return authErr

  const rows = await db.execute(sql`
    SELECT
      t.codigo,
      t.nombre_cc                                                        AS nombre,
      t.formato,
      t.distrito,
      t.provincia,
      t.cluster,
      t.tipo_conexion,
      t.tipo_servicio,
      t.cid_servicio,
      COALESCE(p.nombre, '')                                             AS proveedor,
      CASE WHEN t.tiene_contingencia    THEN 'Sí' ELSE 'No' END        AS tiene_contingencia,
      CASE WHEN t.contingencia_activa   THEN 'Sí' ELSE 'No' END        AS contingencia_activa,
      t.venta_hora_soles,
      COUNT(i.id) FILTER (WHERE i.estado != 'CANCELADO')::int          AS total_incidentes,
      COUNT(i.id) FILTER (
        WHERE i.estado != 'CANCELADO'
          AND i.hora_registro >= NOW() - INTERVAL '30 days'
      )::int                                                             AS incidentes_30d
    FROM tiendas t
    LEFT JOIN proveedores p ON t.proveedor_id = p.id
    LEFT JOIN incidentes  i ON i.tienda_id    = t.id
    GROUP BY t.id, t.codigo, t.nombre_cc, t.formato, t.distrito, t.provincia,
             t.cluster, t.tipo_conexion, t.tipo_servicio, t.cid_servicio,
             t.tiene_contingencia, t.contingencia_activa, t.venta_hora_soles, p.nombre
    ORDER BY t.codigo
  `) as unknown as any[]

  const data = (rows as any[]).map((r) => ({
    codigo:               r.codigo,
    nombre:               r.nombre,
    formato:              r.formato,
    distrito:             r.distrito,
    provincia:            r.provincia,
    cluster:              r.cluster,
    tipo_conexion:        r.tipo_conexion,
    tipo_servicio:        r.tipo_servicio,
    cid_servicio:         r.cid_servicio,
    proveedor:            r.proveedor,
    tiene_contingencia:   r.tiene_contingencia,
    contingencia_activa:  r.contingencia_activa,
    venta_hora_soles:     r.venta_hora_soles != null ? Number(r.venta_hora_soles) : null,
    total_incidentes:     r.total_incidentes,
    incidentes_30d:       r.incidentes_30d,
  }))

  return NextResponse.json({
    data,
    meta: {
      total:       data.length,
      generado_en: new Date().toISOString(),
    },
  })
}
