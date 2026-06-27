// Estado de vencimiento de un contrato/ficha — fuente única de verdad.
// Umbrales: ≤ 7 días = urgente, ≤ 30 días = por vencer.
// Funciona en server (API) y client (UI). Sin imports: puras funciones de fecha.

export type EstadoContrato =
  | 'VIGENTE'
  | 'POR_VENCER'
  | 'POR_VENCER_URGENTE'
  | 'VENCIDO'
  | 'SIN_FECHA'

export type CategoriaContrato = 'ACTIVA' | 'POR_VENCER' | 'VENCIDA' | 'SIN_FECHA'

const DIA_MS = 24 * 60 * 60 * 1000
export const DIAS_POR_VENCER = 30
export const DIAS_URGENTE = 7

/** Días hasta el vencimiento. Negativo = ya vencido. null = sin fecha. */
export function diasParaVencer(fechaFin: string | Date | null | undefined): number | null {
  if (!fechaFin) return null
  const fin = new Date(fechaFin)
  if (isNaN(fin.getTime())) return null
  return Math.ceil((fin.getTime() - Date.now()) / DIA_MS)
}

export function calcEstadoContrato(fechaFin: string | Date | null | undefined): EstadoContrato {
  const dias = diasParaVencer(fechaFin)
  if (dias === null) return 'SIN_FECHA'
  if (dias < 0) return 'VENCIDO'
  if (dias <= DIAS_URGENTE) return 'POR_VENCER_URGENTE'
  if (dias <= DIAS_POR_VENCER) return 'POR_VENCER'
  return 'VIGENTE'
}

/** Agrupa el estado en las 3 categorías de filtro (+ sin fecha). */
export function categoriaContrato(estado: EstadoContrato): CategoriaContrato {
  if (estado === 'VIGENTE') return 'ACTIVA'
  if (estado === 'VENCIDO') return 'VENCIDA'
  if (estado === 'SIN_FECHA') return 'SIN_FECHA'
  return 'POR_VENCER' // POR_VENCER + POR_VENCER_URGENTE
}

/** Etiqueta + colores para el badge en la UI. */
export function metaEstadoContrato(estado: EstadoContrato): { label: string; bg: string; color: string } {
  switch (estado) {
    case 'VIGENTE':            return { label: 'Activa',      bg: '#d1fae5', color: '#065f46' }
    case 'POR_VENCER':         return { label: 'Por vencer',  bg: '#fef3c7', color: '#92400e' }
    case 'POR_VENCER_URGENTE': return { label: 'Por vencer',  bg: '#ffedd5', color: '#c2410c' }
    case 'VENCIDO':            return { label: 'Vencida',     bg: '#fee2e2', color: '#b91c1c' }
    default:                   return { label: 'Sin fecha',   bg: '#f3f4f6', color: '#6b7280' }
  }
}
