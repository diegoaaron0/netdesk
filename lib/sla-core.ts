/**
 * sla-core.ts — única fuente de verdad para cálculo SLA.
 *
 * Tiempos medidos:
 *   tPrimerEnvioMin:       hora_correo_n1 − hora_registro   (tiempo hasta que el agente escala)
 *   tPrimeraRespuestaMin:  hora_primera_resp − hora_correo_n1 (tiempo de respuesta del proveedor)
 *   tResolucionMin:        hora_fin − hora_primera_resp       (tiempo de resolución del proveedor)
 *   MTTR:                  hora_fin − hora_registro           (duración total, no mide al proveedor)
 *
 * hora_correo_n1  = MIN(hora_envio_correo) de CUALQUIER nivel (el primer correo enviado)
 * hora_primera_resp = MIN(hora_respuesta) de CUALQUIER nivel (la primera respuesta recibida)
 *
 * Si se saltó al N2 directamente, hora_correo_n1 = hora_envio_N2.
 * Si N1 no respondió y N2 respondió, tPrimeraRespuesta se mide desde hora_envio_N1.
 *
 * SLA Respuesta:  tPrimeraRespuestaMin ≤ contrato.tiempoRespuestaSla
 * SLA Resolución: tResolucionMin       ≤ contrato.tiempoResolucionSla
 * slaGeneral:     ambos deben cumplirse
 */

// ─── Constantes SLA ────────────────────────────────────────────────────────────

/** Default tiempo de respuesta (min) cuando no hay contrato vigente */
export const SLA_RESPUESTA_MIN = 60

/**
 * Default tiempo de resolución SLA (min) usado en calcSLARow cuando no hay contrato vigente.
 * DISTINTO de SLA_MTTR_POR_TIPO: este aplica al tiempo proveedor→resolución (desde primer correo),
 * mientras SLA_MTTR_POR_TIPO aplica al MTTR total (desde registro del incidente).
 */
export const SLA_RESOLUCION_DEFAULT_MIN = 90

/**
 * Límite de MTTR por tipo de incidente (min).
 * Fuente única de verdad para clasificación operativa de severidad.
 * Usada en: dashboard operativo (color-coding), lib/sla-sql.ts, lib/report-sql.ts (CSV exports).
 * NO se usa para penalización contractual — eso usa SLA_RESOLUCION_DEFAULT_MIN + contrato vigente.
 */
export const SLA_MTTR_POR_TIPO = {
  CAIDA_TOTAL:     60,
  INTERMITENCIA:  120,
  LENTITUD:       240,
  POS:             60,
  OTROS:          120,
  CORTE_ELECTRICO:120,
} as const

export type TipoIncidente = keyof typeof SLA_MTTR_POR_TIPO
export const SLA_MTTR_DEFAULT_MIN = 120

/** Devuelve el límite MTTR para un tipo de incidente dado */
export function getSlaLimitePorTipo(tipo: string): number {
  return SLA_MTTR_POR_TIPO[tipo as TipoIncidente] ?? SLA_MTTR_DEFAULT_MIN
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
  tPrimerEnvioMin: number | null        // hora_correo_n1 − hora_registro (tiempo del agente para escalar)
  tPrimeraRespuestaMin: number | null   // hora_primera_resp − hora_correo_n1 (tiempo de respuesta del proveedor)
  tResolucionMin: number | null         // hora_fin − hora_primera_resp (tiempo de resolución del proveedor)
  scoreRespuesta: number | null         // 0-100: 100=dentro del límite, 0=doble o más del límite; 0 si nunca respondió; null si no evaluable
  scoreResolucion: number | null        // igual para resolución; null si aún no resuelto
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
 * Score de proximidad al límite SLA (0–100).
 * 100 = dentro del límite, 50 = 1.5× el límite, 0 = 2× el límite o más.
 */
function calcScore(real: number | null, limite: number): number | null {
  if (real == null) return null
  return Math.max(0, Math.min(100, Math.round(100 * (2 - real / limite))))
}

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

    // Tiempo desde apertura hasta primer correo enviado (responsabilidad del agente)
    const tPrimerEnvioMin = diffMin(row.hora_correo_n1, row.hora_registro ?? null)

    // Tiempo desde primer correo hasta primera respuesta de cualquier nivel
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

    const tPrimeraRespuestaMinR = tPrimeraRespuestaMin != null ? Math.round(tPrimeraRespuestaMin) : null
    const tResolucionMinR       = tResolucionMin       != null ? Math.round(tResolucionMin)        : null
    // tPrimerEnvioMin negativo = hora_registro backdateado después de hora_envio → dato inválido
    const tPrimerEnvioMinR = tPrimerEnvioMin != null && tPrimerEnvioMin >= 0 ? Math.round(tPrimerEnvioMin) : null

    // Sin respuesta → ambos scores 0; respondió pero no resuelto aún → scoreResolucion null
    const scoreRespuesta  = row.hora_primera_resp == null ? 0 : calcScore(tPrimeraRespuestaMinR, slaRespuestaObj)
    const scoreResolucion = row.hora_primera_resp == null ? 0 : (row.hora_fin == null ? null : calcScore(tResolucionMinR, slaResolucionObj))

    return {
      evaluable: true, escaladoN2, nivelFinal,
      tPrimerEnvioMin:      tPrimerEnvioMinR,
      tPrimeraRespuestaMin: tPrimeraRespuestaMinR,
      tResolucionMin:       tResolucionMinR,
      scoreRespuesta, scoreResolucion,
      slaRespuestaObj, slaResolucionObj,
      slaRespuesta, slaResolucion, slaGeneral,
      cumplioETA, motivoIncumplimiento,
    }
  }

  return {
    evaluable: false, escaladoN2: false, nivelFinal: null,
    tPrimerEnvioMin: null, tPrimeraRespuestaMin: null, tResolucionMin: null,
    scoreRespuesta: null, scoreResolucion: null,
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
