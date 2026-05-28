import type {
  ProveedorSLAResumen, ProveedorSLATiempos, ProveedorSLANiveles,
  CasoFueraSLA, SLAEstado, DistribucionNiveles,
} from '@/types/provider-sla-compliance'
import { calcSLARow, calcEficienciaSLA, SLA_RESPUESTA_MIN, SLA_RESOLUCION_DEFAULT_MIN } from './sla-core'

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
  tiempo_estimado_solucion_min?: number | null
  sla_respuesta_override?: number | null
  sla_resolucion_override?: number | null
}

function avg(vals: number[]): number | null {
  return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}

function calcRow(row: RawSLAProvRow) {
  if (row.evaluable_proveedor === false) {
    return {
      evaluable: false, slaGeneral: false, slaRespuesta: false, slaResolucion: false,
      escaladoN2: false,
      nivelFinal: null as number | null,
      tPrimeraRespuestaMin: null as number | null,
      tResolucionMin: null as number | null,
      motivoIncumplimiento: null as string | null,
      slaRespuestaObj: row.sla_respuesta_override ?? SLA_RESPUESTA_MIN,
      slaResolucionObj: row.sla_resolucion_override ?? SLA_RESOLUCION_DEFAULT_MIN,
      nivelQueRespondio: null as number | null,
      cumplioETA: null as boolean | null,
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
    const calcs     = pRows.map(calcRow)
    const evaluables = calcs.filter((c) => c.evaluable)

    const dentraSLA        = evaluables.filter((c) => c.slaGeneral).length
    const dentraSLAResp    = evaluables.filter((c) => c.slaRespuesta).length
    const dentraSLAResol   = evaluables.filter((c) => c.slaResolucion).length
    const fueraSLA         = evaluables.length - dentraSLA
    const casosN2          = evaluables.filter((c) => c.escaladoN2).length

    const slaPct           = evaluables.length > 0 ? Math.round((dentraSLA      / evaluables.length) * 100) : null
    const slaRespuestaPct  = evaluables.length > 0 ? Math.round((dentraSLAResp  / evaluables.length) * 100) : null
    const slaResolucionPct = evaluables.length > 0 ? Math.round((dentraSLAResol / evaluables.length) * 100) : null
    const tasaEscalamientoN2Pct = evaluables.length > 0 ? Math.round((casosN2 / evaluables.length) * 100) : null

    const conETA         = evaluables.filter((c) => c.cumplioETA != null)
    const cumplioETACount = conETA.filter((c) => c.cumplioETA === true).length
    const cumplimientoETAPct = conETA.length > 0 ? Math.round((cumplioETACount / conETA.length) * 100) : null

    const respTimes  = evaluables.filter((c) => c.tPrimeraRespuestaMin != null).map((c) => c.tPrimeraRespuestaMin!)
    const resolTimes = evaluables.filter((c) => c.tResolucionMin        != null).map((c) => c.tResolucionMin!)

    let scoreSum = 0, scoreCount = 0
    for (const c of evaluables) {
      const ef = calcEficienciaSLA({
        tRespuestaMin:   c.tPrimeraRespuestaMin,
        tResolucionMin:  c.tResolucionMin,
        slaRespuestaMin: c.slaRespuestaObj,
        slaResolucionMin: c.slaResolucionObj ?? SLA_RESOLUCION_DEFAULT_MIN,
      })
      if (ef.scoreSLA != null) { scoreSum += ef.scoreSLA; scoreCount++ }
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
      slaRespuestaPct,
      slaResolucionPct,
      scoreEficiencia: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
      tPromRespuestaMin:  avg(respTimes),
      tPromResolucionMin: avg(resolTimes),
      tasaEscalamientoN2Pct,
      cumplimientoETAPct,
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
    const calcs      = pRows.map(calcRow)
    const evaluables = calcs.filter((c) => c.evaluable)

    const respTimes     = evaluables.filter((c) => c.tPrimeraRespuestaMin != null).map((c) => c.tPrimeraRespuestaMin!)
    const resolTimes    = evaluables.filter((c) => c.tResolucionMin        != null).map((c) => c.tResolucionMin!)
    const resolObjTimes = evaluables.map((c) => c.slaResolucionObj).filter((v): v is number => v != null)

    const fueraSLAPorRespuesta  = evaluables.filter((c) => !c.slaRespuesta &&  c.slaResolucion).length
    const fueraSLAPorResolucion = evaluables.filter((c) =>  c.slaRespuesta && !c.slaResolucion).length
    const fueraSLAPorAmbos      = evaluables.filter((c) => !c.slaRespuesta && !c.slaResolucion).length

    result.push({
      nombre,
      slaRespuestaObj:    SLA_RESPUESTA_MIN,
      tRespuestaRealProm: avg(respTimes),
      slaResolucionObj:   avg(resolObjTimes),
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
    const calcs      = pRows.map(calcRow)
    const evaluables = calcs.filter((c) => c.evaluable)
    const evalRows   = pRows.filter((_, i) => calcs[i].evaluable)
    const total      = evaluables.length

    const respondioN1  = evaluables.filter((c) => c.nivelQueRespondio === 1).length
    const respondioN2  = evaluables.filter((c) => c.nivelQueRespondio === 2).length
    const respondioN3  = evaluables.filter((c) => c.nivelQueRespondio === 3).length
    const respondioN4  = evaluables.filter((c) => c.nivelQueRespondio != null && c.nivelQueRespondio >= 4).length
    const sinRespuesta = evaluables.filter((c) => c.nivelQueRespondio == null).length

    const n1Solo   = evalRows.filter((r) => r.max_nivel === 1).length
    const escN2    = evalRows.filter((r) => r.max_nivel === 2).length
    const escN3mas = evalRows.filter((r) => r.max_nivel != null && r.max_nivel >= 3).length

    const distribucion: DistribucionNiveles = {
      n1Solo, escN2, escN3mas, sinRespuesta,
      pctN1Solo:   total > 0 ? Math.round((n1Solo   / total) * 100) : null,
      pctEscN2:    total > 0 ? Math.round((escN2    / total) * 100) : null,
      pctEscN3mas: total > 0 ? Math.round((escN3mas / total) * 100) : null,
    }

    const llegaron2     = evaluables.filter((c) => c.escaladoN2).length
    const pctLlegaronN2 = total > 0 ? Math.round((llegaron2 / total) * 100) : 0

    result.push({ nombre, respondioN1, respondioN2, respondioN3, respondioN4, sinRespuesta, distribucion, pctLlegaronN2 })
  }

  return result.sort((a, b) => a.nombre.localeCompare(b.nombre))
}

export function buildCasosFueraSLA(rows: RawSLAProvRow[]): CasoFueraSLA[] {
  const result: CasoFueraSLA[] = []
  for (const row of rows) {
    if (!row.proveedor_id) continue
    const c = calcRow(row)
    if (!c.evaluable || c.slaGeneral) continue
    const eficiencia = calcEficienciaSLA({
      tRespuestaMin:    c.tPrimeraRespuestaMin,
      tResolucionMin:   c.tResolucionMin,
      slaRespuestaMin:  c.slaRespuestaObj,
      slaResolucionMin: c.slaResolucionObj ?? SLA_RESOLUCION_DEFAULT_MIN,
    })
    result.push({
      id: row.id,
      codigo: row.codigo,
      tiendaCodigo: row.tienda_codigo,
      tiendaNombre: row.tienda_nombre ?? '',
      provNombre:   row.prov_nombre ?? '—',
      tipo: row.tipo,
      nivelFinal:          c.nivelFinal,
      nivelQueRespondio:   c.nivelQueRespondio,
      tPrimeraRespuestaMin: c.tPrimeraRespuestaMin,
      tResolucionMin:      c.tResolucionMin,
      slaRespuesta:  c.slaRespuesta,
      slaResolucion: c.slaResolucion,
      slaGeneral:    c.slaGeneral,
      cumplioETA:    c.cumplioETA,
      motivoIncumplimiento: c.motivoIncumplimiento ?? '',
      scoreEficiencia: eficiencia.scoreSLA,
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

  const peor = proveedores[0]
  if (peor.slaPct != null) {
    conclusiones.push(`${peor.nombre} presenta el menor cumplimiento SLA del período con ${peor.slaPct}%.`)
  }

  const optimos = proveedores.filter((p) => p.estado === 'optimo')
  for (const p of optimos) {
    conclusiones.push(`${p.nombre} mantiene cumplimiento SLA óptimo.`)
  }

  const totalFuerResp  = tiempos.reduce((s, t) => s + t.fueraSLAPorRespuesta + t.fueraSLAPorAmbos, 0)
  const totalFuerResol = tiempos.reduce((s, t) => s + t.fueraSLAPorResolucion + t.fueraSLAPorAmbos, 0)
  if (totalFuerResp > totalFuerResol && totalFuerResp > 0) {
    conclusiones.push('El principal incumplimiento se origina en la falta de respuesta dentro del primer nivel.')
  } else if (totalFuerResol > 0) {
    conclusiones.push('El principal incumplimiento se origina en tiempos de resolución elevados.')
  }

  const altaDependencia = niveles.filter((n) => n.pctLlegaronN2 > 30)
  if (altaDependencia.length >= 2) {
    conclusiones.push(`${altaDependencia.map((n) => n.nombre).join(' y ')} presentan alta dependencia de escalamiento a niveles superiores.`)
  } else if (altaDependencia.length === 1) {
    conclusiones.push(`${altaDependencia[0].nombre} presenta alta dependencia de escalamiento a niveles superiores.`)
  }

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
  if (altaDependencia.length > 0) {
    conclusiones.push('Se recomienda validar contactos de Nivel 1 y tiempos de escalamiento.')
  }

  return conclusiones
}
