import { SLA_RESPUESTA_MIN, SLA_RESOLUCION_DEFAULT_MIN } from './sla-core'

// Fragmentos SQL canónicos para "SLA del proveedor" — % de cumplimiento de
// primera respuesta y de resolución, ficha-aware vía COALESCE(i.ficha_id,
// t.ficha_activa_id) (prioriza la ficha vigente al momento del incidente).
// Asume que el caller aliasea incidentes AS i y tiendas AS t en el FROM/JOIN.
//
// El % NO es un conteo binario de incidentes que cumplieron. Es la proporción
// entre el límite acordado y el tiempo real promedio:
//
//     SLA% = min(100, promedio(límite) / promedio(tiempo real) × 100)
//
// Espejo SQL de slaPctPromedio() en lib/sla-core.ts — cualquier cambio va en
// los dos lados. El binario anterior daba saltos absurdos con denominadores
// chicos: con un solo incidente evaluable, un proveedor solo podía sacar 0% o
// 100%, y pasarse por un minuto pesaba igual que no responder nunca.

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

// ── Tiempos reales ──────────────────────────────────────────────────────────
// Solo entran incidentes con respuesta del proveedor. Si nunca contesto, su
// tiempo esta CENSURADO: no es medible. Imputarle "lo que tardo en cerrarse"
// lo premiaria — un incidente que el agente resolvio en 33 min daria 100% de
// SLA de respuesta para un proveedor que jamas contesto.
// La consecuencia es visible: ese proveedor pierde evaluables y puede quedar
// en "—". El conteo de evaluables que ya muestra la UI es la senal.

function tRespuestaRealExpr(): string {
  return `EXTRACT(EPOCH FROM (resp.hora_primera_resp - n1h.hora_correo_n1)) / 60`
}

function tResolucionRealExpr(): string {
  return `EXTRACT(EPOCH FROM (i.hora_fin - resp.hora_primera_resp)) / 60`
}

/**
 * min(100, AVG(limite) / AVG(real) x 100); NULL si no hay nada medible.
 *
 * El CASE es obligatorio: en Postgres LEAST() IGNORA los nulos, asi que
 * LEAST(100, NULL) devuelve 100 — un proveedor sin incidentes evaluables
 * marcaria 100% de cumplimiento.
 */
/** Incidente que SI aporta al promedio: evaluable y con respuesta del proveedor. */
export function slaMedibleExpr(): string {
  return `${slaProveedorEvaluableExpr()} AND resp.hora_primera_resp IS NOT NULL`
}

/** Denominador del %: sobre cuantos incidentes se promedio. La UI lo muestra
 *  entre parentesis — "58% (2)" — porque un porcentaje sobre 2 casos no se lee
 *  igual que uno sobre 40. */
export function slaMediblesCountExpr(): string {
  return `COUNT(*) FILTER (WHERE ${slaMedibleExpr()})`
}

/** Tasa de respuesta: cuantos de los escalamientos evaluables tuvieron
 *  respuesta. Es la senal que el % por promedio no puede dar: un proveedor que
 *  nunca contesta queda en "—" (nada medible), y "0/1" es lo que delata que
 *  fallo, en vez de parecer que no hay datos. */
export function slaEscaladosCountExpr(): string {
  return `COUNT(*) FILTER (WHERE ${slaProveedorEvaluableExpr()})`
}
export function slaRespondidosCountExpr(): string {
  return `COUNT(*) FILTER (WHERE ${slaMedibleExpr()})`
}

function pctPromedioExpr(realExpr: string, limiteExpr: string): string {
  const medible = `${slaMedibleExpr()} AND (${realExpr}) IS NOT NULL`
  const real   = `AVG(GREATEST(${realExpr}, 0)) FILTER (WHERE ${medible})`
  const limite = `AVG(${limiteExpr}) FILTER (WHERE ${medible})`
  return `CASE WHEN ${real} IS NULL OR ${real} = 0 THEN NULL ELSE LEAST(100, ROUND(${limite} / ${real} * 100)) END`
}

export function slaRespuestaPctExpr(): string {
  return pctPromedioExpr(tRespuestaRealExpr(), `COALESCE(cp.tiempo_respuesta_sla, ${SLA_RESPUESTA_MIN})`)
}

export function slaResolucionPctExpr(): string {
  return pctPromedioExpr(tResolucionRealExpr(), `COALESCE(cp.tiempo_resolucion_sla, ${SLA_RESOLUCION_DEFAULT_MIN})`)
}
