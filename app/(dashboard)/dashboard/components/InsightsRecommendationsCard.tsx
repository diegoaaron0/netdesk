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
  logro:  '#3B6D11',
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
  const top   = allInsights.filter(i => i.categoria !== 'falla_sistemica').slice(0, 5)

  return (
    <div onClick={() => router.push(detailUrl)} style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px', cursor: 'pointer' }}>

      {/* Header: título + stats inline + botón */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginRight: 'auto' }}>H. Insights y decisiones sugeridas</span>
        {!loading && resumen && (
          <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#64748b' }}>
            <span>Total: <strong style={{ color: '#0f172a' }}>{resumen.totalInsights}</strong></span>
            {resumen.alertasAltas > 0 && (
              <span>Alertas altas: <strong style={{ color: '#B91C1C' }}>{resumen.alertasAltas}</strong></span>
            )}
            {resumen.accionesPendientes > 0 && (
              <span>Acciones: <strong style={{ color: '#B45309' }}>{resumen.accionesPendientes}</strong></span>
            )}
            {resumen.logros > 0 && (
              <span>Logros: <strong style={{ color: '#3B6D11' }}>{resumen.logros}</strong></span>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Generando insights...
        </div>
      )}
      {error && (
        <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#A32D2D' }}>
          Error al cargar datos
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>

          {/* Alerta sistémica — banner rojo compacto */}
          {falla && (
            <div style={{ background: '#FEF2F2', border: '0.5px solid #FECACA', borderRadius: '6px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', flexShrink: 0 }}>⚠</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#B91C1C', lineHeight: 1.3 }}>{falla.titulo}</span>
            </div>
          )}

          {/* Insights */}
          {top.length === 0 && !falla ? (
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '12px 0' }}>
              Sin insights generados para el período
            </div>
          ) : (
            top.map(ins => {
              const prio = PRIO_STYLE[ins.prioridad]
              const dot  = DOT_COLOR[ins.tipo] ?? '#6B7280'
              const entidad = ins.entidad && ins.entidadTipo !== 'global' ? ins.entidad : null
              return (
                <div key={ins.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 8px', borderRadius: '6px', background: '#F8FAFC', border: '0.5px solid #f1f5f9' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                  {entidad && (
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#185FA5', background: '#EEF4FF', padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {entidad}
                    </span>
                  )}
                  <span style={{ fontSize: '10px', fontWeight: 500, color: '#0f172a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ins.titulo}
                  </span>
                  <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '999px', background: prio.bg, color: prio.color, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {PRIO_LABEL[ins.prioridad]}
                  </span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
