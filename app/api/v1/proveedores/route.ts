import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { apiKeyAuth, parseDateRange } from '@/lib/api-auth'
import { getTramosPorIncidentes, calcIeiIncidente, type IncidenteMitigacionInput } from '@/lib/mitigacion-tramos'

export async function GET(req: NextRequest) {
  const authErr = apiKeyAuth(req)
  if (authErr) return authErr

  const { desde, hasta } = parseDateRange(req.nextUrl.searchParams)

  const rows = await db.execute(sql`
    SELECT
      COALESCE(pi.nombre, pt.nombre)                                                AS proveedor,
      COUNT(i.id)::int                                                               AS total_incidentes,
      COUNT(i.id) FILTER (WHERE i.estado = 'RESUELTO')::int                         AS resueltos,
      COUNT(i.id) FILTER (WHERE i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO'))::int AS activos,
      ROUND(AVG(i.mttr_minutos) FILTER (WHERE i.estado = 'RESUELTO'))::int          AS mttr_promedio_min,
      -- SLA resolución: hora_fin − hora_primera_resp (tiempo del proveedor,
      -- NO el MTTR total) vs. límite del contrato. Mismo patrón que
      -- reportes/export/proveedores.ts (evaluables_sla / sla_pct).
      ROUND(
        COUNT(*) FILTER (
          WHERE i.estado = 'RESUELTO' AND n1.hora_envio IS NOT NULL AND n1.hora_resp IS NOT NULL AND i.hora_fin IS NOT NULL
            AND i.evaluable_proveedor IS NOT FALSE
            AND EXTRACT(EPOCH FROM (i.hora_fin - n1.hora_resp)) / 60 <= COALESCE(f.tiempo_resolucion_sla, 90)
        ) * 100.0 /
        NULLIF(COUNT(*) FILTER (
          WHERE i.estado = 'RESUELTO' AND n1.hora_envio IS NOT NULL AND i.evaluable_proveedor IS NOT FALSE
        ), 0)
      )::int                                                                         AS sla_resolucion_pct,
      -- SLA respuesta N1
      ROUND(
        COUNT(*) FILTER (
          WHERE n1.hora_resp IS NOT NULL AND n1.hora_envio IS NOT NULL
            AND EXTRACT(EPOCH FROM (n1.hora_resp - n1.hora_envio)) / 60 <= COALESCE(f.tiempo_respuesta_sla, 60)
        ) * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE n1.hora_envio IS NOT NULL), 0)
      )::int                                                                         AS sla_respuesta_pct,
      ROUND(AVG(
        EXTRACT(EPOCH FROM (n1.hora_resp - n1.hora_envio)) / 60
      ) FILTER (WHERE n1.hora_resp IS NOT NULL))::int                                AS t_respuesta_prom_min,
      -- Escalamientos
      COUNT(DISTINCT i.id) FILTER (WHERE esc_max.nivel_max >= 2)::int               AS incidentes_escalados_n2,
      COUNT(DISTINCT i.id) FILTER (WHERE esc_max.nivel_max >= 3)::int               AS incidentes_escalados_n3,
      -- Tiendas
      COUNT(DISTINCT i.tienda_id)::int                                               AS tiendas_afectadas
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    LEFT JOIN fichas f ON f.id = COALESCE(i.ficha_id, t.ficha_activa_id)
    LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
    LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
    LEFT JOIN LATERAL (
      SELECT MIN(hora_envio_correo) AS hora_envio, MIN(hora_respuesta) AS hora_resp
      FROM escalamientos WHERE incidente_id = i.id
    ) n1 ON true
    LEFT JOIN LATERAL (
      SELECT MAX(nivel)::int AS nivel_max FROM escalamientos WHERE incidente_id = i.id
    ) esc_max ON true
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
      AND i.estado != 'CANCELADO'
    GROUP BY COALESCE(pi.nombre, pt.nombre)
  `) as unknown as any[]

  // IEI agregado por proveedor — Fase 5, Paso 3: se calcula en JS con
  // calcIeiIncidente (tramos + fallback legacy), ya no con ieiSum de
  // report-sql.ts. ieiSum aplicaba UN SOLO factor a todo el mttr_minutos sin
  // mirar cuánto tiempo la mitigación estuvo realmente activa — subestimaba
  // el IEI en cualquier incidente con cobertura parcial (bug real, corregido).
  const incsParaIei = await db.execute(sql`
    SELECT
      i.id,
      COALESCE(pi.nombre, pt.nombre)     AS proveedor,
      i.tipo, i.estado,
      i.hora_registro                    AS hora_registro_raw,
      i.hora_fin                         AS hora_fin_raw,
      i.iei_acumulado                    AS iei_acumulado_raw,
      i.cont_activado_por, i.cont_hora_activacion, i.cont_hora_desactivacion, i.cont_rendimiento, i.cont_es_externo,
      i.mov_activado_por, i.mov_hora_activacion, i.mov_hora_desactivacion, i.mov_rendimiento,
      i.boleta_manual, i.boleta_rendimiento, i.boleta_hora_activacion,
      i.mitigaciones_previas             AS mitigaciones_previas_raw,
      t.venta_hora_soles, t.venta_hora_fds_soles
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
    LEFT JOIN proveedores pt ON t.proveedor_id  = pt.id
    WHERE i.hora_registro >= ${desde}::timestamptz
      AND i.hora_registro <  ${hasta}::timestamptz
      AND i.estado != 'CANCELADO'
  `) as unknown as any[]

  const tramosPorIncidente = await getTramosPorIncidentes(incsParaIei.map((r: any) => r.id))
  const ieiPorProveedor = new Map<string, number>()
  for (const r of incsParaIei) {
    const incidenteMitigacion: IncidenteMitigacionInput = {
      tipo: r.tipo, estado: r.estado,
      horaRegistro: r.hora_registro_raw, horaFin: r.hora_fin_raw, ieiAcumulado: r.iei_acumulado_raw,
      contActivadoPor: r.cont_activado_por, contHoraActivacion: r.cont_hora_activacion,
      contHoraDesactivacion: r.cont_hora_desactivacion, contRendimiento: r.cont_rendimiento, contEsExterno: r.cont_es_externo,
      movActivadoPor: r.mov_activado_por, movHoraActivacion: r.mov_hora_activacion,
      movHoraDesactivacion: r.mov_hora_desactivacion, movRendimiento: r.mov_rendimiento,
      boletaManual: r.boleta_manual, boletaRendimiento: r.boleta_rendimiento, boletaHoraActivacion: r.boleta_hora_activacion,
      mitigacionesPrevias: r.mitigaciones_previas_raw,
    }
    const { iei } = calcIeiIncidente(incidenteMitigacion, tramosPorIncidente.get(r.id) ?? [], {
      ventaHoraSoles: r.venta_hora_soles, ventaHoraFdsSoles: r.venta_hora_fds_soles,
    })
    ieiPorProveedor.set(r.proveedor, (ieiPorProveedor.get(r.proveedor) ?? 0) + iei)
  }

  const data = (rows as any[]).map((r) => ({
    proveedor:              r.proveedor,
    total_incidentes:       r.total_incidentes,
    resueltos:              r.resueltos,
    activos:                r.activos,
    mttr_promedio_min:      r.mttr_promedio_min,
    sla_resolucion_pct:     r.sla_resolucion_pct,
    sla_respuesta_pct:      r.sla_respuesta_pct,
    t_respuesta_prom_min:   r.t_respuesta_prom_min,
    incidentes_escalados_n2: r.incidentes_escalados_n2,
    incidentes_escalados_n3: r.incidentes_escalados_n3,
    tiendas_afectadas:      r.tiendas_afectadas,
    iei_total_soles:        Math.round(ieiPorProveedor.get(r.proveedor) ?? 0),
  })).sort((a, b) => b.iei_total_soles - a.iei_total_soles)

  return NextResponse.json({
    data,
    meta: {
      total:       data.length,
      desde:       desde.slice(0, 10),
      hasta:       hasta.slice(0, 10),
      generado_en: new Date().toISOString(),
    },
  })
}
