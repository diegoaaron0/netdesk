'use client'
import { Suspense, useState, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { ImpactoProveedorResponse, ProveedorMetricas } from '@/types/provider-impact'

function fmtMin(min: number | null | undefined) {
  if (!min) return '—'
  const h = Math.floor(min / 60); const m = Math.round(min % 60)
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
function firstDayOfMonth() {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}
function todayStr() { return new Date().toISOString().split('T')[0] }

function estadoBadge(estado: ProveedorMetricas['estado']) {
  if (estado === 'optimo')    return { label: '✓ Óptimo',    color: '#3B6D11', bg: '#EAF3DE' }
  if (estado === 'en_riesgo') return { label: '⚠ En riesgo', color: '#854F0B', bg: '#FAEEDA' }
  if (estado === 'critico')   return { label: '✗ Crítico',   color: '#A32D2D', bg: '#FCEBEB' }
  return                               { label: '— Sin datos', color: '#888780', bg: '#F3F4F6' }
}

function riesgoBadge(score: number) {
  if (score >= 60) return { label: 'Alto',  color: '#A32D2D', bg: '#FCEBEB' }
  if (score >= 35) return { label: 'Medio', color: '#854F0B', bg: '#FAEEDA' }
  return                   { label: 'Bajo',  color: '#3B6D11', bg: '#EAF3DE' }
}

function slaColor(pct: number | null) {
  if (pct == null) return '#888780'
  if (pct >= 90) return '#3B6D11'
  if (pct >= 70) return '#854F0B'
  return '#A32D2D'
}

function SlaCell({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: '#888780' }}>—</span>
  const color = slaColor(pct)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <div style={{ width: '36px', height: '4px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '4px', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontWeight: 600, color, fontSize: '11px' }}>{pct}%</span>
    </div>
  )
}

function ResumenCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: 600, color: color ?? '#0f172a', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

function ImpactoProveedorContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const initialDesde = searchParams.get('desde') || firstDayOfMonth()
  const initialHasta = searchParams.get('hasta') || todayStr()
  const initialProv  = searchParams.get('proveedorId') || ''
  const fromDashboard = !!(searchParams.get('desde') || searchParams.get('hasta') || searchParams.get('proveedorId'))

  const [desde, setDesde]             = useState(initialDesde)
  const [hasta, setHasta]             = useState(initialHasta)
  const [proveedorId, setProveedorId] = useState(initialProv)
  const [data, setData]               = useState<ImpactoProveedorResponse | null>(null)
  const [loading, setLoading]         = useState(false)
  const [expandedProv, setExpandedProv] = useState<string | null>(null)

  const fetchData = useCallback(async (d = desde, h = hasta, pId = proveedorId) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde: d, hasta: h })
      if (pId) params.set('proveedorId', pId)
      const res = await fetch(`/api/dashboard/impacto-proveedor?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [])

  const resumen     = data?.resumen
  const proveedores = data?.proveedores ?? []
  const topInc      = data?.topIncidentes ?? []
  const conclusiones = data?.conclusiones ?? []
  const provLista   = data?.proveedoresList ?? []
  const globalMttr  = resumen?.globalMttrMin ?? null

  return (
    <div style={{ maxWidth: '100%' }}>

      {/* Header compacto — igual que A */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <button onClick={() => router.push('/dashboard?tab=analitico')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#185FA5', fontWeight: 500, padding: 0, flexShrink: 0 }}>
          ← Volver
        </button>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>B. Impacto por proveedor</span>
      </div>

      {/* Filtros — mismos estilos que A */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px', padding: '7px 10px', background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px' }}>
        {fromDashboard && (
          <span style={{ fontSize: '10px', padding: '1px 6px', background: '#E6F1FB', color: '#185FA5', borderRadius: '5px', fontWeight: 500 }}>
            Filtro del dashboard
          </span>
        )}
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          style={{ padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', outline: 'none' }} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          style={{ padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', outline: 'none' }} />
        <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}
          style={{ padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {provLista.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <button onClick={() => fetchData()}
          style={{ padding: '5px 12px', fontSize: '11px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
          ↻ Actualizar
        </button>
        <button onClick={() => { const d = firstDayOfMonth(), h = todayStr(); setDesde(d); setHasta(h); setProveedorId(''); fetchData(d, h, '') }}
          style={{ padding: '5px 12px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', cursor: 'pointer', background: 'white', color: 'var(--foreground)' }}>
          Limpiar
        </button>
      </div>

      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando...</div>
      )}

      {!loading && data && (
        <>
          {/* Resumen strip — misma ResumenCard que A */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <ResumenCard label="Proveedores activos" value={String(resumen?.totalProveedores ?? 0)} sub="con incidentes en el período" />
            <ResumenCard
              label="Mayor nº incidentes"
              value={resumen?.proveedorMasIncidentes ?? '—'}
              sub={`${proveedores[0]?.incidentes ?? 0} incidentes`}
              color="#EA580C"
            />
            <ResumenCard
              label="MTTR promedio global"
              value={fmtMin(resumen?.globalMttrMin)}
              sub="tiempo medio de resolución"
              color={resumen?.globalMttrMin != null ? (resumen.globalMttrMin < 120 ? '#3B6D11' : resumen.globalMttrMin < 240 ? '#854F0B' : '#A32D2D') : undefined}
            />
            <ResumenCard
              label="SLA global del período"
              value={resumen?.globalSlaPct != null ? `${resumen.globalSlaPct}%` : '—'}
              sub="meta: ≥ 90%"
              color={resumen?.globalSlaPct != null ? slaColor(resumen.globalSlaPct) : undefined}
            />
            <ResumenCard
              label="I.E.I total estimado"
              value={fmtCosto(resumen?.totalCosto ?? 0)}
              sub="impacto económico de indisponibilidad"
            />
            <ResumenCard
              label="Mayor impacto económico"
              value={resumen?.proveedorMasCostoso ?? '—'}
              sub={proveedores.length > 0 ? fmtCosto([...proveedores].sort((a, b) => b.costoTotal - a.costoTotal)[0]?.costoTotal ?? 0) : '—'}
              color="#A32D2D"
            />
          </div>

          {/* Tabla principal — mismo contenedor que A */}
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px' }}>
            <div style={{ padding: '7px 12px', borderBottom: '0.5px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Resumen por proveedor</span>
              <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Clic en una fila para ver los incidentes de ese proveedor</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    {[
                      { label: '', w: '16px' },
                      { label: 'Proveedor' },
                      { label: 'Incidentes', align: 'center' },
                      { label: 'Evaluables SLA', align: 'center', title: 'Incidentes RESUELTOS con correo N1 enviado — únicos donde se puede medir cumplimiento del proveedor' },
                      { label: 'Dentro SLA', align: 'center' },
                      { label: 'Fuera SLA', align: 'center' },
                      { label: 'SLA%', title: '% de evaluables que cumplieron tiempos de respuesta y resolución contractuales' },
                      { label: 'MTTR', title: 'Tiempo Medio de Resolución — promedio desde registro hasta resolución' },
                      { label: 'I.E.I est.' },
                      { label: 'Tiendas', align: 'center' },
                      { label: 'Reincid.', align: 'center', title: 'Tiendas con 2 o más incidentes en el período' },
                      { label: 'Riesgo', align: 'center', title: 'Índice relativo al período: costo 35% · SLA 25% · MTTR 20% · reincidencia 10% · vol. 10%' },
                    ].map((h) => (
                      <th key={h.label} title={h.title}
                        style={{ padding: '5px 7px', textAlign: (h.align ?? 'left') as any, fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '0.5px solid #e5e7eb', width: h.w, cursor: h.title ? 'help' : undefined }}>
                        {h.label}{h.title && <span style={{ marginLeft: '2px', fontSize: '9px', color: '#94a3b8' }}>?</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {proveedores.length === 0 && (
                    <tr><td colSpan={12} style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos en el período seleccionado</td></tr>
                  )}
                  {proveedores.map((p, idx) => {
                    const badge   = estadoBadge(p.estado)
                    const riesgo  = riesgoBadge(p.score)
                    const isOpen  = expandedProv === p.nombre
                    const incsProv = topInc.filter((i) => i.provNombre === p.nombre)
                    const mttrDelta = globalMttr != null && p.mttrMinutos != null ? p.mttrMinutos - globalMttr : null
                    return (
                      <>
                        <tr
                          key={p.id}
                          onClick={() => setExpandedProv(isOpen ? null : p.nombre)}
                          style={{
                            borderTop: idx > 0 ? '0.5px solid #e5e7eb' : 'none',
                            background: isOpen ? '#EEF4FF' : p.estado === 'critico' ? '#FFF5F5' : 'transparent',
                            cursor: 'pointer',
                            borderLeft: isOpen ? '3px solid #185FA5' : '3px solid transparent',
                          }}
                        >
                          <td style={{ padding: '5px 6px', width: '16px', color: '#64748b', fontSize: '10px', textAlign: 'center' }}>
                            {isOpen ? '▼' : '▶'}
                          </td>
                          <td style={{ padding: '5px 7px', fontSize: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ fontWeight: 500 }}>{p.nombre}</span>
                              <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '999px', background: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>{badge.label}</span>
                            </div>
                          </td>
                          <td style={{ padding: '5px 7px', fontSize: '12px', textAlign: 'center', fontWeight: 600 }}>{p.incidentes}</td>
                          <td style={{ padding: '5px 7px', fontSize: '12px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                            {p.evaluables > 0 ? p.evaluables : '—'}
                          </td>
                          <td style={{ padding: '5px 7px', fontSize: '12px', textAlign: 'center', color: '#3B6D11', fontWeight: 500 }}>{p.dentraSLA}</td>
                          <td style={{ padding: '5px 7px', fontSize: '12px', textAlign: 'center', color: p.fueraSLA > 0 ? '#A32D2D' : 'var(--muted-foreground)', fontWeight: p.fueraSLA > 0 ? 700 : 400 }}>
                            {p.fueraSLA > 0 ? p.fueraSLA : '—'}
                          </td>
                          <td style={{ padding: '5px 7px' }}><SlaCell pct={p.slaPct} /></td>
                          <td style={{ padding: '5px 7px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            <span style={{ color: p.mttrMinutos != null && p.mttrMinutos > 240 ? '#A32D2D' : p.mttrMinutos != null && p.mttrMinutos > 120 ? '#854F0B' : '#3B6D11', fontWeight: 500 }}>
                              {fmtMin(p.mttrMinutos)}
                            </span>
                            {mttrDelta != null && (
                              <span style={{ fontSize: '10px', color: mttrDelta > 0 ? '#A32D2D' : '#3B6D11', marginLeft: '3px' }}>
                                {mttrDelta > 0 ? `+${fmtMin(mttrDelta)}` : `-${fmtMin(Math.abs(mttrDelta))}`}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '5px 7px', fontSize: '11px', fontFamily: 'monospace' }}>
                            {p.costoTotal > 0 ? fmtCosto(p.costoTotal) : <span style={{ color: '#888780' }}>—</span>}
                          </td>
                          <td style={{ padding: '5px 7px', fontSize: '12px', textAlign: 'center' }}>{p.tiendasAfectadas}</td>
                          <td style={{ padding: '5px 7px', fontSize: '12px', textAlign: 'center' }}>
                            {p.reincidencia > 0
                              ? <span style={{ color: '#A32D2D', fontWeight: 700 }}>{p.reincidencia}</span>
                              : <span style={{ color: '#888780' }}>—</span>}
                          </td>
                          <td style={{ padding: '5px 7px', textAlign: 'center' }}>
                            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', fontWeight: 600, whiteSpace: 'nowrap', background: riesgo.bg, color: riesgo.color }}>
                              {riesgo.label}
                            </span>
                          </td>
                        </tr>

                        {/* Accordion: incidentes del proveedor */}
                        {isOpen && (
                          <tr key={`${p.id}-detail`}>
                            <td colSpan={12} style={{ padding: 0, borderLeft: '3px solid #185FA5', borderTop: '0.5px solid #c7d9f5', borderBottom: '0.5px solid #c7d9f5' }}>
                              {incsProv.length === 0 ? (
                                <div style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                                  Sin incidentes resueltos con MTTR registrado para este proveedor en el período.
                                </div>
                              ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#F8FAFF' }}>
                                  <thead>
                                    <tr style={{ background: '#EEF4FF' }}>
                                      {['Código', 'Tienda', 'Tipo', 'MTTR', 'I.E.I est.', 'SLA', 'Motivo incumplimiento', 'Fecha'].map((h) => (
                                        <th key={h} style={{ padding: '4px 7px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: '#185FA5', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '0.5px solid #c7d9f5' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {incsProv.map((inc, j) => (
                                      <tr key={j} style={{ borderTop: j > 0 ? '0.5px solid #dde4ef' : 'none' }}>
                                        <td style={{ padding: '4px 7px', fontFamily: 'monospace', fontSize: '10px', color: '#185FA5' }}>{inc.codigo}</td>
                                        <td style={{ padding: '4px 7px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                          <span style={{ fontWeight: 500 }}>{inc.tiendaCodigo}</span>
                                          {inc.tiendaNombre && <span style={{ color: 'var(--muted-foreground)', marginLeft: '4px', fontSize: '10px' }}> — {inc.tiendaNombre}</span>}
                                        </td>
                                        <td style={{ padding: '4px 7px', fontSize: '11px', color: 'var(--muted-foreground)' }}>{fmtTipo(inc.tipo)}</td>
                                        <td style={{ padding: '4px 7px', fontSize: '11px', fontFamily: 'monospace', color: (inc.mttrMinutos ?? 0) > 240 ? '#A32D2D' : (inc.mttrMinutos ?? 0) > 120 ? '#854F0B' : '#3B6D11', fontWeight: 500 }}>
                                          {fmtMin(inc.mttrMinutos)}
                                        </td>
                                        <td style={{ padding: '4px 7px', fontSize: '11px', fontFamily: 'monospace', fontWeight: 600 }}>{fmtCosto(inc.costoEstimado)}</td>
                                        <td style={{ padding: '4px 7px' }}>
                                          {inc.slaGeneral === null
                                            ? <span style={{ fontSize: '10px', color: '#888780' }}>Sin esc.</span>
                                            : inc.slaGeneral
                                              ? <span style={{ fontSize: '10px', color: '#3B6D11', fontWeight: 600 }}>✓ OK</span>
                                              : <span style={{ fontSize: '10px', color: '#A32D2D', fontWeight: 600 }}>✗ Fuera</span>}
                                        </td>
                                        <td style={{ padding: '4px 7px', fontSize: '10px', color: inc.motivoIncumplimiento ? '#854F0B' : '#888780' }}>
                                          {inc.motivoIncumplimiento ?? '—'}
                                        </td>
                                        <td style={{ padding: '4px 7px', fontSize: '11px', color: 'var(--muted-foreground)' }}>{inc.diaFmt}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Conclusiones — mismo estilo que A */}
          {conclusiones.length > 0 && (
            <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px', marginBottom: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '7px 12px', borderBottom: '0.5px solid #e5e7eb', fontSize: '12px', fontWeight: 600 }}>
                Conclusiones del período
              </div>
              <div style={{ padding: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                {conclusiones.map((c, i) => {
                  const icons = ['📊', '🚨', '💰', '⚠️', '📋']
                  return (
                    <div key={i} style={{ display: 'flex', gap: '8px', padding: '8px 10px', background: '#F9FAFB', border: '0.5px solid #e5e7eb', borderRadius: '7px' }}>
                      <span style={{ fontSize: '14px', flexShrink: 0 }}>{icons[i] ?? '•'}</span>
                      <span style={{ fontSize: '11px', lineHeight: 1.5 }}>{c}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Nota metodológica — mismo estilo que A */}
          <div style={{ padding: '8px 12px', background: '#F9FAFB', border: '0.5px solid #e5e7eb', borderRadius: '7px', fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
            ℹ️ <strong>Evaluables SLA</strong>: incidentes RESUELTOS con correo N1 enviado. <strong>MTTR</strong>: tiempo desde registro hasta resolución. <strong>I.E.I</strong>: venta/hora × (MTTR/60) × factor × 35% margen. <strong>Riesgo</strong>: índice relativo al período, no absoluto.
          </div>
        </>
      )}
    </div>
  )
}

export default function ImpactoProveedorPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', fontSize: '12px' }}>Cargando...</div>}>
      <ImpactoProveedorContent />
    </Suspense>
  )
}
