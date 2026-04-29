'use client'
import { useEffect, useState, useCallback } from 'react'
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

function proveedorBadge(mttrAvg: number | null) {
  if (!mttrAvg) return { bg: '#F1EFE8', color: '#444441', label: 'Sin datos' }
  if (mttrAvg < 120) return { bg: '#EAF3DE', color: '#27500A', label: 'OK' }
  if (mttrAvg < 240) return { bg: '#FAEEDA', color: '#854F0B', label: 'Lento' }
  return { bg: '#FCEBEB', color: '#A32D2D', label: 'Crítico' }
}

const PERIOD_OPTIONS = [
  { label: 'Hoy', days: 0 },
  { label: 'Ayer', days: 1 },
  { label: '7 días', days: 7 },
  { label: '15 días', days: 15 },
  { label: '30 días', days: 30 },
]

export default function DashboardPage() {
  const router = useRouter()
  const [op, setOp] = useState<any>(null)
  const [tick, setTick] = useState(0)
  const [tab, setTab] = useState<'operativo' | 'analitico'>('operativo')

  // Analítico
  const [period, setPeriod] = useState(7)
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
    } else if (period === 1) {
      const d = new Date(); d.setHours(0, 0, 0, 0)
      const ayer = new Date(d); ayer.setDate(ayer.getDate() - 1)
      desde = ayer.toISOString()
      hasta = d.toISOString()
    } else {
      const d = new Date(); d.setHours(0, 0, 0, 0)
      desde = new Date(d.getTime() - period * 86400000).toISOString()
      hasta = new Date().toISOString()
    }
    const res = await fetch(`/api/dashboard/analitico?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`)
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
  return (
    <>
      {/* Period filter */}
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
      </div>

      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando...</div>
      )}

      {!loading && ana && (
        <>
          {/* Line chart */}
          {ana.byDay?.length > 0 && (
            <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', padding: '14px', marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '10px' }}>Incidentes por día</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={ana.byDay} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 6, border: '0.5px solid var(--border)', background: 'var(--card)' }}
                    formatter={(v: any, name: any) => [v, name === 'total' ? 'Total' : 'Resueltos']}
                    labelFormatter={(l: any) => l}
                  />
                  <Line type="monotone" dataKey="total" stroke="#185FA5" strokeWidth={2} dot={false} name="total" />
                  <Line type="monotone" dataKey="resueltos" stroke="#27500A" strokeWidth={2} dot={false} name="resueltos" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            {/* Provider ranking */}
            <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', fontSize: '12px', fontWeight: 600 }}>Ranking proveedores</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--muted)' }}>
                    {['Proveedor', 'Total', 'T2avg', 'T3avg', ''].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ana.proveedores?.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</td></tr>
                  )}
                  {ana.proveedores?.map((p: any, idx: number) => {
                    const b = proveedorBadge(p.mttr_avg)
                    return (
                      <tr key={p.nombre ?? idx} style={{ borderTop: idx > 0 ? '0.5px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '7px 8px', fontSize: '11px', fontWeight: 500 }}>{p.nombre ?? '—'}</td>
                        <td style={{ padding: '7px 8px', fontSize: '11px' }}>{p.total}</td>
                        <td style={{ padding: '7px 8px', fontSize: '11px', fontFamily: 'monospace' }}>{p.t2_avg ? `${p.t2_avg}m` : '—'}</td>
                        <td style={{ padding: '7px 8px', fontSize: '11px', fontFamily: 'monospace' }}>{p.t3_avg ? `${p.t3_avg}m` : '—'}</td>
                        <td style={{ padding: '7px 8px' }}>
                          <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 600, background: b.bg, color: b.color }}>{b.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Top 10 tiendas */}
            <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', fontSize: '12px', fontWeight: 600 }}>Top tiendas</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--muted)' }}>
                    {['#', 'Tienda', 'Total', 'MTTR'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ana.topTiendas?.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</td></tr>
                  )}
                  {ana.topTiendas?.map((t: any, idx: number) => {
                    const color = idx === 0 ? '#A32D2D' : idx === 1 ? '#854F0B' : idx < 5 ? '#185FA5' : 'var(--foreground)'
                    return (
                      <tr key={t.codigo ?? idx} style={{ borderTop: idx > 0 ? '0.5px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '7px 8px', fontSize: '11px', color, fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '7px 8px' }}>
                          <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}>{t.codigo}</div>
                          <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{t.nombre} · {t.distrito}</div>
                        </td>
                        <td style={{ padding: '7px 8px', fontSize: '12px', fontWeight: 600 }}>{t.total}</td>
                        <td style={{ padding: '7px 8px', fontSize: '11px', fontFamily: 'monospace' }}>{t.mttr_avg ? `${t.mttr_avg}m` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* MTTR por proveedor — bar chart */}
          {ana.proveedores?.some((p: any) => p.mttr_avg) && (
            <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', padding: '14px', marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '10px' }}>MTTR promedio por proveedor (minutos)</div>
              <ResponsiveContainer width="100%" height={Math.max(80, ana.proveedores.length * 36)}>
                <BarChart
                  data={ana.proveedores.filter((p: any) => p.mttr_avg).map((p: any) => ({ nombre: p.nombre ?? '—', mttr: Number(p.mttr_avg), total: p.total }))}
                  layout="vertical" margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 9 }} unit="m" />
                  <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={110} />
                  <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6, border: '0.5px solid var(--border)' }} formatter={(v: any) => [`${v}m`, 'MTTR avg']} />
                  <Bar dataKey="mttr" radius={[0, 4, 4, 0]}>
                    {ana.proveedores.filter((p: any) => p.mttr_avg).map((_: any, i: number) => {
                      const v = Number(ana.proveedores.filter((p: any) => p.mttr_avg)[i]?.mttr_avg ?? 0)
                      const fill = v < 120 ? '#27500A' : v < 240 ? '#854F0B' : '#A32D2D'
                      return <Cell key={i} fill={fill} />
                    })}
                    <LabelList dataKey="mttr" position="right" formatter={(v: any) => `${v}m`} style={{ fontSize: 10, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {/* MTTR by zona */}
            <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', fontSize: '12px', fontWeight: 600 }}>MTTR Lima vs Provincia</div>
              <div style={{ padding: '14px 14px 8px' }}>
                {(!ana.mttrZona || ana.mttrZona.length === 0) && (
                  <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</div>
                )}
                {ana.mttrZona?.length > 0 && (
                  <>
                    {ana.mttrZona.map((z: any) => (
                      <div key={z.zona} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 500 }}>{z.zona}</div>
                          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{z.total} resueltos</div>
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700 }}>{z.mttr_avg ? `${z.mttr_avg}m` : '—'}</div>
                      </div>
                    ))}
                    <ResponsiveContainer width="100%" height={80}>
                      <BarChart data={ana.mttrZona.map((z: any) => ({ zona: z.zona, mttr: Number(z.mttr_avg ?? 0) }))} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <XAxis dataKey="zona" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 9 }} unit="m" />
                        <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6 }} formatter={(v: any) => [`${v}m`, 'MTTR']} />
                        <Bar dataKey="mttr" radius={[4, 4, 0, 0]}>
                          {ana.mttrZona.map((_: any, i: number) => <Cell key={i} fill={i === 0 ? '#185FA5' : '#1D9E75'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                )}
              </div>
            </div>

            {/* By tipo — recharts horizontal bar */}
            <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', fontSize: '12px', fontWeight: 600 }}>Distribución por tipo</div>
              <div style={{ padding: '14px' }}>
                {(!ana.byTipo || ana.byTipo.length === 0) ? (
                  <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(100, ana.byTipo.length * 32)}>
                    <BarChart
                      data={ana.byTipo.map((t: any) => ({ tipo: TIPO_LABELS[t.tipo] ?? t.tipo, total: Number(t.total), key: t.tipo }))}
                      layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 9 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="tipo" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6, border: '0.5px solid var(--border)' }} formatter={(v: any) => [v, 'Incidentes']} />
                      <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                        {ana.byTipo.map((t: any, i: number) => <Cell key={i} fill={TIPO_COLORS[t.tipo] ?? '#6B7280'} />)}
                        <LabelList dataKey="total" position="right" style={{ fontSize: 10, fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
