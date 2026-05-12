import type {
  PuntoTendencia, ChartMes, ResumenProveedor, MesCritico,
  SLATrendResumenGlobal, SLATendenciaEstado, EstadoTendencia,
} from '@/types/sla-trend'

export interface RawSLATrendRow {
  id: string
  tipo: string
  hora_registro: Date | string
  hora_fin: Date | string | null
  proveedor_id: string | null
  prov_nombre: string | null
  hora_correo_n1: Date | string | null
  hora_primera_resp: Date | string | null
  max_nivel: number | null
}

const SLA_RESP_MIN = 60
const SLA_RESOLUCION_POR_TIPO: Record<string, number> = {
  CAIDA_TOTAL: 240, INTERMITENCIA: 480, LENTITUD: 720, POS: 240, OTROS: 240,
}
const MES_LABELS: Record<number, string> = {
  1: 'Ene', 2: 'Feb', 3: 'Mar', 4: 'Abr', 5: 'May', 6: 'Jun',
  7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Oct', 11: 'Nov', 12: 'Dic',
}

function getMesKey(hora: Date | string): string {
  const d = new Date(hora)
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`
}

export function getMesLabel(key: string): string {
  const [year, month] = key.split('-')
  return `${MES_LABELS[parseInt(month)]} ${year}`
}

function toMs(v: Date | string | null): number | null {
  if (!v) return null; return new Date(v).getTime()
}
function diffMin(a: Date | string | null, b: Date | string | null): number | null {
  const ma = toMs(a); const mb = toMs(b)
  if (ma == null || mb == null) return null
  return (ma - mb) / 60000
}
function avg(vals: number[]): number | null {
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}

function calcRow(row: RawSLATrendRow) {
  const evaluable = row.hora_correo_n1 != null && row.max_nivel != null && row.max_nivel >= 1
  if (!evaluable) return { evaluable: false, escaladoN2: false, slaGeneral: false, tPrimeraRespuestaMin: null as number | null, tResolucionMin: null as number | null }
  const escaladoN2 = (row.max_nivel ?? 0) >= 2
  const tResp = diffMin(row.hora_primera_resp, row.hora_correo_n1)
  const tResol = diffMin(row.hora_fin, row.hora_correo_n1)
  const slaResolucionObj = SLA_RESOLUCION_POR_TIPO[row.tipo] ?? 240
  const slaRespuesta = !escaladoN2 && tResp != null && tResp <= SLA_RESP_MIN
  const slaResolucion = tResol != null && tResol <= slaResolucionObj
  return {
    evaluable: true, escaladoN2, slaGeneral: slaRespuesta && slaResolucion,
    tPrimeraRespuestaMin: tResp != null ? Math.round(tResp) : null,
    tResolucionMin: tResol != null ? Math.round(tResol) : null,
  }
}

function getEstado(slaPct: number | null): SLATendenciaEstado {
  if (slaPct == null) return 'critico'
  if (slaPct >= 90) return 'optimo'
  if (slaPct >= 70) return 'revisar'
  return 'critico'
}

function checkConsecutivos(puntos: PuntoTendencia[], pred: (p: PuntoTendencia) => boolean, n: number): boolean {
  let c = 0
  for (const p of puntos) { if (pred(p)) { c++; if (c >= n) return true } else c = 0 }
  return false
}

// ─── Main build function ──────────────────────────────────────────────────────

export function buildTendencia(allRows: RawSLATrendRow[]) {
  // Group by (mesKey, proveedor)
  const groupMap = new Map<string, RawSLATrendRow[]>()
  for (const row of allRows) {
    if (!row.prov_nombre) continue
    const key = `${getMesKey(row.hora_registro)}|${row.prov_nombre}`
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(row)
  }

  const mesesSet = new Set<string>()
  const provSet  = new Set<string>()
  for (const key of groupMap.keys()) {
    const [mes, prov] = key.split('|')
    mesesSet.add(mes); provSet.add(prov)
  }
  const meses      = Array.from(mesesSet).sort()
  const proveedores = Array.from(provSet).sort()

  // Build puntos (without variacionPP first)
  const puntosRaw: (PuntoTendencia & { variacionPP: null })[] = []
  for (const mesKey of meses) {
    for (const prov of proveedores) {
      const rows = groupMap.get(`${mesKey}|${prov}`)
      if (!rows?.length) continue
      const calcs     = rows.map(calcRow)
      const evs       = calcs.filter((c) => c.evaluable)
      const dentraSLA = evs.filter((c) => c.slaGeneral).length
      const slaPct    = evs.length > 0 ? Math.round((dentraSLA / evs.length) * 100) : null
      const respTimes = evs.map((c) => c.tPrimeraRespuestaMin).filter((v): v is number => v != null)
      const resolTimes = evs.map((c) => c.tResolucionMin).filter((v): v is number => v != null)
      puntosRaw.push({
        mesKey, mesLabel: getMesLabel(mesKey), proveedor: prov,
        evaluables: evs.length, dentraSLA, fueraSLA: evs.length - dentraSLA,
        slaPct, variacionPP: null,
        tPromRespuestaMin: avg(respTimes), tPromResolucionMin: avg(resolTimes),
        escaladosN2: evs.filter((c) => c.escaladoN2).length,
        estado: getEstado(slaPct),
      })
    }
  }

  // Add variacionPP
  const puntos: PuntoTendencia[] = puntosRaw.map((p) => {
    const mesIdx = meses.indexOf(p.mesKey)
    const prevMes = mesIdx > 0 ? meses[mesIdx - 1] : null
    if (!prevMes) return { ...p, variacionPP: null }
    const prev = puntosRaw.find((pp) => pp.mesKey === prevMes && pp.proveedor === p.proveedor)
    if (prev?.slaPct == null || p.slaPct == null) return { ...p, variacionPP: null }
    return { ...p, variacionPP: p.slaPct - prev.slaPct }
  })

  // chartData pivoted by month
  const chartData: ChartMes[] = meses.map((mesKey) => {
    const entry: ChartMes = { mesKey, mesLabel: getMesLabel(mesKey) }
    for (const prov of proveedores) {
      const p = puntos.find((pp) => pp.mesKey === mesKey && pp.proveedor === prov)
      entry[prov] = p?.slaPct ?? null
      if (p) {
        entry[`${prov}_eval`]   = p.evaluables
        entry[`${prov}_fuera`]  = p.fueraSLA
        entry[`${prov}_tResp`]  = p.tPromRespuestaMin
        entry[`${prov}_tResol`] = p.tPromResolucionMin
        entry[`${prov}_estado`] = p.estado
        entry[`${prov}_varPP`]  = p.variacionPP
      }
    }
    return entry
  })

  // Resumen por proveedor
  const resumenProveedores: ResumenProveedor[] = proveedores.map((prov) => {
    const pp = puntos.filter((p) => p.proveedor === prov)
    const slaVals = pp.map((p) => p.slaPct).filter((v): v is number => v != null)
    const slaPromedio = avg(slaVals)
    const sorted = [...pp].filter((p) => p.slaPct != null)
    const mejorP = [...sorted].sort((a, b) => b.slaPct! - a.slaPct!)[0]
    const peorP  = [...sorted].sort((a, b) => a.slaPct! - b.slaPct!)[0]
    const first = sorted[0]; const last = sorted[sorted.length - 1]
    const variacionTotal = first?.slaPct != null && last?.slaPct != null ? last.slaPct - first.slaPct : null
    const mesesBajoMeta  = sorted.filter((p) => p.slaPct! < 90).length

    let estadoTendencia: EstadoTendencia = 'Revisar'
    if (checkConsecutivos(pp, (p) => p.slaPct != null && p.slaPct < 70, 3)) {
      estadoTendencia = 'Crítico sostenido'
    } else if (checkConsecutivos(pp.slice(-3), (p) => (p.variacionPP ?? 0) > 0, 3)) {
      estadoTendencia = 'En mejora'
    } else if (last?.slaPct != null && last.slaPct >= 90 && (variacionTotal ?? 0) >= 0) {
      estadoTendencia = 'Estable / Positiva'
    } else if ((variacionTotal ?? 0) < -5) {
      estadoTendencia = 'Empeorando'
    } else if ((variacionTotal ?? 0) > 5) {
      estadoTendencia = 'En mejora'
    }

    return {
      proveedor: prov, slaPromedio,
      mejorMes: mejorP?.mesLabel ?? null, mejorMesSLA: mejorP?.slaPct ?? null,
      peorMes: peorP?.mesLabel ?? null, peorMesSLA: peorP?.slaPct ?? null,
      variacionTotal, mesesBajoMeta, estadoTendencia,
    }
  })

  // Meses críticos
  const mesCriticos: MesCritico[] = puntos
    .filter((p) => (p.slaPct != null && p.slaPct < 70) || (p.variacionPP != null && p.variacionPP <= -10))
    .map((p) => {
      let causa = 'Múltiples factores de incumplimiento'
      if (p.escaladosN2 > 0 && p.evaluables > 0 && p.escaladosN2 / p.evaluables > 0.4)
        causa = 'Escalamiento frecuente a N2'
      else if (p.tPromResolucionMin != null && p.tPromResolucionMin > 480)
        causa = 'T. resolución elevado'
      else if (p.tPromRespuestaMin != null && p.tPromRespuestaMin > 120)
        causa = 'Demora en respuesta N1'
      else if (p.variacionPP != null && p.variacionPP <= -10)
        causa = 'Caída brusca de SLA'
      const rec = causa.includes('Escalamiento') ? 'Validar contactos N1 y tiempos de escalamiento'
        : causa.includes('resolución') ? `Reforzar soporte técnico y monitoreo con ${p.proveedor}`
        : causa.includes('respuesta') ? `Revisar atención N1 de ${p.proveedor}`
        : `Revisar contractualmente con ${p.proveedor}`
      return { mesKey: p.mesKey, mesLabel: p.mesLabel, proveedor: p.proveedor, slaPct: p.slaPct, fueraSLA: p.fueraSLA, variacionPP: p.variacionPP, causaPrincipal: causa, recomendacion: rec }
    })

  // Resumen global
  const resumenGlobal = buildResumenGlobal(puntos, resumenProveedores)

  // Conclusiones
  const conclusiones = buildConclusiones(puntos, resumenProveedores)

  return { puntos, chartData, resumenProveedores, mesCriticos, resumenGlobal, conclusiones, proveedoresEnGrafico: proveedores }
}

// ─── Resumen global ───────────────────────────────────────────────────────────

function buildResumenGlobal(puntos: PuntoTendencia[], resumen: ResumenProveedor[]): SLATrendResumenGlobal {
  const conSLA = resumen.filter((r) => r.slaPromedio != null)
  const mejorP = [...conSLA].sort((a, b) => b.slaPromedio! - a.slaPromedio!)[0]
  const peorP  = [...conSLA].sort((a, b) => a.slaPromedio! - b.slaPromedio!)[0]

  const slaVals = puntos.map((p) => p.slaPct).filter((v): v is number => v != null)
  const slaPromedioGlobal = slaVals.length ? Math.round(slaVals.reduce((a, b) => a + b, 0) / slaVals.length) : null

  // Mes más crítico
  const byMes = new Map<string, { label: string; vals: number[] }>()
  for (const p of puntos) {
    if (!byMes.has(p.mesKey)) byMes.set(p.mesKey, { label: p.mesLabel, vals: [] })
    if (p.slaPct != null) byMes.get(p.mesKey)!.vals.push(p.slaPct)
  }
  let mesMasCriticoLabel: string | null = null
  let mesMasCriticoSLA: number | null = null
  for (const { label, vals } of byMes.values()) {
    if (!vals.length) continue
    const prom = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    if (mesMasCriticoSLA == null || prom < mesMasCriticoSLA) { mesMasCriticoLabel = label; mesMasCriticoSLA = prom }
  }

  // Mayor caída mensual
  let mayorCaidaProveedor: string | null = null
  let mayorCaidaMesLabel: string | null = null
  let mayorCaidaPP: number | null = null
  for (const p of puntos) {
    if (p.variacionPP != null && (mayorCaidaPP == null || p.variacionPP < mayorCaidaPP)) {
      mayorCaidaPP = p.variacionPP; mayorCaidaProveedor = p.proveedor; mayorCaidaMesLabel = p.mesLabel
    }
  }

  return {
    mejorProveedor: mejorP?.proveedor ?? null, mejorProveedorPP: mejorP?.variacionTotal ?? null,
    peorProveedor: peorP?.proveedor ?? null, peorProveedorPP: peorP?.variacionTotal ?? null,
    slaPromedioGlobal, mesMasCriticoLabel, mesMasCriticoSLA,
    mayorCaidaProveedor, mayorCaidaMesLabel, mayorCaidaPP,
    proveedoresBajoMeta: resumen.filter((r) => r.slaPromedio != null && r.slaPromedio < 90).length,
    totalProveedores: resumen.length,
  }
}

// ─── Conclusiones ─────────────────────────────────────────────────────────────

function buildConclusiones(puntos: PuntoTendencia[], resumen: ResumenProveedor[]): string[] {
  const out: string[] = []
  const proveedores = Array.from(new Set(puntos.map((p) => p.proveedor)))

  const peor = [...resumen].filter((r) => r.slaPromedio != null).sort((a, b) => a.slaPromedio! - b.slaPromedio!)[0]
  if (peor) out.push(`${peor.proveedor} presenta la peor tendencia SLA del período.`)

  for (const p of puntos) {
    if (p.variacionPP != null && p.variacionPP <= -10)
      out.push(`${p.proveedor} tuvo una caída significativa de SLA en ${p.mesLabel} (${p.variacionPP} pp).`)
  }

  for (const prov of proveedores) {
    const pp = puntos.filter((p) => p.proveedor === prov)
    const mesesBajo = pp.filter((p) => p.slaPct != null && p.slaPct < 90).length
    if (checkConsecutivos(pp, (p) => p.slaPct != null && p.slaPct < 90, 3))
      out.push(`${prov} mantiene incumplimiento sostenido de SLA por ${mesesBajo} meses consecutivos.`)
  }

  for (const prov of proveedores) {
    const pp = puntos.filter((p) => p.proveedor === prov)
    if (checkConsecutivos(pp.slice(-3), (p) => (p.variacionPP ?? 0) > 0, 3))
      out.push(`${prov} muestra mejora sostenida en los últimos 3 meses.`)
  }

  for (const r of resumen) {
    if (r.estadoTendencia === 'Crítico sostenido')
      out.push(`Se recomienda revisión contractual y plan de mejora con ${r.proveedor}.`)
    else if (r.estadoTendencia === 'En mejora' || r.estadoTendencia === 'Estable / Positiva')
      out.push(`Se recomienda mantener seguimiento y documentar acciones que mejoraron el SLA de ${r.proveedor}.`)
  }

  return out.slice(0, 8)
}
