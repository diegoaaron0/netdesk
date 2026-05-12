import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import {
  buildTiendasCriticas, buildPatrones, buildConclusiones, type RawTiendaRow,
} from '@/lib/critical-stores-calc'
import { fetchVentasDiarias, fetchProveedoresList } from '@/lib/dashboard-queries'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'dashboard.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desdeParam  = searchParams.get('desde')
  const hastaParam  = searchParams.get('hasta')
  const proveedorId = searchParams.get('proveedorId') || null

  const hasta = hastaParam
    ? new Date(hastaParam + 'T23:59:59').toISOString()
    : new Date().toISOString()
  const desde = desdeParam
    ? new Date(desdeParam + 'T00:00:00').toISOString()
    : (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString() })()

  const [rows, ventasDiarias, proveedoresList] = await Promise.all([
    db.execute(sql`
      SELECT
        i.id,
        i.codigo,
        i.tipo,
        i.estado,
        i.hora_registro,
        i.hora_fin,
        i.mttr_minutos,
        i.proveedor_id,
        p.nombre    AS prov_nombre,
        t.id        AS tienda_id,
        t.codigo    AS tienda_codigo,
        t.nombre_cc AS tienda_nombre,
        t.distrito  AS tienda_distrito,
        t.cluster,
        t.venta_hora_soles::float                  AS venta_hora_soles,
        COALESCE(t.tiene_contingencia, false)       AS tiene_contingencia,
        COALESCE(t.contingencia_activa, false)      AS contingencia_activa,
        EXTRACT(DOW FROM i.hora_registro AT TIME ZONE 'America/Lima')::int AS dia_semana,
        n1.hora_correo_n1,
        resp.hora_primera_resp,
        resp.nivel_respuesta,
        max_n.max_nivel
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN proveedores p ON i.proveedor_id = p.id
      LEFT JOIN LATERAL (
        SELECT hora_envio_correo AS hora_correo_n1
        FROM   escalamientos
        WHERE  incidente_id = i.id AND nivel = 1 AND hora_envio_correo IS NOT NULL
        ORDER  BY creado_en LIMIT 1
      ) n1 ON true
      LEFT JOIN LATERAL (
        SELECT hora_respuesta AS hora_primera_resp, nivel AS nivel_respuesta
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
        ${proveedorId ? sql`AND p.nombre = ${proveedorId}` : sql``}
      ORDER BY i.hora_registro
    `) as unknown as RawTiendaRow[],
    fetchVentasDiarias(),
    fetchProveedoresList(),
  ])

  const tiendas  = buildTiendasCriticas(rows, ventasDiarias)
  const patrones = buildPatrones(rows)
  const conclusiones = buildConclusiones(tiendas, patrones)

  const criticas = tiendas.filter((t) => t.estado === 'critica')
  const mttrCriticoVals = criticas.filter((t) => t.mttrPromedioMin != null).map((t) => t.mttrPromedioMin!)
  const mttrPromedioCriticoMin = mttrCriticoVals.length > 0
    ? Math.round(mttrCriticoVals.reduce((a, b) => a + b, 0) / mttrCriticoVals.length)
    : null

  const provCount: Record<string, number> = {}
  for (const r of rows) { if (r.prov_nombre) provCount[r.prov_nombre] = (provCount[r.prov_nombre] ?? 0) + 1 }
  const provMasAsociado = Object.keys(provCount).length > 0
    ? Object.entries(provCount).sort((a, b) => b[1] - a[1])[0][0]
    : null

  return NextResponse.json({
    tiendas,
    resumen: {
      totalCriticas:           criticas.length,
      costoAcumulado:          Math.round(tiendas.reduce((s, t) => s + t.costoEstimado, 0)),
      mttrPromedioCriticoMin,
      reincidenciasDetectadas: tiendas.reduce((s, t) => s + t.reincidencias, 0),
      sinContingencia:         tiendas.filter((t) => !t.tieneContingencia && t.incidentes >= 2).length,
      proveedorMasAsociado:    provMasAsociado,
    },
    patrones,
    conclusiones,
    proveedoresList,
  })
}
