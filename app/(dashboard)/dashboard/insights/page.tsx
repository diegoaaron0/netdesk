'use client'
import { Suspense, useState, useEffect, useCallback } from 'react'
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

const KPI_ROUTES: Partial<Record<KpiOrigen, string>> = {
  C: '/dashboard/tiendas-criticas',
  D: '/dashboard/distribucion-tipo',
  E: '/dashboard/sla-proveedor',
  F: '/dashboard/impacto-geografico',
  G: '/dashboard/tendencia-sla-6m',
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

const INCIDENTE_MAP: Record<string, string> = {
  CAIDA_TOTAL:   'caída total',
  INTERMITENCIA: 'intermitencia',
  LENTITUD:      'lentitud',
  OTROS:         'otros',
}

const INCIDENTE_READABLE: Record<string, string> = {
  CAIDA_TOTAL:   'Caída total',
  INTERMITENCIA: 'Intermitencia',
  LENTITUD:      'Lentitud',
  OTROS:         'Otros',
}

function fmtText(text: string): string {
  return text.replace(/\b(CAIDA_TOTAL|INTERMITENCIA|LENTITUD|OTROS)\b/g, m => INCIDENTE_READABLE[m] ?? m)
}

function riskBadge(prioridad: string, score: number): { label: string; bg: string; color: string; border: string } {
  if (prioridad === 'alta')  return { label: 'Riesgo alto',  bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA' }
  if (prioridad === 'media') return { label: 'Riesgo medio', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' }
  if (score >= 40)           return { label: 'Riesgo medio', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' }
  return                            { label: 'Riesgo bajo',  bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' }
}

function fmtEvidencia(entidad: string, valor: string): string {
  if (entidad in INCIDENTE_MAP) {
    if (valor.includes('%')) return `${valor} del total`
    return `${valor} inc. ${INCIDENTE_MAP[entidad]}`
  }
  if (valor === 'No') return 'Sin contingencia'
  if (valor === 'Sí') return 'Con contingencia'
  if (/^\d+$/.test(valor)) return `${valor} incidentes`
  return valor
}

// ─── Decisión helpers ────────────────────────────────────────────────────────

type TipoDecision =
  | 'CAMBIO_PROVEEDOR' | 'RENEGOCIACION_CONTRATO' | 'ACTIVACION_CONTINGENCIA'
  | 'REVISION_SLA' | 'BAJA_TIENDA' | 'CAMBIO_PLAN' | 'AUDITORIA_PROVEEDOR' | 'OTRO'

const TIPO_DECISION_LABELS: Record<TipoDecision, string> = {
  CAMBIO_PROVEEDOR:        'Cambio de proveedor',
  RENEGOCIACION_CONTRATO:  'Renegociación de contrato',
  ACTIVACION_CONTINGENCIA: 'Activación de contingencia',
  REVISION_SLA:            'Revisión de SLA',
  BAJA_TIENDA:             'Baja de tienda',
  CAMBIO_PLAN:             'Cambio de plan',
  AUDITORIA_PROVEEDOR:     'Auditoría de proveedor',
  OTRO:                    'Otro',
}

function calcFechaSeguimiento(tipo: TipoDecision): string {
  const days = tipo === 'ACTIVACION_CONTINGENCIA' ? 7 : tipo === 'AUDITORIA_PROVEEDOR' ? 15 : 30
  const d = new Date(); d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function buildDecisionPreset(
  ins: Insight,
  proveedoresList: { id: string; nombre: string }[],
): { tipo: TipoDecision; titulo: string; proveedorId?: string } {
  const lookupProv = () => proveedoresList.find(p => p.nombre === ins.entidad)?.id
  switch (ins.categoria) {
    case 'proveedor_critico':
    case 'incumplimiento_sostenido':
      return { tipo: 'REVISION_SLA', titulo: `Revisión SLA con ${ins.entidad}`, proveedorId: lookupProv() }
    case 'zona_critica':
      return { tipo: 'AUDITORIA_PROVEEDOR', titulo: `Auditoría zona ${ins.entidad}` }
    case 'tipo_dominante':
      return { tipo: 'OTRO', titulo: `Plan reducción ${fmtText(ins.entidad)}` }
    case 'tienda_sin_contingencia':
      return { tipo: 'ACTIVACION_CONTINGENCIA', titulo: `Activar contingencia ${ins.entidad}` }
    case 'falla_sistemica':
      return { tipo: 'REVISION_SLA', titulo: 'Revisión proceso de escalamiento global' }
    default:
      return { tipo: 'OTRO', titulo: fmtText(ins.titulo) }
  }
}

function extractSnap(meta: Record<string, string | number | null>) {
  const n = (v: string | number | null | undefined): number | null =>
    typeof v === 'number' ? v : null
  return {
    snapSlaPct:      n(meta.sla ?? meta.slaActual ?? meta.pct),
    snapMttrMinutos: n(meta.mttr),
    snapIei:         n(meta.impacto),
    snapIncidentes:  n(meta.cnt ?? meta.incidentes ?? meta.proveedoresCriticos ?? meta.evaluables),
  }
}

// ─── Inline evidence panel ────────────────────────────────────────────────────

function InlinePanel({
  insight, evidencias, loading, search, onSearch, onExport,
}: {
  insight: Insight
  evidencias: EvidenciaIncidente[]
  loading: boolean
  search: string
  onSearch: (v: string) => void
  onExport: () => void
}) {
  const filtered = evidencias.filter(e =>
    !search ||
    e.codigo.toLowerCase().includes(search.toLowerCase()) ||
    e.tienda.toLowerCase().includes(search.toLowerCase()) ||
    e.proveedor.toLowerCase().includes(search.toLowerCase())
  )

  const thStyle: React.CSSProperties = {
    padding: '5px 8px', textAlign: 'left', fontWeight: 600,
    color: 'var(--muted-foreground)', fontSize: '10px',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '0.5px solid #e5e7eb', whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = { padding: '6px 8px', fontSize: '11px' }

  function SlaBadge({ v }: { v: boolean | null }) {
    if (v == null) return <span style={{ color: '#94A3B8' }}>N/E</span>
    return <span style={{ fontWeight: 600, color: v ? '#15803D' : '#B91C1C' }}>{v ? 'Sí' : 'No'}</span>
  }

  function EstadoBadge({ v }: { v: string }) {
    const ok = v === 'RESUELTO'
    return (
      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', background: ok ? '#DCFCE7' : '#FEF3C7', color: ok ? '#15803D' : '#B45309', fontWeight: 600 }}>
        {v}
      </span>
    )
  }

  let tableContent: React.ReactNode

  if (loading) {
    tableContent = <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', padding: '8px 0' }}>Cargando incidentes…</div>
  } else if (evidencias.length === 0) {
    tableContent = <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', padding: '8px 0' }}>Sin incidentes disponibles para este período.</div>
  } else if (filtered.length === 0) {
    tableContent = <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', padding: '8px 0' }}>Sin resultados para la búsqueda.</div>
  } else if (insight.entidadTipo === 'proveedor') {
    const rows = filtered.slice(0, 5)
    tableContent = (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead><tr style={{ background: '#F8FAFC' }}>
          {['Código', 'Tienda', 'MTTR', 'SLA'].map(h => <th key={h} style={thStyle}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(e => (
          <tr key={e.id} style={{ borderBottom: '0.5px solid #f1f5f9' }}>
            <td style={tdStyle}><strong>{e.codigo}</strong></td>
            <td style={{ ...tdStyle, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.tienda}</td>
            <td style={tdStyle}>{fmtMin(e.mttrMin)}</td>
            <td style={tdStyle}><SlaBadge v={e.slaCumplido} /></td>
          </tr>
        ))}</tbody>
      </table>
    )
  } else if (insight.entidadTipo === 'zona') {
    const byTienda = new Map<string, { total: number; cumplidos: number; evaluables: number }>()
    for (const e of filtered) {
      if (!byTienda.has(e.tienda)) byTienda.set(e.tienda, { total: 0, cumplidos: 0, evaluables: 0 })
      const t = byTienda.get(e.tienda)!
      t.total++
      if (e.slaCumplido !== null) { t.evaluables++; if (e.slaCumplido) t.cumplidos++ }
    }
    const rows = Array.from(byTienda.entries()).sort((a, b) => b[1].total - a[1].total)
    tableContent = (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead><tr style={{ background: '#F8FAFC' }}>
          {['Tienda', 'Incidentes', 'SLA'].map(h => <th key={h} style={thStyle}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(([tienda, z]) => {
          const sla = z.evaluables > 0 ? Math.round((z.cumplidos / z.evaluables) * 100) : null
          return (
            <tr key={tienda} style={{ borderBottom: '0.5px solid #f1f5f9' }}>
              <td style={tdStyle}>{tienda}</td>
              <td style={{ ...tdStyle, fontWeight: 600 }}>{z.total}</td>
              <td style={{ ...tdStyle, fontWeight: 600, color: sla == null ? '#94A3B8' : sla >= 90 ? '#15803D' : '#B91C1C' }}>
                {sla != null ? `${sla}%` : 'N/E'}
              </td>
            </tr>
          )
        })}</tbody>
      </table>
    )
  } else if (insight.entidadTipo === 'tipo') {
    const rows = [...filtered].sort((a, b) => (b.impactoEstimado ?? 0) - (a.impactoEstimado ?? 0)).slice(0, 5)
    tableContent = (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead><tr style={{ background: '#F8FAFC' }}>
          {['Código', 'Tienda', 'Impacto S/'].map(h => <th key={h} style={thStyle}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(e => (
          <tr key={e.id} style={{ borderBottom: '0.5px solid #f1f5f9' }}>
            <td style={tdStyle}><strong>{e.codigo}</strong></td>
            <td style={{ ...tdStyle, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.tienda}</td>
            <td style={{ ...tdStyle, fontWeight: 500 }}>{e.impactoEstimado != null ? `S/ ${e.impactoEstimado.toLocaleString()}` : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    )
  } else if (insight.entidadTipo === 'tienda') {
    const rows = filtered.slice(0, 8)
    tableContent = (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead><tr style={{ background: '#F8FAFC' }}>
          {['Código', 'Tipo', 'Registro', 'Estado'].map(h => <th key={h} style={thStyle}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(e => (
          <tr key={e.id} style={{ borderBottom: '0.5px solid #f1f5f9' }}>
            <td style={tdStyle}><strong>{e.codigo}</strong></td>
            <td style={tdStyle}>{fmtText(e.tipo)}</td>
            <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDate(e.horaRegistro)}</td>
            <td style={tdStyle}><EstadoBadge v={e.estado} /></td>
          </tr>
        ))}</tbody>
      </table>
    )
  } else {
    // global / falla_sistemica: código, proveedor, MTTR, SLA
    const rows = filtered.slice(0, 5)
    tableContent = (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead><tr style={{ background: '#F8FAFC' }}>
          {['Código', 'Proveedor', 'MTTR', 'SLA'].map(h => <th key={h} style={thStyle}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(e => (
          <tr key={e.id} style={{ borderBottom: '0.5px solid #f1f5f9' }}>
            <td style={tdStyle}><strong>{e.codigo}</strong></td>
            <td style={tdStyle}>{e.proveedor}</td>
            <td style={tdStyle}>{fmtMin(e.mttrMin)}</td>
            <td style={tdStyle}><SlaBadge v={e.slaCumplido} /></td>
          </tr>
        ))}</tbody>
      </table>
    )
  }

  return (
    <div
      style={{ marginTop: '10px', borderTop: '0.5px solid #e5e7eb', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '10px', fontWeight: 600, color: '#6366F1' }}>
          Incidentes relacionados{!loading && evidencias.length > 0 ? ` (${filtered.length})` : ''}
        </span>
        {!loading && evidencias.length > 0 && (
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="Buscar…"
              style={{ padding: '4px 8px', fontSize: '11px', border: '0.5px solid #e5e7eb', borderRadius: '6px', outline: 'none', width: '130px' }}
            />
            <button
              onClick={onExport}
              style={{ padding: '4px 10px', fontSize: '10px', background: '#F0FDF4', color: '#15803D', border: '0.5px solid #BBF7D0', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
            >
              CSV
            </button>
          </div>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>{tableContent}</div>
    </div>
  )
}

// ─── DecisionModal ───────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  padding: '7px 10px', fontSize: '12px', border: '0.5px solid #e5e7eb',
  borderRadius: '7px', outline: 'none', width: '100%',
  boxSizing: 'border-box', fontFamily: 'inherit', background: 'white',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  )
}

function SnapChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{value}</span>
    </div>
  )
}

function DecisionModal({
  insight, proveedoresList, snapPeriodo, onClose,
}: {
  insight: Insight
  proveedoresList: { id: string; nombre: string }[]
  snapPeriodo: string
  onClose: (saved: boolean) => void
}) {
  const preset = buildDecisionPreset(insight, proveedoresList)
  const snap   = extractSnap(insight.metaDatos)

  const [titulo,           setTitulo]           = useState(preset.titulo)
  const [tipo,             setTipo]             = useState<TipoDecision>(preset.tipo)
  const [motivo,           setMotivo]           = useState(insight.descripcion)
  const [descripcion,      setDescripcion]      = useState('')
  const [fechaSeguimiento, setFechaSeguimiento] = useState(() => calcFechaSeguimiento(preset.tipo))
  const [saving,           setSaving]           = useState(false)
  const [saveError,        setSaveError]        = useState('')

  const hasSnap = snap.snapSlaPct != null || snap.snapMttrMinutos != null ||
                  snap.snapIei != null    || snap.snapIncidentes != null

  async function handleSubmit() {
    if (!titulo.trim() || !motivo.trim()) return
    setSaving(true); setSaveError('')
    try {
      const body: Record<string, unknown> = {
        tipo, titulo: titulo.trim(), motivo: motivo.trim(),
        snapPeriodo,
      }
      if (descripcion.trim())    body.descripcion      = descripcion.trim()
      if (preset.proveedorId)    body.proveedorId      = preset.proveedorId
      if (fechaSeguimiento)      body.fechaSeguimiento = fechaSeguimiento
      if (snap.snapSlaPct      != null) body.snapSlaPct      = snap.snapSlaPct
      if (snap.snapMttrMinutos != null) body.snapMttrMinutos = snap.snapMttrMinutos
      if (snap.snapIei         != null) body.snapIei         = snap.snapIei
      if (snap.snapIncidentes  != null) body.snapIncidentes  = snap.snapIncidentes

      const res = await fetch('/api/decisiones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) { onClose(true) }
      else { const d = await res.json(); setSaveError(d.error ?? 'Error al guardar') }
    } catch { setSaveError('Error de conexión') }
    finally { setSaving(false) }
  }

  const canSave = titulo.trim().length > 0 && motivo.trim().length > 0 && !saving

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={() => onClose(false)}
    >
      <div
        style={{ background: 'white', borderRadius: '12px', padding: '20px 24px', width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Registrar decisión</div>
          <button onClick={() => onClose(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#6B7280', lineHeight: 1, padding: '2px 6px' }}>×</button>
        </div>

        {/* Context */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '10px', padding: '6px 10px', background: '#F1F5F9', borderRadius: '7px' }}>
          <span style={{ color: '#475569', flexShrink: 0 }}>Insight:</span>
          <strong style={{ color: '#0f172a', lineHeight: 1.4 }}>{fmtText(insight.titulo)}</strong>
        </div>

        {/* Fields */}
        <Field label="Título *">
          <input value={titulo} onChange={e => setTitulo(e.target.value)} style={inputSt} />
        </Field>

        <Field label="Tipo de decisión">
          <select value={tipo} onChange={e => setTipo(e.target.value as TipoDecision)} style={inputSt}>
            {(Object.entries(TIPO_DECISION_LABELS) as [TipoDecision, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Field>

        <Field label="Motivo *">
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={4}
            style={{ ...inputSt, resize: 'vertical' }} />
        </Field>

        <Field label="Descripción adicional">
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2}
            placeholder="Opcional" style={{ ...inputSt, resize: 'vertical' }} />
        </Field>

        <Field label="Fecha de seguimiento">
          <input type="date" value={fechaSeguimiento} onChange={e => setFechaSeguimiento(e.target.value)} style={inputSt} />
        </Field>

        {/* Snapshot */}
        {hasSnap && (
          <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '10px 14px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', width: '100%', marginBottom: '-4px' }}>Snapshot automático del período</span>
            {snap.snapSlaPct      != null && <SnapChip label="SLA"        value={`${snap.snapSlaPct}%`} />}
            {snap.snapMttrMinutos != null && <SnapChip label="MTTR"       value={fmtMin(snap.snapMttrMinutos)} />}
            {snap.snapIei         != null && <SnapChip label="Impacto"    value={`S/ ${snap.snapIei.toLocaleString()}`} />}
            {snap.snapIncidentes  != null && <SnapChip label="Incidentes" value={String(snap.snapIncidentes)} />}
          </div>
        )}

        {saveError && <div style={{ fontSize: '11px', color: '#B91C1C' }}>{saveError}</div>}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
          <button onClick={() => onClose(false)}
            style={{ padding: '7px 16px', fontSize: '12px', background: '#F1F5F9', border: '0.5px solid #e5e7eb', borderRadius: '7px', cursor: 'pointer', fontWeight: 500 }}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={!canSave}
            style={{ padding: '7px 16px', fontSize: '12px', fontWeight: 600, border: 'none', borderRadius: '7px', cursor: canSave ? 'pointer' : 'not-allowed', background: canSave ? 'hsl(221,83%,23%)' : '#94A3B8', color: 'white' }}>
            {saving ? 'Guardando…' : 'Guardar decisión'}
          </button>
        </div>
      </div>
    </div>
  )
}

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

  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [evidencias,     setEvidencias]     = useState<EvidenciaIncidente[]>([])
  const [loadingEv,      setLoadingEv]      = useState(false)
  const [searchEv,       setSearchEv]       = useState('')
  const [filterTipo,     setFilterTipo]     = useState<'todos' | 'alerta' | 'accion' | 'logro'>('todos')
  const [decisionIns,    setDecisionIns]    = useState<Insight | null>(null)
  const [toast,          setToast]          = useState<string | null>(null)
  const [hoveredKpi,     setHoveredKpi]     = useState<KpiOrigen | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

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

  const insights     = data?.insights ?? []
  const resumen      = data?.resumenGlobal
  const conclusiones = data?.conclusiones ?? []

  const filteredInsights = insights.filter(i => filterTipo === 'todos' || i.tipo === filterTipo)
  const selectedInsight  = insights.find(i => i.id === selectedId) ?? null

  function handleSelectInsight(ins: Insight) {
    if (selectedId === ins.id) {
      setSelectedId(null); setEvidencias([]); setSearchEv('')
    } else {
      setSelectedId(ins.id); setSearchEv(''); fetchEvidencias(ins)
    }
  }

  function exportCSV() {
    const header = ['Código', 'Tipo', 'Proveedor', 'Tienda', 'Distrito', 'Hora Registro', 'Hora Fin', 'Estado', 'SLA', 'MTTR (min)', 'Impacto S/'].join(',')
    const rows = evidencias.map(e => [
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
      <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#185FA5', fontWeight: 500, padding: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>← Volver al Dashboard</button>

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
            {data?.proveedoresList?.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
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
            { label: 'Total insights',  value: resumen.totalInsights,      color: '#0f172a', sub: '' },
            { label: 'Alertas altas',   value: resumen.alertasAltas,       color: '#B91C1C', sub: 'requieren acción inmediata' },
            { label: 'Acciones pend.',  value: resumen.accionesPendientes, color: '#B45309', sub: 'mejoras posibles' },
            { label: 'Logros',          value: resumen.logros,             color: '#15803D', sub: 'tendencia positiva' },
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
              {resumen.entidadMasCriticaTipo === 'global'
                ? 'Situación sistémica'
                : <>{resumen.entidadMasCritica} <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 400 }}>({resumen.entidadMasCriticaTipo})</span></>}
            </div>
            {resumen.entidadMasCriticaTipo === 'global' && (
              <div style={{ fontSize: '11px', color: '#374151', marginTop: '2px' }}>Múltiples proveedores en estado crítico simultáneo</div>
            )}
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
              const tc   = TIPO_CONFIG[ins.tipo]
              const pc   = PRIO_CONFIG[ins.prioridad]
              const rb   = riskBadge(ins.prioridad, ins.score)
              const isSel = selectedId === ins.id
              return (
                <div key={ins.id}
                  onClick={() => handleSelectInsight(ins)}
                  style={{ border: `0.5px solid ${isSel ? '#6366F1' : tc.border}`, borderRadius: '10px', padding: '12px 14px', background: isSel ? '#EEF2FF' : tc.bg, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px', transition: 'all 0.15s' }}>

                  {/* Row 1: tipo, prioridad, título, KPIs, badge riesgo */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: pc.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '999px', background: 'white', color: tc.color, border: `0.5px solid ${tc.border}` }}>
                      {tc.label}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 500, color: pc.textColor }}>Prioridad {pc.label}</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', flex: 1, minWidth: 0 }}>{fmtText(ins.titulo)}</span>
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
                    {/* Badge de riesgo en lugar de Score */}
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '999px', background: rb.bg, color: rb.color, border: `0.5px solid ${rb.border}`, flexShrink: 0 }}>
                      {rb.label}
                    </span>
                    {/* Botón registrar decisión */}
                    <button
                      onClick={e => { e.stopPropagation(); setDecisionIns(ins) }}
                      style={{ padding: '3px 10px', fontSize: '10px', fontWeight: 600, background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                    >
                      + Registrar decisión
                    </button>
                  </div>

                  {/* Row 2: descripción */}
                  <div style={{ fontSize: '11px', color: '#374151', lineHeight: 1.5 }}>{fmtText(ins.descripcion)}</div>

                  {/* Row 3: acción sugerida */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: tc.color, flexShrink: 0 }}>Acción sugerida:</span>
                    <span style={{ fontSize: '10px', color: '#374151' }}>{fmtText(ins.accionSugerida)}</span>
                  </div>

                  {/* Row 4: evidencia chips */}
                  {ins.evidencia.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                      {ins.evidencia.slice(0, 4).map((ev, i) => (
                        <span key={i} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'white', border: '0.5px solid #e5e7eb', color: '#374151' }}>
                          {ins.categoria === 'falla_sistemica' ? `${ev.entidad}: ${ev.valor}` : fmtEvidencia(ev.entidad, ev.valor)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Panel expandido inline */}
                  {isSel && selectedInsight && (
                    <InlinePanel
                      insight={selectedInsight}
                      evidencias={evidencias}
                      loading={loadingEv}
                      search={searchEv}
                      onSearch={setSearchEv}
                      onExport={exportCSV}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* TABLA 2 — KPIs origen cruzado */}
      {!loading && insights.length > 0 && (
        <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Tabla 2 — Insight principal por KPI</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(Object.keys(KPI_COLORS) as KpiOrigen[]).map(k => {
              const kpiInsights = insights.filter(i => i.kpisOrigen.includes(k))
              if (kpiInsights.length === 0) return null
              const top = kpiInsights.reduce((a, b) => b.score > a.score ? b : a)
              const c = KPI_COLORS[k]
              const route = KPI_ROUTES[k]
              const isHovered = hoveredKpi === k
              const pc = PRIO_CONFIG[top.prioridad]
              return (
                <div
                  key={k}
                  onClick={() => route && router.push(route)}
                  onMouseEnter={() => route && setHoveredKpi(k)}
                  onMouseLeave={() => setHoveredKpi(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '8px', background: c.bg, border: `0.5px solid ${isHovered ? c.color : c.color + '22'}`, cursor: route ? 'pointer' : 'default' }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: c.color }}>{k}</span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: pc.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: '10px', fontWeight: 600, color: pc.textColor }}>Prioridad {pc.label}</span>
                    </div>
                    <div style={{ fontSize: '10px', color: c.color, opacity: 0.8 }}>{KPI_LABELS[k].replace(`${k} - `, '')}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TABLA 3 — Conclusiones */}
      {conclusiones.length > 0 && (
        <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Tabla 3 — Conclusiones ejecutivas</div>
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
        <strong>Regla 1</strong> Proveedor crítico combinado (SLA &lt;70% + MTTR &gt;2h + impacto &gt;S/500). <strong>Regla 2</strong> Incumplimiento SLA sostenido 3+ meses consecutivos (&lt;80%). <strong>Regla 3</strong> Tienda sin contingencia con 2+ incidentes. <strong>Regla 4</strong> Tipo de incidente dominante (&gt;40% del total). <strong>Regla 5</strong> Zona geográfica crítica (SLA &lt;70%). <strong>Regla 6</strong> Causa Otros repetida 3+ veces. <strong>Regla 7</strong> Mejora positiva sostenida 3+ meses. <strong>Regla 8</strong> Falla sistémica: 3+ proveedores con SLA crítico simultáneo.
        Score = impacto×0.30 + SLA_bajo×0.25 + reincidencia×0.20 + MTTR×0.15 + sin_contingencia×0.10. Se aplica deduplicación para proveedor con múltiples señales negativas.
      </div>

      {/* Modal registrar decisión */}
      {decisionIns && (
        <DecisionModal
          insight={decisionIns}
          proveedoresList={data?.proveedoresList ?? []}
          snapPeriodo={`${desde} / ${hasta}`}
          onClose={saved => {
            setDecisionIns(null)
            if (saved) setToast('Decisión registrada correctamente')
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#0f172a', color: 'white', padding: '12px 20px', borderRadius: '10px', fontSize: '12px', fontWeight: 500, zIndex: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#4ADE80', fontSize: '14px' }}>✓</span> {toast}
        </div>
      )}
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
