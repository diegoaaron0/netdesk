'use client'
import { useState } from 'react'
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

function ChartCard({ title, detail, children }: {
  title: string
  detail?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {title}
        </div>
        {detail && (
          <button
            onClick={() => setOpen(v => !v)}
            style={{
              fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '5px', border: 'none',
              cursor: 'pointer', transition: 'background 0.15s',
              background: open ? '#185FA5' : 'var(--muted)',
              color: open ? 'white' : 'var(--muted-foreground)',
            }}
          >
            {open ? 'Cerrar' : 'Detalle'}
          </button>
        )}
      </div>
      {children}
      {open && detail && (
        <div style={{ borderTop: '0.5px solid var(--border)', marginTop: '10px', paddingTop: '8px' }}>
          {detail}
        </div>
      )}
    </div>
  )
}

function DLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>
      {children}
    </div>
  )
}

function DRow({ left, right, rightColor, muted }: { left: React.ReactNode; right: React.ReactNode; rightColor?: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: '10px', borderBottom: '0.5px solid var(--border)', gap: '8px' }}>
      <span style={{ color: muted ? 'var(--muted-foreground)' : 'var(--foreground)', flex: 1, minWidth: 0 }}>{left}</span>
      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: rightColor ?? 'var(--foreground)', flexShrink: 0 }}>{right}</span>
    </div>
  )
}

// ─── 1. Tendencia diaria ──────────────────────────────────────────────────────

function ChartTendencia({ data }: { data: DashboardAnaliticoResponse }) {
  const byDay = data.cards.incidentes.byDay
  if (!byDay.length) return null

  const peak = byDay.reduce((a, b) => b.total > a.total ? b : a, byDay[0])
  const avg = Math.round(byDay.reduce((s, d) => s + d.total, 0) / byDay.length * 10) / 10

  // Patrón por día de semana
  const dowMap: Record<number, { sum: number; count: number }> = {}
  for (const d of byDay) {
    const dow = new Date(d.dia + 'T00:00:00').getDay()
    if (!dowMap[dow]) dowMap[dow] = { sum: 0, count: 0 }
    dowMap[dow].sum += d.total
    dowMap[dow].count++
  }
  const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const dowStats = Object.entries(dowMap)
    .map(([d, v]) => ({ dia: DOW[Number(d)], avg: Math.round(v.sum / v.count * 10) / 10 }))
    .sort((a, b) => b.avg - a.avg)

  const top3Days = [...byDay].sort((a, b) => b.total - a.total).slice(0, 3)

  const detail = (
    <>
      <DLabel>Top 3 días con más incidentes</DLabel>
      {top3Days.map((d, i) => (
        <DRow key={d.dia} left={<>{i + 1}. {fmtDia(d.dia)}</>} right={`${d.total} incidentes`} />
      ))}
      <div style={{ marginTop: '8px' }}>
        <DLabel>Promedio por día de semana</DLabel>
        {dowStats.slice(0, 4).map(d => (
          <DRow key={d.dia} left={d.dia} right={`${d.avg} inc/día`} muted />
        ))}
      </div>
    </>
  )

  return (
    <ChartCard title="Tendencia diaria de incidentes" detail={detail}>
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
      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '8px' }}>
        Pico: <strong style={{ color: 'var(--foreground)' }}>{fmtDia(peak.dia)}</strong> con {peak.total} incidentes · Promedio: {avg} inc/día
      </div>
    </ChartCard>
  )
}

// ─── 2. SLA Respuesta por proveedor ──────────────────────────────────────────

function ChartSLARespuesta({ data }: { data: DashboardAnaliticoResponse }) {
  const provs = data.cards.cumplimientoSLA.porProveedor
  if (!provs.length) return null

  const chartData = provs.map(p => ({ nombre: p.nombre, pct: p.slaRespuestaPct }))

  // Incidentes que fallaron SLA de respuesta, ordenados por tiempo de respuesta
  const fallaron = [...data.cards.cumplimientoSLA.evaluables]
    .filter(i => i.slaRespOk === false && i.minRespuesta != null)
    .sort((a, b) => (b.minRespuesta ?? 0) - (a.minRespuesta ?? 0))
    .slice(0, 5)

  const cumplieron = data.cards.cumplimientoSLA.evaluables.filter(i => i.slaRespOk === true).length
  const total = data.cards.cumplimientoSLA.evaluables.length

  const detail = (
    <>
      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '8px' }}>
        {cumplieron} de {total} incidentes evaluables respondidos en tiempo · Meta: 90%
      </div>
      {fallaron.length > 0 && (
        <>
          <DLabel>Incidentes que superaron el límite de respuesta</DLabel>
          {fallaron.map(i => (
            <DRow
              key={i.id}
              left={<><strong>{i.proveedor}</strong> · {i.tiendaCodigo} · {i.fecha}</>}
              right={fmtMin(i.minRespuesta)}
              rightColor="#dc2626"
            />
          ))}
        </>
      )}
      <div style={{ marginTop: '8px' }}>
        <DLabel>Tiempo promedio de respuesta por proveedor</DLabel>
        {provs.map(p => (
          <DRow
            key={p.nombre}
            left={p.nombre}
            right={p.tRespPromMin != null ? fmtMin(p.tRespPromMin) : '—'}
            muted
          />
        ))}
      </div>
    </>
  )

  return (
    <ChartCard title="SLA Respuesta por proveedor" detail={detail}>
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
    </ChartCard>
  )
}

// ─── 3. SLA Resolución por proveedor ─────────────────────────────────────────

function ChartSLAResolucion({ data }: { data: DashboardAnaliticoResponse }) {
  const provs = data.cards.cumplimientoSLA.porProveedor
  if (!provs.length) return null

  const chartData = provs.map(p => ({ nombre: p.nombre, pct: p.slaResolucionPct }))

  const fallaron = [...data.cards.cumplimientoSLA.evaluables]
    .filter(i => i.slaResolOk === false && i.minSolucionDesdeCorreo != null)
    .sort((a, b) => (b.minSolucionDesdeCorreo ?? 0) - (a.minSolucionDesdeCorreo ?? 0))
    .slice(0, 5)

  const cumplieron = data.cards.cumplimientoSLA.evaluables.filter(i => i.slaResolOk === true).length
  const total = data.cards.cumplimientoSLA.evaluables.length

  const detail = (
    <>
      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '8px' }}>
        {cumplieron} de {total} incidentes evaluables resueltos en tiempo · Meta: 90%
      </div>
      {provs.some(p => p.excessoResolucionMin > 0) && (
        <>
          <DLabel>Exceso promedio de tiempo por proveedor</DLabel>
          {provs.filter(p => p.excessoResolucionMin > 0).sort((a, b) => b.excessoResolucionMin - a.excessoResolucionMin).map(p => (
            <DRow key={p.nombre} left={p.nombre} right={`+${fmtMin(p.excessoResolucionMin)} sobre SLA`} rightColor="#dc2626" />
          ))}
        </>
      )}
      {fallaron.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <DLabel>Incidentes que más tardaron en resolverse</DLabel>
          {fallaron.map(i => (
            <DRow
              key={i.id}
              left={<><strong>{i.proveedor}</strong> · {i.tiendaCodigo} · {i.fecha}</>}
              right={fmtMin(i.minSolucionDesdeCorreo)}
              rightColor="#dc2626"
            />
          ))}
        </div>
      )}
    </>
  )

  return (
    <ChartCard title="SLA Resolución por proveedor" detail={detail}>
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
    </ChartCard>
  )
}

// ─── 4. MTTR por proveedor ────────────────────────────────────────────────────

function ChartMTTR({ data }: { data: DashboardAnaliticoResponse }) {
  const provs = data.cards.mttrPromedio.porProveedor
  const sparkData = data.cards.mttrPromedio.byDay.filter(d => d.mttrMinutos != null).slice(-14)
  if (!provs.length) return null

  const chartData = provs.map(p => ({ nombre: p.nombre, min: p.mttrMinutos }))

  // Peores incidentes por MTTR
  const peores = [...data.cards.incidentes.lista]
    .filter(i => i.mttrMin != null)
    .sort((a, b) => (b.mttrMin ?? 0) - (a.mttrMin ?? 0))
    .slice(0, 5)

  const detail = (
    <>
      {sparkData.length > 2 && (
        <>
          <DLabel>Evolución MTTR diario (últimos 14 días)</DLabel>
          <ResponsiveContainer width="100%" height={60}>
            <LineChart data={sparkData} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
              <XAxis dataKey="dia" tick={{ fontSize: 8 }} tickFormatter={fmtDia} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 8 }} tickFormatter={v => `${v}m`} />
              <ReferenceLine y={120} stroke="#d97706" strokeDasharray="3 2" strokeWidth={1} />
              <Line type="monotone" dataKey="mttrMinutos" stroke="#d97706" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
      {peores.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <DLabel>Incidentes con mayor tiempo de resolución</DLabel>
          {peores.map(i => (
            <DRow
              key={i.id}
              left={<><strong>{i.proveedor}</strong> · {i.tiendaCodigo} · {i.fecha}</>}
              right={fmtMin(i.mttrMin)}
              rightColor={mttrFill(i.mttrMin ?? 0)}
            />
          ))}
        </div>
      )}
      <div style={{ marginTop: '8px' }}>
        <DLabel>Mejor y peor tiempo por proveedor</DLabel>
        {provs.map(p => (
          <DRow
            key={p.nombre}
            left={p.nombre}
            right={<>↓ {fmtMin(p.mejorTiempo)} · ↑ {fmtMin(p.peorTiempo)}</>}
            muted
          />
        ))}
      </div>
    </>
  )

  return (
    <ChartCard title="MTTR por proveedor (minutos)" detail={detail}>
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
    </ChartCard>
  )
}

// ─── 5. IEI por proveedor ─────────────────────────────────────────────────────

function ChartIEI({ data }: { data: DashboardAnaliticoResponse }) {
  const provs = data.cards.costoEstimado.proveedoresDesglose.filter(p => p.costo > 0)
  if (!provs.length) return null

  const top5 = data.cards.costoEstimado.top5Tiendas
  const totalAgente = data.cards.costoEstimado.totalAgente
  const totalProv = data.cards.costoEstimado.totalProveedor
  const total = data.cards.costoEstimado.total

  const detail = (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        {[
          { label: 'Atribuible a proveedor', value: fmtCosto(totalProv), color: '#dc2626' },
          { label: 'Resuelto por agente', value: fmtCosto(totalAgente), color: '#d97706' },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--muted)', borderRadius: '6px', padding: '8px 10px' }}>
            <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>{item.label}</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: item.color }}>{item.value}</div>
            <div style={{ fontSize: '9px', color: 'var(--muted-foreground)' }}>{total > 0 ? Math.round((item.label === 'Atribuible a proveedor' ? totalProv : totalAgente) / total * 100) : 0}% del total</div>
          </div>
        ))}
      </div>
      {top5.length > 0 && (
        <>
          <DLabel>Top tiendas más afectadas económicamente</DLabel>
          {top5.map((t, idx) => (
            <DRow
              key={t.codigo}
              left={<>{idx + 1}. <strong>{t.codigo}</strong> · {t.proveedor} · {t.horasAfectadas}h caída{t.huboContingencia ? ' · c/contingencia' : ''}</>}
              right={fmtCosto(t.costo)}
              rightColor="#b45309"
            />
          ))}
        </>
      )}
    </>
  )

  return (
    <ChartCard title="IEI estimado por proveedor (S/)" detail={detail}>
      <ResponsiveContainer width="100%" height={Math.max(100, provs.length * 42 + 32)}>
        <BarChart layout="vertical" data={provs} margin={{ top: 0, right: 64, left: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
          <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={72} />
          <Tooltip formatter={(v: any) => [fmtCosto(v), 'IEI']} />
          <Bar dataKey="costo" fill="#b45309" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, fill: '#b45309', formatter: (v: any) => fmtCosto(v) }} />
        </BarChart>
      </ResponsiveContainer>
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
      ieiTotal: Math.round(d.ieiSum),
    }))

  const detail = (
    <>
      <DLabel>Estadísticas por tipo</DLabel>
      {pieData.map((e, i) => (
        <div key={e.tipo} style={{ padding: '5px 0', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '2px', background: TIPO_COLORS[i % TIPO_COLORS.length], flexShrink: 0 }} />
              <strong>{e.label}</strong>
            </span>
            <span style={{ fontWeight: 600 }}>{e.value} inc ({Math.round(e.value / incs.length * 100)}%)</span>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'flex', gap: '12px' }}>
            {e.mttrProm != null && <span>MTTR prom: {fmtMin(e.mttrProm)}</span>}
            {e.ieiTotal > 0 && <span>IEI total: {fmtCosto(e.ieiTotal)}</span>}
          </div>
        </div>
      ))}
    </>
  )

  return (
    <ChartCard title="Distribución por tipo" detail={detail}>
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
    </ChartCard>
  )
}

// ─── 7. Supervisores ──────────────────────────────────────────────────────────

function ChartSupervisores({ data }: { data: DashboardAnaliticoResponse }) {
  const supervisores = data.graficos?.supervisores ?? []
  if (!supervisores.length) return null

  const chartData = supervisores.slice(0, 8)
  const [selSup, setSelSup] = useState(supervisores[0]?.nombre ?? '')
  const supActivo = supervisores.find(s => s.nombre === selSup) ?? supervisores[0]

  const TruncTick = ({ x, y, payload }: any) => {
    const name: string = payload.value ?? ''
    const short = name.length > 13 ? name.slice(0, 13) + '…' : name
    return <text x={x} y={y} dy={4} textAnchor="end" fontSize={10} fill="currentColor">{short}</text>
  }

  const detail = supActivo ? (
    <>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
        {supervisores.slice(0, 6).map(s => (
          <button
            key={s.nombre}
            onClick={() => setSelSup(s.nombre)}
            style={{
              fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '5px', border: 'none', cursor: 'pointer',
              background: selSup === s.nombre ? '#185FA5' : 'var(--muted)',
              color: selSup === s.nombre ? 'white' : 'var(--muted-foreground)',
            }}
          >
            {s.nombre.split(' ')[0]}
          </button>
        ))}
      </div>
      <div style={{ background: 'var(--muted)', borderRadius: '7px', padding: '8px 10px', marginBottom: '8px', fontSize: '10px' }}>
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>{supActivo.nombre}</div>
        <div style={{ display: 'flex', gap: '12px', color: 'var(--muted-foreground)' }}>
          <span>{supActivo.incidentes} incidentes</span>
          <span>{supActivo.tiendasAfectadas} tiendas afectadas</span>
          <span style={{ color: '#b45309' }}>{fmtCosto(supActivo.ieiTotal)} IEI</span>
          <span>{fmtMin(supActivo.tiempoTotalMin)} caído en total</span>
        </div>
      </div>
      <DLabel>Tiendas con incidentes bajo su cargo</DLabel>
      {supActivo.tiendas.slice(0, 6).map(t => (
        <DRow
          key={t.codigo}
          left={<><strong>{t.codigo}</strong> · {t.incidentes} inc · {fmtMin(t.tiempoTotalMin)} caído</>}
          right={fmtCosto(t.ieiTotal)}
          rightColor="#b45309"
        />
      ))}
    </>
  ) : null

  return (
    <ChartCard title="Incidentes por supervisor" detail={detail}>
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
                  {s && <div style={{ color: '#b45309' }}>{fmtCosto(s.ieiTotal)} IEI</div>}
                  {s?.tiempoTotalMin ? <div style={{ color: 'var(--muted-foreground)' }}>{fmtMin(s.tiempoTotalMin)} caído total</div> : null}
                </div>
              )
            }}
          />
          <Bar dataKey="incidentes" fill="#185FA5" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
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

  const sorted = [...allClusters].filter(c => c.incidentes > 0).sort((a, b) => b.incidentes - a.incidentes)

  const detail = sorted.length > 0 ? (
    <>
      <DLabel>Ranking de clusters por impacto</DLabel>
      {sorted.map((c, idx) => (
        <div key={c.cluster} style={{ padding: '5px 0', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
            <span style={{ fontWeight: 600, color: ACCENT[c.cluster] ?? 'var(--foreground)' }}>
              {idx + 1}. Cluster {c.cluster}
            </span>
            <span style={{ fontWeight: 600 }}>{c.incidentes} incidentes</span>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'flex', gap: '12px' }}>
            <span>{c.tiendasAfectadas} tiendas afectadas</span>
            {c.ieiTotal > 0 && <span style={{ color: '#b45309' }}>IEI: {fmtCosto(c.ieiTotal)}</span>}
          </div>
        </div>
      ))}
    </>
  ) : undefined

  return (
    <ChartCard title="Incidentes por cluster" detail={detail}>
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
  const sinDatos = data.cards.incidentes.total === 0

  return (
    <div style={{ padding: '0 24px 32px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', paddingTop: '4px' }}>
        Análisis visual
      </div>

      {sinDatos ? (
        <div style={{ background: 'var(--muted)', borderRadius: '10px', padding: '32px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>
          Sin incidentes en este período. Amplía el rango de fechas para ver el análisis visual.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '12px' }}>
            <ChartTendencia data={data} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <ChartSLARespuesta data={data} />
            <ChartSLAResolucion data={data} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <ChartMTTR data={data} />
            <ChartIEI data={data} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <ChartTipos data={data} />
            <ChartSupervisores data={data} />
            <ChartClusters data={data} />
          </div>
        </>
      )}
    </div>
  )
}
