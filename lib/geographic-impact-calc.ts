import type {
  ZonaResumen, DistritoDetalle, TiendaZonaDetalle,
  PatronGeografico, GeographicResumenGlobal, ZonaEstado, TiendaMapPoint,
} from '@/types/geographic-impact'
import { calcSLARow, calcMTTRMin } from './sla-core'
import { calcImpactoRow } from './impacto-calc'
import { getZona } from './geo-zones'

export interface RawGeoRow {
  id: string
  codigo: string
  tipo: string
  hora_registro: Date | string
  hora_fin: Date | string | null
  estado: string
  proveedor_id: string | null
  prov_nombre: string | null
  tienda_id: string
  tienda_codigo: string
  tienda_nombre: string | null
  tienda_distrito: string | null
  tienda_coordenadas: string | null
  cluster: string | null
  venta_hora_soles: number | null
  tiene_contingencia: boolean
  contingencia_activa: boolean
  hora_correo_n1: Date | string | null
  hora_primera_resp: Date | string | null
  max_nivel: number | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function avg(vals: number[]): number | null {
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}
function topKey(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts)
  if (!entries.length) return null
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}
function calcImpacto(row: RawGeoRow): number {
  return calcImpactoRow(row).impactoEstimado
}
function calcSLA(row: RawGeoRow): boolean | null {
  if (row.estado !== 'RESUELTO' || !row.hora_fin) return null
  const res = calcSLARow({
    tipo: row.tipo,
    hora_correo_n1: row.hora_correo_n1,
    hora_primera_resp: row.hora_primera_resp,
    hora_fin: row.hora_fin,
    max_nivel: row.max_nivel,
  })
  return res.evaluable ? res.slaGeneral : null
}
function getEstado(slaPct: number | null, incidentes: number): ZonaEstado {
  if (slaPct != null) {
    if (slaPct < 70) return 'critica'
    if (slaPct < 90) return 'revisar'
    return 'optima'
  }
  if (incidentes >= 3) return 'critica'
  if (incidentes >= 2) return 'revisar'
  return 'optima'
}

// ─── Build Zonas ─────────────────────────────────────────────────────────────

export function buildZonas(rows: RawGeoRow[]): ZonaResumen[] {
  const map = new Map<string, RawGeoRow[]>()
  for (const row of rows) {
    const zona = getZona(row.tienda_distrito, row.cluster)
    if (!map.has(zona)) map.set(zona, [])
    map.get(zona)!.push(row)
  }
  const total = rows.length || 1

  const result: ZonaResumen[] = []
  for (const [zona, zRows] of map.entries()) {
    const tiendasSet = new Set(zRows.map((r) => r.tienda_id))

    const mttrVals = zRows
      .filter((r) => r.estado === 'RESUELTO' && r.hora_fin)
      .map((r) => calcMTTRMin(r.hora_registro, r.hora_fin))
      .filter((v): v is number => v != null && v > 0)

    const slaResults = zRows.map(calcSLA).filter((v): v is boolean => v !== null)
    const slaPct = slaResults.length > 0
      ? Math.round((slaResults.filter(Boolean).length / slaResults.length) * 100)
      : null

    const impacto = zRows.reduce((s, r) => s + calcImpacto(r), 0)

    const provCounts: Record<string, number> = {}
    for (const r of zRows) {
      if (r.prov_nombre) provCounts[r.prov_nombre] = (provCounts[r.prov_nombre] ?? 0) + 1
    }

    result.push({
      zona,
      incidentes: zRows.length,
      pctDelTotal: Math.round((zRows.length / total) * 100),
      tiendasAfectadas: tiendasSet.size,
      mttrPromMin: avg(mttrVals),
      slaPct,
      impactoEstimado: impacto,
      proveedorDominante: topKey(provCounts),
      estado: getEstado(slaPct, zRows.length),
    })
  }

  return result.sort((a, b) => b.incidentes - a.incidentes)
}

// ─── Build Distritos ─────────────────────────────────────────────────────────

export function buildDistritos(rows: RawGeoRow[]): DistritoDetalle[] {
  const map = new Map<string, RawGeoRow[]>()
  for (const row of rows) {
    const key = row.tienda_distrito ?? 'Sin distrito'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(row)
  }

  const result: DistritoDetalle[] = []
  for (const [distrito, dRows] of map.entries()) {
    const zona = getZona(distrito === 'Sin distrito' ? null : distrito, dRows[0]?.cluster ?? null)
    const tiendasSet = new Set(dRows.map((r) => r.tienda_id))

    const mttrVals = dRows
      .filter((r) => r.estado === 'RESUELTO' && r.hora_fin)
      .map((r) => calcMTTRMin(r.hora_registro, r.hora_fin))
      .filter((v): v is number => v != null && v > 0)

    const slaResults = dRows.map(calcSLA).filter((v): v is boolean => v !== null)
    const slaPct = slaResults.length > 0
      ? Math.round((slaResults.filter(Boolean).length / slaResults.length) * 100)
      : null

    const provCounts: Record<string, number> = {}
    for (const r of dRows) {
      if (r.prov_nombre) provCounts[r.prov_nombre] = (provCounts[r.prov_nombre] ?? 0) + 1
    }

    result.push({
      distrito,
      zona,
      incidentes: dRows.length,
      tiendasAfectadas: tiendasSet.size,
      proveedorDominante: topKey(provCounts),
      mttrPromMin: avg(mttrVals),
      slaPct,
      impactoEstimado: dRows.reduce((s, r) => s + calcImpacto(r), 0),
      estado: getEstado(slaPct, dRows.length),
    })
  }

  return result.sort((a, b) => b.incidentes - a.incidentes)
}

// ─── Build Tiendas por Zona ───────────────────────────────────────────────────

export function buildTiendasPorZona(rows: RawGeoRow[], zona: string): TiendaZonaDetalle[] {
  const filtered = zona
    ? rows.filter((r) => getZona(r.tienda_distrito, r.cluster) === zona)
    : rows

  const map = new Map<string, RawGeoRow[]>()
  for (const row of filtered) {
    if (!map.has(row.tienda_id)) map.set(row.tienda_id, [])
    map.get(row.tienda_id)!.push(row)
  }

  const result: TiendaZonaDetalle[] = []
  for (const [tiendaId, tRows] of map.entries()) {
    const first = tRows[0]
    const mttrVals = tRows
      .filter((r) => r.estado === 'RESUELTO' && r.hora_fin)
      .map((r) => calcMTTRMin(r.hora_registro, r.hora_fin))
      .filter((v): v is number => v != null && v > 0)

    const slaResults = tRows.map(calcSLA).filter((v): v is boolean => v !== null)
    const slaPct = slaResults.length > 0
      ? Math.round((slaResults.filter(Boolean).length / slaResults.length) * 100)
      : null

    result.push({
      tiendaId,
      tiendaCodigo: first.tienda_codigo,
      tiendaNombre: first.tienda_nombre ?? '',
      distrito: first.tienda_distrito ?? '',
      proveedorNombre: first.prov_nombre,
      incidentes: tRows.length,
      mttrPromMin: avg(mttrVals),
      slaPct,
      impactoEstimado: tRows.reduce((s, r) => s + calcImpacto(r), 0),
      tieneContingencia: first.tiene_contingencia,
      estado: getEstado(slaPct, tRows.length),
    })
  }

  return result.sort((a, b) => b.incidentes - a.incidentes)
}

// ─── Build Patrones ───────────────────────────────────────────────────────────

export function buildPatrones(rows: RawGeoRow[]): PatronGeografico[] {
  const byZona = new Map<string, RawGeoRow[]>()
  for (const row of rows) {
    const zona = getZona(row.tienda_distrito, row.cluster)
    if (!byZona.has(zona)) byZona.set(zona, [])
    byZona.get(zona)!.push(row)
  }

  const result: PatronGeografico[] = []
  for (const [zona, zRows] of byZona.entries()) {
    if (zRows.length < 2) continue

    // Tipo más frecuente
    const tipoCounts: Record<string, number> = {}
    for (const r of zRows) tipoCounts[r.tipo] = (tipoCounts[r.tipo] ?? 0) + 1
    const tipoTop = topKey(tipoCounts)

    // Proveedor dominante
    const provCounts: Record<string, number> = {}
    for (const r of zRows) {
      if (r.prov_nombre) provCounts[r.prov_nombre] = (provCounts[r.prov_nombre] ?? 0) + 1
    }
    const provTop = topKey(provCounts)
    const provPct = provTop ? Math.round((provCounts[provTop] / zRows.length) * 100) : 0

    // Distritos con más de 1 incidente
    const distCounts: Record<string, number> = {}
    for (const r of zRows) {
      const d = r.tienda_distrito ?? 'Sin distrito'
      distCounts[d] = (distCounts[d] ?? 0) + 1
    }
    const distritosRepetidos = Object.entries(distCounts)
      .filter(([, cnt]) => cnt > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([d]) => d)

    if (!tipoTop) continue

    const TIPO_LABELS: Record<string, string> = {
      CAIDA_TOTAL: 'caída total', INTERMITENCIA: 'intermitencia', LENTITUD: 'lentitud', POS: 'POS', OTROS: 'otros',
    }
    const tipoLabel = TIPO_LABELS[tipoTop] ?? tipoTop.toLowerCase()

    let patronDetectado = `Concentración de incidentes por ${tipoLabel}`
    if (provPct > 50 && provTop) patronDetectado += ` con ${provTop} como proveedor principal`
    if (distritosRepetidos.length > 0) patronDetectado += ` en distritos con reincidencia`

    const causaMap: Record<string, string> = {
      CAIDA_TOTAL: 'Enlace principal caído o falla de nodo',
      INTERMITENCIA: 'Inestabilidad de enlace o saturación',
      LENTITUD: 'Degradación de servicio o congestión',
      POS: 'Falla de terminal POS o conectividad',
      OTROS: 'Causa diversa no clasificada',
    }

    result.push({
      zona,
      patronDetectado,
      proveedorAsociado: provTop,
      distritosRepetidos: distritosRepetidos.slice(0, 4),
      causaProbable: causaMap[tipoTop] ?? 'Sin determinar',
      recomendacion: provPct > 50 && provTop
        ? `Revisar SLA y contingencia con ${provTop} en ${zona}`
        : `Validar infraestructura y contingencia en ${zona}`,
    })
  }

  return result
}

// ─── Build Resumen Global ────────────────────────────────────────────────────

export function buildResumenGlobal(zonas: ZonaResumen[]): GeographicResumenGlobal {
  if (!zonas.length) {
    return { zonaMasAfectada: null, impactoTotal: 0, tiendasAfectadas: 0, peorSLAZona: null, peorSLAPct: null, mayorMTTRZona: null, mayorMTTRMin: null, proveedorDominante: null }
  }

  const zonaMasAfectada = zonas[0]?.zona ?? null
  const impactoTotal = zonas.reduce((s, z) => s + z.impactoEstimado, 0)
  const tiendasAfectadas = zonas.reduce((s, z) => s + z.tiendasAfectadas, 0)

  const conSLA = zonas.filter((z) => z.slaPct != null)
  const peorSLA = conSLA.length ? conSLA.reduce((min, z) => (z.slaPct! < min.slaPct! ? z : min)) : null

  const conMTTR = zonas.filter((z) => z.mttrPromMin != null)
  const mayorMTTR = conMTTR.length ? conMTTR.reduce((max, z) => (z.mttrPromMin! > max.mttrPromMin! ? z : max)) : null

  const provCounts: Record<string, number> = {}
  for (const z of zonas) {
    if (z.proveedorDominante) provCounts[z.proveedorDominante] = (provCounts[z.proveedorDominante] ?? 0) + z.incidentes
  }

  return {
    zonaMasAfectada,
    impactoTotal,
    tiendasAfectadas,
    peorSLAZona: peorSLA?.zona ?? null,
    peorSLAPct: peorSLA?.slaPct ?? null,
    mayorMTTRZona: mayorMTTR?.zona ?? null,
    mayorMTTRMin: mayorMTTR?.mttrPromMin ?? null,
    proveedorDominante: topKey(provCounts),
  }
}

// ─── Build Conclusiones ──────────────────────────────────────────────────────

export function buildConclusiones(zonas: ZonaResumen[], patrones: PatronGeografico[]): string[] {
  if (!zonas.length) return []
  const out: string[] = []

  // Regla 1: zona con más incidentes
  const top = zonas[0]
  if (top) out.push(`${top.zona} concentra la mayor cantidad de incidentes del período (${top.incidentes}).`)

  // Regla 2: zona con mayor impacto
  const topImpacto = [...zonas].sort((a, b) => b.impactoEstimado - a.impactoEstimado)[0]
  if (topImpacto && topImpacto.impactoEstimado > 0) {
    const s = topImpacto.impactoEstimado.toLocaleString('es-PE')
    out.push(`${topImpacto.zona} genera el mayor impacto estimado del período (S/ ${s}).`)
  }

  // Regla 3: SLA crítico
  for (const z of zonas) {
    if (z.slaPct != null && z.slaPct < 70) {
      out.push(`${z.zona} presenta cumplimiento SLA crítico (${z.slaPct}%).`)
    }
  }

  // Regla 4: proveedor concentra >50% en una zona
  for (const z of zonas) {
    if (z.proveedorDominante) {
      out.push(`Los incidentes de ${z.zona} están asociados principalmente a ${z.proveedorDominante}.`)
    }
  }

  // Regla 5: zonas con alto impacto + SLA bajo → priorizar
  for (const z of zonas) {
    if (z.slaPct != null && z.slaPct < 80 && z.impactoEstimado > 0) {
      out.push(`Se recomienda priorizar revisión operativa y contractual en ${z.zona}.`)
    }
  }

  // Regla 6: MTTR alto fuera de Lima
  const provincia = zonas.find((z) => z.zona === 'Provincia')
  if (provincia?.mttrPromMin && provincia.mttrPromMin > 240) {
    out.push('Se recomienda revisar tiempos de atención para tiendas fuera de Lima o zonas alejadas.')
  }

  return out.slice(0, 8)
}

// ─── Build Tiendas para mapa ──────────────────────────────────────────────────

export function buildTiendasGeo(rows: RawGeoRow[]): TiendaMapPoint[] {
  const map = new Map<string, { rows: RawGeoRow[]; coordenadas: string | null; nombre: string | null; distrito: string | null; proveedor: string | null }>()

  for (const row of rows) {
    if (!map.has(row.tienda_id)) {
      map.set(row.tienda_id, {
        rows: [],
        coordenadas: row.tienda_coordenadas ?? null,
        nombre: row.tienda_nombre,
        distrito: row.tienda_distrito,
        proveedor: row.prov_nombre,
      })
    }
    map.get(row.tienda_id)!.rows.push(row)
  }

  const result: TiendaMapPoint[] = []
  for (const [tiendaId, { rows: tRows, coordenadas, nombre, distrito, proveedor }] of map.entries()) {
    const mttrVals = tRows
      .filter((r) => r.estado === 'RESUELTO' && r.hora_fin)
      .map((r) => calcMTTRMin(r.hora_registro, r.hora_fin))
      .filter((v): v is number => v != null && v > 0)

    const slaResults = tRows.map(calcSLA).filter((v): v is boolean => v !== null)
    const slaPct = slaResults.length > 0
      ? Math.round((slaResults.filter(Boolean).length / slaResults.length) * 100)
      : null

    const impacto = tRows.reduce((s, r) => s + calcImpacto(r), 0)

    result.push({
      tiendaId,
      codigo: tRows[0].tienda_codigo,
      nombreCc: nombre,
      distrito,
      proveedor,
      coordenadas,
      slaPct,
      mttrMin: avg(mttrVals),
      impacto: Math.round(impacto),
    })
  }

  return result.filter((t) => t.coordenadas != null)
}
