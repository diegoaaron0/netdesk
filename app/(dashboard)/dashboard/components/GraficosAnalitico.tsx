'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  CartesianGrid, LineChart, Line,
} from 'recharts'
import type { DashboardAnaliticoResponse, IncidenteListItem } from '@/types/dashboard'
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
  LENTITUD: 'Lentitud', OTROS: 'Otros', CORTE_ELECTRICO: 'Corte eléctrico',
}
// Paleta de series. Hex literal a propósito: recharts las escribe como
// atributos SVG y las reusa en tooltips y leyendas calculadas en JS, donde
// una var() de CSS no resuelve.
const TIPO_COLORS = ['#60a5fa', '#fbbf24', '#f87171', '#34d399', '#a78bfa', '#8792bd']

// Tema oscuro compartido por todas las gráficas.
const EJE = { fill: '#8792bd', fontSize: 9 }
const EJE_LINEA = 'rgba(255,255,255,0.10)'
const REJILLA = 'rgba(255,255,255,0.06)'
const TOOLTIP = {
  contentStyle: {
    background: '#0f1734',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 10,
    boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
    fontSize: 11,
    padding: '8px 10px',
  },
  labelStyle: { color: '#e9edfb', fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: '#8792bd' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
}

function slaFill(pct: number | null) {
  if (pct == null) return '#8792bd'
  if (pct >= 90) return '#34d399'
  if (pct >= 70) return '#fbbf24'
  return '#f87171'
}
function slaBg(pct: number | null) {
  if (pct == null) return 'var(--surface-2)'
  if (pct >= 90) return 'var(--ok-bg)'
  if (pct >= 70) return 'var(--warn-bg)'
  return 'var(--danger-bg)'
}
function mttrFill(min: number) {
  if (min < 120) return '#34d399'
  if (min < 240) return '#fbbf24'
  return '#f87171'
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function ChartCard({ title, detail, children }: {
  title: string
  detail?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
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
              background: open ? 'var(--info-bg)' : 'var(--muted)',
              boxShadow: open ? 'inset 0 0 0 1px var(--info-border)' : 'none',
              color: open ? 'var(--info)' : 'var(--muted-foreground)',
            }}
          >
            {open ? 'Cerrar' : 'Detalle'}
          </button>
        )}
      </div>
      {children}
      {open && detail && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: '10px', paddingTop: '8px' }}>
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: '10px', borderBottom: '1px solid var(--border)', gap: '8px' }}>
      <span style={{ color: muted ? 'var(--muted-foreground)' : 'var(--foreground)', flex: 1, minWidth: 0 }}>{left}</span>
      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: rightColor ?? 'var(--foreground)', flexShrink: 0 }}>{right}</span>
    </div>
  )
}

// ─── Incident helpers ────────────────────────────────────────────────────────

function IncidentMini({ item }: { item: IncidenteListItem }) {
  const router = useRouter()
  return (
    <div
      onClick={() => router.push(`/incidentes/${item.id}`)}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '5px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '10px',
        gap: '6px', background: 'var(--background)', border: '1px solid var(--border)',
        marginBottom: '3px', transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-3)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--background)'}
    >
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--info)' }}>{item.codigo}</span>
        <span style={{ fontWeight: 600, color: 'var(--muted-foreground)' }}>{item.tiendaCodigo}</span>
        <span style={{ color: 'var(--muted-foreground)' }}>{TIPO_LABELS[item.tipo] ?? item.tipo}</span>
        <span style={{ color: 'var(--muted-foreground)', fontSize: '9px' }}>{item.horaInicio}</span>
      </div>
      <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexShrink: 0 }}>
        {item.ieiEstimado > 0 && <span style={{ color: 'var(--warn)', fontFamily: 'monospace' }}>{fmtCosto(item.ieiEstimado)}</span>}
        {item.mttrMin != null && <span style={{ color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{fmtMin(item.mttrMin)}</span>}
        <span style={{ color: 'var(--info)', fontSize: '11px' }}>→</span>
      </div>
    </div>
  )
}

// Wrapper para hacer una fila DRow navegable al incidente
function IncidentLink({ id, children }: { id: string; children: React.ReactNode }) {
  const router = useRouter()
  return (
    <div
      onClick={() => router.push(`/incidentes/${id}`)}
      style={{ cursor: 'pointer', borderRadius: '4px', transition: 'background 0.1s' }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-3)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
    >
      {children}
    </div>
  )
}

// Convierte "DD/MM/YYYY" y "YYYY-MM-DD" para comparar si son el mismo día
function mismodia(incFecha: string, day: string): boolean {
  const [d, m, y] = incFecha.split('/')
  const [dy, dm, dd] = day.split('-')
  return y === dy && m === dm && d === dd
}

// ─── 1. Tendencia diaria ──────────────────────────────────────────────────────

function ChartTendencia({ data }: { data: DashboardAnaliticoResponse }) {
  const [selDay, setSelDay] = useState<string | null>(null)
  const byDay = data.cards.incidentes.byDay
  if (!byDay.length) return null

  const peak = byDay.reduce((a, b) => b.total > a.total ? b : a, byDay[0])
  const avg = Math.round(byDay.reduce((s, d) => s + d.total, 0) / byDay.length * 10) / 10

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
  const incs = data.cards.incidentes.lista
  const dayIncs = selDay ? incs.filter(i => mismodia(i.fecha, selDay)) : []

  const detail = (
    <>
      <DLabel>Top 3 días con más incidentes</DLabel>
      {top3Days.map((d, i) => {
        const sel = selDay === d.dia
        return (
          <div key={d.dia}>
            <div
              onClick={() => setSelDay(sel ? null : d.dia)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '4px 6px', borderRadius: '5px', cursor: 'pointer', fontSize: '10px',
                background: sel ? 'var(--info-bg)' : 'transparent',
                border: `1px solid ${sel ? 'var(--info-border)' : 'var(--border)'}`,
                marginBottom: '2px',
              }}
              onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = 'var(--muted)' }}
              onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
            >
              <span style={{ color: sel ? 'var(--info)' : 'var(--foreground)', fontWeight: sel ? 600 : 400 }}>
                {sel ? '▾' : '▸'} {i + 1}. {fmtDia(d.dia)}
              </span>
              <span style={{ color: sel ? 'var(--info)' : 'var(--muted-foreground)', fontFamily: 'monospace', fontWeight: 600 }}>
                {d.total} incidente{d.total !== 1 ? 's' : ''}
              </span>
            </div>
            {sel && (
              <div style={{ paddingLeft: '8px', paddingBottom: '4px' }}>
                {dayIncs.length === 0
                  ? <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', padding: '4px 0' }}>Sin incidentes registrados para este día.</div>
                  : dayIncs.map(inc => <IncidentMini key={inc.id} item={inc} />)
                }
              </div>
            )}
          </div>
        )
      })}
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
              <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={REJILLA} vertical={false} />
          <XAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} dataKey="dia" tick={{ ...EJE, fontSize: 9 }} tickFormatter={fmtDia} interval="preserveStartEnd" />
          <YAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} allowDecimals={false} tick={{ ...EJE, fontSize: 9 }} />
          <Tooltip {...TOOLTIP}
            content={({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null
              return (
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '7px 10px', fontSize: '11px' }}>
                  <div style={{ fontWeight: 600 }}>{fmtDia(label)}</div>
                  <div style={{ color: 'var(--info)' }}>{payload[0].value} incidentes</div>
                </div>
              )
            }}
          />
          <Area type="monotone" dataKey="total" stroke="#60a5fa" strokeWidth={2} fill="url(#gradInc)" dot={false} activeDot={{ r: 4, fill: '#60a5fa' }} />
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
  const sla = data.cards.cumplimientoSLA
  const provs = sla.porProveedor
  if (!provs.length) return null

  const chartData = provs.filter(p => p.slaRespuestaPct != null).map(p => ({ nombre: p.nombre, pct: p.slaRespuestaPct as number }))
  const cumplieron = sla.evaluables.filter(i => i.slaRespOk === true).length
  const incumplidos = sla.evaluables.length - cumplieron
  const total = sla.evaluables.length
  const delta = sla.deltaRespuestaPct

  const detail = (
    <>
      {/* Resumen global con delta */}
      <div style={{ background: 'var(--muted)', borderRadius: '7px', padding: '9px 12px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--foreground)' }}>
              {cumplieron} de {total} evaluables cumplieron
            </span>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
              {incumplidos} incidente{incumplidos !== 1 ? 's' : ''} {incumplidos !== 1 ? 'superaron' : 'superó'} el límite de primera respuesta · Meta: 90%
            </div>
          </div>
          {delta != null && (
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', flexShrink: 0,
              background: delta >= 0 ? 'var(--ok-bg)' : 'var(--danger-bg)',
              color: delta >= 0 ? 'var(--ok)' : 'var(--danger)',
            }}>
              {delta > 0 ? '+' : ''}{delta}pp vs anterior
            </span>
          )}
        </div>
      </div>

      {/* Tabla de proveedores: SLA% + evaluables + T.prom + exceso */}
      <DLabel>Desglose por proveedor</DLabel>
      <div style={{ border: '1px solid var(--border)', borderRadius: '7px', overflow: 'hidden', marginBottom: '10px' }}>
        {[...provs].sort((a, b) => (a.slaRespuestaPct ?? 999) - (b.slaRespuestaPct ?? 999)).map((p, idx, arr) => (
          <div key={p.nombre} style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto auto auto',
            gap: '8px', alignItems: 'center', padding: '6px 10px', fontSize: '10px',
            borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{ fontWeight: 600 }}>{p.nombre}</span>
            <span style={{
              padding: '1px 7px', borderRadius: '999px', fontWeight: 700,
              background: slaBg(p.slaRespuestaPct), color: slaFill(p.slaRespuestaPct),
            }}>{p.slaRespuestaPct != null ? `${p.slaRespuestaPct}%` : '—'}</span>
            <span style={{ color: 'var(--muted-foreground)', textAlign: 'right' }}>{p.evaluables} eval</span>
            <span style={{ fontFamily: 'monospace', color: 'var(--muted-foreground)', textAlign: 'right' }}>
              {p.tRespPromMin != null ? fmtMin(p.tRespPromMin) : '—'}
            </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, textAlign: 'right', color: p.excessoRespuestaMin > 0 ? 'var(--danger)' : 'var(--ok)', minWidth: '48px' }}>
              {p.excessoRespuestaMin > 0 ? `+${fmtMin(p.excessoRespuestaMin)}` : '✓'}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginBottom: '8px', textAlign: 'right' }}>
        Columnas: SLA% · evaluables · T.prom respuesta · exceso prom sobre límite
      </div>

      {/* Todos los evaluables con badge ✓/✗ */}
      {sla.evaluables.length > 0 && (
        <>
          <DLabel>Incidentes evaluables ({sla.evaluables.length}) — por T. respuesta</DLabel>
          {[...sla.evaluables].sort((a, b) => {
              // Sin respuesta (null) va primero — es el peor caso
              if (a.minRespuesta == null && b.minRespuesta == null) return 0
              if (a.minRespuesta == null) return -1
              if (b.minRespuesta == null) return 1
              return b.minRespuesta - a.minRespuesta
            }).map(i => (
            <IncidentLink key={i.id} id={i.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '10px', borderBottom: '1px solid var(--border)', gap: '6px' }}>
                <span style={{ flex: 1, minWidth: 0 }}><strong>{i.proveedor}</strong> · {i.tiendaCodigo} · {TIPO_LABELS[i.tipo] ?? i.tipo} · {i.fecha}</span>
                <span style={{ fontFamily: 'monospace', color: i.slaRespOk === false ? 'var(--danger)' : 'var(--muted-foreground)', flexShrink: 0 }}>{i.minRespuesta != null ? fmtMin(i.minRespuesta) : '—'}</span>
                {i.slaRespOk === true  && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '999px', background: 'var(--ok-bg)', color: 'var(--ok)', fontWeight: 600, flexShrink: 0 }}>✓</span>}
                {i.slaRespOk === false && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '999px', background: 'var(--danger-bg)', color: 'var(--danger)', fontWeight: 600, flexShrink: 0 }}>✗</span>}
                <span style={{ color: 'var(--info)', fontSize: '11px', flexShrink: 0 }}>→</span>
              </div>
            </IncidentLink>
          ))}
        </>
      )}
    </>
  )

  return (
    <ChartCard title="SLA Respuesta por proveedor" detail={detail}>
      <ResponsiveContainer width="100%" height={Math.max(100, provs.length * 42 + 32)}>
        <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 36, left: 0, bottom: 0 }}>
          <XAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} type="number" domain={[0, 100]} tick={{ ...EJE, fontSize: 9 }} tickFormatter={v => `${v}%`} />
          <YAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} type="category" dataKey="nombre" tick={{ ...EJE, fontSize: 10 }} width={72} />
          <ReferenceLine x={90} stroke="#34d399" strokeDasharray="4 2" strokeWidth={1.5} />
          <Tooltip {...TOOLTIP} formatter={(v: any) => [`${v}%`, 'SLA Respuesta']} />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#e9edfb', fontWeight: 600, fontSize: 10, formatter: (v: any) => `${v}%` }}>
            {chartData.map((e, i) => <Cell key={i} fill={slaFill(e.pct)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ─── 3. SLA Resolución por proveedor ─────────────────────────────────────────

function ChartSLAResolucion({ data }: { data: DashboardAnaliticoResponse }) {
  const sla = data.cards.cumplimientoSLA
  const provs = sla.porProveedor
  if (!provs.length) return null

  const chartData = provs.filter(p => p.slaResolucionPct != null).map(p => ({ nombre: p.nombre, pct: p.slaResolucionPct as number }))
  const cumplieron = sla.evaluables.filter(i => i.slaResolOk === true).length
  const incumplidos = sla.evaluables.length - cumplieron
  const total = sla.evaluables.length
  const delta = sla.deltaResolucionPct

  const detail = (
    <>
      {/* Resumen global con delta */}
      <div style={{ background: 'var(--muted)', borderRadius: '7px', padding: '9px 12px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--foreground)' }}>
              {cumplieron} de {total} evaluables cumplieron
            </span>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
              {incumplidos} {incumplidos !== 1 ? 'no resolvieron' : 'no resolvió'} dentro del tiempo comprometido · Meta: 90%
            </div>
          </div>
          {delta != null && (
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', flexShrink: 0,
              background: delta >= 0 ? 'var(--ok-bg)' : 'var(--danger-bg)',
              color: delta >= 0 ? 'var(--ok)' : 'var(--danger)',
            }}>
              {delta > 0 ? '+' : ''}{delta}pp vs anterior
            </span>
          )}
        </div>
      </div>

      {/* Tabla de proveedores */}
      <DLabel>Desglose por proveedor</DLabel>
      <div style={{ border: '1px solid var(--border)', borderRadius: '7px', overflow: 'hidden', marginBottom: '10px' }}>
        {[...provs].sort((a, b) => (a.slaResolucionPct ?? 999) - (b.slaResolucionPct ?? 999)).map((p, idx, arr) => (
          <div key={p.nombre} style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto auto auto',
            gap: '8px', alignItems: 'center', padding: '6px 10px', fontSize: '10px',
            borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{ fontWeight: 600 }}>{p.nombre}</span>
            <span style={{
              padding: '1px 7px', borderRadius: '999px', fontWeight: 700,
              background: slaBg(p.slaResolucionPct), color: slaFill(p.slaResolucionPct),
            }}>{p.slaResolucionPct != null ? `${p.slaResolucionPct}%` : '—'}</span>
            <span style={{ color: 'var(--muted-foreground)', textAlign: 'right' }}>{p.evaluables} eval</span>
            <span style={{ fontFamily: 'monospace', color: 'var(--muted-foreground)', textAlign: 'right' }}>
              {p.tResolPromMin != null ? fmtMin(p.tResolPromMin) : '—'}
            </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, textAlign: 'right', color: p.excessoResolucionMin > 0 ? 'var(--danger)' : 'var(--ok)', minWidth: '48px' }}>
              {p.excessoResolucionMin > 0 ? `+${fmtMin(p.excessoResolucionMin)}` : '✓'}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginBottom: '8px', textAlign: 'right' }}>
        Columnas: SLA% · evaluables · T.prom resolución · exceso prom sobre límite
      </div>

      {/* Todos los evaluables con badge ✓/✗ */}
      {sla.evaluables.length > 0 && (
        <>
          <DLabel>Incidentes evaluables ({sla.evaluables.length}) — por T. resolución</DLabel>
          {[...sla.evaluables].sort((a, b) => {
              if (a.minSolucionDesdeCorreo == null && b.minSolucionDesdeCorreo == null) return 0
              if (a.minSolucionDesdeCorreo == null) return -1
              if (b.minSolucionDesdeCorreo == null) return 1
              return b.minSolucionDesdeCorreo - a.minSolucionDesdeCorreo
            }).map(i => (
            <IncidentLink key={i.id} id={i.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '10px', borderBottom: '1px solid var(--border)', gap: '6px' }}>
                <span style={{ flex: 1, minWidth: 0 }}><strong>{i.proveedor}</strong> · {i.tiendaCodigo} · {TIPO_LABELS[i.tipo] ?? i.tipo} · {i.fecha}</span>
                <span style={{ fontFamily: 'monospace', color: i.slaResolOk === false ? 'var(--danger)' : 'var(--muted-foreground)', flexShrink: 0 }}>{i.minSolucionDesdeCorreo != null ? fmtMin(i.minSolucionDesdeCorreo) : '—'}</span>
                {i.slaResolOk === true  && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '999px', background: 'var(--ok-bg)', color: 'var(--ok)', fontWeight: 600, flexShrink: 0 }}>✓</span>}
                {i.slaResolOk === false && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '999px', background: 'var(--danger-bg)', color: 'var(--danger)', fontWeight: 600, flexShrink: 0 }}>✗</span>}
                <span style={{ color: 'var(--info)', fontSize: '11px', flexShrink: 0 }}>→</span>
              </div>
            </IncidentLink>
          ))}
        </>
      )}
    </>
  )

  return (
    <ChartCard title="SLA Resolución por proveedor" detail={detail}>
      <ResponsiveContainer width="100%" height={Math.max(100, provs.length * 42 + 32)}>
        <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 36, left: 0, bottom: 0 }}>
          <XAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} type="number" domain={[0, 100]} tick={{ ...EJE, fontSize: 9 }} tickFormatter={v => `${v}%`} />
          <YAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} type="category" dataKey="nombre" tick={{ ...EJE, fontSize: 10 }} width={72} />
          <ReferenceLine x={90} stroke="#34d399" strokeDasharray="4 2" strokeWidth={1.5} />
          <Tooltip {...TOOLTIP} formatter={(v: any) => [`${v}%`, 'SLA Resolución']} />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#e9edfb', fontWeight: 600, fontSize: 10, formatter: (v: any) => `${v}%` }}>
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

  const mttrGlobal = data.cards.mttrPromedio.minutos
  const delta = data.cards.mttrPromedio.deltaMinutos
  const tendenciaTxt = delta == null ? null : delta < 0 ? '↓ Mejorando' : delta > 0 ? '↑ Empeorando' : '→ Estable'
  const tendenciaColor = delta == null ? 'var(--muted-foreground)' : delta < 0 ? 'var(--ok)' : delta > 0 ? 'var(--danger)' : 'var(--muted-foreground)'

  const detail = (
    <>
      {/* Resumen global con delta */}
      <div style={{ background: 'var(--muted)', borderRadius: '7px', padding: '9px 12px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: mttrFill(mttrGlobal ?? 0) }}>
              MTTR global: {fmtMin(mttrGlobal)}
            </span>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
              Referencia: &lt;2h = bueno · 2–4h = regular · &gt;4h = crítico
            </div>
          </div>
          {tendenciaTxt && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: tendenciaColor, flexShrink: 0 }}>
              {tendenciaTxt} {delta != null ? `(${delta > 0 ? '+' : ''}${delta}m vs anterior)` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Evolución diaria */}
      {sparkData.length > 2 && (
        <>
          <DLabel>Evolución MTTR diario (últimos 14 días)</DLabel>
          <ResponsiveContainer width="100%" height={60}>
            <LineChart data={sparkData} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
              <XAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} dataKey="dia" tick={{ ...EJE, fontSize: 8 }} tickFormatter={fmtDia} interval="preserveStartEnd" />
              <YAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} tick={{ ...EJE, fontSize: 8 }} tickFormatter={v => `${v}m`} />
              <ReferenceLine y={120} stroke="#fbbf24" strokeDasharray="3 2" strokeWidth={1} />
              <Line type="monotone" dataKey="mttrMinutos" stroke="#fbbf24" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      {/* Tabla por proveedor: MTTR prom + delta + mejor + peor */}
      <div style={{ marginTop: '8px' }}>
        <DLabel>Desglose por proveedor</DLabel>
        <div style={{ border: '1px solid var(--border)', borderRadius: '7px', overflow: 'hidden', marginBottom: '8px' }}>
          {[...provs].sort((a, b) => b.mttrMinutos - a.mttrMinutos).map((p, idx, arr) => (
            <div key={p.nombre} style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto auto',
              gap: '8px', alignItems: 'center', padding: '6px 10px', fontSize: '10px',
              borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{ fontWeight: 600 }}>{p.nombre}</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: mttrFill(p.mttrMinutos) }}>
                {fmtMin(p.mttrMinutos)}
              </span>
              <span style={{ color: 'var(--muted-foreground)', fontSize: '9px', textAlign: 'right' }}>
                ↓{fmtMin(p.mejorTiempo)} · ↑{fmtMin(p.peorTiempo)}
              </span>
              <span style={{ color: 'var(--muted-foreground)', fontSize: '9px', textAlign: 'right' }}>
                {p.incidentesResueltos} resueltos
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Peores incidentes */}
      {peores.length > 0 && (
        <>
          <DLabel>Incidentes con mayor MTTR ({peores.length})</DLabel>
          {peores.map(i => (
            <IncidentLink key={i.id} id={i.id}>
              <DRow
                left={<><strong>{i.proveedor}</strong> · {i.tiendaCodigo} · {TIPO_LABELS[i.tipo] ?? i.tipo} · {i.fecha}</>}
                right={<>{fmtMin(i.mttrMin)} <span style={{ color: 'var(--info)', marginLeft: '4px' }}>→</span></>}
                rightColor={mttrFill(i.mttrMin ?? 0)}
              />
            </IncidentLink>
          ))}
        </>
      )}
    </>
  )

  return (
    <ChartCard title="MTTR por proveedor (minutos)" detail={detail}>
      <ResponsiveContainer width="100%" height={Math.max(100, provs.length * 42 + 32)}>
        <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
          <XAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} type="number" tick={{ ...EJE, fontSize: 9 }} tickFormatter={v => `${v}m`} />
          <YAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} type="category" dataKey="nombre" tick={{ ...EJE, fontSize: 10 }} width={72} />
          <ReferenceLine x={120} stroke="#fbbf24" strokeDasharray="4 2" strokeWidth={1.5} />
          <Tooltip {...TOOLTIP} formatter={(v: any) => [fmtMin(v), 'MTTR']} />
          <Bar dataKey="min" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#e9edfb', fontWeight: 600, fontSize: 10, formatter: (v: any) => fmtMin(v) }}>
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
          { label: 'Atribuible a proveedor', value: fmtCosto(totalProv), color: 'var(--danger)' },
          { label: 'Resuelto por agente', value: fmtCosto(totalAgente), color: 'var(--warn)' },
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
              rightColor="var(--warn)"
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
          <XAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} type="number" tick={{ ...EJE, fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
          <YAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} type="category" dataKey="nombre" tick={{ ...EJE, fontSize: 10 }} width={72} />
          <Tooltip {...TOOLTIP} formatter={(v: any) => [fmtCosto(v), 'IEI']} />
          <Bar dataKey="costo" fill="#fbbf24" radius={[0, 4, 4, 0]} label={{ position: 'right', fontWeight: 600, fontSize: 10, fill: '#fbbf24', formatter: (v: any) => fmtCosto(v) }} />
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
        <div key={e.tipo} style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
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
          <Pie data={pieData} cx={85} cy={75} innerRadius={42} outerRadius={68} paddingAngle={2} stroke="#0d1430" dataKey="value" nameKey="label">
            {pieData.map((_, i) => <Cell key={i} fill={TIPO_COLORS[i % TIPO_COLORS.length]} />)}
          </Pie>
          <Tooltip {...TOOLTIP} formatter={(v: any, name: any) => [v, name]} />
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
              background: selSup === s.nombre ? 'var(--info-bg)' : 'var(--muted)',
              boxShadow: selSup === s.nombre ? 'inset 0 0 0 1px var(--info-border)' : 'none',
              color: selSup === s.nombre ? 'var(--info)' : 'var(--muted-foreground)',
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
          <span style={{ color: 'var(--warn)' }}>{fmtCosto(supActivo.ieiTotal)} IEI</span>
          <span>{fmtMin(supActivo.tiempoTotalMin)} caído en total</span>
        </div>
      </div>
      <DLabel>Tiendas con incidentes bajo su cargo</DLabel>
      {supActivo.tiendas.slice(0, 6).map(t => (
        <DRow
          key={t.codigo}
          left={<><strong>{t.codigo}</strong> · {t.incidentes} inc · {fmtMin(t.tiempoTotalMin)} caído</>}
          right={fmtCosto(t.ieiTotal)}
          rightColor="var(--warn)"
        />
      ))}
    </>
  ) : null

  return (
    <ChartCard title="Incidentes por supervisor" detail={detail}>
      <ResponsiveContainer width="100%" height={Math.max(100, chartData.length * 38 + 32)}>
        <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
          <XAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} type="number" allowDecimals={false} tick={{ ...EJE, fontSize: 9 }} />
          <YAxis axisLine={{ stroke: EJE_LINEA }} tickLine={{ stroke: EJE_LINEA }} type="category" dataKey="nombre" tick={<TruncTick />} width={90} />
          <Tooltip {...TOOLTIP}
            content={({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null
              const s = supervisores.find(x => x.nombre === label)
              return (
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', maxWidth: '200px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{label}</div>
                  <div>{payload[0].value} incidentes · {s?.tiendasAfectadas} tiendas</div>
                  {s && <div style={{ color: 'var(--warn)' }}>{fmtCosto(s.ieiTotal)} IEI</div>}
                  {s?.tiempoTotalMin ? <div style={{ color: 'var(--muted-foreground)' }}>{fmtMin(s.tiempoTotalMin)} caído total</div> : null}
                </div>
              )
            }}
          />
          <Bar dataKey="incidentes" fill="#60a5fa" radius={[0, 4, 4, 0]} />
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
  const ACCENT: Record<string, string> = { A: 'var(--info)', B: 'var(--ok)', C: 'var(--warn)', D: 'var(--danger)' }
  // Fondo translúcido + borde del mismo tono: el par que da el chip legible
  // sobre navy. Antes eran pastel claro + trazo medio, del tema claro.
  const BG: Record<string, string>     = { A: 'var(--info-bg)', B: 'var(--ok-bg)', C: 'var(--warn-bg)', D: 'var(--danger-bg)' }
  const BORDER: Record<string, string> = { A: 'var(--info-border)', B: 'var(--ok-border)', C: 'var(--warn-border)', D: 'var(--danger-border)' }

  const allClusters = ['A', 'B', 'C', 'D'].map(cl =>
    clusters.find(c => c.cluster === cl) ?? { cluster: cl, incidentes: 0, tiendasAfectadas: 0, ieiTotal: 0 }
  )

  const sorted = [...allClusters].filter(c => c.incidentes > 0).sort((a, b) => b.incidentes - a.incidentes)

  const detail = sorted.length > 0 ? (
    <>
      <DLabel>Ranking de clusters por impacto</DLabel>
      {sorted.map((c, idx) => (
        <div key={c.cluster} style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
            <span style={{ fontWeight: 600, color: ACCENT[c.cluster] ?? 'var(--foreground)' }}>
              {idx + 1}. Cluster {c.cluster}
            </span>
            <span style={{ fontWeight: 600 }}>{c.incidentes} incidentes</span>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'flex', gap: '12px' }}>
            <span>{c.tiendasAfectadas} tiendas afectadas</span>
            {c.ieiTotal > 0 && <span style={{ color: 'var(--warn)' }}>IEI: {fmtCosto(c.ieiTotal)}</span>}
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
          const accent = ACCENT[c.cluster] ?? 'var(--muted-foreground)'
          return (
            <div key={c.cluster} style={{
              background: hasData ? BG[c.cluster] : 'var(--muted)',
              border: `1px solid ${hasData ? BORDER[c.cluster] : 'var(--border)'}`,
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
                {c.ieiTotal > 0 && <span style={{ color: 'var(--warn)' }}>{fmtCosto(c.ieiTotal)}</span>}
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
