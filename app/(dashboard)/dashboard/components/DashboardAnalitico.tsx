'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { DashboardAnaliticoResponse } from '@/types/dashboard'
import TendenciaSLACard from './TendenciaSLACard'
import ProviderImpactCard from './ProviderImpactCard'
import CriticalStoresCard from './CriticalStoresCard'
import DistributionByTypeCard from './DistributionByTypeCard'
import ProviderSlaComplianceCard from './ProviderSlaComplianceCard'
import GeographicImpactCard from './GeographicImpactCard'
import SlaTrendSixMonthsCard from './SlaTrendSixMonthsCard'
import InsightsRecommendationsCard from './InsightsRecommendationsCard'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
function fmtTipo(t: string) {
  const map: Record<string, string> = {
    CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
    LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
  }
  return map[t] ?? t
}
function fmtEstado(e: string) { return e.replace(/_/g, ' ') }

function DeltaBadge({ delta, invertir = false }: { delta: number | null; invertir?: boolean }) {
  if (delta == null) return null
  const mejor = invertir ? delta < 0 : delta < 0
  const color = mejor ? '#3B6D11' : '#A32D2D'
  const bg    = mejor ? '#EAF3DE' : '#FCEBEB'
  const arrow = delta > 0 ? '↑' : '↓'
  return (
    <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 7px', borderRadius: '999px', background: bg, color }}>
      {arrow} {Math.abs(delta)}% vs. período equivalente anterior
    </span>
  )
}

// ─── Mini Bar Chart (SVG) ─────────────────────────────────────────────────────

function MiniBarChart({ data }: { data: Array<{ dia: string; total: number }> }) {
  if (!data.length) return null
  const max = Math.max(...data.map((d) => d.total), 1)
  const W = 200; const H = 40
  const barW = Math.max(2, Math.floor(W / data.length) - 1)
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', height: '40px' }}>
      {data.map((d, i) => {
        const h = Math.max(2, Math.round((d.total / max) * H))
        return <rect key={i} x={i * (W / data.length)} y={H - h} width={barW} height={h} rx={1} fill="#378ADD" opacity={0.8} />
      })}
    </svg>
  )
}

// ─── Mini Sparkline (SVG) ────────────────────────────────────────────────────

function MiniSparkline({ data }: { data: Array<{ dia: string; mttrMinutos: number | null }> }) {
  const filtered = data.filter((d) => d.mttrMinutos != null)
  if (filtered.length < 2) return null
  const vals = filtered.map((d) => d.mttrMinutos!)
  const max = Math.max(...vals, 1); const min = Math.min(...vals)
  const W = 200; const H = 40
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W
    const y = H - ((v - min) / Math.max(max - min, 1)) * (H - 4) - 2
    return `${x},${y}`
  })
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', height: '40px' }}>
      <polyline points={pts.join(' ')} fill="none" stroke="#8B5CF6" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div style={{ height: '6px', background: 'var(--muted)', borderRadius: '3px', overflow: 'hidden' }}>
      <div style={{ height: '6px', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
    </div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Sk({ w = '60%', h = 16 }: { w?: string; h?: number }) {
  return (
    <div style={{ width: w, height: h, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', borderRadius: 4, animation: 'shimmer 1.4s infinite' }} />
  )
}

// ─── Panel wrapper ───────────────────────────────────────────────────────────

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', marginTop: '8px', padding: '16px', maxHeight: '300px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600 }}>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)', lineHeight: 1 }}>✕</button>
      </div>
      {children}
    </div>
  )
}

// ─── Card shell ──────────────────────────────────────────────────────────────

function Card({
  children, onClick, isOpen, pulse = false, pulseColor = '#EA580C',
}: {
  children: React.ReactNode; onClick: () => void; isOpen: boolean
  pulse?: boolean; pulseColor?: string
}) {
  return (
    <div
      onClick={onClick}
      className={pulse ? 'card-critico' : undefined}
      style={{
        background: 'white',
        border: `0.5px solid ${isOpen ? '#185FA5' : '#e5e7eb'}`,
        borderRadius: '12px',
        padding: '16px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minWidth: 0,
        transition: 'border-color 0.2s',
        ...(pulse ? { '--pulse-color': pulseColor } as any : {}),
      }}
    >
      {children}
    </div>
  )
}

// ─── MTTR color ──────────────────────────────────────────────────────────────

function mttrColor(min: number | null) {
  if (!min) return '#0f172a'
  if (min < 120) return '#3B6D11'
  if (min < 240) return '#854F0B'
  return '#A32D2D'
}
function slaColor(pct: number) {
  if (pct >= 90) return '#3B6D11'
  if (pct >= 70) return '#854F0B'
  return '#A32D2D'
}
function mttrBadge(min: number) {
  if (min < 120) return { label: '✓ Bueno', color: '#3B6D11', bg: '#EAF3DE' }
  if (min < 240) return { label: '⚠ Lento', color: '#854F0B', bg: '#FAEEDA' }
  return { label: '✗ Crítico', color: '#A32D2D', bg: '#FCEBEB' }
}
function slaBadge(pct: number) {
  if (pct >= 90) return { label: '✓ OK', color: '#3B6D11', bg: '#EAF3DE' }
  if (pct >= 70) return { label: '⚠ Lento', color: '#854F0B', bg: '#FAEEDA' }
  return { label: '✗ Crítico', color: '#A32D2D', bg: '#FCEBEB' }
}

// ─── ICONS (inline SVG) ──────────────────────────────────────────────────────

const IconIncidentes  = () => <svg width={22} height={22} fill="none" stroke="#185FA5" strokeWidth={1.8} viewBox="0 0 24 24"><circle cx={12} cy={12} r={10}/><line x1={12} y1={8} x2={12} y2={12}/><circle cx={12} cy={16} r={0.5} fill="#185FA5"/></svg>
const IconTienda      = () => <svg width={22} height={22} fill="none" stroke="#1D9E75" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
const IconClock       = () => <svg width={22} height={22} fill="none" stroke="#8B5CF6" strokeWidth={1.8} viewBox="0 0 24 24"><circle cx={12} cy={12} r={10}/><polyline points="12 6 12 12 16 14"/></svg>
const IconShield      = () => <svg width={22} height={22} fill="none" stroke="#0EA5E9" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
const IconDollar      = () => <svg width={22} height={22} fill="none" stroke="#F59E0B" strokeWidth={1.8} viewBox="0 0 24 24"><circle cx={12} cy={12} r={10}/><path d="M12 6v12M9 9a3 3 0 016 0c0 1.7-1.3 2.5-3 3s-3 1.3-3 3a3 3 0 006 0"/></svg>
const IconAlert       = () => <svg width={22} height={22} fill="none" stroke="#EF4444" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1={12} y1={9} x2={12} y2={13}/><circle cx={12} cy={17} r={0.5} fill="#EF4444"/></svg>
const IconZap         = () => <svg width={22} height={22} fill="none" stroke="#EA580C" strokeWidth={1.8} viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
const IconPlaceholder = () => <svg width={28} height={28} fill="none" stroke="#d1d5db" strokeWidth={1.5} viewBox="0 0 24 24"><rect x={3} y={3} width={18} height={18} rx={2}/><path d="M3 9h18M9 21V9"/></svg>

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardAnalitico() {
  const router = useRouter()
  const [desde, setDesde] = useState(firstDayOfMonth)
  const [hasta, setHasta] = useState(todayStr)
  const [proveedorId, setProveedorId] = useState('')
  const [data, setData] = useState<DashboardAnaliticoResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [openCard, setOpenCard] = useState<string | null>(null)
  const [rotatingIdx, setRotatingIdx] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [slaProvSelected, setSlaProvSelected] = useState<string | null>(null)
  const [ieiProvSelected, setIeiProvSelected] = useState<string | null>(null)
  const [ieiTiendaSelected, setIeiTiendaSelected] = useState<string | null>(null)
  const [provIncOpen, setProvIncOpen] = useState(false)
  const [mttrProvSelected, setMttrProvSelected] = useState<string | null>(null)

  const fetchData = useCallback(async (d = desde, h = hasta, pId = proveedorId) => {
    setLoading(true)
    setError(false)
    try {
      const params = new URLSearchParams({ desde: d, hasta: h })
      if (pId) params.set('proveedorId', pId)
      const res = await fetch(`/api/dashboard/analitico?${params}`)
      if (res.ok) setData(await res.json())
      else setError(true)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [])  // solo al montar

  // Rotating card for reincidencia
  useEffect(() => {
    const tiendas = data?.cards.reincidenciaCritica.tiendas ?? []
    if (tiendas.length < 2) return
    const id = setInterval(() => setRotatingIdx((i) => (i + 1) % tiendas.length), 4000)
    return () => clearInterval(id)
  }, [data?.cards.reincidenciaCritica.tiendas])

  function toggle(id: string) { setOpenCard((c) => c === id ? null : id) }

  const cards = data?.cards

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes pulse-border {
          0%,100%{box-shadow:0 0 0 0 rgba(234,88,12,0.25)}
          50%{box-shadow:0 0 0 5px rgba(234,88,12,0.08)}
        }
        .card-critico { animation: pulse-border 2s ease-in-out infinite; }
        @keyframes fade-in { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
        .reincide-fade { animation: fade-in 0.4s ease; }
      `}</style>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
        <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {(data?.proveedores ?? []).map((p: any) => (
            <option key={p.nombre} value={p.nombre}>{p.nombre}</option>
          ))}
        </select>
        <button onClick={() => { fetchData(); setRefreshKey(k => k + 1) }}
          style={{ padding: '6px 14px', fontSize: '12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>
          Actualizar
        </button>
        <button onClick={() => { setDesde(firstDayOfMonth()); setHasta(todayStr()); setProveedorId(''); fetchData(firstDayOfMonth(), todayStr(), ''); setRefreshKey(k => k + 1) }}
          style={{ padding: '6px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--card)', color: 'var(--foreground)' }}>
          Limpiar filtros
        </button>
        <button onClick={() => router.push('/dashboard/pantalla-completa')}
          style={{ padding: '6px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--card)', color: 'var(--foreground)', marginLeft: 'auto' }}>
          ⛶ Pantalla completa
        </button>
        <button onClick={() => alert('Exportar CSV — próximamente')}
          style={{ padding: '6px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--card)', color: 'var(--foreground)', opacity: 0.5 }}>
          Exportar CSV
        </button>
      </div>

      {!loading && error && (
        <div style={{ padding: '32px', textAlign: 'center', color: '#A32D2D', fontSize: '14px', fontWeight: 500 }}>
          Error cargando datos. Intenta de nuevo.
        </div>
      )}
      {!error && <>
      {/* 7 Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '8px' }}>

        {/* CARD 1 — Incidentes */}
        <Card onClick={() => toggle('incidentes')} isOpen={openCard === 'incidentes'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)' }}>1. Incidentes del período</span>
            <IconIncidentes />
          </div>
          {loading ? <Sk w="50%" h={32} /> : (
            <div style={{ fontSize: '30px', fontWeight: 600, color: '#0f172a', lineHeight: 1 }}>{cards?.incidentes.total ?? 0}</div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>incidentes</div>
          {!loading && cards && (
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{cards.tiendasAfectadas.total} tiendas afectadas</div>
          )}
          {!loading && <DeltaBadge delta={cards?.incidentes.deltaVsAnterior ?? null} />}
          {!loading && cards?.incidentes.byDay.length ? <MiniBarChart data={cards.incidentes.byDay} /> : null}
          <button style={{ marginTop: 'auto', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' }}>Ver detalle →</button>
        </Card>

        {/* CARD 3 — MTTR */}
        <Card onClick={() => toggle('mttr')} isOpen={openCard === 'mttr'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)' }}>3. MTTR promedio</span>
            <IconClock />
          </div>
          {loading ? <Sk w="55%" h={32} /> : (
            <div style={{ fontSize: '26px', fontWeight: 600, color: mttrColor(cards?.mttrPromedio.minutos ?? null), lineHeight: 1 }}>
              {fmtMttr(cards?.mttrPromedio.minutos)}
            </div>
          )}
          {!loading && cards?.mttrPromedio.deltaMinutos != null && (
            <div style={{ fontSize: '11px', color: (cards.mttrPromedio.deltaMinutos ?? 0) > 0 ? '#A32D2D' : '#3B6D11' }}>
              {(cards.mttrPromedio.deltaMinutos ?? 0) > 0 ? '↑' : '↓'} {Math.abs(cards.mttrPromedio.deltaMinutos)}m vs período anterior
            </div>
          )}
          {!loading && cards?.mttrPromedio.byDay.length ? <MiniSparkline data={cards.mttrPromedio.byDay} /> : null}
          <button style={{ marginTop: 'auto', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' }}>Ver detalle →</button>
        </Card>

        {/* CARD 4 — SLA */}
        <Card onClick={() => toggle('sla')} isOpen={openCard === 'sla'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)' }}>4. Cumplimiento SLA</span>
            <IconShield />
          </div>
          {loading ? <Sk w="45%" h={32} /> : (
            <div style={{ fontSize: '30px', fontWeight: 600, color: slaColor(cards?.cumplimientoSLA.scoreEficiencia ?? cards?.cumplimientoSLA.porcentaje ?? 0), lineHeight: 1 }}>
              {cards?.cumplimientoSLA.scoreEficiencia ?? cards?.cumplimientoSLA.porcentaje ?? 0}
            </div>
          )}
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Eficiencia promedio · Respuesta + Resolución</div>
          {!loading && cards?.cumplimientoSLA.deltaVsAnterior != null && (
            <div style={{ fontSize: '11px', color: (cards.cumplimientoSLA.deltaVsAnterior ?? 0) >= 0 ? '#3B6D11' : '#A32D2D' }}>
              {(cards.cumplimientoSLA.deltaVsAnterior ?? 0) >= 0 ? '↑' : '↓'} {Math.abs(cards.cumplimientoSLA.deltaVsAnterior ?? 0)}% vs período anterior
            </div>
          )}
          {!loading && (
            <ProgressBar value={cards?.cumplimientoSLA.scoreEficiencia ?? cards?.cumplimientoSLA.porcentaje ?? 0} color={slaColor(cards?.cumplimientoSLA.scoreEficiencia ?? cards?.cumplimientoSLA.porcentaje ?? 0)} />
          )}
          <button style={{ marginTop: 'auto', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' }}>Ver detalle →</button>
        </Card>

        {/* CARD 5 — Costo estimado */}
        <Card onClick={() => toggle('costo')} isOpen={openCard === 'costo'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)' }}>5. I.E.I</span>
            <IconDollar />
          </div>
          {loading ? <Sk w="55%" h={28} /> : (
            <div style={{ fontSize: '24px', fontWeight: 600, color: '#0f172a', lineHeight: 1 }}>
              {fmtCosto(cards?.costoEstimado.total ?? 0)}
            </div>
          )}
          {!loading && cards?.costoEstimado.deltaVsAnterior != null && (
            <DeltaBadge delta={cards.costoEstimado.deltaVsAnterior} />
          )}
          {!loading && cards && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10px', color: '#1D4ED8' }}>↩ Agente: {fmtCosto(cards.costoEstimado.totalAgente)}</span>
              <span style={{ fontSize: '10px', color: '#A32D2D' }}>↩ Proveedor: {fmtCosto(cards.costoEstimado.totalProveedor)}</span>
            </div>
          )}
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
            Basado en horas de caída, venta promedio y margen
          </div>
          <button style={{ marginTop: 'auto', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' }}>Ver detalle →</button>
        </Card>

        {/* CARD 6 — Reincidencia */}
        <Card onClick={() => toggle('reincidencia')} isOpen={openCard === 'reincidencia'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)' }}>6. Reincidencia crítica</span>
            <IconAlert />
          </div>
          {loading ? <Sk w="35%" h={32} /> : (
            <div style={{ fontSize: '30px', fontWeight: 600, color: '#0f172a', lineHeight: 1 }}>
              {cards?.reincidenciaCritica.total ?? 0}
            </div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>2+ caídas en el período</div>
          {!loading && (() => {
            const tiendas = cards?.reincidenciaCritica.tiendas ?? []
            if (!tiendas.length) return null
            const t = tiendas[rotatingIdx % tiendas.length]
            return (
              <div key={rotatingIdx} className="reincide-fade"
                style={{ border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 10px', background: '#FFF5F5', marginTop: '4px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#A32D2D' }}>{t.codigo} · {t.proveedor}</div>
                <div style={{ fontSize: '10px', color: '#854F0B', marginTop: '2px' }}>{t.caidas} caídas</div>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{t.razon}</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px', alignItems: 'center' }}>
                  {!t.tieneContingencia && (
                    <span style={{ fontSize: '10px', color: '#A32D2D' }}>Sin contingencia</span>
                  )}
                  {t.diasEntreCaidas != null && (
                    <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Cada ~{t.diasEntreCaidas}d</span>
                  )}
                  {t.tendencia === 'EMPEORA' && (
                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', background: '#FCEBEB', color: '#A32D2D', fontWeight: 500 }}>↑ Empeora</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', justifyContent: 'center' }}>
                  {tiendas.map((_, i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === rotatingIdx % tiendas.length ? '#A32D2D' : '#FCA5A5' }} />
                  ))}
                </div>
              </div>
            )
          })()}
          <button style={{ marginTop: 'auto', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' }}>Ver detalle →</button>
        </Card>

        {/* CARD 7 — Proveedor crítico */}
        <Card
          onClick={() => toggle('proveedor')}
          isOpen={openCard === 'proveedor'}
          pulse={!loading && !!cards?.proveedorCritico}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)' }}>7. Proveedor crítico</span>
            <IconZap />
          </div>
          {loading ? <Sk w="60%" h={28} /> : cards?.proveedorCritico ? (
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#EA580C', lineHeight: 1 }}>
              {cards.proveedorCritico.nombre}
            </div>
          ) : (
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#3B6D11', lineHeight: 1 }}>
              Sin proveedor crítico
            </div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
            {loading ? null : cards?.proveedorCritico ? 'Mayor impacto operativo del período' : 'Todos en nivel aceptable'}
          </div>
          <button style={{ marginTop: 'auto', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' }}>Ver detalle →</button>
        </Card>
      </div>

      {/* Panel detail */}
      {openCard === 'incidentes' && cards && (
        <Panel title={`Incidentes del período (${cards.incidentes.total})`} onClose={() => setOpenCard(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 60px 100px 100px 80px 90px 55px 55px 40px', gap: '8px', padding: '0 0 8px 0', borderBottom: '0.5px solid var(--border)', marginBottom: '4px' }}>
            {['Código','Tienda','Proveedor','Tipo','Estado','Fecha','Inicio','Fin','Incs.'].map((h) => (
              <span key={h} style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {cards.incidentes.lista.map((inc, i) => (
              <div key={inc.id}
                onClick={() => router.push(`/incidentes/${inc.id}`)}
                style={{ display: 'grid', gridTemplateColumns: '90px 60px 100px 100px 80px 90px 55px 55px 40px', gap: '8px', padding: '7px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#185FA5' }}>{inc.codigo}</span>
                <span style={{ fontSize: '11px', fontWeight: 500 }}>{inc.tiendaCodigo}</span>
                <span style={{ fontSize: '12px' }}>{inc.proveedor}</span>
                <span style={{ fontSize: '11px' }}>{fmtTipo(inc.tipo)}</span>
                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: inc.estado === 'RESUELTO' ? '#EAF3DE' : '#E6F1FB', color: inc.estado === 'RESUELTO' ? '#3B6D11' : '#185FA5', whiteSpace: 'nowrap' }}>
                  {fmtEstado(inc.estado)}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{inc.fecha}</span>
                <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{inc.horaInicio}</span>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>{inc.horaFin ?? '—'}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: inc.tiendaIncCount > 2 ? '#A32D2D' : '#0f172a' }}>{inc.tiendaIncCount}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {openCard === 'mttr' && cards && (
        <Panel title="MTTR por proveedor" onClose={() => setOpenCard(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 55px 70px 65px 60px 60px 70px auto', gap: '8px', padding: '0 0 8px 0', borderBottom: '0.5px solid var(--border)', marginBottom: '4px' }}>
            {['Proveedor','Resueltos','MTTR prom','MTTR Prov.','Mejor','Peor','Δ vs ant.','Estado'].map((h) => (
              <span key={h} style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}
                title={h === 'MTTR Prov.' ? 'MTTR solo de incidentes resueltos por el proveedor' : undefined}
              >{h}</span>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {cards.mttrPromedio.porProveedor.map((p, i) => {
              const b = mttrBadge(p.mttrMinutos)
              const deltaMin = p.mttrPrevMinutos != null ? p.mttrMinutos - p.mttrPrevMinutos : null
              const isSelected = mttrProvSelected === p.nombre
              const mttrProvColor = p.mttrProveedorMin == null ? 'var(--muted-foreground)' : p.mttrProveedorMin > 120 ? '#A32D2D' : p.mttrProveedorMin > 60 ? '#854F0B' : '#3B6D11'
              return (
                <div key={i}>
                  <div
                    onClick={() => setMttrProvSelected(isSelected ? null : p.nombre)}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 55px 70px 65px 60px 60px 70px auto', gap: '8px', padding: '7px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center', cursor: 'pointer', background: isSelected ? 'var(--muted)' : 'transparent', borderRadius: isSelected ? '6px' : undefined }}>
                    <span style={{ fontSize: '12px' }}>{p.nombre}</span>
                    <span style={{ fontSize: '12px', textAlign: 'right' }}>{p.incidentesResueltos}</span>
                    <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'monospace', color: b.color }}>{fmtMttr(p.mttrMinutos)}</span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: mttrProvColor }}
                      title="MTTR solo de incidentes resueltos por el proveedor">
                      {fmtMttr(p.mttrProveedorMin)}
                    </span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#3B6D11' }}>{fmtMttr(p.mejorTiempo)}</span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#A32D2D' }}>{fmtMttr(p.peorTiempo)}</span>
                    <span style={{ fontSize: '11px', color: deltaMin == null ? 'var(--muted-foreground)' : deltaMin > 0 ? '#A32D2D' : '#3B6D11' }}>
                      {deltaMin == null ? '—' : `${deltaMin > 0 ? '↑' : '↓'} ${fmtMttr(Math.abs(deltaMin))}`}
                    </span>
                    <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: b.bg, color: b.color, whiteSpace: 'nowrap' }}>{b.label}</span>
                  </div>
                  {isSelected && p.tiendas.length > 0 && (
                    <div style={{ margin: '4px 0 8px 8px', padding: '8px', background: 'var(--muted)', borderRadius: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '70px 60px 70px 60px 60px', gap: '8px', marginBottom: '4px' }}>
                        {['Tienda', 'Incidentes', 'MTTR', 'Mejor', 'Peor'].map((h) => (
                          <span key={h} style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
                        ))}
                      </div>
                      {(() => {
                        const maxMttr = Math.max(...p.tiendas.map((t) => t.mttrMinutos), 1)
                        return p.tiendas.map((t, j) => {
                          const barPct = Math.round((t.mttrMinutos / maxMttr) * 100)
                          const barColor = barPct >= 80 ? '#A32D2D' : barPct >= 50 ? '#854F0B' : '#3B6D11'
                          return (
                            <div key={j} style={{ display: 'grid', gridTemplateColumns: '70px 60px 70px 60px 60px', gap: '8px', padding: '5px 0', borderTop: j > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
                              <span style={{ fontSize: '11px', fontWeight: 500 }}>{t.codigo}</span>
                              <span style={{ fontSize: '11px', textAlign: 'center' }}>{t.incidentes}</span>
                              <div>
                                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: barColor }}>{fmtMttr(t.mttrMinutos)}</span>
                                <div style={{ height: '3px', background: '#e5e7eb', borderRadius: '2px', marginTop: '3px', overflow: 'hidden' }}>
                                  <div style={{ height: '3px', width: `${barPct}%`, background: barColor, borderRadius: '2px' }} />
                                </div>
                              </div>
                              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#3B6D11' }}>{fmtMttr(t.mejorTiempo)}</span>
                              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#A32D2D' }}>{fmtMttr(t.peorTiempo)}</span>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {openCard === 'sla' && cards && (
        <Panel title="Cumplimiento SLA" onClose={() => setOpenCard(null)}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Resumen por proveedor</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px auto', gap: '8px', padding: '0 0 8px 0', borderBottom: '0.5px solid var(--border)', marginBottom: '4px' }}>
            {['Proveedor', 'Eficiencia SLA', 'Exceso resp.', 'Exceso resol.', 'Estado'].map((h) => (
              <span key={h} style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
          {cards.cumplimientoSLA.porProveedor.map((p, i) => {
            const effVal = p.scoreEficiencia ?? p.slaPct
            const effColor = effVal >= 70 ? '#16a34a' : effVal >= 40 ? '#d97706' : '#dc2626'
            const b = slaBadge(p.slaPct)
            const isSelected = slaProvSelected === p.nombre
            return (
              <div key={i}>
                <div
                  onClick={() => setSlaProvSelected(isSelected ? null : p.nombre)}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px auto', gap: '8px', padding: '7px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center', cursor: 'pointer', background: isSelected ? 'var(--muted)' : 'transparent' }}>
                  <span style={{ fontSize: '12px' }}>{p.nombre}</span>
                  <span
                    title="Eficiencia: 100 = respondió/resolvió instantáneo, 50 = usó el 100% del tiempo límite, 0 = tardó el doble o más"
                    style={{ fontSize: '12px', fontWeight: 600, color: effColor, cursor: 'help' }}>
                    {effVal}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    {p.excessoRespuestaMin > 0 ? `+${fmtMttr(p.excessoRespuestaMin)}` : '—'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    {p.excessoResolucionMin > 0 ? `+${fmtMttr(p.excessoResolucionMin)}` : '—'}
                  </span>
                  <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: b.bg, color: b.color, whiteSpace: 'nowrap' }}>{b.label}</span>
                </div>
                {isSelected && p.tiendas.length > 0 && (
                  <div style={{ margin: '4px 0 8px 8px', padding: '8px', background: 'var(--muted)', borderRadius: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '70px 85px 90px 75px 75px 90px 55px', gap: '8px', marginBottom: '4px' }}>
                      {['Código','Fecha','Tipo','Exc.Resp.','Exc.Resol.','Duración total','SLA'].map((h) => (
                        <span key={h} style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
                      ))}
                    </div>
                    {p.tiendas.map((t, j) => (
                      <div key={j} style={{ display: 'grid', gridTemplateColumns: '70px 85px 90px 75px 75px 90px 55px', gap: '8px', padding: '5px 0', borderTop: j > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 500 }}>{t.codigo}</span>
                        <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{t.fecha}</span>
                        <span style={{ fontSize: '11px' }}>{fmtTipo(t.tipo)}</span>
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: t.excRespMin ? '#A32D2D' : 'var(--muted-foreground)' }}>{t.excRespMin ? `+${fmtMttr(t.excRespMin)}` : '—'}</span>
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: t.excResolMin ? '#A32D2D' : 'var(--muted-foreground)' }}>{t.excResolMin ? `+${fmtMttr(t.excResolMin)}` : '—'}</span>
                        <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{t.duracionMin ? fmtMttr(t.duracionMin) : '—'}</span>
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', background: t.cumplido ? '#EAF3DE' : '#FCEBEB', color: t.cumplido ? '#3B6D11' : '#A32D2D', whiteSpace: 'nowrap' }}>
                          {t.cumplido ? '✓ OK' : '✗ Fuera'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 6px' }}>Incidentes evaluables</div>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 70px 1fr 80px auto', gap: '8px', padding: '0 0 6px 0', borderBottom: '0.5px solid var(--border)', marginBottom: '4px' }}>
            {['Código','Tienda','Proveedor','Tipo','SLA'].map((h) => (
              <span key={h} style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
          {cards.cumplimientoSLA.evaluables.map((e, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 70px 1fr 80px auto', gap: '8px', padding: '5px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted-foreground)' }}>{e.codigo}</span>
              <span style={{ fontSize: '11px', fontWeight: 500 }}>{e.tiendaCodigo}</span>
              <span style={{ fontSize: '11px' }}>{e.proveedor}</span>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{fmtTipo(e.tipo)}</span>
              {e.scoreEficiencia != null ? (
                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', whiteSpace: 'nowrap',
                  background: e.scoreEficiencia >= 70 ? '#EAF3DE' : e.scoreEficiencia >= 40 ? '#FEF3C7' : '#FCEBEB',
                  color: e.scoreEficiencia >= 70 ? '#3B6D11' : e.scoreEficiencia >= 40 ? '#92400E' : '#A32D2D' }}>
                  Efic. {e.scoreEficiencia}
                </span>
              ) : (
                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: e.cumplido ? '#EAF3DE' : '#FCEBEB', color: e.cumplido ? '#3B6D11' : '#A32D2D', whiteSpace: 'nowrap' }}>
                  {e.cumplido ? '✓ OK' : '✗ Fuera'}
                </span>
              )}
            </div>
          ))}
        </Panel>
      )}

      {openCard === 'costo' && cards && (
        <Panel title="Desglose de Impacto Económico de Indisponibilidad" onClose={() => setOpenCard(null)}>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '10px', marginTop: '-4px' }}>Impacto Económico Estimado de Indisponibilidad</div>
          <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '12px', marginBottom: '8px', display: 'grid', gridTemplateColumns: '1fr auto', rowGap: '4px', columnGap: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Venta afectada estimada:</span>
            <span style={{ fontSize: '12px', fontWeight: 500, textAlign: 'right' }}>{fmtCosto(cards.costoEstimado.ventaAfectadaTotal)}</span>
            <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Margen aplicado:</span>
            <span style={{ fontSize: '12px', fontWeight: 500, textAlign: 'right' }}>35%</span>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>I.E.I total:</span>
            <span style={{ fontSize: '12px', fontWeight: 600, textAlign: 'right' }}>{fmtCosto(cards.costoEstimado.total)}</span>
          </div>
          {cards.costoEstimado.totalAgente > 0 && (
            <div style={{ background: '#EFF6FF', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', display: 'grid', gridTemplateColumns: '1fr auto', columnGap: '16px' }}>
              <span style={{ fontSize: '12px', color: '#1D4ED8' }}>Impacto evitado por resolución interna:</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#1D4ED8', textAlign: 'right' }}>{fmtCosto(cards.costoEstimado.totalAgente)}</span>
            </div>
          )}
          {cards.costoEstimado.proveedorMayorImpacto && (
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>
              Proveedor con mayor impacto: <strong>{cards.costoEstimado.proveedorMayorImpacto.nombre}</strong> → {fmtCosto(cards.costoEstimado.proveedorMayorImpacto.costo)}
            </div>
          )}
          {cards.costoEstimado.tiendaMayorImpacto && (
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '12px' }}>
              Tienda con mayor impacto: <strong>{cards.costoEstimado.tiendaMayorImpacto.codigo}</strong> → {fmtCosto(cards.costoEstimado.tiendaMayorImpacto.costo)}
            </div>
          )}
          {(() => {
            const top5 = cards.costoEstimado.top5Tiendas
            const provMap = new Map<string, number>()
            for (const t of top5) provMap.set(t.proveedor, (provMap.get(t.proveedor) ?? 0) + t.costo)
            const provList = [...provMap.entries()].sort((a, b) => b[1] - a[1])
            const total = cards.costoEstimado.total
            return (
              <>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px' }}>I.E.I por proveedor</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 45px', gap: '8px', padding: '0 0 6px 0', borderBottom: '0.5px solid var(--border)', marginBottom: '4px' }}>
                  {['Proveedor', 'I.E.I', '%'].map((h) => (
                    <span key={h} style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
                  ))}
                </div>
                {provList.map(([prov, costo], i) => {
                  const pct = total > 0 ? Math.round(costo / total * 100) : 0
                  const isSelected = ieiProvSelected === prov
                  const filteredTiendas = top5.filter((t) => t.proveedor === prov)
                  return (
                    <div key={i}>
                      <div
                        onClick={() => setIeiProvSelected(isSelected ? null : prov)}
                        style={{ display: 'grid', gridTemplateColumns: '1fr 90px 45px', gap: '8px', padding: '6px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center', cursor: 'pointer', background: isSelected ? 'var(--muted)' : 'transparent' }}>
                        <span style={{ fontSize: '12px' }}>{prov}</span>
                        <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 500 }}>{fmtCosto(Math.round(costo))}</span>
                        <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{pct}%</span>
                      </div>
                      {isSelected && filteredTiendas.length > 0 && (
                        <div style={{ margin: '4px 0 8px 8px', padding: '8px', background: 'var(--muted)', borderRadius: '8px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '60px 90px 1fr', gap: '8px', marginBottom: '4px' }}>
                            {['Tienda', 'I.E.I', 'Motivo'].map((h) => (
                              <span key={h} style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
                            ))}
                          </div>
                          {filteredTiendas.map((t, j) => {
                            const isTiendaSel = ieiTiendaSelected === t.codigo
                            return (
                              <div key={j}>
                                <div
                                  onClick={() => setIeiTiendaSelected(isTiendaSel ? null : t.codigo)}
                                  style={{ display: 'grid', gridTemplateColumns: '60px 90px 1fr', gap: '8px', padding: '4px 0', borderTop: j > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center', cursor: 'pointer', background: isTiendaSel ? '#e2e8f0' : 'transparent', borderRadius: isTiendaSel ? '4px' : undefined }}>
                                  <span style={{ fontSize: '11px', fontWeight: 500 }}>{t.codigo}</span>
                                  <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{fmtCosto(t.costo)}</span>
                                  <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.motivo}</span>
                                </div>
                                {isTiendaSel && (
                                  <div style={{ margin: '4px 0 6px 0', padding: '10px 12px', background: 'white', border: '0.5px solid var(--border)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '6px' }}>{t.codigo} · {t.proveedor}</div>
                                    <div style={{ fontSize: '11px', fontFamily: 'monospace', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', marginBottom: '8px', lineHeight: 1.9 }}>
                                      {'IEI = S/'}{t.ventaHora != null ? t.ventaHora.toLocaleString('es-PE') : '—'}{'/h'}
                                      {' × '}{t.horasAfectadas}{'h'}
                                      {' × '}{Math.round(t.margen * 100)}{'% margen'}
                                      {' × '}{t.factor}{' factor'}
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                      {t.huboContingencia && (
                                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: '#F1F5F9', color: '#475569', fontWeight: 500 }}>Contingencia activa</span>
                                      )}
                                      {t.huboMovil && (
                                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: '#F1F5F9', color: '#475569', fontWeight: 500 }}>Datos móviles</span>
                                      )}
                                      {t.huboBoleta && (
                                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: '#F1F5F9', color: '#475569', fontWeight: 500 }}>Boleta manual</span>
                                      )}
                                      {!t.huboContingencia && !t.huboMovil && !t.huboBoleta && (
                                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: '#FCEBEB', color: '#A32D2D', fontWeight: 500 }}>Sin operación alternativa</span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>{fmtCosto(t.costo)}</div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )
          })()}
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px', marginTop: '12px' }}>Top tiendas por I.E.I</div>
          <div style={{ display: 'grid', gridTemplateColumns: '60px 80px 70px 50px 1fr 90px', gap: '8px', padding: '0 0 6px 0', borderBottom: '0.5px solid var(--border)', marginBottom: '4px' }}>
            {['Tienda','Proveedor','V.Afectada','Margen','Motivo','I.E.I'].map((h) => (
              <span key={h} style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
          {cards.costoEstimado.top5Tiendas.map((t, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 80px 70px 50px 1fr 90px', gap: '8px', padding: '6px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 500 }}>{t.codigo}</span>
              <span style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.proveedor}</span>
              <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{fmtCosto(t.ventaAfectada)}</span>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>35%</span>
              <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.motivo}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'monospace', textAlign: 'right' }}>{fmtCosto(t.costo)}</span>
            </div>
          ))}
        </Panel>
      )}

      {openCard === 'reincidencia' && cards && (
        <Panel title="Tiendas con reincidencia" onClose={() => setOpenCard(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '65px 80px 45px 55px 80px 90px 80px 80px', gap: '8px', padding: '0 0 8px 0', borderBottom: '0.5px solid var(--border)', marginBottom: '4px' }}>
            {['Tienda','Prov.','Caídas','Cada','Tipo rep.','Contingencia','Tendencia','I.E.I'].map((h) => (
              <span key={h} style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
          {cards.reincidenciaCritica.tiendas.map((t, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '65px 80px 45px 55px 80px 90px 80px 80px', gap: '8px', padding: '7px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 500 }}>{t.codigo}</span>
              <span style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.proveedor}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: t.caidas >= 3 ? '#A32D2D' : '#854F0B' }}>{t.caidas}</span>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{t.diasEntreCaidas != null ? `~${t.diasEntreCaidas}d` : '—'}</span>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{fmtTipo(t.tipoRepetido)}</span>
              <span style={{ fontSize: '11px', fontWeight: 500, color: t.tieneContingencia ? '#3B6D11' : '#A32D2D' }}>{t.tieneContingencia ? '✓ Sí' : '✗ No'}</span>
              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', whiteSpace: 'nowrap',
                background: t.tendencia === 'EMPEORA' ? '#FCEBEB' : t.tendencia === 'ESTABLE' ? '#FAEEDA' : '#EAF3DE',
                color:      t.tendencia === 'EMPEORA' ? '#A32D2D' : t.tendencia === 'ESTABLE' ? '#854F0B' : '#3B6D11' }}>
                {t.tendencia}
              </span>
              <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{fmtCosto(t.costoEstimado)}</span>
            </div>
          ))}
        </Panel>
      )}

      {openCard === 'proveedor' && cards && !cards.proveedorCritico && (
        <Panel title="Estado de proveedores" onClose={() => setOpenCard(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: '8px' }}>
            <span style={{ fontSize: '28px' }}>✓</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#3B6D11' }}>Sin proveedor crítico en el período</span>
            <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center' }}>
              Todos los proveedores se encuentran en niveles aceptables de SLA, MTTR e impacto.
            </span>
          </div>
        </Panel>
      )}

      {openCard === 'proveedor' && cards?.proveedorCritico && (
        <Panel title={`${cards.proveedorCritico.nombre} — proveedor más crítico`} onClose={() => setOpenCard(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
            {[
              { label: 'SLA', valor: `${cards.proveedorCritico.metricas.slaPct}%`, ok: cards.proveedorCritico.metricas.slaPct >= 90, click: false },
              { label: 'MTTR prom.', valor: fmtMttr(cards.proveedorCritico.metricas.mttrMinutos), ok: cards.proveedorCritico.metricas.mttrMinutos < 120, click: false },
              { label: 'I.E.I', valor: fmtCosto(cards.proveedorCritico.metricas.costoEstimado), ok: false, click: false },
              { label: 'Incidentes', valor: String(cards.proveedorCritico.metricas.incidentes), ok: cards.proveedorCritico.metricas.incidentes <= 2, click: true },
              { label: 'Tiendas reinc.', valor: String(cards.proveedorCritico.metricas.reincidenciaTiendas), ok: cards.proveedorCritico.metricas.reincidenciaTiendas === 0, click: false },
            ].map(({ label, valor, ok, click }) => (
              <div
                key={label}
                onClick={click ? () => setProvIncOpen((v) => !v) : undefined}
                style={{ background: (click && provIncOpen) ? '#e2e8f0' : 'var(--muted)', borderRadius: '8px', padding: '8px 10px', cursor: click ? 'pointer' : 'default' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>{label}{click ? ' ↓' : ''}</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: ok ? '#3B6D11' : '#A32D2D' }}>{valor}</div>
              </div>
            ))}
          </div>
          {provIncOpen && cards.proveedorCritico.incidentesDetalle.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Incidentes del proveedor</div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 60px 90px 65px 55px 75px 90px', gap: '8px', padding: '0 0 6px 0', borderBottom: '0.5px solid var(--border)', marginBottom: '4px' }}>
                {['Código','Tienda','Tipo','MTTR','SLA','IEI','Fecha'].map((h) => (
                  <span key={h} style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
                ))}
              </div>
              {[...cards.proveedorCritico.incidentesDetalle].sort((a, b) => b.iei - a.iei).map((inc, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 60px 90px 65px 55px 75px 90px', gap: '8px', padding: '5px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#185FA5' }}>{inc.codigo}</span>
                  <span style={{ fontSize: '11px', fontWeight: 500 }}>{inc.tiendaCodigo}</span>
                  <span style={{ fontSize: '11px' }}>{fmtTipo(inc.tipo)}</span>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: mttrColor(inc.mttrMinutos) }}>{fmtMttr(inc.mttrMinutos)}</span>
                  {inc.slaCumplido == null ? (
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', background: '#F1F5F9', color: '#475569', whiteSpace: 'nowrap' }}>N/A</span>
                  ) : (
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', background: inc.slaCumplido ? '#EAF3DE' : '#FCEBEB', color: inc.slaCumplido ? '#3B6D11' : '#A32D2D', whiteSpace: 'nowrap' }}>
                      {inc.slaCumplido ? '✓ OK' : '✗ Fuera'}
                    </span>
                  )}
                  <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{fmtCosto(inc.iei)}</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{inc.horaRegistro}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* KPIs — A activo, B-H placeholders */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '20px' }}>

        {/* A — Tendencia de incidentes y SLA (activo) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <TendenciaSLACard
            desde={desde}
            hasta={hasta}
            proveedorId={proveedorId}
            refreshKey={refreshKey}
          />
        </div>

        {/* B — Impacto por proveedor (activo) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <ProviderImpactCard
            desde={desde}
            hasta={hasta}
            proveedorId={proveedorId}
            refreshKey={refreshKey}
          />
        </div>

        {/* C — Tiendas críticas (activo) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <CriticalStoresCard
            desde={desde}
            hasta={hasta}
            proveedorId={proveedorId}
            refreshKey={refreshKey}
          />
        </div>

        {/* D — Distribución por tipo (activo) */}
        <div>
          <DistributionByTypeCard
            desde={desde}
            hasta={hasta}
            proveedorId={proveedorId}
            refreshKey={refreshKey}
          />
        </div>

        {/* E — Cumplimiento SLA por proveedor (activo) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <ProviderSlaComplianceCard
            desde={desde}
            hasta={hasta}
            proveedorId={proveedorId}
            refreshKey={refreshKey}
          />
        </div>

        {/* F — Impacto geográfico (activo) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <GeographicImpactCard
            desde={desde}
            hasta={hasta}
            proveedorId={proveedorId}
            refreshKey={refreshKey}
          />
        </div>

        {/* G — Tendencia SLA últimos 6 meses (activo) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <SlaTrendSixMonthsCard
            proveedorId={proveedorId}
            refreshKey={refreshKey}
          />
        </div>

        {/* H — Insights y decisiones sugeridas (activo) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <InsightsRecommendationsCard
            desde={desde}
            hasta={hasta}
            proveedorId={proveedorId}
            refreshKey={refreshKey}
          />
        </div>
      </div>
      </>}
    </>
  )
}
