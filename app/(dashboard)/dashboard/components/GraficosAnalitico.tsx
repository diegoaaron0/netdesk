'use client'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  CartesianGrid, LineChart, Line,
} from 'recharts'
import type { DashboardAnaliticoResponse } from '@/types/dashboard'
import { fmtMin } from './DrillPanel'

function fmtCosto(n: number) {
  return `S/ ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
}

function fmtDia(dia: string) {
  const p = dia.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}` : dia
}

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros', CORTE_ELECTRICO: 'Corte eléctrico',
}
const TIPO_COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#6b7280']

function slaFill(pct: number) {
  if (pct >= 90) return '#16a34a'
  if (pct >= 70) return '#d97706'
  return '#dc2626'
}
function mttrFill(min: number) {
  if (min < 120) return '#16a34a'
  if (min < 240) return '#d97706'
  return '#dc2626'
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Detail({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '0.5px solid var(--border)', marginTop: '10px', paddingTop: '8px' }}>
      {children}
    </div>
  )
}

function DetailLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
      {children}
    </div>
  )
}

function DetailRow({ left, right, rightColor }: { left: React.ReactNode; right: React.ReactNode; rightColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', fontSize: '10px' }}>
      <span style={{ color: 'var(--foreground)' }}>{left}</span>
      <span style={{ fontFamily: 'monospace', color: rightColor ?? 'var(--foreground)' }}>{right}</span>
    </div>
  )
}

// ─── 1. Tendencia diaria ──────────────────────────────────────────────────────

function ChartTendencia({ data }: { data: DashboardAnaliticoResponse }) {
  const byDay = data.cards.incidentes.byDay
  if (!byDay.length) return null

  const peak = byDay.reduce((a, b) => b.total > a.total ? b : a, byDay[0])
  const avg = Math.round(byDay.reduce((s, d) => s + d.total, 0) / byDay.length * 10) / 10

  return (
    <ChartCard title="Tendencia diaria de incidentes">
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={byDay} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="gradInc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#185FA5" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#185FA5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="dia" tick={{ fontSize: 9 }} tickFormatter={fmtDia} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
          <Tooltip
            content={({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null
              return (
                <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '6px', padding: '7px 10px', fontSize: '11px' }}>
                  <div style={{ fontWeight: 600 }}>{fmtDia(label)}</div>
                  <div style={{ color: '#185FA5' }}>{payload[0].value} incidentes</div>
                </div>
              )
            }}
          />
          <Area type="monotone" dataKey="total" stroke="#185FA5" strokeWidth={2} fill="url(#gradInc)" dot={false} activeDot={{ r: 4, fill: '#185FA5' }} />
        </AreaChart>
      </ResponsiveContainer>
      <Detail>
        <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
          Pico: <strong style={{ color: 'var(--foreground)' }}>{fmtDia(peak.dia)}</strong> con {peak.total} incidentes · Promedio: {avg} inc/día
        </span>
      </Detail>
    </ChartCard>
  )
}

// ─── 2. SLA Respuesta por proveedor ──────────────────────────────────────────

function ChartSLARespuesta({ data }: { data: DashboardAnaliticoResponse }) {
  const provs = data.cards.cumplimientoSLA.porProveedor
  if (!provs.length) return null

  const chartData = provs.map(p => ({ nombre: p.nombre, pct: p.slaRespuestaPct }))
  const worst3 = [...data.cards.cumplimientoSLA.evaluables]
    .filter(i => !i.slaRespOk && i.minRespuesta != null)
    .sort((a, b) => (b.minRespuesta ?? 0) - (a.minRespuesta ?? 0))
    .slice(0, 3)

  return (
    <ChartCard title="SLA Respuesta por proveedor">
      <ResponsiveContainer width="100%" height={Math.max(100, provs.length * 42 + 32)}>
        <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 36, left: 0, bottom: 0 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} />
          <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={72} />
          <ReferenceLine x={90} stroke="#15803d" strokeDasharray="4 2" strokeWidth={1.5} />
          <Tooltip formatter={(v: any) => [`${v}%`, 'SLA Respuesta']} />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, formatter: (v: any) => `${v}%` }}>
            {chartData.map((e, i) => <Cell key={i} fill={slaFill(e.pct)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {worst3.length > 0 && (
        <Detail>
          <DetailLabel>Más tardaron en responder</DetailLabel>
          {worst3.map(i => (
            <DetailRow
              key={i.id}
              left={<><strong>{i.proveedor}</strong> · {i.tiendaCodigo} · {i.fecha}</>}
              right={fmtMin(i.minRespuesta)}
              rightColor="#dc2626"
            />
          ))}
        </Detail>
      )}
    </ChartCard>
  )
}

// ─── 3. SLA Resolución por proveedor ─────────────────────────────────────────

function ChartSLAResolucion({ data }: { data: DashboardAnaliticoResponse }) {
  const provs = data.cards.cumplimientoSLA.porProveedor
  if (!provs.length) return null

  const chartData = provs.map(p => ({ nombre: p.nombre, pct: p.slaResolucionPct }))
  const conExceso = provs.filter(p => p.excessoResolucionMin > 0).sort((a, b) => b.excessoResolucionMin - a.excessoResolucionMin)

  return (
    <ChartCard title="SLA Resolución por proveedor">
      <ResponsiveContainer width="100%" height={Math.max(100, provs.length * 42 + 32)}>
        <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 36, left: 0, bottom: 0 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} />
          <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={72} />
          <ReferenceLine x={90} stroke="#15803d" strokeDasharray="4 2" strokeWidth={1.5} />
          <Tooltip formatter={(v: any) => [`${v}%`, 'SLA Resolución']} />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, formatter: (v: any) => `${v}%` }}>
            {chartData.map((e, i) => <Cell key={i} fill={slaFill(e.pct)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {conExceso.length > 0 && (
        <Detail>
          <DetailLabel>Exceso promedio sobre SLA</DetailLabel>
          {conExceso.slice(0, 3).map(p => (
            <DetailRow
              key={p.nombre}
              left={p.nombre}
              right={`+${fmtMin(p.excessoResolucionMin)}`}
              rightColor="#dc2626"
            />
          ))}
        </Detail>
      )}
    </ChartCard>
  )
}

// ─── 4. MTTR por proveedor ────────────────────────────────────────────────────

function ChartMTTR({ data }: { data: DashboardAnaliticoResponse }) {
  const provs = data.cards.mttrPromedio.porProveedor
  const sparkData = data.cards.mttrPromedio.byDay.filter(d => d.mttrMinutos != null).slice(-14)
  if (!provs.length) return null

  const chartData = provs.map(p => ({ nombre: p.nombre, min: p.mttrMinutos }))

  return (
    <ChartCard title="MTTR por proveedor (minutos)">
      <ResponsiveContainer width="100%" height={Math.max(100, provs.length * 42 + 32)}>
        <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `${v}m`} />
          <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={72} />
          <ReferenceLine x={120} stroke="#d97706" strokeDasharray="4 2" strokeWidth={1.5} />
          <Tooltip formatter={(v: any) => [fmtMin(v), 'MTTR']} />
          <Bar dataKey="min" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, formatter: (v: any) => fmtMin(v) }}>
            {chartData.map((e, i) => <Cell key={i} fill={mttrFill(e.min)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {sparkData.length > 2 && (
        <Detail>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>Tendencia MTTR diario</div>
          <ResponsiveContainer width="100%" height={44}>
            <LineChart data={sparkData} margin={{ top: 2, right: 4, left: -32, bottom: 0 }}>
              <XAxis dataKey="dia" tick={false} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 8 }} />
              <Line type="monotone" dataKey="mttrMinutos" stroke="#d97706" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Detail>
      )}
    </ChartCard>
  )
}

// ─── 5. IEI por proveedor ─────────────────────────────────────────────────────

function ChartIEI({ data }: { data: DashboardAnaliticoResponse }) {
  const provs = data.cards.costoEstimado.proveedoresDesglose.filter(p => p.costo > 0)
  const top3 = data.cards.costoEstimado.top5Tiendas.slice(0, 3)
  if (!provs.length) return null

  return (
    <ChartCard title="IEI estimado por proveedor (S/)">
      <ResponsiveContainer width="100%" height={Math.max(100, provs.length * 42 + 32)}>
        <BarChart layout="vertical" data={provs} margin={{ top: 0, right: 64, left: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
          <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={72} />
          <Tooltip formatter={(v: any) => [fmtCosto(v), 'IEI']} />
          <Bar dataKey="costo" fill="#b45309" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, fill: '#b45309', formatter: (v: any) => fmtCosto(v) }} />
        </BarChart>
      </ResponsiveContainer>
      {top3.length > 0 && (
        <Detail>
          <DetailLabel>Top tiendas más afectadas</DetailLabel>
          {top3.map((t, idx) => (
            <DetailRow
              key={t.codigo}
              left={<>{idx + 1}. <strong>{t.codigo}</strong> · {t.horasAfectadas}h caída</>}
              right={fmtCosto(t.costo)}
              rightColor="#b45309"
            />
          ))}
        </Detail>
      )}
    </ChartCard>
  )
}

// ─── 6. Distribución por tipo ─────────────────────────────────────────────────

function ChartTipos({ data }: { data: DashboardAnaliticoResponse }) {
  const incs = data.cards.incidentes.lista
  if (!incs.length) return null

  const tipoAcc: Record<string, { count: number; mttrSum: number; mttrN: number; ieiSum: number }> = {}
  for (const i of incs) {
    if (!tipoAcc[i.tipo]) tipoAcc[i.tipo] = { count: 0, mttrSum: 0, mttrN: 0, ieiSum: 0 }
    tipoAcc[i.tipo].count++
    if (i.mttrMin) { tipoAcc[i.tipo].mttrSum += i.mttrMin; tipoAcc[i.tipo].mttrN++ }
    tipoAcc[i.tipo].ieiSum += i.ieiEstimado
  }

  const pieData = Object.entries(tipoAcc)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([tipo, d]) => ({
      tipo, value: d.count,
      label: TIPO_LABELS[tipo] ?? tipo,
      mttrProm: d.mttrN > 0 ? Math.round(d.mttrSum / d.mttrN) : null,
      ieiProm: d.count > 0 ? Math.round(d.ieiSum / d.count) : 0,
    }))

  const dominant = pieData[0]

  return (
    <ChartCard title="Distribución por tipo">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PieChart width={170} height={150}>
          <Pie data={pieData} cx={85} cy={75} innerRadius={42} outerRadius={68} paddingAngle={2} dataKey="value" nameKey="label">
            {pieData.map((_, i) => <Cell key={i} fill={TIPO_COLORS[i % TIPO_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: any, name: any) => [v, name]} />
        </PieChart>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
        {pieData.map((e, i) => (
          <div key={e.tipo} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: TIPO_COLORS[i % TIPO_COLORS.length], flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{e.label}</span>
            <span style={{ fontWeight: 600 }}>{e.value}</span>
            <span style={{ color: 'var(--muted-foreground)', width: '28px', textAlign: 'right' }}>{Math.round(e.value / incs.length * 100)}%</span>
          </div>
        ))}
      </div>
      {dominant && (
        <Detail>
          <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
            <strong style={{ color: 'var(--foreground)' }}>{dominant.label}</strong> domina
            {dominant.mttrProm != null && <> · MTTR prom. {fmtMin(dominant.mttrProm)}</>}
            {dominant.ieiProm > 0 && <> · IEI prom. {fmtCosto(dominant.ieiProm)}</>}
          </span>
        </Detail>
      )}
    </ChartCard>
  )
}

// ─── 7. Supervisores ──────────────────────────────────────────────────────────

function ChartSupervisores({ data }: { data: DashboardAnaliticoResponse }) {
  const supervisores = data.graficos?.supervisores ?? []
  if (!supervisores.length) return null

  const chartData = supervisores.slice(0, 8)
  const top = supervisores[0]

  const TruncTick = ({ x, y, payload }: any) => {
    const name: string = payload.value ?? ''
    const short = name.length > 13 ? name.slice(0, 13) + '…' : name
    return <text x={x} y={y} dy={4} textAnchor="end" fontSize={10} fill="currentColor">{short}</text>
  }

  return (
    <ChartCard title="Incidentes por supervisor">
      <ResponsiveContainer width="100%" height={Math.max(100, chartData.length * 38 + 32)}>
        <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 9 }} />
          <YAxis type="category" dataKey="nombre" tick={<TruncTick />} width={90} />
          <Tooltip
            content={({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null
              const s = supervisores.find(x => x.nombre === label)
              return (
                <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', maxWidth: '200px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{label}</div>
                  <div>{payload[0].value} incidentes · {s?.tiendasAfectadas} tiendas</div>
                  {s && <div style={{ color: '#b45309' }}>{fmtCosto(s.ieiTotal)} IEI total</div>}
                  {s?.tiempoTotalMin ? <div style={{ color: 'var(--muted-foreground)' }}>{fmtMin(s.tiempoTotalMin)} tiempo caído</div> : null}
                </div>
              )
            }}
          />
          <Bar dataKey="incidentes" fill="#185FA5" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {top && (
        <Detail>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '4px' }}>
            {top.nombre} · {top.incidentes} inc · {fmtCosto(top.ieiTotal)} · {fmtMin(top.tiempoTotalMin)} caído
          </div>
          {top.tiendas.slice(0, 4).map(t => (
            <DetailRow
              key={t.codigo}
              left={<><strong>{t.codigo}</strong> · {t.incidentes} inc · {fmtMin(t.tiempoTotalMin)} caído</>}
              right={fmtCosto(t.ieiTotal)}
              rightColor="#b45309"
            />
          ))}
        </Detail>
      )}
    </ChartCard>
  )
}

// ─── 8. Clusters ─────────────────────────────────────────────────────────────

function ChartClusters({ data }: { data: DashboardAnaliticoResponse }) {
  const clusters = data.graficos?.clusters ?? []
  if (!clusters.length) return null

  const maxInc = Math.max(...clusters.map(c => c.incidentes), 1)
  const ACCENT: Record<string, string> = { A: '#1d4ed8', B: '#16a34a', C: '#d97706', D: '#dc2626' }
  const BG: Record<string, string>     = { A: '#eff6ff', B: '#f0fdf4', C: '#fffbeb', D: '#fef2f2' }
  const BORDER: Record<string, string> = { A: '#bfdbfe', B: '#bbf7d0', C: '#fde68a', D: '#fca5a5' }

  const allClusters = ['A', 'B', 'C', 'D'].map(cl =>
    clusters.find(c => c.cluster === cl) ?? { cluster: cl, incidentes: 0, tiendasAfectadas: 0, ieiTotal: 0 }
  )

  return (
    <ChartCard title="Incidentes por cluster">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {allClusters.map(c => {
          const hasData = c.incidentes > 0
          const accent = ACCENT[c.cluster] ?? '#6b7280'
          return (
            <div key={c.cluster} style={{
              background: hasData ? BG[c.cluster] : 'var(--muted)',
              border: `0.5px solid ${hasData ? BORDER[c.cluster] : 'var(--border)'}`,
              borderRadius: '8px', padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: hasData ? accent : 'var(--muted-foreground)' }}>
                  Cluster {c.cluster}
                </span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: hasData ? accent : 'var(--muted-foreground)' }}>
                  {c.incidentes}
                </span>
              </div>
              <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', marginBottom: '6px' }}>
                <div style={{ height: '100%', width: `${Math.round(c.incidentes / maxInc * 100)}%`, background: accent, borderRadius: '2px', transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'flex', gap: '8px' }}>
                <span>{c.tiendasAfectadas} tiendas</span>
                {c.ieiTotal > 0 && <span style={{ color: '#b45309' }}>{fmtCosto(c.ieiTotal)}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </ChartCard>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function GraficosAnalitico({ data }: { data: DashboardAnaliticoResponse }) {
  return (
    <div style={{ padding: '0 24px 32px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', paddingTop: '4px' }}>
        Análisis visual
      </div>

      {/* Tendencia: full width */}
      <div style={{ marginBottom: '12px' }}>
        <ChartTendencia data={data} />
      </div>

      {/* SLA Respuesta + SLA Resolución */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <ChartSLARespuesta data={data} />
        <ChartSLAResolucion data={data} />
      </div>

      {/* MTTR + IEI */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <ChartMTTR data={data} />
        <ChartIEI data={data} />
      </div>

      {/* Tipos + Supervisores + Clusters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <ChartTipos data={data} />
        <ChartSupervisores data={data} />
        <ChartClusters data={data} />
      </div>
    </div>
  )
}
