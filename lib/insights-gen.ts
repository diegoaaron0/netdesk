import type {
  Insight, InsightCategoria, InsightPrioridad, InsightTipo,
  KpiOrigen, EvidenciaSummary, InsightsResumenGlobal,
} from '@/types/insights'
import { calcSLARow, calcMTTRMin } from './sla-core'
import { calcImpactoRow } from './impacto-calc'
import { getZona } from './geo-zones'

// ─── Raw row type ─────────────────────────────────────────────────────────────

export interface RawInsightsRow {
  id: string
  codigo: string
  tipo: string
  hora_registro: string
  hora_fin: string | null
  estado: string
  otros_clasificacion: string | null
  proveedor_id: string | null
  prov_nombre: string | null
  tienda_id: string | null
  tienda_codigo: string | null
  tienda_nombre: string | null
  tienda_distrito: string | null
  cluster: string | null
  venta_hora_soles: number | null
  tiene_contingencia: boolean | null
  contingencia_activa: boolean | null
  hora_correo_n1: string | null
  hora_primera_resp: string | null
  max_nivel: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMesKey(hora: string): string {
  const d = new Date(hora)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function calcMTTR(row: RawInsightsRow): number | null {
  if (row.estado !== 'RESUELTO') return null
  const m = calcMTTRMin(row.hora_registro, row.hora_fin)
  return m != null ? Math.round(m) : null
}

function calcSLA(row: RawInsightsRow): boolean | null {
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

function calcImpacto(row: RawInsightsRow): number {
  return calcImpactoRow({
    hora_registro: row.hora_registro,
    hora_fin: row.hora_fin,
    estado: row.estado,
    venta_hora_soles: row.venta_hora_soles,
    tipo: row.tipo,
    cluster: row.cluster,
    contingencia_activa: row.contingencia_activa,
    otros_clasificacion: row.otros_clasificacion,
  }).impactoEstimado
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

interface ProvStat {
  nombre: string
  total: number
  evaluables: number
  dentraSLA: number
  fueraSLA: number
  mttrTotal: number
  mttrCount: number
  impacto: number
  meses: Set<string>
  mesSLA: Map<string, { d: number; f: number }>
}

function buildProvStats(rows: RawInsightsRow[]): Map<string, ProvStat> {
  const map = new Map<string, ProvStat>()
  for (const r of rows) {
    if (!r.prov_nombre) continue
    const k = r.prov_nombre
    if (!map.has(k)) map.set(k, { nombre: k, total: 0, evaluables: 0, dentraSLA: 0, fueraSLA: 0, mttrTotal: 0, mttrCount: 0, impacto: 0, meses: new Set(), mesSLA: new Map() })
    const s = map.get(k)!
    s.total++
    s.impacto += calcImpacto(r)
    const sla = calcSLA(r)
    const mes = getMesKey(r.hora_registro)
    s.meses.add(mes)
    if (sla !== null) {
      s.evaluables++
      const ms = s.mesSLA.get(mes) ?? { d: 0, f: 0 }
      if (sla) { s.dentraSLA++; ms.d++ } else { s.fueraSLA++; ms.f++ }
      s.mesSLA.set(mes, ms)
    }
    const mttr = calcMTTR(r)
    if (mttr != null) { s.mttrTotal += mttr; s.mttrCount++ }
  }
  return map
}

function slaPct(s: ProvStat) { return s.evaluables > 0 ? Math.round((s.dentraSLA / s.evaluables) * 100) : null }
function mttrProm(s: ProvStat) { return s.mttrCount > 0 ? Math.round(s.mttrTotal / s.mttrCount) : null }

// ─── Signal rules ─────────────────────────────────────────────────────────────

function uid(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }

function makeInsight(
  categoria: InsightCategoria,
  tipo: InsightTipo,
  prioridad: InsightPrioridad,
  titulo: string,
  descripcion: string,
  accion: string,
  kpis: KpiOrigen[],
  score: number,
  entidad: string,
  entidadTipo: Insight['entidadTipo'],
  evidencia: EvidenciaSummary[],
  metaDatos: Record<string, string | number | null> = {},
): Insight {
  return { id: uid(categoria), categoria, tipo, prioridad, titulo, descripcion, accionSugerida: accion, kpisOrigen: kpis, score, entidad, entidadTipo, evidencia, metaDatos }
}

function regla1_proveedorCritico(rows: RawInsightsRow[], provStats: Map<string, ProvStat>): Insight[] {
  const insights: Insight[] = []
  for (const [, s] of provStats) {
    const sla = slaPct(s)
    const mttr = mttrProm(s)
    if (sla == null) continue
    const slaBajo = sla < 70
    const mttrAlto = mttr != null && mttr > 300
    const impactoAlto = s.impacto > 5000
    const triggers = [slaBajo, mttrAlto, impactoAlto].filter(Boolean).length
    if (triggers >= 2) {
      const prioridad: InsightPrioridad = triggers === 3 ? 'alta' : 'media'
      const score = calcScore({ impacto: s.impacto, evaluables: s.evaluables, fueraSLA: s.fueraSLA, mttrProm: mttr ?? 0, sinContingencia: 0 })
      insights.push(makeInsight(
        'proveedor_critico', 'alerta', prioridad,
        `Proveedor ${s.nombre} en situación crítica combinada`,
        `${s.nombre} presenta ${triggers} indicadores de riesgo: SLA ${sla}% (meta 90%), MTTR promedio ${mttr != null ? Math.round(mttr / 60) + 'h' : 'N/A'}, impacto estimado S/ ${s.impacto.toLocaleString()}.`,
        `Convocar reunión inmediata con ${s.nombre}. Revisar cláusulas contractuales y aplicar penalidades si corresponde. Evaluar proveedor alternativo para tiendas críticas.`,
        ['E', 'G'],
        score, s.nombre, 'proveedor',
        [
          { entidad: s.nombre, metrica: 'SLA', valor: `${sla}%` },
          { entidad: s.nombre, metrica: 'MTTR Prom.', valor: mttr != null ? `${Math.round(mttr / 60)}h ${mttr % 60}m` : '—' },
          { entidad: s.nombre, metrica: 'Impacto estimado', valor: `S/ ${s.impacto.toLocaleString()}` },
          { entidad: s.nombre, metrica: 'Incidentes evaluables', valor: String(s.evaluables) },
        ],
        { sla, mttr, impacto: s.impacto },
      ))
    }
  }
  return insights
}

function regla2_incumplimientoSostenido(rows: RawInsightsRow[], provStats: Map<string, ProvStat>): Insight[] {
  const insights: Insight[] = []
  for (const [, s] of provStats) {
    const meses = Array.from(s.mesSLA.keys()).sort()
    if (meses.length < 3) continue
    const last3 = meses.slice(-3)
    const allBelow = last3.every(m => {
      const ms = s.mesSLA.get(m)!
      const total = ms.d + ms.f
      return total > 0 && (ms.d / total) * 100 < 80
    })
    if (!allBelow) continue
    const sla = slaPct(s)
    const score = calcScore({ impacto: s.impacto, evaluables: s.evaluables, fueraSLA: s.fueraSLA, mttrProm: mttrProm(s) ?? 0, sinContingencia: 0 })
    insights.push(makeInsight(
      'incumplimiento_sostenido', 'alerta', 'alta',
      `${s.nombre}: incumplimiento SLA sostenido 3+ meses`,
      `${s.nombre} ha incumplido la meta SLA (<80%) durante los últimos 3 meses consecutivos (${last3.join(', ')}). SLA actual: ${sla}%.`,
      `Iniciar proceso formal de mejora con ${s.nombre}. Establecer plan de acción mensual con métricas de salida. Considerar escalar a dirección si no hay mejora en 30 días.`,
      ['E', 'G'],
      score, s.nombre, 'proveedor',
      last3.map(m => {
        const ms = s.mesSLA.get(m)!
        const t = ms.d + ms.f
        return { entidad: m, metrica: 'SLA', valor: t > 0 ? `${Math.round((ms.d / t) * 100)}%` : 'N/E' }
      }),
      { meses: last3.join(','), sla },
    ))
  }
  return insights
}

function regla3_tiendaSinContingencia(rows: RawInsightsRow[]): Insight[] {
  const countMap = new Map<string, { nombre: string; total: number; sinCont: boolean }>()
  for (const r of rows) {
    if (!r.tienda_id) continue
    const k = r.tienda_id
    if (!countMap.has(k)) countMap.set(k, { nombre: r.tienda_nombre ?? r.tienda_codigo ?? k, total: 0, sinCont: !r.tiene_contingencia })
    countMap.get(k)!.total++
  }
  const insights: Insight[] = []
  for (const [, t] of countMap) {
    if (!t.sinCont || t.total < 2) continue
    const score = 40 + Math.min(t.total * 3, 30)
    insights.push(makeInsight(
      'tienda_sin_contingencia', 'accion', t.total >= 5 ? 'alta' : 'media',
      `Tienda ${t.nombre}: sin contingencia y ${t.total} incidentes`,
      `La tienda ${t.nombre} no cuenta con plan de contingencia y ha tenido ${t.total} incidentes en el período. Alta exposición operativa.`,
      `Coordinar con el área de operaciones para dotar a ${t.nombre} de un plan de contingencia (datos móviles / router backup). Priorizar si tiene SLA crítico.`,
      ['C', 'F'],
      score, t.nombre, 'tienda',
      [{ entidad: t.nombre, metrica: 'Incidentes', valor: String(t.total) }, { entidad: t.nombre, metrica: 'Contingencia', valor: 'No' }],
      { incidentes: t.total },
    ))
  }
  return insights
}

function regla4_tipoDominante(rows: RawInsightsRow[]): Insight[] {
  const total = rows.length
  if (total === 0) return []
  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.tipo] = (counts[r.tipo] ?? 0) + 1
  const insights: Insight[] = []
  for (const [tipo, cnt] of Object.entries(counts)) {
    const pct = Math.round((cnt / total) * 100)
    if (pct < 40) continue
    insights.push(makeInsight(
      'tipo_dominante', 'accion', pct >= 55 ? 'alta' : 'media',
      `Tipo de incidente dominante: ${tipo} (${pct}% del total)`,
      `${tipo} representa el ${pct}% de todos los incidentes del período (${cnt} de ${total}). Una concentración tan alta sugiere un problema sistémico.`,
      `Analizar causa raíz del patrón ${tipo}. Revisar configuración de red/infraestructura que podría estar generando este tipo de falla de forma recurrente.`,
      ['D'],
      50 + pct / 2,
      tipo, 'tipo',
      [{ entidad: tipo, metrica: 'Cantidad', valor: String(cnt) }, { entidad: tipo, metrica: '% del total', valor: `${pct}%` }],
      { tipo, cnt, pct },
    ))
  }
  return insights
}

function regla5_zonaCritica(rows: RawInsightsRow[]): Insight[] {
  const zonaMap = new Map<string, { total: number; fueraSLA: number; evaluables: number; impacto: number }>()
  for (const r of rows) {
    const zona = getZona(r.tienda_distrito, r.cluster)
    if (!zonaMap.has(zona)) zonaMap.set(zona, { total: 0, fueraSLA: 0, evaluables: 0, impacto: 0 })
    const z = zonaMap.get(zona)!
    z.total++
    z.impacto += calcImpacto(r)
    const sla = calcSLA(r)
    if (sla !== null) { z.evaluables++; if (!sla) z.fueraSLA++ }
  }
  const insights: Insight[] = []
  for (const [zona, z] of zonaMap) {
    if (z.evaluables < 3) continue
    const sla = Math.round(((z.evaluables - z.fueraSLA) / z.evaluables) * 100)
    if (sla >= 70) continue
    const score = calcScore({ impacto: z.impacto, evaluables: z.evaluables, fueraSLA: z.fueraSLA, mttrProm: 0, sinContingencia: 0 })
    insights.push(makeInsight(
      'zona_critica', 'alerta', sla < 50 ? 'alta' : 'media',
      `Zona crítica detectada: ${zona} (SLA ${sla}%)`,
      `La zona ${zona} concentra ${z.total} incidentes con SLA ${sla}% (meta 90%) e impacto estimado S/ ${z.impacto.toLocaleString()}.`,
      `Asignar supervisor de campo para ${zona}. Revisar cobertura de proveedores en la zona y evaluar cambios de proveedor para tiendas con peor desempeño.`,
      ['F'],
      score, zona, 'zona',
      [
        { entidad: zona, metrica: 'SLA', valor: `${sla}%` },
        { entidad: zona, metrica: 'Incidentes', valor: String(z.total) },
        { entidad: zona, metrica: 'Impacto', valor: `S/ ${z.impacto.toLocaleString()}` },
      ],
      { zona, sla, impacto: z.impacto },
    ))
  }
  return insights
}

function regla6_otrosRepetido(rows: RawInsightsRow[]): Insight[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (r.tipo !== 'OTROS' || !r.otros_clasificacion) continue
    const k = r.otros_clasificacion.trim().toLowerCase()
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const insights: Insight[] = []
  for (const [causa, cnt] of counts) {
    if (cnt < 3) continue
    const display = causa.charAt(0).toUpperCase() + causa.slice(1)
    insights.push(makeInsight(
      'otros_repetido', 'accion', cnt >= 6 ? 'alta' : 'media',
      `Causa OTROS repetida: "${display}" (${cnt} veces)`,
      `La clasificación "${display}" en incidentes tipo OTROS aparece ${cnt} veces. Podría corresponder a un tipo de incidente no categorizado en el sistema.`,
      `Evaluar si "${display}" debe convertirse en una categoría oficial en el sistema. Revisar los incidentes agrupados y asignar al proveedor correspondiente.`,
      ['D'],
      30 + cnt * 5,
      display, 'global',
      [{ entidad: display, metrica: 'Ocurrencias', valor: String(cnt) }],
      { causa: display, cnt },
    ))
  }
  return insights
}

function regla7_mejoraPositiva(rows: RawInsightsRow[], provStats: Map<string, ProvStat>): Insight[] {
  const insights: Insight[] = []
  for (const [, s] of provStats) {
    const meses = Array.from(s.mesSLA.keys()).sort()
    if (meses.length < 3) continue
    const last3 = meses.slice(-3)
    let allImproving = true
    let prev: number | null = null
    for (const m of last3) {
      const ms = s.mesSLA.get(m)!
      const t = ms.d + ms.f
      const sla = t > 0 ? (ms.d / t) * 100 : null
      if (sla == null || (prev != null && sla <= prev)) { allImproving = false; break }
      prev = sla
    }
    if (!allImproving) continue
    const slaActual = slaPct(s)
    if (slaActual == null || slaActual < 80) continue
    insights.push(makeInsight(
      'mejora_positiva', 'logro', 'baja',
      `${s.nombre}: tendencia positiva sostenida 3 meses`,
      `${s.nombre} muestra mejora continua en SLA durante los últimos 3 meses, alcanzando ${slaActual}% en el período más reciente.`,
      `Mantener las condiciones actuales. Compartir buenas prácticas de ${s.nombre} con otros proveedores. Considerar para renegociación de contrato con mejores términos.`,
      ['E', 'G'],
      20, s.nombre, 'proveedor',
      last3.map(m => {
        const ms = s.mesSLA.get(m)!
        const t = ms.d + ms.f
        return { entidad: m, metrica: 'SLA', valor: t > 0 ? `${Math.round((ms.d / t) * 100)}%` : 'N/E' }
      }),
      { meses: last3.join(','), slaActual },
    ))
  }
  return insights
}

// ─── Score ────────────────────────────────────────────────────────────────────

function calcScore(p: { impacto: number; evaluables: number; fueraSLA: number; mttrProm: number; sinContingencia: number }): number {
  const impactoN  = Math.min(p.impacto / 20000, 1) * 30
  const slaBAjoN  = p.evaluables > 0 ? Math.min(p.fueraSLA / p.evaluables, 1) * 25 : 0
  const mttrN     = Math.min(p.mttrProm / 720, 1) * 15
  const contN     = p.sinContingencia > 0 ? 10 : 0
  return Math.round(impactoN + slaBAjoN + mttrN + contN)
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicar(insights: Insight[]): Insight[] {
  // Merge multiple negative signals for same proveedor into one
  const grupos = new Map<string, Insight[]>()
  const rest: Insight[] = []
  for (const ins of insights) {
    if (ins.entidadTipo === 'proveedor' && ins.tipo !== 'logro') {
      const k = ins.entidad
      if (!grupos.has(k)) grupos.set(k, [])
      grupos.get(k)!.push(ins)
    } else {
      rest.push(ins)
    }
  }
  const merged: Insight[] = []
  for (const [prov, group] of grupos) {
    if (group.length === 1) { merged.push(group[0]); continue }
    const worst = group.reduce((a, b) => b.score > a.score ? b : a)
    const allCats = Array.from(new Set(group.flatMap(g => g.kpisOrigen))) as KpiOrigen[]
    const allEv   = group.flatMap(g => g.evidencia)
    merged.push({
      ...worst,
      id: uid('proveedor_critico'),
      categoria: 'proveedor_critico',
      titulo: `Proveedor ${prov}: múltiples alertas críticas`,
      descripcion: group.map(g => g.descripcion).join(' '),
      accionSugerida: group[0].accionSugerida,
      kpisOrigen: allCats,
      evidencia: allEv.slice(0, 8),
    })
  }
  return [...merged, ...rest]
}

// ─── Conclusiones ─────────────────────────────────────────────────────────────

function buildConclusiones(insights: Insight[], resumen: InsightsResumenGlobal): string[] {
  const c: string[] = []
  const alertas = insights.filter(i => i.tipo === 'alerta' && i.prioridad === 'alta')
  if (alertas.length > 0) c.push(`Se detectaron ${alertas.length} alerta(s) de prioridad alta que requieren acción inmediata.`)
  const logros = insights.filter(i => i.tipo === 'logro')
  if (logros.length > 0) c.push(`${logros.map(l => l.entidad).join(', ')} muestra(n) tendencia positiva sostenida — modelo a seguir.`)
  if (resumen.slaPromedioGlobal != null) {
    if (resumen.slaPromedioGlobal >= 90) c.push(`El SLA global del período es ${resumen.slaPromedioGlobal}%, cumpliendo la meta institucional del 90%.`)
    else c.push(`El SLA global del período es ${resumen.slaPromedioGlobal}%, por debajo de la meta del 90%. Se requiere plan de mejora.`)
  }
  if (resumen.impactoEstimadoTotal > 0) c.push(`El impacto económico estimado del período es S/ ${resumen.impactoEstimadoTotal.toLocaleString()}.`)
  const sinCont = insights.filter(i => i.categoria === 'tienda_sin_contingencia')
  if (sinCont.length > 0) c.push(`${sinCont.length} tienda(s) sin plan de contingencia con 2+ incidentes. Priorizar dotación de backup.`)
  return c
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildInsights(rows: RawInsightsRow[]): {
  insights: Insight[]
  resumenGlobal: InsightsResumenGlobal
  conclusiones: string[]
} {
  const provStats = buildProvStats(rows)

  const raw = [
    ...regla1_proveedorCritico(rows, provStats),
    ...regla2_incumplimientoSostenido(rows, provStats),
    ...regla3_tiendaSinContingencia(rows),
    ...regla4_tipoDominante(rows),
    ...regla5_zonaCritica(rows),
    ...regla6_otrosRepetido(rows),
    ...regla7_mejoraPositiva(rows, provStats),
  ]

  const deduped  = deduplicar(raw)
  const sorted   = deduped.sort((a, b) => {
    const pOrd = { alta: 0, media: 1, baja: 2 }
    const tOrd = { alerta: 0, accion: 1, logro: 2 }
    const pDiff = pOrd[a.prioridad] - pOrd[b.prioridad]
    if (pDiff !== 0) return pDiff
    const tDiff = tOrd[a.tipo] - tOrd[b.tipo]
    if (tDiff !== 0) return tDiff
    return b.score - a.score
  })

  // Global resumen
  let totalEval = 0, totalDentra = 0, totalImpacto = 0
  for (const [, s] of provStats) { totalEval += s.evaluables; totalDentra += s.dentraSLA; totalImpacto += s.impacto }
  const slaGlobal = totalEval > 0 ? Math.round((totalDentra / totalEval) * 100) : null

  const alertas  = sorted.filter(i => i.tipo === 'alerta')
  const peor = alertas.length > 0 ? alertas.reduce((a, b) => b.score > a.score ? b : a) : null

  const resumenGlobal: InsightsResumenGlobal = {
    totalInsights: sorted.length,
    alertasAltas: sorted.filter(i => i.tipo === 'alerta' && i.prioridad === 'alta').length,
    accionesPendientes: sorted.filter(i => i.tipo === 'accion').length,
    logros: sorted.filter(i => i.tipo === 'logro').length,
    entidadMasCritica: peor?.entidad ?? '—',
    entidadMasCriticaTipo: peor?.entidadTipo ?? '—',
    slaPromedioGlobal: slaGlobal,
    impactoEstimadoTotal: totalImpacto,
  }

  const conclusiones = buildConclusiones(sorted, resumenGlobal)

  return { insights: sorted, resumenGlobal, conclusiones }
}
