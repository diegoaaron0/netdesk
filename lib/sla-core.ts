/**
 * sla-core.ts — única fuente de verdad para cálculo SLA.
 * Todos los módulos analíticos (KPI A, E, F, G, H) deben importar desde aquí.
 *
 * SLA del proveedor = ¿resolvieron el incidente dentro del tiempo pactado en contrato?
 * Medido desde hora_correo_n1 hasta hora_fin.
 * Tiempo límite: contrato vigente (slaResolucionOverride) o SLA_RESOLUCION_DEFAULT_MIN.
 */

// ─── Constantes SLA ────────────────────────────────────────────────────────────

/** Tiempo máximo (min) para primera respuesta de N1 — métrica informativa */
export const SLA_RESPUESTA_MIN = 60

/** Tiempo máximo (min) para resolución cuando no hay contrato vigente */
export const SLA_RESOLUCION_DEFAULT_MIN = 60

/** @deprecated Usar SLA_RESOLUCION_DEFAULT_MIN. El tiempo lo define el contrato, no el tipo. */
export const SLA_RESOLUCION_POR_TIPO: Record<string, number> = {
  CAIDA_TOTAL:   SLA_RESOLUCION_DEFAULT_MIN,
  INTERMITENCIA: SLA_RESOLUCION_DEFAULT_MIN,
  LENTITUD:      SLA_RESOLUCION_DEFAULT_MIN,
  POS:           SLA_RESOLUCION_DEFAULT_MIN,
  OTROS:         SLA_RESOLUCION_DEFAULT_MIN,
}

/** @deprecated Usar SLA_RESOLUCION_DEFAULT_MIN directamente. */
export function getSlaResolucionMin(_tipo: string): number {
  return SLA_RESOLUCION_DEFAULT_MIN
}

// ─── Helpers de tiempo ────────────────────────────────────────────────────────

export function diffMin(a: Date | string | null, b: Date | string | null): number | null {
  if (!a || !b) return null
  const diff = new Date(a).getTime() - new Date(b).getTime()
  return diff / 60000
}

/** MTTR = hora_fin − hora_registro (duración total del incidente, no el reloj SLA) */
export function calcMTTRMin(
  horaRegistro: Date | string,
  horaFin: Date | string | null,
): number | null {
  if (!horaFin) return null
  const diff = new Date(horaFin).getTime() - new Date(horaRegistro).getTime()
  return diff > 0 ? diff / 60000 : null
}

// ─── Interfaz de entrada mínima ───────────────────────────────────────────────

/** Campos mínimos requeridos para calcular SLA. */
export interface SLAInputRow {
  tipo: string
  hora_correo_n1: Date | string | null
  hora_primera_resp: Date | string | null
  hora_fin: Date | string | null
  hora_registro?: Date | string | null
  max_nivel: number | null
  slaRespuestaOverride?: number
  slaResolucionOverride?: number  // tiempo del contrato vigente; si nulo usa SLA_RESOLUCION_DEFAULT_MIN
}

// ─── Resultado SLA ────────────────────────────────────────────────────────────

export interface SLAResult {
  evaluable: boolean
  escaladoN2: boolean
  tPrimeraRespuestaMin: number | null
  tResolucionMin: number | null
  slaResolucionObj: number
  slaRespuesta: boolean   // informativo: ¿respondió N1 en tiempo?
  slaResolucion: boolean  // = slaGeneral: ¿resolvió dentro del tiempo del contrato?
  slaGeneral: boolean
  motivoIncumplimiento: string | null
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Evalúa el cumplimiento SLA de un incidente.
 *
 * Evaluabilidad: hora_correo_n1 != null AND max_nivel >= 1
 * SLA General: incidente resuelto dentro de slaResolucionOverride (contrato) o 60 min por defecto,
 *              medido desde hora_correo_n1.
 * SLA Respuesta: solo informativo — si N1 respondió en ≤60 min sin escalar a N2.
 */
export function calcSLARow(row: SLAInputRow): SLAResult {
  const slaResolucionObj = row.slaResolucionOverride ?? SLA_RESOLUCION_DEFAULT_MIN

  // ── Evaluable solo si el proveedor recibió correo N1 y hay escalamiento ───────
  if (row.hora_correo_n1 && row.max_nivel != null && row.max_nivel >= 1) {
    const escaladoN2 = row.max_nivel >= 2
    const tPrimeraRespuestaMin = diffMin(row.hora_primera_resp, row.hora_correo_n1)
    const tResolucionMin       = diffMin(row.hora_fin, row.hora_correo_n1)

    // Informativo: ¿respondió N1 en tiempo?
    const slaRespuesta =
      !escaladoN2 &&
      tPrimeraRespuestaMin != null &&
      tPrimeraRespuestaMin <= (row.slaRespuestaOverride ?? SLA_RESPUESTA_MIN)

    // SLA principal: ¿resolvieron dentro del tiempo del contrato?
    const slaResolucion = tResolucionMin != null && tResolucionMin <= slaResolucionObj
    const slaGeneral    = slaResolucion

    const motivoIncumplimiento = slaGeneral ? null : 'Resolución fuera de tiempo'

    return {
      evaluable: true, escaladoN2,
      tPrimeraRespuestaMin: tPrimeraRespuestaMin != null ? Math.round(tPrimeraRespuestaMin) : null,
      tResolucionMin:       tResolucionMin != null       ? Math.round(tResolucionMin)       : null,
      slaResolucionObj, slaRespuesta, slaResolucion, slaGeneral, motivoIncumplimiento,
    }
  }

  // ── Sin N1: incidente resuelto por agente interno — no evaluable para SLA ─────
  return {
    evaluable: false, escaladoN2: false,
    tPrimeraRespuestaMin: null, tResolucionMin: null,
    slaResolucionObj, slaRespuesta: false, slaResolucion: false,
    slaGeneral: false, motivoIncumplimiento: null,
  }
}

// ─── Eficiencia SLA ───────────────────────────────────────────────────────────

export function calcEficienciaSLA(params: {
  tRespuestaMin: number | null
  tResolucionMin: number | null
  slaRespuestaMin: number
  slaResolucionMin: number
}): {
  eficienciaRespuesta: number | null
  eficienciaResolucion: number | null
  scoreRespuesta: number | null
  scoreResolucion: number | null
  scoreSLA: number | null
} {
  const calcScore = (real: number | null, limite: number): number | null => {
    if (real == null) return null
    if (real <= 0) return 100
    return Math.max(0, Math.round(100 * (1 - real / (limite * 2))))
  }

  const scoreResp  = calcScore(params.tRespuestaMin,  params.slaRespuestaMin)
  const scoreResol = calcScore(params.tResolucionMin, params.slaResolucionMin)

  const scoreSLA = scoreResp != null && scoreResol != null
    ? Math.round((scoreResp * 0.4) + (scoreResol * 0.6))
    : scoreResp ?? scoreResol ?? null

  return {
    eficienciaRespuesta:  params.tRespuestaMin  != null ? Math.round((params.tRespuestaMin  / params.slaRespuestaMin)  * 100) : null,
    eficienciaResolucion: params.tResolucionMin != null ? Math.round((params.tResolucionMin / params.slaResolucionMin) * 100) : null,
    scoreRespuesta:  scoreResp,
    scoreResolucion: scoreResol,
    scoreSLA,
  }
}
