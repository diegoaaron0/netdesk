/**
 * impacto-calc.ts — única fuente de verdad para cálculo de impacto económico estimado.
 *
 * Fórmula:
 *   ventaEsperadaAfectada = venta_hora × horas_afectadas
 *   impactoEconomicoBruto = ventaEsperadaAfectada × margen_bruto
 *   impactoEconomicoEstimado = impactoEconomicoBruto × factor_afectacion_real
 *
 * factor_afectacion_real depende de: tipo, contingencia_activa, boleta_manual,
 * venta_parcial, cajas_afectadas/totales, otros_clasificacion.
 *
 * Si venta_hora no puede resolverse: faltaInformacion = true, montos = null.
 * NO usar fallback fijo inventado (ej. S/500).
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
  // Si el llamador ya resolvió la venta hora (ej. con ventasDiarias), la pasa aquí.
  // undefined = no proporcionado, usar venta_hora_soles / cluster.
  // null = el llamador confirmó que no hay dato → faltaInformacion.
  ventaHoraResolvida?: number | null
  // Condiciones del incidente — opcionales; no rompen si están ausentes
  contingencia_activa?: boolean | null
  boleta_manual?: boolean | null        // TODO: campo pendiente en schema
  venta_parcial?: boolean | null        // TODO: campo pendiente en schema
  cajas_afectadas?: number | null       // TODO: campo pendiente en schema
  cajas_totales?: number | null         // TODO: campo pendiente en schema
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

// ─── Factor de afectación real ────────────────────────────────────────────────

const RE_NO_AFECTA_VENTA = /biom[eé]trico|asistencia|rrhh|control.*personal|no afecta|clima|limpieza|seguridad/i
const RE_AFECTA_VENTA    = /pos|sistema.*venta|venta|caja|red|conectividad|internet|lector|escaner/i

function calcFactorAfectacion(
  tipo: string,
  contingencia_activa: boolean | null | undefined,
  boleta_manual: boolean | null | undefined,
  venta_parcial: boolean | null | undefined,
  cajas_afectadas: number | null | undefined,
  cajas_totales: number | null | undefined,
  otros_clasificacion: string | null | undefined,
): { factor: number; motivo: string } {
  let factor: number
  let motivo: string

  switch (tipo) {
    case 'CAIDA_TOTAL':
      if (boleta_manual) {
        factor = 0.40
        motivo = 'Caída total con boleta manual: recuperación parcial de ventas estimada.'
      } else if (contingencia_activa) {
        factor = 0.25
        motivo = 'Caída total con contingencia activa: operación alternativa reduce el impacto.'
      } else if (venta_parcial) {
        factor = 0.50
        motivo = 'Caída total con venta parcial reportada.'
      } else {
        factor = 1.00
        motivo = 'Caída total sin operación alternativa: impacto total estimado.'
      }
      break

    case 'INTERMITENCIA':
      if (contingencia_activa) {
        factor = 0.25
        motivo = 'Intermitencia con contingencia activa: impacto reducido.'
      } else if (venta_parcial) {
        factor = 0.35
        motivo = 'Intermitencia con venta parcial reportada.'
      } else {
        factor = 0.50
        motivo = 'Intermitencia: impacto parcial estimado (servicio degradado).'
      }
      break

    case 'LENTITUD':
      if (contingencia_activa) {
        factor = 0.20
        motivo = 'Lentitud con contingencia activa: impacto mínimo.'
      } else if (venta_parcial) {
        factor = 0.25
        motivo = 'Lentitud con venta parcial reportada.'
      } else {
        factor = 0.30
        motivo = 'Lentitud: impacto reducido (servicio operativo con degradación).'
      }
      break

    case 'POS':
      if (contingencia_activa) {
        factor = 0.20
        motivo = 'Falla POS con contingencia activa: transacciones alternativas disponibles.'
      } else {
        factor = 0.40
        motivo = 'Falla de terminal POS: impacto parcial en transacciones de caja.'
      }
      break

    default: { // OTROS y tipos desconocidos
      const clas = otros_clasificacion?.trim() ?? ''
      if (clas && RE_NO_AFECTA_VENTA.test(clas)) {
        factor = 0.00
        motivo = `Incidente tipo Otros (${clas}): no afecta directamente las ventas.`
      } else if (clas && RE_AFECTA_VENTA.test(clas)) {
        factor = 0.40
        motivo = `Incidente tipo Otros (${clas}): afecta sistema de ventas o conectividad.`
      } else {
        factor = 0.30
        motivo = clas
          ? `Incidente tipo Otros (${clas}): impacto moderado estimado.`
          : 'Incidente tipo Otros sin clasificación: impacto moderado estimado.'
      }
      break
    }
  }

  // Factor parcial por cajas afectadas
  if (
    cajas_afectadas != null &&
    cajas_totales != null &&
    cajas_totales > 0 &&
    cajas_afectadas < cajas_totales
  ) {
    const factorCajas = cajas_afectadas / cajas_totales
    factor = Math.round(factor * factorCajas * 1000) / 1000
    motivo += ` (${cajas_afectadas}/${cajas_totales} cajas afectadas)`
  }

  return { factor, motivo }
}

// ─── Función principal ────────────────────────────────────────────────────────

export function calcImpactoRow(row: ImpactoInputRow): ImpactoResult {
  const margenUsado = DASHBOARD_CONFIG.MARGEN_BRUTO

  const { factor, motivo } = calcFactorAfectacion(
    row.tipo,
    row.contingencia_activa,
    row.boleta_manual,
    row.venta_parcial,
    row.cajas_afectadas,
    row.cajas_totales,
    row.otros_clasificacion,
  )

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
      factorAplicado: factor,
      motivoFactor: motivo,
      impactoEconomicoEstimado: null,
      impactoEstimado: 0,
    }
  }

  const ventaEsperadaAfectada  = Math.round(ventaHora * (mttrMin / 60))
  const impactoEconomicoBruto  = Math.round(ventaEsperadaAfectada * margenUsado)
  const impactoEconomicoEstimado = Math.round(impactoEconomicoBruto * factor)

  return {
    faltaInformacion: false,
    mttrMin,
    ventaHora: Math.round(ventaHora),
    ventaEsperadaAfectada,
    margenUsado,
    impactoEconomicoBruto,
    factorAplicado: factor,
    motivoFactor: motivo,
    impactoEconomicoEstimado,
    impactoEstimado: impactoEconomicoEstimado,
  }
}
