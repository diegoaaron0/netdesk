import { DASHBOARD_CONFIG } from './dashboard-config'

/** Retorna null si no hay dato de venta ni fallback de cluster conocido. */
export function getVentaHoraEstimadaOrNull(
  tiendaCodigo: string,
  diaSemana: number,
  ventaHoraSoles: number | null,
  cluster: string | null,
  ventasDiarias: Array<{ tienda_codigo: string; dia_semana: number; venta_hora_promedio: number }>,
): number | null {
  const match = ventasDiarias.find(
    (v) => v.tienda_codigo === tiendaCodigo && Number(v.dia_semana) === diaSemana,
  )
  if (match) return Number(match.venta_hora_promedio)
  if (ventaHoraSoles != null) return Number(ventaHoraSoles)
  if (cluster != null) {
    const isFDS = diaSemana === 0 || diaSemana === 5 || diaSemana === 6
    const fb = isFDS
      ? DASHBOARD_CONFIG.CLUSTER_FALLBACK_HORA_FDS[cluster]
      : DASHBOARD_CONFIG.CLUSTER_FALLBACK_HORA[cluster]
    if (fb != null) return fb
  }
  return null
}


export function parseSlaMinutos(tiempoRespSev1: string | null | undefined): number | null {
  if (!tiempoRespSev1) return null
  const n = Number(tiempoRespSev1)
  if (!isNaN(n) && n > 0) return n
  const hMatch = tiempoRespSev1.match(/(\d+)\s*h/)
  const mMatch = tiempoRespSev1.match(/(\d+)\s*m/)
  const h = hMatch ? parseInt(hMatch[1]) : 0
  const m = mMatch ? parseInt(mMatch[1]) : 0
  if (h > 0 || m > 0) return h * 60 + m
  // Try HH:MM format
  const colonMatch = tiempoRespSev1.match(/^(\d+):(\d+)$/)
  if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2])
  return null
}

export function getSLACumplido(
  tiempoRespuestaMin: number | null,
  horaRespuesta: unknown,
  slaMinutos: number | null,
): boolean {
  if (!horaRespuesta) return false
  if (slaMinutos == null || tiempoRespuestaMin == null) return false
  return tiempoRespuestaMin <= slaMinutos
}

export interface ScoreMetricas {
  costo: number
  slaPct: number
  mttrMinutos: number
  reincidenciaTiendas: number
  incidentes: number
}

export interface ScoreMaximos {
  costo: number
  mttrMinutos: number
  reincidenciaTiendas: number
  incidentes: number
}

export function getScoreProveedor(
  metricas: ScoreMetricas,
  maximos: ScoreMaximos,
): { score: number; breakdown: Record<string, number> } {
  const p = DASHBOARD_CONFIG.SCORE_PROVEEDOR_PESOS

  const normCosto = maximos.costo > 0 ? (metricas.costo / maximos.costo) * 100 : 0
  const normSla   = 100 - metricas.slaPct
  const normMttr  = maximos.mttrMinutos > 0 ? (metricas.mttrMinutos / maximos.mttrMinutos) * 100 : 0
  const normReinc = maximos.reincidenciaTiendas > 0 ? (metricas.reincidenciaTiendas / maximos.reincidenciaTiendas) * 100 : 0
  const normInc   = maximos.incidentes > 0 ? (metricas.incidentes / maximos.incidentes) * 100 : 0

  const breakdown = {
    costo:       Math.round(normCosto * p.costo),
    sla:         Math.round(normSla * p.sla),
    mttr:        Math.round(normMttr * p.mttr),
    reincidencia: Math.round(normReinc * p.reincidencia),
    incidentes:  Math.round(normInc * p.incidentes),
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0)
  return { score, breakdown }
}
