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
  max_nivel: number | null
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
 * Evaluabilidad: hora_correo_n1 != null AND max_nivel >= 1
 * SLA Respuesta: primera respuesta dentro de SLA_RESPUESTA_MIN desde hora_correo_n1
 *                (falla automáticamente si escaló a N2+, pues N1 no respondió a tiempo)
 * SLA Resolución: resolución dentro de SLA_RESOLUCION_POR_TIPO[tipo] desde hora_correo_n1
 * SLA General: SLA Respuesta AND SLA Resolución
 */
export function calcSLARow(row: SLAInputRow): SLAResult {
  const slaResolucionObj = getSlaResolucionMin(row.tipo)

  if (!row.hora_correo_n1 || row.max_nivel == null || row.max_nivel < 1) {
    return {
      evaluable: false, escaladoN2: false,
      tPrimeraRespuestaMin: null, tResolucionMin: null,
      slaResolucionObj, slaRespuesta: false, slaResolucion: false,
      slaGeneral: false, motivoIncumplimiento: null,
    }
  }

  const escaladoN2 = row.max_nivel >= 2
  const tPrimeraRespuestaMin = diffMin(row.hora_primera_resp, row.hora_correo_n1)
  const tResolucionMin       = diffMin(row.hora_fin, row.hora_correo_n1)

  const slaRespuesta =
    !escaladoN2 &&
    tPrimeraRespuestaMin != null &&
    tPrimeraRespuestaMin <= SLA_RESPUESTA_MIN

  const slaResolucion = tResolucionMin != null && tResolucionMin <= slaResolucionObj
  const slaGeneral    = slaRespuesta && slaResolucion

  let motivoIncumplimiento: string | null = null
  if (!slaGeneral) {
    const parts: string[] = []
    if (!slaRespuesta) parts.push(escaladoN2 ? 'Nivel 1 sin respuesta' : 'Respuesta fuera de tiempo')
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
