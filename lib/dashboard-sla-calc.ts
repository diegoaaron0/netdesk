import { calcSLARow } from './sla-core'

export interface RawSLARow {
  id: string
  codigo: string
  tipo: string
  hora_registro: Date | string
  hora_fin: Date | string | null
  evaluable_proveedor?: boolean | null
  prov_nombre: string | null
  tienda_codigo: string
  tienda_nombre: string | null
  hora_correo_n1: Date | string | null
  hora_primera_resp: Date | string | null   // primera respuesta de cualquier nivel
  nivel_respuesta: number | null
  max_nivel: number | null
  tiempo_estimado_solucion_min?: number | null  // ETA del proveedor (ya parseado)
  sla_respuesta_override?: number | null
  sla_resolucion_override?: number | null
}

export interface SLACaso {
  id: string
  codigo: string
  tipo: string
  dia: string
  provNombre: string
  tiendaCodigo: string
  tiendaNombre: string
  evaluable: boolean
  escaladoN2: boolean
  nivelFinal: number | null
  tPrimeraRespuestaMin: number | null
  tResolucionMin: number | null
  nivelQueRespondio: number | null
  slaRespuesta: boolean
  slaResolucion: boolean
  slaGeneral: boolean
  cumplioETA: boolean | null
  motivoIncumplimiento: string | null
}

export function calcSLACaso(row: RawSLARow): SLACaso {
  const dia = new Date(row.hora_registro).toLocaleDateString('sv-SE', { timeZone: 'America/Lima' })
  if (row.evaluable_proveedor === false) {
    return {
      id: row.id, codigo: row.codigo, tipo: row.tipo, dia,
      provNombre: row.prov_nombre ?? '—',
      tiendaCodigo: row.tienda_codigo, tiendaNombre: row.tienda_nombre ?? '',
      evaluable: false, escaladoN2: false, nivelFinal: null,
      tPrimeraRespuestaMin: null, tResolucionMin: null, nivelQueRespondio: null,
      slaRespuesta: false, slaResolucion: false, slaGeneral: false,
      cumplioETA: null, motivoIncumplimiento: null,
    }
  }
  const sla = calcSLARow({
    tipo: row.tipo,
    hora_correo_n1: row.hora_correo_n1,
    hora_primera_resp: row.hora_primera_resp,
    hora_fin: row.hora_fin,
    hora_registro: row.hora_registro,
    max_nivel: row.max_nivel,
    slaRespuestaOverride:  row.sla_respuesta_override  ?? undefined,
    slaResolucionOverride: row.sla_resolucion_override ?? undefined,
    tiempoEstimadoSolucionMin: row.tiempo_estimado_solucion_min ?? null,
  })
  return {
    id: row.id,
    codigo: row.codigo,
    tipo: row.tipo,
    dia,
    provNombre: row.prov_nombre ?? '—',
    tiendaCodigo: row.tienda_codigo,
    tiendaNombre: row.tienda_nombre ?? '',
    evaluable: sla.evaluable,
    escaladoN2: sla.escaladoN2,
    nivelFinal: sla.nivelFinal,
    tPrimeraRespuestaMin: sla.tPrimeraRespuestaMin,
    tResolucionMin: sla.tResolucionMin,
    nivelQueRespondio: row.nivel_respuesta,
    slaRespuesta: sla.slaRespuesta,
    slaResolucion: sla.slaResolucion,
    slaGeneral: sla.slaGeneral,
    cumplioETA: sla.cumplioETA,
    motivoIncumplimiento: sla.evaluable ? sla.motivoIncumplimiento : null,
  }
}

export function getEstadoSLA(slaPct: number | null): 'optimo' | 'en_riesgo' | 'critico' | 'sin_datos' {
  if (slaPct == null) return 'sin_datos'
  if (slaPct >= 90) return 'optimo'
  if (slaPct >= 70) return 'en_riesgo'
  return 'critico'
}

export function getCausaPrincipal(motivos: (string | null)[]): string | null {
  const counts: Record<string, number> = {}
  for (const m of motivos) {
    if (!m) continue
    for (const p of m.split(' + ')) {
      counts[p] = (counts[p] ?? 0) + 1
    }
  }
  if (!Object.keys(counts).length) return null
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

export interface ProvDayMetrics {
  registrados: number
  evaluables: number
  dentraSLARespuesta: number
  dentraSLAResolucion: number
  dentraSLA: number
  fueraSLA: number
  slaRespuestaPct: number | null
  slaResolucionPct: number | null
  slaPct: number | null
}

export interface DayMetrics {
  dia: string
  registrados: number
  evaluables: number
  dentraSLA: number
  fueraSLA: number
  slaPct: number | null
  slaRespuestaPct: number | null
  slaResolucionPct: number | null
  tPromRespuestaMin: number | null
  tPromResolucionMin: number | null
  nivelPromedioAlcanzado: number | null
  casosEscaladosN2: number
  proveedorMasAfectado: string | null
  causaPrincipal: string | null
  estado: 'optimo' | 'en_riesgo' | 'critico' | 'sin_datos'
  proveedoresAfectados: string[]
  porProveedor: Record<string, ProvDayMetrics>
}

export function buildDayMetrics(casos: SLACaso[]): DayMetrics[] {
  const map = new Map<string, SLACaso[]>()
  for (const c of casos) {
    if (!map.has(c.dia)) map.set(c.dia, [])
    map.get(c.dia)!.push(c)
  }

  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, arr]) => {
    const evaluables       = arr.filter((c) => c.evaluable)
    const dentraSLA        = evaluables.filter((c) => c.slaGeneral).length
    const dentraSLAResp    = evaluables.filter((c) => c.slaRespuesta).length
    const dentraSLAResol   = evaluables.filter((c) => c.slaResolucion).length
    const fueraSLA         = evaluables.length - dentraSLA

    const slaPct           = evaluables.length > 0 ? Math.round(dentraSLA        / evaluables.length * 100) : null
    const slaRespuestaPct  = evaluables.length > 0 ? Math.round(dentraSLAResp    / evaluables.length * 100) : null
    const slaResolucionPct = evaluables.length > 0 ? Math.round(dentraSLAResol   / evaluables.length * 100) : null

    const respTimes  = evaluables.filter((c) => c.tPrimeraRespuestaMin != null).map((c) => c.tPrimeraRespuestaMin!)
    const resolTimes = evaluables.filter((c) => c.tResolucionMin        != null).map((c) => c.tResolucionMin!)
    const nivelTimes = evaluables.filter((c) => c.nivelFinal            != null).map((c) => c.nivelFinal!)

    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

    const provCount: Record<string, number> = {}
    for (const c of evaluables.filter((c) => !c.slaGeneral)) {
      provCount[c.provNombre] = (provCount[c.provNombre] ?? 0) + 1
    }
    const provMasAfectado = Object.keys(provCount).length > 0
      ? Object.entries(provCount).sort((a, b) => b[1] - a[1])[0][0]
      : null

    const causaPrincipal = getCausaPrincipal(evaluables.filter((c) => !c.slaGeneral).map((c) => c.motivoIncumplimiento))

    const byProv: Record<string, SLACaso[]> = {}
    for (const c of arr) {
      if (!byProv[c.provNombre]) byProv[c.provNombre] = []
      byProv[c.provNombre].push(c)
    }
    const porProveedor: Record<string, ProvDayMetrics> = {}
    for (const [prov, casos] of Object.entries(byProv)) {
      const ev     = casos.filter((c) => c.evaluable)
      const dentro = ev.filter((c) => c.slaGeneral).length
      const resp   = ev.filter((c) => c.slaRespuesta).length
      const resol  = ev.filter((c) => c.slaResolucion).length
      porProveedor[prov] = {
        registrados: casos.length,
        evaluables: ev.length,
        dentraSLARespuesta: resp,
        dentraSLAResolucion: resol,
        dentraSLA: dentro,
        fueraSLA: ev.length - dentro,
        slaRespuestaPct:  ev.length > 0 ? Math.round(resp   / ev.length * 100) : null,
        slaResolucionPct: ev.length > 0 ? Math.round(resol  / ev.length * 100) : null,
        slaPct:           ev.length > 0 ? Math.round(dentro / ev.length * 100) : null,
      }
    }

    return {
      dia,
      registrados: arr.length,
      evaluables: evaluables.length,
      dentraSLA, fueraSLA, slaPct, slaRespuestaPct, slaResolucionPct,
      tPromRespuestaMin:  avg(respTimes),
      tPromResolucionMin: avg(resolTimes),
      nivelPromedioAlcanzado: nivelTimes.length ? Math.round(avg(nivelTimes)!) : null,
      casosEscaladosN2: evaluables.filter((c) => c.escaladoN2).length,
      proveedorMasAfectado: provMasAfectado,
      causaPrincipal,
      estado: getEstadoSLA(slaPct),
      proveedoresAfectados: [...new Set(evaluables.filter((c) => !c.slaGeneral).map((c) => c.provNombre))],
      porProveedor,
    }
  })
}

export function buildConclusiones(casos: SLACaso[], byDay: DayMetrics[]): string[] {
  const conclusiones: string[] = []
  const evaluables = casos.filter((c) => c.evaluable)
  const fueraSLA   = evaluables.filter((c) => !c.slaGeneral)

  const diasCriticos = byDay.filter((d) => d.slaPct != null && d.slaPct < 70)
  const diasRiesgo   = byDay.filter((d) => d.slaPct != null && d.slaPct >= 70 && d.slaPct < 90)

  if (diasCriticos.length === 1) {
    conclusiones.push(`El ${fmtDia(diasCriticos[0].dia)} presenta caída crítica de SLA a ${diasCriticos[0].slaPct}%.`)
  } else if (diasCriticos.length >= 2) {
    conclusiones.push(`${diasCriticos.length} fechas presentan caída crítica de SLA: ${diasCriticos.map((d) => fmtDia(d.dia)).join(', ')}.`)
  }

  if (diasRiesgo.length === 1) {
    conclusiones.push(`El ${fmtDia(diasRiesgo[0].dia)} presenta SLA en riesgo con ${diasRiesgo[0].slaPct}%.`)
  } else if (diasRiesgo.length >= 2) {
    conclusiones.push(`${diasRiesgo.length} fechas presentan SLA en riesgo: ${diasRiesgo.map((d) => fmtDia(d.dia)).join(', ')}.`)
  }

  const provCount: Record<string, number> = {}
  for (const c of fueraSLA) provCount[c.provNombre] = (provCount[c.provNombre] ?? 0) + 1
  const topProv = Object.entries(provCount).sort((a, b) => b[1] - a[1])[0]
  if (topProv) conclusiones.push(`${topProv[0]} concentra la mayor cantidad de casos fuera de SLA.`)

  const causa = getCausaPrincipal(fueraSLA.map((c) => c.motivoIncumplimiento))
  if (causa === 'Sin respuesta') {
    conclusiones.push('La principal causa de incumplimiento es falta de respuesta del proveedor.')
  } else if (causa === 'Respuesta fuera de tiempo') {
    conclusiones.push('La principal causa de incumplimiento es respuesta tardía del proveedor.')
  } else if (causa === 'Resolución fuera de tiempo') {
    conclusiones.push('La principal causa de incumplimiento es tiempo de resolución alto.')
  } else if (causa) {
    conclusiones.push(`La principal causa de incumplimiento es: ${causa}.`)
  }

  if (topProv && topProv[1] >= 2) {
    conclusiones.push(`Se recomienda priorizar seguimiento contractual con ${topProv[0]}.`)
  }

  return conclusiones
}

function fmtDia(dia: string) {
  const d = new Date(dia + 'T12:00:00')
  return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })
}
