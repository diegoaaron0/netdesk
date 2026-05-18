'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { ImpactoProveedorResponse, ProveedorMetricas } from '@/types/provider-impact'

interface Props {
  desde: string
  hasta: string
  proveedorId: string
  refreshKey: number
}

function fmtMin(min: number | null | undefined) {
  if (!min) return '—'
  const h = Math.floor(min / 60); const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function fmtCosto(n: number) {
  return `S/ ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
}
function fmtTipo(t: string) {
  const map: Record<string, string> = {
    CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
    LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
  }
  return map[t] ?? t
}

function estadoBadge(estado: ProveedorMetricas['estado']) {
  if (estado === 'optimo')    return { label: '✓ Óptimo',    color: '#3B6D11', bg: '#EAF3DE' }
  if (estado === 'en_riesgo') return { label: '⚠ En riesgo', color: '#854F0B', bg: '#FAEEDA' }
  if (estado === 'critico')   return { label: '✗ Crítico',   color: '#A32D2D', bg: '#FCEBEB' }
  return                               { label: '— Sin datos', color: '#888780', bg: '#F3F4F6' }
}

function SLABar({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ fontSize: '11px', color: '#888780' }}>—</span>
  const color = pct >= 90 ? '#3B6D11' : pct >= 70 ? '#EAB308' : '#A32D2D'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <div style={{ width: '48px', height: '5px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '5px', width: `${pct}%`, background: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 500, color }}>{pct}%</span>
    </div>
  )
}

export default function ProviderImpactCard({ desde, hasta, proveedorId, refreshKey }: Props) {
  const router = useRouter()
  const [data, setData] = useState<ImpactoProveedorResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/impacto-proveedor?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [refreshKey, proveedorId])

  const goDetalle = () => {
    const params = new URLSearchParams({ desde, hasta })
    if (proveedorId) params.set('proveedorId', proveedorId)
    router.push(`/dashboard/impacto-proveedor?${params}`)
  }

  const proveedores = data?.proveedores ?? []
  const resumen = data?.resumen
  const globalMttr = resumen?.globalMttrMin ?? null

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>B. Impacto por proveedor</div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
            Comparativa de proveedores por incidentes, MTTR, SLA y costo estimado
          </div>
        </div>
        <button onClick={goDetalle}
          style={{ padding: '5px 12px', fontSize: '11px', background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
          Ver detalle →
        </button>
      </div>

      {/* Resumen mini */}
      {!loading && resumen && (
        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--muted-foreground)', flexWrap: 'wrap' }}>
          <span><strong style={{ color: '#0f172a' }}>{resumen.totalProveedores}</strong> proveedores</span>
          <span>SLA global: <strong style={{ color: resumen.globalSlaPct != null ? (resumen.globalSlaPct >= 90 ? '#3B6D11' : resumen.globalSlaPct >= 70 ? '#854F0B' : '#A32D2D') : '#888780' }}>{resumen.globalSlaPct != null ? `${resumen.globalSlaPct}%` : '—'}</strong></span>
          <span>Costo total: <strong style={{ color: '#0f172a' }}>{fmtCosto(resumen.totalCosto)}</strong></span>
          <span>MTTR global: <strong style={{ color: '#0f172a' }}>{fmtMin(resumen.globalMttrMin)}</strong></span>
        </div>
      )}

      {loading && (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Cargando...
        </div>
      )}

      {!loading && proveedores.length === 0 && (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Sin datos en el período seleccionado
        </div>
      )}

      {!loading && proveedores.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                {['Proveedor', 'Incidentes', 'MTTR', 'SLA%', 'Costo est.', 'Estado'].map((h) => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proveedores.slice(0, 6).map((p, i) => {
                const badge = estadoBadge(p.estado)
                const mttrDelta = globalMttr != null && p.mttrMinutos != null ? p.mttrMinutos - globalMttr : null
                return (
                  <tr key={p.id} style={{ borderTop: i > 0 ? '0.5px solid #f3f4f6' : 'none' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 500, color: '#0f172a' }}>{p.nombre}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 600 }}>{p.incidentes}</td>
                    <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>
                      <span style={{ color: p.mttrMinutos != null && p.mttrMinutos > 240 ? '#A32D2D' : p.mttrMinutos != null && p.mttrMinutos > 120 ? '#854F0B' : '#0f172a' }}>
                        {fmtMin(p.mttrMinutos)}
                      </span>
                      {mttrDelta != null && (
                        <span style={{ fontSize: '10px', color: mttrDelta > 0 ? '#A32D2D' : '#3B6D11', marginLeft: '4px' }}>
                          {mttrDelta > 0 ? `+${fmtMin(mttrDelta)}` : `-${fmtMin(Math.abs(mttrDelta))}`}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '7px 8px' }}>
                      <SLABar pct={p.slaPct} />
                    </td>
                    <td style={{ padding: '7px 8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{p.costoTotal > 0 ? fmtCosto(p.costoTotal) : '—'}</td>
                    <td style={{ padding: '7px 8px' }}>
                      <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: badge.bg, color: badge.color, whiteSpace: 'nowrap', fontWeight: 500 }}>{badge.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {proveedores.length > 6 && (
            <div style={{ padding: '6px 8px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
              +{proveedores.length - 6} proveedores más — <button onClick={goDetalle} style={{ background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', fontSize: '11px', fontWeight: 500, padding: 0 }}>ver todos</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
