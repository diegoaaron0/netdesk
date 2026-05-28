/**
 * sla-core.ts — única fuente de verdad para cálculo SLA.
 *
 * SLA Respuesta:  hora_primera_resp − hora_correo_n1  vs contrato.tiempoRespuestaSla
 * SLA Resolución: hora_fin − hora_primera_resp         vs contrato.tiempoResolucionSla
 * slaGeneral:     ambos deben cumplirse
 * MTTR:           hora_fin − hora_registro (operativo, no mide al proveedor)
 *
 * hora_primera_resp = primera respuesta de CUALQUIER nivel de escalamiento.
 */

// ─── Constantes SLA ────────────────────────────────────────────────────────────

/** Default tiempo de respuesta (min) cuando no hay contrato vigente */
export const SLA_RESPUESTA_MIN = 60

/** Default tiempo de resolución (min) cuando no hay contrato vigente */
export const SLA_RESOLUCION_DEFAULT_MIN = 60

/** @deprecated Shim de compatibilidad. Usar SLA_RESOLUCION_DEFAULT_MIN. */
export const SLA_RESOLUCION_POR_TIPO: Record<string, number> = {
  CAIDA_TOTAL:   SLA_RESOLUCION_DEFAULT_MIN,
  INTERMITENCIA: SLA_RESOLUCION_DEFAULT_MIN,
  LENTITUD:      SLA_RESOLUCION_DEFAULT_MIN,
  POS:           SLA_RESOLUCION_DEFAULT_MIN,
  OTROS:         SLA_RESOLUCION_DEFAULT_MIN,
}

/** @deprecated Shim de compatibilidad. Usar SLA_RESOLUCION_DEFAULT_MIN directamente. */
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

// ─── Parser ETA ───────────────────────────────────────────────────────────────

/**
 * Convierte el texto libre del campo tiempoEstimadoSolucion a minutos.
 * Soporta: "2h", "2 horas", "2hs", "90min", "90 minutos", "90", "1.5h"
 */
export function parseEtaMin(texto: string | null | undefined): number | null {
  if (!texto) return null
  const t = texto.trim().toLowerCase()
  const hMatch = t.match(/^(\d+(?:\.\d+)?)\s*h/)
  if (hMatch) return Math.round(parseFloat(hMatch[1]) * 60)
  const mMatch = t.match(/^(\d+)\s*m/)
  if (mMatch) return parseInt(mMatch[1])
  const soloNum = t.match(/^(\d+)$/)
  if (soloNum) return parseInt(soloNum[1])
  return null
}

// ─── Interfaz de entrada mínima ───────────────────────────────────────────────

export interface SLAInputRow {
  tipo: string
  hora_correo_n1: Date | string | null
  hora_primera_resp: Date | string | null  // primera respuesta de cualquier nivel
  hora_fin: Date | string | null
  hora_registro?: Date | string | null
  max_nivel: number | null
  slaRespuestaOverride?: number            // del contrato vigente
  slaResolucionOverride?: number           // del contrato vigente
  tiempoEstimadoSolucionMin?: number | null // ETA prometido por el proveedor (ya parseado)
}

// ─── Resultado SLA ────────────────────────────────────────────────────────────

export interface SLAResult {
  evaluable: boolean
  escaladoN2: boolean                   // max_nivel >= 2
  nivelFinal: number | null             // nivel máximo alcanzado
  tPrimeraRespuestaMin: number | null   // hora_primera_resp − hora_correo_n1
  tResolucionMin: number | null         // hora_fin − hora_primera_resp
  slaRespuestaObj: number               // límite de respuesta aplicado
  slaResolucionObj: number              // límite de resolución aplicado
  slaRespuesta: boolean                 // cumplió SLA de respuesta
  slaResolucion: boolean                // cumplió SLA de resolución
  slaGeneral: boolean                   // ambos cumplidos
  cumplioETA: boolean | null            // cumplió su propio ETA prometido (null = sin ETA)
  motivoIncumplimiento: string | null
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Evalúa el cumplimiento SLA de un incidente.
 *
 * Evaluable: hora_correo_n1 != null AND max_nivel >= 1 (proveedor fue notificado)
 *
 * SLA Respuesta:  ¿respondió alguien dentro del tiempo de contrato?
 * SLA Resolución: ¿resolvieron desde su respuesta dentro del tiempo de contrato?
 * slaGeneral:     ambos deben cumplirse
 */
export function calcSLARow(row: SLAInputRow): SLAResult {
  const slaRespuestaObj  = row.slaRespuestaOverride  ?? SLA_RESPUESTA_MIN
  const slaResolucionObj = row.slaResolucionOverride ?? SLA_RESOLUCION_DEFAULT_MIN

  if (row.hora_correo_n1 && row.max_nivel != null && row.max_nivel >= 1) {
    const escaladoN2 = row.max_nivel >= 2
    const nivelFinal = row.max_nivel

    // Tiempo desde correo N1 hasta primera respuesta de cualquier nivel
    const tPrimeraRespuestaMin = diffMin(row.hora_primera_resp, row.hora_correo_n1)

    // Tiempo desde primera respuesta hasta cierre (responsabilidad del proveedor)
    const tResolucionMin = diffMin(row.hora_fin, row.hora_primera_resp)

    const slaRespuesta  = tPrimeraRespuestaMin != null && tPrimeraRespuestaMin <= slaRespuestaObj
    const slaResolucion = tResolucionMin != null && tResolucionMin <= slaResolucionObj
    const slaGeneral    = slaRespuesta && slaResolucion

    // ETA: ¿cumplió el tiempo que él mismo prometió?
    let cumplioETA: boolean | null = null
    if (row.tiempoEstimadoSolucionMin != null && tResolucionMin != null) {
      cumplioETA = tResolucionMin <= row.tiempoEstimadoSolucionMin
    }

    const motivos: string[] = []
    if (!slaRespuesta) {
      motivos.push(tPrimeraRespuestaMin != null ? 'Respuesta fuera de tiempo' : 'Sin respuesta')
    }
    if (!slaResolucion && row.hora_primera_resp != null) {
      motivos.push('Resolución fuera de tiempo')
    }
    const motivoIncumplimiento = motivos.length > 0 ? motivos.join(' + ') : null

    return {
      evaluable: true, escaladoN2, nivelFinal,
      tPrimeraRespuestaMin: tPrimeraRespuestaMin != null ? Math.round(tPrimeraRespuestaMin) : null,
      tResolucionMin:       tResolucionMin       != null ? Math.round(tResolucionMin)        : null,
      slaRespuestaObj, slaResolucionObj,
      slaRespuesta, slaResolucion, slaGeneral,
      cumplioETA, motivoIncumplimiento,
    }
  }

  return {
    evaluable: false, escaladoN2: false, nivelFinal: null,
    tPrimeraRespuestaMin: null, tResolucionMin: null,
    slaRespuestaObj, slaResolucionObj,
    slaRespuesta: false, slaResolucion: false, slaGeneral: false,
    cumplioETA: null, motivoIncumplimiento: null,
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
