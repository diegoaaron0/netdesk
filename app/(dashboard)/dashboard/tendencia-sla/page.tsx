'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayData {
  dia: string
  registrados: number
  evaluables: number
  dentraSLA: number
  fueraSLA: number
  slaPct: number | null
  tPromRespuestaMin: number | null
  tPromResolucionMin: number | null
  nivelPromedioAlcanzado: number | null
  casosEscaladosN2: number
  proveedorMasAfectado: string | null
  causaPrincipal: string | null
  estado: string
}

interface TiendaResumen {
  tiendaCodigo: string
  tiendaNombre: string
  proveedorNombre: string
  evaluables: number
  slaPct: number | null
  tPromResolucionMin: number | null
}

interface Resumen {
  registrados: number
  evaluables: number
  slaPct: number
  fueraSLA: number
  tPromRespuestaMin: number | null
  tPromResolucionMin: number | null
}

interface Caso {
  codigo: string
  tiendaCodigo: string
  tiendaNombre: string
  provNombre: string
  tipo: string
  evaluable: boolean
  nivelQueRespondio: number | null
  tPrimeraRespuestaMin: number | null
  tResolucionMin: number | null
  slaRespuesta: boolean
  slaResolucion: boolean
  slaGeneral: boolean
  motivoIncumplimiento: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMin(min: number | null | undefined) {
  if (!min) return '—'
  const h = Math.floor(min / 60); const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function fmtDia(dia: string) {
  const [y, mo, d] = dia.split('-')
  return `${d}/${mo}/${y}`
}
function fmtTipo(t: string) {
  const m: Record<string, string> = { CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia', LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros' }
  return m[t] ?? t
}

function estadoStyle(estado: string): { bg: string; color: string; label: string } {
  if (estado === 'optimo')    return { bg: '#EAF3DE', color: '#3B6D11', label: 'Óptimo' }
  if (estado === 'en_riesgo') return { bg: '#FAEEDA', color: '#854F0B', label: 'En riesgo' }
  if (estado === 'critico')   return { bg: '#FCEBEB', color: '#A32D2D', label: 'Crítico' }
  return { bg: '#F5F5F3', color: '#888780', label: 'Sin datos' }
}

function slaStyle(v: boolean): { bg: string; color: string; label: string } {
  return v
    ? { bg: '#EAF3DE', color: '#3B6D11', label: 'Cumplió' }
    : { bg: '#FCEBEB', color: '#A32D2D', label: 'No cumplió' }
}

function slaPctColor(v: number | null): string {
  if (v == null) return '#888780'
  if (v < 70) return '#A32D2D'
  if (v < 90) return '#BA7517'
  return '#1D9E75'
}

function Badge({ bg, color, label }: { bg: string; color: string; label: string }) {
  return (
    <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '999px', background: bg, color, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function ResumenCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 600, color: '#0f172a', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '3px' }}>{sub}</div>}
    </div>
  )
}

// ─── Inner Page (needs useSearchParams) ──────────────────────────────────────

function TendenciaSLAPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initDesde = searchParams.get('desde') ?? (() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })()
  const initHasta = searchParams.get('hasta') ?? new Date().toISOString().split('T')[0]
  const initProv  = searchParams.get('proveedorId') ?? ''

  const [desde, setDesde] = useState(initDesde)
  const [hasta, setHasta] = useState(initHasta)
  const [proveedorId, setProveedorId] = useState(initProv)
  const [data, setData] = useState<{
    byDay: DayData[]
    resumen: Resumen
    conclusiones: string[]
    proveedores: Array<{ id: string; nombre: string }>
    byTienda?: TiendaResumen[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedDia, setSelectedDia] = useState<string | null>(null)
  const [casos, setCasos] = useState<Caso[]>([])
  const [loadingCasos, setLoadingCasos] = useState(false)

  const fetchData = useCallback(async (d = desde, h = hasta, pId = proveedorId) => {
    setLoading(true); setSelectedDia(null); setCasos([])
    try {
      const params = new URLSearchParams({ desde: d, hasta: h })
      if (pId) params.set('proveedorId', pId)
      const res = await fetch(`/api/dashboard/tendencia-sla?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [])

  const fetchCasos = useCallback(async (dia: string) => {
    setLoadingCasos(true); setSelectedDia(dia)
    try {
      const params = new URLSearchParams({ dia })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/tendencia-sla/fecha?${params}`)
      if (res.ok) { const j = await res.json(); setCasos(j.casos ?? []) }
    } finally { setLoadingCasos(false) }
  }, [proveedorId])

  const resumen      = data?.resumen
  const byDay        = data?.byDay ?? []
  const conclusiones = data?.conclusiones ?? []
  const proveedores  = data?.proveedores ?? []
  const byTienda     = (data?.byTienda ?? []).slice().sort((a, b) => {
    if (a.slaPct == null) return 1
    if (b.slaPct == null) return -1
    return a.slaPct - b.slaPct
  })

  const fromDesde = searchParams.get('desde')
  const fromHasta = searchParams.get('hasta')
  const fromProv  = proveedores.find((p) => p.id === searchParams.get('proveedorId'))

  return (
    <div style={{ maxWidth: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <button onClick={() => router.push('/dashboard')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#185FA5', fontWeight: 500, padding: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ← Volver al Dashboard
        </button>
        <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
          Detalle — Tendencia de incidentes y SLA
        </h1>
        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '3px' }}>
          Análisis por fecha del volumen de incidentes y cumplimiento SLA de proveedores.
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px', padding: '10px 12px', background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px' }}>
        {(fromDesde || fromProv) && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginRight: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Filtro desde dashboard:</span>
            {fromProv && <span style={{ fontSize: '11px', padding: '2px 8px', background: '#E6F1FB', color: '#185FA5', borderRadius: '6px', fontWeight: 500 }}>Proveedor: {fromProv.nombre}</span>}
            {fromDesde && fromHasta && <span style={{ fontSize: '11px', padding: '2px 8px', background: '#E6F1FB', color: '#185FA5', borderRadius: '6px' }}>{fromDesde.split('-').reverse().join('/')} — {fromHasta.split('-').reverse().join('/')}</span>}
          </div>
        )}
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', outline: 'none' }} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', outline: 'none' }} />
        <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <button onClick={() => fetchData()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>
          ↻ Actualizar
        </button>
        <button onClick={() => alert('Exportar CSV — próximamente')}
          style={{ padding: '6px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'white', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '5px' }}>
          ↓ Exportar CSV
        </button>
      </div>

      {loading && (
        <div style={{ padding: '60px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando...</div>
      )}

      {!loading && resumen && (
        <>
          {/* 6 Cards resumen */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <ResumenCard label="Incidentes registrados" value={String(resumen.registrados)} sub="En el período" />
            <ResumenCard label="Incidentes evaluables SLA" value={String(resumen.evaluables)} sub="Solo los evaluables" />
            <ResumenCard label="SLA general" value={`${resumen.slaPct}%`} sub="Meta: 90%" />
            <ResumenCard label="Fuera SLA" value={String(resumen.fueraSLA)} sub={`${resumen.evaluables > 0 ? Math.round(resumen.fueraSLA / resumen.evaluables * 100) : 0}% del total`} />
            <ResumenCard label="T. prom. primera respuesta" value={fmtMin(resumen.tPromRespuestaMin)} />
            <ResumenCard label="T. prom. resolución final" value={fmtMin(resumen.tPromResolucionMin)} />
          </div>

          {/* TABLA 1 — Resumen por fecha (full width) */}
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px' }}>
            <div style={{ padding: '12px 14px', borderBottom: '0.5px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>2. Resumen por fecha</span>
              <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>ⓘ Haz clic en una fila para ver los casos del día.</span>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '420px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>
                  <tr>
                    {['Fecha', 'Inc. reg.', 'Eval. SLA', 'Dentro', 'Fuera', 'SLA%', 'T. resp.', 'T. resol.', 'Nivel prom.', 'Esc. N2+', 'Proveedor', 'Estado'].map((h) => (
                      <th key={h} style={{ padding: '8px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '0.5px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byDay.length === 0 && (
                    <tr><td colSpan={12} style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</td></tr>
                  )}
                  {byDay.map((d, i) => {
                    const est = estadoStyle(d.estado)
                    const isSelected = selectedDia === d.dia
                    return (
                      <tr key={d.dia}
                        onClick={() => fetchCasos(d.dia)}
                        style={{
                          borderTop: i > 0 ? '0.5px solid #e5e7eb' : 'none',
                          background: isSelected ? '#F0F6FF' : d.slaPct != null && d.slaPct < 70 ? '#FFF5F5' : 'transparent',
                          cursor: 'pointer',
                        }}>
                        <td style={{ padding: '7px 8px', fontWeight: 500, fontSize: '12px', whiteSpace: 'nowrap', color: d.slaPct != null && d.slaPct < 70 ? '#A32D2D' : '#0f172a' }}>{fmtDia(d.dia)}</td>
                        <td style={{ padding: '7px 8px', fontSize: '12px', textAlign: 'center' }}>{d.registrados}</td>
                        <td style={{ padding: '7px 8px', fontSize: '12px', textAlign: 'center' }}>{d.evaluables}</td>
                        <td style={{ padding: '7px 8px', fontSize: '12px', textAlign: 'center', color: '#3B6D11', fontWeight: 500 }}>{d.dentraSLA}</td>
                        <td style={{ padding: '7px 8px', fontSize: '12px', textAlign: 'center', color: '#A32D2D', fontWeight: 500 }}>{d.fueraSLA}</td>
                        <td style={{ padding: '7px 8px', fontSize: '12px', fontWeight: 600, color: est.color, whiteSpace: 'nowrap' }}>{d.slaPct != null ? `${d.slaPct}%` : '—'}</td>
                        <td style={{ padding: '7px 8px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtMin(d.tPromRespuestaMin)}</td>
                        <td style={{ padding: '7px 8px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtMin(d.tPromResolucionMin)}</td>
                        <td style={{ padding: '7px 8px', fontSize: '12px', textAlign: 'center' }}>{d.nivelPromedioAlcanzado != null ? `Nivel ${d.nivelPromedioAlcanzado}` : '—'}</td>
                        <td style={{ padding: '7px 8px', fontSize: '12px', textAlign: 'center' }}>{d.casosEscaladosN2}</td>
                        <td style={{ padding: '7px 8px', fontSize: '11px', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.proveedorMasAfectado ?? '—'}</td>
                        <td style={{ padding: '7px 8px' }}><Badge bg={est.bg} color={est.color} label={est.label} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* TABLA 2 — Resumen por tienda */}
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px' }}>
            <div style={{ padding: '12px 14px', borderBottom: '0.5px solid #e5e7eb', fontSize: '13px', fontWeight: 600 }}>
              3. Resumen por tienda
              <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: '8px' }}>Ordenado por SLA% ascendente — peor primero</span>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '380px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>
                  <tr>
                    {['Tienda', 'Proveedor', 'Evaluables', 'SLA%', 'T. Resol. prom.'].map((h) => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '0.5px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byTienda.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos de tienda disponibles</td></tr>
                  )}
                  {byTienda.map((t, i) => (
                    <tr key={t.tiendaCodigo} style={{ borderTop: i > 0 ? '0.5px solid #e5e7eb' : 'none' }}>
                      <td style={{ padding: '8px 10px', fontSize: '12px' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted-foreground)', marginRight: '6px' }}>{t.tiendaCodigo}</span>
                        {t.tiendaNombre}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: '12px' }}>{t.proveedorNombre}</td>
                      <td style={{ padding: '8px 10px', fontSize: '12px', textAlign: 'center' }}>{t.evaluables}</td>
                      <td style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 600, color: slaPctColor(t.slaPct) }}>
                        {t.slaPct != null ? `${t.slaPct}%` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: '11px', fontFamily: 'monospace' }}>{fmtMin(t.tPromResolucionMin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* TABLA 3 — Drill-down por fecha */}
          {selectedDia && (
            <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', marginBottom: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '0.5px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>4. Casos que explican la caída ({fmtDia(selectedDia)})</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginLeft: '8px' }}>ⓘ Incidentes abiertos no incluidos</span>
                </div>
                <button onClick={() => { setSelectedDia(null); setCasos([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
              </div>
              {loadingCasos ? (
                <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando casos...</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f9fafb' }}>
                      <tr>
                        {['ID Incidente', 'Tienda', 'Proveedor', 'Tipo', 'Nivel resp.', 'T. primera resp.', 'T. resolución', 'SLA resp.', 'SLA resol.', 'SLA general', 'Motivo incumplimiento'].map((h) => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '0.5px solid #e5e7eb' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {casos.length === 0 && (
                        <tr><td colSpan={11} style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin casos en esta fecha</td></tr>
                      )}
                      {casos.map((c, i) => {
                        const sR = slaStyle(c.slaRespuesta)
                        const sResol = slaStyle(c.slaResolucion)
                        const sG = slaStyle(c.slaGeneral)
                        return (
                          <tr key={c.codigo} style={{ borderTop: i > 0 ? '0.5px solid #e5e7eb' : 'none' }}>
                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted-foreground)' }}>{c.codigo}</td>
                            <td style={{ padding: '8px 10px', fontSize: '12px' }}>{c.tiendaCodigo} {c.tiendaNombre ? `— ${c.tiendaNombre}` : ''}</td>
                            <td style={{ padding: '8px 10px', fontSize: '12px' }}>{c.provNombre}</td>
                            <td style={{ padding: '8px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}>{fmtTipo(c.tipo)}</td>
                            <td style={{ padding: '8px 10px', fontSize: '12px', textAlign: 'center' }}>{c.nivelQueRespondio != null ? `N${c.nivelQueRespondio}` : '—'}</td>
                            <td style={{ padding: '8px 10px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtMin(c.tPrimeraRespuestaMin)}</td>
                            <td style={{ padding: '8px 10px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtMin(c.tResolucionMin)}</td>
                            <td style={{ padding: '8px 10px' }}>{c.evaluable ? <Badge bg={sR.bg} color={sR.color} label={sR.label} /> : <span style={{ fontSize: '10px', color: '#888' }}>N/A</span>}</td>
                            <td style={{ padding: '8px 10px' }}>{c.evaluable ? <Badge bg={sResol.bg} color={sResol.color} label={sResol.label} /> : <span style={{ fontSize: '10px', color: '#888' }}>N/A</span>}</td>
                            <td style={{ padding: '8px 10px' }}>{c.evaluable ? <Badge bg={sG.bg} color={sG.color} label={sG.label} /> : <span style={{ fontSize: '10px', color: '#888' }}>N/A</span>}</td>
                            <td style={{ padding: '8px 10px', fontSize: '11px', color: c.motivoIncumplimiento ? '#854F0B' : 'var(--muted-foreground)' }}>
                              {c.motivoIncumplimiento ?? '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TABLA 4 — Conclusiones */}
          {conclusiones.length > 0 && (
            <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', marginBottom: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '0.5px solid #e5e7eb', fontSize: '13px', fontWeight: 600 }}>
                5. Conclusiones automáticas <span style={{ fontWeight: 400, fontSize: '11px', color: 'var(--muted-foreground)'}}>(generadas por el sistema)</span>
              </div>
              <div style={{ padding: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                {conclusiones.map((c, i) => {
                  const icons = ['📉', '🏢', '✗', '⏱', '🛡']
                  return (
                    <div key={i} style={{ display: 'flex', gap: '10px', padding: '10px 12px', background: '#F9FAFB', border: '0.5px solid #e5e7eb', borderRadius: '8px' }}>
                      <span style={{ fontSize: '18px', flexShrink: 0 }}>{icons[i % icons.length]}</span>
                      <span style={{ fontSize: '12px', lineHeight: 1.5 }}>{c}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Nota al pie */}
          <div style={{ padding: '10px 14px', background: '#F9FAFB', border: '0.5px solid #e5e7eb', borderRadius: '8px', fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
            ℹ️ El SLA considera el tiempo de primera respuesta por correo desde el Nivel 1 + el tiempo de resolución final desde el mismo punto de partida.
            Los incidentes abiertos no se incluyen en el cálculo de SLA analítico.
            Cada nivel de proveedor tiene 1 hora para responder antes de escalar al siguiente nivel.
          </div>
        </>
      )}
    </div>
  )
}

// ─── Page wrapper (Suspense for useSearchParams) ─────────────────────────────

export default function TendenciaSLAPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', fontSize: '12px' }}>Cargando...</div>}>
      <TendenciaSLAPageInner />
    </Suspense>
  )
}
