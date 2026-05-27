'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { SLAProveedorResponse } from '@/types/provider-sla-compliance'

interface Props {
  desde: string
  hasta: string
  proveedorId: string
  refreshKey: number
}

function slaColor(pct: number | null) {
  if (pct == null) return '#A32D2D'
  if (pct >= 90) return '#3B6D11'
  if (pct >= 70) return '#BA7517'
  return '#A32D2D'
}
function slaBg(pct: number | null) {
  if (pct == null) return '#FCEBEB'
  if (pct >= 90) return '#EAF3DE'
  if (pct >= 70) return '#FAEEDA'
  return '#FCEBEB'
}
function estadoLabel(pct: number | null) {
  if (pct == null) return 'Sin datos'
  if (pct >= 90) return 'Estable'
  if (pct >= 70) return 'En revisión'
  return 'Crítico'
}
function fmtMin(min: number | null | undefined) {
  if (min == null) return '—'
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function shortMotivo(m: string | null): string {
  if (!m) return '—'
  if (m.includes('sin respuesta')) return 'Sin resp. N1'
  if (m.includes('Respuesta')) return 'Resp. lenta'
  if (m.includes('Resolución')) return 'Resol. lenta'
  return m.slice(0, 18)
}

export default function ProviderSlaComplianceCard({ desde, hasta, proveedorId, refreshKey }: Props) {
  const router = useRouter()
  const [data, setData] = useState<SLAProveedorResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/sla-proveedor?${params}`)
      if (res.ok) setData(await res.json())
      else setError(true)
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [refreshKey, proveedorId, desde, hasta])

  const g = data?.resumenGlobal
  const proveedores = data?.proveedores ?? []

  const goDetalle = () =>
    router.push(`/dashboard/sla-proveedor?desde=${desde}&hasta=${hasta}${proveedorId ? `&proveedorId=${proveedorId}` : ''}`)

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Header: título + resumen inline + botón */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginRight: 'auto' }}>E. Cumplimiento SLA por proveedor</span>
        {!loading && g != null && (
          <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#64748b' }}>
            <span><strong style={{ color: '#0f172a' }}>{g.proveedoresEvaluados}</strong> evaluados</span>
            <span>SLA: <strong style={{ color: slaColor(g.slaGeneral) }}>{g.slaGeneral != null ? `${g.slaGeneral}%` : '—'}</strong></span>
            <span>Fuera SLA: <strong style={{ color: g.fueraSLATotal > 0 ? '#A32D2D' : '#0f172a' }}>{g.fueraSLATotal}</strong></span>
            <span>N2 esc.: <strong style={{ color: g.casosEscaladosN2 > 0 ? '#BA7517' : '#0f172a' }}>{g.casosEscaladosN2}</strong></span>
          </div>
        )}
        <button onClick={goDetalle} style={{ background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '7px', padding: '4px 10px', fontSize: '11px', fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>
          Ver detalle →
        </button>
      </div>

      {error && (
        <div style={{ fontSize: '12px', color: '#A32D2D', padding: '12px 0', textAlign: 'center' }}>Error al cargar datos</div>
      )}

      {loading && (
        <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Cargando...
        </div>
      )}

      {!loading && !error && proveedores.length === 0 && (
        <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Sin datos en el período
        </div>
      )}

      {!loading && !error && proveedores.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                {[
                  { label: 'Proveedor',  align: 'left' as const },
                  { label: 'SLA%',       align: 'center' as const },
                  { label: 'Eval.',      align: 'center' as const },
                  { label: 'Fuera SLA', align: 'center' as const },
                  { label: 'T. Resp',   align: 'right' as const },
                  { label: 'N2 esc.',   align: 'center' as const },
                  { label: 'Estado',    align: 'center' as const },
                  { label: 'Motivo',    align: 'left' as const },
                ].map((h) => (
                  <th key={h.label} style={{ padding: '4px 8px', textAlign: h.align, fontSize: '9px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proveedores.slice(0, 8).map((p, i) => {
                const col = slaColor(p.slaPct)
                const bg  = slaBg(p.slaPct)
                const respLenta = p.tPromRespuestaMin != null && p.tPromRespuestaMin > 60
                return (
                  <tr key={p.proveedorId} style={{ borderTop: i > 0 ? '0.5px solid #f3f4f6' : 'none' }}>
                    <td style={{ padding: '4px 8px', fontWeight: 500, color: '#0f172a', whiteSpace: 'nowrap', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</td>

                    {/* SLA% — bar + number */}
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}>
                        <div style={{ width: '32px', height: '4px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '4px', width: `${p.slaPct ?? 0}%`, background: col, borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: col, minWidth: '28px' }}>
                          {p.slaPct != null ? `${p.slaPct}%` : '—'}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '4px 8px', textAlign: 'center', color: '#64748b' }}>{p.evaluables}</td>

                    <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: p.fueraSLA > 0 ? 600 : 400, color: p.fueraSLA > 0 ? '#A32D2D' : '#64748b' }}>
                      {p.fueraSLA > 0 ? p.fueraSLA : '—'}
                    </td>

                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 500, color: respLenta ? '#BA7517' : '#0f172a', whiteSpace: 'nowrap' }}>
                      {fmtMin(p.tPromRespuestaMin)}
                      {respLenta && <span style={{ fontSize: '8px', marginLeft: '2px', color: '#BA7517' }}>↑</span>}
                    </td>

                    <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: p.casosEscaladosN2 > 0 ? 600 : 400, color: p.casosEscaladosN2 > 0 ? '#BA7517' : '#64748b' }}>
                      {p.casosEscaladosN2 > 0 ? p.casosEscaladosN2 : '—'}
                    </td>

                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '5px', background: bg, color: col, whiteSpace: 'nowrap' }}>
                        {estadoLabel(p.slaPct)}
                      </span>
                    </td>

                    <td style={{ padding: '4px 8px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {shortMotivo(p.motivoPrincipal)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {proveedores.length > 8 && (
            <div style={{ padding: '4px 8px', fontSize: '10px', color: '#64748b' }}>
              +{proveedores.length - 8} más —{' '}
              <button onClick={goDetalle} style={{ background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', fontSize: '10px', fontWeight: 500, padding: 0 }}>ver todos</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
