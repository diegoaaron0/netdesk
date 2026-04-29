'use client'
import { useEffect, useState, useRef, useCallback } from 'react'

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
}
const TIPO_COLORS: Record<string, string> = {
  CAIDA_TOTAL: '#1E3A8A', INTERMITENCIA: '#378ADD',
  LENTITUD: '#85B7EB', POS: '#B5D4F4', OTROS: '#D3D1C7',
}
const ZONA_COLORS = ['#185FA5', '#534AB7', '#378ADD', '#EF9F27', '#85B7EB', '#9FE1CB']
const PROV_LINE_COLORS = ['#639922', '#1D9E75', '#185FA5', '#BA7517', '#E24B4A', '#A32D2D', '#854F0B']
const PROV_LINE_DASHES = [[], [4, 3], [2, 2], [6, 2], [2, 4], [8, 3], [4, 2]]

const PERIODS = [
  { label: 'Hoy', days: 0 },
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
  { label: '3 meses', days: 90 },
  { label: '6 meses', days: 180 },
]

function periodRange(days: number): { desde: string; hasta: string } {
  const hasta = new Date().toISOString()
  if (days === 0) {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    return { desde: d.toISOString(), hasta }
  }
  return { desde: new Date(Date.now() - days * 86400000).toISOString(), hasta }
}

function minToHM(min: number | null | undefined) {
  if (!min) return '—'
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function deltaPct(cur: number, prev: number) {
  if (!prev) return null
  return Math.round((cur - prev) / prev * 100)
}

function slaBadge(v: number | null) {
  if (v === null || v === undefined) return { bg: '#f5f5f3', color: '#888780', label: 'Sin datos' }
  if (v >= 80) return { bg: '#EAF3DE', color: '#3B6D11', label: 'OK' }
  if (v >= 60) return { bg: '#FAEEDA', color: '#854F0B', label: 'Lento' }
  return { bg: '#FCEBEB', color: '#A32D2D', label: 'Crítico' }
}

function costoBadge(v: number | null) {
  if (v === null || v === undefined) return { bg: '#f5f5f3', color: '#888780', label: 'Sin datos' }
  if (v < 8) return { bg: '#EAF3DE', color: '#3B6D11', label: 'Óptimo' }
  if (v < 20) return { bg: '#FAEEDA', color: '#854F0B', label: 'Revisar' }
  return { bg: '#FCEBEB', color: '#A32D2D', label: 'Crítico' }
}

function reincBadge(n: number) {
  if (n >= 3) return { bg: '#FCEBEB', color: '#A32D2D' }
  if (n >= 2) return { bg: '#FAEEDA', color: '#854F0B' }
  return { bg: '#E6F1FB', color: '#0C447C' }
}

const P: React.CSSProperties = {
  background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)',
  borderRadius: '12px', padding: '14px',
}
const PT: React.CSSProperties = {
  fontSize: '11px', fontWeight: 500, color: '#888780',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px',
}
const PS: React.CSSProperties = { fontSize: '10px', color: '#b4b2a9', marginBottom: '12px' }
const SEP: React.CSSProperties = { borderBottom: '0.5px solid rgba(0,0,0,0.08)' }

export default function ReportesPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [chartReady, setChartReady] = useState(false)
  const charts = useRef<Record<string, any>>({})

  useEffect(() => {
    if ((window as any).Chart) { setChartReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
    s.onload = () => setChartReady(true)
    document.head.appendChild(s)
    return () => { try { document.head.removeChild(s) } catch (_) {} }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { desde, hasta } = periodRange(days)
    const res = await fetch(`/api/reportes?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [days])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!chartReady || !data) return

    const Chart = (window as any).Chart
    function make(id: string, cfg: any) {
      if (charts.current[id]) { try { charts.current[id].destroy() } catch (_) {} }
      const el = document.getElementById(id) as HTMLCanvasElement | null
      if (!el) return
      charts.current[id] = new Chart(el, cfg)
    }

    // c1: Incidentes por día
    if (data.byDay?.length) {
      make('rpt-c1', {
        type: 'line',
        data: {
          labels: (data.byDay as any[]).map((d: any) => d.dia?.slice(5)),
          datasets: [{
            label: 'Incidentes', data: (data.byDay as any[]).map((d: any) => d.total),
            borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,0.08)',
            borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.3,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#888780', maxTicksLimit: 10 } },
            y: { grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 10 }, color: '#888780' }, beginAtZero: true },
          },
        },
      })
    }

    // c2: Distribución tipo (donut)
    if (data.byTipo?.length) {
      make('rpt-c2', {
        type: 'doughnut',
        data: {
          labels: (data.byTipo as any[]).map((t: any) => TIPO_LABELS[t.tipo] ?? t.tipo),
          datasets: [{
            data: (data.byTipo as any[]).map((t: any) => t.total),
            backgroundColor: (data.byTipo as any[]).map((t: any) => TIPO_COLORS[t.tipo] ?? '#D3D1C7'),
            borderWidth: 0,
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } },
      })
    }

    // c3: MTTR por proveedor (horizontal bar)
    if (data.mttrProveedor?.length) {
      const mp = data.mttrProveedor as any[]
      make('rpt-c3', {
        type: 'bar',
        data: {
          labels: mp.map((p: any) => p.nombre ?? '—'),
          datasets: [{
            data: mp.map((p: any) => Number(p.mttr_avg) || 0),
            backgroundColor: mp.map((p: any) => {
              const v = Number(p.mttr_avg) || 0
              return v < 120 ? '#639922' : v < 240 ? '#BA7517' : '#A32D2D'
            }),
            borderWidth: 0, borderRadius: 3,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx: any) => { const v = ctx.raw; const h = Math.floor(v / 60); const m = v % 60; return h > 0 ? `${h}h ${m}m` : `${m}m` } } },
          },
          scales: {
            x: { grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 10 }, color: '#888780', callback: (v: any) => { const h = Math.floor(v / 60); return h > 0 ? `${h}h` : `${v}m` } }, beginAtZero: true },
            y: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#444441' } },
          },
        },
      })
    }

    // cz: Incidentes por zona
    if (data.byZona?.length) {
      const bz = data.byZona as any[]
      make('rpt-cz', {
        type: 'bar',
        data: {
          labels: bz.map((z: any) => z.zona),
          datasets: [{ data: bz.map((z: any) => z.total), backgroundColor: ZONA_COLORS.slice(0, bz.length), borderWidth: 0, borderRadius: 3 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 10 }, color: '#888780' }, beginAtZero: true },
            y: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#444441' } },
          },
        },
      })
    }

    // cs: SLA tendencia (multi-line)
    if (data.slaTendencia?.length) {
      const st = data.slaTendencia as any[]
      const meses = [...new Set(st.map((r: any) => r.mes))].sort() as string[]
      const provs = [...new Set(st.map((r: any) => r.nombre))].filter(Boolean) as string[]
      const pivot: Record<string, Record<string, number>> = {}
      for (const r of st) { if (!pivot[r.mes]) pivot[r.mes] = {}; pivot[r.mes][r.nombre] = r.sla_pct }
      make('rpt-cs', {
        type: 'line',
        data: {
          labels: meses.map(m => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1).toLocaleDateString('es-PE', { month: 'short' }) }),
          datasets: provs.map((p, i) => ({
            label: p, data: meses.map(m => pivot[m]?.[p] ?? null),
            borderColor: PROV_LINE_COLORS[i % PROV_LINE_COLORS.length], backgroundColor: 'transparent',
            borderWidth: 2, pointRadius: 3, tension: 0.3,
            borderDash: PROV_LINE_DASHES[i] || [], spanGaps: true,
          })),
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#444441', autoSkip: false } },
            y: { grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 10 }, color: '#888780', callback: (v: any) => `${v}%` }, min: 0, max: 100 },
          },
        },
      })
    }

    // c4: MTTR Lima vs Provincia por mes (grouped bar)
    if (data.mttrZonaMes?.length) {
      const mz = data.mttrZonaMes as any[]
      const meses = [...new Set(mz.map((r: any) => r.mes))].sort() as string[]
      const zones = [...new Set(mz.map((r: any) => r.zona))] as string[]
      const pivot: Record<string, Record<string, number>> = {}
      for (const r of mz) { if (!pivot[r.mes]) pivot[r.mes] = {}; pivot[r.mes][r.zona] = r.mttr_avg }
      const zc: Record<string, string> = { Lima: '#378ADD', Provincia: '#EF9F27' }
      make('rpt-c4', {
        type: 'bar',
        data: {
          labels: meses.map(m => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1).toLocaleDateString('es-PE', { month: 'short' }) }),
          datasets: zones.map(z => ({
            label: z, data: meses.map(m => pivot[m]?.[z] ?? null),
            backgroundColor: zc[z] ?? '#185FA5', borderWidth: 0, borderRadius: 3,
          })),
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx: any) => { const v = ctx.raw; if (!v) return ''; const h = Math.floor(v / 60); const m = v % 60; return `${ctx.dataset.label}: ${h > 0 ? `${h}h ${m}m` : `${m}m`}` } } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#444441' } },
            y: { grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 10 }, color: '#888780', callback: (v: any) => { const h = Math.floor(v / 60); return h > 0 ? `${h}h` : `${v}m` } }, beginAtZero: true },
          },
        },
      })
    }

    return () => { Object.values(charts.current).forEach((c: any) => { try { c.destroy() } catch (_) {} }); charts.current = {} }
  }, [chartReady, data])

  function exportCSV() {
    const { desde, hasta } = periodRange(days)
    const params = new URLSearchParams({ desde, hasta })
    window.open(`/api/reportes/export?${params}`, '_blank')
  }

  const tot = data?.totales ?? {}
  const dTotal = tot.prevTotal ? deltaPct(tot.total, tot.prevTotal) : null
  const dMttr = tot.prevMttrAvg && tot.mttrAvg ? deltaPct(tot.prevMttrAvg, tot.mttrAvg) : null // inverted: lower MTTR is better

  const provsTend = data?.slaTendencia?.length
    ? [...new Set((data.slaTendencia as any[]).map((r: any) => r.nombre))].filter(Boolean) as string[]
    : []

  // Max costo for bar widths
  const maxCosto = Math.max(...((data?.costoProveedor ?? []) as any[]).map((p: any) => p.costo ?? 0), 1)
  const maxZona = Math.max(...((data?.byZona ?? []) as any[]).map((z: any) => z.total ?? 0), 1)

  const mttrLima = tot ? Number(data?.mttrZonaLatest?.['Lima'] || 0) : 0
  const mttrProv = tot ? Number(data?.mttrZonaLatest?.['Provincia'] || 0) : 0

  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', color: '#2c2c2a' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 500 }}>Reportes</div>
          <div style={{ fontSize: '11px', color: '#888780', marginTop: '2px' }}>Análisis ejecutivo · Supervisor / Gerencia</div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => setDays(p.days)}
              style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: days === p.days ? 500 : 400, border: days === p.days ? 'none' : '0.5px solid #d3d1c7', background: days === p.days ? '#1e3a8a' : '#fff', color: days === p.days ? '#fff' : '#2c2c2a' }}>
              {p.label}
            </button>
          ))}
          <button onClick={exportCSV}
            style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '6px', border: '0.5px solid #d3d1c7', background: '#fff', cursor: 'pointer' }}>
            Exportar CSV
          </button>
        </div>
      </div>

      {loading && !data && (
        <div style={{ padding: '60px', textAlign: 'center', fontSize: '12px', color: '#888780' }}>Cargando...</div>
      )}

      {data && (
        <>
          {/* ── KPI row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '14px' }}>
            {[
              {
                label: 'Incidentes', val: tot.total,
                delta: dTotal !== null ? (dTotal >= 0 ? `+${dTotal}% vs período anterior` : `${dTotal}% vs período anterior`) : null,
                cls: dTotal !== null ? (dTotal > 0 ? '#A32D2D' : '#3B6D11') : '#888780',
              },
              {
                label: 'MTTR promedio', val: minToHM(tot.mttrAvg),
                delta: dMttr !== null ? (dMttr > 0 ? `Mejor en ${Math.abs(tot.mttrAvg - tot.prevMttrAvg)}m` : `Peor en ${Math.abs(tot.mttrAvg - tot.prevMttrAvg)}m`) : null,
                cls: dMttr !== null ? (dMttr > 0 ? '#3B6D11' : '#A32D2D') : '#888780',
              },
              {
                label: 'Cumplimiento SLA', val: `${tot.slaPct ?? 0}%`,
                delta: 'Meta: 90%',
                cls: (tot.slaPct ?? 0) >= 90 ? '#3B6D11' : '#A32D2D',
              },
              {
                label: 'Tiendas afectadas', val: tot.tiendas ?? 0,
                delta: null, cls: '#888780',
              },
            ].map(k => (
              <div key={k.label} style={{ background: '#ededeb', borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', color: '#888780', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>{k.label}</div>
                <div style={{ fontSize: '24px', fontWeight: 500, lineHeight: 1.1 }}>{k.val}</div>
                {k.delta && <div style={{ fontSize: '11px', marginTop: '3px', color: k.cls }}>{k.delta}</div>}
              </div>
            ))}
          </div>

          {/* ── Incidentes por día ── */}
          <div style={{ ...P, marginBottom: '10px' }}>
            <div style={PT}>Incidentes por día</div>
            <div style={PS}>Período seleccionado</div>
            {data.byDay?.length > 0
              ? <div style={{ position: 'relative', width: '100%', height: '140px' }}><canvas id="rpt-c1" /></div>
              : <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#888780' }}>Sin datos</div>
            }
          </div>

          {/* ── MTTR + Tipo ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div style={P}>
              <div style={PT}>MTTR por proveedor</div>
              <div style={PS}>Tiempo promedio de resolución</div>
              {data.mttrProveedor?.length > 0
                ? <div style={{ position: 'relative', width: '100%', height: '200px' }}><canvas id="rpt-c3" /></div>
                : <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#888780' }}>Sin datos</div>
              }
            </div>
            <div style={P}>
              <div style={PT}>Distribución por tipo</div>
              <div style={PS}>Porcentaje por categoría</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                {(data.byTipo as any[]).map((t: any) => (
                  <span key={t.tipo} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#888780' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: TIPO_COLORS[t.tipo] ?? '#D3D1C7', flexShrink: 0, display: 'inline-block' }} />
                    {TIPO_LABELS[t.tipo] ?? t.tipo} {Math.round(t.total / Math.max(data.byTipo.reduce((s: number, x: any) => s + x.total, 0), 1) * 100)}%
                  </span>
                ))}
              </div>
              {data.byTipo?.length > 0
                ? <div style={{ position: 'relative', width: '100%', height: '150px' }}><canvas id="rpt-c2" /></div>
                : <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#888780' }}>Sin datos</div>
              }
            </div>
          </div>

          {/* ── SLA + Top tiendas ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            {/* SLA por proveedor */}
            <div style={P}>
              <div style={PT}>Cumplimiento SLA por proveedor</div>
              <div style={PS}>% incidentes resueltos dentro de 4 horas</div>
              {(data.slaProveedor as any[]).length === 0 && (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#888780' }}>Sin datos</div>
              )}
              {(data.slaProveedor as any[]).map((p: any) => {
                const b = slaBadge(p.sla_pct)
                return (
                  <div key={p.nombre} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', ...SEP }}>
                    <div style={{ fontSize: '12px' }}>{p.nombre ?? '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '100px', height: '5px', background: '#e5e3db', borderRadius: '3px', overflow: 'hidden', margin: '0 10px' }}>
                        <div style={{ height: '5px', borderRadius: '3px', width: `${p.sla_pct ?? 0}%`, background: (p.sla_pct ?? 0) >= 80 ? '#639922' : (p.sla_pct ?? 0) >= 60 ? '#BA7517' : '#A32D2D' }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 500, width: '32px', textAlign: 'right' }}>{p.sla_pct ?? 0}%</span>
                      <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '4px', marginLeft: '8px', background: b.bg, color: b.color }}>{b.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Top 10 tiendas */}
            <div style={P}>
              <div style={PT}>Top 10 tiendas con más incidentes</div>
              <div style={PS}>Período seleccionado</div>
              {(data.topTiendas as any[]).length === 0 && (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#888780' }}>Sin datos</div>
              )}
              {(data.topTiendas as any[]).map((t: any, idx: number) => {
                const color = idx === 0 ? '#854F0B' : idx === 1 ? '#854F0B' : '#888780'
                return (
                  <div key={t.codigo ?? idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', ...SEP }}>
                    <span style={{ width: '16px', fontSize: '11px', fontWeight: 500, color: '#b4b2a9', flexShrink: 0 }}>{idx + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px' }}>{t.codigo} — {t.nombre}</div>
                      <div style={{ fontSize: '10px', color: '#b4b2a9' }}>{t.proveedor} · {t.distrito}</div>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'monospace', color }}>{t.total}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Costo + Reincidencia ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            {/* Costo de indisponibilidad */}
            <div style={P}>
              <div style={PT}>Costo de indisponibilidad por proveedor</div>
              <div style={PS}>S/ por hora de caída real</div>
              {(data.costoProveedor as any[]).length === 0 && (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#888780' }}>Sin datos</div>
              )}
              {(data.costoProveedor as any[]).map((p: any) => {
                const b = costoBadge(p.costo)
                const barPct = maxCosto > 0 ? Math.round((p.costo ?? 0) / maxCosto * 100) : 0
                return (
                  <div key={p.nombre} style={{ display: 'flex', alignItems: 'center', padding: '7px 0', gap: '8px', ...SEP }}>
                    <span style={{ fontSize: '12px', width: '80px', flexShrink: 0 }}>{p.nombre}</span>
                    <div style={{ flex: 1, height: '5px', background: '#e5e3db', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '5px', borderRadius: '3px', width: `${barPct}%`, background: b.color === '#3B6D11' ? '#639922' : b.color === '#854F0B' ? '#BA7517' : '#A32D2D' }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'monospace', width: '60px', textAlign: 'right', flexShrink: 0, color: b.color }}>
                      {p.costo !== null ? `S/${p.costo}/h` : '—'}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '4px', flexShrink: 0, background: b.bg, color: b.color }}>{b.label}</span>
                  </div>
                )
              })}
              {data.costoProveedor?.length > 1 && (() => {
                const sorted = [...(data.costoProveedor as any[])].filter((p: any) => p.costo).sort((a: any, b: any) => b.costo - a.costo)
                const worst = sorted[0]; const best = sorted[sorted.length - 1]
                if (!worst || !best || worst.nombre === best.nombre) return null
                return (
                  <div style={{ background: '#f5f5f3', borderRadius: '8px', padding: '8px 10px', marginTop: '10px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 500, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>Insight</div>
                    <div style={{ fontSize: '11px', lineHeight: 1.5 }}>
                      {worst.nombre} (S/{worst.costo}/h) es {Math.round(worst.costo / best.costo)}x más caro que {best.nombre} (S/{best.costo}/h) en costo real por caída.
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Reincidencia */}
            <div style={P}>
              <div style={PT}>Reincidencia por tienda</div>
              <div style={PS}>Tiendas con más de 1 incidente en el período</div>
              {(data.reincidencia as any[]).length === 0 && (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#888780' }}>Sin reincidencias</div>
              )}
              {(data.reincidencia as any[]).map((t: any, idx: number) => {
                const b = reincBadge(t.incidentes)
                return (
                  <div key={t.codigo ?? idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', ...SEP }}>
                    <span style={{ width: '16px', fontSize: '11px', fontWeight: 500, color: '#b4b2a9', flexShrink: 0 }}>{idx + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px' }}>{t.codigo} — {t.nombre}</div>
                      <div style={{ fontSize: '10px', color: '#b4b2a9' }}>{t.proveedor} · {t.distrito}</div>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '4px', background: b.bg, color: b.color }}>
                      {t.incidentes} caídas
                    </span>
                  </div>
                )
              })}
              {data.reincidencia?.length > 0 && (() => {
                const top = (data.reincidencia as any[])[0]
                return (
                  <div style={{ background: '#f5f5f3', borderRadius: '8px', padding: '8px 10px', marginTop: '10px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 500, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>Insight</div>
                    <div style={{ fontSize: '11px', lineHeight: 1.5 }}>
                      {top.codigo} con {top.incidentes} caídas sugiere problema estructural — revisar router o cambio de proveedor.
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* ── Zona + SLA tendencia ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            {/* Zona geográfica */}
            <div style={P}>
              <div style={PT}>Incidentes por zona geográfica</div>
              <div style={PS}>Distribución del período</div>
              {data.byZona?.length > 0
                ? <div style={{ position: 'relative', width: '100%', height: '180px', marginBottom: '10px' }}><canvas id="rpt-cz" /></div>
                : <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#888780' }}>Sin datos</div>
              }
              {(data.byZona as any[]).map((z: any, i: number) => {
                const total = (data.byZona as any[]).reduce((s: number, x: any) => s + x.total, 0)
                return (
                  <div key={z.zona} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', ...SEP }}>
                    <span style={{ fontSize: '12px', width: '110px', flexShrink: 0 }}>{z.zona}</span>
                    <div style={{ flex: 1, height: '6px', background: '#e5e3db', borderRadius: '3px', overflow: 'hidden', margin: '0 10px' }}>
                      <div style={{ height: '6px', borderRadius: '3px', width: `${Math.round(z.total / maxZona * 100)}%`, background: ZONA_COLORS[i % ZONA_COLORS.length] }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'monospace', width: '24px', textAlign: 'right' }}>{z.total}</span>
                    <span style={{ fontSize: '10px', color: '#888780', width: '30px', textAlign: 'right' }}>{Math.round(z.total / Math.max(total, 1) * 100)}%</span>
                  </div>
                )
              })}
            </div>

            {/* SLA tendencia */}
            <div style={P}>
              <div style={PT}>Tendencia SLA — últimos 6 meses</div>
              <div style={PS}>Cumplimiento mensual · línea punteada = meta 90%</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                {provsTend.map((p, i) => (
                  <span key={p} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#888780' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: PROV_LINE_COLORS[i % PROV_LINE_COLORS.length], flexShrink: 0, display: 'inline-block' }} />
                    {p}
                  </span>
                ))}
              </div>
              {data.slaTendencia?.length > 0
                ? <div style={{ position: 'relative', width: '100%', height: '200px' }}><canvas id="rpt-cs" /></div>
                : <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#888780' }}>Sin datos históricos</div>
              }
            </div>
          </div>

          {/* ── MTTR Lima vs Provincia ── */}
          <div style={P}>
            <div style={PT}>MTTR Lima vs Provincia</div>
            <div style={PS}>Tiempo promedio de resolución por ubicación · últimos 3 meses</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', alignItems: 'center' }}>
              {data.mttrZonaMes?.length > 0
                ? <div style={{ position: 'relative', width: '100%', height: '160px' }}><canvas id="rpt-c4" /></div>
                : <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#888780' }}>Sin datos</div>
              }
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { label: 'Lima', val: minToHM(mttrLima), color: '#185FA5' },
                  { label: 'Provincia', val: minToHM(mttrProv), color: '#854F0B' },
                ].map(z => (
                  <div key={z.label} style={{ background: '#f5f5f3', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#888780', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>{z.label}</div>
                    <div style={{ fontSize: '22px', fontWeight: 500, color: z.color }}>{z.val}</div>
                    <div style={{ fontSize: '10px', color: '#b4b2a9', marginTop: '2px' }}>promedio MTTR</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
