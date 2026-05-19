'use client'
import { Suspense, useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { DistribucionTipoResponse, TipoResumen, TipoVisible } from '@/types/distribution-type'
import { TIPO_LABELS, TIPO_COLORS } from '@/types/distribution-type'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMin(min: number | null | undefined) {
  if (!min) return '—'
  const h = Math.floor(min / 60); const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function fmtCosto(n: number) {
  return `S/ ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
}
function firstDayOfMonth() {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}
function todayStr() { return new Date().toISOString().split('T')[0] }

function estadoChip(estado: TipoResumen['estado']) {
  if (estado === 'optimo')    return { label: '✓ Óptimo',    color: '#3B6D11', bg: '#EAF3DE' }
  if (estado === 'en_riesgo') return { label: '⚠ En riesgo', color: '#854F0B', bg: '#FAEEDA' }
  if (estado === 'critico')   return { label: '✗ Crítico',   color: '#A32D2D', bg: '#FCEBEB' }
  return                               { label: '— Sin datos', color: '#888780', bg: '#F3F4F6' }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TH({ children, align = 'left' }: { children: React.ReactNode; align?: string }) {
  return (
    <th style={{ padding: '8px 10px', textAlign: align as any, fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '0.5px solid #e5e7eb', whiteSpace: 'nowrap', background: '#FAFAFA' }}>
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

function SumCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', flex: 1, minWidth: '120px' }}>
      <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 500, marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: color ?? '#0f172a', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

function ProvBadge({ nombre }: { nombre: string | null }) {
  if (!nombre) return <span style={{ color: '#888780' }}>—</span>
  return <span style={{ padding: '1px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 600, background: '#E6F1FB', color: '#185FA5', whiteSpace: 'nowrap' }}>{nombre}</span>
}

function TipoBadge({ tipo }: { tipo: TipoVisible }) {
  const color = TIPO_COLORS[tipo]
  const label = TIPO_LABELS[tipo]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d: TipoResumen = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
      <div style={{ fontWeight: 600, marginBottom: '4px' }}>Tipo: {d.label}</div>
      <div>Incidentes: <strong>{d.cantidad}</strong></div>
      <div>Porcentaje: <strong>{d.pct}%</strong></div>
      {d.causaMasFrecuente && <div style={{ color: '#854F0B' }}>Causa más frecuente: <strong>{d.causaMasFrecuente}</strong></div>}
    </div>
  )
}

// ─── Main content ─────────────────────────────────────────────────────────────

function DistribucionTipoContent() {
  const searchParams   = useSearchParams()
  const initialDesde   = searchParams.get('desde') || firstDayOfMonth()
  const initialHasta   = searchParams.get('hasta') || todayStr()
  const initialProv    = searchParams.get('proveedorId') || ''
  const fromDashboard  = !!(searchParams.get('desde') || searchParams.get('hasta') || searchParams.get('proveedorId'))

  const [desde, setDesde]             = useState(initialDesde)
  const [hasta, setHasta]             = useState(initialHasta)
  const [proveedorId, setProveedorId] = useState(initialProv)
  const [tipoFiltro, setTipoFiltro]  = useState<string>('TODOS')
  const [data, setData]               = useState<DistribucionTipoResponse | null>(null)
  const [loading, setLoading]         = useState(false)

  const fetchData = useCallback(async (d = desde, h = hasta, pId = proveedorId) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde: d, hasta: h })
      if (pId) params.set('proveedorId', pId)
      const res = await fetch(`/api/dashboard/distribucion-tipo?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [])

  const exportCSV = () => {
    const tipos = data?.tiposResumen ?? []
    const header = 'Tipo,Cantidad,% Total,Tiendas,Proveedor,MTTR prom,SLA%,Impacto est,Estado'
    const rows = tipos.map((t) =>
      [t.label, t.cantidad, `${t.pct}%`, t.tiendasAfectadas, t.proveedorMasAsociado ?? '',
       fmtMin(t.mttrPromedioMin), t.slaPct != null ? `${t.slaPct}%` : '',
       fmtCosto(t.impactoEstimado), t.estado].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'distribucion-tipo.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const tiposResumen  = data?.tiposResumen ?? []
  const otrosDesglose = data?.otrosDesglose ?? []
  const patrones      = data?.patrones ?? []
  const conclusiones  = data?.conclusiones ?? []
  const provLista     = data?.proveedoresList ?? []
  const total         = data?.total ?? 0
  const hayOtros      = otrosDesglose.length > 0

  const incidentesFiltrados = (data?.incidentes ?? []).filter((inc) => {
    if (tipoFiltro === 'TODOS') return true
    return inc.tipoVisible === tipoFiltro
  })

  const tipoMasFrecuente    = tiposResumen[0]
  const tipoMasImpacto      = [...tiposResumen].sort((a, b) => b.impactoEstimado - a.impactoEstimado)[0]
  const peorSla             = [...tiposResumen].filter((t) => t.slaPct != null).sort((a, b) => (a.slaPct ?? 100) - (b.slaPct ?? 100))[0]
  const mayorMttr           = [...tiposResumen].filter((t) => t.mttrPromedioMin != null).sort((a, b) => (b.mttrPromedioMin ?? 0) - (a.mttrPromedioMin ?? 0))[0]
  const causaOtrosMasFrecuente = otrosDesglose[0]
  const sinClasificar       = otrosDesglose.find((d) => d.causaClasificada === 'Sin clasificar')

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'inherit' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => window.history.back()}
          style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '12px', cursor: 'pointer', padding: 0, marginBottom: '8px', fontWeight: 500 }}>
          ← Volver al dashboard
        </button>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>D. Distribución por tipo</div>
        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
          Desglose de incidentes por tipo con impacto económico, SLA y MTTR.
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
        <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="TODOS">Todos los tipos</option>
          <option value="CAIDA_TOTAL">Caída total</option>
          <option value="INTERMITENCIA">Intermitencia</option>
          <option value="LENTITUD">Lentitud</option>
          <option value="OTROS">Otros</option>
        </select>
        <button onClick={() => fetchData()}
          style={{ padding: '6px 14px', fontSize: '12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>
          Actualizar
        </button>
        <button onClick={exportCSV}
          style={{ padding: '6px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--card)', color: 'var(--foreground)', marginLeft: 'auto' }}>
          ↓ Exportar CSV
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
            <SumCard label="Tipo más frecuente" value={tipoMasFrecuente?.label ?? '—'} sub={tipoMasFrecuente ? `${tipoMasFrecuente.cantidad} incidentes (${tipoMasFrecuente.pct}%)` : ''} color={tipoMasFrecuente ? TIPO_COLORS[tipoMasFrecuente.tipo] : undefined} />
            <SumCard label="Mayor impacto estimado" value={tipoMasImpacto?.label ?? '—'} sub={tipoMasImpacto ? fmtCosto(tipoMasImpacto.impactoEstimado) : ''} color="#A32D2D" />
            <SumCard label="Peor SLA" value={peorSla ? `${peorSla.slaPct}%` : '—'} sub={peorSla?.label} color={peorSla?.slaPct != null && peorSla.slaPct < 70 ? '#A32D2D' : '#854F0B'} />
            <SumCard label="Mayor MTTR" value={fmtMin(mayorMttr?.mttrPromedioMin)} sub={mayorMttr?.label} color="#854F0B" />
            <SumCard label="Causa Otros más frecuente" value={causaOtrosMasFrecuente?.causaClasificada ?? '—'} sub={causaOtrosMasFrecuente ? `${causaOtrosMasFrecuente.cantidad} casos` : 'Sin Otros'} />
            <SumCard label="Otros sin clasificar" value={sinClasificar ? String(sinClasificar.cantidad) : '0'} sub="sin causa registrada" color={sinClasificar ? '#A32D2D' : '#3B6D11'} />
          </div>

          {/* Donut + Tabla 1 side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', marginBottom: '16px', alignItems: 'start' }}>

            {/* Mini donut */}
            <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{ position: 'relative', width: '180px', height: '180px' }}>
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={tiposResumen} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="cantidad" startAngle={90} endAngle={-270} stroke="none">
                      {tiposResumen.map((t, i) => <Cell key={i} fill={t.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{total}</div>
                  <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginTop: '2px', lineHeight: 1.3 }}>Incidentes<br/>Totales</div>
                </div>
              </div>
              {tiposResumen.map((t) => (
                <div key={t.tipo} style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', flex: 1 }}>{t.label}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>{t.pct}%</span>
                </div>
              ))}
            </div>

            {/* Tabla 1: Resumen por tipo */}
            <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>Tabla 1 — Resumen por tipo</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <TH>Tipo incidente</TH>
                      <TH align="center">Cantidad</TH>
                      <TH align="center">% total</TH>
                      <TH align="center">Tiendas</TH>
                      <TH>Proveedor</TH>
                      <TH>MTTR prom.</TH>
                      <TH align="center">SLA %</TH>
                      <TH>Impacto est.</TH>
                      <TH>Estado</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {tiposResumen.map((t) => {
                      const chip = estadoChip(t.estado)
                      const slaColor = t.slaPct != null ? (t.slaPct >= 90 ? '#3B6D11' : t.slaPct >= 70 ? '#854F0B' : '#A32D2D') : '#888780'
                      return (
                        <tr key={t.tipo}>
                          <TD><TipoBadge tipo={t.tipo} /></TD>
                          <TD align="center"><strong>{t.cantidad}</strong></TD>
                          <TD align="center">{t.pct}%</TD>
                          <TD align="center">{t.tiendasAfectadas}</TD>
                          <TD>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
                              <ProvBadge nombre={t.proveedorMasAsociado} />
                              {t.totalProveedores > 1 && (
                                <span style={{ fontSize: '10px', color: '#888780', whiteSpace: 'nowrap' }}>+{t.totalProveedores - 1} más</span>
                              )}
                            </div>
                          </TD>
                          <TD mono>{fmtMin(t.mttrPromedioMin)}</TD>
                          <TD align="center"><span style={{ fontWeight: 600, color: slaColor }}>{t.slaPct != null ? `${t.slaPct}%` : '—'}</span></TD>
                          <TD mono>{t.impactoEstimado > 0 ? fmtCosto(t.impactoEstimado) : '—'}</TD>
                          <TD><span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: chip.bg, color: chip.color, fontWeight: 500, whiteSpace: 'nowrap' }}>{chip.label}</span></TD>
                        </tr>
                      )
                    })}
                    {tiposResumen.length === 0 && (
                      <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Sin datos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Tabla 2: Desglose Otros */}
          {hayOtros && (
            <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>Tabla 2 — Desglose de "Otros"</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <TH>Causa clasificada</TH>
                      <TH align="center">Cantidad</TH>
                      <TH align="center">% de Otros</TH>
                      <TH align="center">Tiendas</TH>
                      <TH>Proveedor</TH>
                      <TH>MTTR prom.</TH>
                      <TH align="center">SLA %</TH>
                      <TH>Impacto est.</TH>
                      <TH>Estado</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {otrosDesglose.map((d, i) => {
                      const chip = estadoChip(d.estado)
                      const slaColor = d.slaPct != null ? (d.slaPct >= 90 ? '#3B6D11' : d.slaPct >= 70 ? '#854F0B' : '#A32D2D') : '#888780'
                      return (
                        <tr key={i} style={{ background: d.causaClasificada === 'Sin clasificar' ? '#FFFBF0' : 'transparent' }}>
                          <TD>
                            <span style={{ fontWeight: 500 }}>{d.causaClasificada}</span>
                            {d.causaClasificada === 'Sin clasificar' && <span style={{ fontSize: '10px', color: '#A32D2D', marginLeft: '6px' }}>⚠ normalizar</span>}
                          </TD>
                          <TD align="center"><strong>{d.cantidad}</strong></TD>
                          <TD align="center">{d.pctDeOtros}%</TD>
                          <TD align="center">{d.tiendasAfectadas}</TD>
                          <TD><ProvBadge nombre={d.proveedorMasAsociado} /></TD>
                          <TD mono>{fmtMin(d.mttrPromedioMin)}</TD>
                          <TD align="center"><span style={{ fontWeight: 600, color: slaColor }}>{d.slaPct != null ? `${d.slaPct}%` : '—'}</span></TD>
                          <TD mono>{d.impactoEstimado > 0 ? fmtCosto(d.impactoEstimado) : '—'}</TD>
                          <TD><span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: chip.bg, color: chip.color, fontWeight: 500, whiteSpace: 'nowrap' }}>{chip.label}</span></TD>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tabla 3: Incidentes del tipo seleccionado */}
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>
              Tabla 3 — Incidentes {tipoFiltro === 'TODOS' ? 'del período' : `· ${TIPO_LABELS[tipoFiltro as TipoVisible] ?? tipoFiltro}`}
              <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: '8px' }}>({incidentesFiltrados.length} registros)</span>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '380px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <TH>ID incidente</TH>
                    <TH>Fecha</TH>
                    <TH>Tienda</TH>
                    <TH>Proveedor</TH>
                    <TH>Tipo</TH>
                    <TH>Duración</TH>
                    <TH align="center">SLA</TH>
                    <TH>Impacto est.</TH>
                    <TH>Estado</TH>
                    {(tipoFiltro === 'OTROS' || incidentesFiltrados.some((i) => i.tipoVisible === 'OTROS')) && (
                      <>
                        <TH>Causa escrita</TH>
                        <TH>Causa clasificada</TH>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {incidentesFiltrados.slice(0, 100).map((inc, i) => {
                    const mostrarCausa = tipoFiltro === 'OTROS' || inc.tipoVisible === 'OTROS'
                    return (
                      <tr key={i}>
                        <TD><span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted-foreground)' }}>{inc.codigo}</span></TD>
                        <TD>{inc.fecha}</TD>
                        <TD><span style={{ fontWeight: 600 }}>{inc.tiendaCodigo}</span> <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{inc.tiendaNombre}</span></TD>
                        <TD><ProvBadge nombre={inc.provNombre} /></TD>
                        <TD><TipoBadge tipo={inc.tipoVisible} /></TD>
                        <TD mono>{fmtMin(inc.duracionMin)}</TD>
                        <TD align="center">
                          {inc.slaGeneral === null
                            ? <span style={{ color: '#888780', fontSize: '10px' }}>No eval.</span>
                            : inc.slaGeneral
                              ? <span style={{ color: '#3B6D11', fontWeight: 600, fontSize: '10px' }}>✓ OK</span>
                              : <span style={{ color: '#A32D2D', fontWeight: 600, fontSize: '10px' }}>✗ Fuera</span>}
                        </TD>
                        <TD mono>{inc.impactoEstimado > 0 ? fmtCosto(inc.impactoEstimado) : '—'}</TD>
                        <TD>
                          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px',
                            background: inc.estado === 'RESUELTO' ? '#EAF3DE' : inc.estado === 'EN_SEGUIMIENTO' ? '#E6F1FB' : '#F3F4F6',
                            color: inc.estado === 'RESUELTO' ? '#3B6D11' : inc.estado === 'EN_SEGUIMIENTO' ? '#185FA5' : '#888780' }}>
                            {inc.estado}
                          </span>
                        </TD>
                        {(tipoFiltro === 'OTROS' || incidentesFiltrados.some((ii) => ii.tipoVisible === 'OTROS')) && (
                          <>
                            <TD><span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{inc.causaTexto ?? '—'}</span></TD>
                            <TD>
                              {inc.causaClasificada
                                ? <span style={{ fontSize: '10px', padding: '1px 6px', background: '#FEF3C7', color: '#B45309', borderRadius: '999px' }}>{inc.causaClasificada}</span>
                                : <span style={{ color: '#888780' }}>—</span>}
                            </TD>
                          </>
                        )}
                      </tr>
                    )
                  })}
                  {incidentesFiltrados.length === 0 && (
                    <tr><td colSpan={11} style={{ padding: '32px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin incidentes para el filtro seleccionado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {incidentesFiltrados.length > 100 && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                Mostrando 100 de {incidentesFiltrados.length} incidentes
              </div>
            )}
          </div>

          {/* Tabla 4: Patrón detectado */}
          {patrones.length > 0 && (() => {
            const patronesFiltrados = patrones.filter((p) => p.tiendasRepetidas > 0)
            return (
              <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>Tabla 4 — Patrón detectado por tipo</div>
                {patronesFiltrados.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '12px 0' }}>
                    No se detectaron patrones de reincidencia en el período.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <TH>Tipo incidente</TH>
                          <TH>Patrón detectado</TH>
                          <TH>Proveedor asociado</TH>
                          <TH align="center">Tiendas repetidas</TH>
                          <TH>Causa probable</TH>
                          <TH>Recomendación</TH>
                        </tr>
                      </thead>
                      <tbody>
                        {patronesFiltrados.map((p, i) => (
                          <tr key={i}>
                            <TD><TipoBadge tipo={p.tipo} /></TD>
                            <TD>{p.patronDetectado}</TD>
                            <TD><ProvBadge nombre={p.proveedorAsociado} /></TD>
                            <TD align="center"><strong style={{ color: p.tiendasRepetidas >= 3 ? '#A32D2D' : '#854F0B' }}>{p.tiendasRepetidas}</strong></TD>
                            <TD><span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{p.causaProbable}</span></TD>
                            <TD><span style={{ fontSize: '11px', color: '#185FA5' }}>{p.recomendacion}</span></TD>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Conclusiones */}
          {conclusiones.length > 0 && (
            <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>Conclusiones automáticas</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                {conclusiones.map((c, i) => {
                  const icons = ['📊', '💰', '🚨', '📡', '📋', '🔍', '⚠️', '✏️']
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
            Nota: POS y otros tipos no estándar se agrupan en "Otros". Impacto estimado = venta/hora × horas afectadas × factor impacto × factor contingencia × margen bruto (35%). Solo se excluyen incidentes CANCELADOS. SLA evaluable: incidentes RESUELTOS con correo N1 enviado.
          </div>
        </>
      )}
    </div>
  )
}

export default function DistribucionTipoPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--muted-foreground)' }}>Cargando...</div>}>
      <DistribucionTipoContent />
    </Suspense>
  )
}
