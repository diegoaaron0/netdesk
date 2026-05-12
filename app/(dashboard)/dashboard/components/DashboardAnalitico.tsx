'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { DashboardAnaliticoResponse } from '@/types/dashboard'
import TendenciaSLACard from './TendenciaSLACard'
import ProviderImpactCard from './ProviderImpactCard'
import CriticalStoresCard from './CriticalStoresCard'
import DistributionByTypeCard from './DistributionByTypeCard'
import ProviderSlaComplianceCard from './ProviderSlaComplianceCard'

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
      {arrow} {Math.abs(delta)}% vs período anterior
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
  const [openCard, setOpenCard] = useState<string | null>(null)
  const [rotatingIdx, setRotatingIdx] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchData = useCallback(async (d = desde, h = hasta, pId = proveedorId) => {
    setLoading(true)
    setRefreshKey((k) => k + 1)
    try {
      const params = new URLSearchParams({ desde: d, hasta: h })
      if (pId) params.set('proveedorId', pId)
      const res = await fetch(`/api/dashboard/analitico?${params}`)
      if (res.ok) setData(await res.json())
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
  const proveedores = data?.proveedores ?? []

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
          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <button onClick={() => fetchData()}
          style={{ padding: '6px 14px', fontSize: '12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>
          Actualizar
        </button>
        <button onClick={() => { setDesde(firstDayOfMonth()); setHasta(todayStr()); setProveedorId(''); fetchData(firstDayOfMonth(), todayStr(), '') }}
          style={{ padding: '6px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--card)', color: 'var(--foreground)' }}>
          Limpiar filtros
        </button>
        <button onClick={() => alert('Exportar CSV — próximamente')}
          style={{ padding: '6px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--card)', color: 'var(--foreground)', marginLeft: 'auto', opacity: 0.5 }}>
          Exportar CSV
        </button>
      </div>

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
          {!loading && <DeltaBadge delta={cards?.incidentes.deltaVsAnterior ?? null} />}
          {!loading && cards?.incidentes.byDay.length ? <MiniBarChart data={cards.incidentes.byDay} /> : null}
          <div style={{ marginTop: 'auto', fontSize: '11px', color: '#185FA5', fontWeight: 500 }}>Ver detalle →</div>
        </Card>

        {/* CARD 2 — Tiendas afectadas */}
        <Card onClick={() => toggle('tiendas')} isOpen={openCard === 'tiendas'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)' }}>2. Tiendas afectadas</span>
            <IconTienda />
          </div>
          {loading ? <Sk w="40%" h={32} /> : (
            <div style={{ fontSize: '30px', fontWeight: 600, color: '#0f172a', lineHeight: 1 }}>{cards?.tiendasAfectadas.total ?? 0}</div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
            {loading ? null : `${cards?.tiendasAfectadas.porcentajeRed ?? 0}% de la red`}
          </div>
          {!loading && <DeltaBadge delta={cards?.tiendasAfectadas.deltaVsAnterior ?? null} />}
          {!loading && (
            <>
              <ProgressBar value={cards?.tiendasAfectadas.total ?? 0} max={156} color="#1D9E75" />
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
                {cards?.tiendasAfectadas.total ?? 0} / 156 tiendas activas
              </div>
            </>
          )}
          <div style={{ marginTop: 'auto', fontSize: '11px', color: '#185FA5', fontWeight: 500 }}>Ver detalle →</div>
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
          <div style={{ marginTop: 'auto', fontSize: '11px', color: '#185FA5', fontWeight: 500 }}>Ver detalle →</div>
        </Card>

        {/* CARD 4 — SLA */}
        <Card onClick={() => toggle('sla')} isOpen={openCard === 'sla'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)' }}>4. Cumplimiento SLA</span>
            <IconShield />
          </div>
          {loading ? <Sk w="45%" h={32} /> : (
            <div style={{ fontSize: '30px', fontWeight: 600, color: slaColor(cards?.cumplimientoSLA.porcentaje ?? 0), lineHeight: 1 }}>
              {cards?.cumplimientoSLA.porcentaje ?? 0}%
            </div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Meta: 90%</div>
          {!loading && cards?.cumplimientoSLA.deltaVsAnterior != null && (
            <div style={{ fontSize: '11px', color: (cards.cumplimientoSLA.deltaVsAnterior ?? 0) >= 0 ? '#3B6D11' : '#A32D2D' }}>
              {(cards.cumplimientoSLA.deltaVsAnterior ?? 0) >= 0 ? '↑' : '↓'} {Math.abs(cards.cumplimientoSLA.deltaVsAnterior ?? 0)}% vs período anterior
            </div>
          )}
          {!loading && (
            <ProgressBar value={cards?.cumplimientoSLA.porcentaje ?? 0} color={slaColor(cards?.cumplimientoSLA.porcentaje ?? 0)} />
          )}
          <div style={{ marginTop: 'auto', fontSize: '11px', color: '#185FA5', fontWeight: 500 }}>Ver detalle →</div>
        </Card>

        {/* CARD 5 — Costo estimado */}
        <Card onClick={() => toggle('costo')} isOpen={openCard === 'costo'}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)' }}>5. Costo estimado de indisponibilidad</span>
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
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
            Basado en horas de caída, venta promedio y margen
          </div>
          <div style={{ marginTop: 'auto', fontSize: '11px', color: '#185FA5', fontWeight: 500 }}>Ver detalle →</div>
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
                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', justifyContent: 'center' }}>
                  {tiendas.map((_, i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === rotatingIdx % tiendas.length ? '#A32D2D' : '#FCA5A5' }} />
                  ))}
                </div>
              </div>
            )
          })()}
          <div style={{ marginTop: 'auto', fontSize: '11px', color: '#185FA5', fontWeight: 500 }}>Ver detalle →</div>
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
          {loading ? <Sk w="60%" h={28} /> : (
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#EA580C', lineHeight: 1 }}>
              {cards?.proveedorCritico?.nombre ?? '—'}
            </div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
            {loading ? null : 'Mayor impacto operativo del período'}
          </div>
          {!loading && cards?.proveedorCritico && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <div style={{ flex: 1, height: '6px', background: 'linear-gradient(90deg,#3B6D11,#EAB308,#EA580C,#A32D2D)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${cards.proveedorCritico.score}%`, background: 'transparent' }} />
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#EA580C', whiteSpace: 'nowrap' }}>{cards.proveedorCritico.score}/100</span>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                · Mayor impacto operativo del período
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
                · Score de criticidad: {cards.proveedorCritico.score}/100
              </div>
            </>
          )}
          <div style={{ marginTop: 'auto', fontSize: '11px', color: '#185FA5', fontWeight: 500 }}>Ver detalle →</div>
        </Card>
      </div>

      {/* Panel detail */}
      {openCard === 'incidentes' && cards && (
        <Panel title="Incidentes del período" onClose={() => setOpenCard(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {cards.incidentes.lista.map((inc, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr auto', gap: '8px', padding: '7px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted-foreground)' }}>{inc.codigo}</span>
                <span style={{ fontSize: '12px' }}>{inc.proveedor}</span>
                <span style={{ fontSize: '12px' }}>{fmtTipo(inc.tipo)}</span>
                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: inc.estado === 'RESUELTO' ? '#EAF3DE' : '#E6F1FB', color: inc.estado === 'RESUELTO' ? '#3B6D11' : '#185FA5', whiteSpace: 'nowrap' }}>
                  {fmtEstado(inc.estado)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {openCard === 'tiendas' && cards && (
        <Panel title="Tiendas con incidentes" onClose={() => setOpenCard(null)}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {cards.tiendasAfectadas.lista.map((t) => (
              <span key={t.id} onClick={() => router.push(`/mantenimiento/${t.id}`)}
                style={{ padding: '4px 10px', background: '#E6F1FB', color: '#185FA5', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                {t.codigo}
              </span>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
            {cards.tiendasAfectadas.total} tiendas afectadas de 156 activas
          </div>
        </Panel>
      )}

      {openCard === 'mttr' && cards && (
        <Panel title="MTTR por proveedor" onClose={() => setOpenCard(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {cards.mttrPromedio.porProveedor.map((p, i) => {
              const b = mttrBadge(p.mttrMinutos)
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: '8px', padding: '7px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px' }}>{p.nombre}</span>
                  <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'monospace', color: b.color }}>{fmtMttr(p.mttrMinutos)}</span>
                  <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: b.bg, color: b.color, whiteSpace: 'nowrap' }}>{b.label}</span>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {openCard === 'sla' && cards && (
        <Panel title="SLA por proveedor" onClose={() => setOpenCard(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px auto', gap: '8px', padding: '0 0 8px 0', borderBottom: '0.5px solid var(--border)', marginBottom: '4px' }}>
            {['Proveedor', 'SLA%', 'Exceso prom', 'Estado'].map((h) => (
              <span key={h} style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
          {cards.cumplimientoSLA.porProveedor.map((p, i) => {
            const b = slaBadge(p.slaPct)
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px auto', gap: '8px', padding: '7px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: '12px' }}>{p.nombre}</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: b.color }}>{p.slaPct}%</span>
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                  {p.excessoPromMin > 0 ? `+${fmtMttr(p.excessoPromMin)}` : '—'}
                </span>
                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: b.bg, color: b.color, whiteSpace: 'nowrap' }}>{b.label}</span>
              </div>
            )
          })}
        </Panel>
      )}

      {openCard === 'costo' && cards && (
        <Panel title="Desglose de costo estimado" onClose={() => setOpenCard(null)}>
          <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '12px', marginBottom: '12px', display: 'grid', gridTemplateColumns: '1fr auto', rowGap: '4px', columnGap: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Venta afectada estimada:</span>
            <span style={{ fontSize: '12px', fontWeight: 500, textAlign: 'right' }}>{fmtCosto(cards.costoEstimado.ventaAfectadaTotal)}</span>
            <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Margen aplicado:</span>
            <span style={{ fontSize: '12px', fontWeight: 500, textAlign: 'right' }}>35%</span>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Costo estimado total:</span>
            <span style={{ fontSize: '12px', fontWeight: 600, textAlign: 'right' }}>{fmtCosto(cards.costoEstimado.total)}</span>
          </div>
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
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px' }}>Top tiendas por costo</div>
          {cards.costoEstimado.top5Tiendas.map((t, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto auto', gap: '8px', padding: '6px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 500 }}>{t.codigo}</span>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{t.proveedor} · {t.horas}h caída</span>
              <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'monospace' }}>{fmtCosto(t.costo)}</span>
            </div>
          ))}
        </Panel>
      )}

      {openCard === 'reincidencia' && cards && (
        <Panel title="Tiendas con reincidencia" onClose={() => setOpenCard(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 60px 1fr', gap: '8px', padding: '0 0 8px 0', borderBottom: '0.5px solid var(--border)', marginBottom: '4px' }}>
            {['Tienda', 'Proveedor', 'Caídas', 'Razón'].map((h) => (
              <span key={h} style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
          {cards.reincidenciaCritica.tiendas.map((t, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 60px 1fr', gap: '8px', padding: '7px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 500 }}>{t.codigo}</span>
              <span style={{ fontSize: '12px' }}>{t.proveedor}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: t.caidas >= 3 ? '#A32D2D' : '#854F0B' }}>{t.caidas}</span>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{t.razon}</span>
            </div>
          ))}
        </Panel>
      )}

      {openCard === 'proveedor' && cards?.proveedorCritico && (
        <Panel title={`${cards.proveedorCritico.nombre} es el más crítico`} onClose={() => setOpenCard(null)}>
          <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.6 }}>
            <strong>{cards.proveedorCritico.nombre}</strong> concentra el mayor impacto operativo del período por las siguientes razones:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
            <div style={{ fontSize: '12px' }}>✗ SLA: <strong>{cards.proveedorCritico.metricas.slaPct}%</strong> (meta: 90%)</div>
            <div style={{ fontSize: '12px' }}>✗ MTTR promedio: <strong>{fmtMttr(cards.proveedorCritico.metricas.mttrMinutos)}</strong></div>
            <div style={{ fontSize: '12px' }}>✗ Costo estimado: <strong>{fmtCosto(cards.proveedorCritico.metricas.costoEstimado)}</strong></div>
            <div style={{ fontSize: '12px' }}>⚠ Reincidencia: <strong>{cards.proveedorCritico.metricas.reincidenciaTiendas}</strong> tiendas afectadas</div>
            <div style={{ fontSize: '12px' }}>· Incidentes: <strong>{cards.proveedorCritico.metricas.incidentes}</strong> en el período</div>
          </div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Score breakdown</div>
          {[
            { label: 'Costo',         key: 'costo',       pts: cards.proveedorCritico.scoreBreakdown.costo },
            { label: 'SLA',           key: 'sla',         pts: cards.proveedorCritico.scoreBreakdown.sla },
            { label: 'MTTR',          key: 'mttr',        pts: cards.proveedorCritico.scoreBreakdown.mttr },
            { label: 'Reincidencia',  key: 'reincidencia',pts: cards.proveedorCritico.scoreBreakdown.reincidencia },
            { label: 'Cant. incid.',  key: 'incidentes',  pts: cards.proveedorCritico.scoreBreakdown.incidentes },
          ].map(({ label, pts }) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 40px', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px' }}>{label}</span>
              <div style={{ height: '4px', background: 'var(--muted)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '4px', width: `${pts}%`, background: '#EA580C', borderRadius: '2px' }} />
              </div>
              <span style={{ fontSize: '11px', fontWeight: 500, textAlign: 'right' }}>{pts}pts</span>
            </div>
          ))}
          <div style={{ borderTop: '0.5px solid var(--border)', marginTop: '4px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#EA580C' }}>{cards.proveedorCritico.score}/100</span>
          </div>
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

        {/* F-H — Placeholders */}
        {[
          { title: 'F. Impacto geográfico', desc: 'Concentración de incidentes e impacto económico por zona' },
          { title: 'G. Tendencia SLA últimos 6 meses', desc: 'Evolución mensual del cumplimiento SLA por proveedor' },
          { title: 'H. Insights y decisiones sugeridas', desc: 'Recomendaciones ejecutivas basadas en los datos del período' },
        ].map(({ title, desc }) => (
          <div key={title} style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{title}</div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '12px' }}>{desc}</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '24px 0' }}>
              <IconPlaceholder />
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>Próximamente</span>
            </div>
            <button disabled style={{ padding: '6px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'not-allowed', opacity: 0.4, background: 'var(--card)', color: 'var(--foreground)', alignSelf: 'flex-start' }}>
              Ver detalle
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
