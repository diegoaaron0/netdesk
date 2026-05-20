'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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

export default function PantallaCompletaPage() {
  const router = useRouter()
  const [refreshKey, setRefreshKey] = useState(0)
  const [now, setNow] = useState<Date | null>(null)

  const desde = useMemo(() => firstDayOfMonth(), [])
  const hasta  = useMemo(() => todayStr(), [])

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

  const fmtDatetime = (d: Date) =>
    d.toLocaleString('es-PE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'America/Lima',
    })

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
      gap: '10px',
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
          <span style={{ fontSize: '17px', fontWeight: 700, color: 'white', letterSpacing: '-0.3px' }}>NetDesk</span>
          <span style={{ fontSize: '10px', color: '#64748b', padding: '2px 8px', background: '#0f172a', borderRadius: '999px', fontWeight: 500 }}>
            Vista panorámica
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

      {/* 4 × 2 Grid */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridTemplateRows: 'repeat(2, 1fr)',
        gap: '10px',
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
