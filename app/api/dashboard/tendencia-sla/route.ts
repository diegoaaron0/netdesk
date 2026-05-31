import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import {
  calcSLACaso, buildDayMetrics, buildConclusiones,
  getEstadoSLA, getCausaPrincipal, type RawSLARow,
} from '@/lib/dashboard-sla-calc'
import { fetchProveedoresList } from '@/lib/dashboard-queries'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'dashboard.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desdeParam  = searchParams.get('desde')
  const hastaParam  = searchParams.get('hasta')
  const proveedorId = searchParams.get('proveedorId') || null

  const hasta = hastaParam ? new Date(hastaParam  + 'T23:59:59-05:00').toISOString() : new Date().toISOString()
  const desde = desdeParam ? new Date(desdeParam  + 'T00:00:00-05:00').toISOString() : (() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString()
  })()

  const rows = await db.execute(sql`
    SELECT
      i.id,
      i.codigo,
      i.tipo,
      i.hora_registro,
      i.hora_fin,
      i.evaluable_proveedor,
      COALESCE(p.nombre, pt.nombre) AS prov_nombre,
      t.codigo    AS tienda_codigo,
      t.nombre_cc AS tienda_nombre,
      n1.hora_correo_n1,
      resp.hora_primera_resp,
      resp.nivel_respuesta,
      resp.eta_str,
      max_n.max_nivel,
      contrato.sla_respuesta_override,
      contrato.sla_resolucion_override
    FROM incidentes i
    JOIN  tiendas    t ON i.tienda_id    = t.id
    LEFT JOIN proveedores p  ON i.proveedor_id = p.id
    LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
    LEFT JOIN LATERAL (
      SELECT MIN(hora_envio_correo) AS hora_correo_n1
      FROM   escalamientos
      WHERE  incidente_id = i.id AND hora_envio_correo IS NOT NULL
    ) n1 ON true
    LEFT JOIN LATERAL (
      SELECT hora_respuesta AS hora_primera_resp, nivel AS nivel_respuesta,
             tiempo_estimado_solucion AS eta_str
      FROM   escalamientos
      WHERE  incidente_id = i.id AND hora_respuesta IS NOT NULL AND no_hubo_respuesta IS NOT TRUE
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
      ${proveedorId ? sql`AND COALESCE(p.nombre, pt.nombre) = ${proveedorId}` : sql``}
    ORDER BY i.hora_registro
  `) as unknown as RawSLARow[]

  const casos = rows.map(calcSLACaso)
  const byDay = buildDayMetrics(casos)
  const conclusiones = buildConclusiones(casos, byDay)
  const proveedoresList = await fetchProveedoresList()

  // Resumen global
  const evaluables = casos.filter((c) => c.evaluable)
  const dentraSLATotal = evaluables.filter((c) => c.slaGeneral).length
  const fueraSLATotal  = evaluables.length - dentraSLATotal
  const slaPctTotal    = evaluables.length > 0 ? Math.round(dentraSLATotal / evaluables.length * 100) : 0

  const respTimes = evaluables.filter((c) => c.tPrimeraRespuestaMin != null).map((c) => c.tPrimeraRespuestaMin!)
  const resolTimes = evaluables.filter((c) => c.tResolucionMin != null).map((c) => c.tResolucionMin!)
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

  // Fechas críticas
  const prevSlaPct = byDay.map((d) => d.slaPct).filter((v): v is number => v != null)
  const avgSlaPct = prevSlaPct.length ? prevSlaPct.reduce((a, b) => a + b, 0) / prevSlaPct.length : 90

  const fechasCriticas = byDay
    .filter((d) => d.slaPct != null && (d.slaPct < 90 || d.fueraSLA > 0 || d.casosEscaladosN2 > 0))
    .map((d) => ({
      dia: d.dia,
      slaPct: d.slaPct!,
      estado: getEstadoSLA(d.slaPct),
      proveedorMasAfectado: d.proveedorMasAfectado ?? '—',
      causaPrincipal: d.causaPrincipal ?? '—',
      esAlertaFuerte: d.slaPct! < 70 || (d.slaPct! < avgSlaPct - 20),
    }))

  return NextResponse.json({
    byDay,
    resumen: {
      registrados: casos.length,
      evaluables: evaluables.length,
      slaPct: slaPctTotal,
      fueraSLA: fueraSLATotal,
      tPromRespuestaMin: avg(respTimes),
      tPromResolucionMin: avg(resolTimes),
    },
    fechasCriticas,
    conclusiones,
    proveedores: proveedoresList,
  })
}
