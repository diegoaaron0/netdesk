'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import type { SLATrendResponse } from '@/types/sla-trend'

interface Props {
  proveedorId: string
  refreshKey: number
}

// ─── Color helpers ────────────────────────────────────────────────────────────

const PROV_COLORS: Record<string, string> = {
  BITEL: '#16A34A', ENTEL: '#2563EB', CLARO: '#DC2626',
  MOVISTAR: '#9333EA', CONVERGIA: '#F59E0B',
}
function getProvColor(nombre: string): string {
  const upper = nombre.toUpperCase()
  for (const [k, v] of Object.entries(PROV_COLORS)) {
    if (upper.includes(k)) return v
  }
  return '#6B7280'
}

function estadoLabel(e: string) {
  if (e === 'optimo') return 'Óptimo'
  if (e === 'revisar') return 'Revisar'
  return 'Crítico'
}
function estadoColor(e: string) {
  if (e === 'optimo') return '#3B6D11'
  if (e === 'revisar') return '#854F0B'
  return '#A32D2D'
}
function estadoBg(e: string) {
  if (e === 'optimo') return '#EAF3DE'
  if (e === 'revisar') return '#FAEEDA'
  return '#FCEBEB'
}
function fmtMin(min: number | null | undefined) {
  if (min == null) return '—'
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function sixMonthsAgo() {
  const d = new Date(); d.setMonth(d.getMonth() - 6); d.setDate(1); d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}
function todayStr() { return new Date().toISOString().split('T')[0] }

function Sk({ w = '60%', h = 14 }: { w?: string; h?: number }) {
  return (
    <div style={{ width: w, height: h, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', borderRadius: 4, animation: 'shimmer 1.4s infinite' }} />
  )
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, proveedores }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '8px', padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: '200px', fontSize: '11px' }}>
      <div style={{ fontWeight: 700, marginBottom: '8px', color: '#0f172a' }}>{label}</div>
      {payload.filter((p: any) => p.value != null).map((p: any) => {
        const prov = p.dataKey
        const data = p.payload
        const estado = data[`${prov}_estado`] as string ?? ''
        const varPP  = data[`${prov}_varPP`] as number | null
        return (
          <div key={prov} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '0.5px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: getProvColor(prov), display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>{prov}</span>
            </div>
            {[
              ['SLA', `${p.value}%`],
              ['Meta SLA', '90%'],
              ['Diferencia vs meta', `${p.value - 90 >= 0 ? '+' : ''}${p.value - 90} pp`],
              ['Evaluables', data[`${prov}_eval`]],
              ['Fuera SLA', data[`${prov}_fuera`]],
              ['T. prom. respuesta', fmtMin(data[`${prov}_tResp`] as number)],
              ['T. prom. resolución', fmtMin(data[`${prov}_tResol`] as number)],
              ['Variación vs mes ant.', varPP != null ? `${varPP >= 0 ? '+' : ''}${varPP} pp` : '—'],
            ].map(([k, v]) => (
              <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '2px' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
            {estado && (
              <span style={{ display: 'inline-block', marginTop: '4px', fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '999px', background: estadoBg(estado), color: estadoColor(estado) }}>
                {estadoLabel(estado)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Custom dot label ─────────────────────────────────────────────────────────

function DotLabel(props: any) {
  const { x, y, value } = props
  if (value == null) return null
  return (
    <text x={x} y={y - 8} textAnchor="middle" fontSize={9} fill={props.fill ?? '#374151'} fontWeight={500}>
      {value}%
    </text>
  )
}

// ─── Main Card ────────────────────────────────────────────────────────────────

export default function SlaTrendSixMonthsCard({ proveedorId, refreshKey }: Props) {
  const router = useRouter()
  const [data, setData] = useState<SLATrendResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const desde = sixMonthsAgo(); const hasta = todayStr()
      const params = new URLSearchParams({ desde, hasta })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/tendencia-sla-6m?${params}`)
      if (res.ok) setData(await res.json())
      else setError(true)
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [proveedorId])

  useEffect(() => { fetchData() }, [refreshKey, proveedorId])

  const proveedores = data?.proveedoresEnGrafico ?? []
  const chartData   = data?.chartData ?? []
  const puntos      = data?.puntos ?? []

  // Latest month per provider for the right-side table
  const latestMes = chartData[chartData.length - 1]
  const latestMesLabel = latestMes?.mesLabel ?? ''

  // Previous month for variation
  const prevMes = chartData[chartData.length - 2]

  const tableRows = proveedores.map((prov) => {
    const slaActual = latestMes ? (latestMes[prov] as number | null) : null
    const slaPrev   = prevMes  ? (prevMes[prov]   as number | null) : null
    const varPP     = slaActual != null && slaPrev != null ? slaActual - slaPrev : null
    return { prov, slaActual, varPP }
  })

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>G. Tendencia SLA últimos 6 meses</div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Evolución del cumplimiento SLA general por proveedor</div>
        </div>
        <button onClick={() => router.push(`/dashboard/tendencia-sla-6m${proveedorId ? `?proveedorId=${proveedorId}` : ''}`)} style={{ background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Ver detalle →</button>
      </div>

      {/* Chart + Table layout */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch' }}>

        {/* Line chart */}
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          {loading ? (
            <div style={{ height: '180px', background: 'var(--muted)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando…</span>
            </div>
          ) : error ? (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#A32D2D' }}>Error al cargar datos</div>
          ) : chartData.length === 0 ? (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos evaluables en el período</div>
          ) : (
            <ResponsiveContainer width="100%" height={185}>
              <LineChart data={chartData} margin={{ top: 18, right: 20, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="mesLabel" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<CustomTooltip proveedores={proveedores} />} />
                <ReferenceLine
                  y={90} stroke="#6366F1" strokeDasharray="6 3"
                  label={{ value: 'Meta SLA 90%', position: 'insideTopRight', fontSize: 10, fill: '#6366F1', fontWeight: 600 }}
                />
                <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                {proveedores.map((prov) => (
                  <Line
                    key={prov}
                    type="monotone"
                    dataKey={prov}
                    stroke={getProvColor(prov)}
                    strokeWidth={2}
                    dot={{ r: 4, fill: getProvColor(prov) }}
                    label={<DotLabel fill={getProvColor(prov)} />}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Right-side table */}
        {!loading && tableRows.length > 0 && (
          <div style={{ width: '260px', flexShrink: 0, borderLeft: '0.5px solid var(--border)', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '0' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
              {latestMesLabel}
            </div>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 52px 70px', gap: '4px', paddingBottom: '6px', borderBottom: '0.5px solid var(--border)', marginBottom: '2px' }}>
              {['Proveedor', 'SLA', 'Var.', 'Estado'].map((h) => (
                <span key={h} style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>
            {tableRows.map(({ prov, slaActual, varPP }) => {
              const estado = slaActual == null ? 'critico' : slaActual >= 90 ? 'optimo' : slaActual >= 70 ? 'revisar' : 'critico'
              return (
                <div key={prov} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 52px 70px', gap: '4px', padding: '7px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: getProvColor(prov), flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prov}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: estadoColor(estado) }}>
                    {slaActual != null ? `${slaActual}%` : '—'}
                  </span>
                  <span style={{ fontSize: '11px', color: varPP == null ? '#94A3B8' : varPP >= 0 ? '#3B6D11' : '#A32D2D', fontWeight: 500 }}>
                    {varPP != null ? `${varPP >= 0 ? '+' : ''}${varPP} pp` : '—'}
                  </span>
                  <span style={{ fontSize: '9px', fontWeight: 600, padding: '2px 6px', borderRadius: '999px', background: estadoBg(estado), color: estadoColor(estado), textAlign: 'center', whiteSpace: 'nowrap', display: 'inline-block' }}>
                    {estadoLabel(estado)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
