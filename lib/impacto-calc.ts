/**
 * impacto-calc.ts — única fuente de verdad para cálculo de impacto económico estimado.
 * Fórmula: venta_hora × (mttrMin/60) × factorTipo × factorContingencia × MARGEN_BRUTO
 * Todos los módulos analíticos deben importar desde aquí.
 */

import { DASHBOARD_CONFIG } from './dashboard-config'
import { calcMTTRMin } from './sla-core'

export interface ImpactoInputRow {
  hora_registro: Date | string
  hora_fin: Date | string | null
  estado: string
  venta_hora_soles: number | null
  tipo: string
  cluster?: string | null
  contingencia_activa?: boolean | null
}

export interface ImpactoResult {
  mttrMin: number | null
  ventaHora: number
  factorTipo: number
  factorContingencia: number
  impactoEstimado: number
}

export function calcImpactoRow(row: ImpactoInputRow): ImpactoResult {
  const mttrMin = row.estado === 'RESUELTO'
    ? calcMTTRMin(row.hora_registro, row.hora_fin)
    : null

  const ventaHora = row.venta_hora_soles
    ?? DASHBOARD_CONFIG.CLUSTER_FALLBACK_HORA[row.cluster ?? '']
    ?? DASHBOARD_CONFIG.CLUSTER_FALLBACK_HORA['D']

  const factorTipo = DASHBOARD_CONFIG.FACTOR_IMPACTO[row.tipo]
    ?? DASHBOARD_CONFIG.FACTOR_IMPACTO['OTROS']

  const factorContingencia = row.contingencia_activa
    ? DASHBOARD_CONFIG.FACTOR_CONTINGENCIA.CON_CONTINGENCIA
    : DASHBOARD_CONFIG.FACTOR_CONTINGENCIA.SIN_CONTINGENCIA

  const impactoEstimado = mttrMin != null && mttrMin > 0
    ? Math.round((mttrMin / 60) * ventaHora * factorTipo * factorContingencia * DASHBOARD_CONFIG.MARGEN_BRUTO)
    : 0

  return {
    mttrMin: mttrMin != null ? Math.round(mttrMin) : null,
    ventaHora,
    factorTipo,
    factorContingencia,
    impactoEstimado,
  }
}
