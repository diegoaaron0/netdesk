'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { InsightsResponse, Insight, KpiOrigen } from '@/types/insights'

interface Props {
  desde: string
  hasta: string
  proveedorId: string
  refreshKey: number
}

const KPI_COLORS: Record<KpiOrigen, { bg: string; color: string }> = {
  A: { bg: '#F1F5F9', color: '#475569' },
  B: { bg: '#DBEAFE', color: '#1D4ED8' },
  C: { bg: '#CCFBF1', color: '#0F766E' },
  D: { bg: '#FEF3C7', color: '#B45309' },
  E: { bg: '#EFF6FF', color: '#3B82F6' },
  F: { bg: '#DCFCE7', color: '#16A34A' },
  G: { bg: '#F3E8FF', color: '#9333EA' },
}

const TIPO_CONFIG = {
  alerta: { label: 'Alerta', bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA' },
  accion: { label: 'Acción', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' },
  logro:  { label: 'Logro',  bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' },
}

const PRIO_CONFIG = {
  alta:  { dot: '#EF4444' },
  media: { dot: '#F59E0B' },
  baja:  { dot: '#6B7280' },
}

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

  const insights = (data?.insights ?? []).slice(0, 5)
  const resumen  = data?.resumenGlobal

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>H. Insights y decisiones sugeridas</div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Recomendaciones ejecutivas basadas en todos los datos del período</div>
        </div>
        <button
          onClick={() => {
            const params = new URLSearchParams({ desde, hasta })
            if (proveedorId) params.set('proveedorId', proveedorId)
            router.push(`/dashboard/insights?${params}`)
          }}
          style={{ padding: '5px 12px', fontSize: '11px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
        >
          Ver detalle →
        </button>
      </div>

      {/* KPI strip */}
      {!loading && resumen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {[
            { label: 'Total insights', value: resumen.totalInsights, color: '#0f172a' },
            { label: 'Alertas altas', value: resumen.alertasAltas, color: '#B91C1C' },
            { label: 'Acciones pend.', value: resumen.accionesPendientes, color: '#B45309' },
            { label: 'Logros', value: resumen.logros, color: '#15803D' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#F8FAFC', border: '0.5px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Insights list */}
      {loading ? (
        <div style={{ height: '200px', background: 'var(--muted)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Generando insights…</span>
        </div>
      ) : error ? (
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#A32D2D' }}>Error al cargar datos</div>
      ) : insights.length === 0 ? (
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin insights generados para el período</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {insights.map((ins) => <InsightRow key={ins.id} insight={ins} />)}
        </div>
      )}
    </div>
  )
}

function InsightRow({ insight }: { insight: Insight }) {
  const tipo = TIPO_CONFIG[insight.tipo]
  const prio = PRIO_CONFIG[insight.prioridad]
  return (
    <div style={{ border: `0.5px solid ${tipo.border}`, borderRadius: '8px', padding: '10px 12px', background: tipo.bg, display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: prio.dot, flexShrink: 0 }} />
        <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '999px', background: 'white', color: tipo.color, border: `0.5px solid ${tipo.border}` }}>
          {tipo.label}
        </span>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#0f172a', flex: 1, minWidth: 0 }}>{insight.titulo}</span>
        <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
          {insight.kpisOrigen.map(k => {
            const c = KPI_COLORS[k]
            return (
              <span key={k} style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '999px', background: c.bg, color: c.color }}>
                {k}
              </span>
            )
          })}
        </div>
      </div>
      <div style={{ fontSize: '11px', color: '#374151', lineHeight: 1.4 }}>{insight.descripcion}</div>
      <div style={{ fontSize: '10px', color: tipo.color, fontWeight: 500 }}>
        Acción: {insight.accionSugerida}
      </div>
    </div>
  )
}
