import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { DASHBOARD_CONFIG } from '@/lib/dashboard-config'
import {
  getVentaHoraEstimadaOrNull,
  parseSlaMinutos,
  getSLACumplido,
  getScoreProveedor,
  getMTTRTexto,
} from '@/lib/dashboard-calculations'
import { calcImpactoRow } from '@/lib/impacto-calc'
import {
  fetchIncidentesPeriodo,
  fetchEscalamientosPeriodo,
  fetchVentasDiarias,
  fetchProveedoresList,
  type RawIncidente,
  type RawEscalamiento,
  type RawVentaDiaria,
} from '@/lib/dashboard-queries'
import type { DashboardAnaliticoResponse } from '@/types/dashboard'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'dashboard.ver')) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desdeParam   = searchParams.get('desde')
  const hastaParam   = searchParams.get('hasta')
  const proveedorId  = searchParams.get('proveedorId') || null  // value = provider name

  const hasta  = hastaParam  ? new Date(hastaParam  + 'T23:59:59').toISOString() : new Date().toISOString()
  const desde  = desdeParam  ? new Date(desdeParam  + 'T00:00:00').toISOString() : (() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString()
  })()

  const daysDiff = (new Date(hasta).getTime() - new Date(desde).getTime()) / 86400000
  const prevHasta = desde
  const prevDesde = new Date(new Date(desde).getTime() - daysDiff * 86400000).toISOString()

  const [incidentes, escalamientos, ventasDiarias, proveedoresList, prevIncidentes] = await Promise.all([
    fetchIncidentesPeriodo(desde, hasta, proveedorId),
    fetchEscalamientosPeriodo(desde, hasta, proveedorId),
    fetchVentasDiarias(),
    fetchProveedoresList(),
    fetchIncidentesPeriodo(prevDesde, prevHasta, proveedorId),
  ])

  const prevEscalamientos = await fetchEscalamientosPeriodo(prevDesde, prevHasta, proveedorId)

  const result = buildCards(incidentes, escalamientos, ventasDiarias, prevIncidentes, prevEscalamientos)

  return NextResponse.json({
    periodo: { desde, hasta },
    proveedores: proveedoresList,
    cards: result,
  } satisfies DashboardAnaliticoResponse)
}

// ─── SLA helpers ────────────────────────────────────────────────────────────

function escsByIncidente(escs: RawEscalamiento[]): Map<string, RawEscalamiento[]> {
  const m = new Map<string, RawEscalamiento[]>()
  for (const e of escs) {
    if (!m.has(e.incidente_id)) m.set(e.incidente_id, [])
    m.get(e.incidente_id)!.push(e)
  }
  return m
}

function isSLACumplido(escs: RawEscalamiento[]): boolean {
  if (escs.length === 0) return true
  return escs.every((e) => {
    const slaMin = parseSlaMinutos(e.tiempo_resp_sev1)
    return getSLACumplido(e.tiempo_respuesta_min, e.hora_respuesta, slaMin)
  })
}

function calcExcessoMin(escs: RawEscalamiento[]): number {
  const excesses = escs
    .map((e) => {
      const slaMin = parseSlaMinutos(e.tiempo_resp_sev1)
      if (!slaMin || e.tiempo_respuesta_min == null) return null
      return Math.max(0, e.tiempo_respuesta_min - slaMin)
    })
    .filter((v): v is number => v !== null)
  if (excesses.length === 0) return 0
  return Math.round(excesses.reduce((a, b) => a + b, 0) / excesses.length)
}

// ─── Cost helpers ────────────────────────────────────────────────────────────

function calcCostoIncidente(
  inc: RawIncidente,
  ventasDiarias: RawVentaDiaria[],
): { costo: number; ventaAfectada: number; factor: number; motivo: string } {
  const ventaHora = getVentaHoraEstimadaOrNull(
    inc.tienda_codigo, inc.dia_semana, inc.venta_hora_soles, inc.cluster, ventasDiarias,
  )
  const res = calcImpactoRow({
    hora_registro: inc.hora_registro,
    hora_fin: inc.hora_fin,
    estado: inc.estado,
    tipo: inc.tipo,
    ventaHoraResolvida: ventaHora,
    contingencia_activa: inc.contingencia_activa,
  })
  return {
    costo: res.impactoEstimado,
    ventaAfectada: res.ventaEsperadaAfectada ?? 0,
    factor: res.factorAplicado,
    motivo: res.motivoFactor,
  }
}

function fmtFechaInc(hora: Date | string): string {
  return new Date(hora).toLocaleDateString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima',
  })
}

// ─── By-day helpers ──────────────────────────────────────────────────────────

function buildByDay(incs: RawIncidente[]) {
  const map = new Map<string, { total: number; mttrSum: number; mttrCount: number }>()
  for (const i of incs) {
    const dia = new Date(i.hora_registro).toLocaleDateString('sv-SE', { timeZone: 'America/Lima' })
    if (!map.has(dia)) map.set(dia, { total: 0, mttrSum: 0, mttrCount: 0 })
    const d = map.get(dia)!
    d.total++
    if (i.mttr_minutos) { d.mttrSum += i.mttr_minutos; d.mttrCount++ }
  }
  const days = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  return {
    byDay: days.map(([dia, d]) => ({ dia, total: d.total })),
    byDayMttr: days.map(([dia, d]) => ({
      dia,
      mttrMinutos: d.mttrCount > 0 ? Math.round(d.mttrSum / d.mttrCount) : null,
    })),
  }
}

// ─── Reincidencia razon ───────────────────────────────────────────────────────

function getRazon(
  incs: RawIncidente[],
  escMap: Map<string, RawEscalamiento[]>,
): string {
  const tipos = [...new Set(incs.map((i) => i.tipo))]
  if (tipos.length === 1) return 'Mismo tipo de caída'
  const allMttr = incs.filter((i) => i.mttr_minutos).map((i) => i.mttr_minutos!)
  const avgMttr = allMttr.length ? allMttr.reduce((a, b) => a + b, 0) / allMttr.length : 0
  if (avgMttr > 240) return 'MTTR alto'
  const slaFail = incs.some((i) => !isSLACumplido(escMap.get(i.id) ?? []))
  if (slaFail) return 'SLA incumplido'
  return 'Costo estimado alto'
}

function topKey(counts: Record<string, number>): string {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

// ─── Main builder ────────────────────────────────────────────────────────────

function buildCards(
  incs: RawIncidente[],
  escs: RawEscalamiento[],
  ventasDiarias: RawVentaDiaria[],
  prevIncs: RawIncidente[],
  prevEscs: RawEscalamiento[],
) {
  const escMap     = escsByIncidente(escs)
  const prevEscMap = escsByIncidente(prevEscs)

  // ── CARD 1: Incidentes ──────────────────────────────────────────────────
  const { byDay, byDayMttr } = buildByDay(incs)

  const dTotal = prevIncs.length > 0
    ? Math.round((incs.length - prevIncs.length) / prevIncs.length * 100)
    : null

  // ── CARD 2: Tiendas afectadas ───────────────────────────────────────────
  type TiendaAccum = {
    id: string; codigo: string; nombre: string; distrito: string | null
    provCount: Record<string, number>; count: number
    latestHora: number; latestEstado: string
  }
  const tiendasDetailMap = new Map<string, TiendaAccum>()
  for (const i of incs) {
    const existing = tiendasDetailMap.get(i.tienda_id)
    const hora = new Date(i.hora_registro).getTime()
    if (existing) {
      existing.count++
      if (i.prov_nombre) existing.provCount[i.prov_nombre] = (existing.provCount[i.prov_nombre] ?? 0) + 1
      if (hora > existing.latestHora) { existing.latestHora = hora; existing.latestEstado = i.estado }
    } else {
      const provCount: Record<string, number> = {}
      if (i.prov_nombre) provCount[i.prov_nombre] = 1
      tiendasDetailMap.set(i.tienda_id, {
        id: i.tienda_id, codigo: i.tienda_codigo,
        nombre: i.tienda_nombre ?? '', distrito: i.tienda_distrito,
        provCount, count: 1, latestHora: hora, latestEstado: i.estado,
      })
    }
  }

  const prevTiendas = new Set(prevIncs.map((i) => i.tienda_id))
  const dTiendas = prevTiendas.size > 0
    ? Math.round((tiendasDetailMap.size - prevTiendas.size) / prevTiendas.size * 100)
    : null

  const tiendasLista = [...tiendasDetailMap.values()]
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map((t) => ({
      id: t.id,
      codigo: t.codigo,
      nombre: t.nombre,
      proveedor: topKey(t.provCount) || '—',
      distrito: t.distrito,
      incidentesCount: t.count,
      ultimoIncidente: new Date(t.latestHora).toLocaleDateString('es-PE', {
        day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima',
      }),
      estadoReciente: t.latestEstado,
    }))

  // ── CARD 3: MTTR promedio ───────────────────────────────────────────────
  const incsConMttr = incs.filter((i) => i.mttr_minutos != null && i.mttr_minutos > 0)
  const mttrActual = incsConMttr.length
    ? Math.round(incsConMttr.reduce((s, i) => s + i.mttr_minutos!, 0) / incsConMttr.length)
    : null

  const prevConMttr = prevIncs.filter((i) => i.mttr_minutos != null && i.mttr_minutos > 0)
  const mttrPrev = prevConMttr.length
    ? Math.round(prevConMttr.reduce((s, i) => s + i.mttr_minutos!, 0) / prevConMttr.length)
    : null

  const dMttr = mttrActual != null && mttrPrev != null ? mttrActual - mttrPrev : null

  const mttrByProv = new Map<string, { sum: number; count: number }>()
  for (const i of incs) {
    if (!i.prov_nombre || !i.mttr_minutos) continue
    if (!mttrByProv.has(i.prov_nombre)) mttrByProv.set(i.prov_nombre, { sum: 0, count: 0 })
    const m = mttrByProv.get(i.prov_nombre)!
    m.sum += i.mttr_minutos; m.count++
  }
  const mttrPorProveedor = [...mttrByProv.entries()]
    .map(([nombre, { sum, count }]) => ({ nombre, mttrMinutos: Math.round(sum / count) }))
    .sort((a, b) => a.mttrMinutos - b.mttrMinutos)

  // ── CARD 4: SLA ─────────────────────────────────────────────────────────
  const slaByProv = new Map<string, { ok: number; total: number; excessSum: number; excessCount: number }>()

  let slaCumplidos = 0
  const evaluables: { codigo: string; tiendaCodigo: string; proveedor: string; tipo: string; fecha: string; cumplido: boolean }[] = []
  for (const i of incs) {
    const incEscs = escMap.get(i.id) ?? []
    const cumplido = isSLACumplido(incEscs)
    if (cumplido) slaCumplidos++

    evaluables.push({
      codigo: i.codigo,
      tiendaCodigo: i.tienda_codigo,
      proveedor: i.prov_nombre ?? '—',
      tipo: i.tipo,
      fecha: fmtFechaInc(i.hora_registro),
      cumplido,
    })

    const prov = i.prov_nombre ?? '—'
    if (!slaByProv.has(prov)) slaByProv.set(prov, { ok: 0, total: 0, excessSum: 0, excessCount: 0 })
    const s = slaByProv.get(prov)!
    s.total++
    if (cumplido) { s.ok++ } else {
      const ex = calcExcessoMin(incEscs)
      if (ex > 0) { s.excessSum += ex; s.excessCount++ }
    }
  }
  const slaPct = incs.length > 0 ? Math.round(slaCumplidos / incs.length * 100) : 0

  let prevSlaOk = 0
  for (const i of prevIncs) {
    if (isSLACumplido(prevEscMap.get(i.id) ?? [])) prevSlaOk++
  }
  const prevSlaPct = prevIncs.length > 0 ? Math.round(prevSlaOk / prevIncs.length * 100) : null
  const dSla = prevSlaPct != null ? slaPct - prevSlaPct : null

  const slaPorProveedor = [...slaByProv.entries()]
    .map(([nombre, s]) => ({
      nombre,
      slaPct: s.total > 0 ? Math.round(s.ok / s.total * 100) : 0,
      excessoPromMin: s.excessCount > 0 ? Math.round(s.excessSum / s.excessCount) : 0,
    }))
    .sort((a, b) => b.slaPct - a.slaPct)

  // ── CARD 5: Costo estimado ──────────────────────────────────────────────
  let costoTotal = 0
  let ventaAfectadaTotal = 0
  const costoByProv   = new Map<string, number>()
  type CostoAccum = { codigo: string; proveedor: string; horas: number; costo: number; ventaAfectada: number; topCosto: number; topFactor: number; topMotivo: string }
  const costoByTienda = new Map<string, CostoAccum>()

  for (const i of incs) {
    const { costo, ventaAfectada, factor, motivo } = calcCostoIncidente(i, ventasDiarias)
    costoTotal += costo
    ventaAfectadaTotal += ventaAfectada

    const prov = i.prov_nombre ?? '—'
    costoByProv.set(prov, (costoByProv.get(prov) ?? 0) + costo)

    const existing = costoByTienda.get(i.tienda_id)
    if (existing) {
      existing.costo += costo
      existing.ventaAfectada += ventaAfectada
      existing.horas += (i.mttr_minutos ?? 0) / 60
      if (costo > existing.topCosto) { existing.topCosto = costo; existing.topFactor = factor; existing.topMotivo = motivo }
    } else {
      costoByTienda.set(i.tienda_id, {
        codigo: i.tienda_codigo, proveedor: prov,
        horas: (i.mttr_minutos ?? 0) / 60,
        costo, ventaAfectada, topCosto: costo, topFactor: factor, topMotivo: motivo,
      })
    }
  }

  let prevCosto = 0
  for (const i of prevIncs) prevCosto += calcCostoIncidente(i, ventasDiarias).costo
  const dCosto = prevCosto > 0
    ? Math.round((costoTotal - prevCosto) / prevCosto * 100)
    : null

  const provCostoSorted  = [...costoByProv.entries()].sort((a, b) => b[1] - a[1])
  const tiendaCostoSorted = [...costoByTienda.values()].sort((a, b) => b.costo - a.costo)
  const top5Tiendas = tiendaCostoSorted.slice(0, 5).map((t) => ({
    codigo: t.codigo,
    proveedor: t.proveedor,
    horas: Math.round(t.horas * 10) / 10,
    costo: Math.round(t.costo),
    ventaAfectada: Math.round(t.ventaAfectada),
    factor: t.topFactor,
    motivo: t.topMotivo,
  }))

  // ── CARD 6: Reincidencia ────────────────────────────────────────────────
  const incsByTienda = new Map<string, RawIncidente[]>()
  for (const i of incs) {
    if (!incsByTienda.has(i.tienda_id)) incsByTienda.set(i.tienda_id, [])
    incsByTienda.get(i.tienda_id)!.push(i)
  }
  const reincidentes = [...incsByTienda.values()]
    .filter((arr) => arr.length >= 2)
    .sort((a, b) => b.length - a.length)
    .map((arr) => {
      const tipoCounts: Record<string, number> = {}
      for (const r of arr) tipoCounts[r.tipo] = (tipoCounts[r.tipo] ?? 0) + 1
      const tipoRepetido = topKey(tipoCounts)
      const costoEstimado = Math.round(costoByTienda.get(arr[0].tienda_id)?.costo ?? 0)
      return {
        id: arr[0].tienda_id,
        codigo: arr[0].tienda_codigo,
        proveedor: arr[0].prov_nombre ?? '—',
        caidas: arr.length,
        razon: getRazon(arr, escMap),
        incidenteCodigos: arr.map((r) => r.codigo),
        tipoRepetido,
        costoEstimado,
      }
    })

  // ── CARD 7: Proveedor crítico ───────────────────────────────────────────
  const provMetricas = new Map<string, {
    nombre: string; incidentes: number; mttrSum: number; mttrCount: number
    slaOk: number; slaTotal: number; costo: number; tiendas: Set<string>
  }>()

  for (const i of incs) {
    const prov = i.prov_nombre ?? '—'
    if (!provMetricas.has(prov)) {
      provMetricas.set(prov, { nombre: prov, incidentes: 0, mttrSum: 0, mttrCount: 0, slaOk: 0, slaTotal: 0, costo: 0, tiendas: new Set() })
    }
    const m = provMetricas.get(prov)!
    m.incidentes++
    m.tiendas.add(i.tienda_id)
    if (i.mttr_minutos) { m.mttrSum += i.mttr_minutos; m.mttrCount++ }
    m.slaTotal++
    if (isSLACumplido(escMap.get(i.id) ?? [])) m.slaOk++
    m.costo += calcCostoIncidente(i, ventasDiarias).costo
  }

  const reincByProv = new Map<string, number>()
  for (const arr of incsByTienda.values()) {
    if (arr.length < 2) continue
    const prov = arr[0].prov_nombre ?? '—'
    reincByProv.set(prov, (reincByProv.get(prov) ?? 0) + 1)
  }

  const provList = [...provMetricas.values()].map((m) => ({
    nombre: m.nombre,
    incidentes: m.incidentes,
    mttrMinutos: m.mttrCount > 0 ? Math.round(m.mttrSum / m.mttrCount) : 0,
    slaPct: m.slaTotal > 0 ? Math.round(m.slaOk / m.slaTotal * 100) : 100,
    costo: Math.round(m.costo),
    reincidenciaTiendas: reincByProv.get(m.nombre) ?? 0,
  }))

  const maximos = {
    costo:               Math.max(...provList.map((p) => p.costo), 1),
    mttrMinutos:         Math.max(...provList.map((p) => p.mttrMinutos), 1),
    reincidenciaTiendas: Math.max(...provList.map((p) => p.reincidenciaTiendas), 1),
    incidentes:          Math.max(...provList.map((p) => p.incidentes), 1),
  }

  let proveedorCritico = null
  if (provList.length > 0) {
    const scored = provList.map((p) => {
      const { score, breakdown } = getScoreProveedor(p, maximos)
      return { ...p, score, breakdown }
    })
    scored.sort((a, b) => b.score - a.score)
    const top = scored[0]
    if (top.score >= 30) {
      proveedorCritico = {
        nombre: top.nombre,
        score: top.score,
        metricas: {
          slaPct: top.slaPct,
          mttrMinutos: top.mttrMinutos,
          costoEstimado: top.costo,
          reincidenciaTiendas: top.reincidenciaTiendas,
          incidentes: top.incidentes,
        },
        scoreBreakdown: top.breakdown as { costo: number; sla: number; mttr: number; reincidencia: number; incidentes: number },
      }
    }
  }

  return {
    incidentes: {
      total: incs.length,
      deltaVsAnterior: dTotal,
      lista: incs.map((i) => ({
        id: i.id,
        codigo: i.codigo,
        tiendaCodigo: i.tienda_codigo,
        tiendaNombre: i.tienda_nombre ?? '',
        proveedor: i.prov_nombre ?? '—',
        tipo: i.tipo,
        estado: i.estado,
        fecha: fmtFechaInc(i.hora_registro),
      })),
      byDay,
    },
    tiendasAfectadas: {
      total: tiendasDetailMap.size,
      porcentajeRed: Math.round((tiendasDetailMap.size / DASHBOARD_CONFIG.TOTAL_TIENDAS_ACTIVAS) * 1000) / 10,
      deltaVsAnterior: dTiendas,
      lista: tiendasLista,
    },
    mttrPromedio: {
      minutos: mttrActual,
      deltaMinutos: dMttr,
      porProveedor: mttrPorProveedor,
      byDay: byDayMttr,
    },
    cumplimientoSLA: {
      porcentaje: slaPct,
      deltaVsAnterior: dSla,
      porProveedor: slaPorProveedor,
      evaluables,
    },
    costoEstimado: {
      total: Math.round(costoTotal),
      ventaAfectadaTotal: Math.round(ventaAfectadaTotal),
      deltaVsAnterior: dCosto,
      proveedorMayorImpacto: provCostoSorted.length > 0
        ? { nombre: provCostoSorted[0][0], costo: Math.round(provCostoSorted[0][1]) }
        : null,
      tiendaMayorImpacto: tiendaCostoSorted.length > 0
        ? { codigo: tiendaCostoSorted[0].codigo, costo: Math.round(tiendaCostoSorted[0].costo) }
        : null,
      top5Tiendas,
    },
    reincidenciaCritica: {
      total: reincidentes.length,
      tiendas: reincidentes,
    },
    proveedorCritico,
  }
}

// Ensure getMTTRTexto is imported so TS doesn't complain about unused
void getMTTRTexto
