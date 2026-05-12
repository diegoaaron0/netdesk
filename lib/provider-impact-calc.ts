import {
  calcSLACaso, getEstadoSLA, getCausaPrincipal, type RawSLARow,
} from './dashboard-sla-calc'
import {
  getCostoEstimado, getVentaHoraEsperada, getScoreProveedor,
  type ScoreMetricas, type ScoreMaximos,
} from './dashboard-calculations'
import type { RawVentaDiaria } from './dashboard-queries'
import type {
  ProveedorMetricas, TopIncidente, TiendaAfectada,
} from '@/types/provider-impact'

export interface RawProveedorRow {
  id: string
  codigo: string
  tipo: string
  estado: string
  hora_registro: Date | string
  hora_fin: Date | string | null
  mttr_minutos: number | null
  proveedor_id: string | null
  prov_nombre: string | null
  tienda_codigo: string
  tienda_nombre: string | null
  cluster: string | null
  venta_hora_soles: number | null
  tiene_contingencia: boolean
  contingencia_activa: boolean
  dia_semana: number
  hora_correo_n1: Date | string | null
  hora_primera_resp: Date | string | null
  nivel_respuesta: number | null
  max_nivel: number | null
}

function rowCosto(row: RawProveedorRow, ventasDiarias: RawVentaDiaria[]): number {
  if (row.estado !== 'RESUELTO' || !row.mttr_minutos) return 0
  const ventaHora = getVentaHoraEsperada(
    row.tienda_codigo, row.dia_semana, row.venta_hora_soles, row.cluster, ventasDiarias,
  )
  const { costo } = getCostoEstimado(
    ventaHora, row.mttr_minutos, row.tipo, row.tiene_contingencia, row.contingencia_activa,
  )
  return costo
}

export function buildProveedorMetricas(
  rows: RawProveedorRow[],
  ventasDiarias: RawVentaDiaria[],
): ProveedorMetricas[] {
  const map = new Map<string, RawProveedorRow[]>()
  for (const row of rows) {
    const key = row.proveedor_id ?? 'SIN_PROVEEDOR'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(row)
  }

  type Raw = Omit<ProveedorMetricas, 'score' | 'scoreBreakdown'>
  const rawMetricas: Raw[] = []

  for (const [provId, provRows] of map.entries()) {
    const nombre = provRows[0].prov_nombre ?? 'Sin proveedor'

    // SLA: only RESUELTO + hora_fin
    const slaCasos = provRows
      .filter((r) => r.estado === 'RESUELTO' && r.hora_fin != null)
      .map((r) => calcSLACaso(r as unknown as RawSLARow))
    const evaluables = slaCasos.filter((c) => c.evaluable)
    const dentraSLA = evaluables.filter((c) => c.slaGeneral).length
    const fueraSLA = evaluables.length - dentraSLA
    const slaPct = evaluables.length > 0 ? Math.round((dentraSLA / evaluables.length) * 100) : null

    // MTTR: avg of RESUELTO incidentes with mttr_minutos
    const mttrVals = provRows
      .filter((r) => r.estado === 'RESUELTO' && r.mttr_minutos != null)
      .map((r) => r.mttr_minutos!)
    const mttrMinutos = mttrVals.length > 0
      ? Math.round(mttrVals.reduce((a, b) => a + b, 0) / mttrVals.length)
      : null

    // Costo: sum across RESUELTO incidentes
    let costoTotal = 0
    for (const row of provRows) costoTotal += rowCosto(row, ventasDiarias)

    // Tiendas únicas afectadas
    const tiendasSet = new Set(provRows.map((r) => r.tienda_codigo))
    const tiendaCount: Record<string, number> = {}
    for (const r of provRows) {
      tiendaCount[r.tienda_codigo] = (tiendaCount[r.tienda_codigo] ?? 0) + 1
    }
    const reincidencia = Object.values(tiendaCount).filter((n) => n >= 2).length

    const causaPrincipal = getCausaPrincipal(
      evaluables.filter((c) => !c.slaGeneral).map((c) => c.motivoIncumplimiento),
    )

    rawMetricas.push({
      id: provId,
      nombre,
      incidentes: provRows.length,
      evaluables: evaluables.length,
      dentraSLA,
      fueraSLA,
      slaPct,
      mttrMinutos,
      costoTotal: Math.round(costoTotal),
      tiendasAfectadas: tiendasSet.size,
      reincidencia,
      causaPrincipal,
      estado: getEstadoSLA(slaPct),
    })
  }

  rawMetricas.sort((a, b) => b.incidentes - a.incidentes)

  const maximos: ScoreMaximos = {
    costo:               Math.max(...rawMetricas.map((m) => m.costoTotal), 1),
    mttrMinutos:         Math.max(...rawMetricas.map((m) => m.mttrMinutos ?? 0), 1),
    reincidenciaTiendas: Math.max(...rawMetricas.map((m) => m.reincidencia), 1),
    incidentes:          Math.max(...rawMetricas.map((m) => m.incidentes), 1),
  }

  return rawMetricas.map((m) => {
    const metricas: ScoreMetricas = {
      costo:               m.costoTotal,
      slaPct:              m.slaPct ?? 100,
      mttrMinutos:         m.mttrMinutos ?? 0,
      reincidenciaTiendas: m.reincidencia,
      incidentes:          m.incidentes,
    }
    const { score, breakdown } = getScoreProveedor(metricas, maximos)
    return {
      ...m,
      score,
      scoreBreakdown: breakdown as ProveedorMetricas['scoreBreakdown'],
    }
  })
}

export function buildTopIncidentes(
  rows: RawProveedorRow[],
  ventasDiarias: RawVentaDiaria[],
  limit = 10,
): TopIncidente[] {
  const result: TopIncidente[] = []

  for (const row of rows) {
    if (row.estado !== 'RESUELTO' || !row.mttr_minutos) continue
    const costo = rowCosto(row, ventasDiarias)
    const slaCaso = calcSLACaso(row as unknown as RawSLARow)
    const diaFmt = new Date(row.hora_registro).toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima',
    })
    result.push({
      codigo: row.codigo,
      tiendaCodigo: row.tienda_codigo,
      tiendaNombre: row.tienda_nombre ?? '',
      provNombre: row.prov_nombre ?? '—',
      tipo: row.tipo,
      mttrMinutos: row.mttr_minutos,
      costoEstimado: Math.round(costo),
      slaGeneral: slaCaso.evaluable ? slaCaso.slaGeneral : null,
      motivoIncumplimiento: slaCaso.evaluable ? slaCaso.motivoIncumplimiento : null,
      diaFmt,
    })
  }

  return result.sort((a, b) => b.costoEstimado - a.costoEstimado).slice(0, limit)
}

export function buildTiendasAfectadas(
  rows: RawProveedorRow[],
  ventasDiarias: RawVentaDiaria[],
  limit = 15,
): TiendaAfectada[] {
  const map = new Map<string, { rows: RawProveedorRow[]; proveedores: Set<string> }>()
  for (const row of rows) {
    if (!map.has(row.tienda_codigo)) map.set(row.tienda_codigo, { rows: [], proveedores: new Set() })
    const entry = map.get(row.tienda_codigo)!
    entry.rows.push(row)
    if (row.prov_nombre) entry.proveedores.add(row.prov_nombre)
  }

  const result: TiendaAfectada[] = []
  for (const [tiendaCodigo, { rows: tRows, proveedores }] of map.entries()) {
    const mttrVals = tRows.filter((r) => r.mttr_minutos != null).map((r) => r.mttr_minutos!)
    const mttrPromedioMin = mttrVals.length > 0
      ? Math.round(mttrVals.reduce((a, b) => a + b, 0) / mttrVals.length)
      : null

    let costoTotal = 0
    let fueraSLA = 0
    for (const row of tRows) {
      costoTotal += rowCosto(row, ventasDiarias)
      if (row.estado === 'RESUELTO' && row.hora_fin != null) {
        const slaCaso = calcSLACaso(row as unknown as RawSLARow)
        if (slaCaso.evaluable && !slaCaso.slaGeneral) fueraSLA++
      }
    }

    result.push({
      tiendaCodigo,
      tiendaNombre: tRows[0].tienda_nombre ?? '',
      incidentes: tRows.length,
      proveedores: [...proveedores],
      mttrPromedioMin,
      costoTotal: Math.round(costoTotal),
      fueraSLA,
    })
  }

  return result.sort((a, b) => b.incidentes - a.incidentes).slice(0, limit)
}

export function buildConclusionesProveedor(proveedores: ProveedorMetricas[]): string[] {
  if (!proveedores.length) return []
  const conclusiones: string[] = []

  // Regla 1: más incidentes
  const masInc = proveedores[0]
  conclusiones.push(
    `${masInc.nombre} concentra el mayor número de incidentes del período con ${masInc.incidentes} casos.`,
  )

  // Regla 2: crítico por SLA
  const critico = proveedores.find((p) => p.estado === 'critico')
  if (critico) {
    conclusiones.push(
      `${critico.nombre} presenta SLA crítico de ${critico.slaPct}%, por debajo de la meta del 90%.`,
    )
  }

  // Regla 3: mayor costo
  const masCosto = [...proveedores].sort((a, b) => b.costoTotal - a.costoTotal)[0]
  if (masCosto.costoTotal > 0) {
    const fmt = `S/ ${masCosto.costoTotal.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
    conclusiones.push(
      `${masCosto.nombre} genera el mayor impacto económico estimado con ${fmt} en el período.`,
    )
  }

  // Regla 4: causa principal global
  const causas = proveedores.flatMap((p) => (p.causaPrincipal ? [p.causaPrincipal] : []))
  if (causas.length) {
    const counts: Record<string, number> = {}
    for (const c of causas) counts[c] = (counts[c] ?? 0) + 1
    const topCausa = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    if (topCausa === 'Nivel 1 sin respuesta') {
      conclusiones.push('La principal causa de incumplimiento SLA es falta de respuesta en Nivel 1.')
    } else if (topCausa === 'Resolución fuera de tiempo') {
      conclusiones.push('La principal causa de incumplimiento SLA es tiempo de resolución alto.')
    } else {
      conclusiones.push(`La principal causa de incumplimiento SLA es: ${topCausa}.`)
    }
  }

  // Regla 5: recomendación
  const enRiesgo = proveedores.filter((p) => p.estado === 'en_riesgo' || p.estado === 'critico')
  if (enRiesgo.length) {
    const nombres = enRiesgo.map((p) => p.nombre).join(', ')
    conclusiones.push(`Se recomienda revisar el contrato de servicio con: ${nombres}.`)
  }

  return conclusiones
}
