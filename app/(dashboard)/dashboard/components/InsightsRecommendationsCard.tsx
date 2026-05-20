'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { InsightsResponse } from '@/types/insights'

interface Props {
  desde: string
  hasta: string
  proveedorId: string
  refreshKey: number
}

const DOT_COLOR: Record<string, string> = {
  alerta: '#EF4444',
  accion: '#F59E0B',
  logro:  '#6B7280',
}

const PRIO_STYLE: Record<string, { bg: string; color: string }> = {
  alta:  { bg: '#FEE2E2', color: '#B91C1C' },
  media: { bg: '#FEF3C7', color: '#B45309' },
  baja:  { bg: '#F1F5F9', color: '#374151' },
}

const PRIO_LABEL: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }

export default function InsightsRecommendationsCard({ desde, hasta, proveedorId, refreshKey }: Props) {
  const router = useRouter()
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/insights?${params}`)
      if (res.ok) setData(await res.json())
      else setError(true)
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [fetchData, refreshKey])

  const allInsights = data?.insights ?? []
  const resumen     = data?.resumenGlobal

  const detailParams = new URLSearchParams({ desde, hasta })
  if (proveedorId) detailParams.set('proveedorId', proveedorId)
  const detailUrl = `/dashboard/insights?${detailParams}`

  const falla = allInsights.find(i => i.categoria === 'falla_sistemica')
  const top3  = allInsights.filter(i => i.categoria !== 'falla_sistemica').slice(0, 3)

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Header */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>H. Insights y decisiones sugeridas</div>

      {/* KPI strip: 3 números */}
      {!loading && resumen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {[
            { label: 'Total insights',  value: resumen.totalInsights,      color: '#0f172a' },
            { label: 'Alertas altas',   value: resumen.alertasAltas,       color: '#B91C1C' },
            { label: 'Acciones pend.',  value: resumen.accionesPendientes, color: '#B45309' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#F8FAFC', border: '0.5px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ height: '120px', background: 'var(--muted)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Generando insights…</span>
        </div>
      ) : error ? (
        <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#A32D2D' }}>
          Error al cargar datos
        </div>
      ) : (
        <>
          {/* Alerta sistémica banner */}
          {falla && (
            <div style={{ background: '#FEF2F2', border: '0.5px solid #FECACA', borderRadius: '7px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', flexShrink: 0 }}>⚠</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#B91C1C', lineHeight: 1.3 }}>{falla.titulo}</span>
            </div>
          )}

          {/* Top 3 insights */}
          {top3.length === 0 && !falla ? (
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '16px 0' }}>
              Sin insights generados para el período
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {top3.map(ins => {
                const prio = PRIO_STYLE[ins.prioridad]
                const dot  = DOT_COLOR[ins.tipo] ?? '#6B7280'
                return (
                  <div key={ins.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', background: '#F8FAFC', border: '0.5px solid #e5e7eb' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#0f172a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ins.titulo}
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '999px', background: prio.bg, color: prio.color, flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {PRIO_LABEL[ins.prioridad]}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div style={{ textAlign: 'right', borderTop: '0.5px solid #f1f5f9', paddingTop: '8px' }}>
        <button
          onClick={() => router.push(detailUrl)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#185FA5', fontWeight: 500, padding: 0 }}
        >
          Ver detalle →
        </button>
      </div>
    </div>
  )
}
