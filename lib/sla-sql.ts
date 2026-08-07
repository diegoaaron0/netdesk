import { SLA_RESPUESTA_MIN, SLA_RESOLUCION_DEFAULT_MIN } from './sla-core'

// Fragmentos SQL canónicos para "SLA del proveedor" — % de cumplimiento de
// primera respuesta y de resolución, ficha-aware vía COALESCE(i.ficha_id,
// t.ficha_activa_id) (prioriza la ficha vigente al momento del incidente).
// Asume que el caller aliasea incidentes AS i y tiendas AS t en el FROM/JOIN.

export function slaProveedorJoins(): string {
  return `
    LEFT JOIN LATERAL (
      SELECT MIN(e.hora_envio_correo) AS hora_correo_n1
      FROM escalamientos e WHERE e.incidente_id = i.id AND e.hora_envio_correo IS NOT NULL
    ) n1h ON true
    LEFT JOIN LATERAL (
      SELECT e.hora_respuesta AS hora_primera_resp
      FROM escalamientos e WHERE e.incidente_id = i.id AND e.hora_respuesta IS NOT NULL AND e.no_hubo_respuesta IS NOT TRUE
      ORDER BY e.hora_respuesta LIMIT 1
    ) resp ON true
    LEFT JOIN LATERAL (
      SELECT tiempo_respuesta_sla, tiempo_resolucion_sla
      FROM fichas WHERE id = COALESCE(i.ficha_id, t.ficha_activa_id) LIMIT 1
    ) cp ON true
  `
}

export function slaProveedorEvaluableExpr(): string {
  return `i.estado = 'RESUELTO' AND i.evaluable_proveedor IS NOT FALSE AND n1h.hora_correo_n1 IS NOT NULL`
}

export function slaRespuestaCumpleExpr(): string {
  return `(resp.hora_primera_resp IS NOT NULL AND EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1h.hora_correo_n1)) / 60 <= COALESCE(cp.tiempo_respuesta_sla, ${SLA_RESPUESTA_MIN}))`
}

export function slaResolucionCumpleExpr(): string {
  return `(resp.hora_primera_resp IS NOT NULL AND i.hora_fin IS NOT NULL AND EXTRACT(EPOCH FROM (i.hora_fin - resp.hora_primera_resp)) / 60 <= COALESCE(cp.tiempo_resolucion_sla, ${SLA_RESOLUCION_DEFAULT_MIN}))`
}

export function slaRespuestaPctExpr(): string {
  return `ROUND(COUNT(*) FILTER (WHERE ${slaProveedorEvaluableExpr()} AND ${slaRespuestaCumpleExpr()}) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE ${slaProveedorEvaluableExpr()}), 0))`
}

export function slaResolucionPctExpr(): string {
  return `ROUND(COUNT(*) FILTER (WHERE ${slaProveedorEvaluableExpr()} AND ${slaResolucionCumpleExpr()}) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE ${slaProveedorEvaluableExpr()}), 0))`
}
