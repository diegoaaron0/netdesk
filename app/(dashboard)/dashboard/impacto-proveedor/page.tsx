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

function SlaCell({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: '#888780' }}>—</span>
  const color = pct >= 90 ? '#3B6D11' : pct >= 70 ? '#854F0B' : '#A32D2D'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: '56px', height: '5px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '5px', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontWeight: 600, color }}>{pct}%</span>
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

function TH({ children, align = 'left' }: { children: React.ReactNode; align?: string }) {
  return (
    <th style={{ padding: '8px 10px', textAlign: align as any, fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '0.5px solid #e5e7eb', whiteSpace: 'nowrap' }}>
      {children}
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

  const [desde, setDesde]           = useState(initialDesde)
  const [hasta, setHasta]           = useState(initialHasta)
  const [proveedorId, setProveedorId] = useState(initialProv)
  const [data, setData]             = useState<ImpactoProveedorResponse | null>(null)
  const [loading, setLoading]       = useState(false)

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
  const tiendas     = data?.tiendasAfectadas ?? []
  const conclusiones = data?.conclusiones ?? []
  const provLista   = data?.proveedoresList ?? []
  const globalMttr  = resumen?.globalMttrMin ?? null

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'inherit' }}>
      <button onClick={() => router.push('/dashboard?tab=analitico')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#185FA5', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>← Volver al dashboard</button>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>B. Impacto por proveedor</div>
        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
          Comparativa de proveedores por incidentes, MTTR, SLA y costo estimado
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
        <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {provLista.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <button onClick={() => fetchData()}
          style={{ padding: '6px 14px', fontSize: '12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>
          Actualizar
        </button>
        <button onClick={() => { const d=firstDayOfMonth(),h=todayStr(); setDesde(d); setHasta(h); setProveedorId(''); fetchData(d,h,'') }}
          style={{ padding: '6px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--card)', color: 'var(--foreground)' }}>
          Limpiar filtros
        </button>
      </div>

      {fromDashboard && (
        <div style={{ marginBottom: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', background: '#E6F1FB', borderRadius: '999px', fontSize: '11px', color: '#185FA5' }}>
          <span>●</span> Filtro aplicado desde dashboard
        </div>
      )}

      {loading && (
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: 'var(--muted-foreground)' }}>
          Cargando datos...
        </div>
      )}

      {!loading && data && (
        <>
          {/* 6 Summary cards */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <SumCard label="Proveedores activos" value={String(resumen?.totalProveedores ?? 0)} sub="en el período" />
            <SumCard
              label="Mayor cantidad incidentes"
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
              label="SLA global"
              value={resumen?.globalSlaPct != null ? `${resumen.globalSlaPct}%` : '—'}
              sub="meta: 90%"
              color={resumen?.globalSlaPct != null ? (resumen.globalSlaPct >= 90 ? '#3B6D11' : resumen.globalSlaPct >= 70 ? '#854F0B' : '#A32D2D') : undefined}
            />
            <SumCard
              label="Costo total estimado"
              value={fmtCosto(resumen?.totalCosto ?? 0)}
              sub="basado en MTTR y margen"
            />
            <SumCard
              label="Mayor impacto económico"
              value={resumen?.proveedorMasCostoso ?? '—'}
              sub={proveedores.length > 0 ? fmtCosto([...proveedores].sort((a,b)=>b.costoTotal-a.costoTotal)[0]?.costoTotal ?? 0) : '—'}
              color="#A32D2D"
            />
          </div>

          {/* Tabla 1: Resumen por proveedor */}
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>
              Tabla 1 — Resumen por proveedor
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <TH>Proveedor</TH>
                    <TH align="center">Incidentes</TH>
                    <TH align="center">Evaluables</TH>
                    <TH align="center">Dentro SLA</TH>
                    <TH align="center">Fuera SLA</TH>
                    <TH>SLA%</TH>
                    <TH>MTTR</TH>
                    <TH>Costo est.</TH>
                    <TH align="center">Tiendas</TH>
                    <TH align="center">Reincid.</TH>
                    <TH>Estado</TH>
                    <TH align="center">Riesgo</TH>
                  </tr>
                </thead>
                <tbody>
                  {proveedores.map((p) => {
                    const badge = estadoBadge(p.estado)
                    const mttrDelta = globalMttr != null && p.mttrMinutos != null ? p.mttrMinutos - globalMttr : null
                    const riesgoBg    = p.score >= 70 ? '#FCEBEB' : p.score >= 40 ? '#FAEEDA' : '#EAF3DE'
                    const riesgoColor = p.score >= 70 ? '#A32D2D' : p.score >= 40 ? '#854F0B' : '#3B6D11'
                    const riesgoLabel = p.score >= 70 ? 'Alto'    : p.score >= 40 ? 'Medio'   : 'Bajo'
                    return (
                      <tr key={p.id} style={{ background: p.estado === 'critico' ? '#FFF8F8' : 'transparent' }}>
                        <TD><span style={{ fontWeight: 500 }}>{p.nombre}</span></TD>
                        <TD align="center"><strong>{p.incidentes}</strong></TD>
                        <TD align="center">{p.evaluables}</TD>
                        <TD align="center"><span style={{ color: '#3B6D11', fontWeight: 500 }}>{p.dentraSLA}</span></TD>
                        <TD align="center"><span style={{ color: p.fueraSLA > 0 ? '#A32D2D' : '#0f172a', fontWeight: p.fueraSLA > 0 ? 600 : 400 }}>{p.fueraSLA}</span></TD>
                        <TD><SlaCell pct={p.slaPct} /></TD>
                        <TD>
                          <span style={{ color: p.mttrMinutos != null && p.mttrMinutos > 240 ? '#A32D2D' : p.mttrMinutos != null && p.mttrMinutos > 120 ? '#854F0B' : '#0f172a' }}>
                            {fmtMin(p.mttrMinutos)}
                          </span>
                          {mttrDelta != null && (
                            <span style={{ fontSize: '10px', color: mttrDelta > 0 ? '#A32D2D' : '#3B6D11', marginLeft: '4px' }}>
                              {mttrDelta > 0 ? `+${fmtMin(mttrDelta)}` : `-${fmtMin(Math.abs(mttrDelta))}`}
                            </span>
                          )}
                        </TD>
                        <TD mono>{p.costoTotal > 0 ? fmtCosto(p.costoTotal) : '—'}</TD>
                        <TD align="center">{p.tiendasAfectadas}</TD>
                        <TD align="center">
                          {p.reincidencia > 0
                            ? <span style={{ color: '#A32D2D', fontWeight: 600 }}>{p.reincidencia}</span>
                            : <span style={{ color: '#888780' }}>0</span>}
                        </TD>
                        <TD>
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: badge.bg, color: badge.color, fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {badge.label}
                          </span>
                        </TD>
                        <TD align="center">
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', fontWeight: 600, whiteSpace: 'nowrap', background: riesgoBg, color: riesgoColor }}>
                            {riesgoLabel}
                          </span>
                        </TD>
                      </tr>
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
            <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--muted-foreground)' }}>
              Score: indicador de criticidad compuesto (costo 35% · SLA 25% · MTTR 20% · reincidencia 10% · incidentes 10%). Mayor score = mayor riesgo operativo.
            </div>
          </div>

          {/* Tabla 2: Top incidentes por costo */}
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>
              Tabla 2 — Top 10 incidentes por costo estimado
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <TH>Código</TH>
                    <TH>Tienda</TH>
                    <TH>Proveedor</TH>
                    <TH>Tipo</TH>
                    <TH>MTTR</TH>
                    <TH>Costo est.</TH>
                    <TH>SLA</TH>
                    <TH>Motivo incumplimiento</TH>
                    <TH>Fecha</TH>
                  </tr>
                </thead>
                <tbody>
                  {topInc.map((inc, i) => (
                    <tr key={i}>
                      <TD><span style={{ fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>{inc.codigo}</span></TD>
                      <TD><span style={{ fontWeight: 500 }}>{inc.tiendaCodigo}</span> <span style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>{inc.tiendaNombre}</span></TD>
                      <TD>{inc.provNombre}</TD>
                      <TD>{fmtTipo(inc.tipo)}</TD>
                      <TD mono>{fmtMin(inc.mttrMinutos)}</TD>
                      <TD mono><span style={{ fontWeight: 600 }}>{fmtCosto(inc.costoEstimado)}</span></TD>
                      <TD>
                        {inc.slaGeneral === null
                          ? <span style={{ color: '#888780', fontSize: '10px' }}>Sin escalamiento</span>
                          : inc.slaGeneral
                            ? <span style={{ color: '#3B6D11', fontSize: '10px', fontWeight: 600 }}>✓ OK</span>
                            : <span style={{ color: '#A32D2D', fontSize: '10px', fontWeight: 600 }}>✗ Fuera</span>}
                      </TD>
                      <TD>
                        {inc.motivoIncumplimiento
                          ? <span style={{ fontSize: '10px', color: '#854F0B' }}>{inc.motivoIncumplimiento}</span>
                          : <span style={{ color: '#888780' }}>—</span>}
                      </TD>
                      <TD><span style={{ color: 'var(--muted-foreground)' }}>{inc.diaFmt}</span></TD>
                    </tr>
                  ))}
                  {topInc.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin incidentes resueltos con MTTR registrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabla 3: Tiendas más afectadas */}
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>
              Tabla 3 — Tiendas más afectadas
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <TH>Tienda</TH>
                    <TH align="center">Incidentes</TH>
                    <TH>Proveedores</TH>
                    <TH>MTTR prom.</TH>
                    <TH>Costo est.</TH>
                    <TH align="center">Fuera SLA</TH>
                  </tr>
                </thead>
                <tbody>
                  {tiendas
                    .filter((t) => t.costoTotal >= 50)
                    .sort((a, b) => b.costoTotal - a.costoTotal)
                    .slice(0, 10)
                    .map((t, i) => (
                    <tr key={i} style={{ background: t.incidentes >= 3 ? '#FFF8F8' : 'transparent' }}>
                      <TD>
                        <span style={{ fontWeight: 500 }}>{t.tiendaCodigo} — {t.tiendaNombre ?? ''}</span>
                      </TD>
                      <TD align="center">
                        <span style={{ fontWeight: 700, color: t.incidentes >= 3 ? '#A32D2D' : t.incidentes >= 2 ? '#854F0B' : '#0f172a' }}>{t.incidentes}</span>
                      </TD>
                      <TD>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {t.proveedores.map((p) => (
                            <span key={p} style={{ fontSize: '10px', padding: '1px 6px', background: '#E6F1FB', color: '#185FA5', borderRadius: '999px' }}>{p}</span>
                          ))}
                        </div>
                      </TD>
                      <TD mono>{fmtMin(t.mttrPromedioMin)}</TD>
                      <TD mono>{t.costoTotal > 0 ? fmtCosto(t.costoTotal) : '—'}</TD>
                      <TD align="center">
                        {t.fueraSLA > 0
                          ? <span style={{ color: '#A32D2D', fontWeight: 600 }}>{t.fueraSLA}</span>
                          : <span style={{ color: '#888780' }}>0</span>}
                      </TD>
                    </tr>
                  ))}
                  {tiendas.filter((t) => t.costoTotal >= 50).length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos</td></tr>
                  )}
                </tbody>
              </table>
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

          {/* Footer */}
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: 1.6, padding: '0 4px' }}>
            Nota metodológica: Costo estimado = venta hora esperada × (MTTR / 60) × factor impacto × factor contingencia × margen bruto (35%). MTTR: tiempo desde registro hasta resolución. SLA evaluable: incidentes RESUELTOS con correo N1 enviado. Score proveedor: costo 35% · SLA 25% · MTTR 20% · reincidencia 10% · incidentes 10%.
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
