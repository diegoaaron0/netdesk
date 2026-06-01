/**
 * impacto-calc.ts — Fuente única de verdad para el cálculo del IEI.
 *
 * Fórmula: IEI = Σ (venta_hora × horas_segmento × margen_bruto × factor_segmento)
 * La suma es sobre tramos de tiempo en que las mitigaciones activas cambian.
 *
 * Factores de mitigación de red (router propio, router externo, datos móviles):
 *   EFECTIVO → 0.00  |  PARCIAL → 0.20  |  NULO → 1.00
 *
 * Factores boleta manual:
 *   EFECTIVA → 0.10  |  PARCIAL → 0.30  |  NULA → 1.00
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

function normContFactor(rend: string | null | undefined): number {
  if (!rend) return 0.20  // activada pero sin rendimiento registrado → parcial
  const r = rend.toUpperCase()
  if (r === 'EFECTIVO' || r === 'TOTAL' || r === 'EFECTIVA') return 0.00
  if (r === 'PARCIAL'  || r === 'LIMITADA')                  return 0.20
  return 1.00  // NULO, FALLIDA, NO_FUNCIONO, INOPERATIVA
}

function normBoletaFactor(rend: string | null | undefined): number {
  if (!rend) return 0.10  // boleta activa sin rendimiento → efectiva
  const r = rend.toUpperCase()
  if (r === 'EFECTIVA') return 0.10
  if (r === 'PARCIAL')  return 0.30
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
  boleta_manual?:      boolean | null
  boleta_rendimiento?: string | null  // EFECTIVA | PARCIAL | NULA

  // Legacy — mantenidos en la interfaz para compatibilidad, no afectan el cálculo
  cajas_afectadas?:    number | null
  cajas_totales?:      number | null
  venta_parcial?:      boolean | null
  otros_clasificacion?: string | null
}

// ─── Output ───────────────────────────────────────────────────────────────────

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
  impactoEstimado:        number  // alias backward-compat
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  return v instanceof Date ? v : new Date(v as string)
}

function isActiveAt(start: Date, end: Date | null, pointMs: number): boolean {
  if (pointMs < start.getTime()) return false
  if (!end) return true  // aún activa al finalizar el incidente
  return pointMs < end.getTime()
}

function resolveVentaHora(row: ImpactoInputRow): number | null {
  if (row.ventaHoraResolvida !== undefined) return row.ventaHoraResolvida ?? null
  const d   = toDate(row.hora_registro)
  const dow = d?.getDay() ?? 1  // 0=dom, 1-4=lun-jue, 5=vie, 6=sab
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

// ─── Función principal ────────────────────────────────────────────────────────

export function calcImpactoRow(row: ImpactoInputRow): ImpactoResult {
  const margenUsado = DASHBOARD_CONFIG.MARGEN_BRUTO

  const empty = (motivo: string, mttrMin?: number | null): ImpactoResult => ({
    faltaInformacion: true, mttrMin: mttrMin ?? null, ventaHora: null,
    ventaEsperadaAfectada: null, margenUsado, impactoEconomicoBruto: null,
    factorAplicado: 0, motivoFactor: motivo, impactoEconomicoEstimado: null, impactoEstimado: 0,
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
  const boletaFactor = row.boleta_manual ? normBoletaFactor(row.boleta_rendimiento) : null

  // Construir breakpoints de tiempo para segmentación
  const bpSet = new Set<number>([incStart.getTime(), incEnd.getTime()])
  const addBp = (d: Date | null) => {
    if (!d) return
    const ms = d.getTime()
    if (ms > incStart.getTime() && ms < incEnd.getTime()) bpSet.add(ms)
  }
  addBp(contStart); addBp(contEnd)
  addBp(movStart);  addBp(movEnd)

  const breakpoints = Array.from(bpSet).sort((a, b) => a - b)

  let totalVentaEsperada = 0
  let totalImpactoBruto  = 0
  let totalIEI           = 0
  let weightedFactorSum  = 0
  const motivosParts: string[] = []

  for (let i = 0; i < breakpoints.length - 1; i++) {
    const segStartMs = breakpoints[i]
    const segEndMs   = breakpoints[i + 1]
    const midMs      = (segStartMs + segEndMs) / 2
    const segHours   = (segEndMs - segStartMs) / 3600000

    const opts: { f: number; label: string }[] = []

    if (row.tipo === 'CORTE_ELECTRICO') {
      // Solo boleta aplica en corte eléctrico
      if (boletaFactor !== null) {
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
      if (boletaFactor !== null) {
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
  }
}
