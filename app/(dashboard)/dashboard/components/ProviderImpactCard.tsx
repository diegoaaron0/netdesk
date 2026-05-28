'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { ImpactoProveedorResponse } from '@/types/provider-impact'

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

function slaColor(v: number | null): string {
  if (v == null) return '#888780'
  if (v < 70) return '#A32D2D'
  if (v < 90) return '#BA7517'
  return '#1D9E75'
}

function SLABar({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ fontSize: '10px', color: '#888780' }}>—</span>
  const color = slaColor(pct)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
      <div style={{ width: '36px', height: '4px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '4px', width: `${pct}%`, background: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '10px', fontWeight: 600, color }}>{pct}%</span>
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

  useEffect(() => { fetchData() }, [refreshKey, proveedorId, desde, hasta])

  const goDetalle = () => {
    const params = new URLSearchParams({ desde, hasta })
    if (proveedorId) params.set('proveedorId', proveedorId)
    router.push(`/dashboard/impacto-proveedor?${params}`)
  }

  const proveedores = data?.proveedores ?? []
  const resumen = data?.resumen

  return (
    <div onClick={goDetalle} style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px', cursor: 'pointer' }}>

      {/* Header: título + resumen inline + botón */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginRight: 'auto' }}>B. Impacto por proveedor</span>
        {!loading && resumen && (
          <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#64748b' }}>
            <span><strong style={{ color: '#0f172a' }}>{resumen.totalProveedores}</strong> provs.</span>
            <span>SLA: <strong style={{ color: slaColor(resumen.globalSlaPct) }}>{resumen.globalSlaPct != null ? `${resumen.globalSlaPct}%` : '—'}</strong></span>
            <span>MTTR: <strong style={{ color: '#0f172a' }}>{fmtMin(resumen.globalMttrMin)}</strong></span>
            <span>Costo: <strong style={{ color: '#0f172a' }}>{fmtCosto(resumen.totalCosto)}</strong></span>
          </div>
        )}
      </div>

      {loading && (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Cargando...
        </div>
      )}

      {!loading && proveedores.length === 0 && (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Sin datos en el período seleccionado
        </div>
      )}

      {!loading && proveedores.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                {[
                  { label: 'Proveedor', align: 'left' as const },
                  { label: 'Incs', align: 'center' as const },
                  { label: 'SLA%', align: 'left' as const },
                  { label: 'MTTR', align: 'right' as const },
                  { label: 'Reincid.', align: 'center' as const },
                  { label: 'Estado', align: 'center' as const },
                ].map((h) => (
                  <th key={h.label} style={{ padding: '4px 6px', textAlign: h.align, fontSize: '9px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proveedores.slice(0, 6).map((p, i) => {
                const estadoBg    = p.estado === 'critico' ? '#FCEBEB' : p.estado === 'en_riesgo' ? '#FAEEDA' : '#EAF3DE'
                const estadoColor = p.estado === 'critico' ? '#A32D2D' : p.estado === 'en_riesgo' ? '#BA7517' : '#1D9E75'
                const estadoLabel = p.estado === 'critico' ? '✗ Crítico' : p.estado === 'en_riesgo' ? '⚠ Riesgo' : '✓ Óptimo'
                return (
                <tr key={p.id} style={{ borderTop: i > 0 ? '0.5px solid #f3f4f6' : 'none' }}>
                  <td style={{ padding: '4px 6px', fontWeight: 500, color: '#0f172a', whiteSpace: 'nowrap', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 600, color: '#0f172a' }}>{p.incidentes}</td>
                  <td style={{ padding: '4px 6px' }}><SLABar pct={p.slaPct} /></td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 500, color: p.mttrMinutos != null && p.mttrMinutos > 240 ? '#A32D2D' : p.mttrMinutos != null && p.mttrMinutos > 120 ? '#BA7517' : '#0f172a' }}>
                    {fmtMin(p.mttrMinutos)}
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: p.reincidencia > 0 ? 600 : 400, color: p.reincidencia > 0 ? '#A32D2D' : '#64748b' }}>
                    {p.reincidencia > 0 ? p.reincidencia : '—'}
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                    <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '999px', background: estadoBg, color: estadoColor, whiteSpace: 'nowrap' }}>{estadoLabel}</span>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          {proveedores.length > 6 && (
            <div style={{ padding: '4px 6px', fontSize: '10px', color: '#64748b' }}>
              +{proveedores.length - 6} más (ver detalle)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
