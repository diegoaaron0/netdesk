import type {
  ProveedorSLAResumen, ProveedorSLATiempos, ProveedorSLANiveles,
  CasoFueraSLA, SLAEstado,
} from '@/types/provider-sla-compliance'
import { calcSLARow, SLA_RESPUESTA_MIN } from './sla-core'

export interface RawSLAProvRow {
  id: string
  codigo: string
  tipo: string
  hora_registro: Date | string
  hora_fin: Date | string | null
  evaluable_proveedor?: boolean | null
  proveedor_id: string | null
  prov_nombre: string | null
  tienda_codigo: string
  tienda_nombre: string | null
  hora_correo_n1: Date | string | null
  hora_primera_resp: Date | string | null
  nivel_respuesta: number | null
  max_nivel: number | null
}

function avg(vals: number[]): number | null {
  return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}
function topEntry(counts: Record<number, number>): number | null {
  const entries = Object.entries(counts)
  if (!entries.length) return null
  return Number(entries.sort((a, b) => b[1] - a[1])[0][0])
}

function calcRow(row: RawSLAProvRow) {
  if (row.evaluable_proveedor === false) {
    return {
      evaluable: false, slaGeneral: false, slaRespuesta: false, slaResolucion: false,
      escaladoN2: false,
      tPrimeraRespuestaMin: null as number | null,
      tResolucionMin: null as number | null,
      motivoIncumplimiento: null as string | null,
      slaResolucionObj: null as number | null,
      nivelQueRespondio: null as number | null,
    }
  }
  const sla = calcSLARow({
    tipo: row.tipo,
    hora_correo_n1: row.hora_correo_n1,
    hora_primera_resp: row.hora_primera_resp,
    hora_fin: row.hora_fin,
    max_nivel: row.max_nivel,
  })
  return { ...sla, nivelQueRespondio: row.nivel_respuesta }
}

export function getEstadoSLAProv(slaPct: number | null): SLAEstado {
  if (slaPct == null) return 'critico'
  if (slaPct >= 90) return 'optimo'
  if (slaPct >= 70) return 'revisar'
  return 'critico'
}

export function buildProveedorResumen(rows: RawSLAProvRow[]): ProveedorSLAResumen[] {
  const map = new Map<string, { rows: RawSLAProvRow[]; nombre: string }>()
  for (const row of rows) {
    if (!row.proveedor_id) continue
    if (!map.has(row.proveedor_id)) map.set(row.proveedor_id, { rows: [], nombre: row.prov_nombre ?? '—' })
    map.get(row.proveedor_id)!.rows.push(row)
  }

  const result: ProveedorSLAResumen[] = []
  for (const [provId, { rows: pRows, nombre }] of map.entries()) {
    const calcs = pRows.map(calcRow)
    const evaluables = calcs.filter((c) => c.evaluable)
    const dentraSLA = evaluables.filter((c) => c.slaGeneral).length
    const fueraSLA  = evaluables.length - dentraSLA
    const slaPct    = evaluables.length > 0 ? Math.round((dentraSLA / evaluables.length) * 100) : null
    const casosEscaladosN2 = evaluables.filter((c) => c.escaladoN2).length

    const respTimes = evaluables.filter((c) => c.tPrimeraRespuestaMin != null).map((c) => c.tPrimeraRespuestaMin!)
    const resolTimes = evaluables.filter((c) => c.tResolucionMin != null).map((c) => c.tResolucionMin!)

    const nivelCounts: Record<number, number> = {}
    for (const c of evaluables) {
      if (c.nivelQueRespondio != null) nivelCounts[c.nivelQueRespondio] = (nivelCounts[c.nivelQueRespondio] ?? 0) + 1
    }

    const fueraPorResp  = evaluables.filter((c) => !c.slaRespuesta).length
    const fueraPorResol = evaluables.filter((c) => !c.slaResolucion).length
    let motivoPrincipal: string | null = null
    if (fueraPorResp > 0 && fueraPorResol > 0) motivoPrincipal = 'Respuesta y resolución fuera de objetivo'
    else if (fueraPorResp > 0) motivoPrincipal = 'Falta de respuesta en Nivel 1'
    else if (fueraPorResol > 0) motivoPrincipal = 'Tiempo de resolución elevado'

    result.push({
      proveedorId: provId,
      nombre,
      evaluables: evaluables.length,
      dentraSLA,
      fueraSLA,
      slaPct,
      tPromRespuestaMin: avg(respTimes),
      tPromResolucionMin: avg(resolTimes),
      casosEscaladosN2,
      nivelMasFrecuente: topEntry(nivelCounts),
      estado: getEstadoSLAProv(slaPct),
      motivoPrincipal,
    })
  }

  return result.sort((a, b) => (a.slaPct ?? 0) - (b.slaPct ?? 0))
}

export function buildTiemposTable(rows: RawSLAProvRow[]): ProveedorSLATiempos[] {
  const map = new Map<string, { rows: RawSLAProvRow[]; nombre: string }>()
  for (const row of rows) {
    if (!row.proveedor_id) continue
    if (!map.has(row.proveedor_id)) map.set(row.proveedor_id, { rows: [], nombre: row.prov_nombre ?? '—' })
    map.get(row.proveedor_id)!.rows.push(row)
  }

  const result: ProveedorSLATiempos[] = []
  for (const [, { rows: pRows, nombre }] of map.entries()) {
    const calcs = pRows.map(calcRow)
    const evaluables = calcs.filter((c) => c.evaluable)

    const respTimes  = evaluables.filter((c) => c.tPrimeraRespuestaMin != null).map((c) => c.tPrimeraRespuestaMin!)
    const resolTimes = evaluables.filter((c) => c.tResolucionMin != null).map((c) => c.tResolucionMin!)
    const objTimes   = evaluables.map((c) => c.slaResolucionObj)

    const fueraSLAPorRespuesta  = evaluables.filter((c) => !c.slaRespuesta && c.slaResolucion).length
    const fueraSLAPorResolucion = evaluables.filter((c) => c.slaRespuesta && !c.slaResolucion).length
    const fueraSLAPorAmbos      = evaluables.filter((c) => !c.slaRespuesta && !c.slaResolucion).length

    result.push({
      nombre,
      slaRespuestaObj: SLA_RESPUESTA_MIN,
      tRespuestaRealProm: avg(respTimes),
      slaResolucionObjProm: avg(objTimes),
      tResolucionRealProm: avg(resolTimes),
      fueraSLAPorRespuesta,
      fueraSLAPorResolucion,
      fueraSLAPorAmbos,
    })
  }

  return result.sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export function buildNivelesTable(rows: RawSLAProvRow[]): ProveedorSLANiveles[] {
  const map = new Map<string, { rows: RawSLAProvRow[]; nombre: string }>()
  for (const row of rows) {
    if (!row.proveedor_id) continue
    if (!map.has(row.proveedor_id)) map.set(row.proveedor_id, { rows: [], nombre: row.prov_nombre ?? '—' })
    map.get(row.proveedor_id)!.rows.push(row)
  }

  const result: ProveedorSLANiveles[] = []
  for (const [, { rows: pRows, nombre }] of map.entries()) {
    const calcs = pRows.map(calcRow)
    const evaluables = calcs.filter((c) => c.evaluable)

    const respondioN1 = evaluables.filter((c) => c.nivelQueRespondio === 1).length
    const respondioN2 = evaluables.filter((c) => c.nivelQueRespondio === 2).length
    const respondioN3 = evaluables.filter((c) => c.nivelQueRespondio === 3).length
    const respondioN4 = evaluables.filter((c) => c.nivelQueRespondio != null && c.nivelQueRespondio >= 4).length
    const sinRespuesta = evaluables.filter((c) => c.nivelQueRespondio == null).length

    const nivelCounts: Record<number, number> = {}
    for (const c of evaluables) {
      if (c.nivelQueRespondio != null) nivelCounts[c.nivelQueRespondio] = (nivelCounts[c.nivelQueRespondio] ?? 0) + 1
    }
    const nivelMasUsado = topEntry(nivelCounts)

    const llegaron2 = evaluables.filter((c) => c.escaladoN2).length
    const pctLlegaronN2 = evaluables.length > 0 ? Math.round((llegaron2 / evaluables.length) * 100) : 0

    result.push({ nombre, respondioN1, respondioN2, respondioN3, respondioN4, sinRespuesta, nivelMasUsado, pctLlegaronN2 })
  }

  return result.sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export function buildCasosFueraSLA(rows: RawSLAProvRow[]): CasoFueraSLA[] {
  const result: CasoFueraSLA[] = []
  for (const row of rows) {
    if (!row.proveedor_id) continue
    const c = calcRow(row)
    if (!c.evaluable || c.slaGeneral) continue
    result.push({
      id: row.id,
      codigo: row.codigo,
      tiendaCodigo: row.tienda_codigo,
      tiendaNombre: row.tienda_nombre ?? '',
      provNombre: row.prov_nombre ?? '—',
      tipo: row.tipo,
      nivelQueRespondio: c.nivelQueRespondio,
      tPrimeraRespuestaMin: c.tPrimeraRespuestaMin,
      tResolucionMin: c.tResolucionMin,
      slaRespuesta: c.slaRespuesta,
      slaResolucion: c.slaResolucion,
      slaGeneral: c.slaGeneral,
      motivoIncumplimiento: c.motivoIncumplimiento ?? '',
    })
  }
  return result
}

export function buildConclusiones(
  proveedores: ProveedorSLAResumen[],
  tiempos: ProveedorSLATiempos[],
  niveles: ProveedorSLANiveles[],
): string[] {
  if (!proveedores.length) return []
  const conclusiones: string[] = []

  // Regla 1: menor SLA
  const peor = proveedores[0]
  if (peor.slaPct != null) {
    conclusiones.push(`${peor.nombre} presenta el menor cumplimiento SLA del período con ${peor.slaPct}%.`)
  }

  // Regla 2: óptimo >=90%
  const optimos = proveedores.filter((p) => p.estado === 'optimo')
  for (const p of optimos) {
    conclusiones.push(`${p.nombre} mantiene cumplimiento SLA óptimo.`)
  }

  // Reglas 3/4: motivo más frecuente global
  const totalFuerResp  = tiempos.reduce((s, t) => s + t.fueraSLAPorRespuesta + t.fueraSLAPorAmbos, 0)
  const totalFuerResol = tiempos.reduce((s, t) => s + t.fueraSLAPorResolucion + t.fueraSLAPorAmbos, 0)
  if (totalFuerResp > totalFuerResol && totalFuerResp > 0) {
    conclusiones.push('El principal incumplimiento se origina en la falta de respuesta dentro del primer nivel.')
  } else if (totalFuerResol > 0) {
    conclusiones.push('El principal incumplimiento se origina en tiempos de resolución elevados.')
  }

  // Regla 5: N2+ >30%
  const altaDependencia = niveles.filter((n) => n.pctLlegaronN2 > 30)
  if (altaDependencia.length >= 2) {
    const nombres = altaDependencia.map((n) => n.nombre).join(' y ')
    conclusiones.push(`${nombres} presentan alta dependencia de escalamiento a niveles superiores.`)
  } else if (altaDependencia.length === 1) {
    conclusiones.push(`${altaDependencia[0].nombre} presenta alta dependencia de escalamiento a niveles superiores.`)
  }

  // Regla 6: recomendaciones
  const criticos = proveedores.filter((p) => p.estado === 'critico')
  for (const p of criticos) {
    if (p.motivoPrincipal === 'Respuesta y resolución fuera de objetivo') {
      conclusiones.push(`Se recomienda revisión contractual y seguimiento operativo con ${p.nombre}.`)
    } else if (p.motivoPrincipal === 'Falta de respuesta en Nivel 1') {
      conclusiones.push(`Se recomienda revisar cumplimiento de atención Nivel 1 con ${p.nombre}.`)
    } else if (p.motivoPrincipal === 'Tiempo de resolución elevado') {
      conclusiones.push(`Se recomienda revisar capacidad técnica y tiempos de solución de ${p.nombre}.`)
    }
  }
  const altaEscalamientoNivel = niveles.find((n) => n.pctLlegaronN2 > 30)
  if (altaEscalamientoNivel) {
    conclusiones.push('Se recomienda validar contactos de Nivel 1 y tiempos de escalamiento.')
  }

  return conclusiones
}
