'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { DistribucionTipoResponse } from '@/types/distribution-type'

interface Props {
  desde: string
  hasta: string
  proveedorId: string
  refreshKey: number
}

export default function DistributionByTypeCard({ desde, hasta, proveedorId, refreshKey }: Props) {
  const router = useRouter()
  const [data, setData] = useState<DistribucionTipoResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/distribucion-tipo?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [refreshKey, proveedorId, desde, hasta])

  const goDetalle = () => {
    const params = new URLSearchParams({ desde, hasta })
    if (proveedorId) params.set('proveedorId', proveedorId)
    router.push(`/dashboard/distribucion-tipo?${params}`)
  }

  const tipos  = data?.tiposResumen ?? []
  const total  = data?.total ?? 0
  const maxPct = tipos[0]?.pct ?? 1

  return (
    <div onClick={goDetalle} style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px', height: '100%', boxSizing: 'border-box', cursor: 'pointer' }}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>D. Distribución por tipo</span>

      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Cargando...
        </div>
      )}

      {!loading && total === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Sin incidentes en el período
        </div>
      )}

      {!loading && total > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: tipos[0]?.color ?? '#0f172a', flexShrink: 0 }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{tipos[0]?.label ?? '—'}</span>
            <span style={{ marginLeft: 'auto', fontSize: '18px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', lineHeight: 1 }}>{tipos[0]?.pct ?? 0}%</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {tipos.map((t) => (
              <div key={t.tipo} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: '#0f172a', width: '84px', flexShrink: 0, fontWeight: t.tipo === tipos[0]?.tipo ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.label}
                </span>
                <div style={{ flex: 1, height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '5px', width: `${Math.round((t.pct / maxPct) * 100)}%`, background: t.color, borderRadius: '3px' }} />
                </div>
                <span style={{ fontSize: '10px', color: '#64748b', minWidth: '32px', textAlign: 'right', fontFamily: 'monospace' }}>{t.cantidad}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '11px', color: '#64748b', borderTop: '0.5px solid #f1f5f9', paddingTop: '5px' }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>{total}</span> incidentes totales
          </div>
        </>
      )}
    </div>
  )
}
