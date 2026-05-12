'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { GeographicImpactResponse, ZonaResumen } from '@/types/geographic-impact'
import PeruMapPlaceholder from './PeruMapPlaceholder'

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

function Sk({ w = '60%', h = 14 }: { w?: string; h?: number }) {
  return (
    <div style={{ width: w, height: h, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', borderRadius: 4, animation: 'shimmer 1.4s infinite' }} />
  )
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

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

// ─── Bar row with tooltip ─────────────────────────────────────────────────────

function ZonaRow({ zona, maxInc, total }: { zona: ZonaResumen; maxInc: number; total: number }) {
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

  useEffect(() => { fetchData() }, [refreshKey])

  const zonas = data?.zonas ?? []
  const maxInc = Math.max(...zonas.map((z) => z.incidentes), 1)
  const total  = zonas.reduce((s, z) => s + z.incidentes, 0)

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>F. Impacto geográfico</div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Concentración de incidentes e impacto económico por zona</div>
        </div>
        <button
          onClick={() => router.push(`/dashboard/impacto-geografico?desde=${desde}&hasta=${hasta}${proveedorId ? `&proveedorId=${proveedorId}` : ''}`)}
          style={{ padding: '5px 12px', fontSize: '11px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
        >
          Ver detalle →
        </button>
      </div>

      {/* Content: map + table side by side */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {/* Map placeholder */}
        {!loading && (
          <PeruMapPlaceholder zonas={zonas} />
        )}
        {loading && (
          <div style={{ width: '120px', height: '148px', background: 'var(--muted)', borderRadius: '8px', flexShrink: 0 }} />
        )}

        {/* Table */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '110px 50px 1fr 90px', gap: '8px', padding: '0 0 6px', borderBottom: '0.5px solid var(--border)' }}>
            {['Zona / ubicación', 'Incidentes', '% del total', 'Impacto estimado'].map((h) => (
              <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
            ))}
          </div>

          {error ? (
            <div style={{ fontSize: '12px', color: '#A32D2D', padding: '16px 0', textAlign: 'center' }}>Error al cargar datos</div>
          ) : loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 50px 1fr 90px', gap: '8px', padding: '10px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
                <Sk w="80px" /><Sk w="30px" /><Sk w="90%" /><Sk w="60px" />
              </div>
            ))
          ) : zonas.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '24px 0', textAlign: 'center' }}>Sin datos en el período</div>
          ) : (
            zonas.slice(0, 5).map((z) => (
              <ZonaRow key={z.zona} zona={z} maxInc={maxInc} total={total} />
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
      </div>
    </div>
  )
}
