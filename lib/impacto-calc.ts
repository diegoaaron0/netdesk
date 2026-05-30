/**
 * impacto-calc.ts — única fuente de verdad para cálculo de impacto económico estimado.
 *
 * Fórmula:
 *   ventaEsperadaAfectada = venta_hora × horas_afectadas
 *   impactoEconomicoBruto = ventaEsperadaAfectada × margen_bruto
 *   impactoEconomicoEstimado = impactoEconomicoBruto × factor_afectacion_real
 *
 * factor_afectacion_real depende de: tipo, tipo de contingencia (propia/externa/móvil),
 * rendimiento de cada contingencia, boleta_manual, venta_parcial, cajas.
 *
 * Factores de backup — IGUALES para router propio, externo y datos móviles:
 *   CAIDA_TOTAL:   TOTAL 0.00 / PARCIAL 0.25 / FALLIDA 1.00 / sin rend 0.25
 *   INTERMITENCIA: TOTAL 0.00 / PARCIAL 0.20 / FALLIDA 0.75 / sin rend 0.20
 *   LENTITUD:      TOTAL 0.00 / PARCIAL 0.10 / FALLIDA 0.30 / sin rend 0.10
 *   POS:           TOTAL 0.00 / PARCIAL 0.15 / FALLIDA 0.40 / sin rend 0.20
 *
 *   Boleta manual (sin backup): cubre 80% → factor 0.20
 *   Sin ninguna mitigación: venta_parcial → 0.50, ninguna → 1.00
 *
 * Si varios backups activos: se toma el de menor factor (mejor cobertura).
 */

import { DASHBOARD_CONFIG } from './dashboard-config'
import { calcMTTRMin } from './sla-core'

// ─── Input ────────────────────────────────────────────────────────────────────

export interface ImpactoInputRow {
  hora_registro: Date | string
  hora_fin: Date | string | null
  estado: string
  tipo: string
  // Venta hora del incidente
  venta_hora_soles?: number | null
  cluster?: string | null
  // Si el llamador ya resolvió la venta hora, la pasa aquí.
  ventaHoraResolvida?: number | null
  // Contingencia router (propio o externo)
  contingencia_activa?: boolean | null
  cont_es_externo?: boolean | null        // true = ROUTER_EXTERNO, false/null = ROUTER_PROPIO
  cont_rendimiento?: string | null        // TOTAL | PARCIAL | FALLIDA
  // Datos móviles
  hubo_movil?: boolean | null
  mov_rendimiento?: string | null         // TOTAL | PARCIAL | FALLIDA
  // Otras condiciones
  boleta_manual?: boolean | null
  venta_parcial?: boolean | null
  cajas_afectadas?: number | null
  cajas_totales?: number | null
  otros_clasificacion?: string | null
}

// ─── Output ───────────────────────────────────────────────────────────────────

export interface ImpactoResult {
  faltaInformacion: boolean
  mttrMin: number | null
  ventaHora: number | null
  ventaEsperadaAfectada: number | null
  margenUsado: number
  impactoEconomicoBruto: number | null
  factorAplicado: number
  motivoFactor: string
  impactoEconomicoEstimado: number | null
  /** Alias de impactoEconomicoEstimado (0 si faltaInformacion) — backward compat */
  impactoEstimado: number
}

// ─── Resolución de venta hora ─────────────────────────────────────────────────

function resolveVentaHora(row: ImpactoInputRow): number | null {
  if (row.ventaHoraResolvida !== undefined) return row.ventaHoraResolvida ?? null
  if (row.venta_hora_soles != null) return Number(row.venta_hora_soles)
  if (row.cluster != null) {
    const fb = DASHBOARD_CONFIG.CLUSTER_FALLBACK_HORA[row.cluster]
    if (fb != null) return fb
  }
  return null
}

// ─── Factor de backup por rendimiento (igual para propio, externo y datos móviles) ──

// Normaliza rendimiento a tier canónico
function normRend(r: string | null | undefined): 'TOTAL' | 'PARCIAL' | 'FALLIDA' | null {
  if (!r) return null
  if (r === 'TOTAL'   || r === 'EFECTIVA')                           return 'TOTAL'
  if (r === 'PARCIAL' || r === 'LIMITADA')                           return 'PARCIAL'
  if (r === 'FALLIDA' || r === 'NO_FUNCIONO' || r === 'INOPERATIVA') return 'FALLIDA'
  return null
}

/**
 * Factor por rendimiento del backup — mismo valor para router propio, externo y datos móviles.
 * Factor = fracción del impacto que QUEDA después de la mitigación.
 */
function factorBackup(tipo: string, rend: 'TOTAL' | 'PARCIAL' | 'FALLIDA' | null): number {
  const tabla: Record<string, Record<string, number>> = {
    CAIDA_TOTAL:    { TOTAL: 0.00, PARCIAL: 0.25, FALLIDA: 1.00, unknown: 0.25 },
    INTERMITENCIA:  { TOTAL: 0.00, PARCIAL: 0.20, FALLIDA: 0.75, unknown: 0.20 },
    LENTITUD:       { TOTAL: 0.00, PARCIAL: 0.10, FALLIDA: 0.30, unknown: 0.10 },
    POS:            { TOTAL: 0.00, PARCIAL: 0.15, FALLIDA: 0.40, unknown: 0.20 },
    CORTE_ELECTRICO:{ TOTAL: 0.00, PARCIAL: 0.25, FALLIDA: 1.00, unknown: 0.25 },
  }
  const row = tabla[tipo] ?? tabla['CAIDA_TOTAL']
  return row[rend ?? 'unknown'] ?? row['unknown']
}

// ─── Factor de afectación real ────────────────────────────────────────────────

const RE_NO_AFECTA_VENTA = /biom[eé]trico|asistencia|rrhh|control.*personal|no afecta|clima|limpieza|seguridad/i
const RE_AFECTA_VENTA    = /pos|sistema.*venta|venta|caja|red|conectividad|internet|lector|escaner/i

function calcFactorAfectacion(
  tipo: string,
  contingencia_activa: boolean | null | undefined,
  cont_es_externo: boolean | null | undefined,
  cont_rendimiento: string | null | undefined,
  hubo_movil: boolean | null | undefined,
  mov_rendimiento: string | null | undefined,
  boleta_manual: boolean | null | undefined,
  venta_parcial: boolean | null | undefined,
  cajas_afectadas: number | null | undefined,
  cajas_totales: number | null | undefined,
  otros_clasificacion: string | null | undefined,
): { factor: number; motivo: string } {

  const rendRouter = normRend(cont_rendimiento)
  const rendMovil  = normRend(mov_rendimiento)

  // Calcular factor de cada backup activo (misma tabla para los 3 tipos)
  const factores: { f: number; desc: string }[] = []

  if (contingencia_activa) {
    const label = cont_es_externo ? 'router externo' : 'router propio'
    const f = factorBackup(tipo, rendRouter)
    factores.push({ f, desc: `${label} (${rendRouter?.toLowerCase() ?? 'sin rendimiento'})` })
  }

  if (hubo_movil) {
    const f = factorBackup(tipo, rendMovil)
    factores.push({ f, desc: `datos móviles (${rendMovil?.toLowerCase() ?? 'sin rendimiento'})` })
  }

  // Si algún backup estuvo activo → tomar el de mejor cobertura (menor factor)
  if (factores.length > 0) {
    const best = factores.reduce((a, b) => a.f <= b.f ? a : b)

    // boleta manual puede complementar si backup fue fallido
    if (boleta_manual && best.f >= 1.0) {
      return { factor: 0.20, motivo: `${best.desc} fallida; boleta manual como respaldo (cubre 80%).` }
    }

    const backupsDesc = factores.map(x => x.desc).join(' + ')
    return {
      factor: best.f,
      motivo: best.f === 0
        ? `${backupsDesc} cubrió al 100%: sin pérdida estimada.`
        : `${backupsDesc}: impacto parcial según rendimiento.`,
    }
  }

  // Sin ningún backup — fallback a boleta manual o venta parcial
  if (boleta_manual) {
    // boleta manual cubre 80% de las operaciones → factor 0.20
    const baseFactores: Record<string, number> = {
      CAIDA_TOTAL:  0.20,
      INTERMITENCIA: 0.20,
      LENTITUD:      0.10,
      POS:           0.20,
    }
    const f = baseFactores[tipo] ?? 0.20
    return { factor: f, motivo: 'Boleta manual activa: recuperó ~80% de operaciones.' }
  }

  if (tipo === 'OTROS') {
    const clas = otros_clasificacion?.trim() ?? ''
    if (clas && RE_NO_AFECTA_VENTA.test(clas)) {
      return { factor: 0.00, motivo: `Tipo Otros (${clas}): no afecta directamente ventas.` }
    }
    if (clas && RE_AFECTA_VENTA.test(clas)) {
      return { factor: venta_parcial ? 0.25 : 0.40, motivo: `Tipo Otros (${clas}): afecta sistema de ventas.` }
    }
    return {
      factor: venta_parcial ? 0.25 : 0.30,
      motivo: clas ? `Tipo Otros (${clas}): impacto moderado estimado.` : 'Tipo Otros: impacto moderado estimado.',
    }
  }

  const basesSinBackup: Record<string, number> = {
    CAIDA_TOTAL:   venta_parcial ? 0.50 : 1.00,
    INTERMITENCIA: venta_parcial ? 0.35 : 0.75,
    LENTITUD:      venta_parcial ? 0.20 : 0.30,
    POS:           0.40,
    CORTE_ELECTRICO: 1.00,
  }
  const factor = basesSinBackup[tipo] ?? 0.30
  const motivo = venta_parcial
    ? `${tipo}: venta parcial reportada, impacto reducido.`
    : `${tipo}: sin backup ni mitigación, impacto completo estimado.`
  return { factor, motivo }
}

// ─── Función principal ────────────────────────────────────────────────────────

export function calcImpactoRow(row: ImpactoInputRow): ImpactoResult {
  const margenUsado = DASHBOARD_CONFIG.MARGEN_BRUTO

  const { factor, motivo } = calcFactorAfectacion(
    row.tipo,
    row.contingencia_activa,
    row.cont_es_externo,
    row.cont_rendimiento,
    row.hubo_movil,
    row.mov_rendimiento,
    row.boleta_manual,
    row.venta_parcial,
    row.cajas_afectadas,
    row.cajas_totales,
    row.otros_clasificacion,
  )

  // Factor por cajas afectadas (prorratea si no todas las cajas estuvieron caídas)
  let factorFinal = factor
  if (
    row.cajas_afectadas != null &&
    row.cajas_totales   != null &&
    row.cajas_totales > 0 &&
    row.cajas_afectadas < row.cajas_totales
  ) {
    const factorCajas = row.cajas_afectadas / row.cajas_totales
    factorFinal = Math.round(factorFinal * factorCajas * 1000) / 1000
  }

  const mttrRaw = row.estado === 'RESUELTO'
    ? calcMTTRMin(row.hora_registro, row.hora_fin)
    : null
  const mttrMin = mttrRaw != null ? Math.round(mttrRaw) : null

  const ventaHora = resolveVentaHora(row)

  if (ventaHora == null || mttrMin == null || mttrMin <= 0) {
    return {
      faltaInformacion: ventaHora == null,
      mttrMin,
      ventaHora,
      ventaEsperadaAfectada: null,
      margenUsado,
      impactoEconomicoBruto: null,
      factorAplicado: factorFinal,
      motivoFactor: motivo,
      impactoEconomicoEstimado: null,
      impactoEstimado: 0,
    }
  }

  const ventaEsperadaAfectada   = Math.round(ventaHora * (mttrMin / 60))
  const impactoEconomicoBruto   = Math.round(ventaEsperadaAfectada * margenUsado)
  const impactoEconomicoEstimado = Math.round(impactoEconomicoBruto * factorFinal)

  return {
    faltaInformacion: false,
    mttrMin,
    ventaHora: Math.round(ventaHora),
    ventaEsperadaAfectada,
    margenUsado,
    impactoEconomicoBruto,
    factorAplicado: factorFinal,
    motivoFactor: motivo,
    impactoEconomicoEstimado,
    impactoEstimado: impactoEconomicoEstimado,
  }
}
