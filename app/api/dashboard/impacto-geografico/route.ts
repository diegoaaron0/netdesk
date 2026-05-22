import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import {
  buildZonas, buildDistritos, buildPatrones,
  buildResumenGlobal, buildConclusiones, buildTiendasGeo, type RawGeoRow,
} from '@/lib/geographic-impact-calc'
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
    : (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString() })()

  const [rows, proveedoresList] = await Promise.all([
    db.execute(sql`
      SELECT
        i.id,
        i.codigo,
        i.tipo,
        i.hora_registro,
        i.hora_fin,
        i.estado,
        i.proveedor_id,
        COALESCE(p.nombre, pt.nombre) AS prov_nombre,
        t.id          AS tienda_id,
        t.codigo      AS tienda_codigo,
        t.nombre_cc   AS tienda_nombre,
        t.distrito    AS tienda_distrito,
        t.coordenadas AS tienda_coordenadas,
        t.cluster,
        t.venta_hora_soles::float  AS venta_hora_soles,
        t.tiene_contingencia,
        COALESCE(t.contingencia_activa, false) AS contingencia_activa,
        n1.hora_correo_n1,
        resp.hora_primera_resp,
        max_n.max_nivel
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN proveedores p  ON i.proveedor_id = p.id
      LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
      LEFT JOIN LATERAL (
        SELECT hora_envio_correo AS hora_correo_n1
        FROM   escalamientos
        WHERE  incidente_id = i.id AND nivel = 1 AND hora_envio_correo IS NOT NULL
        ORDER  BY creado_en LIMIT 1
      ) n1 ON true
      LEFT JOIN LATERAL (
        SELECT hora_respuesta AS hora_primera_resp
        FROM   escalamientos
        WHERE  incidente_id = i.id AND hora_respuesta IS NOT NULL
        ORDER  BY hora_respuesta LIMIT 1
      ) resp ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(MAX(nivel), 0) AS max_nivel
        FROM   escalamientos
        WHERE  incidente_id = i.id
      ) max_n ON true
      WHERE i.hora_registro >= ${desde}::timestamptz
        AND i.hora_registro <  ${hasta}::timestamptz
        AND i.estado != 'CANCELADO'
        ${proveedorId ? sql`AND COALESCE(p.nombre, pt.nombre) = ${proveedorId}` : sql``}
      ORDER BY i.hora_registro DESC
    `) as unknown as RawGeoRow[],
    fetchProveedoresList(),
  ])

  const zonas     = buildZonas(rows)
  const distritos = buildDistritos(rows)
  const patrones  = buildPatrones(rows)
  const resumenGlobal = buildResumenGlobal(zonas)
  const conclusiones  = buildConclusiones(zonas, patrones)
  const tiendas       = buildTiendasGeo(rows)

  return NextResponse.json({ zonas, distritos, patrones, resumenGlobal, conclusiones, proveedoresList, tiendas })
}
