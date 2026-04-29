'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, estadoToVariant, impactoToVariant } from '@/components/ui/Badge'
import { LineChart, Line, BarChart, Bar, Cell, PieChart, Pie, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts'

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
}

function elapsed(since: string | Date) {
  const ms = Date.now() - new Date(since).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return { label: h > 0 ? `${h}h ${m}m` : `${m}m`, h, m }
}

function countdown(from: string | Date, minutesLimit: number) {
  const ms = Date.now() - new Date(from).getTime()
  const remaining = minutesLimit * 60000 - ms
  if (remaining <= 0) return { label: 'Vencido', vencido: true }
  const h = Math.floor(remaining / 3600000)
  const m = Math.floor((remaining % 3600000) / 60000)
  const s = Math.floor((remaining % 60000) / 1000)
  const label = h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`
  return { label, vencido: false, warning: remaining < 10 * 60000 }
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', overflow: 'hidden', marginBottom: '14px' }}>
      <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', fontSize: '12px', fontWeight: 600 }}>{title}</div>
      <div>{children}</div>
    </div>
  )
}

const TIPO_COLORS_ANA: Record<string, string> = {
  CAIDA_TOTAL: '#1E3A8A', INTERMITENCIA: '#378ADD',
  LENTITUD: '#85B7EB', POS: '#B5D4F4', OTROS: '#D3D1C7',
}
const ZONA_COLORS_ANA = ['#185FA5', '#534AB7', '#378ADD', '#EF9F27', '#85B7EB', '#9FE1CB']
const PROV_LINE_COLORS = ['#639922', '#1D9E75', '#185FA5', '#BA7517', '#E24B4A', '#A32D2D', '#854F0B']
const PROV_LINE_DASHES = [[], [4, 3], [2, 2], [6, 2], [2, 4], [8, 3], [4, 2]]

function minToHM(min: number | null | undefined) {
  if (!min) return '—'
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function deltaPct(cur: number, prev: number) {
  if (!prev) return null
  return Math.round((cur - prev) / prev * 100)
}
function slaBadge(v: number | null) {
  if (v == null) return { bg: '#f5f5f3', color: '#888780', label: 'Sin datos' }
  if (v >= 80) return { bg: '#EAF3DE', color: '#3B6D11', label: 'OK' }
  if (v >= 60) return { bg: '#FAEEDA', color: '#854F0B', label: 'Lento' }
  return { bg: '#FCEBEB', color: '#A32D2D', label: 'Crítico' }
}
function costoBadge(v: number | null) {
  if (v == null) return { bg: '#f5f5f3', color: '#888780', label: 'Sin datos' }
  if (v < 8) return { bg: '#EAF3DE', color: '#3B6D11', label: 'Óptimo' }
  if (v < 20) return { bg: '#FAEEDA', color: '#854F0B', label: 'Revisar' }
  return { bg: '#FCEBEB', color: '#A32D2D', label: 'Crítico' }
}
function reincBadge(n: number) {
  if (n >= 3) return { bg: '#FCEBEB', color: '#A32D2D' }
  if (n >= 2) return { bg: '#FAEEDA', color: '#854F0B' }
  return { bg: '#E6F1FB', color: '#0C447C' }
}
const AP: React.CSSProperties = { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '14px' }
const APT: React.CSSProperties = { fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }
const APS: React.CSSProperties = { fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '12px' }
const ASEP: React.CSSProperties = { borderBottom: '0.5px solid var(--border)' }

const PERIOD_OPTIONS = [
  { label: 'Hoy', days: 0 },
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
  { label: '3 meses', days: 90 },
  { label: '6 meses', days: 180 },
]

export default function DashboardPage() {
  const router = useRouter()
  const [op, setOp] = useState<any>(null)
  const [tick, setTick] = useState(0)
  const [tab, setTab] = useState<'operativo' | 'analitico'>('operativo')

  // Analítico
  const [period, setPeriod] = useState(30)
  const [customDesde, setCustomDesde] = useState('')
  const [customHasta, setCustomHasta] = useState('')
  const [ana, setAna] = useState<any>(null)
  const [loadingAna, setLoadingAna] = useState(false)

  const fetchOp = useCallback(async () => {
    const res = await fetch('/api/dashboard/operativo')
    if (res.ok) setOp(await res.json())
  }, [])

  useEffect(() => { fetchOp() }, [fetchOp])
  useEffect(() => {
    const id = setInterval(() => { setTick(t => t + 1); fetchOp() }, 30000)
    return () => clearInterval(id)
  }, [fetchOp])

  // Re-render every second for live timers
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const fetchAna = useCallback(async () => {
    setLoadingAna(true)
    let desde: string, hasta: string
    if (customDesde && customHasta) {
      desde = new Date(customDesde).toISOString()
      hasta = new Date(customHasta + 'T23:59:59').toISOString()
    } else if (period === 0) {
      const d = new Date(); d.setHours(0, 0, 0, 0)
      desde = d.toISOString()
      hasta = new Date().toISOString()
    } else {
      const d = new Date(); d.setHours(0, 0, 0, 0)
      desde = new Date(d.getTime() - period * 86400000).toISOString()
      hasta = new Date().toISOString()
    }
    const res = await fetch(`/api/reportes?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`)
    if (res.ok) setAna(await res.json())
    setLoadingAna(false)
  }, [period, customDesde, customHasta])

  useEffect(() => {
    if (tab === 'analitico') fetchAna()
  }, [tab, fetchAna])

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Dashboard</h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
            {tab === 'operativo' ? 'Actualización cada 30s' : 'Vista analítica'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['operativo', 'analitico'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '6px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: tab === t ? 'hsl(221,83%,23%)' : 'var(--card)', color: tab === t ? 'white' : 'var(--foreground)', fontWeight: tab === t ? 600 : 400 }}>
              {t === 'operativo' ? 'Operativo' : 'Analítico'}
            </button>
          ))}
        </div>
      </div>

      {/* ── OPERATIVO ── */}
      {tab === 'operativo' && (
        op ? <OperativoView op={op} tick={tick} router={router} /> : (
          <div style={{ padding: '60px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando...</div>
        )
      )}

      {/* ── ANALÍTICO ── */}
      {tab === 'analitico' && (
        <AnaliticoView
          ana={ana}
          loading={loadingAna}
          period={period}
          setPeriod={(p) => { setPeriod(p); setCustomDesde(''); setCustomHasta('') }}
          customDesde={customDesde}
          customHasta={customHasta}
          setCustomDesde={setCustomDesde}
          setCustomHasta={setCustomHasta}
          onRefresh={fetchAna}
        />
      )}
    </div>
  )
}

const ESTADO_COLORS: Record<string, string> = {
  ABIERTO: '#185FA5', EN_SEGUIMIENTO: '#854F0B',
  ESCALADO_N1: '#C44B2B', ESCALADO_N2: '#A32D2D', ESCALADO_N3: '#7B1F1F',
}
const TIPO_COLORS: Record<string, string> = {
  CAIDA_TOTAL: '#A32D2D', INTERMITENCIA: '#854F0B',
  LENTITUD: '#185FA5', POS: '#1D9E75', OTROS: '#6B7280',
}

function OperativoView({ op, tick, router }: { op: any; tick: number; router: any }) {
  const { activos, escalamientosActivos, equipo } = op

  // Charts data derived from activos
  const estadoCounts: Record<string, number> = {}
  const agenteCounts: Record<string, { nombre: string; total: number }> = {}
  ;(activos ?? []).forEach((inc: any) => {
    estadoCounts[inc.estado] = (estadoCounts[inc.estado] ?? 0) + 1
    if (inc.agenteId) {
      if (!agenteCounts[inc.agenteId]) agenteCounts[inc.agenteId] = { nombre: inc.agenteNombre ?? '—', total: 0 }
      agenteCounts[inc.agenteId].total++
    }
  })
  const estadoData = Object.entries(estadoCounts).map(([estado, value]) => ({ estado, value }))
  const agenteData = Object.values(agenteCounts).sort((a, b) => b.total - a.total)

  return (
    <>
      {/* Active escalations panel */}
      {escalamientosActivos?.length > 0 && (
        <SectionCard title={`Escalamientos activos (${escalamientosActivos.length})`}>
          <div style={{ padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {escalamientosActivos.map((esc: any) => {
              const hasEmail = !!esc.horaEnvioCorreo
              const hasResp = !!esc.horaRespuesta
              const cd = hasEmail && !hasResp ? countdown(esc.horaEnvioCorreo, 60) : null
              const blink = cd?.warning || cd?.vencido
              return (
                <div key={esc.id}
                  onClick={() => router.push(`/incidentes/${esc.incidenteId}`)}
                  style={{ padding: '10px 14px', background: 'var(--muted)', borderRadius: '8px', cursor: 'pointer', minWidth: '200px', border: `0.5px solid ${blink ? '#A32D2D' : 'var(--border)'}` }}>
                  <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--muted-foreground)', marginBottom: '2px' }}>{esc.incidenteCodigo}</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>N{esc.nivel} — {esc.tiendaNombre}</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>{esc.contactoEscalado}</div>
                  {cd ? (
                    <div style={{ fontSize: '11px', fontFamily: 'monospace', color: cd.vencido ? '#A32D2D' : cd.warning ? '#854F0B' : 'var(--foreground)', fontWeight: 600 }}>
                      {cd.vencido ? '⚠ Vencido' : `⏱ ${cd.label}`}
                    </div>
                  ) : hasResp ? (
                    <div style={{ fontSize: '10px', color: '#27500A' }}>✓ Respondido en {esc.tiempoRespuestaMin}m</div>
                  ) : (
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Correo pendiente</div>
                  )}
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      {/* Mini charts row */}
      {(activos?.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
          {/* Estado distribution — donut */}
          <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '10px' }}>Distribución por estado</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <PieChart width={110} height={110}>
                <Pie data={estadoData} dataKey="value" nameKey="estado" cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={2}>
                  {estadoData.map((entry, i) => (
                    <Cell key={i} fill={ESTADO_COLORS[entry.estado] ?? '#6B7280'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6, border: '0.5px solid var(--border)' }} formatter={(v: any, name: any) => [v, name]} />
              </PieChart>
              <div style={{ flex: 1 }}>
                {estadoData.map(e => (
                  <div key={e.estado} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: ESTADO_COLORS[e.estado] ?? '#6B7280', flexShrink: 0 }} />
                    <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', flex: 1 }}>{e.estado.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'monospace' }}>{e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Incidents by agent — bar chart */}
          <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '10px' }}>Incidentes abiertos por agente</div>
            {agenteData.length > 0 ? (
              <ResponsiveContainer width="100%" height={90}>
                <BarChart data={agenteData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 9 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6, border: '0.5px solid var(--border)' }} formatter={(v: any) => [v, 'Incidentes']} />
                  <Bar dataKey="total" radius={[0, 3, 3, 0]}>
                    {agenteData.map((_, i) => <Cell key={i} fill={i === 0 ? '#A32D2D' : '#185FA5'} />)}
                    <LabelList dataKey="total" position="right" style={{ fontSize: 10, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', paddingTop: '8px' }}>Sin incidentes activos</div>
            )}
          </div>
        </div>
      )}

      {/* Open incidents grid */}
      <SectionCard title={`Incidentes abiertos (${activos?.length ?? 0})`}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--muted)' }}>
              {['ID', 'Agente', 'Tienda / Proveedor', 'Tipo', 'Impacto', 'Estado', 'Tiempo'].map(h => (
                <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(!activos || activos.length === 0) && (
              <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin incidentes activos</td></tr>
            )}
            {activos?.map((inc: any, idx: number) => {
              const t = elapsed(inc.horaRegistro)
              const critico = t.h >= 4
              return (
                <tr key={inc.id}
                  onClick={() => router.push(`/incidentes/${inc.id}`)}
                  style={{ borderTop: idx > 0 ? '0.5px solid var(--border)' : 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted-foreground)' }}>{inc.codigo}</td>
                  <td style={{ padding: '8px 10px', fontSize: '11px' }}>{inc.agenteNombre}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 500 }}>{inc.tiendaNombre}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{inc.proveedorNombre} · {inc.tiendaDistrito}</div>
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: '11px' }}>{TIPO_LABELS[inc.tipo] ?? inc.tipo}</td>
                  <td style={{ padding: '8px 10px' }}><Badge variant={impactoToVariant(inc.nivelImpacto)} /></td>
                  <td style={{ padding: '8px 10px' }}><Badge variant={estadoToVariant(inc.estado)} /></td>
                  <td style={{ padding: '8px 10px', fontSize: '11px', fontFamily: 'monospace', fontWeight: 600, color: critico ? '#A32D2D' : 'var(--foreground)' }}>{t.label}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </SectionCard>

      {/* Agent status cards */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Estado del equipo</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
          {equipo?.map((ag: any) => {
            const t = ag.incActivo ? elapsed(ag.incActivo.horaRegistro) : null
            return (
              <div key={ag.id}
                onClick={() => ag.incActivo && router.push(`/incidentes/${ag.incActivo.id}`)}
                style={{ padding: '12px 14px', background: 'var(--card)', border: `0.5px solid ${ag.incActivo ? '#185FA5' : 'var(--border)'}`, borderRadius: '10px', cursor: ag.incActivo ? 'pointer' : 'default' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>{ag.nombre}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '6px' }}>{ag.rol}</div>
                {ag.incActivo ? (
                  <>
                    <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>{ag.incActivo.codigo}</div>
                    <div style={{ fontSize: '11px', marginTop: '2px' }}>{ag.incActivo.tiendaNombre}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      <Badge variant={estadoToVariant(ag.incActivo.estado)} />
                      <span style={{ fontFamily: 'monospace', fontSize: '10px', color: t && t.h >= 4 ? '#A32D2D' : 'var(--muted-foreground)' }}>{t?.label}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '10px', color: '#27500A' }}>Libre</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function AnaliticoView({ ana, loading, period, setPeriod, customDesde, customHasta, setCustomDesde, setCustomHasta, onRefresh }: {
  ana: any; loading: boolean; period: number
  setPeriod: (p: number) => void
  customDesde: string; customHasta: string
  setCustomDesde: (v: string) => void; setCustomHasta: (v: string) => void
  onRefresh: () => void
}) {
  const charts = useRef<Record<string, any>>({})
  const [chartReady, setChartReady] = useState(false)

  useEffect(() => {
    if ((window as any).Chart) { setChartReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
    s.onload = () => setChartReady(true)
    document.head.appendChild(s)
    return () => { try { document.head.removeChild(s) } catch (_) {} }
  }, [])

  useEffect(() => {
    if (!chartReady || !ana) return
    const Chart = (window as any).Chart
    function make(id: string, cfg: any) {
      if (charts.current[id]) { try { charts.current[id].destroy() } catch (_) {} }
      const el = document.getElementById(id) as HTMLCanvasElement | null
      if (!el) return
      charts.current[id] = new Chart(el, cfg)
    }

    if (ana.byDay?.length) {
      make('ana-c1', {
        type: 'line',
        data: {
          labels: (ana.byDay as any[]).map((d: any) => d.dia?.slice(5)),
          datasets: [{
            label: 'Incidentes', data: (ana.byDay as any[]).map((d: any) => d.total),
            borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,0.08)',
            borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.3,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#888780', maxTicksLimit: 10 } },
            y: { grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 10 }, color: '#888780' }, beginAtZero: true },
          },
        },
      })
    }

    if (ana.byTipo?.length) {
      make('ana-c2', {
        type: 'doughnut',
        data: {
          labels: (ana.byTipo as any[]).map((t: any) => TIPO_LABELS[t.tipo] ?? t.tipo),
          datasets: [{
            data: (ana.byTipo as any[]).map((t: any) => t.total),
            backgroundColor: (ana.byTipo as any[]).map((t: any) => TIPO_COLORS_ANA[t.tipo] ?? '#D3D1C7'),
            borderWidth: 0,
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } },
      })
    }

    if (ana.mttrProveedor?.length) {
      const mp = ana.mttrProveedor as any[]
      make('ana-c3', {
        type: 'bar',
        data: {
          labels: mp.map((p: any) => p.nombre ?? '—'),
          datasets: [{
            data: mp.map((p: any) => Number(p.mttr_avg) || 0),
            backgroundColor: mp.map((p: any) => { const v = Number(p.mttr_avg) || 0; return v < 120 ? '#639922' : v < 240 ? '#BA7517' : '#A32D2D' }),
            borderWidth: 0, borderRadius: 3,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => { const v = ctx.raw; const h = Math.floor(v / 60); const m = v % 60; return h > 0 ? `${h}h ${m}m` : `${m}m` } } } },
          scales: {
            x: { grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 10 }, color: '#888780', callback: (v: any) => { const h = Math.floor(v / 60); return h > 0 ? `${h}h` : `${v}m` } }, beginAtZero: true },
            y: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#444441' } },
          },
        },
      })
    }

    if (ana.byZona?.length) {
      const bz = ana.byZona as any[]
      make('ana-cz', {
        type: 'bar',
        data: {
          labels: bz.map((z: any) => z.zona),
          datasets: [{ data: bz.map((z: any) => z.total), backgroundColor: ZONA_COLORS_ANA.slice(0, bz.length), borderWidth: 0, borderRadius: 3 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 10 }, color: '#888780' }, beginAtZero: true },
            y: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#444441' } },
          },
        },
      })
    }

    if (ana.slaTendencia?.length) {
      const st = ana.slaTendencia as any[]
      const meses = [...new Set(st.map((r: any) => r.mes))].sort() as string[]
      const provs = [...new Set(st.map((r: any) => r.nombre))].filter(Boolean) as string[]
      const pivot: Record<string, Record<string, number>> = {}
      for (const r of st) { if (!pivot[r.mes]) pivot[r.mes] = {}; pivot[r.mes][r.nombre] = r.sla_pct }
      make('ana-cs', {
        type: 'line',
        data: {
          labels: meses.map(m => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1).toLocaleDateString('es-PE', { month: 'short' }) }),
          datasets: provs.map((p, i) => ({
            label: p, data: meses.map(m => pivot[m]?.[p] ?? null),
            borderColor: PROV_LINE_COLORS[i % PROV_LINE_COLORS.length], backgroundColor: 'transparent',
            borderWidth: 2, pointRadius: 3, tension: 0.3, borderDash: PROV_LINE_DASHES[i] || [], spanGaps: true,
          })),
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#444441', autoSkip: false } },
            y: { grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 10 }, color: '#888780', callback: (v: any) => `${v}%` }, min: 0, max: 100 },
          },
        },
      })
    }

    if (ana.mttrZonaMes?.length) {
      const mz = ana.mttrZonaMes as any[]
      const meses = [...new Set(mz.map((r: any) => r.mes))].sort() as string[]
      const zones = [...new Set(mz.map((r: any) => r.zona))] as string[]
      const pivot: Record<string, Record<string, number>> = {}
      for (const r of mz) { if (!pivot[r.mes]) pivot[r.mes] = {}; pivot[r.mes][r.zona] = r.mttr_avg }
      const zc: Record<string, string> = { Lima: '#378ADD', Provincia: '#EF9F27' }
      make('ana-c4', {
        type: 'bar',
        data: {
          labels: meses.map(m => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1).toLocaleDateString('es-PE', { month: 'short' }) }),
          datasets: zones.map(z => ({
            label: z, data: meses.map(m => pivot[m]?.[z] ?? null),
            backgroundColor: zc[z] ?? '#185FA5', borderWidth: 0, borderRadius: 3,
          })),
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => { const v = ctx.raw; if (!v) return ''; const h = Math.floor(v / 60); const m = v % 60; return `${ctx.dataset.label}: ${h > 0 ? `${h}h ${m}m` : `${m}m`}` } } } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#444441' } },
            y: { grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 10 }, color: '#888780', callback: (v: any) => { const h = Math.floor(v / 60); return h > 0 ? `${h}h` : `${v}m` } }, beginAtZero: true },
          },
        },
      })
    }

    return () => { Object.values(charts.current).forEach((c: any) => { try { c.destroy() } catch (_) {} }); charts.current = {} }
  }, [chartReady, ana])

  function exportCSV() {
    if (!ana) return
    const params = new URLSearchParams()
    if (customDesde && customHasta) {
      params.set('desde', new Date(customDesde).toISOString())
      params.set('hasta', new Date(customHasta + 'T23:59:59').toISOString())
    } else if (period === 0) {
      const d = new Date(); d.setHours(0, 0, 0, 0)
      params.set('desde', d.toISOString())
      params.set('hasta', new Date().toISOString())
    } else {
      params.set('desde', new Date(Date.now() - period * 86400000).toISOString())
      params.set('hasta', new Date().toISOString())
    }
    window.open(`/api/reportes/export?${params}`, '_blank')
  }

  const tot = ana?.totales ?? {}
  const dTotal = tot.prevTotal ? deltaPct(tot.total, tot.prevTotal) : null
  const dMttr = tot.prevMttrAvg && tot.mttrAvg ? deltaPct(tot.prevMttrAvg, tot.mttrAvg) : null
  const provsTend = ana?.slaTendencia?.length
    ? [...new Set((ana.slaTendencia as any[]).map((r: any) => r.nombre))].filter(Boolean) as string[]
    : []
  const maxCosto = Math.max(...((ana?.costoProveedor ?? []) as any[]).map((p: any) => p.costo ?? 0), 1)
  const maxZona = Math.max(...((ana?.byZona ?? []) as any[]).map((z: any) => z.total ?? 0), 1)
  const mttrLima = Number(ana?.mttrZonaLatest?.['Lima'] || 0)
  const mttrProvVal = Number(ana?.mttrZonaLatest?.['Provincia'] || 0)

  return (
    <>
      {/* ── Filtros ── */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        {PERIOD_OPTIONS.map(opt => (
          <button key={opt.days} onClick={() => setPeriod(opt.days)}
            style={{ padding: '5px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: period === opt.days && !customDesde ? 'hsl(221,83%,23%)' : 'var(--card)', color: period === opt.days && !customDesde ? 'white' : 'var(--foreground)' }}>
            {opt.label}
          </button>
        ))}
        <input type="date" value={customDesde} onChange={e => setCustomDesde(e.target.value)}
          style={{ padding: '5px 8px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
        <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>—</span>
        <input type="date" value={customHasta} onChange={e => setCustomHasta(e.target.value)}
          style={{ padding: '5px 8px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
        <button onClick={onRefresh}
          style={{ padding: '5px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--card)', color: 'var(--foreground)' }}>
          Actualizar
        </button>
        <button onClick={exportCSV}
          style={{ padding: '5px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--card)', color: 'var(--foreground)', marginLeft: 'auto' }}>
          Exportar CSV
        </button>
      </div>

      {loading && !ana && (
        <div style={{ padding: '60px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando...</div>
      )}

      {ana && (
        <>
          {/* ── KPI cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '14px' }}>
            {[
              { label: 'Incidentes', val: tot.total, delta: dTotal !== null ? (dTotal >= 0 ? `+${dTotal}% vs período anterior` : `${dTotal}% vs período anterior`) : null, cls: dTotal !== null ? (dTotal > 0 ? '#A32D2D' : '#3B6D11') : 'var(--muted-foreground)' },
              { label: 'MTTR promedio', val: minToHM(tot.mttrAvg), delta: dMttr !== null ? (dMttr > 0 ? `Mejor en ${Math.abs(tot.mttrAvg - tot.prevMttrAvg)}m` : `Peor en ${Math.abs(tot.mttrAvg - tot.prevMttrAvg)}m`) : null, cls: dMttr !== null ? (dMttr > 0 ? '#3B6D11' : '#A32D2D') : 'var(--muted-foreground)' },
              { label: 'Cumplimiento SLA', val: `${tot.slaPct ?? 0}%`, delta: 'Meta: 90%', cls: (tot.slaPct ?? 0) >= 90 ? '#3B6D11' : '#A32D2D' },
              { label: 'Tiendas afectadas', val: tot.tiendas ?? 0, delta: null, cls: 'var(--muted-foreground)' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--muted)', borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>{k.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 500, lineHeight: 1.1 }}>{k.val}</div>
                {k.delta && <div style={{ fontSize: '11px', marginTop: '3px', color: k.cls }}>{k.delta}</div>}
              </div>
            ))}
          </div>

          {/* ── Incidentes por día ── */}
          <div style={{ ...AP, marginBottom: '10px' }}>
            <div style={APT}>Incidentes por día</div>
            <div style={APS}>Período seleccionado</div>
            {ana.byDay?.length > 0
              ? <div style={{ position: 'relative', width: '100%', height: '140px' }}><canvas id="ana-c1" /></div>
              : <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</div>
            }
          </div>

          {/* ── MTTR + Tipo ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div style={AP}>
              <div style={APT}>MTTR por proveedor</div>
              <div style={APS}>Tiempo promedio de resolución</div>
              {ana.mttrProveedor?.length > 0
                ? <div style={{ position: 'relative', width: '100%', height: '200px' }}><canvas id="ana-c3" /></div>
                : <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</div>
              }
            </div>
            <div style={AP}>
              <div style={APT}>Distribución por tipo</div>
              <div style={APS}>Porcentaje por categoría</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                {(ana.byTipo as any[]).map((t: any) => (
                  <span key={t.tipo} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: TIPO_COLORS_ANA[t.tipo] ?? '#D3D1C7', flexShrink: 0, display: 'inline-block' }} />
                    {TIPO_LABELS[t.tipo] ?? t.tipo} {Math.round(t.total / Math.max(ana.byTipo.reduce((s: number, x: any) => s + x.total, 0), 1) * 100)}%
                  </span>
                ))}
              </div>
              {ana.byTipo?.length > 0
                ? <div style={{ position: 'relative', width: '100%', height: '150px' }}><canvas id="ana-c2" /></div>
                : <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</div>
              }
            </div>
          </div>

          {/* ── SLA + Top tiendas ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div style={AP}>
              <div style={APT}>Cumplimiento SLA por proveedor</div>
              <div style={APS}>% incidentes resueltos dentro de 4 horas</div>
              {(ana.slaProveedor as any[]).length === 0 && <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</div>}
              {(ana.slaProveedor as any[]).map((p: any) => {
                const b = slaBadge(p.sla_pct)
                return (
                  <div key={p.nombre} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', ...ASEP }}>
                    <div style={{ fontSize: '12px' }}>{p.nombre ?? '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '80px', height: '5px', background: 'var(--muted)', borderRadius: '3px', overflow: 'hidden', margin: '0 8px' }}>
                        <div style={{ height: '5px', borderRadius: '3px', width: `${p.sla_pct ?? 0}%`, background: (p.sla_pct ?? 0) >= 80 ? '#639922' : (p.sla_pct ?? 0) >= 60 ? '#BA7517' : '#A32D2D' }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 500, width: '32px', textAlign: 'right' }}>{p.sla_pct ?? 0}%</span>
                      <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', background: b.bg, color: b.color }}>{b.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={AP}>
              <div style={APT}>Top 10 tiendas con más incidentes</div>
              <div style={APS}>Período seleccionado</div>
              {(ana.topTiendas as any[]).length === 0 && <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</div>}
              {(ana.topTiendas as any[]).map((t: any, idx: number) => (
                <div key={t.codigo ?? idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', ...ASEP }}>
                  <span style={{ width: '16px', fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)', flexShrink: 0 }}>{idx + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px' }}>{t.codigo} — {t.nombre}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{t.proveedor} · {t.distrito}</div>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'monospace' }}>{t.total}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Costo + Reincidencia ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div style={AP}>
              <div style={APT}>Costo de indisponibilidad por proveedor</div>
              <div style={APS}>S/ por hora de caída real</div>
              {(ana.costoProveedor as any[]).length === 0 && <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</div>}
              {(ana.costoProveedor as any[]).map((p: any) => {
                const b = costoBadge(p.costo)
                const barPct = maxCosto > 0 ? Math.round((p.costo ?? 0) / maxCosto * 100) : 0
                return (
                  <div key={p.nombre} style={{ display: 'flex', alignItems: 'center', padding: '7px 0', gap: '8px', ...ASEP }}>
                    <span style={{ fontSize: '12px', width: '80px', flexShrink: 0 }}>{p.nombre}</span>
                    <div style={{ flex: 1, height: '5px', background: 'var(--muted)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '5px', borderRadius: '3px', width: `${barPct}%`, background: b.color === '#3B6D11' ? '#639922' : b.color === '#854F0B' ? '#BA7517' : '#A32D2D' }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'monospace', width: '60px', textAlign: 'right', flexShrink: 0, color: b.color }}>{p.costo !== null ? `S/${p.costo}/h` : '—'}</span>
                    <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '4px', flexShrink: 0, background: b.bg, color: b.color }}>{b.label}</span>
                  </div>
                )
              })}
              {ana.costoProveedor?.length > 1 && (() => {
                const sorted = [...(ana.costoProveedor as any[])].filter((p: any) => p.costo).sort((a: any, b: any) => b.costo - a.costo)
                const worst = sorted[0]; const best = sorted[sorted.length - 1]
                if (!worst || !best || worst.nombre === best.nombre) return null
                return (
                  <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '8px 10px', marginTop: '10px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 500, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>Insight</div>
                    <div style={{ fontSize: '11px', lineHeight: 1.5 }}>{worst.nombre} (S/{worst.costo}/h) es {Math.round(worst.costo / best.costo)}x más caro que {best.nombre} en costo real por caída.</div>
                  </div>
                )
              })()}
            </div>
            <div style={AP}>
              <div style={APT}>Reincidencia por tienda</div>
              <div style={APS}>Tiendas con más de 1 incidente en el período</div>
              {(ana.reincidencia as any[]).length === 0 && <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin reincidencias</div>}
              {(ana.reincidencia as any[]).map((t: any, idx: number) => {
                const b = reincBadge(t.incidentes)
                return (
                  <div key={t.codigo ?? idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', ...ASEP }}>
                    <span style={{ width: '16px', fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)', flexShrink: 0 }}>{idx + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px' }}>{t.codigo} — {t.nombre}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{t.proveedor} · {t.distrito}</div>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '4px', background: b.bg, color: b.color }}>{t.incidentes} caídas</span>
                  </div>
                )
              })}
              {ana.reincidencia?.length > 0 && (() => {
                const top = (ana.reincidencia as any[])[0]
                return (
                  <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '8px 10px', marginTop: '10px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 500, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>Insight</div>
                    <div style={{ fontSize: '11px', lineHeight: 1.5 }}>{top.codigo} con {top.incidentes} caídas sugiere problema estructural — revisar router o cambio de proveedor.</div>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* ── Zona + SLA tendencia ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div style={AP}>
              <div style={APT}>Incidentes por zona geográfica</div>
              <div style={APS}>Distribución del período</div>
              {ana.byZona?.length > 0
                ? <div style={{ position: 'relative', width: '100%', height: '180px', marginBottom: '10px' }}><canvas id="ana-cz" /></div>
                : <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</div>
              }
              {(ana.byZona as any[]).map((z: any, i: number) => {
                const total = (ana.byZona as any[]).reduce((s: number, x: any) => s + x.total, 0)
                return (
                  <div key={z.zona} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', ...ASEP }}>
                    <span style={{ fontSize: '12px', width: '110px', flexShrink: 0 }}>{z.zona}</span>
                    <div style={{ flex: 1, height: '5px', background: 'var(--muted)', borderRadius: '3px', overflow: 'hidden', margin: '0 8px' }}>
                      <div style={{ height: '5px', borderRadius: '3px', width: `${Math.round(z.total / maxZona * 100)}%`, background: ZONA_COLORS_ANA[i % ZONA_COLORS_ANA.length] }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'monospace', width: '24px', textAlign: 'right' }}>{z.total}</span>
                    <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', width: '30px', textAlign: 'right' }}>{Math.round(z.total / Math.max(total, 1) * 100)}%</span>
                  </div>
                )
              })}
            </div>
            <div style={AP}>
              <div style={APT}>Tendencia SLA — últimos 6 meses</div>
              <div style={APS}>Cumplimiento mensual por proveedor</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                {provsTend.map((p, i) => (
                  <span key={p} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: PROV_LINE_COLORS[i % PROV_LINE_COLORS.length], flexShrink: 0, display: 'inline-block' }} />
                    {p}
                  </span>
                ))}
              </div>
              {ana.slaTendencia?.length > 0
                ? <div style={{ position: 'relative', width: '100%', height: '200px' }}><canvas id="ana-cs" /></div>
                : <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos históricos</div>
              }
            </div>
          </div>

          {/* ── MTTR Lima vs Provincia ── */}
          <div style={AP}>
            <div style={APT}>MTTR Lima vs Provincia</div>
            <div style={APS}>Tiempo promedio de resolución · últimos 3 meses</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', alignItems: 'center' }}>
              {ana.mttrZonaMes?.length > 0
                ? <div style={{ position: 'relative', width: '100%', height: '160px' }}><canvas id="ana-c4" /></div>
                : <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</div>
              }
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { label: 'Lima', val: minToHM(mttrLima), color: '#185FA5' },
                  { label: 'Provincia', val: minToHM(mttrProvVal), color: '#854F0B' },
                ].map(z => (
                  <div key={z.label} style={{ background: 'var(--muted)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>{z.label}</div>
                    <div style={{ fontSize: '20px', fontWeight: 500, color: z.color }}>{z.val}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>promedio MTTR</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
