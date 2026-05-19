import { calcSLACaso, getEstadoSLA, type RawSLARow } from './dashboard-sla-calc'
import { getVentaHoraEstimadaOrNull } from './dashboard-calculations'
import { calcImpactoRow } from './impacto-calc'
import type { RawVentaDiaria } from './dashboard-queries'
import {
  TIPO_LABELS, TIPO_COLORS,
  type TipoVisible, type TipoResumen, type OtroDesglose,
  type IncidenteDetalle, type PatronTipo,
} from '@/types/distribution-type'

export interface RawDistribucionRow {
  id: string
  codigo: string
  tipo: string
  estado: string
  hora_registro: Date | string
  hora_fin: Date | string | null
  mttr_minutos: number | null
  proveedor_id: string | null
  prov_nombre: string | null
  tienda_id: string
  tienda_codigo: string
  tienda_nombre: string | null
  cluster: string | null
  venta_hora_soles: number | null
  tiene_contingencia: boolean
  contingencia_activa: boolean
  dia_semana: number
  otros_clasificacion: string | null
  tipo_personalizado: string | null
  hora_correo_n1: Date | string | null
  hora_primera_resp: Date | string | null
  nivel_respuesta: number | null
  max_nivel: number | null
}

const TIPOS_INDIVIDUALES: TipoVisible[] = ['CAIDA_TOTAL', 'INTERMITENCIA', 'LENTITUD']

export function normalizarTipo(tipo: string): TipoVisible {
  if (tipo === 'CAIDA_TOTAL' || tipo === 'INTERMITENCIA' || tipo === 'LENTITUD') return tipo
  return 'OTROS'
}

function rowImpacto(row: RawDistribucionRow, ventasDiarias: RawVentaDiaria[]): number {
  const vh = getVentaHoraEstimadaOrNull(row.tienda_codigo, row.dia_semana, row.venta_hora_soles, row.cluster, ventasDiarias)
  return calcImpactoRow({
    hora_registro: row.hora_registro,
    hora_fin: row.hora_fin,
    estado: row.estado,
    tipo: row.tipo,
    ventaHoraResolvida: vh,
    contingencia_activa: row.contingencia_activa,
    otros_clasificacion: row.otros_clasificacion,
  }).impactoEstimado
}

function topEntry(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts)
  if (!entries.length) return null
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}

function avgOrNull(vals: number[]): number | null {
  return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}

export function buildTiposResumen(
  rows: RawDistribucionRow[],
  ventasDiarias: RawVentaDiaria[],
): TipoResumen[] {
  const total = rows.length
  const map = new Map<TipoVisible, RawDistribucionRow[]>()
  for (const t of [...TIPOS_INDIVIDUALES, 'OTROS' as TipoVisible]) map.set(t, [])
  for (const row of rows) map.get(normalizarTipo(row.tipo))!.push(row)

  const result: TipoResumen[] = []
  for (const [tipo, tRows] of map.entries()) {
    if (!tRows.length) continue

    const slaCasos = tRows
      .filter((r) => r.estado === 'RESUELTO' && r.hora_fin != null)
      .map((r) => calcSLACaso(r as unknown as RawSLARow))
    const evaluables = slaCasos.filter((c) => c.evaluable)
    const dentraSLA = evaluables.filter((c) => c.slaGeneral).length
    const slaPct = evaluables.length > 0 ? Math.round((dentraSLA / evaluables.length) * 100) : null

    const mttrVals = tRows.filter((r) => r.mttr_minutos != null).map((r) => r.mttr_minutos!)

    const provCount: Record<string, number> = {}
    for (const r of tRows) if (r.prov_nombre) provCount[r.prov_nombre] = (provCount[r.prov_nombre] ?? 0) + 1

    let impactoEstimado = 0
    for (const r of tRows) impactoEstimado += rowImpacto(r, ventasDiarias)

    // Causa más frecuente (Otros)
    let causaMasFrecuente: string | null = null
    if (tipo === 'OTROS') {
      const causaCount: Record<string, number> = {}
      for (const r of tRows) {
        const c = r.otros_clasificacion ?? 'Sin clasificar'
        causaCount[c] = (causaCount[c] ?? 0) + 1
      }
      causaMasFrecuente = topEntry(causaCount)
    }

    const tiendasSet = new Set(tRows.map((r) => r.tienda_codigo))

    result.push({
      tipo,
      label: TIPO_LABELS[tipo],
      color: TIPO_COLORS[tipo],
      cantidad: tRows.length,
      pct: total > 0 ? Math.round((tRows.length / total) * 1000) / 10 : 0,
      tiendasAfectadas: tiendasSet.size,
      proveedorMasAsociado: topEntry(provCount),
      totalProveedores: Object.keys(provCount).length,
      mttrPromedioMin: avgOrNull(mttrVals),
      slaPct,
      impactoEstimado: Math.round(impactoEstimado),
      estado: getEstadoSLA(slaPct),
      causaMasFrecuente,
    })
  }

  return result.sort((a, b) => b.cantidad - a.cantidad)
}

export function buildOtrosDesglose(
  rows: RawDistribucionRow[],
  ventasDiarias: RawVentaDiaria[],
): OtroDesglose[] {
  const otrosRows = rows.filter((r) => normalizarTipo(r.tipo) === 'OTROS')
  if (!otrosRows.length) return []

  const totalOtros = otrosRows.length
  const map = new Map<string, RawDistribucionRow[]>()
  for (const row of otrosRows) {
    const key = row.otros_clasificacion ?? 'Sin clasificar'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(row)
  }

  const result: OtroDesglose[] = []
  for (const [causa, cRows] of map.entries()) {
    const slaCasos = cRows
      .filter((r) => r.estado === 'RESUELTO' && r.hora_fin != null)
      .map((r) => calcSLACaso(r as unknown as RawSLARow))
    const evaluables = slaCasos.filter((c) => c.evaluable)
    const dentraSLA = evaluables.filter((c) => c.slaGeneral).length
    const slaPct = evaluables.length > 0 ? Math.round((dentraSLA / evaluables.length) * 100) : null

    const mttrVals = cRows.filter((r) => r.mttr_minutos != null).map((r) => r.mttr_minutos!)
    const provCount: Record<string, number> = {}
    for (const r of cRows) if (r.prov_nombre) provCount[r.prov_nombre] = (provCount[r.prov_nombre] ?? 0) + 1

    let impactoEstimado = 0
    for (const r of cRows) impactoEstimado += rowImpacto(r, ventasDiarias)

    result.push({
      causaClasificada: causa,
      cantidad: cRows.length,
      pctDeOtros: Math.round((cRows.length / totalOtros) * 1000) / 10,
      tiendasAfectadas: new Set(cRows.map((r) => r.tienda_codigo)).size,
      proveedorMasAsociado: topEntry(provCount),
      mttrPromedioMin: avgOrNull(mttrVals),
      slaPct,
      impactoEstimado: Math.round(impactoEstimado),
      estado: getEstadoSLA(slaPct),
    })
  }

  return result.sort((a, b) => b.cantidad - a.cantidad)
}

export function buildIncidentesDetalle(
  rows: RawDistribucionRow[],
  ventasDiarias: RawVentaDiaria[],
): IncidenteDetalle[] {
  return rows.map((row) => {
    const slaCaso = (row.estado === 'RESUELTO' && row.hora_fin != null)
      ? calcSLACaso(row as unknown as RawSLARow)
      : null
    const impactoEstimado = Math.round(rowImpacto(row, ventasDiarias))
    const fecha = new Date(row.hora_registro).toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima',
    })
    return {
      id: row.id,
      codigo: row.codigo,
      fecha,
      tiendaCodigo: row.tienda_codigo,
      tiendaNombre: row.tienda_nombre ?? '',
      provNombre: row.prov_nombre ?? '—',
      tipo: row.tipo,
      tipoVisible: normalizarTipo(row.tipo),
      duracionMin: row.mttr_minutos,
      slaGeneral: slaCaso?.evaluable ? slaCaso.slaGeneral : null,
      impactoEstimado,
      estado: row.estado,
      causaTexto: row.tipo_personalizado,
      causaClasificada: row.otros_clasificacion,
    }
  })
}

export function buildPatrones(
  rows: RawDistribucionRow[],
  tiposResumen: TipoResumen[],
): PatronTipo[] {
  const patrones: PatronTipo[] = []

  for (const tipo of [...TIPOS_INDIVIDUALES, 'OTROS' as TipoVisible]) {
    const tRows = rows.filter((r) => normalizarTipo(r.tipo) === tipo)
    if (tRows.length < 2) continue

    // Proveedor dominante
    const provCount: Record<string, number> = {}
    for (const r of tRows) if (r.prov_nombre) provCount[r.prov_nombre] = (provCount[r.prov_nombre] ?? 0) + 1
    const topProv = topEntry(provCount)
    const topProvCount = topProv ? (provCount[topProv] ?? 0) : 0
    const provDomina = topProvCount / tRows.length >= 0.5

    // Tiendas repetidas
    const tiendaCount: Record<string, number> = {}
    for (const r of tRows) tiendaCount[r.tienda_codigo] = (tiendaCount[r.tienda_codigo] ?? 0) + 1
    const tiendasRepetidas = Object.values(tiendaCount).filter((n) => n >= 2).length

    const patronDetectado = tipo === 'CAIDA_TOTAL'
      ? provDomina ? `Caídas concentradas en ${topProv}` : 'Reincidencia de caídas totales'
      : tipo === 'INTERMITENCIA'
      ? 'Intermitencia frecuente detectada'
      : tipo === 'LENTITUD'
      ? 'Lentitud recurrente'
      : 'Incidentes no clasificados repetidos'

    const causaProbable = tipo === 'CAIDA_TOTAL'
      ? 'Enlace de fibra / corte del proveedor'
      : tipo === 'INTERMITENCIA'
      ? 'Microcortes o inestabilidad del enlace'
      : tipo === 'LENTITUD'
      ? 'Saturación de ancho de banda'
      : 'Causa sin determinar'

    const recomendacion = tipo === 'CAIDA_TOTAL'
      ? 'Revisar enlace principal, router, proveedor y contingencia'
      : tipo === 'INTERMITENCIA'
      ? 'Revisar estabilidad del enlace, microcortes y monitoreo'
      : tipo === 'LENTITUD'
      ? 'Revisar saturación, ancho de banda y consumo de red'
      : 'Revisar causa clasificada y normalizar si se repite'

    patrones.push({
      tipo,
      label: TIPO_LABELS[tipo],
      patronDetectado,
      proveedorAsociado: topProv,
      tiendasRepetidas,
      causaProbable,
      recomendacion,
    })
  }

  return patrones
}

export function buildConclusiones(
  tiposResumen: TipoResumen[],
  otrosDesglose: OtroDesglose[],
  total: number,
): string[] {
  const conclusiones: string[] = []

  // Regla 1: tipo > 40%
  for (const t of tiposResumen) {
    if (t.pct > 40) conclusiones.push(`El tipo ${t.label} concentra el ${t.pct}% de los incidentes del período.`)
  }

  // Regla 2: mayor impacto
  const masImpacto = [...tiposResumen].sort((a, b) => b.impactoEstimado - a.impactoEstimado)[0]
  if (masImpacto?.impactoEstimado > 0) {
    conclusiones.push(`${masImpacto.label} genera el mayor impacto estimado del período.`)
  }

  // Regla 3: SLA < 70%
  for (const t of tiposResumen) {
    if (t.slaPct != null && t.slaPct < 70) {
      conclusiones.push(`${t.label} presenta cumplimiento SLA crítico con ${t.slaPct}%.`)
    }
  }

  // Regla 4: proveedor > 50% de tipo
  for (const t of tiposResumen) {
    if (t.proveedorMasAsociado && t.cantidad >= 2) {
      conclusiones.push(`${t.label} está asociado principalmente a ${t.proveedorMasAsociado}.`)
      break
    }
  }

  // Regla 5: Otros > 15%
  const otros = tiposResumen.find((t) => t.tipo === 'OTROS')
  if (otros && otros.pct > 15) {
    conclusiones.push('Los incidentes clasificados como Otros representan un porcentaje alto. Se recomienda revisar si deben crearse nuevos tipos de incidente.')
  }

  // Regla 6: causa concentra 40%+ de Otros
  const topCausa = otrosDesglose[0]
  if (topCausa && topCausa.pctDeOtros >= 40 && topCausa.causaClasificada !== 'Sin clasificar') {
    conclusiones.push(`La causa ${topCausa.causaClasificada} concentra la mayor parte de incidentes clasificados como Otros.`)
  }

  // Regla 7: sin clasificar
  const sinClasificar = otrosDesglose.find((d) => d.causaClasificada === 'Sin clasificar')
  if (sinClasificar) {
    conclusiones.push(`Existen ${sinClasificar.cantidad} incidentes tipo Otros sin clasificación. Se recomienda normalizar estas causas.`)
  }

  // Regla 8: causa 3+ veces
  for (const d of otrosDesglose) {
    if (d.cantidad >= 3 && d.causaClasificada !== 'Sin clasificar') {
      conclusiones.push(`Se recomienda evaluar crear un nuevo tipo de incidente para ${d.causaClasificada}.`)
      break
    }
  }

  return conclusiones
}
