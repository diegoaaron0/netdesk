/**
 * sla-core.ts — única fuente de verdad para cálculo SLA.
 * Todos los módulos analíticos (KPI A, E, F, G, H) deben importar desde aquí.
 * No duplicar SLA_RESPUESTA_MIN ni SLA_RESOLUCION_POR_TIPO en otros archivos.
 */

// ─── Constantes SLA ────────────────────────────────────────────────────────────

/** Tiempo máximo (min) para primera respuesta de N1 antes de escalar */
export const SLA_RESPUESTA_MIN = 60

/** Tiempo máximo (min) para resolución total, medido desde hora_correo_n1 */
export const SLA_RESOLUCION_POR_TIPO: Record<string, number> = {
  CAIDA_TOTAL:   60,
  INTERMITENCIA: 120,
  LENTITUD:      240,
  POS:           60,
  OTROS:         120,
}

export function getSlaResolucionMin(tipo: string): number {
  return SLA_RESOLUCION_POR_TIPO[tipo] ?? 60
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

/** Campos mínimos requeridos para calcular SLA. Todos los RawRow la cumplen. */
export interface SLAInputRow {
  tipo: string
  hora_correo_n1: Date | string | null
  hora_primera_resp: Date | string | null
  hora_fin: Date | string | null
  hora_registro?: Date | string | null   // retenido por compatibilidad, no usado en evaluación
  max_nivel: number | null
  slaRespuestaOverride?: number
  slaResolucionOverride?: number
}

// ─── Resultado SLA ────────────────────────────────────────────────────────────

export interface SLAResult {
  evaluable: boolean
  escaladoN2: boolean
  tPrimeraRespuestaMin: number | null
  tResolucionMin: number | null
  slaResolucionObj: number
  slaRespuesta: boolean
  slaResolucion: boolean
  slaGeneral: boolean
  motivoIncumplimiento: string | null
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Evalúa el cumplimiento SLA de un incidente.
 *
 * Un incidente es evaluable SOLO si el proveedor fue notificado formalmente (N1).
 * Incidentes resueltos por el agente interno (sin correo N1) no son evaluables.
 *
 * Evaluabilidad: hora_correo_n1 != null AND max_nivel >= 1
 * SLA Respuesta: primera respuesta dentro de SLA_RESPUESTA_MIN desde hora_correo_n1
 *                (falla automáticamente si escaló a N2+, pues N1 no respondió a tiempo)
 * SLA Resolución: resolución dentro de SLA_RESOLUCION_POR_TIPO[tipo] desde hora_correo_n1
 * SLA General: SLA Respuesta AND SLA Resolución
 */
export function calcSLARow(row: SLAInputRow): SLAResult {
  const slaResolucionObj = row.slaResolucionOverride ?? getSlaResolucionMin(row.tipo)

  // ── Evaluable solo si el proveedor recibió correo N1 y hay escalamiento ───────
  if (row.hora_correo_n1 && row.max_nivel != null && row.max_nivel >= 1) {
    const escaladoN2 = row.max_nivel >= 2
    const tPrimeraRespuestaMin = diffMin(row.hora_primera_resp, row.hora_correo_n1)
    const tResolucionMin       = diffMin(row.hora_fin, row.hora_correo_n1)

    const slaRespuesta =
      !escaladoN2 &&
      tPrimeraRespuestaMin != null &&
      tPrimeraRespuestaMin <= (row.slaRespuestaOverride ?? SLA_RESPUESTA_MIN)

    const slaResolucion = tResolucionMin != null && tResolucionMin <= slaResolucionObj
    const slaGeneral    = slaRespuesta && slaResolucion

    let motivoIncumplimiento: string | null = null
    if (!slaGeneral) {
      const parts: string[] = []
      if (!slaRespuesta) {
        if (escaladoN2) parts.push('Enviado a N2')
        else if (tPrimeraRespuestaMin != null) parts.push('Respuesta fuera de tiempo')
        else parts.push('Sin respuesta')
      }
      if (!slaResolucion) parts.push('Resolución fuera de tiempo')
      motivoIncumplimiento = parts.join(' + ') || null
    }

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
