'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type {
  GeographicImpactResponse, ZonaResumen, DistritoDetalle,
} from '@/types/geographic-impact'

const PeruLeafletMap = dynamic(() => import('../components/PeruLeafletMap'), { ssr: false })

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
  const router = useRouter()
  const sp = useSearchParams()
  const [desde, setDesde]           = useState(sp.get('desde') ?? firstDayOfMonth())
  const [hasta, setHasta]           = useState(sp.get('hasta') ?? todayStr())
  const [proveedorFiltro, setProveedorFiltro] = useState(sp.get('proveedorId') ?? '')
  const [data, setData]             = useState<GeographicImpactResponse | null>(null)
  const [loading, setLoading]       = useState(false)
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
  const conclusiones = data?.conclusiones ?? []

  return (
    <div style={{ maxWidth: '100%' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Back + Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <button onClick={() => router.push('/dashboard?tab=analitico')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#185FA5', fontWeight: 500 }}>← Volver</button>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>F. Impacto geográfico</span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px', padding: '7px 10px', background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px' }}>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          style={{ padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', outline: 'none' }} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          style={{ padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', outline: 'none' }} />
        <select value={proveedorFiltro} onChange={(e) => setProveedorFiltro(e.target.value)}
          style={{ padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {provList.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <button onClick={() => fetchData()}
          style={{ padding: '5px 12px', fontSize: '11px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
          ↻ Aplicar
        </button>
        <button onClick={() => { setDesde(firstDayOfMonth()); setHasta(todayStr()); setProveedorFiltro(''); fetchData(firstDayOfMonth(), todayStr(), '') }}
          style={{ padding: '5px 10px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', cursor: 'pointer', background: 'white' }}>
          Limpiar
        </button>
        <button onClick={exportCSV}
          style={{ padding: '5px 10px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', cursor: 'pointer', background: 'white', marginLeft: 'auto' }}>
          ↓ CSV
        </button>
      </div>

      {/* 6 Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px', marginBottom: '8px' }}>
        {[
          { label: 'Zona más afectada',      value: g?.zonaMasAfectada ?? '—',                            color: '#185FA5' },
          { label: 'Impacto estimado total', value: g ? fmtCosto(g.impactoTotal) : '—',                   color: '#0f172a' },
          { label: 'Tiendas afectadas',      value: g?.tiendasAfectadas ?? 0,                              color: '#0f172a' },
          { label: 'Peor SLA geográfico',    value: g?.peorSLAZona ? `${g.peorSLAZona} (${g.peorSLAPct}%)` : '—', color: '#A32D2D' },
          { label: 'Mayor MTTR',             value: g?.mayorMTTRZona ? `${g.mayorMTTRZona} (${fmtMin(g.mayorMTTRMin)})` : '—', color: '#854F0B' },
          { label: 'Proveedor dominante',    value: g?.proveedorDominante ?? '—',                           color: '#0f172a' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '8px', padding: '8px 12px' }}>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '3px', lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            {loading
              ? <Sk w="70%" h={18} />
              : <div style={{ fontSize: '16px', fontWeight: 600, color, lineHeight: 1.3 }}>{String(value)}</div>
            }
          </div>
        ))}
      </div>

      {/* Main two-column layout: map+Tabla1 | Conclusiones */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '8px', alignItems: 'start', marginBottom: '8px' }}>

        {/* Left: map + Tabla 1 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Map */}
          <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Mapa de impacto por tienda</div>
            {loading
              ? <div style={{ height: '400px', background: 'var(--muted)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Cargando mapa…</div>
              : <PeruLeafletMap tiendas={data?.tiendas ?? []} />
            }
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '8px' }}>
              Color: verde ≥90% SLA · naranja 70–89% · rojo &lt;70%. Tamaño proporcional al impacto estimado.
            </div>
          </div>

          {/* Tabla 1 */}
          <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Tabla 1 — Resumen por zona</div>
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
                      style={{
                        display: 'grid', gridTemplateColumns: '1fr 60px 65px 75px 70px 70px 70px', gap: '6px',
                        padding: '8px 0', borderBottom: i < zonas.length - 1 ? '0.5px solid var(--border)' : 'none',
                        alignItems: 'center',
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
                  <span style={{ fontSize: '11px', color: '#0f172a', lineHeight: 1.5 }}>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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

      {/* Methodology footer */}
      <div style={{ padding: '8px 12px', background: '#F9FAFB', border: '0.5px solid #e5e7eb', borderRadius: '7px', fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: 1.7 }}>
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
