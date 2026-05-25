'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ── Date helpers ────────────────────────────────────────────────────────────────
function todayStr()                    { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number)            { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10) }
function firstOfMonth(d = new Date())  { return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }
function lastOfMonth(d = new Date())   { return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) }
function prevMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return { desde: firstOfMonth(d), hasta: lastOfMonth(d) }
}
function fmtMes(ym: string) {
  const [y, m] = ym.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[Number(m) - 1]} ${y.slice(2)}`
}

// ── Format helpers ───────────────────────────────────────────────────────────────
function fmtMin(m: number | null) {
  if (!m) return '—'
  const h = Math.floor(m / 60), min = m % 60
  return h > 0 ? `${h}h ${min}m` : `${min}m`
}
function slaColor(pct: number) {
  if (pct >= 85) return '#22c55e'
  if (pct >= 70) return '#f59e0b'
  return '#ef4444'
}
function mttrColor(m: number) {
  if (m <= 60) return '#22c55e'
  if (m <= 120) return '#f59e0b'
  return '#ef4444'
}
function triggerBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Constants ────────────────────────────────────────────────────────────────────
const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia', LENTITUD: 'Lentitud',
  POS: 'POS', CORTE_ELECTRICO: 'Corte eléctrico', OTRO: 'Otro',
}
const TIPO_COLORS: Record<string, string> = {
  CAIDA_TOTAL: '#dc2626', INTERMITENCIA: '#f59e0b', LENTITUD: '#3b82f6',
  POS: '#8b5cf6', CORTE_ELECTRICO: '#fb923c', OTRO: '#9ca3af',
}
const EXPORT_CARDS = [
  { id: 'gerencial',   titulo: 'Reporte Gerencial',       icono: '🏢', color: '#185FA5', bg: '#E6F1FB', desc: 'KPIs ejecutivos · SLA por proveedor · Top 15 tiendas · Distribución por tipo', path: '/api/reportes/export/gerencial' },
  { id: 'proveedores', titulo: 'Seguimiento Proveedores',  icono: '📋', color: '#1D9E75', bg: '#EAF3DE', desc: 'SLA% · MTTR · Escalamientos · Detalle por tienda · IEI estimado',              path: '/api/reportes/export/proveedores' },
  { id: 'operativos',  titulo: 'Incidentes Operativos',    icono: '📁', color: '#854F0B', bg: '#FAEEDA', desc: 'Historial completo · N1/N2/N3 · Atribución · SLA resolución/respuesta · IEI',   path: '/api/reportes/export' },
]

// ── Sub-components ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, prev, unit = '', good, note }: {
  label: string; value: number | string; prev?: number | null; unit?: string; good?: boolean; note?: string
}) {
  const showDelta = typeof value === 'number' && typeof prev === 'number' && prev > 0
  const pct = showDelta ? Math.round(((value as number) - prev!) / prev! * 100) : 0
  const up = pct > 0
  const deltaGood = good !== undefined ? (good ? up : !up) : null

  return (
    <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '13px 15px' }}>
      <div style={{ fontSize: '19px', fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.2 }}>
        {typeof value === 'number' ? value.toLocaleString('es-PE') : value}
        {unit && <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: '3px' }}>{unit}</span>}
        {note && <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: '4px' }}>{note}</span>}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      {showDelta && (
        <div style={{ fontSize: '10px', marginTop: '5px', color: deltaGood === null ? 'var(--muted-foreground)' : deltaGood ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
          {up ? '▲' : '▼'} {Math.abs(pct)}% vs período anterior
        </div>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      {children}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────────
export default function ReportesPage() {
  const router = useRouter()
  const [desde, setDesde] = useState(firstOfMonth())
  const [hasta, setHasta] = useState(todayStr())
  const [data,  setData]  = useState<any>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [dlLoading, setDlLoading] = useState<Record<string, boolean>>({})
  const [dlErrors,  setDlErrors]  = useState<Record<string, string>>({})

  function setQuick(d: string, h: string) { setDesde(d); setHasta(h) }

  const fetchData = useCallback(async () => {
    setLoadingData(true)
    try {
      const res = await fetch(`/api/reportes?desde=${desde}&hasta=${hasta}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoadingData(false)
    }
  }, [desde, hasta])

  useEffect(() => { fetchData() }, [fetchData])

  async function download(id: string, path: string) {
    setDlLoading(l => ({ ...l, [id]: true }))
    setDlErrors(e => ({ ...e, [id]: '' }))
    try {
      const res = await fetch(`${path}?desde=${desde}&hasta=${hasta}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      triggerBlob(blob, match ? match[1] : `reporte_${id}.csv`)
    } catch {
      setDlErrors(e => ({ ...e, [id]: 'Error al generar' }))
    } finally {
      setDlLoading(l => ({ ...l, [id]: false }))
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────────
  const tot: any      = data?.totales   ?? {}
  const byDay: any[]  = data?.byDay     ?? []
  const byTipo: any[] = data?.byTipo    ?? []
  const slaProv: any[]  = data?.slaProveedor  ?? []
  const mttrProv: any[] = data?.mttrProveedor ?? []
  const topT: any[]     = data?.topTiendas    ?? []
  const reinc: any[]    = data?.reincidencia  ?? []
  const byZona: any[]   = data?.byZona        ?? []
  const slaTend: any[]  = data?.slaTendencia  ?? []

  const maxDay   = Math.max(...byDay.map(d => Number(d.total)),   1)
  const maxTipo  = Math.max(...byTipo.map(t => Number(t.total)),  1)
  const maxZona  = Math.max(...byZona.map(z => Number(z.total)),  1)
  const maxMttrProv = Math.max(...mttrProv.map(p => Number(p.mttr_avg) || 0), 1)

  // SLA tendencia: pivot to {proveedor: {mes: pct}}
  const slaProveedores = [...new Set(slaTend.map((r: any) => r.nombre))].filter(Boolean)
  const slaMeses = [...new Set(slaTend.map((r: any) => r.mes))].sort()
  const slaMap: Record<string, Record<string, number>> = {}
  for (const r of slaTend) {
    if (!slaMap[r.nombre]) slaMap[r.nombre] = {}
    slaMap[r.nombre][r.mes] = Number(r.sla_pct) || 0
  }

  const showChart = byDay.length > 0 || byTipo.length > 0

  return (
    <div>
      {/* ── Period selector ──────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>Período de análisis</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                style={{ padding: '6px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
              <span style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>—</span>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                style={{ padding: '6px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {([
              ['Este mes',  () => setQuick(firstOfMonth(), todayStr())],
              ['Mes ant.',  () => { const p = prevMonth(); setQuick(p.desde, p.hasta) }],
              ['30 días',   () => setQuick(daysAgo(30),  todayStr())],
              ['90 días',   () => setQuick(daysAgo(90),  todayStr())],
              ['6 meses',   () => setQuick(daysAgo(180), todayStr())],
            ] as [string, () => void][]).map(([label, fn]) => (
              <button key={label} onClick={fn}
                style={{ padding: '5px 10px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--muted)', color: 'var(--foreground)', cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>
          {loadingData && (
            <div style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--muted-foreground)', alignSelf: 'center' }}>Actualizando...</div>
          )}
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', marginBottom: '16px' }}>
        <KpiCard label="Incidentes" value={tot.total ?? 0} prev={tot.prevTotal} good={false} />
        <KpiCard label="MTTR promedio" value={fmtMin(tot.mttrAvg ?? 0)} prev={null} />
        <KpiCard label="Cumplimiento SLA" value={`${tot.slaPct ?? 0}%`} prev={null} />
        <KpiCard label="Tiendas afectadas" value={tot.tiendas ?? 0} prev={null} />
        <KpiCard label="IEI estimado" value={`S/ ${(tot.ieiTotal ?? 0).toLocaleString('es-PE')}`} prev={null} note="est." />
      </div>

      {/* ── Row: MTTR + SLA comparison badges ────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${mttrColor(tot.mttrAvg ?? 0)}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: mttrColor(tot.mttrAvg ?? 0) }} />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: mttrColor(tot.mttrAvg ?? 0) }}>{fmtMin(tot.mttrAvg ?? 0)}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>MTTR · período actual</div>
            {tot.prevMttrAvg > 0 && (
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
                anterior: {fmtMin(tot.prevMttrAvg)} · <span style={{ color: tot.mttrAvg <= tot.prevMttrAvg ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                  {tot.mttrAvg <= tot.prevMttrAvg ? '▼' : '▲'} {Math.abs(tot.mttrAvg - tot.prevMttrAvg)} min
                </span>
              </div>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${slaColor(tot.slaPct ?? 0)}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: slaColor(tot.slaPct ?? 0) }} />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: slaColor(tot.slaPct ?? 0) }}>{tot.slaPct ?? 0}%</div>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>SLA resolución · período actual</div>
            {tot.prevSlaPct > 0 && (
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
                anterior: {tot.prevSlaPct}% · <span style={{ color: (tot.slaPct ?? 0) >= tot.prevSlaPct ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                  {(tot.slaPct ?? 0) >= tot.prevSlaPct ? '▲' : '▼'} {Math.abs((tot.slaPct ?? 0) - tot.prevSlaPct)} pp
                </span>
              </div>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: '16px' }}>S/</div>
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#8b5cf6' }}>
              {(tot.ieiTotal ?? 0).toLocaleString('es-PE')}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>Impacto económico estimado</div>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>IEI = venta/h × (MTTR/60) × 0.35 × factor tipo</div>
          </div>
        </div>
      </div>

      {/* ── Tendencia diaria + Por tipo ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '12px', marginBottom: '12px' }}>

        {/* Daily chart */}
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <SectionTitle>Incidentes por día</SectionTitle>
          {byDay.length === 0 ? (
            <div style={{ height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>
              Sin datos para este período
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '90px' }}>
                {byDay.map((d: any) => (
                  <div key={d.dia} title={`${d.dia.slice(5).replace('-','/')}: ${d.total} incidentes`}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <div style={{
                      width: '100%', minWidth: '2px',
                      height: `${Math.max(Number(d.total) / maxDay * 100, Number(d.total) > 0 ? 5 : 0)}%`,
                      background: Number(d.total) > (maxDay * 0.7) ? '#dc2626' : '#3b82f6',
                      borderRadius: '2px 2px 0 0',
                    }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '10px', color: 'var(--muted-foreground)' }}>
                <span>{byDay[0]?.dia?.slice(5).replace('-', '/')}</span>
                {byDay.length > 14 && <span>{byDay[Math.floor(byDay.length / 2)]?.dia?.slice(5).replace('-', '/')}</span>}
                <span>{byDay[byDay.length - 1]?.dia?.slice(5).replace('-', '/')}</span>
              </div>
              <div style={{ marginTop: '8px', display: 'flex', gap: '12px', fontSize: '10px', color: 'var(--muted-foreground)' }}>
                <span>Total: <strong style={{ color: 'var(--foreground)' }}>{tot.total}</strong></span>
                <span>Pico: <strong style={{ color: 'var(--foreground)' }}>{maxDay}</strong> en un día</span>
              </div>
            </>
          )}
        </div>

        {/* By tipo */}
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <SectionTitle>Por tipo</SectionTitle>
          {byTipo.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '20px 0' }}>Sin datos</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {byTipo.map((t: any) => {
                const pct = tot.total > 0 ? Math.round(Number(t.total) / tot.total * 100) : 0
                return (
                  <div key={t.tipo}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--foreground)' }}>{TIPO_LABELS[t.tipo] ?? t.tipo}</span>
                      <span style={{ fontSize: '11px', fontWeight: 700 }}>{t.total} <span style={{ fontWeight: 400, color: 'var(--muted-foreground)' }}>({pct}%)</span></span>
                    </div>
                    <div style={{ height: '7px', background: 'var(--muted)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Number(t.total) / maxTipo * 100}%`, background: TIPO_COLORS[t.tipo] ?? '#9ca3af', borderRadius: '4px' }} />
                    </div>
                    {t.mttr_avg && (
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>MTTR: {fmtMin(Number(t.mttr_avg))}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── SLA% + MTTR por proveedor ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>

        {/* SLA por proveedor */}
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <SectionTitle>SLA% por proveedor</SectionTitle>
          {slaProv.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '20px 0' }}>Sin datos</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {slaProv.map((p: any) => {
                const pct = Number(p.sla_pct) || 0
                return (
                  <div key={p.nombre}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--foreground)' }}>{p.nombre ?? '—'}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: slaColor(pct) }}>{pct}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--muted)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: slaColor(pct), borderRadius: '4px', transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '3px' }}>
                      {p.total} incidentes totales
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* MTTR por proveedor */}
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <SectionTitle>MTTR por proveedor <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--muted-foreground)' }}>(solo resueltos)</span></SectionTitle>
          {mttrProv.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '20px 0' }}>Sin datos</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {mttrProv.map((p: any) => {
                const m = Number(p.mttr_avg) || 0
                return (
                  <div key={p.nombre}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--foreground)' }}>{p.nombre ?? '—'}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: mttrColor(m) }}>{fmtMin(m)}</span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--muted)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${m / maxMttrProv * 100}%`, background: mttrColor(m), borderRadius: '4px', transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '3px' }}>
                      {p.total} resueltos · {p.tiendas_afectadas} tiendas
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Top tiendas ───────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <SectionTitle>Top tiendas más afectadas</SectionTitle>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>IEI es estimado (fórmula simplificada)</div>
        </div>
        {topT.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '24px' }}>Sin datos</div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: 'var(--muted)' }}>
                  {['#', 'Código', 'Nombre CC', 'Distrito', 'Proveedor', 'Inc.', 'MTTR prom.', 'IEI est. S/'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '10px', borderBottom: '0.5px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topT.map((t: any, i: number) => (
                  <tr key={t.codigo}
                    onClick={() => router.push(`/tiendas?q=${t.codigo}`)}
                    style={{ borderBottom: '0.5px solid var(--border)', cursor: 'pointer', background: i < 3 ? 'rgba(220,38,38,0.03)' : 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = i < 3 ? 'rgba(220,38,38,0.03)' : 'transparent')}>
                    <td style={{ padding: '9px 10px', fontWeight: 700, color: i === 0 ? '#dc2626' : i === 1 ? '#ea580c' : i === 2 ? '#ca8a04' : 'var(--muted-foreground)' }}>{i + 1}</td>
                    <td style={{ padding: '9px 10px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--foreground)' }}>{t.codigo}</td>
                    <td style={{ padding: '9px 10px', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--foreground)' }}>{t.nombre ?? '—'}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{t.distrito ?? '—'}</td>
                    <td style={{ padding: '9px 10px' }}>
                      {t.proveedor && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--muted)', fontWeight: 600 }}>{t.proveedor}</span>}
                    </td>
                    <td style={{ padding: '9px 10px', fontWeight: 700, color: '#dc2626', textAlign: 'center' }}>{t.total}</td>
                    <td style={{ padding: '9px 10px', color: t.mttr_avg ? mttrColor(Number(t.mttr_avg)) : 'var(--muted-foreground)', fontWeight: 600 }}>{fmtMin(Number(t.mttr_avg) || 0)}</td>
                    <td style={{ padding: '9px 10px', fontWeight: 600, color: '#8b5cf6' }}>
                      {Number(t.iei_acumulado) > 0 ? Number(t.iei_acumulado).toLocaleString('es-PE') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Reincidencia + Por zona ───────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: '12px', marginBottom: '12px' }}>

        {/* Reincidencia */}
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <SectionTitle>Tiendas reincidentes</SectionTitle>
            <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>más de 1 incidente en el período</span>
          </div>
          {reinc.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#22c55e', textAlign: 'center', padding: '16px', fontWeight: 500 }}>
              Sin reincidencias en el período
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {reinc.map((r: any) => (
                <div key={r.codigo}
                  onClick={() => router.push(`/tiendas?q=${r.codigo}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--muted)', borderRadius: '8px', cursor: 'pointer' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', minWidth: '48px', color: 'var(--foreground)' }}>{r.codigo}</span>
                  <span style={{ fontSize: '11px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted-foreground)' }}>{r.nombre}</span>
                  {r.proveedor && <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'var(--card)', fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--foreground)' }}>{r.proveedor}</span>}
                  <span style={{ fontWeight: 700, color: '#dc2626', fontSize: '13px', minWidth: '18px', textAlign: 'right' }}>{r.incidentes}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Por zona */}
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <SectionTitle>Por zona Lima</SectionTitle>
          {byZona.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '20px 0' }}>Sin datos</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {byZona.map((z: any) => (
                <div key={z.zona}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--foreground)' }}>{z.zona}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--foreground)' }}>{z.total}</span>
                  </div>
                  <div style={{ height: '7px', background: 'var(--muted)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Number(z.total) / maxZona * 100}%`, background: '#3b82f6', borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── SLA tendencia 6 meses ─────────────────────────────────────────────── */}
      {slaTend.length > 0 && slaMeses.length > 1 && (
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <SectionTitle>Tendencia SLA — últimos 6 meses</SectionTitle>
            <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>ventana fija, independiente del período seleccionado</span>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '11px', minWidth: '100%' }}>
              <thead>
                <tr style={{ background: 'var(--muted)' }}>
                  <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)', borderBottom: '0.5px solid var(--border)', whiteSpace: 'nowrap' }}>Proveedor</th>
                  {slaMeses.map(m => (
                    <th key={m} style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--muted-foreground)', borderBottom: '0.5px solid var(--border)', whiteSpace: 'nowrap' }}>{fmtMes(m)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slaProveedores.map(prov => (
                  <tr key={prov} style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>{prov}</td>
                    {slaMeses.map(m => {
                      const v = slaMap[prov]?.[m]
                      return (
                        <td key={m} style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {v != null ? (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: slaColor(v),
                              background: `${slaColor(v)}18`, padding: '2px 7px', borderRadius: '4px' }}>
                              {v}%
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Export section ────────────────────────────────────────────────────── */}
      <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: '20px', marginTop: '4px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          Exportar reportes · período: {desde} → {hasta}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {EXPORT_CARDS.map(card => (
            <div key={card.id} style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                  {card.icono}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: card.color }}>{card.titulo}</div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', flex: 1, lineHeight: 1.5 }}>{card.desc}</div>
              {dlErrors[card.id] && <div style={{ fontSize: '11px', color: '#ef4444' }}>{dlErrors[card.id]}</div>}
              <button
                disabled={dlLoading[card.id]}
                onClick={() => download(card.id, card.path)}
                style={{ padding: '8px 0', borderRadius: '7px', border: 'none', background: dlLoading[card.id] ? 'var(--muted)' : card.color, color: dlLoading[card.id] ? 'var(--muted-foreground)' : 'white', fontSize: '12px', fontWeight: 600, cursor: dlLoading[card.id] ? 'not-allowed' : 'pointer' }}>
                {dlLoading[card.id] ? 'Generando...' : '↓ Descargar CSV'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
