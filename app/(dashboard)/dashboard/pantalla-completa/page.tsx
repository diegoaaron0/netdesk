'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { DashboardAnaliticoResponse } from '@/types/dashboard'
import TendenciaSLACard from '../components/TendenciaSLACard'
import ProviderImpactCard from '../components/ProviderImpactCard'
import CriticalStoresCard from '../components/CriticalStoresCard'
import DistributionByTypeCard from '../components/DistributionByTypeCard'
import ProviderSlaComplianceCard from '../components/ProviderSlaComplianceCard'
import GeographicImpactCard from '../components/GeographicImpactCard'
import SlaTrendSixMonthsCard from '../components/SlaTrendSixMonthsCard'
import InsightsRecommendationsCard from '../components/InsightsRecommendationsCard'

export const dynamic = 'force-dynamic'

function firstDayOfMonth() {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}
function todayStr() { return new Date().toISOString().split('T')[0] }

function fmtMttr(min: number | null | undefined) {
  if (!min) return '—'
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function fmtCosto(n: number) {
  return `S/ ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
}
function mttrColor(min: number | null) {
  if (!min) return '#e2e8f0'
  if (min < 120) return '#4ade80'
  if (min < 240) return '#fbbf24'
  return '#f87171'
}
function slaColor(pct: number) {
  if (pct >= 90) return '#4ade80'
  if (pct >= 70) return '#fbbf24'
  return '#f87171'
}

function KpiCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#1e293b',
      border: '0.5px solid #334155',
      borderRadius: '10px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      minWidth: 0,
    }}>
      <div style={{ fontSize: '10px', fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      {children}
    </div>
  )
}

export default function PantallaCompletaPage() {
  const router = useRouter()
  const [refreshKey, setRefreshKey] = useState(0)
  const [now, setNow] = useState<Date | null>(null)
  const [data, setData] = useState<DashboardAnaliticoResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [rotatingIdx, setRotatingIdx] = useState(0)

  const desde = useMemo(() => firstDayOfMonth(), [])
  const hasta = useMemo(() => todayStr(), [])

  // Hydration-safe clock
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const id = setInterval(() => setRefreshKey((k) => k + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde, hasta })
      const res = await fetch(`/api/dashboard/analitico?${params}`)
      if (res.ok) setData(await res.json())
    } catch {}
    finally { setLoading(false) }
  }, [desde, hasta])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [refreshKey])

  // Rotating reincidencia store
  useEffect(() => {
    const tiendas = data?.cards.reincidenciaCritica.tiendas ?? []
    if (tiendas.length < 2) return
    const id = setInterval(() => setRotatingIdx((i) => (i + 1) % tiendas.length), 4000)
    return () => clearInterval(id)
  }, [data?.cards.reincidenciaCritica.tiendas])

  const fmtDatetime = (d: Date) =>
    d.toLocaleString('es-PE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'America/Lima',
    })

  const cards = data?.cards

  const CELL: React.CSSProperties = {
    background: '#1e293b',
    borderRadius: '10px',
    border: '0.5px solid #334155',
    overflow: 'auto',
    minHeight: 0,
    minWidth: 0,
  }

  return (
    <div style={{
      height: '100vh',
      background: '#0f172a',
      padding: '10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 16px',
        background: '#1e293b',
        borderRadius: '10px',
        border: '0.5px solid #334155',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '17px', fontWeight: 700, color: 'white', letterSpacing: '-0.3px' }}>NetDesk — Vista Ejecutiva</span>
          <span style={{
            fontSize: '10px', color: '#94a3b8', padding: '2px 8px',
            background: '#0f172a', borderRadius: '999px', fontWeight: 500,
          }}>
            ↻ cada 60s
          </span>
        </div>
        <span style={{ fontSize: '12px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
          {now ? fmtDatetime(now) : ''}
        </span>
        <button
          onClick={() => router.push('/dashboard?tab=analitico')}
          style={{
            padding: '5px 14px', fontSize: '12px', background: 'transparent',
            color: '#94a3b8', border: '0.5px solid #334155', borderRadius: '8px',
            cursor: 'pointer', fontWeight: 500,
          }}
        >
          ← Salir
        </button>
      </div>

      {/* Top row: 6 compact KPI cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: '8px',
        flexShrink: 0,
      }}>
        {/* 1. Incidentes */}
        <KpiCard label="1. Incidentes">
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'white', lineHeight: 1 }}>
            {loading ? '—' : (cards?.incidentes.total ?? 0)}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b' }}>
            {!loading && `${cards?.tiendasAfectadas.total ?? 0} tiendas afectadas`}
          </div>
          {!loading && cards?.incidentes.deltaVsAnterior != null && (
            <span style={{
              fontSize: '10px', fontWeight: 500,
              color: (cards.incidentes.deltaVsAnterior ?? 0) > 0 ? '#f87171' : '#4ade80',
            }}>
              {(cards.incidentes.deltaVsAnterior ?? 0) > 0 ? '↑' : '↓'} {Math.abs(cards.incidentes.deltaVsAnterior ?? 0)}% vs. ant.
            </span>
          )}
        </KpiCard>

        {/* 2. MTTR */}
        <KpiCard label="3. MTTR promedio">
          <div style={{ fontSize: '24px', fontWeight: 700, color: mttrColor(cards?.mttrPromedio.minutos ?? null), lineHeight: 1 }}>
            {loading ? '—' : fmtMttr(cards?.mttrPromedio.minutos)}
          </div>
          {!loading && cards?.mttrPromedio.deltaMinutos != null && (
            <span style={{
              fontSize: '10px',
              color: (cards.mttrPromedio.deltaMinutos ?? 0) > 0 ? '#f87171' : '#4ade80',
            }}>
              {(cards.mttrPromedio.deltaMinutos ?? 0) > 0 ? '↑' : '↓'} {Math.abs(cards.mttrPromedio.deltaMinutos)}m vs ant.
            </span>
          )}
        </KpiCard>

        {/* 3. SLA */}
        <KpiCard label="4. Cumplimiento SLA">
          <div style={{ fontSize: '28px', fontWeight: 700, color: slaColor(cards?.cumplimientoSLA.porcentaje ?? 0), lineHeight: 1 }}>
            {loading ? '—' : `${cards?.cumplimientoSLA.porcentaje ?? 0}%`}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b' }}>Meta: 90%</div>
          {!loading && (
            <div style={{ height: '4px', background: '#334155', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                height: '4px',
                width: `${Math.min(cards?.cumplimientoSLA.porcentaje ?? 0, 100)}%`,
                background: slaColor(cards?.cumplimientoSLA.porcentaje ?? 0),
                borderRadius: '2px',
                transition: 'width 0.4s ease',
              }} />
            </div>
          )}
        </KpiCard>

        {/* 4. IEI */}
        <KpiCard label="5. I.E.I">
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'white', lineHeight: 1 }}>
            {loading ? '—' : fmtCosto(cards?.costoEstimado.total ?? 0)}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b' }}>Impacto económico estimado</div>
          {!loading && cards?.costoEstimado.deltaVsAnterior != null && (
            <span style={{
              fontSize: '10px', fontWeight: 500,
              color: (cards.costoEstimado.deltaVsAnterior ?? 0) > 0 ? '#f87171' : '#4ade80',
            }}>
              {(cards.costoEstimado.deltaVsAnterior ?? 0) > 0 ? '↑' : '↓'} {Math.abs(cards.costoEstimado.deltaVsAnterior ?? 0)}% vs. ant.
            </span>
          )}
        </KpiCard>

        {/* 5. Reincidencia */}
        <KpiCard label="6. Reincidencia crítica">
          <div style={{
            fontSize: '28px', fontWeight: 700, lineHeight: 1,
            color: (cards?.reincidenciaCritica.total ?? 0) > 0 ? '#f87171' : '#4ade80',
          }}>
            {loading ? '—' : (cards?.reincidenciaCritica.total ?? 0)}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b' }}>2+ caídas en el período</div>
          {!loading && (() => {
            const tiendas = cards?.reincidenciaCritica.tiendas ?? []
            if (!tiendas.length) return null
            const t = tiendas[rotatingIdx % tiendas.length]
            return (
              <div style={{ fontSize: '10px', color: '#f87171', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.codigo} · {t.caidas} caídas
              </div>
            )
          })()}
        </KpiCard>

        {/* 6. Proveedor crítico */}
        <KpiCard label="7. Proveedor crítico">
          {loading ? (
            <div style={{ fontSize: '16px', color: '#64748b' }}>—</div>
          ) : cards?.proveedorCritico ? (
            <>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#fb923c', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cards.proveedorCritico.nombre}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>Mayor impacto del período</div>
            </>
          ) : (
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#4ade80', lineHeight: 1 }}>Sin críticos</div>
          )}
        </KpiCard>
      </div>

      {/* 4×2 grid — sub-cards A–H mini */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridTemplateRows: 'repeat(2, 1fr)',
        gap: '8px',
      }}>
        {/* A */}
        <div style={CELL}>
          <TendenciaSLACard desde={desde} hasta={hasta} proveedorId="" refreshKey={refreshKey} />
        </div>
        {/* B */}
        <div style={CELL}>
          <ProviderImpactCard desde={desde} hasta={hasta} proveedorId="" refreshKey={refreshKey} />
        </div>
        {/* C */}
        <div style={CELL}>
          <CriticalStoresCard desde={desde} hasta={hasta} proveedorId="" refreshKey={refreshKey} />
        </div>
        {/* D */}
        <div style={CELL}>
          <DistributionByTypeCard desde={desde} hasta={hasta} proveedorId="" refreshKey={refreshKey} />
        </div>
        {/* E */}
        <div style={CELL}>
          <ProviderSlaComplianceCard desde={desde} hasta={hasta} proveedorId="" refreshKey={refreshKey} />
        </div>
        {/* F */}
        <div style={CELL}>
          <GeographicImpactCard desde={desde} hasta={hasta} proveedorId="" refreshKey={refreshKey} />
        </div>
        {/* G */}
        <div style={CELL}>
          <SlaTrendSixMonthsCard proveedorId="" refreshKey={refreshKey} />
        </div>
        {/* H */}
        <div style={CELL}>
          <InsightsRecommendationsCard desde={desde} hasta={hasta} proveedorId="" refreshKey={refreshKey} />
        </div>
      </div>
    </div>
  )
}
