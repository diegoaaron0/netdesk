export interface SlaDisplay {
  texto: string
  subTexto: string
  color: string
  bg: string
  score: number | null
}

export function fmtSLA(params: {
  score: number | null
  tRealMin: number | null
  tLimiteMin: number | null
  label?: string
}): SlaDisplay {
  const { score, tRealMin, tLimiteMin, label = 'Efic.' } = params

  if (score == null) return {
    texto: '—', subTexto: 'Sin datos evaluables',
    color: '#6B7280', bg: '#F9FAFB', score: null,
  }

  const fmtMin = (m: number) => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
  const subTexto = tRealMin != null && tLimiteMin != null
    ? `${fmtMin(tRealMin)} / límite ${fmtMin(tLimiteMin)}`
    : ''

  if (score >= 70) return { texto: `${label} ${score}%`, subTexto, color: '#15803D', bg: '#F0FDF4', score }
  if (score >= 40) return { texto: `${label} ${score}%`, subTexto, color: '#B45309', bg: '#FFFBEB', score }
  return { texto: `${label} ${score}%`, subTexto, color: '#B91C1C', bg: '#FEF2F2', score }
}

export function fmtSLARespResol(params: {
  scoreResp: number | null
  scoreResol: number | null
  tRespMin: number | null
  tResolMin: number | null
  limiteRespMin: number
  limiteResolMin: number
}): { respuesta: SlaDisplay; resolucion: SlaDisplay } {
  return {
    respuesta:  fmtSLA({ score: params.scoreResp,  tRealMin: params.tRespMin,  tLimiteMin: params.limiteRespMin,  label: 'Resp.' }),
    resolucion: fmtSLA({ score: params.scoreResol, tRealMin: params.tResolMin, tLimiteMin: params.limiteResolMin, label: 'Resol.' }),
  }
}
