'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import type { SLATrendResponse } from '@/types/sla-trend'

interface Props {
  proveedorId: string
  refreshKey: number
}

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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px', padding: '8px 10px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', fontSize: '10px', minWidth: '170px' }}>
      <div style={{ fontWeight: 700, marginBottom: '5px', fontSize: '11px', color: '#0f172a' }}>{label}</div>
      {payload.filter((p: any) => p.value != null).map((p: any) => {
        const prov = p.dataKey
        const d = p.payload
        const varPP = d[`${prov}_varPP`] as number | null
        return (
          <div key={prov} style={{ marginBottom: '5px', paddingBottom: '5px', borderBottom: '0.5px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: getProvColor(prov), display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{prov}</span>
              <span style={{ fontWeight: 700, color: p.value >= 90 ? '#3B6D11' : p.value >= 70 ? '#BA7517' : '#A32D2D', marginLeft: 'auto' }}>{p.value}%</span>
            </div>
            <div style={{ color: '#64748b', display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span>vs meta 90%</span>
                <span style={{ fontWeight: 600, color: p.value >= 90 ? '#3B6D11' : '#A32D2D' }}>{p.value - 90 >= 0 ? '+' : ''}{p.value - 90} pp</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span>vs mes ant.</span>
                <span style={{ fontWeight: 600, color: varPP == null ? '#94A3B8' : varPP >= 0 ? '#3B6D11' : '#A32D2D' }}>
                  {varPP != null ? `${varPP >= 0 ? '+' : ''}${varPP} pp` : '—'}
                </span>
              </div>
              {d[`${prov}_fuera`] != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <span>Fuera SLA</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{d[`${prov}_fuera`]}</span>
                </div>
              )}
              {d[`${prov}_tResp`] != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <span>T. respuesta</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{fmtMin(d[`${prov}_tResp`])}</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

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
  const prevMes     = chartData[chartData.length - 2]
  const lastIdx     = chartData.length - 1

  return (
    <div onClick={() => router.push(`/dashboard/tendencia-sla-6m${proveedorId ? `?proveedorId=${proveedorId}` : ''}`)} style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px', cursor: 'pointer' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginRight: 'auto' }}>G. Tendencia SLA — 6 meses</span>
        {!loading && proveedores.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {proveedores.map((p) => (
              <span key={p} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '9px', color: '#64748b' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: getProvColor(p), display: 'inline-block' }} />
                {p}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Cargando...
        </div>
      )}
      {error && (
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#A32D2D' }}>Error al cargar datos</div>
      )}
      {!loading && !error && chartData.length === 0 && (
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos evaluables en el período</div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 12, right: 90, bottom: 2, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(136,135,128,0.10)" />
            <XAxis dataKey="mesLabel" tick={{ fontSize: 10, fill: '#888780' }} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#888780' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={90} stroke="#888780" strokeDasharray="4 3" strokeWidth={1.2}
              label={{ value: 'Meta 90%', position: 'insideTopLeft', fontSize: 8, fill: '#888780' }}
            />
            {proveedores.map((prov) => {
              const prevVal = prevMes?.[prov] as number | null ?? null
              return (
                <Line
                  key={prov}
                  type="monotone"
                  dataKey={prov}
                  stroke={getProvColor(prov)}
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: getProvColor(prov), strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls
                  label={(props: any) => {
                    if (props.index !== lastIdx || props.value == null) return null
                    const varPP = prevVal != null ? props.value - prevVal : null
                    const suffix = varPP != null
                      ? (varPP >= 0 ? ` ↑${varPP}` : ` ↓${Math.abs(varPP)}`)
                      : ''
                    return (
                      <text x={props.x + 5} y={props.y + 4} textAnchor="start"
                        fontSize={8} fill={getProvColor(prov)} fontWeight={700}>
                        {`${prov} ${props.value}%${suffix}`}
                      </text>
                    )
                  }}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
