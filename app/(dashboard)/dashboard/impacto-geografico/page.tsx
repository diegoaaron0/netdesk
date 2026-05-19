'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type {
  GeographicImpactResponse, ZonaResumen, DistritoDetalle, TiendaZonaDetalle, PatronGeografico,
} from '@/types/geographic-impact'
import PeruMapPlaceholder from '../components/PeruMapPlaceholder'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function firstDayOfMonth() {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}
function todayStr() { return new Date().toISOString().split('T')[0] }

function fmtMin(min: number | null | undefined) {
  if (min == null) return '—'
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function fmtCosto(n: number) {
  return `S/ ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
}
function slaColor(pct: number | null) {
  if (pct == null) return '#94A3B8'
  if (pct >= 90) return '#3B6D11'
  if (pct >= 70) return '#854F0B'
  return '#A32D2D'
}
function slaBg(pct: number | null) {
  if (pct == null) return '#F1F5F9'
  if (pct >= 90) return '#EAF3DE'
  if (pct >= 70) return '#FAEEDA'
  return '#FCEBEB'
}
function estadoLabel(estado: string) {
  if (estado === 'optima') return 'Óptima'
  if (estado === 'revisar') return 'Revisar'
  return 'Crítica'
}
function estadoColor(estado: string) {
  if (estado === 'optima') return '#3B6D11'
  if (estado === 'revisar') return '#854F0B'
  return '#A32D2D'
}
function estadoBg(estado: string) {
  if (estado === 'optima') return '#EAF3DE'
  if (estado === 'revisar') return '#FAEEDA'
  return '#FCEBEB'
}

function Sk({ w = '60%', h = 14 }: { w?: string; h?: number }) {
  return (
    <div style={{ width: w, height: h, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', borderRadius: 4, animation: 'shimmer 1.4s infinite' }} />
  )
}

// ─── Inner Page ───────────────────────────────────────────────────────────────

function ImpactoGeograficoInner() {
  const sp = useSearchParams()
  const [desde, setDesde]           = useState(sp.get('desde') ?? firstDayOfMonth())
  const [hasta, setHasta]           = useState(sp.get('hasta') ?? todayStr())
  const [proveedorFiltro, setProveedorFiltro] = useState(sp.get('proveedorId') ?? '')
  const [data, setData]             = useState<GeographicImpactResponse | null>(null)
  const [loading, setLoading]       = useState(false)
  const [zonaSeleccionada, setZonaSeleccionada] = useState<string | null>(null)
  const [tiendas, setTiendas]       = useState<TiendaZonaDetalle[]>([])
  const [loadingTiendas, setLoadingTiendas] = useState(false)
  const [busquedaDist, setBusquedaDist] = useState('')

  const fetchData = useCallback(async (d = desde, h = hasta, pId = proveedorFiltro) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde: d, hasta: h })
      if (pId) params.set('proveedorId', pId)
      const res = await fetch(`/api/dashboard/impacto-geografico?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [desde, hasta, proveedorFiltro])

  useEffect(() => { fetchData() }, [])

  async function seleccionarZona(zona: string) {
    if (zonaSeleccionada === zona) { setZonaSeleccionada(null); setTiendas([]); return }
    setZonaSeleccionada(zona)
    setLoadingTiendas(true)
    try {
      const params = new URLSearchParams({ desde, hasta, zona })
      if (proveedorFiltro) params.set('proveedorId', proveedorFiltro)
      const res = await fetch(`/api/dashboard/impacto-geografico/tiendas?${params}`)
      if (res.ok) setTiendas(await res.json())
    } finally { setLoadingTiendas(false) }
  }

  function exportCSV() {
    const zonas = data?.zonas ?? []
    const rows = [
      ['Zona', 'Incidentes', '% Total', 'Tiendas', 'MTTR(min)', 'SLA%', 'Impacto', 'Proveedor dominante', 'Estado'],
      ...zonas.map((z) => [z.zona, z.incidentes, z.pctDelTotal, z.tiendasAfectadas, z.mttrPromMin ?? '', z.slaPct ?? '', z.impactoEstimado, z.proveedorDominante ?? '', z.estado]),
    ]
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `impacto-geografico-${desde}-${hasta}.csv`; a.click()
  }

  const g = data?.resumenGlobal
  const zonas = data?.zonas ?? []
  const distritosFiltrados: DistritoDetalle[] = (data?.distritos ?? []).filter((d) => {
    if (!busquedaDist) return true
    const q = busquedaDist.toLowerCase()
    return d.distrito.toLowerCase().includes(q) || d.zona.toLowerCase().includes(q)
  })
  const provList = data?.proveedoresList ?? []
  const patrones = data?.patrones ?? []
  const conclusiones = data?.conclusiones ?? []

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Back + Title */}
      <div style={{ marginBottom: '16px' }}>
        <a href="/dashboard" style={{ fontSize: '12px', color: '#185FA5', textDecoration: 'none' }}>← Volver al dashboard</a>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '8px 0 2px' }}>Impacto geográfico</h1>
        <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: 0 }}>Concentración de incidentes e impacto por zona, provincia y distrito</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px', padding: '12px 16px', background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px' }}>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', outline: 'none' }} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', outline: 'none' }} />
        <select value={proveedorFiltro} onChange={(e) => setProveedorFiltro(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {provList.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <button onClick={() => fetchData()}
          style={{ padding: '6px 14px', fontSize: '12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>
          Aplicar
        </button>
        <button onClick={() => { setDesde(firstDayOfMonth()); setHasta(todayStr()); setProveedorFiltro(''); fetchData(firstDayOfMonth(), todayStr(), '') }}
          style={{ padding: '6px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'white' }}>
          Limpiar
        </button>
        <button onClick={exportCSV}
          style={{ padding: '6px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'white', marginLeft: 'auto' }}>
          Exportar CSV
        </button>
      </div>

      {/* 6 Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'Zona más afectada',      value: g?.zonaMasAfectada ?? '—',                            color: '#185FA5' },
          { label: 'Impacto estimado total', value: g ? fmtCosto(g.impactoTotal) : '—',                   color: '#0f172a' },
          { label: 'Tiendas afectadas',      value: g?.tiendasAfectadas ?? 0,                              color: '#0f172a' },
          { label: 'Peor SLA geográfico',    value: g?.peorSLAZona ? `${g.peorSLAZona} (${g.peorSLAPct}%)` : '—', color: '#A32D2D' },
          { label: 'Mayor MTTR',             value: g?.mayorMTTRZona ? `${g.mayorMTTRZona} (${fmtMin(g.mayorMTTRMin)})` : '—', color: '#854F0B' },
          { label: 'Proveedor dominante',    value: g?.proveedorDominante ?? '—',                           color: '#0f172a' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '6px', lineHeight: 1.3 }}>{label}</div>
            {loading
              ? <Sk w="70%" h={20} />
              : <div style={{ fontSize: '15px', fontWeight: 700, color, lineHeight: 1.3 }}>{String(value)}</div>
            }
          </div>
        ))}
      </div>

      {/* Main two-column layout: map+Tabla1 | Conclusiones */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px', alignItems: 'start', marginBottom: '16px' }}>

        {/* Left: map + Tabla 1 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Map + Tabla 1 header */}
          <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Tabla 1 — Resumen por zona</div>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              {!loading && <PeruMapPlaceholder zonas={zonas} />}
              {loading && <div style={{ width: '120px', height: '148px', background: 'var(--muted)', borderRadius: '8px', flexShrink: 0 }} />}

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 65px 75px 70px 70px 70px', gap: '6px', padding: '0 0 6px', borderBottom: '0.5px solid var(--border)' }}>
                  {['Zona', 'Inc.', 'Tiendas', 'MTTR prom', 'SLA%', 'Impacto', 'Estado'].map((h) => (
                    <span key={h} style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
                  ))}
                </div>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 65px 75px 70px 70px 70px', gap: '6px', padding: '8px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
                      {Array.from({ length: 7 }).map((_, j) => <Sk key={j} w={j === 0 ? '80%' : '50%'} />)}
                    </div>
                  ))
                ) : zonas.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '20px 0', textAlign: 'center' }}>Sin datos en el período</div>
                ) : (
                  zonas.map((z, i) => (
                    <div
                      key={z.zona}
                      onClick={() => seleccionarZona(z.zona)}
                      style={{
                        display: 'grid', gridTemplateColumns: '1fr 60px 65px 75px 70px 70px 70px', gap: '6px',
                        padding: '8px 0', borderBottom: i < zonas.length - 1 ? '0.5px solid var(--border)' : 'none',
                        alignItems: 'center', cursor: 'pointer',
                        background: zonaSeleccionada === z.zona ? '#EFF6FF' : 'transparent',
                        borderRadius: '4px',
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 500 }}>{z.zona}</span>
                      <span style={{ fontSize: '12px', textAlign: 'center' }}>{z.incidentes}</span>
                      <span style={{ fontSize: '12px', textAlign: 'center' }}>{z.tiendasAfectadas}</span>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', textAlign: 'center' }}>{fmtMin(z.mttrPromMin)}</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, textAlign: 'center', color: slaColor(z.slaPct) }}>
                        {z.slaPct != null ? `${z.slaPct}%` : '—'}
                      </span>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', textAlign: 'right' }}>
                        {z.impactoEstimado > 0 ? fmtCosto(z.impactoEstimado) : '—'}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '999px', background: estadoBg(z.estado), color: estadoColor(z.estado), whiteSpace: 'nowrap', textAlign: 'center' }}>
                        {estadoLabel(z.estado)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            {!loading && zonas.length > 0 && (
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '8px' }}>
                Haz clic en una zona para ver el detalle de tiendas afectadas.
              </div>
            )}
          </div>
        </div>

        {/* Right: Conclusiones */}
        <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '16px' }}>💡</span> Conclusiones
          </div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Array.from({ length: 5 }).map((_, i) => <Sk key={i} w="90%" h={14} />)}
            </div>
          ) : conclusiones.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin conclusiones para el período.</div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {conclusiones.map((c, i) => (
                <li key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '14px', flexShrink: 0 }}>
                    {c.startsWith('Se recomienda') ? '→' : c.includes('mayor') || c.includes('concentra') ? '⚠' : '✓'}
                  </span>
                  <span style={{ fontSize: '12px', color: '#0f172a', lineHeight: 1.5 }}>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Tabla 3 — Tiendas de zona seleccionada */}
      {zonaSeleccionada && (
        <div style={{ background: 'white', border: '0.5px solid #BFDBFE', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Tabla 3 — Tiendas afectadas en {zonaSeleccionada}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Detalle por tienda en la zona seleccionada</div>
            </div>
            <button onClick={() => { setZonaSeleccionada(null); setTiendas([]) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)', lineHeight: 1 }}>✕</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 60px 70px 70px 90px 90px 80px', gap: '8px', padding: '0 0 8px', borderBottom: '0.5px solid var(--border)' }}>
            {['Tienda', 'Nombre', 'Distrito', 'Inc.', 'MTTR', 'SLA%', 'Impacto', 'Contingencia', 'Estado'].map((h) => (
              <span key={h} style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
            ))}
          </div>

          {loadingTiendas ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 60px 70px 70px 90px 90px 80px', gap: '8px', padding: '8px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
                {Array.from({ length: 9 }).map((_, j) => <Sk key={j} w={j === 1 ? '80%' : '50%'} />)}
              </div>
            ))
          ) : tiendas.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '16px 0', textAlign: 'center' }}>Sin tiendas para esta zona</div>
          ) : (
            tiendas.map((t, i) => (
              <div key={t.tiendaId} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 60px 70px 70px 90px 90px 80px', gap: '8px', padding: '8px 0', borderBottom: i < tiendas.length - 1 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'monospace' }}>{t.tiendaCodigo}</span>
                <span style={{ fontSize: '11px' }}>{t.tiendaNombre || '—'}</span>
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{t.distrito || '—'}</span>
                <span style={{ fontSize: '12px', textAlign: 'center' }}>{t.incidentes}</span>
                <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{fmtMin(t.mttrPromMin)}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: slaColor(t.slaPct) }}>
                  {t.slaPct != null ? `${t.slaPct}%` : '—'}
                </span>
                <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{t.impactoEstimado > 0 ? fmtCosto(t.impactoEstimado) : '—'}</span>
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '999px', background: t.tieneContingencia ? '#EAF3DE' : '#FCEBEB', color: t.tieneContingencia ? '#3B6D11' : '#A32D2D', textAlign: 'center' }}>
                  {t.tieneContingencia ? 'Sí' : 'No'}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '999px', background: estadoBg(t.estado), color: estadoColor(t.estado), textAlign: 'center' }}>
                  {estadoLabel(t.estado)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tabla 2 — Desglose por distrito */}
      <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>Tabla 2 — Desglose por distrito</div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Detalle de incidentes, SLA e impacto por distrito</div>
          </div>
          <input
            placeholder="Buscar distrito o zona…"
            value={busquedaDist}
            onChange={(e) => setBusquedaDist(e.target.value)}
            style={{ padding: '5px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', outline: 'none', width: '200px' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 60px 70px 90px 70px 90px 80px', gap: '8px', padding: '0 0 8px', borderBottom: '0.5px solid var(--border)' }}>
          {['Distrito', 'Zona', 'Inc.', 'Tiendas', 'MTTR prom', 'SLA%', 'Impacto', 'Estado'].map((h) => (
            <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
          ))}
        </div>

        <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 60px 70px 90px 70px 90px 80px', gap: '8px', padding: '9px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
                {Array.from({ length: 8 }).map((_, j) => <Sk key={j} w={j === 0 ? '70%' : '50%'} />)}
              </div>
            ))
          ) : distritosFiltrados.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '20px 0', textAlign: 'center' }}>Sin resultados</div>
          ) : (
            distritosFiltrados.map((d, i) => (
              <div key={d.distrito} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 60px 70px 90px 70px 90px 80px', gap: '8px', padding: '9px 0', borderBottom: i < distritosFiltrados.length - 1 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 500 }}>{d.distrito}</span>
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{d.zona}</span>
                <span style={{ fontSize: '12px', textAlign: 'center' }}>{d.incidentes}</span>
                <span style={{ fontSize: '12px', textAlign: 'center' }}>{d.tiendasAfectadas}</span>
                <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{fmtMin(d.mttrPromMin)}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: slaColor(d.slaPct) }}>
                  {d.slaPct != null ? `${d.slaPct}%` : '—'}
                </span>
                <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                  {d.impactoEstimado > 0 ? fmtCosto(d.impactoEstimado) : '—'}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '999px', background: estadoBg(d.estado), color: estadoColor(d.estado), textAlign: 'center' }}>
                  {estadoLabel(d.estado)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Tabla 4 — Patrones geográficos */}
      {patrones.length > 0 && (
        <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Tabla 4 — Patrones geográficos detectados</div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 120px 1fr 1fr 1fr', gap: '8px', padding: '0 0 8px', borderBottom: '0.5px solid var(--border)' }}>
            {['Zona', 'Patrón detectado', 'Proveedor', 'Distritos repetidos', 'Causa probable', 'Recomendación'].map((h) => (
              <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
            ))}
          </div>
          {patrones.map((p, i) => (
            <div key={p.zona} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 120px 1fr 1fr 1fr', gap: '8px', padding: '10px 0', borderBottom: i < patrones.length - 1 ? '0.5px solid var(--border)' : 'none', alignItems: 'start' }}>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>{p.zona}</span>
              <span style={{ fontSize: '11px', lineHeight: 1.4 }}>{p.patronDetectado}</span>
              <span style={{ fontSize: '12px', color: '#185FA5' }}>{p.proveedorAsociado ?? '—'}</span>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                {p.distritosRepetidos.length ? p.distritosRepetidos.join(', ') : '—'}
              </span>
              <span style={{ fontSize: '11px', lineHeight: 1.4 }}>{p.causaProbable}</span>
              <span style={{ fontSize: '11px', color: '#185FA5', lineHeight: 1.4 }}>{p.recomendacion}</span>
            </div>
          ))}
        </div>
      )}

      {/* Methodology footer */}
      <div style={{ padding: '14px 16px', background: 'var(--muted)', borderRadius: '10px', fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.7 }}>
        <strong>Metodología:</strong> Las zonas se asignan a partir del distrito de cada tienda (Lima Norte, Lima Centro, Lima Sur, Lima Este, Callao, Provincia). El MTTR se calcula solo sobre incidentes RESUELTO con hora_fin. El SLA se evalúa sobre incidentes con correo N1 enviado. El impacto estimado = (MTTR en horas) × (venta/hora) × 35% margen.
      </div>
    </div>
  )
}

export default function ImpactoGeograficoPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '14px' }}>Cargando…</div>}>
      <ImpactoGeograficoInner />
    </Suspense>
  )
}
