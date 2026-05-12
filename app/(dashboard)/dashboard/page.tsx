'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, estadoToVariant, impactoToVariant } from '@/components/ui/Badge'
import { BarChart, Bar, Cell, PieChart, Pie, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import DashboardAnalitico from './components/DashboardAnalitico'

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

const ESTADO_COLORS: Record<string, string> = {
  ABIERTO: '#185FA5', EN_SEGUIMIENTO: '#854F0B',
  ESCALADO_N1: '#C44B2B', ESCALADO_N2: '#A32D2D', ESCALADO_N3: '#7B1F1F',
}

export default function DashboardPage() {
  const router = useRouter()
  const [op, setOp] = useState<any>(null)
  const [tick, setTick] = useState(0)
  const [tab, setTab] = useState<'operativo' | 'analitico'>('operativo')

  const fetchOp = useCallback(async () => {
    const res = await fetch('/api/dashboard/operativo')
    if (res.ok) setOp(await res.json())
  }, [])

  useEffect(() => { fetchOp() }, [fetchOp])
  useEffect(() => {
    const id = setInterval(() => { setTick(t => t + 1); fetchOp() }, 30000)
    return () => clearInterval(id)
  }, [fetchOp])

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div>
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

      {tab === 'operativo' && (
        op
          ? <OperativoView op={op} tick={tick} router={router} />
          : <div style={{ padding: '60px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando...</div>
      )}

      {tab === 'analitico' && <DashboardAnalitico />}
    </div>
  )
}

function OperativoView({ op, tick, router }: { op: any; tick: number; router: any }) {
  const { activos, escalamientosActivos, equipo } = op

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

      {activos?.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
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
