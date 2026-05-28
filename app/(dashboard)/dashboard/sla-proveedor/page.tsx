'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { SLAProveedorResponse, CasoFueraSLA } from '@/types/provider-sla-compliance'
import { fmtSLA } from '@/lib/sla-display'
import { SLA_RESOLUCION_DEFAULT_MIN } from '@/lib/sla-core'

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
function slaColor(pct: number | null) {
  if (pct == null) return '#A32D2D'
  if (pct >= 90) return '#3B6D11'
  if (pct >= 70) return '#854F0B'
  return '#A32D2D'
}
function slaBg(pct: number | null) {
  if (pct == null) return '#FCEBEB'
  if (pct >= 90) return '#EAF3DE'
  if (pct >= 70) return '#FAEEDA'
  return '#FCEBEB'
}
function estadoLabel(pct: number | null) {
  if (pct == null) return 'Sin datos'
  if (pct >= 90) return 'Óptimo'
  if (pct >= 70) return 'Revisar'
  return 'Crítico'
}

function fmtTipo(t: string) {
  const map: Record<string, string> = {
    CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia', LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
  }
  return map[t] ?? t
}

function Sk({ w = '60%', h = 14 }: { w?: string; h?: number }) {
  return (
    <div style={{ width: w, height: h, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', borderRadius: 4, animation: 'shimmer 1.4s infinite' }} />
  )
}

// ─── Inner Component ──────────────────────────────────────────────────────────

function SLAProveedorPageInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const [desde, setDesde] = useState(sp.get('desde') ?? firstDayOfMonth())
  const [hasta, setHasta] = useState(sp.get('hasta') ?? todayStr())
  const [proveedorFiltro, setProveedorFiltro] = useState(sp.get('proveedorId') ?? '')
  const [data, setData] = useState<SLAProveedorResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [casosBusqueda, setCasosBusqueda] = useState('')

  const fetchData = useCallback(async (d = desde, h = hasta, pId = proveedorFiltro) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde: d, hasta: h })
      if (pId) params.set('proveedorId', pId)
      const res = await fetch(`/api/dashboard/sla-proveedor?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [desde, hasta, proveedorFiltro])

  useEffect(() => { fetchData() }, [])

  const g = data?.resumenGlobal
  const proveedores = data?.proveedores ?? []
  const tiempos = data?.tiempos ?? []
  const niveles = data?.niveles ?? []
  const conclusiones = data?.conclusiones ?? []
  const provList = data?.proveedoresList ?? []

  const casosFiltrados: CasoFueraSLA[] = (data?.casosFueraSLA ?? []).filter((c) => {
    if (!casosBusqueda) return true
    const q = casosBusqueda.toLowerCase()
    return c.codigo.toLowerCase().includes(q) || c.tiendaCodigo.toLowerCase().includes(q) || c.provNombre.toLowerCase().includes(q)
  })

  function exportCSV() {
    const rows = [
      ['Código', 'Tienda', 'Proveedor', 'Tipo', 'T.Respuesta(min)', 'T.Resolución(min)', 'SLA Respuesta', 'SLA Resolución', 'Motivo'],
      ...casosFiltrados.map((c) => [
        c.codigo, c.tiendaCodigo, c.provNombre, fmtTipo(c.tipo),
        c.tPrimeraRespuestaMin ?? '', c.tResolucionMin ?? '',
        c.slaRespuesta ? 'OK' : 'FALLA', c.slaResolucion ? 'OK' : 'FALLA',
        c.motivoIncumplimiento,
      ]),
    ]
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `sla-proveedor-${desde}-${hasta}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={{ maxWidth: '100%' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Back + Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <button onClick={() => router.push('/dashboard?tab=analitico')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#185FA5', fontWeight: 500 }}>← Volver</button>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>E. Cumplimiento SLA por proveedor</span>
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
          { label: 'Proveedores evaluados', value: g?.proveedoresEvaluados ?? 0, suffix: '', color: '#185FA5' },
          { label: 'SLA general del período', value: g?.slaGeneral != null ? `${g.slaGeneral}%` : '—', suffix: '', color: g?.slaGeneral != null ? slaColor(g.slaGeneral) : '#A32D2D' },
          { label: 'Casos fuera de SLA', value: g?.fueraSLATotal ?? 0, suffix: ' casos', color: (g?.fueraSLATotal ?? 0) > 0 ? '#A32D2D' : '#3B6D11' },
          { label: 'T. prom. respuesta', value: fmtMin(g?.tPromRespuestaMin), suffix: '', color: '#0f172a' },
          { label: 'T. prom. resolución', value: fmtMin(g?.tPromResolucionMin), suffix: '', color: '#0f172a' },
          { label: 'Escalados a N2+', value: g?.casosEscaladosN2 ?? 0, suffix: ' casos', color: (g?.casosEscaladosN2 ?? 0) > 0 ? '#854F0B' : '#3B6D11' },
        ].map(({ label, value, suffix, color }) => (
          <div key={label} style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '8px', padding: '8px 12px' }}>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '3px', lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            {loading
              ? <Sk w="55%" h={18} />
              : <div style={{ fontSize: '16px', fontWeight: 600, color, lineHeight: 1 }}>{value}{suffix}</div>
            }
          </div>
        ))}
      </div>

      {/* Main two-column layout: Tabla 1 + Conclusiones */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '8px', alignItems: 'start', marginBottom: '8px' }}>

        {/* Tabla 1 — Resumen comparativo */}
        <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Tabla 1 — Resumen comparativo por proveedor</div>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 90px 60px 90px 80px', gap: '8px', padding: '0 0 8px', borderBottom: '0.5px solid var(--border)' }}>
            {['Proveedor', 'SLA%', 'Evaluables', 'Fuera SLA', 'Escal.N2', 'T.Resp prom', 'Estado'].map((h) => (
              <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
            ))}
          </div>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 90px 60px 90px 80px', gap: '8px', padding: '10px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
                {Array.from({ length: 7 }).map((_, j) => <Sk key={j} w={j === 0 ? '80%' : '60%'} />)}
              </div>
            ))
          ) : proveedores.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '24px 0', textAlign: 'center' }}>Sin datos en el período seleccionado</div>
          ) : (
            proveedores.map((p, i) => (
              <div key={p.proveedorId} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 90px 60px 90px 80px', gap: '8px', padding: '10px 0', borderBottom: i < proveedores.length - 1 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 500 }}>{p.nombre}</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: slaColor(p.slaPct), marginBottom: '2px' }}>
                    {p.slaPct != null ? `${p.slaPct}%` : '—'}
                  </div>
                  <div style={{ height: '3px', background: 'var(--muted)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '3px', width: `${p.slaPct ?? 0}%`, background: slaColor(p.slaPct), borderRadius: '2px' }} />
                  </div>
                </div>
                <span style={{ fontSize: '12px', textAlign: 'center' }}>{p.evaluables}</span>
                <span style={{ fontSize: '12px', textAlign: 'center', color: p.fueraSLA > 0 ? '#A32D2D' : '#3B6D11', fontWeight: p.fueraSLA > 0 ? 600 : 400 }}>{p.fueraSLA}</span>
                <span style={{ fontSize: '12px', textAlign: 'center', color: (p.tasaEscalamientoN2Pct ?? 0) > 30 ? '#854F0B' : 'var(--muted-foreground)' }}>{p.tasaEscalamientoN2Pct != null ? `${p.tasaEscalamientoN2Pct}%` : '—'}</span>
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{fmtMin(p.tPromRespuestaMin)}</span>
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '999px', background: slaBg(p.slaPct), color: slaColor(p.slaPct), whiteSpace: 'nowrap' }}>
                  {estadoLabel(p.slaPct)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Conclusiones sidebar */}
        <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '16px' }}>💡</span> Conclusiones del período
          </div>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Sk key={i} w="90%" h={14} />)
          ) : conclusiones.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>No hay conclusiones para el período seleccionado.</div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {conclusiones.map((c, i) => (
                <li key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>
                    {c.startsWith('Se recomienda') ? '→' : c.includes('óptimo') ? '✓' : '⚠'}
                  </span>
                  <span style={{ fontSize: '11px', color: '#0f172a', lineHeight: 1.5 }}>{c}</span>
                </li>
              ))}
            </ul>
          )}

          {/* SLA reference */}
          {!loading && (
            <div style={{ marginTop: '16px', padding: '10px', background: 'var(--muted)', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Objetivos SLA</div>
              {[
                { tipo: 'Respuesta N1', obj: '≤60 min' },
                { tipo: 'Caída total', obj: '≤60 min' },
                { tipo: 'Intermitencia', obj: '≤120 min' },
                { tipo: 'Lentitud', obj: '≤240 min' },
                { tipo: 'Otros/POS', obj: '≤60 min' },
              ].map(({ tipo, obj }) => (
                <div key={tipo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>{tipo}</span>
                  <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{obj}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabla 2 — Tiempos comparativos */}
      <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Tabla 2 — Tiempos de respuesta y resolución vs objetivos</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px 110px 90px 90px 90px', gap: '8px', padding: '0 0 8px', borderBottom: '0.5px solid var(--border)' }}>
          {['Proveedor', 'Obj. resp.', 'Resp. real', 'Obj. resol.', 'Resol. real', 'Fuera×resp', 'Fuera×resol', 'Fuera×ambos'].map((h) => (
            <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
          ))}
        </div>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px 110px 90px 90px 90px', gap: '8px', padding: '10px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
              {Array.from({ length: 8 }).map((_, j) => <Sk key={j} w={j === 0 ? '70%' : '50%'} />)}
            </div>
          ))
        ) : tiempos.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '20px 0', textAlign: 'center' }}>Sin datos</div>
        ) : (
          tiempos.map((t, i) => {
            const respExcede = t.tRespuestaRealProm != null && t.tRespuestaRealProm > t.slaRespuestaObj
            const resolExcede = t.tResolucionRealProm != null && t.slaResolucionObj != null && t.tResolucionRealProm > t.slaResolucionObj
            return (
              <div key={t.nombre} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px 110px 90px 90px 90px', gap: '8px', padding: '10px 0', borderBottom: i < tiempos.length - 1 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 500 }}>{t.nombre}</span>
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{fmtMin(t.slaRespuestaObj)}</span>
                <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: respExcede ? 700 : 400, color: respExcede ? '#A32D2D' : '#3B6D11' }}>
                  {fmtMin(t.tRespuestaRealProm)}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{fmtMin(t.slaResolucionObj)}</span>
                <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: resolExcede ? 700 : 400, color: resolExcede ? '#A32D2D' : '#3B6D11' }}>
                  {fmtMin(t.tResolucionRealProm)}
                </span>
                <span style={{ fontSize: '12px', textAlign: 'center', color: t.fueraSLAPorRespuesta > 0 ? '#A32D2D' : 'var(--muted-foreground)' }}>{t.fueraSLAPorRespuesta}</span>
                <span style={{ fontSize: '12px', textAlign: 'center', color: t.fueraSLAPorResolucion > 0 ? '#A32D2D' : 'var(--muted-foreground)' }}>{t.fueraSLAPorResolucion}</span>
                <span style={{ fontSize: '12px', textAlign: 'center', color: t.fueraSLAPorAmbos > 0 ? '#A32D2D' : 'var(--muted-foreground)' }}>{t.fueraSLAPorAmbos}</span>
              </div>
            )
          })
        )}
      </div>

      {/* Tabla 3 — Niveles de escalamiento */}
      <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Tabla 3 — Distribución por niveles de escalamiento</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px 100px 110px', gap: '8px', padding: '0 0 8px', borderBottom: '0.5px solid var(--border)' }}>
          {['Proveedor', 'Resp. N1', 'Resp. N2', 'Resp. N3', 'Resp. N4+', 'Sin respuesta', '% llegó a N2+'].map((h) => (
            <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
          ))}
        </div>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px 100px 110px', gap: '8px', padding: '10px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
              {Array.from({ length: 7 }).map((_, j) => <Sk key={j} w={j === 0 ? '70%' : '40%'} />)}
            </div>
          ))
        ) : niveles.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '20px 0', textAlign: 'center' }}>Sin datos</div>
        ) : (
          niveles.map((n, i) => (
            <div key={n.nombre} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px 100px 110px', gap: '8px', padding: '10px 0', borderBottom: i < niveles.length - 1 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 500 }}>{n.nombre}</span>
              <span style={{ fontSize: '12px', textAlign: 'center', color: n.respondioN1 > 0 ? '#3B6D11' : 'var(--muted-foreground)', fontWeight: n.respondioN1 > 0 ? 600 : 400 }}>{n.respondioN1}</span>
              <span style={{ fontSize: '12px', textAlign: 'center', color: n.respondioN2 > 0 ? '#854F0B' : 'var(--muted-foreground)' }}>{n.respondioN2}</span>
              <span style={{ fontSize: '12px', textAlign: 'center', color: n.respondioN3 > 0 ? '#A32D2D' : 'var(--muted-foreground)' }}>{n.respondioN3}</span>
              <span style={{ fontSize: '12px', textAlign: 'center', color: n.respondioN4 > 0 ? '#A32D2D' : 'var(--muted-foreground)' }}>{n.respondioN4}</span>
              <span style={{ fontSize: '12px', textAlign: 'center', color: n.sinRespuesta > 0 ? '#A32D2D' : 'var(--muted-foreground)', fontWeight: n.sinRespuesta > 0 ? 600 : 400 }}>{n.sinRespuesta}</span>
              <div style={{ textAlign: 'center' }}>
                <span style={{
                  fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
                  background: n.pctLlegaronN2 > 30 ? '#FCEBEB' : n.pctLlegaronN2 > 10 ? '#FAEEDA' : '#EAF3DE',
                  color: n.pctLlegaronN2 > 30 ? '#A32D2D' : n.pctLlegaronN2 > 10 ? '#854F0B' : '#3B6D11',
                }}>
                  {n.pctLlegaronN2}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tabla 4 — Casos fuera de SLA */}
      <div style={{ background: 'white', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>Tabla 4 — Casos fuera de SLA ({casosFiltrados.length})</div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Incidentes evaluables que no cumplieron el objetivo de respuesta o resolución</div>
          </div>
          <input
            placeholder="Buscar código, tienda, proveedor…"
            value={casosBusqueda}
            onChange={(e) => setCasosBusqueda(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', outline: 'none', width: '220px' }}
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: '900px' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 80px 1fr 90px 90px 90px 80px 80px 1fr', gap: '8px', padding: '0 0 8px', borderBottom: '0.5px solid var(--border)' }}>
              {['Código', 'Tienda', 'Proveedor', 'Tipo', 'T.Resp', 'T.Resol', 'SLA Resp', 'SLA Resol', 'Motivo'].map((h) => (
                <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
              ))}
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 80px 1fr 90px 90px 90px 80px 80px 1fr', gap: '8px', padding: '10px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
                    {Array.from({ length: 9 }).map((_, j) => <Sk key={j} w={j === 0 || j === 8 ? '70%' : '50%'} />)}
                  </div>
                ))
              ) : casosFiltrados.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '24px 0', textAlign: 'center' }}>
                  {(data?.casosFueraSLA ?? []).length === 0 ? '✓ Todos los casos evaluables cumplen SLA en el período' : 'Sin resultados para la búsqueda'}
                </div>
              ) : (
                casosFiltrados.map((c, i) => (
                  <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '100px 80px 1fr 90px 90px 90px 80px 80px 1fr', gap: '8px', padding: '9px 0', borderBottom: i < casosFiltrados.length - 1 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>{c.codigo}</span>
                    <span style={{ fontSize: '11px', fontWeight: 500 }}>{c.tiendaCodigo}</span>
                    <span style={{ fontSize: '12px' }}>{c.provNombre}</span>
                    <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{fmtTipo(c.tipo)}</span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: !c.slaRespuesta ? '#A32D2D' : '#3B6D11', fontWeight: !c.slaRespuesta ? 600 : 400 }}>
                      {fmtMin(c.tPrimeraRespuestaMin)}
                    </span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: !c.slaResolucion ? '#A32D2D' : '#3B6D11', fontWeight: !c.slaResolucion ? 600 : 400 }}>
                      {fmtMin(c.tResolucionMin)}
                    </span>
                    {(() => { const d = fmtSLA({ score: c.scoreEficiencia, tRealMin: c.tPrimeraRespuestaMin, tLimiteMin: 60 }); return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '999px', background: d.bg, color: d.color, textAlign: 'center', whiteSpace: 'nowrap' }}>{d.texto}</span>
                        {d.subTexto && <span style={{ fontSize: '9px', color: '#6B7280', textAlign: 'center', whiteSpace: 'nowrap' }}>{d.subTexto}</span>}
                      </div>
                    )})()}
                    {(() => { const lim = SLA_RESOLUCION_DEFAULT_MIN; const d = fmtSLA({ score: c.scoreEficiencia, tRealMin: c.tResolucionMin, tLimiteMin: lim }); return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '999px', background: d.bg, color: d.color, textAlign: 'center', whiteSpace: 'nowrap' }}>{d.texto}</span>
                        {d.subTexto && <span style={{ fontSize: '9px', color: '#6B7280', textAlign: 'center', whiteSpace: 'nowrap' }}>{d.subTexto}</span>}
                      </div>
                    )})()}
                    <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{c.motivoIncumplimiento}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Methodology footer */}
      <div style={{ marginTop: '8px', padding: '8px 12px', background: '#F9FAFB', border: '0.5px solid #e5e7eb', borderRadius: '7px', fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: 1.7 }}>
        <strong>Metodología:</strong> Se evalúan incidentes en estado RESUELTO con hora_fin registrada y proveedor asignado. Cuando existe tracking N1 (correo_n1 + escalamiento): el SLA requiere respuesta en ≤60 min sin escalar a N2, y resolución dentro del objetivo por tipo medida desde el correo N1. Sin tracking N1: se evalúa solo tiempo de resolución (MTTR) desde hora_registro vs objetivo por tipo.
      </div>
    </div>
  )
}

// ─── Page with Suspense ───────────────────────────────────────────────────────

export default function SLAProveedorPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '14px' }}>Cargando…</div>}>
      <SLAProveedorPageInner />
    </Suspense>
  )
}
