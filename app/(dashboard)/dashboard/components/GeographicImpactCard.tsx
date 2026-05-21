'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip,
  Cell, ResponsiveContainer,
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
function slaColor(pct: number | null) {
  if (pct == null) return '#94A3B8'
  if (pct >= 90) return '#3B6D11'
  if (pct >= 70) return '#854F0B'
  return '#A32D2D'
}
function barColor(slaPct: number | null): string {
  if (slaPct === 0) return '#A32D2D'
  if (slaPct != null && slaPct < 90) return '#BA7517'
  return '#1D9E75'
}

function Sk({ w = '60%', h = 14 }: { w?: string; h?: number }) {
  return (
    <div style={{ width: w, height: h, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', borderRadius: 4, animation: 'shimmer 1.4s infinite' }} />
  )
}

// ─── Recharts custom tooltip ──────────────────────────────────────────────────

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ZonaResumen }> }) {
  if (!active || !payload?.length) return null
  const z = payload[0].payload
  return (
    <div style={{
      background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px',
      padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      fontSize: '11px', minWidth: '190px',
    }}>
      <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '12px' }}>{z.zona}</div>
      {([
        ['Incidentes',       z.incidentes],
        ['MTTR promedio',    fmtMin(z.mttrPromMin)],
        ['SLA',              z.slaPct != null ? `${z.slaPct}%` : '—'],
        ['Impacto estimado', z.impactoEstimado > 0 ? fmtCosto(z.impactoEstimado) : '—'],
      ] as [string, string | number][]).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '2px' }}>
          <span style={{ color: '#64748B' }}>{k}</span>
          <span style={{ fontWeight: 500 }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Tabla row with hover tooltip ────────────────────────────────────────────

function ZonaTooltip({ zona, visible }: { zona: ZonaResumen; visible: boolean }) {
  if (!visible) return null
  return (
    <div style={{
      position: 'absolute', zIndex: 50, top: '100%', left: '50%', transform: 'translateX(-50%)',
      marginTop: '4px', background: 'white', border: '0.5px solid var(--border)',
      borderRadius: '8px', padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      minWidth: '200px', pointerEvents: 'none',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '6px' }}>{zona.zona}</div>
      {[
        ['Incidentes', zona.incidentes],
        ['% del total', `${zona.pctDelTotal}%`],
        ['Tiendas afectadas', zona.tiendasAfectadas],
        ['MTTR promedio', fmtMin(zona.mttrPromMin)],
        ['SLA', zona.slaPct != null ? `${zona.slaPct}%` : '—'],
        ['Impacto estimado', fmtCosto(zona.impactoEstimado)],
        ['Proveedor dominante', zona.proveedorDominante ?? '—'],
      ].map(([k, v]) => (
        <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '11px', marginBottom: '2px' }}>
          <span style={{ color: 'var(--muted-foreground)' }}>{k}</span>
          <span style={{ fontWeight: 500 }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function ZonaRow({ zona, maxInc }: { zona: ZonaResumen; maxInc: number }) {
  const [hover, setHover] = useState(false)
  const pct = Math.round((zona.incidentes / maxInc) * 100)
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: '110px 50px 1fr 90px', gap: '8px', alignItems: 'center', padding: '7px 0', borderBottom: '0.5px solid var(--border)', position: 'relative', cursor: 'default' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={{ fontSize: '12px', fontWeight: 500 }}>{zona.zona}</span>
      <span style={{ fontSize: '12px', textAlign: 'right' }}>{zona.incidentes}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ flex: 1, height: '6px', background: 'var(--muted)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '6px', width: `${pct}%`, background: '#3B82F6', borderRadius: '3px', transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', width: '32px', textAlign: 'right' }}>{zona.pctDelTotal}%</span>
      </div>
      <span style={{ fontSize: '12px', fontWeight: 500, textAlign: 'right', fontFamily: 'monospace' }}>
        {zona.impactoEstimado > 0 ? fmtCosto(zona.impactoEstimado) : '—'}
      </span>
      <ZonaTooltip zona={zona} visible={hover} />
    </div>
  )
}

// ─── Main Card ────────────────────────────────────────────────────────────────

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

  useEffect(() => { fetchData() }, [refreshKey, proveedorId])

  const zonas = data?.zonas ?? []
  const maxInc = Math.max(...zonas.map((z) => z.incidentes), 1)

  const chartData = zonas.map((z) => ({
    ...z,
    impacto: z.impactoEstimado,
  }))

  const chartHeight = Math.max(zonas.length * 32, 120)

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>F. Impacto geográfico</div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Concentración de incidentes e impacto económico por zona</div>
        </div>
        <button onClick={() => router.push(`/dashboard/impacto-geografico?desde=${desde}&hasta=${hasta}${proveedorId ? `&proveedorId=${proveedorId}` : ''}`)} style={{ background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Ver detalle →</button>
      </div>

      {/* BarChart */}
      {error ? (
        <div style={{ fontSize: '12px', color: '#A32D2D', padding: '16px 0', textAlign: 'center' }}>Error al cargar datos</div>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' }}>
          {Array.from({ length: 4 }).map((_, i) => <Sk key={i} w="100%" h={22} />)}
        </div>
      ) : zonas.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '24px 0', textAlign: 'center' }}>Sin datos en el período</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* BarChart zonas */}
          <ResponsiveContainer width="100%" height={120}>
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 2, right: 8, bottom: 2, left: 4 }}
            >
              <XAxis
                type="number"
                tick={{ fontSize: 9, fill: '#94A3B8' }}
                tickFormatter={(v: number) => v > 0 ? `S/${(v / 1000).toFixed(0)}k` : '0'}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="zona"
                width={80}
                tick={{ fontSize: 11, fill: '#374151' }}
                axisLine={false}
                tickLine={false}
              />
              <RechartTooltip
                content={<ChartTooltip />}
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              />
              <Bar dataKey="impacto" radius={[0, 3, 3, 0]} maxBarSize={20}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={barColor(entry.slaPct)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Color legend */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            {[['#1D9E75', 'SLA ≥ 90%'], ['#BA7517', 'SLA < 90%'], ['#A32D2D', 'SLA 0%']].map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span style={{ fontSize: '9px', color: '#64748B' }}>{label}</span>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* Table */}
      {!error && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 50px 1fr 90px', gap: '8px', padding: '0 0 6px', borderBottom: '0.5px solid var(--border)' }}>
            {['Zona / ubicación', 'Incidentes', '% del total', 'Impacto estimado'].map((h) => (
              <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
            ))}
          </div>

          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 50px 1fr 90px', gap: '8px', padding: '10px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
                <Sk w="80px" /><Sk w="30px" /><Sk w="90%" /><Sk w="60px" />
              </div>
            ))
          ) : zonas.length === 0 ? null : (
            zonas.slice(0, 5).map((z) => (
              <ZonaRow key={z.zona} zona={z} maxInc={maxInc} />
            ))
          )}

          {!loading && zonas.length > 5 && (
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', paddingTop: '8px', textAlign: 'center' }}>
              +{zonas.length - 5} zonas más —{' '}
              <span
                onClick={() => router.push(`/dashboard/impacto-geografico?desde=${desde}&hasta=${hasta}${proveedorId ? `&proveedorId=${proveedorId}` : ''}`)}
                style={{ color: '#185FA5', cursor: 'pointer', textDecoration: 'underline' }}
              >
                ver todas
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
