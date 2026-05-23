import { calcSLACaso, getCausaPrincipal, type RawSLARow } from './dashboard-sla-calc'
import { getVentaHoraEstimadaOrNull } from './dashboard-calculations'
import { calcImpactoRow } from './impacto-calc'
import type { RawVentaDiaria } from './dashboard-queries'
import type {
  TiendaCritica, TiendaEstado, PatronDetectado,
} from '@/types/critical-stores'

export interface RawTiendaRow {
  id: string
  codigo: string
  tipo: string
  estado: string
  hora_registro: Date | string
  hora_fin: Date | string | null
  evaluable_proveedor?: boolean | null
  mttr_minutos: number | null
  proveedor_id: string | null
  prov_nombre: string | null
  tienda_id: string
  tienda_codigo: string
  tienda_nombre: string | null
  tienda_distrito: string | null
  cluster: string | null
  venta_hora_soles: number | null
  tiene_contingencia: boolean
  contingencia_activa: boolean
  cont_rendimiento: string | null
  dia_semana: number
  hora_correo_n1: Date | string | null
  hora_primera_resp: Date | string | null
  nivel_respuesta: number | null
  max_nivel: number | null
}

function rowCosto(row: RawTiendaRow, ventasDiarias: RawVentaDiaria[]): number {
  if (row.estado !== 'RESUELTO') return 0
  const ventaHora = getVentaHoraEstimadaOrNull(
    row.tienda_codigo, row.dia_semana, row.venta_hora_soles, row.cluster, ventasDiarias,
  )
  return calcImpactoRow({
    hora_registro: row.hora_registro,
    hora_fin: row.hora_fin,
    estado: row.estado,
    tipo: row.tipo,
    ventaHoraResolvida: ventaHora,
    contingencia_activa: row.contingencia_activa,
    cont_rendimiento: row.cont_rendimiento,
  }).impactoEstimado
}

function getProveedorMasFrecuente(rows: RawTiendaRow[]): string | null {
  const counts: Record<string, number> = {}
  for (const r of rows) {
    if (r.prov_nombre) counts[r.prov_nombre] = (counts[r.prov_nombre] ?? 0) + 1
  }
  const entries = Object.entries(counts)
  if (!entries.length) return null
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}

function calcScore(
  incidentes: number,
  reincidencias: number,
  maxReincidencias: number,
  costo: number,
  maxCosto: number,
  mttrMin: number | null,
  maxMttr: number,
  slaPct: number | null,
  tieneContingencia: boolean,
): number {
  const normReinc = maxReincidencias > 0 ? (reincidencias / maxReincidencias) * 100 : 0
  const normCosto = maxCosto > 0 ? (costo / maxCosto) * 100 : 0
  const normMttr  = maxMttr > 0 && mttrMin != null ? (mttrMin / maxMttr) * 100 : 0
  const normSla   = slaPct != null ? Math.max(0, (90 - slaPct) / 90 * 100) : 0
  const normCont  = (!tieneContingencia && incidentes >= 2) ? 100 : 0

  return Math.round(
    normReinc * 0.30 +
    normCosto * 0.25 +
    normMttr  * 0.20 +
    normSla   * 0.15 +
    normCont  * 0.10,
  )
}

function getEstadoTienda(
  incidentes: number,
  reincidencias: number,
  slaPct: number | null,
  costoEstimado: number,
  avgCosto: number,
): TiendaEstado {
  if (
    (incidentes >= 2 && (slaPct == null || slaPct < 70)) ||
    (incidentes >= 2 && reincidencias >= 2) ||
    (incidentes >= 2 && costoEstimado > avgCosto * 1.5)
  ) return 'critica'
  if (
    incidentes >= 2 ||
    (slaPct != null && slaPct < 90 && slaPct >= 70)
  ) return 'revisar'
  return 'optima'
}

function getMotivos(
  incidentes: number,
  mttrMin: number | null,
  globalMttr: number | null,
  slaPct: number | null,
  costo: number,
  avgCosto: number,
  reincidencias: number,
  tieneContingencia: boolean,
): string[] {
  const m: string[] = []
  if (incidentes >= 2) m.push(`${incidentes} incidentes en el período`)
  if (mttrMin != null && globalMttr != null && mttrMin > globalMttr) {
    m.push(`MTTR alto (${Math.round(mttrMin / 60)}h vs ${Math.round(globalMttr / 60)}h prom.)`)
  }
  if (slaPct != null && slaPct < 70) m.push(`SLA crítico (${slaPct}%)`)
  else if (slaPct != null && slaPct < 90) m.push(`SLA en riesgo (${slaPct}%)`)
  if (costo > avgCosto * 1.2) m.push('Costo estimado alto')
  if (reincidencias >= 2) m.push('Reincidencia del mismo tipo')
  if (!tieneContingencia && incidentes >= 2) m.push('Sin contingencia')
  return m
}

export function buildTiendasCriticas(
  rows: RawTiendaRow[],
  ventasDiarias: RawVentaDiaria[],
): TiendaCritica[] {
  // Group by tienda_id
  const map = new Map<string, RawTiendaRow[]>()
  for (const row of rows) {
    if (!map.has(row.tienda_id)) map.set(row.tienda_id, [])
    map.get(row.tienda_id)!.push(row)
  }

  // First pass: compute raw metrics
  type RawMetric = {
    tiendaId: string; tiendaCodigo: string; tiendaNombre: string
    distrito: string | null; cluster: string | null; proveedorNombre: string | null
    incidentes: number; reincidencias: number
    mttrPromedioMin: number | null; slaPct: number | null
    costoEstimado: number; ventaHoraPromedio: number | null; horasAfectadas: number | null
    tieneContingencia: boolean
  }

  const rawList: RawMetric[] = []
  for (const [tiendaId, tRows] of map.entries()) {
    const incidentes = tRows.length
    const proveedorNombre = getProveedorMasFrecuente(tRows)

    // SLA
    const slaCasos = tRows
      .filter((r) => r.estado === 'RESUELTO' && r.hora_fin != null)
      .map((r) => calcSLACaso(r as unknown as RawSLARow))
    const evaluables = slaCasos.filter((c) => c.evaluable)
    const dentraSLA = evaluables.filter((c) => c.slaGeneral).length
    const slaPct = evaluables.length > 0 ? Math.round((dentraSLA / evaluables.length) * 100) : null

    // MTTR
    const mttrVals = tRows
      .filter((r) => r.estado === 'RESUELTO' && r.mttr_minutos != null)
      .map((r) => r.mttr_minutos!)
    const mttrPromedioMin = mttrVals.length > 0
      ? Math.round(mttrVals.reduce((a, b) => a + b, 0) / mttrVals.length)
      : null

    // Costo
    let costoEstimado = 0
    let totalHorasAfectadas = 0
    let ventaHoraPromedio: number | null = null
    for (const row of tRows) {
      if (row.estado === 'RESUELTO') {
        const vh = getVentaHoraEstimadaOrNull(row.tienda_codigo, row.dia_semana, row.venta_hora_soles, row.cluster, ventasDiarias)
        const imp = calcImpactoRow({
          hora_registro: row.hora_registro,
          hora_fin: row.hora_fin,
          estado: row.estado,
          tipo: row.tipo,
          ventaHoraResolvida: vh,
          contingencia_activa: row.contingencia_activa,
    cont_rendimiento: row.cont_rendimiento,
        })
        costoEstimado += imp.impactoEstimado
        if (imp.mttrMin != null) totalHorasAfectadas += imp.mttrMin / 60
        if (ventaHoraPromedio == null && vh != null) ventaHoraPromedio = vh
      }
    }

    // Reincidencias: tipos que se repiten en la misma tienda
    const tipoCounts: Record<string, number> = {}
    for (const r of tRows) tipoCounts[r.tipo] = (tipoCounts[r.tipo] ?? 0) + 1
    const reincidencias = Object.values(tipoCounts).filter((n) => n >= 2).reduce((s, n) => s + (n - 1), 0)

    const tieneContingencia = tRows[0]?.tiene_contingencia ?? false

    rawList.push({
      tiendaId,
      tiendaCodigo: tRows[0].tienda_codigo,
      tiendaNombre: tRows[0].tienda_nombre ?? '',
      distrito: tRows[0].tienda_distrito,
      cluster: tRows[0].cluster,
      proveedorNombre,
      incidentes,
      reincidencias,
      mttrPromedioMin,
      slaPct,
      costoEstimado: Math.round(costoEstimado),
      ventaHoraPromedio: ventaHoraPromedio != null ? Math.round(ventaHoraPromedio) : null,
      horasAfectadas: totalHorasAfectadas > 0 ? Math.round(totalHorasAfectadas * 10) / 10 : null,
      tieneContingencia,
    })
  }

  // Normalization maximos
  const maxReincidencias = Math.max(...rawList.map((m) => m.reincidencias), 1)
  const maxCosto         = Math.max(...rawList.map((m) => m.costoEstimado), 1)
  const maxMttr          = Math.max(...rawList.map((m) => m.mttrPromedioMin ?? 0), 1)
  const avgCosto         = rawList.length > 0
    ? rawList.reduce((s, m) => s + m.costoEstimado, 0) / rawList.length
    : 0
  const globalMttr       = (() => {
    const vals = rawList.filter((m) => m.mttrPromedioMin != null).map((m) => m.mttrPromedioMin!)
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
  })()

  return rawList
    .map((m) => {
      const score = calcScore(
        m.incidentes, m.reincidencias, maxReincidencias,
        m.costoEstimado, maxCosto, m.mttrPromedioMin, maxMttr,
        m.slaPct, m.tieneContingencia,
      )
      const estado = getEstadoTienda(m.incidentes, m.reincidencias, m.slaPct, m.costoEstimado, avgCosto)
      const motivosPrincipales = getMotivos(
        m.incidentes, m.mttrPromedioMin, globalMttr,
        m.slaPct, m.costoEstimado, avgCosto,
        m.reincidencias, m.tieneContingencia,
      )
      return { ...m, score, estado, motivosPrincipales }
    })
    .sort((a, b) => b.score - a.score)
}

export function buildPatrones(rows: RawTiendaRow[]): PatronDetectado[] {
  const map = new Map<string, RawTiendaRow[]>()
  for (const row of rows) {
    if (!map.has(row.tienda_codigo)) map.set(row.tienda_codigo, [])
    map.get(row.tienda_codigo)!.push(row)
  }

  const patrones: PatronDetectado[] = []
  for (const [tiendaCodigo, tRows] of map.entries()) {
    if (tRows.length < 2) continue

    const tipoCounts: Record<string, number> = {}
    const tipoProveedores: Record<string, string[]> = {}
    for (const r of tRows) {
      tipoCounts[r.tipo] = (tipoCounts[r.tipo] ?? 0) + 1
      if (!tipoProveedores[r.tipo]) tipoProveedores[r.tipo] = []
      if (r.prov_nombre) tipoProveedores[r.tipo].push(r.prov_nombre)
    }

    const topTipo = Object.entries(tipoCounts).sort((a, b) => b[1] - a[1])[0]
    if (!topTipo || topTipo[1] < 2) continue

    const tipo = topTipo[0]
    const veces = topTipo[1]
    const provCounts: Record<string, number> = {}
    for (const p of tipoProveedores[tipo] ?? []) provCounts[p] = (provCounts[p] ?? 0) + 1
    const topProv = Object.entries(provCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    const patronDetectado = tipo === 'CAIDA_TOTAL' ? 'Reincidencia por caída total'
      : tipo === 'INTERMITENCIA' ? 'Intermitencia frecuente'
      : tipo === 'LENTITUD'      ? 'Lentitud recurrente'
      : tipo === 'POS'           ? 'Fallas de POS repetidas'
      : 'Fallas recurrentes'

    const recomendacion = tipo === 'CAIDA_TOTAL'
      ? 'Revisar enlace principal o activar contingencia'
      : tipo === 'INTERMITENCIA'
      ? 'Monitorear estabilidad del enlace y redundancia'
      : tipo === 'LENTITUD'
      ? 'Evaluar mejora de enlace o respaldo'
      : 'Optimizar capacidad y monitoreo'

    patrones.push({ tiendaCodigo, patronDetectado, tipoRepetido: tipo, proveedorRepetido: topProv, veces, recomendacion })
  }

  return patrones.sort((a, b) => b.veces - a.veces)
}

export function buildConclusiones(
  tiendas: TiendaCritica[],
  patrones: PatronDetectado[],
): string[] {
  if (!tiendas.length) return []
  const conclusiones: string[] = []

  // Regla 1: mayor score
  const top = tiendas[0]
  conclusiones.push(`${top.tiendaCodigo} es la tienda con mayor criticidad del período.`)

  // Regla 2: reincidencia
  const conReinc = tiendas.filter((t) => t.incidentes >= 2)
  for (const t of conReinc.slice(0, 2)) {
    conclusiones.push(`${t.tiendaCodigo} presenta reincidencia con ${t.incidentes} incidentes en el período.`)
  }

  // Regla 3: proveedor repetido
  for (const t of tiendas.slice(0, 2)) {
    if (t.proveedorNombre && t.incidentes >= 2) {
      conclusiones.push(`Los incidentes de ${t.tiendaCodigo} están asociados principalmente a ${t.proveedorNombre}.`)
    }
  }

  // Regla 4: sin contingencia
  const sinCont = tiendas.filter((t) => !t.tieneContingencia && t.incidentes >= 2)
  if (sinCont.length > 0) {
    conclusiones.push(`Se recomienda evaluar contingencia para ${sinCont[0].tiendaCodigo} por reincidencia e impacto acumulado.`)
  }

  // Regla 5: costo > promedio
  const avgCosto = tiendas.reduce((s, t) => s + t.costoEstimado, 0) / tiendas.length
  const sobrepasan = tiendas.filter((t) => t.costoEstimado > avgCosto)
  if (sobrepasan.length > 0) {
    conclusiones.push(`${sobrepasan[0].tiendaCodigo} supera el impacto económico promedio del período.`)
  }

  return conclusiones
}
