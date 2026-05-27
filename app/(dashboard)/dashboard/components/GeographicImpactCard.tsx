'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip,
  Cell, LabelList, ResponsiveContainer,
} from 'recharts'
import type { GeographicImpactResponse, ZonaResumen } from '@/types/geographic-impact'

interface Props {
  desde: string
  hasta: string
  proveedorId: string
  refreshKey: number
}

function fmtMin(min: number | null | undefined) {
  if (min == null) return '—'
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function fmtCosto(n: number) {
  return `S/ ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
}
function fmtK(n: number) {
  return n >= 1000 ? `S/${(n / 1000).toFixed(1)}k` : n > 0 ? `S/${n}` : '—'
}
function slaColor(pct: number | null) {
  if (pct == null) return '#94A3B8'
  if (pct >= 90) return '#3B6D11'
  if (pct >= 70) return '#BA7517'
  return '#A32D2D'
}
function barColor(slaPct: number | null): string {
  if (slaPct === 0 || slaPct == null) return '#A32D2D'
  if (slaPct < 90) return '#BA7517'
  return '#1D9E75'
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ZonaResumen }> }) {
  if (!active || !payload?.length) return null
  const z = payload[0].payload
  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px', padding: '8px 10px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', fontSize: '10px', minWidth: '170px' }}>
      <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '11px', color: '#0f172a' }}>{z.zona}</div>
      {([
        ['Incidentes',       z.incidentes],
        ['Tiendas afect.',   z.tiendasAfectadas],
        ['MTTR promedio',    fmtMin(z.mttrPromMin)],
        ['SLA',              z.slaPct != null ? `${z.slaPct}%` : '—'],
        ['Impacto estimado', z.impactoEstimado > 0 ? fmtCosto(z.impactoEstimado) : '—'],
        ['Prov. dominante',  z.proveedorDominante ?? '—'],
      ] as [string, string | number][]).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '2px', color: '#64748b' }}>
          <span>{k}</span>
          <span style={{ fontWeight: 600, color: '#0f172a' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

export default function GeographicImpactCard({ desde, hasta, proveedorId, refreshKey }: Props) {
  const router = useRouter()
  const [data, setData] = useState<GeographicImpactResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/impacto-geografico?${params}`)
      if (res.ok) setData(await res.json())
      else setError(true)
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [refreshKey, proveedorId, desde, hasta])

  const zonas = data?.zonas ?? []
  const g = data?.resumenGlobal

  const goDetalle = () =>
    router.push(`/dashboard/impacto-geografico?desde=${desde}&hasta=${hasta}${proveedorId ? `&proveedorId=${proveedorId}` : ''}`)

  return (
    <div onClick={goDetalle} style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px', cursor: 'pointer' }}>

      {/* Header: título + resumen inline + botón */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginRight: 'auto' }}>F. Impacto geográfico</span>
        {!loading && g && (
          <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#64748b' }}>
            {g.zonaMasAfectada && <span>Más afectada: <strong style={{ color: '#0f172a' }}>{g.zonaMasAfectada}</strong></span>}
            {g.impactoTotal > 0 && <span>Costo: <strong style={{ color: '#0f172a' }}>{fmtK(g.impactoTotal)}</strong></span>}
            {g.peorSLAZona && <span>Peor SLA: <strong style={{ color: '#A32D2D' }}>{g.peorSLAZona} {g.peorSLAPct != null ? `(${g.peorSLAPct}%)` : ''}</strong></span>}
          </div>
        )}
      </div>

      {error && (
        <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#A32D2D' }}>Error al cargar datos</div>
      )}

      {loading && (
        <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Cargando...
        </div>
      )}

      {!loading && !error && zonas.length === 0 && (
        <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Sin datos en el período
        </div>
      )}

      {!loading && !error && zonas.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={Math.max(zonas.length * 18, 70)}>
            <BarChart
              layout="vertical"
              data={zonas}
              margin={{ top: 2, right: 48, bottom: 2, left: 4 }}
            >
              <XAxis
                type="number"
                tick={{ fontSize: 8, fill: '#94A3B8' }}
                tickFormatter={(v: number) => v > 0 ? fmtK(v) : '0'}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="zona"
                width={72}
                tick={{ fontSize: 10, fill: '#374151' }}
                axisLine={false}
                tickLine={false}
              />
              <RechartTooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="impactoEstimado" radius={[0, 3, 3, 0]} maxBarSize={18}>
                {zonas.map((z, i) => <Cell key={i} fill={barColor(z.slaPct)} />)}
                <LabelList
                  dataKey="incidentes"
                  position="right"
                  style={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }}
                  formatter={(v: number) => `${v} inc.`}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* leyenda SLA */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            {([['#1D9E75', 'SLA ≥ 90%'], ['#BA7517', '70–89%'], ['#A32D2D', '< 70%']] as const).map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <div style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
                <span style={{ fontSize: '9px', color: '#64748b' }}>{label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
