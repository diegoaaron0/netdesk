import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { buildTendencia, type RawSLATrendRow } from '@/lib/sla-trend-calc'
import { fetchProveedoresList } from '@/lib/dashboard-queries'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'dashboard.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desdeParam  = searchParams.get('desde')
  const hastaParam  = searchParams.get('hasta')
  const proveedorId = searchParams.get('proveedorId') || null

  const hasta = hastaParam
    ? new Date(hastaParam + 'T23:59:59-05:00').toISOString()
    : new Date().toISOString()
  const desde = desdeParam
    ? new Date(desdeParam + 'T00:00:00-05:00').toISOString()
    : (() => {
        const d = new Date()
        d.setMonth(d.getMonth() - 6)
        d.setDate(1)
        d.setHours(0, 0, 0, 0)
        return d.toISOString()
      })()

  const [rows, proveedoresList] = await Promise.all([
    db.execute(sql`
      SELECT
        i.id,
        i.tipo,
        i.hora_registro,
        i.hora_fin,
        i.proveedor_id,
        COALESCE(p.nombre, pt.nombre) AS prov_nombre,
        n1.hora_correo_n1,
        resp.hora_primera_resp,
        resp.eta_str,
        max_n.max_nivel,
        contrato.sla_respuesta_override,
        contrato.sla_resolucion_override
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN proveedores p  ON i.proveedor_id = p.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      LEFT JOIN LATERAL (
        SELECT MIN(hora_envio_correo) AS hora_correo_n1
        FROM   escalamientos
        WHERE  incidente_id = i.id AND hora_envio_correo IS NOT NULL
      ) n1 ON true
      LEFT JOIN LATERAL (
        SELECT hora_respuesta AS hora_primera_resp,
               tiempo_estimado_solucion AS eta_str
        FROM   escalamientos
        WHERE  incidente_id = i.id AND hora_respuesta IS NOT NULL
        ORDER  BY hora_respuesta LIMIT 1
      ) resp ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(MAX(nivel), 0) AS max_nivel
        FROM   escalamientos
        WHERE  incidente_id = i.id
      ) max_n ON true
      LEFT JOIN LATERAL (
        SELECT tiempo_respuesta_sla  AS sla_respuesta_override,
               tiempo_resolucion_sla AS sla_resolucion_override
        FROM   contratos_proveedor
        WHERE  proveedor_id = COALESCE(i.proveedor_id, t.proveedor_id)
          AND  estado = 'VIGENTE'
          AND  (tienda_id IS NULL OR tienda_id = t.id)
        ORDER  BY (tienda_id IS NOT NULL) DESC
        LIMIT  1
      ) contrato ON true
      WHERE i.hora_registro >= ${desde}::timestamptz
        AND i.hora_registro <  ${hasta}::timestamptz
        AND i.estado = 'RESUELTO'
        AND i.hora_fin IS NOT NULL
        AND COALESCE(p.nombre, pt.nombre) IS NOT NULL
        ${proveedorId ? sql`AND COALESCE(p.nombre, pt.nombre) = ${proveedorId}` : sql``}
      ORDER BY i.hora_registro ASC
    `) as unknown as RawSLATrendRow[],
    fetchProveedoresList(),
  ])

  const { puntos, chartData, resumenProveedores, mesCriticos, resumenGlobal, conclusiones, proveedoresEnGrafico } = buildTendencia(rows)

  return NextResponse.json({ puntos, chartData, resumenProveedores, mesCriticos, resumenGlobal, conclusiones, proveedoresList, proveedoresEnGrafico })
}
