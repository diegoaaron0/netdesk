import { calcSLARow } from './sla-core'

export interface RawSLARow {
  id: string
  codigo: string
  tipo: string
  hora_registro: Date | string
  hora_fin: Date | string | null
  prov_nombre: string | null
  tienda_codigo: string
  tienda_nombre: string | null
  hora_correo_n1: Date | string | null
  hora_primera_resp: Date | string | null
  nivel_respuesta: number | null
  max_nivel: number | null
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
  tPrimeraRespuestaMin: number | null
  tResolucionMin: number | null
  nivelQueRespondio: number | null
  slaRespuesta: boolean
  slaResolucion: boolean
  slaGeneral: boolean
  motivoIncumplimiento: string | null
}

export function getMotivoIncumplimiento(
  slaRespuesta: boolean,
  slaResolucion: boolean,
  escaladoN2: boolean,
): string | null {
  if (slaRespuesta && slaResolucion) return null
  const parts: string[] = []
  if (!slaRespuesta) parts.push(escaladoN2 ? 'Nivel 1 sin respuesta' : 'Respuesta fuera de tiempo')
  if (!slaResolucion) parts.push('Resolución fuera de tiempo')
  return parts.join(' + ') || null
}

export function calcSLACaso(row: RawSLARow): SLACaso {
  const dia = new Date(row.hora_registro).toLocaleDateString('sv-SE', { timeZone: 'America/Lima' })
  const sla = calcSLARow({
    tipo: row.tipo,
    hora_correo_n1: row.hora_correo_n1,
    hora_primera_resp: row.hora_primera_resp,
    hora_fin: row.hora_fin,
    max_nivel: row.max_nivel,
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
    tPrimeraRespuestaMin: sla.tPrimeraRespuestaMin,
    tResolucionMin: sla.tResolucionMin,
    nivelQueRespondio: row.nivel_respuesta,
    slaRespuesta: sla.slaRespuesta,
    slaResolucion: sla.slaResolucion,
    slaGeneral: sla.slaGeneral,
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
    // Check individual parts
    const parts = m.split(' + ')
    for (const p of parts) {
      counts[p] = (counts[p] ?? 0) + 1
    }
  }
  if (!Object.keys(counts).length) return null
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  return top
}

export interface DayMetrics {
  dia: string
  registrados: number
  evaluables: number
  dentraSLA: number
  fueraSLA: number
  slaPct: number | null
  tPromRespuestaMin: number | null
  tPromResolucionMin: number | null
  nivelPromedioAlcanzado: number | null
  casosEscaladosN2: number
  proveedorMasAfectado: string | null
  causaPrincipal: string | null
  estado: 'optimo' | 'en_riesgo' | 'critico' | 'sin_datos'
}

export function buildDayMetrics(casos: SLACaso[]): DayMetrics[] {
  const map = new Map<string, SLACaso[]>()
  for (const c of casos) {
    if (!map.has(c.dia)) map.set(c.dia, [])
    map.get(c.dia)!.push(c)
  }

  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, arr]) => {
    const evaluables = arr.filter((c) => c.evaluable)
    const dentraSLA = evaluables.filter((c) => c.slaGeneral).length
    const fueraSLA = evaluables.length - dentraSLA

    const slaPct = evaluables.length > 0
      ? Math.round(dentraSLA / evaluables.length * 100)
      : null

    const respTimes = evaluables.filter((c) => c.tPrimeraRespuestaMin != null).map((c) => c.tPrimeraRespuestaMin!)
    const resolTimes = evaluables.filter((c) => c.tResolucionMin != null).map((c) => c.tResolucionMin!)
    const nivelTimes = evaluables.filter((c) => c.nivelQueRespondio != null).map((c) => c.nivelQueRespondio!)

    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

    // Proveedor más afectado = proveedor con más casos fuera SLA
    const provCount: Record<string, number> = {}
    for (const c of evaluables.filter((c) => !c.slaGeneral)) {
      provCount[c.provNombre] = (provCount[c.provNombre] ?? 0) + 1
    }
    const provMasAfectado = Object.keys(provCount).length > 0
      ? Object.entries(provCount).sort((a, b) => b[1] - a[1])[0][0]
      : null

    const motivos = evaluables.filter((c) => !c.slaGeneral).map((c) => c.motivoIncumplimiento)
    const causaPrincipal = getCausaPrincipal(motivos)

    return {
      dia,
      registrados: arr.length,
      evaluables: evaluables.length,
      dentraSLA,
      fueraSLA,
      slaPct,
      tPromRespuestaMin: avg(respTimes),
      tPromResolucionMin: avg(resolTimes),
      nivelPromedioAlcanzado: nivelTimes.length ? Math.round(avg(nivelTimes)!) : null,
      casosEscaladosN2: evaluables.filter((c) => c.escaladoN2).length,
      proveedorMasAfectado: provMasAfectado,
      causaPrincipal,
      estado: getEstadoSLA(slaPct),
    }
  })
}

export function buildConclusiones(casos: SLACaso[], byDay: DayMetrics[]): string[] {
  const conclusiones: string[] = []
  const evaluables = casos.filter((c) => c.evaluable)
  const fueraSLA = evaluables.filter((c) => !c.slaGeneral)

  // Regla 1: fechas críticas
  for (const d of byDay) {
    if (d.slaPct == null) continue
    if (d.slaPct < 70) {
      conclusiones.push(`El ${fmtDia(d.dia)} presenta caída crítica de SLA a ${d.slaPct}%.`)
    } else if (d.slaPct < 90) {
      conclusiones.push(`El ${fmtDia(d.dia)} presenta SLA en riesgo con ${d.slaPct}%.`)
    }
  }

  // Regla 2: proveedor con más incumplimientos
  const provCount: Record<string, number> = {}
  for (const c of fueraSLA) provCount[c.provNombre] = (provCount[c.provNombre] ?? 0) + 1
  const topProv = Object.entries(provCount).sort((a, b) => b[1] - a[1])[0]
  if (topProv) conclusiones.push(`${topProv[0]} concentra la mayor cantidad de casos fuera de SLA.`)

  // Regla 3: causa principal del período
  const causa = getCausaPrincipal(fueraSLA.map((c) => c.motivoIncumplimiento))
  if (causa === 'Nivel 1 sin respuesta') {
    conclusiones.push('La principal causa de incumplimiento es falta de respuesta en Nivel 1.')
  } else if (causa === 'Resolución fuera de tiempo') {
    conclusiones.push('La principal causa de incumplimiento es tiempo de resolución alto.')
  } else if (causa === 'Escalamiento tardío') {
    conclusiones.push('La principal causa es demora en el proceso de escalamiento.')
  } else if (causa) {
    conclusiones.push(`La principal causa de incumplimiento es: ${causa}.`)
  }

  // Regla 4: recomendación
  if (causa === 'Nivel 1 sin respuesta') {
    conclusiones.push('Se recomienda revisar el cumplimiento de atención Nivel 1 con el proveedor.')
  } else if (causa === 'Resolución fuera de tiempo') {
    conclusiones.push('Se recomienda revisar tiempos de solución y capacidad de respuesta técnica del proveedor.')
  } else if (causa === 'Escalamiento tardío') {
    conclusiones.push('Se recomienda ajustar el flujo de escalamiento y alertas internas.')
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
