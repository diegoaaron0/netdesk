'use client'
import { useState, useEffect, useCallback, Suspense, Fragment } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fmtSLARespResol } from '@/lib/sla-display'
import { SLA_RESOLUCION_DEFAULT_MIN } from '@/lib/sla-core'

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
  scoreEficiencia: number | null
  scoreRespuesta: number | null
  scoreResolucion: number | null
  slaResolucionMin: number
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
    <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '999px', background: bg, color, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function ResumenCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{sub}</div>}
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
    if (selectedDia === dia) { setSelectedDia(null); setCasos([]); return }
    setLoadingCasos(true); setSelectedDia(dia)
    try {
      const params = new URLSearchParams({ dia })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/tendencia-sla/fecha?${params}`)
      if (res.ok) { const j = await res.json(); setCasos(j.casos ?? []) }
    } finally { setLoadingCasos(false) }
  }, [proveedorId, selectedDia])

  const resumen      = data?.resumen
  const byDay        = data?.byDay ?? []
  const conclusiones = data?.conclusiones ?? []
  const proveedores  = data?.proveedores ?? []

  const fromDesde = searchParams.get('desde')
  const fromHasta = searchParams.get('hasta')
  const fromProv  = proveedores.find((p) => p.id === searchParams.get('proveedorId'))

  return (
    <div style={{ maxWidth: '100%' }}>

      {/* Header compacto — una sola fila */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <button onClick={() => router.push('/dashboard?tab=analitico')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#185FA5', fontWeight: 500, padding: 0, flexShrink: 0 }}>
          ← Volver
        </button>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Tendencia de incidentes y SLA</span>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px', padding: '7px 10px', background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px' }}>
        {(fromDesde || fromProv) && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginRight: '6px' }}>
            <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Filtro:</span>
            {fromProv && <span style={{ fontSize: '10px', padding: '1px 6px', background: '#E6F1FB', color: '#185FA5', borderRadius: '5px', fontWeight: 500 }}>{fromProv.nombre}</span>}
            {fromDesde && fromHasta && <span style={{ fontSize: '10px', padding: '1px 6px', background: '#E6F1FB', color: '#185FA5', borderRadius: '5px' }}>{fromDesde.split('-').reverse().join('/')} — {fromHasta.split('-').reverse().join('/')}</span>}
          </div>
        )}
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          style={{ padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', outline: 'none' }} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          style={{ padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', outline: 'none' }} />
        <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}
          style={{ padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <button onClick={() => fetchData()}
          style={{ padding: '5px 12px', fontSize: '11px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
          ↻ Actualizar
        </button>
        <button onClick={() => alert('Exportar CSV — próximamente')}
          style={{ padding: '5px 12px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', cursor: 'pointer', background: 'white', color: 'var(--foreground)' }}>
          ↓ CSV
        </button>
      </div>

      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando...</div>
      )}

      {!loading && resumen && (
        <>
          {/* Resumen strip */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <ResumenCard label="Registrados" value={String(resumen.registrados)} sub="Total período" />
            <ResumenCard label="Evaluables SLA" value={String(resumen.evaluables)} />
            <ResumenCard label="SLA general" value={`${resumen.slaPct}%`} sub="Meta: 90%" />
            <ResumenCard label="Fuera SLA" value={String(resumen.fueraSLA)} sub={`${resumen.evaluables > 0 ? Math.round(resumen.fueraSLA / resumen.evaluables * 100) : 0}% del total`} />
            <ResumenCard label="T. prom. respuesta" value={fmtMin(resumen.tPromRespuestaMin)} />
            <ResumenCard label="T. prom. resolución" value={fmtMin(resumen.tPromResolucionMin)} />
          </div>

          {/* Tabla por fecha + expansión inline de casos */}
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px' }}>
            <div style={{ padding: '7px 12px', borderBottom: '0.5px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Resumen por fecha</span>
              <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Clic en una fila para ver los incidentes del día</span>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '520px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>
                  <tr>
                    {['', 'Fecha', 'Inc. reg.', 'Eval.', 'Dentro', 'Fuera', 'SLA%', 'T. resp.', 'T. resol.', 'Nivel prom.', 'Esc. N2+', 'Proveedor', 'Estado'].map((h) => (
                      <th key={h} style={{ padding: '5px 7px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '0.5px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byDay.length === 0 && (
                    <tr><td colSpan={13} style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</td></tr>
                  )}
                  {byDay.map((d, i) => {
                    const est = estadoStyle(d.estado)
                    const isSelected = selectedDia === d.dia
                    return (
                      <Fragment key={d.dia}>
                        <tr
                          onClick={() => fetchCasos(d.dia)}
                          style={{
                            borderTop: i > 0 ? '0.5px solid #e5e7eb' : 'none',
                            background: isSelected ? '#EEF4FF' : d.slaPct != null && d.slaPct < 70 ? '#FFF5F5' : 'transparent',
                            cursor: 'pointer',
                          }}>
                          <td style={{ padding: '5px 6px', width: '16px', color: '#64748b', fontSize: '10px', textAlign: 'center' }}>
                            {isSelected ? '▼' : '▶'}
                          </td>
                          <td style={{ padding: '5px 7px', fontWeight: 500, fontSize: '12px', whiteSpace: 'nowrap', color: d.slaPct != null && d.slaPct < 70 ? '#A32D2D' : '#0f172a' }}>{fmtDia(d.dia)}</td>
                          <td style={{ padding: '5px 7px', fontSize: '12px', textAlign: 'center' }}>{d.registrados}</td>
                          <td style={{ padding: '5px 7px', fontSize: '12px', textAlign: 'center' }}>{d.evaluables}</td>
                          <td style={{ padding: '5px 7px', fontSize: '12px', textAlign: 'center', color: '#3B6D11', fontWeight: 500 }}>{d.dentraSLA}</td>
                          <td style={{ padding: '5px 7px', fontSize: '12px', textAlign: 'center', color: '#A32D2D', fontWeight: 500 }}>{d.fueraSLA}</td>
                          <td style={{ padding: '5px 7px', fontSize: '12px', fontWeight: 600, color: est.color, whiteSpace: 'nowrap' }}>{d.slaPct != null ? `${d.slaPct}%` : '—'}</td>
                          <td style={{ padding: '5px 7px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtMin(d.tPromRespuestaMin)}</td>
                          <td style={{ padding: '5px 7px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtMin(d.tPromResolucionMin)}</td>
                          <td style={{ padding: '5px 7px', fontSize: '12px', textAlign: 'center' }}>{d.nivelPromedioAlcanzado != null ? `Nivel ${d.nivelPromedioAlcanzado}` : '—'}</td>
                          <td style={{ padding: '5px 7px', fontSize: '12px', textAlign: 'center' }}>{d.casosEscaladosN2}</td>
                          <td style={{ padding: '5px 7px', fontSize: '11px', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.proveedorMasAfectado ?? '—'}</td>
                          <td style={{ padding: '5px 7px' }}><Badge bg={est.bg} color={est.color} label={est.label} /></td>
                        </tr>

                        {/* Expansión inline de casos */}
                        {isSelected && (
                          <tr>
                            <td colSpan={13} style={{ padding: 0, borderLeft: '3px solid #185FA5' }}>
                              {loadingCasos ? (
                                <div style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted-foreground)' }}>Cargando incidentes...</div>
                              ) : casos.length === 0 ? (
                                <div style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted-foreground)' }}>Sin incidentes registrados en esta fecha</div>
                              ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#F8FAFF' }}>
                                  <thead>
                                    <tr style={{ background: '#EEF4FF' }}>
                                      {['Código', 'Tienda', 'Proveedor', 'Tipo', 'Nivel', 'T. resp.', 'T. resol.', 'SLA resp.', 'SLA resol.', 'General', 'Motivo'].map((h) => (
                                        <th key={h} style={{ padding: '4px 7px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: '#185FA5', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '0.5px solid #c7d9f5' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {casos.map((c, j) => {
                                      const sG = slaStyle(c.slaGeneral)
                                      const slaD = c.evaluable ? fmtSLARespResol({
                                        scoreResp: c.scoreRespuesta,
                                        scoreResol: c.scoreResolucion,
                                        tRespMin: c.tPrimeraRespuestaMin,
                                        tResolMin: c.tResolucionMin,
                                        limiteRespMin: 60,
                                        limiteResolMin: c.slaResolucionMin || SLA_RESOLUCION_DEFAULT_MIN,
                                      }) : null
                                      return (
                                        <tr key={c.codigo} style={{ borderTop: j > 0 ? '0.5px solid #dde4ef' : 'none' }}>
                                          <td style={{ padding: '4px 7px', fontFamily: 'monospace', fontSize: '10px', color: '#185FA5' }}>{c.codigo}</td>
                                          <td style={{ padding: '4px 7px', fontSize: '11px', whiteSpace: 'nowrap' }}>{c.tiendaCodigo}{c.tiendaNombre ? ` — ${c.tiendaNombre}` : ''}</td>
                                          <td style={{ padding: '4px 7px', fontSize: '11px' }}>{c.provNombre || '—'}</td>
                                          <td style={{ padding: '4px 7px', fontSize: '11px', whiteSpace: 'nowrap' }}>{fmtTipo(c.tipo)}</td>
                                          <td style={{ padding: '4px 7px', fontSize: '11px', textAlign: 'center' }}>{c.nivelQueRespondio != null ? `N${c.nivelQueRespondio}` : '—'}</td>
                                          <td style={{ padding: '4px 7px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtMin(c.tPrimeraRespuestaMin)}</td>
                                          <td style={{ padding: '4px 7px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtMin(c.tResolucionMin)}</td>
                                          <td style={{ padding: '4px 7px' }}>
                                            {slaD ? (
                                              <div>
                                                <Badge bg={slaD.respuesta.bg} color={slaD.respuesta.color} label={slaD.respuesta.texto} />
                                                {slaD.respuesta.subTexto && <div style={{ fontSize: '9px', color: '#6B7280', marginTop: '1px', whiteSpace: 'nowrap' }}>{slaD.respuesta.subTexto}</div>}
                                              </div>
                                            ) : <span style={{ fontSize: '10px', color: '#888' }}>N/A</span>}
                                          </td>
                                          <td style={{ padding: '4px 7px' }}>
                                            {slaD ? (
                                              <div>
                                                <Badge bg={slaD.resolucion.bg} color={slaD.resolucion.color} label={slaD.resolucion.texto} />
                                                {slaD.resolucion.subTexto && <div style={{ fontSize: '9px', color: '#6B7280', marginTop: '1px', whiteSpace: 'nowrap' }}>{slaD.resolucion.subTexto}</div>}
                                              </div>
                                            ) : <span style={{ fontSize: '10px', color: '#888' }}>N/A</span>}
                                          </td>
                                          <td style={{ padding: '4px 7px' }}>{c.evaluable ? <Badge bg={sG.bg} color={sG.color} label={sG.label} /> : <span style={{ fontSize: '10px', color: '#888' }}>N/A</span>}</td>
                                          <td style={{ padding: '4px 7px', fontSize: '10px', color: c.motivoIncumplimiento ? '#854F0B' : 'var(--muted-foreground)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {c.motivoIncumplimiento ?? '—'}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Conclusiones */}
          {conclusiones.length > 0 && (
            <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px', marginBottom: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '7px 12px', borderBottom: '0.5px solid #e5e7eb', fontSize: '12px', fontWeight: 600 }}>
                Conclusiones automáticas <span style={{ fontWeight: 400, fontSize: '10px', color: 'var(--muted-foreground)' }}>(generadas por el sistema)</span>
              </div>
              <div style={{ padding: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                {conclusiones.map((c, i) => {
                  const icons = ['📉', '🏢', '✗', '⏱', '🛡']
                  return (
                    <div key={i} style={{ display: 'flex', gap: '8px', padding: '8px 10px', background: '#F9FAFB', border: '0.5px solid #e5e7eb', borderRadius: '7px' }}>
                      <span style={{ fontSize: '14px', flexShrink: 0 }}>{icons[i % icons.length]}</span>
                      <span style={{ fontSize: '11px', lineHeight: 1.5 }}>{c}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Nota al pie */}
          <div style={{ padding: '8px 12px', background: '#F9FAFB', border: '0.5px solid #e5e7eb', borderRadius: '7px', fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
            ℹ️ SLA = tiempo de primera respuesta por correo (Nivel 1) + tiempo de resolución final. Incidentes abiertos no se incluyen en el cálculo. Cada nivel tiene 1 hora para responder antes de escalar.
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
