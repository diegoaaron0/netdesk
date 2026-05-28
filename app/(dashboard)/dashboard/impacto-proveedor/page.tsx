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

function SlaCell({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: '#888780' }}>—</span>
  const color = pct >= 90 ? '#3B6D11' : pct >= 70 ? '#854F0B' : '#A32D2D'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: '44px', height: '5px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '5px', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontWeight: 600, color, fontSize: '12px' }}>{pct}%</span>
    </div>
  )
}

function SumCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', flex: 1, minWidth: '120px' }}>
      <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 500, marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: color ?? '#0f172a', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

function TH({ children, align = 'left', title }: { children: React.ReactNode; align?: string; title?: string }) {
  return (
    <th title={title} style={{ padding: '8px 10px', textAlign: align as any, fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '0.5px solid #e5e7eb', whiteSpace: 'nowrap', cursor: title ? 'help' : undefined }}>
      {children}{title && <span style={{ marginLeft: '3px', fontSize: '9px', color: '#94a3b8' }}>?</span>}
    </th>
  )
}
function TD({ children, align = 'left', mono = false }: { children: React.ReactNode; align?: string; mono?: boolean }) {
  return (
    <td style={{ padding: '8px 10px', fontSize: '12px', textAlign: align as any, fontFamily: mono ? 'monospace' : undefined, borderTop: '0.5px solid #f3f4f6', verticalAlign: 'middle' }}>
      {children}
    </td>
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
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'inherit' }}>

      {/* Breadcrumb */}
      <button onClick={() => router.push('/dashboard?tab=analitico')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#185FA5', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '16px', padding: 0 }}>
        ← Volver al dashboard analítico
      </button>

      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>B. Impacto por proveedor</div>
        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
          Comparativa de proveedores por incidentes, MTTR, cumplimiento SLA e impacto económico estimado
        </div>
      </div>

      {/* Filters — mismo layout que sección A */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px', padding: '10px 12px', background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 500 }}>Período:</span>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
        <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>–</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
        <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {provLista.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <button onClick={() => fetchData()}
          style={{ padding: '6px 14px', fontSize: '12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>
          Aplicar
        </button>
        <button onClick={() => { const d = firstDayOfMonth(), h = todayStr(); setDesde(d); setHasta(h); setProveedorId(''); fetchData(d, h, '') }}
          style={{ padding: '6px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--card)', color: 'var(--foreground)' }}>
          Limpiar
        </button>
        {fromDashboard && (
          <span style={{ marginLeft: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', background: '#E6F1FB', borderRadius: '999px', fontSize: '11px', color: '#185FA5' }}>
            ● Filtro del dashboard
          </span>
        )}
      </div>

      {loading && (
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: 'var(--muted-foreground)' }}>
          Cargando datos...
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPI strip — 6 tarjetas */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <SumCard label="Proveedores activos" value={String(resumen?.totalProveedores ?? 0)} sub="con incidentes en el período" />
            <SumCard
              label="Mayor nº de incidentes"
              value={resumen?.proveedorMasIncidentes ?? '—'}
              sub={`${proveedores[0]?.incidentes ?? 0} incidentes`}
              color="#EA580C"
            />
            <SumCard
              label="MTTR promedio global"
              value={fmtMin(resumen?.globalMttrMin)}
              sub="tiempo medio de resolución"
              color={resumen?.globalMttrMin != null ? (resumen.globalMttrMin < 120 ? '#3B6D11' : resumen.globalMttrMin < 240 ? '#854F0B' : '#A32D2D') : undefined}
            />
            <SumCard
              label="SLA global del período"
              value={resumen?.globalSlaPct != null ? `${resumen.globalSlaPct}%` : '—'}
              sub="meta: ≥ 90%"
              color={resumen?.globalSlaPct != null ? (resumen.globalSlaPct >= 90 ? '#3B6D11' : resumen.globalSlaPct >= 70 ? '#854F0B' : '#A32D2D') : undefined}
            />
            <SumCard
              label="I.E.I total estimado"
              value={fmtCosto(resumen?.totalCosto ?? 0)}
              sub="impacto económico de indisponibilidad"
            />
            <SumCard
              label="Mayor impacto económico"
              value={resumen?.proveedorMasCostoso ?? '—'}
              sub={proveedores.length > 0 ? fmtCosto([...proveedores].sort((a, b) => b.costoTotal - a.costoTotal)[0]?.costoTotal ?? 0) : '—'}
              color="#A32D2D"
            />
          </div>

          {/* Tabla principal con accordion */}
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Resumen por proveedor</div>
                <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                  Clic en una fila para ver los incidentes de ese proveedor
                </div>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <TH>Proveedor</TH>
                    <TH align="center">Incidentes</TH>
                    <TH align="center" title="Incidentes RESUELTOS con escalamiento N1 enviado — son los únicos donde se puede medir si el proveedor cumplió los tiempos">Evaluables SLA</TH>
                    <TH align="center">Dentro SLA</TH>
                    <TH align="center">Fuera SLA</TH>
                    <TH title="% de incidentes evaluables que cumplieron los tiempos de respuesta y resolución contractuales">SLA%</TH>
                    <TH title="Tiempo Medio de Resolución — promedio del tiempo desde que se registra el incidente hasta que se resuelve">MTTR</TH>
                    <TH>I.E.I est.</TH>
                    <TH align="center">Tiendas</TH>
                    <TH align="center" title="Tiendas que tuvieron 2 o más incidentes en el período">Reincid.</TH>
                    <TH title="Riesgo operativo relativo al período (Alto/Medio/Bajo) basado en: costo 35% · SLA 25% · MTTR 20% · reincidencia 10% · incidentes 10%">Riesgo</TH>
                  </tr>
                </thead>
                <tbody>
                  {proveedores.map((p) => {
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
                          style={{ background: isOpen ? '#F0F6FF' : p.estado === 'critico' ? '#FFF8F8' : 'transparent', cursor: 'pointer', borderLeft: isOpen ? '3px solid #185FA5' : '3px solid transparent' }}
                        >
                          <TD>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '10px', color: isOpen ? '#185FA5' : 'var(--muted-foreground)' }}>{isOpen ? '▼' : '▶'}</span>
                              <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                              <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', background: badge.bg, color: badge.color, fontWeight: 500 }}>{badge.label}</span>
                            </div>
                          </TD>
                          <TD align="center"><strong>{p.incidentes}</strong></TD>
                          <TD align="center" >{p.evaluables > 0 ? p.evaluables : <span style={{ color: '#888780' }}>—</span>}</TD>
                          <TD align="center"><span style={{ color: '#3B6D11', fontWeight: 500 }}>{p.dentraSLA}</span></TD>
                          <TD align="center">
                            <span style={{ color: p.fueraSLA > 0 ? '#A32D2D' : '#0f172a', fontWeight: p.fueraSLA > 0 ? 700 : 400 }}>
                              {p.fueraSLA > 0 ? p.fueraSLA : '—'}
                            </span>
                          </TD>
                          <TD><SlaCell pct={p.slaPct} /></TD>
                          <TD>
                            <div>
                              <span style={{ color: p.mttrMinutos != null && p.mttrMinutos > 240 ? '#A32D2D' : p.mttrMinutos != null && p.mttrMinutos > 120 ? '#854F0B' : '#3B6D11', fontWeight: 500 }}>
                                {fmtMin(p.mttrMinutos)}
                              </span>
                              {mttrDelta != null && (
                                <span style={{ fontSize: '10px', color: mttrDelta > 0 ? '#A32D2D' : '#3B6D11', marginLeft: '4px' }}>
                                  {mttrDelta > 0 ? `+${fmtMin(mttrDelta)}` : `-${fmtMin(Math.abs(mttrDelta))}`} vs prom.
                                </span>
                              )}
                            </div>
                          </TD>
                          <TD mono>{p.costoTotal > 0 ? fmtCosto(p.costoTotal) : <span style={{ color: '#888780' }}>—</span>}</TD>
                          <TD align="center">{p.tiendasAfectadas}</TD>
                          <TD align="center">
                            {p.reincidencia > 0
                              ? <span style={{ color: '#A32D2D', fontWeight: 700 }}>{p.reincidencia}</span>
                              : <span style={{ color: '#888780' }}>—</span>}
                          </TD>
                          <TD align="center">
                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', fontWeight: 600, whiteSpace: 'nowrap', background: riesgo.bg, color: riesgo.color }}>
                              {riesgo.label}
                            </span>
                          </TD>
                        </tr>

                        {/* Accordion: incidentes del proveedor */}
                        {isOpen && (
                          <tr key={`${p.id}-detail`}>
                            <td colSpan={11} style={{ padding: '0', background: '#F8FAFC', borderTop: '0.5px solid #e5e7eb', borderBottom: '0.5px solid #e5e7eb' }}>
                              <div style={{ padding: '12px 16px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#185FA5', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Incidentes de {p.nombre} con mayor impacto
                                </div>
                                {incsProv.length === 0 ? (
                                  <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '8px 0' }}>
                                    Sin incidentes resueltos con MTTR registrado para este proveedor en el período.
                                  </div>
                                ) : (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                                        {['Código', 'Tienda', 'Tipo', 'MTTR', 'I.E.I est.', 'SLA', 'Motivo incumplimiento', 'Fecha'].map((h) => (
                                          <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {incsProv.map((inc, j) => (
                                        <tr key={j} style={{ borderTop: j > 0 ? '0.5px solid #f3f4f6' : 'none' }}>
                                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#64748b' }}>{inc.codigo}</td>
                                          <td style={{ padding: '6px 8px' }}>
                                            <span style={{ fontWeight: 500 }}>{inc.tiendaCodigo}</span>
                                            {inc.tiendaNombre && <span style={{ color: 'var(--muted-foreground)', marginLeft: '4px', fontSize: '10px' }}>{inc.tiendaNombre}</span>}
                                          </td>
                                          <td style={{ padding: '6px 8px', color: 'var(--muted-foreground)' }}>{fmtTipo(inc.tipo)}</td>
                                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: inc.mttrMinutos > 240 ? '#A32D2D' : inc.mttrMinutos > 120 ? '#854F0B' : '#3B6D11', fontWeight: 500 }}>{fmtMin(inc.mttrMinutos)}</td>
                                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 600 }}>{fmtCosto(inc.costoEstimado)}</td>
                                          <td style={{ padding: '6px 8px' }}>
                                            {inc.slaGeneral === null
                                              ? <span style={{ fontSize: '10px', color: '#888780' }}>Sin esc.</span>
                                              : inc.slaGeneral
                                                ? <span style={{ fontSize: '10px', color: '#3B6D11', fontWeight: 600 }}>✓ OK</span>
                                                : <span style={{ fontSize: '10px', color: '#A32D2D', fontWeight: 600 }}>✗ Fuera</span>}
                                          </td>
                                          <td style={{ padding: '6px 8px', color: inc.motivoIncumplimiento ? '#854F0B' : '#888780', fontSize: '10px' }}>
                                            {inc.motivoIncumplimiento ?? '—'}
                                          </td>
                                          <td style={{ padding: '6px 8px', color: 'var(--muted-foreground)' }}>{inc.diaFmt}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
              {proveedores.length === 0 && (
                <div style={{ padding: '32px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
                  Sin datos en el período seleccionado
                </div>
              )}
            </div>

            {/* Leyenda */}
            <div style={{ marginTop: '10px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '10px', color: 'var(--muted-foreground)', paddingTop: '8px', borderTop: '0.5px solid #f3f4f6' }}>
              <span><strong>Evaluables SLA</strong>: incidentes resueltos con correo N1 enviado</span>
              <span><strong>MTTR</strong>: tiempo medio desde registro hasta resolución</span>
              <span><strong>Riesgo</strong>: relativo al período — costo 35% · SLA 25% · MTTR 20% · reincidencia 10% · vol. 10%</span>
            </div>
          </div>

          {/* Conclusiones */}
          {conclusiones.length > 0 && (
            <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>Conclusiones del período</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                {conclusiones.map((c, i) => {
                  const icons = ['📊', '🚨', '💰', '⚠️', '📋']
                  return (
                    <div key={i} style={{ padding: '12px 14px', background: '#F8FAFC', border: '0.5px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', lineHeight: 1.5, display: 'flex', gap: '8px' }}>
                      <span style={{ fontSize: '16px', flexShrink: 0 }}>{icons[i] ?? '•'}</span>
                      <span>{c}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Nota metodológica */}
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: 1.7, padding: '0 4px' }}>
            <strong>Metodología:</strong> I.E.I = venta/hora × (MTTR/60) × factor impacto × factor contingencia × 35% margen. MTTR = tiempo registro → resolución. SLA evaluable = incidente RESUELTO con correo N1 enviado. Riesgo = índice relativo al período (no es absoluto).
          </div>
        </>
      )}
    </div>
  )
}

export default function ImpactoProveedorPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--muted-foreground)' }}>Cargando...</div>}>
      <ImpactoProveedorContent />
    </Suspense>
  )
}
