'use client'
import { Suspense, useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import type { TiendasCriticasResponse, TiendaCritica, HistorialIncidente } from '@/types/critical-stores'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function estadoBadge(estado: TiendaCritica['estado']) {
  if (estado === 'critica') return { label: '● Crítica',  color: '#A32D2D', bg: '#FCEBEB' }
  if (estado === 'revisar') return { label: '● Revisar',  color: '#854F0B', bg: '#FAEEDA' }
  return                           { label: '● Óptima',   color: '#3B6D11', bg: '#EAF3DE' }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SumCard({ icon, label, value, sub, color }: {
  icon: string; label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', flex: 1, minWidth: '130px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '22px', lineHeight: 1 }}>{icon}</span>
      <div>
        <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 500, marginBottom: '4px' }}>{label}</div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: color ?? '#0f172a', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '3px' }}>{sub}</div>}
      </div>
    </div>
  )
}

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

function ProvBadge({ nombre }: { nombre: string | null }) {
  if (!nombre) return <span style={{ color: '#888780' }}>—</span>
  const colors: Record<string, { bg: string; color: string }> = {
    CLARO:   { bg: '#FEE2E2', color: '#B91C1C' },
    ENTEL:   { bg: '#DBEAFE', color: '#1D4ED8' },
    BITEL:   { bg: '#FEF3C7', color: '#B45309' },
    MOVISTAR:{ bg: '#EDE9FE', color: '#7C3AED' },
  }
  const style = colors[nombre.toUpperCase()] ?? { bg: '#E6F1FB', color: '#185FA5' }
  return (
    <span style={{ padding: '1px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 600, background: style.bg, color: style.color, whiteSpace: 'nowrap' }}>
      {nombre}
    </span>
  )
}

// ─── Main content ─────────────────────────────────────────────────────────────

function TiendasCriticasContent() {
  const searchParams   = useSearchParams()
  const initialDesde   = searchParams.get('desde') || firstDayOfMonth()
  const initialHasta   = searchParams.get('hasta') || todayStr()
  const initialProv    = searchParams.get('proveedorId') || ''
  const fromDashboard  = !!(searchParams.get('desde') || searchParams.get('hasta') || searchParams.get('proveedorId'))

  const [desde, setDesde]               = useState(initialDesde)
  const [hasta, setHasta]               = useState(initialHasta)
  const [proveedorId, setProveedorId]   = useState(initialProv)
  const [buscar, setBuscar]             = useState('')
  const [data, setData]                 = useState<TiendasCriticasResponse | null>(null)
  const [loading, setLoading]           = useState(false)
  const [selectedTienda, setSelectedTienda] = useState<TiendaCritica | null>(null)
  const [historial, setHistorial]       = useState<HistorialIncidente[] | null>(null)
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  const fetchData = useCallback(async (d = desde, h = hasta, pId = proveedorId) => {
    setLoading(true)
    setSelectedTienda(null)
    setHistorial(null)
    try {
      const params = new URLSearchParams({ desde: d, hasta: h })
      if (pId) params.set('proveedorId', pId)
      const res = await fetch(`/api/dashboard/tiendas-criticas?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [])

  const fetchHistorial = useCallback(async (tiendaCodigo: string) => {
    setLoadingHistorial(true)
    setHistorial(null)
    try {
      const params = new URLSearchParams({ tiendaCodigo, desde, hasta })
      const res = await fetch(`/api/dashboard/tiendas-criticas/historial?${params}`)
      if (res.ok) {
        const json = await res.json()
        setHistorial(json.historial ?? [])
      }
    } finally { setLoadingHistorial(false) }
  }, [desde, hasta])

  const handleSelectTienda = (t: TiendaCritica) => {
    if (selectedTienda?.tiendaCodigo === t.tiendaCodigo) {
      setSelectedTienda(null); setHistorial(null)
    } else {
      setSelectedTienda(t)
      fetchHistorial(t.tiendaCodigo)
    }
  }

  const exportCSV = () => {
    const tiendas = filteredTiendas
    const header = 'Tienda,Proveedor,Distrito,Cluster,Incidentes,Reincidencias,MTTR prom,SLA%,Costo est,Contingencia,Score,Estado'
    const rows = tiendas.map((t) =>
      [t.tiendaCodigo, t.proveedorNombre ?? '', t.distrito ?? '', t.cluster ?? '',
       t.incidentes, t.reincidencias, fmtMin(t.mttrPromedioMin),
       t.slaPct != null ? `${t.slaPct}%` : '', fmtCosto(t.costoEstimado),
       t.tieneContingencia ? 'Sí' : 'No', t.score, t.estado].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'tiendas-criticas.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const resumen    = data?.resumen
  const allTiendas = data?.tiendas ?? []
  const patrones   = data?.patrones ?? []
  const conclusiones = data?.conclusiones ?? []
  const provLista  = data?.proveedoresList ?? []

  const filteredTiendas = allTiendas.filter((t) => {
    if (!buscar) return true
    const q = buscar.toLowerCase()
    return t.tiendaCodigo.toLowerCase().includes(q) || t.tiendaNombre.toLowerCase().includes(q)
  })

  const reincidentesCount = allTiendas.filter((t) => t.incidentes >= 2).length
  const mttrGlobal = (() => {
    const vals = allTiendas.filter((t) => t.mttrPromedioMin != null)
    return vals.length ? Math.round(vals.reduce((a, t) => a + t.mttrPromedioMin!, 0) / vals.length) : null
  })()

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'inherit' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => window.history.back()}
          style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: '12px', cursor: 'pointer', padding: 0, marginBottom: '8px', fontWeight: 500 }}>
          ← Volver al dashboard
        </button>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Detalle - Tiendas críticas</div>
        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
          Análisis de tiendas con mayor criticidad, reincidencia e impacto operativo.
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Fecha inicio</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Fecha fin</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
        </div>
        <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {provLista.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <input
          type="text" placeholder="Buscar tienda..." value={buscar} onChange={(e) => setBuscar(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', minWidth: '140px' }}
        />
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
            <SumCard icon="🏪" label="Tiendas reincidentes" value={String(reincidentesCount)} sub={`${allTiendas.length} tiendas afectadas en el período`} color="#A32D2D" />
            <SumCard icon="💰" label="Costo acumulado" value={fmtCosto(resumen?.costoAcumulado ?? 0)} sub="margen bruto 35%" />
            <SumCard icon="⏱" label="MTTR promedio del período" value={fmtMin(mttrGlobal)} sub="todas las tiendas" color="#854F0B" />
            <SumCard icon="⚠️" label="Reincidencias detectadas" value={String(resumen?.reincidenciasDetectadas ?? 0)} sub="tipo repetido" color="#854F0B" />
            <SumCard icon="🛡" label="Sin contingencia" value={`${resumen?.sinContingencia ?? 0} tiendas`} sub="con 2+ incidentes" color="#A32D2D" />
            <SumCard icon="👤" label="Proveedor más asociado" value={resumen?.proveedorMasAsociado ?? '—'} sub="mayor concentración" color="#185FA5" />
          </div>

          {/* Tabla 1: Ranking */}
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>
              1. Ranking de tiendas críticas
              <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: '8px' }}>
                Haz clic en una tienda para ver su historial
              </span>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <TH>Tienda</TH>
                    <TH>Proveedor</TH>
                    <TH>Distrito</TH>
                    <TH>Cluster</TH>
                    <TH align="center">Incidentes</TH>
                    <TH align="center">Reincidencias</TH>
                    <TH>MTTR promedio</TH>
                    <TH align="center">SLA %</TH>
                    <TH>Costo estimado</TH>
                    <TH align="center">Contingencia</TH>
                    <TH align="center">Riesgo</TH>
                    <TH>Estado</TH>
                  </tr>
                </thead>
                <tbody>
                  {filteredTiendas.map((t) => {
                    const badge = estadoBadge(t.estado)
                    const isSelected = selectedTienda?.tiendaCodigo === t.tiendaCodigo
                    const slaColor = t.slaPct != null ? (t.slaPct >= 90 ? '#3B6D11' : t.slaPct >= 70 ? '#854F0B' : '#A32D2D') : '#888780'
                    return (
                      <tr key={t.tiendaId}
                        onClick={() => handleSelectTienda(t)}
                        style={{ cursor: 'pointer', background: isSelected ? '#EFF6FF' : t.estado === 'critica' ? '#FFF8F8' : 'transparent', outline: isSelected ? '1px solid #185FA5' : 'none' }}>
                        <TD><span style={{ fontWeight: 700 }}>{t.tiendaCodigo}</span> <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{t.tiendaNombre}</span></TD>
                        <TD><ProvBadge nombre={t.proveedorNombre} /></TD>
                        <TD><span style={{ color: 'var(--muted-foreground)' }}>{t.distrito ?? '—'}</span></TD>
                        <TD align="center"><span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{t.cluster ?? '—'}</span></TD>
                        <TD align="center"><strong>{t.incidentes}</strong></TD>
                        <TD align="center">
                          <span style={{ color: t.reincidencias >= 2 ? '#A32D2D' : t.reincidencias > 0 ? '#854F0B' : '#0f172a', fontWeight: t.reincidencias > 0 ? 600 : 400 }}>{t.reincidencias}</span>
                        </TD>
                        <TD>
                          <span style={{ color: t.mttrPromedioMin != null && t.mttrPromedioMin > 240 ? '#A32D2D' : t.mttrPromedioMin != null && t.mttrPromedioMin > 120 ? '#854F0B' : '#3B6D11' }}>
                            {fmtMin(t.mttrPromedioMin)}
                          </span>
                        </TD>
                        <TD align="center">
                          {t.slaPct != null
                            ? <span style={{ fontWeight: 600, color: slaColor }}>{t.slaPct}%</span>
                            : <span style={{ color: '#888780', fontSize: '11px' }} title="Sin escalamiento al proveedor">S/E</span>}
                        </TD>
                        <TD mono>{t.costoEstimado > 0 ? fmtCosto(t.costoEstimado) : '—'}</TD>
                        <TD align="center">
                          <span style={{ fontWeight: 600, color: t.tieneContingencia ? '#3B6D11' : '#A32D2D' }}>
                            {t.tieneContingencia ? 'Sí' : 'No'}
                          </span>
                        </TD>
                        <TD align="center">
                          {(() => {
                            const rBg    = t.score >= 70 ? '#FCEBEB' : t.score >= 40 ? '#FAEEDA' : '#EAF3DE'
                            const rColor = t.score >= 70 ? '#A32D2D' : t.score >= 40 ? '#854F0B' : '#3B6D11'
                            const rLabel = t.score >= 70 ? 'Alto'    : t.score >= 40 ? 'Medio'   : 'Bajo'
                            return <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: rBg, color: rColor, fontWeight: 600, whiteSpace: 'nowrap' }}>{rLabel}</span>
                          })()}
                        </TD>
                        <TD>
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: badge.bg, color: badge.color, fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {badge.label}
                          </span>
                        </TD>
                      </tr>
                    )
                  })}
                  {filteredTiendas.length === 0 && (
                    <tr><td colSpan={12} style={{ padding: '32px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin tiendas en el período seleccionado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {filteredTiendas.length > 0 && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                Mostrando {filteredTiendas.length} de {allTiendas.length} tiendas críticas
              </div>
            )}
          </div>

          {/* Tabla 2: Historial tienda seleccionada */}
          {selectedTienda && (
            <div style={{ background: 'white', border: '0.5px solid #185FA5', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                  2. Historial resumido de la tienda seleccionada ({selectedTienda.tiendaCodigo})
                </div>
                <button onClick={() => { setSelectedTienda(null); setHistorial(null) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)', lineHeight: 1 }}>✕</button>
              </div>
              {loadingHistorial && (
                <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando historial...</div>
              )}
              {!loadingHistorial && historial && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <TH>ID incidente</TH>
                        <TH>Fecha</TH>
                        <TH>Tipo</TH>
                        <TH>Proveedor</TH>
                        <TH>Duración</TH>
                        <TH align="center">SLA general</TH>
                        <TH>Costo estimado</TH>
                        <TH>Estado</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {historial.map((h, i) => (
                        <tr key={i}>
                          <TD><span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--muted-foreground)' }}>{h.codigo}</span></TD>
                          <TD>{h.fecha}</TD>
                          <TD>{fmtTipo(h.tipo)}</TD>
                          <TD><ProvBadge nombre={h.provNombre} /></TD>
                          <TD mono>{fmtMin(h.duracionMin)}</TD>
                          <TD align="center">
                            {h.slaGeneral === null
                              ? <span style={{ color: '#888780', fontSize: '10px' }}>No eval.</span>
                              : h.slaGeneral
                                ? <span style={{ color: '#3B6D11', fontWeight: 600, fontSize: '11px' }}>Cumplió</span>
                                : <span style={{ color: '#A32D2D', fontWeight: 600, fontSize: '11px' }}>No cumplió</span>}
                          </TD>
                          <TD mono>{h.costoEstimado > 0 ? fmtCosto(h.costoEstimado) : '—'}</TD>
                          <TD>
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px',
                              background: h.estado === 'RESUELTO' ? '#EAF3DE' : h.estado === 'EN_PROCESO' ? '#E6F1FB' : '#F3F4F6',
                              color: h.estado === 'RESUELTO' ? '#3B6D11' : h.estado === 'EN_PROCESO' ? '#185FA5' : '#888780' }}>
                              {h.estado}
                            </span>
                          </TD>
                        </tr>
                      ))}
                      {historial.length === 0 && (
                        <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin incidentes en el período</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tabla 3: Patrones detectados */}
          {patrones.length > 0 && (
            <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>3. Patrón detectado</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <TH>Tienda</TH>
                      <TH>Patrón detectado</TH>
                      <TH>Tipo repetido</TH>
                      <TH>Proveedor repetido</TH>
                      <TH align="center">Veces</TH>
                      <TH>Recomendación</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {patrones.map((p, i) => (
                      <tr key={i}>
                        <TD><span style={{ fontWeight: 700 }}>{p.tiendaCodigo}</span></TD>
                        <TD>{p.patronDetectado}</TD>
                        <TD>{p.tipoRepetido ? fmtTipo(p.tipoRepetido) : '—'}</TD>
                        <TD><ProvBadge nombre={p.proveedorRepetido} /></TD>
                        <TD align="center"><strong style={{ color: p.veces >= 3 ? '#A32D2D' : '#854F0B' }}>{p.veces}</strong></TD>
                        <TD><span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{p.recomendacion}</span></TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Conclusiones */}
          {conclusiones.length > 0 && (
            <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>4. Conclusiones automáticas</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
                {conclusiones.map((c, i) => {
                  const icons = ['⚠️', '🔄', '📡', '🛡', '📊']
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
            Nota metodológica: Score tienda = reincidencia 30% · costo estimado 25% · MTTR 20% · SLA bajo 15% · sin contingencia 10%. Estado crítica: 2+ incidentes con SLA &lt; 70%, reincidencia ≥ 2, o costo alto. Costo estimado basado en MTTR, venta/hora y margen bruto 35%.
          </div>
        </>
      )}
    </div>
  )
}

export default function TiendasCriticasPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--muted-foreground)' }}>Cargando...</div>}>
      <TiendasCriticasContent />
    </Suspense>
  )
}
