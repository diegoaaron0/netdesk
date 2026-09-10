/**
 * impacto-calc.ts — Fuente única de verdad para el cálculo del IEI.
 *
 * Fórmula: IEI = Σ (venta_hora × horas_segmento × margen_bruto × factor_segmento)
 * La suma es sobre tramos de tiempo en que las mitigaciones activas cambian.
 *
 * Factores de mitigación de red (router propio, router externo, datos móviles):
 *   EFECTIVO → 0.00  |  PARCIAL → 0.50  |  NULO → 1.00
 *
 * Factores boleta manual (conectividad):
 *   EFECTIVA → 0.10  |  PARCIAL → 0.30  |  NULA → 1.00
 * Factores boleta manual (CORTE_ELECTRICO):
 *   EFECTIVA → 0.00  |  PARCIAL → 0.30  |  NULA → 1.00  ← boleta cubre la venta completa
 *
 * Factores base sin mitigación (por tipo de incidente):
 *   CAIDA_TOTAL → 1.00  |  INTERMITENCIA → 0.50  |  LENTITUD → 0.30  |  CORTE_ELECTRICO → 1.00
 *
 * Reglas especiales:
 *   - CORTE_ELECTRICO: solo boleta manual aplica; router y datos se ignoran.
 *   - Si hay varias mitigaciones activas simultáneamente → se toma la de menor factor.
 *   - Venta/hora: usa tasa L-J (lun-jue) o V-D (vie-dom) según el día de inicio del incidente.
 *
 * Compatibilidad hacia atrás:
 *   - Si se pasan timestamps (cont_hora_activacion, mov_hora_activacion) → cálculo ponderado por tramos.
 *   - Si se pasa solo boolean (contingencia_activa, hubo_movil) → la mitigación aplica durante todo el MTTR.
 */

import { DASHBOARD_CONFIG } from './dashboard-config'

// ─── Normalización de rendimiento ─────────────────────────────────────────────

export function normContFactor(rend: string | null | undefined): number {
  if (!rend) return 0.50  // activada pero sin rendimiento registrado → parcial
  const r = rend.toUpperCase()
  if (r === 'EFECTIVO') return 0.00
  if (r === 'PARCIAL')  return 0.50
  return 1.00  // NULO (o cualquier valor no reconocido)
}

export function normBoletaFactor(rend: string | null | undefined, tipo?: string): number {
  const isCorte = tipo === 'CORTE_ELECTRICO'
  // En corte eléctrico la boleta efectiva cubre la venta completa → residual 0.00
  const residual = isCorte ? 0.00 : DASHBOARD_CONFIG.BOLETA_RESIDUAL
  if (!rend) return residual
  const r = rend.toUpperCase()
  if (r === 'EFECTIVA' || r === 'TOTAL') return residual
  if (r === 'PARCIAL')  return DASHBOARD_CONFIG.BOLETA_PARCIAL
  return 1.00  // NULA
}

const FACTOR_BASE: Record<string, number> = {
  CAIDA_TOTAL:     1.00,
  INTERMITENCIA:   0.50,
  LENTITUD:        0.30,
  CORTE_ELECTRICO: 1.00,
}

// ─── Input ────────────────────────────────────────────────────────────────────

export interface ImpactoInputRow {
  hora_registro:  Date | string
  hora_fin:       Date | string | null
  estado:         string
  tipo:           string

  // Venta hora tienda (L-J y V-D diferenciados)
  venta_hora_soles?:     number | string | null
  venta_hora_fds_soles?: number | string | null
  cluster?:              string | null
  ventaHoraResolvida?:   number | null  // si el llamador ya la resolvió

  // Contingencia de red — nuevo: timestamps; legacy: boolean
  cont_hora_activacion?:    Date | string | null
  cont_hora_desactivacion?: Date | string | null
  contingencia_activa?:     boolean | null  // legacy
  cont_es_externo?:         boolean | null
  cont_rendimiento?:        string | null

  // Datos móviles — nuevo: timestamps; legacy: boolean
  mov_hora_activacion?:    Date | string | null
  mov_hora_desactivacion?: Date | string | null
  hubo_movil?:             boolean | null  // legacy
  mov_rendimiento?:        string | null

  // Boleta manual
  boleta_manual?:           boolean | null
  boleta_rendimiento?:      string | null   // EFECTIVA | PARCIAL | NULA
  boleta_hora_activacion?:  Date | string | null  // cuándo se activó la boleta

  // Legacy — mantenidos en la interfaz para compatibilidad, no afectan el cálculo
  cajas_afectadas?:    number | null
  cajas_totales?:      number | null
  venta_parcial?:      boolean | null
  otros_clasificacion?: string | null
}

// ─── Output ───────────────────────────────────────────────────────────────────

export interface ImpactoSegmento {
  desdeMs:     number
  hastaMs:     number
  horas:       number
  factor:      number
  descripcion: string
  ieiParcial:  number
}

export interface ImpactoResult {
  faltaInformacion:       boolean
  mttrMin:                number | null
  ventaHora:              number | null
  ventaEsperadaAfectada:  number | null
  margenUsado:            number
  impactoEconomicoBruto:  number | null
  factorAplicado:         number
  motivoFactor:           string
  impactoEconomicoEstimado: number | null
  impactoEstimado:        number
  segmentos:              ImpactoSegmento[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  return v instanceof Date ? v : new Date(v as string)
}

export function isActiveAt(start: Date, end: Date | null, pointMs: number): boolean {
  if (pointMs < start.getTime()) return false
  if (!end) return true  // aún activa al finalizar el incidente
  return pointMs < end.getTime()
}

/** Día de la semana (0=dom..6=sab) en hora de Lima, no en la zona del servidor.
 *  hora_registro se guarda en UTC; getDay() del servidor podía caer en otro día
 *  cerca de medianoche y elegir la tarifa equivocada (L-J vs FDS). */
export function diaSemanaLima(d: Date): number {
  const wd = d.toLocaleDateString('en-US', { timeZone: 'America/Lima', weekday: 'short' })
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[wd] ?? 1
}

/** Día calendario (YYYY-MM-DD) en hora de Lima, no en la zona del servidor
 *  ni en UTC. Un `d.toISOString().slice(0,10)` toma el día UTC — entre 00:00
 *  y 04:59 UTC (7pm-medianoche Lima) eso es un día distinto al de Lima. */
export function fechaLimaStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
}

export type VentaHoraInput = Pick<ImpactoInputRow,
  'hora_registro' | 'venta_hora_soles' | 'venta_hora_fds_soles' | 'cluster' | 'ventaHoraResolvida'>

/** Exportado para reutilizarse fuera de calcImpactoRow — p.ej. la migración
 *  histórica de tramos necesita resolver la MISMA venta/hora una sola vez
 *  por ciclo (no por tramo), igual que hace calcImpactoRow hoy. */
export function resolveVentaHora(row: VentaHoraInput): number | null {
  if (row.ventaHoraResolvida !== undefined) return row.ventaHoraResolvida ?? null
  const d   = toDate(row.hora_registro)
  const dow = d ? diaSemanaLima(d) : 1  // 0=dom, 1-4=lun-jue, 5=vie, 6=sab — en hora Lima
  const isFDS = dow === 0 || dow === 5 || dow === 6

  if (isFDS) {
    if (row.venta_hora_fds_soles != null) return Number(row.venta_hora_fds_soles)
    if (row.venta_hora_soles     != null) return Number(row.venta_hora_soles)
  } else {
    if (row.venta_hora_soles     != null) return Number(row.venta_hora_soles)
    if (row.venta_hora_fds_soles != null) return Number(row.venta_hora_fds_soles)
  }

  if (row.cluster) {
    const fb = isFDS
      ? DASHBOARD_CONFIG.CLUSTER_FALLBACK_HORA_FDS[row.cluster]
      : DASHBOARD_CONFIG.CLUSTER_FALLBACK_HORA[row.cluster]
    if (fb != null) return fb
  }
  return null
}

// ─── calcImpactoEnCurso ─────────────────────────────────────────────────────
// Puerto directo de calcIeiLive (antes en app/(dashboard)/dashboard/page.tsx).
// Fallback del ticker del dashboard operativo para incidentes ABIERTOS que
// todavía no tienen ningún tramo (no tocados por el flujo de mitigación por
// tramos) — sin esto quedarían en S/0 mientras el resto de la cola ya usa el
// cálculo por tramos. Nombres de campo en snake_case porque consume filas SQL
// crudas del endpoint, igual que las hacía calcIeiLive.

export interface ImpactoEnCursoInput {
  iei_venta_hora?:          number | string | null
  hora_registro:            Date | string
  tipo:                     string
  cont_activado_por?:       string | null
  cont_hora_activacion?:    Date | string | null
  cont_hora_desactivacion?: Date | string | null
  cont_rendimiento?:        string | null
  mov_activado_por?:        string | null
  mov_hora_activacion?:     Date | string | null
  mov_hora_desactivacion?:  Date | string | null
  mov_rendimiento?:         string | null
  boleta_manual?:           boolean | null
  boleta_rendimiento?:      string | null
  boleta_hora_activacion?:  Date | string | null
}

export function calcImpactoEnCurso(row: ImpactoEnCursoInput, nowMs: number): number {
  const vh = row.iei_venta_hora ? Number(row.iei_venta_hora) : 0
  if (!vh) return 0
  const startMs = new Date(row.hora_registro).getTime()
  if (nowMs <= startMs) return 0
  const contStartMs = row.cont_hora_activacion ? new Date(row.cont_hora_activacion).getTime() : null
  const contEndMs   = row.cont_hora_desactivacion ? new Date(row.cont_hora_desactivacion).getTime() : null
  // mov_hora_activacion solo cuenta como activación si mov_activado_por está
  // seteado — bug real confirmado en producción: un timestamp fantasma en
  // mov_hora_activacion (sin mov_activado_por) se contaba como activo.
  const movStartMs = row.mov_activado_por ? new Date(row.mov_hora_activacion!).getTime() : null
  const movEndMs   = row.mov_hora_desactivacion ? new Date(row.mov_hora_desactivacion).getTime() : null
  const contF = contStartMs !== null ? normContFactor(row.cont_rendimiento) : null
  const movF  = movStartMs  !== null ? normContFactor(row.mov_rendimiento)  : null
  const bolF  = row.boleta_manual ? normBoletaFactor(row.boleta_rendimiento, row.tipo) : null
  const bolStartMs = row.boleta_manual
    ? (row.boleta_hora_activacion ? new Date(row.boleta_hora_activacion).getTime() : startMs)
    : null
  const bpSet = new Set([startMs, nowMs])
  const addBp = (t: number | null) => { if (t && t > startMs && t < nowMs) bpSet.add(t) }
  addBp(contStartMs); addBp(contEndMs); addBp(movStartMs); addBp(movEndMs); addBp(bolStartMs)
  const bps = Array.from(bpSet).sort((a, b) => a - b)
  let iei = 0
  for (let i = 0; i < bps.length - 1; i++) {
    const mid = (bps[i] + bps[i + 1]) / 2
    const h   = (bps[i + 1] - bps[i]) / 3600000
    const opts: number[] = []
    const bolActiva = bolF !== null && bolStartMs !== null && mid >= bolStartMs
    if (row.tipo === 'CORTE_ELECTRICO') {
      opts.push(bolActiva ? bolF! : 1.00)
    } else {
      if (contF !== null && contStartMs !== null && mid >= contStartMs && (contEndMs === null || mid < contEndMs)) opts.push(contF)
      if (movF  !== null && movStartMs  !== null && mid >= movStartMs  && (movEndMs  === null || mid < movEndMs))  opts.push(movF)
      if (bolActiva) opts.push(bolF!)
      if (!opts.length) opts.push(FACTOR_BASE[row.tipo] ?? 1.00)
    }
    iei += vh * h * DASHBOARD_CONFIG.MARGEN_BRUTO * Math.min(...opts)
  }
  return Math.round(iei)
}

// ─── Función principal ────────────────────────────────────────────────────────

export function calcImpactoRow(row: ImpactoInputRow): ImpactoResult {
  const margenUsado = DASHBOARD_CONFIG.MARGEN_BRUTO

  const empty = (motivo: string, mttrMin?: number | null): ImpactoResult => ({
    faltaInformacion: true, mttrMin: mttrMin ?? null, ventaHora: null,
    ventaEsperadaAfectada: null, margenUsado, impactoEconomicoBruto: null,
    factorAplicado: 0, motivoFactor: motivo, impactoEconomicoEstimado: null, impactoEstimado: 0,
    segmentos: [],
  })

  if (row.estado !== 'RESUELTO') return empty('Incidente no resuelto.')

  const incStart = toDate(row.hora_registro)
  const incEnd   = toDate(row.hora_fin)
  if (!incStart || !incEnd) return empty('Sin timestamps de inicio/fin.')

  const totalMs = incEnd.getTime() - incStart.getTime()
  if (totalMs <= 0) return empty('MTTR inválido.')

  const mttrMin  = Math.round(totalMs / 60000)
  const ventaHora = resolveVentaHora(row)
  if (!ventaHora) return empty('Sin venta/hora para esta tienda.', mttrMin)

  // Normalizar fuente de activación — timestamps (nuevo) o boolean (legacy)
  const contStart = toDate(row.cont_hora_activacion) ?? (row.contingencia_activa ? incStart : null)
  const contEnd   = toDate(row.cont_hora_desactivacion)
  const movStart  = toDate(row.mov_hora_activacion)  ?? (row.hubo_movil ? incStart : null)
  const movEnd    = toDate(row.mov_hora_desactivacion)

  const contFactor  = contStart ? normContFactor(row.cont_rendimiento)  : null
  const movFactor   = movStart  ? normContFactor(row.mov_rendimiento)   : null
  const boletaFactor = row.boleta_manual ? normBoletaFactor(row.boleta_rendimiento, row.tipo) : null

  // boleta_hora_activacion: cuándo empezó a cubrir la boleta
  // Si no hay timestamp → la boleta aplica desde el inicio (backward compat para datos históricos)
  const boletaStart = row.boleta_manual
    ? (toDate(row.boleta_hora_activacion) ?? incStart)
    : null

  // Construir breakpoints de tiempo para segmentación
  const bpSet = new Set<number>([incStart.getTime(), incEnd.getTime()])
  const addBp = (d: Date | null) => {
    if (!d) return
    const ms = d.getTime()
    if (ms > incStart.getTime() && ms < incEnd.getTime()) bpSet.add(ms)
  }
  addBp(contStart); addBp(contEnd)
  addBp(movStart);  addBp(movEnd)
  addBp(boletaStart)

  const breakpoints = Array.from(bpSet).sort((a, b) => a - b)

  let totalVentaEsperada = 0
  let totalImpactoBruto  = 0
  let totalIEI           = 0
  let weightedFactorSum  = 0
  const motivosParts: string[] = []
  const segmentos: ImpactoSegmento[] = []

  for (let i = 0; i < breakpoints.length - 1; i++) {
    const segStartMs = breakpoints[i]
    const segEndMs   = breakpoints[i + 1]
    const midMs      = (segStartMs + segEndMs) / 2
    const segHours   = (segEndMs - segStartMs) / 3600000

    const opts: { f: number; label: string }[] = []

    if (row.tipo === 'CORTE_ELECTRICO') {
      // Solo boleta aplica en corte eléctrico, y solo desde su hora de activación
      if (boletaStart && boletaFactor !== null && midMs >= boletaStart.getTime()) {
        opts.push({ f: boletaFactor, label: `boleta ${row.boleta_rendimiento?.toLowerCase() ?? 'efectiva'}` })
      } else {
        opts.push({ f: 1.00, label: 'sin mitigación' })
      }
    } else {
      if (contStart && isActiveAt(contStart, contEnd, midMs) && contFactor !== null) {
        const tipo = row.cont_es_externo ? 'router externo' : 'router propio'
        opts.push({ f: contFactor, label: `${tipo} ${row.cont_rendimiento?.toLowerCase() ?? ''}`.trim() })
      }
      if (movStart && isActiveAt(movStart, movEnd, midMs) && movFactor !== null) {
        opts.push({ f: movFactor, label: `datos móviles ${row.mov_rendimiento?.toLowerCase() ?? ''}`.trim() })
      }
      // Boleta activa solo desde su hora de activación en adelante
      if (boletaStart && boletaFactor !== null && midMs >= boletaStart.getTime()) {
        opts.push({ f: boletaFactor, label: `boleta ${row.boleta_rendimiento?.toLowerCase() ?? 'efectiva'}` })
      }
      if (opts.length === 0) {
        opts.push({ f: FACTOR_BASE[row.tipo] ?? 1.00, label: 'sin mitigación' })
      }
    }

    const best   = opts.reduce((a, b) => a.f <= b.f ? a : b)
    const segV   = ventaHora * segHours
    const segIB  = segV * margenUsado
    const segIEI = segIB * best.f

    totalVentaEsperada += segV
    totalImpactoBruto  += segIB
    totalIEI           += segIEI
    weightedFactorSum  += best.f * segHours

    if (motivosParts[motivosParts.length - 1] !== best.label) motivosParts.push(best.label)

    segmentos.push({
      desdeMs:     segStartMs,
      hastaMs:     segEndMs,
      horas:       Math.round(segHours * 100) / 100,
      factor:      best.f,
      descripcion: best.label,
      ieiParcial:  Math.round(segIEI),
    })
  }

  const totalHours   = totalMs / 3600000
  const factorProm   = totalHours > 0 ? weightedFactorSum / totalHours : 0

  return {
    faltaInformacion:        false,
    mttrMin,
    ventaHora:               Math.round(ventaHora),
    ventaEsperadaAfectada:   Math.round(totalVentaEsperada),
    margenUsado,
    impactoEconomicoBruto:   Math.round(totalImpactoBruto),
    factorAplicado:          Math.round(factorProm * 1000) / 1000,
    motivoFactor:            motivosParts.join(' → '),
    impactoEconomicoEstimado: Math.round(totalIEI),
    impactoEstimado:         Math.round(totalIEI),
    segmentos,
  }
}
