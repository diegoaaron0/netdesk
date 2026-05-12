'use client'
import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { InsightsResponse, Insight, EvidenciaIncidente, KpiOrigen } from '@/types/insights'

// ─── KPI chip colors ─────────────────────────────────────────────────────────

const KPI_COLORS: Record<KpiOrigen, { bg: string; color: string }> = {
  A: { bg: '#F1F5F9', color: '#475569' },
  B: { bg: '#DBEAFE', color: '#1D4ED8' },
  C: { bg: '#CCFBF1', color: '#0F766E' },
  D: { bg: '#FEF3C7', color: '#B45309' },
  E: { bg: '#EFF6FF', color: '#3B82F6' },
  F: { bg: '#DCFCE7', color: '#16A34A' },
  G: { bg: '#F3E8FF', color: '#9333EA' },
}

const KPI_LABELS: Record<KpiOrigen, string> = {
  A: 'A - Resumen general',
  B: 'B - Análisis por tipo',
  C: 'C - Tiendas críticas',
  D: 'D - Distribución tipo',
  E: 'E - SLA proveedor',
  F: 'F - Impacto geográfico',
  G: 'G - Tendencia SLA',
}

const TIPO_CONFIG = {
  alerta: { label: 'Alerta', bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA', icon: '⚠' },
  accion: { label: 'Acción', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A', icon: '→' },
  logro:  { label: 'Logro',  bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0', icon: '✓' },
}

const PRIO_CONFIG = {
  alta:  { label: 'Alta',  dot: '#EF4444', textColor: '#B91C1C' },
  media: { label: 'Media', dot: '#F59E0B', textColor: '#B45309' },
  baja:  { label: 'Baja',  dot: '#6B7280', textColor: '#374151' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMin(min: number | null | undefined) {
  if (min == null) return '—'
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function defaultDesde() {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}
function defaultHasta() { return new Date().toISOString().split('T')[0] }

// ─── Inner content ────────────────────────────────────────────────────────────

function InsightsPageContent() {
  const router        = useRouter()
  const searchParams  = useSearchParams()

  const [desde,       setDesde]      = useState(searchParams.get('desde') ?? defaultDesde())
  const [hasta,       setHasta]      = useState(searchParams.get('hasta') ?? defaultHasta())
  const [proveedorId, setProveedorId]= useState(searchParams.get('proveedorId') ?? '')

  const [data,        setData]       = useState<InsightsResponse | null>(null)
  const [loading,     setLoading]    = useState(false)
  const [error,       setError]      = useState(false)

  const [selectedId,  setSelectedId] = useState<string | null>(null)
  const [evidencias,  setEvidencias] = useState<EvidenciaIncidente[]>([])
  const [loadingEv,   setLoadingEv]  = useState(false)
  const [searchEv,    setSearchEv]   = useState('')
  const [filterTipo,  setFilterTipo] = useState<'todos' | 'alerta' | 'accion' | 'logro'>('todos')

  const fetchData = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/insights?${params}`)
      if (res.ok) setData(await res.json())
      else setError(true)
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchEvidencias = useCallback(async (ins: Insight) => {
    setLoadingEv(true); setEvidencias([])
    try {
      const params = new URLSearchParams({ tipo: ins.entidadTipo, entidad: ins.entidad, desde, hasta })
      const res = await fetch(`/api/dashboard/insights/evidencia?${params}`)
      if (res.ok) { const d = await res.json(); setEvidencias(d.evidencias ?? []) }
    } catch {}
    finally { setLoadingEv(false) }
  }, [desde, hasta])

  const insights = data?.insights ?? []
  const resumen  = data?.resumenGlobal
  const conclusiones = data?.conclusiones ?? []

  const filteredInsights = insights.filter(i => filterTipo === 'todos' || i.tipo === filterTipo)
  const selectedInsight  = insights.find(i => i.id === selectedId) ?? null

  function handleSelectInsight(ins: Insight) {
    if (selectedId === ins.id) { setSelectedId(null); setEvidencias([]) }
    else { setSelectedId(ins.id); fetchEvidencias(ins) }
  }

  const filteredEv = evidencias.filter(e =>
    !searchEv ||
    e.codigo.toLowerCase().includes(searchEv.toLowerCase()) ||
    e.tienda.toLowerCase().includes(searchEv.toLowerCase()) ||
    e.proveedor.toLowerCase().includes(searchEv.toLowerCase())
  )

  function exportCSV() {
    const header = ['Código', 'Tipo', 'Proveedor', 'Tienda', 'Distrito', 'Hora Registro', 'Hora Fin', 'Estado', 'SLA', 'MTTR (min)', 'Impacto S/'].join(',')
    const rows = filteredEv.map(e => [
      e.codigo, e.tipo, e.proveedor, e.tienda, e.distrito,
      e.horaRegistro, e.horaFin ?? '', e.estado,
      e.slaCumplido == null ? 'N/E' : e.slaCumplido ? 'Sí' : 'No',
      e.mttrMin ?? '', e.impactoEstimado ?? '',
    ].map(v => `"${v}"`).join(','))
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'evidencia-insight.csv'; a.click()
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => router.back()}
          style={{ padding: '6px 12px', fontSize: '12px', background: '#F1F5F9', border: '0.5px solid #e5e7eb', borderRadius: '7px', cursor: 'pointer', fontWeight: 500 }}
        >← Volver</button>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>H. Insights y decisiones sugeridas</div>
          <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Recomendaciones ejecutivas generadas automáticamente a partir de los KPIs del período</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {[
          { label: 'Desde', value: desde, onChange: setDesde, type: 'date' },
          { label: 'Hasta', value: hasta, onChange: setHasta, type: 'date' },
        ].map(({ label, value, onChange, type }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{label}</label>
            <input type={type} value={value} onChange={e => onChange(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '12px', border: '0.5px solid #e5e7eb', borderRadius: '6px', outline: 'none' }} />
          </div>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Proveedor</label>
          <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}
            style={{ padding: '5px 8px', fontSize: '12px', border: '0.5px solid #e5e7eb', borderRadius: '6px', outline: 'none' }}>
            <option value=''>Todos</option>
            {data?.proveedoresList?.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <button onClick={fetchData}
          style={{ padding: '6px 14px', fontSize: '12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 500 }}>
          Aplicar
        </button>
      </div>

      {/* KPI summary strip */}
      {resumen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {[
            { label: 'Total insights', value: resumen.totalInsights, color: '#0f172a', sub: '' },
            { label: 'Alertas altas', value: resumen.alertasAltas, color: '#B91C1C', sub: 'requieren acción inmediata' },
            { label: 'Acciones pend.', value: resumen.accionesPendientes, color: '#B45309', sub: 'mejoras posibles' },
            { label: 'Logros', value: resumen.logros, color: '#15803D', sub: 'tendencia positiva' },
          ].map(({ label, value, color, sub }) => (
            <div key={label} style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '12px 16px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginTop: '2px' }}>{label}</div>
              {sub && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Entity highlight */}
      {resumen && resumen.entidadMasCritica !== '—' && (
        <div style={{ background: '#FEF2F2', border: '0.5px solid #FECACA', borderRadius: '10px', padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '20px' }}>⚠</span>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#B91C1C' }}>Entidad más crítica del período</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
              {resumen.entidadMasCritica} <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 400 }}>({resumen.entidadMasCriticaTipo})</span>
            </div>
            {resumen.slaPromedioGlobal != null && (
              <div style={{ fontSize: '11px', color: '#374151', marginTop: '2px' }}>
                SLA global: <strong style={{ color: resumen.slaPromedioGlobal >= 90 ? '#15803D' : '#B91C1C' }}>{resumen.slaPromedioGlobal}%</strong>
                {' · '}Impacto estimado total: <strong>S/ {resumen.impactoEstimadoTotal.toLocaleString()}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TABLA 1 — Todos los insights */}
      <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Tabla 1 — Todos los insights del período</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['todos', 'alerta', 'accion', 'logro'] as const).map(f => (
              <button key={f} onClick={() => setFilterTipo(f)}
                style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '6px', border: '0.5px solid #e5e7eb', cursor: 'pointer', fontWeight: 500, background: filterTipo === f ? 'hsl(221,83%,23%)' : 'white', color: filterTipo === f ? 'white' : '#374151' }}>
                {f === 'todos' ? 'Todos' : TIPO_CONFIG[f].label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Generando insights…</div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#A32D2D', fontSize: '12px' }}>Error al cargar datos</div>
        ) : filteredInsights.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Sin insights para el período seleccionado</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredInsights.map(ins => {
              const tc = TIPO_CONFIG[ins.tipo]
              const pc = PRIO_CONFIG[ins.prioridad]
              const isSelected = selectedId === ins.id
              return (
                <div key={ins.id}
                  onClick={() => handleSelectInsight(ins)}
                  style={{ border: `0.5px solid ${isSelected ? '#6366F1' : tc.border}`, borderRadius: '10px', padding: '12px 14px', background: isSelected ? '#EEF2FF' : tc.bg, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: pc.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '999px', background: 'white', color: tc.color, border: `0.5px solid ${tc.border}` }}>
                      {tc.label}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 500, color: pc.textColor }}>Prioridad {pc.label}</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', flex: 1, minWidth: 0 }}>{ins.titulo}</span>
                    <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                      {ins.kpisOrigen.map(k => {
                        const c = KPI_COLORS[k]
                        return (
                          <span key={k} title={KPI_LABELS[k]} style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '999px', background: c.bg, color: c.color }}>
                            {k}
                          </span>
                        )
                      })}
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', flexShrink: 0 }}>Score: {ins.score}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#374151', lineHeight: 1.5 }}>{ins.descripcion}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: tc.color, flexShrink: 0 }}>Acción sugerida:</span>
                    <span style={{ fontSize: '10px', color: '#374151' }}>{ins.accionSugerida}</span>
                  </div>
                  {/* Evidencia chips */}
                  {ins.evidencia.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                      {ins.evidencia.slice(0, 4).map((ev, i) => (
                        <span key={i} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'white', border: '0.5px solid #e5e7eb', color: '#374151' }}>
                          {ev.entidad}: <strong>{ev.valor}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                  {isSelected && <div style={{ fontSize: '10px', color: '#6366F1', fontWeight: 500, marginTop: '2px' }}>▼ Mostrando evidencia detallada abajo</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* TABLA 2 — Evidencia del insight seleccionado */}
      {selectedInsight && (
        <div style={{ background: 'white', border: '0.5px solid #6366F1', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Tabla 2 — Evidencia: {selectedInsight.titulo}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Incidentes relacionados con la entidad "{selectedInsight.entidad}"</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={searchEv}
                onChange={e => setSearchEv(e.target.value)}
                placeholder="Buscar…"
                style={{ padding: '5px 10px', fontSize: '11px', border: '0.5px solid #e5e7eb', borderRadius: '6px', outline: 'none', width: '160px' }}
              />
              <button onClick={exportCSV}
                style={{ padding: '5px 12px', fontSize: '11px', background: '#F0FDF4', color: '#15803D', border: '0.5px solid #BBF7D0', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                Exportar CSV
              </button>
            </div>
          </div>
          {loadingEv ? (
            <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando evidencia…</div>
          ) : filteredEv.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin incidentes para los filtros aplicados</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {['Código', 'Tipo', 'Proveedor', 'Tienda', 'Distrito', 'Registro', 'Estado', 'SLA', 'MTTR', 'Impacto S/'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '0.5px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEv.map(e => (
                    <tr key={e.id} style={{ borderBottom: '0.5px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{e.codigo}</td>
                      <td style={{ padding: '8px 10px' }}>{e.tipo}</td>
                      <td style={{ padding: '8px 10px' }}>{e.proveedor}</td>
                      <td style={{ padding: '8px 10px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.tienda}</td>
                      <td style={{ padding: '8px 10px' }}>{e.distrito}</td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtDate(e.horaRegistro)}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', background: e.estado === 'RESUELTO' ? '#DCFCE7' : '#FEF3C7', color: e.estado === 'RESUELTO' ? '#15803D' : '#B45309', fontWeight: 600 }}>
                          {e.estado}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        {e.slaCumplido == null
                          ? <span style={{ color: '#94A3B8' }}>N/E</span>
                          : <span style={{ fontWeight: 600, color: e.slaCumplido ? '#15803D' : '#B91C1C' }}>{e.slaCumplido ? 'Sí' : 'No'}</span>}
                      </td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtMin(e.mttrMin)}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 500 }}>{e.impactoEstimado != null ? `S/ ${e.impactoEstimado.toLocaleString()}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '8px 10px', fontSize: '10px', color: 'var(--muted-foreground)' }}>
                Mostrando {filteredEv.length} de {evidencias.length} registros
              </div>
            </div>
          )}
        </div>
      )}

      {/* TABLA 3 — KPIs origen cruzado */}
      {!loading && insights.length > 0 && (
        <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Tabla 3 — Resumen por KPI de origen</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(Object.keys(KPI_COLORS) as KpiOrigen[]).map(k => {
              const count = insights.filter(i => i.kpisOrigen.includes(k)).length
              if (count === 0) return null
              const c = KPI_COLORS[k]
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '8px', background: c.bg, border: `0.5px solid ${c.color}22` }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: c.color }}>{k}</span>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: c.color }}>{count} insight{count > 1 ? 's' : ''}</div>
                    <div style={{ fontSize: '10px', color: c.color, opacity: 0.8 }}>{KPI_LABELS[k].replace(`${k} - `, '')}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TABLA 4 — Conclusiones */}
      {conclusiones.length > 0 && (
        <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Tabla 4 — Conclusiones ejecutivas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {conclusiones.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', padding: '10px 14px', background: '#F8FAFC', borderRadius: '8px', border: '0.5px solid #e5e7eb' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'hsl(221,83%,23%)', flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ fontSize: '11px', color: '#374151', lineHeight: 1.5 }}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metodología */}
      <div style={{ background: '#F8FAFC', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
        <div style={{ fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Metodología de generación de insights</div>
        <strong>Regla 1</strong> Proveedor crítico combinado (SLA &lt;70% + MTTR alto + alto impacto). <strong>Regla 2</strong> Incumplimiento SLA sostenido 3+ meses consecutivos (&lt;80%). <strong>Regla 3</strong> Tienda sin contingencia con 2+ incidentes. <strong>Regla 4</strong> Tipo de incidente dominante (&gt;40% del total). <strong>Regla 5</strong> Zona geográfica crítica (SLA &lt;70%). <strong>Regla 6</strong> Causa OTROS repetida 3+ veces. <strong>Regla 7</strong> Mejora positiva sostenida 3+ meses.
        Score = impacto×0.30 + SLA_bajo×0.25 + reincidencia×0.20 + MTTR×0.15 + sin_contingencia×0.10. Se aplica deduplicación para proveedor con múltiples señales negativas.
      </div>
    </div>
  )
}

// ─── Wrapper with Suspense ────────────────────────────────────────────────────

export default function InsightsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)' }}>Cargando…</div>}>
      <InsightsPageContent />
    </Suspense>
  )
}
