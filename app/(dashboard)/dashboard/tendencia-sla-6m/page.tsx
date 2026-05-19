'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, ResponsiveContainer, Tooltip,
} from 'recharts'
import type { SLATrendResponse, PuntoTendencia, ResumenProveedor, MesCritico } from '@/types/sla-trend'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sixMonthsAgo() {
  const d = new Date(); d.setMonth(d.getMonth() - 6); d.setDate(1); d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}
function todayStr() { return new Date().toISOString().split('T')[0] }

function fmtMin(min: number | null | undefined) {
  if (min == null) return '—'
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function fmtPP(pp: number | null | undefined, showPlus = true) {
  if (pp == null) return '—'
  return `${showPlus && pp >= 0 ? '+' : ''}${pp} pp`
}

const PROV_COLORS: Record<string, string> = {
  BITEL: '#16A34A', ENTEL: '#2563EB', CLARO: '#DC2626',
  MOVISTAR: '#9333EA', CONVERGIA: '#F59E0B',
}
function getProvColor(nombre: string): string {
  const u = nombre.toUpperCase()
  for (const [k, v] of Object.entries(PROV_COLORS)) { if (u.includes(k)) return v }
  return '#6B7280'
}
function estadoLabel(e: string) {
  if (e === 'optimo') return 'Óptimo'; if (e === 'revisar') return 'Revisar'; return 'Crítico'
}
function estadoColor(e: string) {
  if (e === 'optimo') return '#3B6D11'; if (e === 'revisar') return '#854F0B'; return '#A32D2D'
}
function estadoBg(e: string) {
  if (e === 'optimo') return '#EAF3DE'; if (e === 'revisar') return '#FAEEDA'; return '#FCEBEB'
}
function tendenciaColor(t: string) {
  if (t === 'Estable / Positiva') return '#3B6D11'
  if (t === 'En mejora') return '#16A34A'
  if (t === 'Empeorando') return '#854F0B'
  if (t === 'Crítico sostenido') return '#A32D2D'
  return '#854F0B'
}
function tendenciaBg(t: string) {
  if (t === 'Estable / Positiva' || t === 'En mejora') return '#EAF3DE'
  if (t === 'Crítico sostenido' || t === 'Empeorando') return '#FCEBEB'
  return '#FAEEDA'
}

function Sk({ w = '60%', h = 14 }: { w?: string; h?: number }) {
  return (
    <div style={{ width: w, height: h, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', borderRadius: 4, animation: 'shimmer 1.4s infinite' }} />
  )
}

// ─── Mini sparkline chart per provider ────────────────────────────────────────

function MiniSparkline({ data, prov }: { data: any[]; prov: string }) {
  const color = getProvColor(prov)
  const lastVal = [...data].reverse().find((d) => d[prov] != null)?.[prov]
  return (
    <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px', minWidth: '200px', flex: '1 1 180px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: '12px', fontWeight: 700 }}>{prov}</span>
      </div>
      <ResponsiveContainer width="100%" height={60}>
        <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <ReferenceLine y={90} stroke="#6366F1" strokeDasharray="4 2" strokeWidth={1} />
          <Line type="monotone" dataKey={prov} stroke={color} strokeWidth={2} dot={{ r: 2, fill: color }} connectNulls />
          <XAxis dataKey="mesLabel" hide />
          <YAxis domain={[0, 100]} hide />
          <Tooltip
            formatter={(v: any) => [`${v}%`, 'SLA']}
            labelFormatter={(l: any) => String(l)}
            contentStyle={{ fontSize: '10px', padding: '4px 8px' }}
          />
        </LineChart>
      </ResponsiveContainer>
      {lastVal != null && (
        <div style={{ fontSize: '22px', fontWeight: 700, color, marginTop: '4px', lineHeight: 1 }}>{lastVal}%</div>
      )}
    </div>
  )
}

// ─── Inner Page ───────────────────────────────────────────────────────────────

function TendenciaSLA6mInner() {
  const sp = useSearchParams()
  const [desde, setDesde]             = useState(sp.get('desde') ?? sixMonthsAgo())
  const [hasta, setHasta]             = useState(sp.get('hasta') ?? todayStr())
  const [proveedorFiltro, setProveedorFiltro] = useState(sp.get('proveedorId') ?? '')
  const [data, setData]               = useState<SLATrendResponse | null>(null)
  const [loading, setLoading]         = useState(false)
  const [mostrarTodosMeses, setMostrarTodosMeses] = useState(false)

  const fetchData = useCallback(async (d = desde, h = hasta, pId = proveedorFiltro) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde: d, hasta: h })
      if (pId) params.set('proveedorId', pId)
      const res = await fetch(`/api/dashboard/tendencia-sla-6m?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [desde, hasta, proveedorFiltro])

  useEffect(() => { fetchData() }, [])

  function exportCSV() {
    const puntos = data?.puntos ?? []
    const rows = [
      ['Mes', 'Proveedor', 'Evaluables', 'Dentro SLA', 'Fuera SLA', 'SLA%', 'Variación (pp)', 'T.Resp(min)', 'T.Resol(min)', 'Estado'],
      ...puntos.map((p) => [p.mesLabel, p.proveedor, p.evaluables, p.dentraSLA, p.fueraSLA, p.slaPct ?? '', p.variacionPP ?? '', p.tPromRespuestaMin ?? '', p.tPromResolucionMin ?? '', p.estado]),
    ]
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `tendencia-sla-6m-${desde}-${hasta}.csv`; a.click()
  }

  const g          = data?.resumenGlobal
  const puntos     = data?.puntos ?? []
  const chartData  = data?.chartData ?? []
  const proveedores = data?.proveedoresEnGrafico ?? []
  const resumen    = data?.resumenProveedores ?? []
  const mesCrit    = data?.mesCriticos ?? []
  const conclusiones = data?.conclusiones ?? []
  const provList   = data?.proveedoresList ?? []

  // Tabla 1: rows grouped by mes+proveedor, limited unless expanded
  const meses = Array.from(new Set(puntos.map((p) => p.mesKey))).sort().reverse()
  const mesesVisibles = mostrarTodosMeses ? meses : meses.slice(0, 3)

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Back + Title */}
      <div style={{ marginBottom: '16px' }}>
        <a href="/dashboard" style={{ fontSize: '12px', color: '#185FA5', textDecoration: 'none' }}>← Volver al dashboard</a>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '8px 0 2px' }}>Detalle — Tendencia SLA últimos 6 meses</h1>
        <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: 0 }}>Análisis de la evolución del cumplimiento SLA por proveedor en el período seleccionado.</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px', padding: '12px 16px', background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px' }}>
        <label style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Fecha inicio</label>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', outline: 'none' }} />
        <label style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Fecha fin</label>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', outline: 'none' }} />
        <label style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Proveedor</label>
        <select value={proveedorFiltro} onChange={(e) => setProveedorFiltro(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {provList.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <button onClick={() => fetchData()}
          style={{ padding: '6px 14px', fontSize: '12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>
          Actualizar
        </button>
        <button onClick={exportCSV}
          style={{ padding: '6px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'white', marginLeft: 'auto' }}>
          Exportar CSV
        </button>
      </div>

      {/* 6 Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {[
          {
            label: 'Proveedor con mejor tendencia',
            value: g?.mejorProveedor ?? '—',
            sub: g?.mejorProveedorPP != null ? `${fmtPP(g.mejorProveedorPP)} en 6 meses` : '',
            color: '#3B6D11', icon: '↑',
          },
          {
            label: 'Proveedor con peor tendencia',
            value: g?.peorProveedor ?? '—',
            sub: g?.peorProveedorPP != null ? `${fmtPP(g.peorProveedorPP)} en 6 meses` : '',
            color: '#A32D2D', icon: '↓',
          },
          {
            label: 'SLA promedio 6 meses',
            value: g?.slaPromedioGlobal != null ? `${g.slaPromedioGlobal}%` : '—',
            sub: 'Todos los proveedores',
            color: g?.slaPromedioGlobal != null ? (g.slaPromedioGlobal >= 90 ? '#3B6D11' : g.slaPromedioGlobal >= 70 ? '#854F0B' : '#A32D2D') : '#0f172a',
            icon: '◎',
          },
          {
            label: 'Mes más crítico',
            value: g?.mesMasCriticoLabel ?? '—',
            sub: g?.mesMasCriticoSLA != null ? `SLA promedio ${g.mesMasCriticoSLA}%` : '',
            color: '#854F0B', icon: '⚠',
          },
          {
            label: 'Mayor caída mensual',
            value: g?.mayorCaidaProveedor ? `${g.mayorCaidaProveedor} ${fmtPP(g.mayorCaidaPP)}` : '—',
            sub: g?.mayorCaidaMesLabel ?? '',
            color: '#A32D2D', icon: '↓',
          },
          {
            label: 'Proveedores bajo meta (90%)',
            value: g ? `${g.proveedoresBajoMeta} de ${g.totalProveedores}` : '—',
            sub: g && g.totalProveedores > 0 ? `${Math.round((g.proveedoresBajoMeta / g.totalProveedores) * 100)}% del total` : '',
            color: '#A32D2D', icon: '⊘',
          },
        ].map(({ label, value, sub, color, icon }) => (
          <div key={label} style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '14px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '18px', lineHeight: 1, marginTop: '2px' }}>{icon}</span>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px', lineHeight: 1.3 }}>{label}</div>
              {loading ? <Sk w="70%" h={20} /> : <div style={{ fontSize: '16px', fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>}
              {!loading && sub && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '3px' }}>{sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* 1. Resumen mensual */}
      <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>1. Resumen mensual por proveedor</div>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 80px 75px 65px 90px 75px', gap: '8px', padding: '0 0 8px', borderBottom: '0.5px solid var(--border)' }}>
          {['Mes', 'Proveedor', 'Evaluables', 'Dentro SLA', 'Fuera SLA', 'SLA %', 'Variación', 'Estado'].map((h) => (
            <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
          ))}
        </div>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 80px 75px 65px 90px 75px', gap: '8px', padding: '9px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
              {Array.from({ length: 8 }).map((_, j) => <Sk key={j} w={j < 2 ? '80%' : '50%'} />)}
            </div>
          ))
        ) : (
          <>
            {mesesVisibles.map((mesKey) => {
              const pp = puntos.filter((p) => p.mesKey === mesKey).sort((a, b) => a.proveedor.localeCompare(b.proveedor))
              return pp.map((p, i) => (
                <div key={`${mesKey}-${p.proveedor}`} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 80px 75px 65px 90px 75px', gap: '8px', padding: '9px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center', background: i === 0 ? '#FAFAFA' : 'transparent' }}>
                  <span style={{ fontSize: '12px', fontWeight: i === 0 ? 600 : 400, color: i === 0 ? '#0f172a' : 'transparent' }}>{i === 0 ? p.mesLabel : ''}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: getProvColor(p.proveedor), flexShrink: 0 }} />
                    <span style={{ fontSize: '12px' }}>{p.proveedor}</span>
                  </div>
                  <span style={{ fontSize: '12px', textAlign: 'center' }}>{p.evaluables}</span>
                  <span style={{ fontSize: '12px', textAlign: 'center' }}>{p.dentraSLA}</span>
                  <span style={{ fontSize: '12px', textAlign: 'center', color: p.fueraSLA > 0 ? '#A32D2D' : 'var(--muted-foreground)' }}>{p.fueraSLA}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: estadoColor(p.estado) }}>{p.slaPct != null ? `${p.slaPct}%` : '—'}</span>
                  <span style={{ fontSize: '11px', fontWeight: 500, color: p.variacionPP == null ? '#94A3B8' : p.variacionPP >= 0 ? '#3B6D11' : '#A32D2D' }}>
                    {fmtPP(p.variacionPP)}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '999px', background: estadoBg(p.estado), color: estadoColor(p.estado), whiteSpace: 'nowrap' }}>
                    {estadoLabel(p.estado)}
                  </span>
                </div>
              ))
            })}
            {meses.length > 3 && (
              <button
                onClick={() => setMostrarTodosMeses(!mostrarTodosMeses)}
                style={{ marginTop: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#185FA5', fontWeight: 500 }}
              >
                {mostrarTodosMeses ? `Mostrar menos ↑` : `Ver todos los meses (${meses.length}) ↓`}
              </button>
            )}
          </>
        )}
      </div>

      {/* 2. Comparativo de tendencia */}
      <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>2. Comparativo de tendencia ({meses.length} meses)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 110px 80px 100px 140px', gap: '8px', padding: '0 0 8px', borderBottom: '0.5px solid var(--border)' }}>
          {['Proveedor', 'SLA prom.', 'Mejor mes', 'Peor mes', 'Variación', 'Meses bajo meta', 'Estado tendencia'].map((h) => (
            <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
          ))}
        </div>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 110px 80px 100px 140px', gap: '8px', padding: '10px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
              {Array.from({ length: 7 }).map((_, j) => <Sk key={j} w={j === 0 ? '80%' : '55%'} />)}
            </div>
          ))
        ) : resumen.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '20px 0', textAlign: 'center' }}>Sin datos</div>
        ) : (
          resumen.map((r, i) => {
            const criticoSostenido = (r.mejorMes != null && r.mejorMes === r.peorMes) || r.slaPromedio === 0
            return (
            <div key={r.proveedor} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 110px 80px 100px 140px', gap: '8px', padding: '10px 0', borderBottom: i < resumen.length - 1 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: getProvColor(r.proveedor), flexShrink: 0 }} />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{r.proveedor}</span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: r.slaPromedio != null ? estadoColor(r.slaPromedio >= 90 ? 'optimo' : r.slaPromedio >= 70 ? 'revisar' : 'critico') : '#94A3B8' }}>
                {r.slaPromedio != null ? `${r.slaPromedio}%` : '—'}
              </span>
              <span style={{ fontSize: criticoSostenido ? '10px' : '11px', fontWeight: criticoSostenido ? 600 : 400, color: criticoSostenido ? '#A32D2D' : '#3B6D11' }}>
                {criticoSostenido ? 'SLA crítico sostenido' : (r.mejorMes ? `${r.mejorMes} ${r.mejorMesSLA}%` : '—')}
              </span>
              <span style={{ fontSize: criticoSostenido ? '10px' : '11px', fontWeight: criticoSostenido ? 600 : 400, color: '#A32D2D' }}>
                {criticoSostenido ? 'SLA crítico sostenido' : (r.peorMes ? `${r.peorMes} ${r.peorMesSLA}%` : '—')}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: r.variacionTotal == null ? '#94A3B8' : r.variacionTotal >= 0 ? '#3B6D11' : '#A32D2D' }}>
                {fmtPP(r.variacionTotal)}
              </span>
              <span style={{ fontSize: '12px', textAlign: 'center' }}>{r.mesesBajoMeta}</span>
              <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '999px', background: tendenciaBg(r.estadoTendencia), color: tendenciaColor(r.estadoTendencia), whiteSpace: 'nowrap' }}>
                {r.estadoTendencia}
              </span>
            </div>
          )})
        )}
      </div>

      {/* 3. Meses críticos */}
      {(loading || mesCrit.length > 0) && (
        <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>3. Meses críticos (SLA &lt; 70% o caída &gt; 10 pp)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px 65px 75px 1fr 1fr', gap: '8px', padding: '0 0 8px', borderBottom: '0.5px solid var(--border)' }}>
            {['Mes', 'Proveedor', 'SLA %', 'Fuera SLA', 'Variación', 'Causa principal', 'Recomendación'].map((h) => (
              <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
            ))}
          </div>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px 65px 75px 1fr 1fr', gap: '8px', padding: '10px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
                {Array.from({ length: 7 }).map((_, j) => <Sk key={j} w={j < 2 ? '80%' : '55%'} />)}
              </div>
            ))
          ) : (
            mesCrit.map((m, i) => (
              <div key={`${m.mesKey}-${m.proveedor}`} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px 65px 75px 1fr 1fr', gap: '8px', padding: '10px 0', borderBottom: i < mesCrit.length - 1 ? '0.5px solid var(--border)' : 'none', alignItems: 'start' }}>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{m.mesLabel}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: getProvColor(m.proveedor), flexShrink: 0 }} />
                  <span style={{ fontSize: '12px' }}>{m.proveedor}</span>
                </div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#A32D2D' }}>{m.slaPct != null ? `${m.slaPct}%` : '—'}</span>
                <span style={{ fontSize: '12px', textAlign: 'center' }}>{m.fueraSLA}</span>
                <span style={{ fontSize: '11px', color: m.variacionPP != null && m.variacionPP < 0 ? '#A32D2D' : '#3B6D11', fontWeight: 500 }}>
                  {fmtPP(m.variacionPP)}
                </span>
                <span style={{ fontSize: '11px', lineHeight: 1.4 }}>{m.causaPrincipal}</span>
                <span style={{ fontSize: '11px', color: '#185FA5', lineHeight: 1.4 }}>{m.recomendacion}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* 4. Análisis de tendencia — mini sparklines per provider */}
      {!loading && proveedores.length > 0 && chartData.length > 0 && (
        <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>4. Análisis de tendencia</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {proveedores.map((prov) => {
              const r = resumen.find((rr) => rr.proveedor === prov)
              const sinEvaluables = chartData.every((d) => (d as Record<string, unknown>)[prov] == null)
              return (
                <div key={prov} style={{ flex: '1 1 200px', minWidth: '180px', maxWidth: '280px', background: '#FAFAFA', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: getProvColor(prov), flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{prov}</span>
                  </div>
                  {sinEvaluables ? (
                    <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', lineHeight: 1.4 }}>
                        Sin incidentes evaluables en el período
                      </span>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={60}>
                      <LineChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                        <ReferenceLine y={90} stroke="#6366F1" strokeDasharray="4 2" strokeWidth={1} />
                        <Line type="monotone" dataKey={prov} stroke={getProvColor(prov)} strokeWidth={2} dot={{ r: 3, fill: getProvColor(prov) }} connectNulls />
                        <XAxis dataKey="mesLabel" hide />
                        <YAxis domain={[0, 100]} hide />
                        <Tooltip formatter={(v: any) => [`${v}%`, 'SLA']} labelFormatter={(l) => String(l)} contentStyle={{ fontSize: '10px', padding: '4px 8px' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                  {r && (
                    <div style={{ marginTop: '6px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Tendencia:</div>
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '999px', background: tendenciaBg(r.estadoTendencia), color: tendenciaColor(r.estadoTendencia) }}>
                        {r.estadoTendencia}
                      </span>
                      {r.variacionTotal != null && (
                        <div style={{ fontSize: '11px', fontWeight: 500, color: r.variacionTotal >= 0 ? '#3B6D11' : '#A32D2D', marginTop: '4px' }}>
                          {fmtPP(r.variacionTotal)} en {meses.length} meses
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 5. Conclusiones */}
      {!loading && conclusiones.length > 0 && (
        <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>5. Conclusiones automáticas</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {conclusiones.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', background: '#FAFAFA', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>
                  {c.startsWith('Se recomienda') ? '→' : c.includes('peor') || c.includes('caída') || c.includes('incumplimiento') ? '⚠' : c.includes('mejora') ? '✓' : 'ℹ'}
                </span>
                <span style={{ fontSize: '12px', color: '#0f172a', lineHeight: 1.5 }}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Methodology */}
      <div style={{ padding: '14px 16px', background: 'var(--muted)', borderRadius: '10px', fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.7 }}>
        <strong>Metodología:</strong> SLA mensual = incidentes evaluables con SLA cumplido / total evaluables × 100. Evaluable = RESUELTO + hora_fin + correo N1 enviado + max_nivel ≥ 1. SLA cumplido = respuesta ≤60 min (sin escalar a N2) y resolución dentro del objetivo por tipo. La variación es la diferencia en puntos porcentuales (pp) respecto al mes anterior para el mismo proveedor.
      </div>
    </div>
  )
}

export default function TendenciaSLA6mPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '14px' }}>Cargando…</div>}>
      <TendenciaSLA6mInner />
    </Suspense>
  )
}
