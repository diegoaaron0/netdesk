'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { can } from '@/lib/permisos'

// ── Constants ──────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  CAMBIO_PROVEEDOR:       'Cambio de proveedor',
  RENEGOCIACION_CONTRATO: 'Renegociación de contrato',
  ACTIVACION_CONTINGENCIA:'Activación de contingencia',
  REVISION_SLA:           'Revisión de SLA',
  BAJA_TIENDA:            'Baja de tienda',
  CAMBIO_PLAN:            'Cambio de plan',
  AUDITORIA_PROVEEDOR:    'Auditoría de proveedor',
  OTRO:                   'Otro',
}

const TIPOS = Object.entries(TIPO_LABELS)

const ESTADO_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  PROPUESTO:    { bg: '#fef9c3', color: '#854d0e', label: 'Propuesto' },
  PENDIENTE:    { bg: '#f3f4f6', color: '#6b7280', label: 'Pendiente' },
  EN_EJECUCION: { bg: '#dbeafe', color: '#1e40af', label: 'En ejecución' },
  EJECUTADA:    { bg: '#dcfce7', color: '#15803d', label: 'Ejecutada' },
  CANCELADA:    { bg: '#fee2e2', color: '#b91c1c', label: 'Cancelada' },
  RECHAZADO:    { bg: '#fce7f3', color: '#9d174d', label: 'Rechazado' },
}

const ROL_LABELS: Record<string, string> = {
  AGENTE: 'Agente', SUPERVISOR: 'Supervisor',
  GERENCIA: 'Gerencia', INFRAESTRUCTURA: 'Infraestructura',
}

const PUEDE_APROBAR = new Set(['SUPERVISOR', 'GERENCIA'])

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return null
  return new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMttr(mins: number | string | null | undefined) {
  const n = Number(mins)
  if (!mins || isNaN(n) || n === 0) return '—'
  const h = Math.floor(n / 60), m = n % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtPct(v: string | number | null | undefined) {
  if (v == null || v === '') return '—'
  return `${Number(v).toFixed(1)}%`
}

function fmtIei(v: string | number | null | undefined) {
  if (v == null || v === '') return '—'
  return `S/ ${Number(v).toLocaleString('es-PE')}`
}

function inp(): React.CSSProperties {
  return { width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }
}

function DeltaBadge({ before, after, lowerBetter = false }: { before: any, after: any, lowerBetter?: boolean }) {
  if (before == null || after == null || before === '' || after === '') return <span style={{ color: '#9ca3af' }}>—</span>
  const b = Number(before), a = Number(after)
  const improved = lowerBetter ? a < b : a > b
  const same = a === b
  const arrow = same ? '→' : improved ? '↑' : '↓'
  const color = same ? '#9ca3af' : improved ? '#16a34a' : '#dc2626'
  return <span style={{ color, fontWeight: 600 }}>{arrow}</span>
}

// ── Blank forms ────────────────────────────────────────────────────────────────

const BLANK_FORM = {
  tipo: '', titulo: '', motivo: '', descripcion: '',
  tiendaId: '', proveedorId: '', proveedorAnteriorId: '', fechaSeguimiento: '',
  snapSlaPct: '', snapMttrMinutos: '', snapIei: '', snapIncidentes: '', snapPeriodo: '',
  snapDetalle: null as any,
}

const BLANK_EJECUTAR = {
  resultadoNota: '',
  postSlaPct: '', postMttrMinutos: '', postIei: '', postIncidentes: '',
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DecisionesPage() {
  const { data: session } = useSession()
  const userRol    = (session?.user as any)?.rol ?? ''
  const canCrear   = can(session, 'decisiones.crear')
  const canVer     = can(session, 'decisiones.ver')
  const canAprobar = PUEDE_APROBAR.has(userRol)

  const [lista, setLista]         = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [filtros, setFiltros]     = useState({ estado: '', tipo: '', q: '' })
  const [selected, setSelected]   = useState<any | null>(null)
  const [detalle, setDetalle]     = useState<any | null>(null)
  const [loadingDet, setLoadingDet] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)

  // Modal nueva / editar decisión
  const [modal, setModal]         = useState(false)
  const [editMode, setEditMode]   = useState(false)
  const [editId, setEditId]       = useState('')
  const [form, setForm]           = useState<any>(BLANK_FORM)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')

  // Auto-carga indicadores (CAMBIO_PROVEEDOR)
  const [snapLoading, setSnapLoading] = useState(false)
  const [snapData, setSnapData]       = useState<any | null>(null)

  // Tiendas y proveedores para selects
  const [tiendas, setTiendas]       = useState<{ id: string; codigo: string; nombreCc: string | null; distrito: string | null; proveedorId: string | null; proveedorNombre: string | null }[]>([])
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([])
  const [tiendaQuery, setTiendaQuery] = useState('')
  const [showTiendaDrop, setShowTiendaDrop] = useState(false)
  const tiendaRef = useRef<HTMLDivElement>(null)

  // Panel "marcar ejecutada" (decisiones genéricas)
  const [ejecutarMode, setEjecutarMode] = useState(false)
  const [ejecutarForm, setEjecutarForm] = useState<any>(BLANK_EJECUTAR)
  const [savingAction, setSavingAction] = useState(false)

  // Modal rechazo
  const [rechazarModal, setRechazarModal]   = useState(false)
  const [rechazarMotivo, setRechazarMotivo] = useState('')

  // Confirmación doble para ejecutar cambio de proveedor
  const [ejecutarCPConfirm, setEjecutarCPConfirm] = useState<'idle'|'confirming'|'error'>('idle')
  const [ejecutarCPError, setEjecutarCPError]     = useState('')
  const [fechaSeguimientoCP, setFechaSeguimientoCP] = useState('')

  // Comparativa post-ejecución
  const [comparativaOpen, setComparativaOpen] = useState(false)
  const [comparativaData, setComparativaData] = useState<any | null>(null)
  const [comparativaLoading, setComparativaLoading] = useState(false)

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchLista = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filtros.estado) p.set('estado', filtros.estado)
    if (filtros.tipo)   p.set('tipo',   filtros.tipo)
    const res = await fetch(`/api/decisiones?${p}`)
    if (res.ok) setLista(await res.json().then(d => Array.isArray(d) ? d : []))
    setLoading(false)
  }, [filtros.estado, filtros.tipo])

  useEffect(() => { fetchLista() }, [fetchLista])

  useEffect(() => {
    fetch('/api/tiendas').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setTiendas(d.map((t: any) => ({
        id: t.id, codigo: t.codigo, nombreCc: t.nombreCc ?? null,
        distrito: t.distrito ?? null, proveedorId: t.proveedorId ?? null,
        proveedorNombre: t.proveedorNombre ?? null,
      })))
    })
    fetch('/api/proveedores').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setProveedores(d.map((p: any) => ({ id: p.id, nombre: p.nombre })))
    })
  }, [])

  async function fetchDetalle(id: string) {
    setLoadingDet(true)
    const res = await fetch(`/api/decisiones/${id}`)
    if (res.ok) setDetalle(await res.json())
    setLoadingDet(false)
  }

  // Auto-carga de indicadores al seleccionar tienda en CAMBIO_PROVEEDOR
  async function loadSnapForTienda(tiendaId: string) {
    if (!tiendaId) { setSnapData(null); return }
    setSnapLoading(true)
    try {
      const res = await fetch(`/api/decisiones/snap?tiendaId=${tiendaId}`)
      if (res.ok) {
        const data = await res.json()
        setSnapData(data)
        const tienda = tiendas.find(t => t.id === tiendaId)
        setForm((f: any) => ({
          ...f,
          proveedorAnteriorId: data.tienda.proveedorId ?? tienda?.proveedorId ?? '',
          snapDetalle: data.snap,
          snapSlaPct:      data.snap.slaResolucionPct ?? '',
          snapMttrMinutos: data.snap.mttrPromedio ?? '',
          snapIei:         data.snap.ieiAcumulado ?? '',
          snapIncidentes:  data.snap.totalIncidentes ?? '',
          snapPeriodo:     data.snap.periodo,
        }))
      }
    } finally {
      setSnapLoading(false)
    }
  }

  async function loadComparativa(tiendaId: string) {
    setComparativaLoading(true)
    try {
      const res = await fetch(`/api/decisiones/snap?tiendaId=${tiendaId}`)
      if (res.ok) setComparativaData(await res.json())
    } finally {
      setComparativaLoading(false)
    }
  }

  function openPanel(dec: any) {
    setSelected(dec)
    setPanelOpen(true)
    setEjecutarMode(false)
    setEjecutarForm(BLANK_EJECUTAR)
    setRechazarModal(false)
    setRechazarMotivo('')
    setEjecutarCPConfirm('idle')
    setEjecutarCPError('')
    setFechaSeguimientoCP('')
    setComparativaOpen(false)
    setComparativaData(null)
    fetchDetalle(dec.id)
  }

  function closePanel() {
    setPanelOpen(false)
    setSelected(null)
    setDetalle(null)
    setEjecutarMode(false)
    setEjecutarCPConfirm('idle')
    setEjecutarCPError('')
    setComparativaOpen(false)
    setComparativaData(null)
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function patchEstado(id: string, estado: string, extra?: Record<string, unknown>) {
    setSavingAction(true)
    await fetch(`/api/decisiones/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, ...extra }),
    })
    setSavingAction(false)
    fetchLista(); fetchDetalle(id)
  }

  async function handleEjecutarGenerico() {
    if (!detalle) return
    setSavingAction(true)
    await fetch(`/api/decisiones/${detalle.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estado: 'EJECUTADA',
        resultadoNota:   ejecutarForm.resultadoNota   || null,
        postSlaPct:      ejecutarForm.postSlaPct      || null,
        postMttrMinutos: ejecutarForm.postMttrMinutos ? Number(ejecutarForm.postMttrMinutos) : null,
        postIei:         ejecutarForm.postIei         || null,
        postIncidentes:  ejecutarForm.postIncidentes  ? Number(ejecutarForm.postIncidentes)  : null,
      }),
    })
    setSavingAction(false)
    setEjecutarMode(false)
    fetchLista(); fetchDetalle(detalle.id)
  }

  async function handleEjecutarCambioProveedor() {
    if (!detalle) return
    setSavingAction(true)
    setEjecutarCPError('')
    try {
      // Guardar fecha_seguimiento si se ingresó
      if (fechaSeguimientoCP) {
        await fetch(`/api/decisiones/${detalle.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fechaSeguimiento: fechaSeguimientoCP }),
        })
      }
      const res = await fetch(`/api/decisiones/${detalle.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _action: 'ejecutar' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setEjecutarCPError(data.error ?? `Error ${res.status}`)
        setEjecutarCPConfirm('error')
        return
      }
      setEjecutarCPConfirm('idle')
      fetchLista(); fetchDetalle(detalle.id)
    } finally {
      setSavingAction(false)
    }
  }

  async function handleAprobar() {
    if (!detalle) return
    setSavingAction(true)
    await fetch(`/api/decisiones/${detalle.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _action: 'aprobar' }),
    })
    setSavingAction(false)
    fetchLista(); fetchDetalle(detalle.id)
  }

  async function handleRechazar() {
    if (!detalle || !rechazarMotivo.trim()) return
    setSavingAction(true)
    await fetch(`/api/decisiones/${detalle.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _action: 'rechazar', rechazadoMotivo: rechazarMotivo }),
    })
    setSavingAction(false)
    setRechazarModal(false); setRechazarMotivo('')
    fetchLista(); fetchDetalle(detalle.id)
  }

  function snapPayload(f: any) {
    return {
      snapSlaPct:      f.snapSlaPct      ? Number(f.snapSlaPct)      : null,
      snapMttrMinutos: f.snapMttrMinutos ? Number(f.snapMttrMinutos) : null,
      snapIei:         f.snapIei         ? Number(f.snapIei)         : null,
      snapIncidentes:  f.snapIncidentes  ? Number(f.snapIncidentes)  : null,
      snapPeriodo:     f.snapPeriodo     || null,
      snapDetalle:     f.snapDetalle     ?? null,
    }
  }

  async function handleCreate() {
    if (!form.tipo || !form.titulo || !form.motivo) return
    setSaving(true); setSaveError('')
    try {
      const res = await fetch('/api/decisiones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          tiendaId:            form.tiendaId            || null,
          proveedorId:         form.proveedorId         || null,
          proveedorAnteriorId: form.proveedorAnteriorId || null,
          fechaSeguimiento:    null,
          ...snapPayload(form),
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setSaveError(d.error ?? `Error ${res.status}`); return }
      closeModal(); fetchLista()
    } finally { setSaving(false) }
  }

  async function handleUpdate() {
    if (!form.tipo || !form.titulo || !form.motivo) return
    setSaving(true); setSaveError('')
    try {
      const res = await fetch(`/api/decisiones/${editId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: form.tipo, titulo: form.titulo, motivo: form.motivo,
          descripcion: form.descripcion || null,
          tiendaId: form.tiendaId || null,
          proveedorId: form.proveedorId || null,
          proveedorAnteriorId: form.proveedorAnteriorId || null,
          fechaSeguimiento: form.fechaSeguimiento || null,
          ...snapPayload(form),
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setSaveError(d.error ?? `Error ${res.status}`); return }
      closeModal(); fetchLista(); fetchDetalle(editId)
    } finally { setSaving(false) }
  }

  function closeModal() {
    setModal(false); setEditMode(false); setEditId('')
    setForm(BLANK_FORM); setTiendaQuery(''); setSaveError('')
    setSnapData(null)
  }

  function openEdit(dec: any) {
    setForm({
      tipo:                dec.tipo                ?? '',
      titulo:              dec.titulo              ?? '',
      motivo:              dec.motivo              ?? '',
      descripcion:         dec.descripcion         ?? '',
      tiendaId:            dec.tiendaId            ?? '',
      proveedorId:         dec.proveedorId         ?? '',
      proveedorAnteriorId: dec.proveedorAnteriorId ?? '',
      fechaSeguimiento:    dec.fechaSeguimiento    ?? '',
      snapSlaPct:          dec.snapSlaPct          ?? '',
      snapMttrMinutos:     dec.snapMttrMinutos     ?? '',
      snapIei:             dec.snapIei             ?? '',
      snapIncidentes:      dec.snapIncidentes      ?? '',
      snapPeriodo:         dec.snapPeriodo         ?? '',
      snapDetalle:         dec.snapDetalle         ?? null,
    })
    setEditMode(true); setEditId(dec.id); setSaveError(''); setModal(true)
  }

  // ── Filter ───────────────────────────────────────────────────────────────────

  const visible = lista.filter(d => {
    if (!filtros.q) return true
    const q = filtros.q.toLowerCase()
    return d.titulo?.toLowerCase().includes(q) || d.motivo?.toLowerCase().includes(q)
  })

  // ── Tienda autocomplete helpers ───────────────────────────────────────────────

  const tiendaOptions = tiendas.filter(t => {
    if (!tiendaQuery) return true
    const q = tiendaQuery.toLowerCase()
    return t.codigo.toLowerCase().includes(q) ||
      (t.nombreCc ?? '').toLowerCase().includes(q) ||
      (t.distrito ?? '').toLowerCase().includes(q)
  }).slice(0, 10)

  const selectedTienda = tiendas.find(t => t.id === form.tiendaId)
  function tiendaLabel(t: typeof tiendas[0]) {
    return t.nombreCc ? `${t.codigo} — ${t.nombreCc}` : t.codigo
  }

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (tiendaRef.current && !tiendaRef.current.contains(e.target as Node)) setShowTiendaDrop(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  if (!canVer) return (
    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
      No tienes permiso para ver este módulo.
    </div>
  )

  const esCambioProveedor = form.tipo === 'CAMBIO_PROVEEDOR'

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--foreground)', margin: 0, lineHeight: 1.2 }}>
            Decisiones Estratégicas
          </h1>
          <p style={{ fontSize: '12px', color: '#9ca3af', margin: '4px 0 0' }}>
            Registro y seguimiento de decisiones operativas
          </p>
        </div>
        {canCrear && (
          <button
            onClick={() => { setEditMode(false); setEditId(''); setForm(BLANK_FORM); setTiendaQuery(''); setSaveError(''); setSnapData(null); setModal(true) }}
            style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 600, background: '#185FA5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + Nueva decisión
          </button>
        )}
      </div>

      {/* ── Estado badges ──────────────────────────────────────────────────── */}
      {!loading && lista.length > 0 && (() => {
        const cnt: Record<string, number> = {}
        lista.forEach(d => { cnt[d.estado] = (cnt[d.estado] || 0) + 1 })
        return (
          <div style={{ padding: '12px 28px 0', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {Object.entries(ESTADO_STYLE).map(([k, v]) => cnt[k] ? (
              <span key={k} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: v.bg, color: v.color }}>
                {cnt[k]} {v.label}{cnt[k] !== 1 ? 's' : ''}
              </span>
            ) : null)}
          </div>
        )
      })()}

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 28px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filtros.estado} onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))} style={{ ...inp(), width: '160px' }}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filtros.tipo} onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))} style={{ ...inp(), width: '200px' }}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input
          placeholder="Buscar por título o motivo…"
          value={filtros.q}
          onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
          style={{ ...inp(), width: '240px' }}
        />
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
          {visible.length} decisión{visible.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* ── List ───────────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 28px 40px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Cargando…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No hay decisiones registradas.</div>
        ) : visible.map(dec => (
          <DecisionCard key={dec.id} dec={dec} onClick={() => openPanel(dec)} />
        ))}
      </div>

      {/* ── Side panel ─────────────────────────────────────────────────────── */}
      {panelOpen && (
        <>
          <div onClick={closePanel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 79 }} />
          <aside style={{ position: 'fixed', top: 0, right: 0, width: '460px', maxWidth: '95vw', height: '100vh', background: 'var(--card)', borderLeft: '0.5px solid var(--border)', zIndex: 80, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 20px 12px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Detalle de decisión</span>
              <button onClick={closePanel} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#9ca3af', lineHeight: 1 }}>×</button>
            </div>
            {loadingDet ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Cargando…</div>
            ) : detalle ? (
              <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <DetailPanel
                  detalle={detalle}
                  canCrear={canCrear}
                  canAprobar={canAprobar}
                  ejecutarMode={ejecutarMode}
                  ejecutarForm={ejecutarForm}
                  savingAction={savingAction}
                  rechazarModal={rechazarModal}
                  rechazarMotivo={rechazarMotivo}
                  ejecutarCPConfirm={ejecutarCPConfirm}
                  ejecutarCPError={ejecutarCPError}
                  fechaSeguimientoCP={fechaSeguimientoCP}
                  comparativaOpen={comparativaOpen}
                  comparativaData={comparativaData}
                  comparativaLoading={comparativaLoading}
                  onEjecutarForm={(k, v) => setEjecutarForm((f: any) => ({ ...f, [k]: v }))}
                  onEnEjecucion={() => patchEstado(detalle.id, 'EN_EJECUCION')}
                  onEjecutar={() => setEjecutarMode(true)}
                  onCancelEjecutar={() => setEjecutarMode(false)}
                  onConfirmEjecutar={handleEjecutarGenerico}
                  onCancelar={() => patchEstado(detalle.id, 'CANCELADA')}
                  onAprobar={handleAprobar}
                  onRechazarOpen={() => setRechazarModal(true)}
                  onRechazarClose={() => { setRechazarModal(false); setRechazarMotivo('') }}
                  onRechazarMotivoChange={setRechazarMotivo}
                  onConfirmRechazar={handleRechazar}
                  onEditar={() => detalle && openEdit(detalle)}
                  onEjecutarCPStart={() => setEjecutarCPConfirm('confirming')}
                  onEjecutarCPCancel={() => { setEjecutarCPConfirm('idle'); setEjecutarCPError('') }}
                  onEjecutarCPConfirm={handleEjecutarCambioProveedor}
                  onFechaSeguimientoCPChange={setFechaSeguimientoCP}
                  onComparativaOpen={() => { setComparativaOpen(true); if (detalle.tiendaId) loadComparativa(detalle.tiendaId) }}
                  onComparativaClose={() => { setComparativaOpen(false); setComparativaData(null) }}
                />
              </div>
            ) : null}
          </aside>
        </>
      )}

      {/* ── Modal nueva / editar decisión ──────────────────────────────────── */}
      {modal && (
        <>
          <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 90 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: esCambioProveedor ? '560px' : '500px', maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto',
            background: 'var(--card)', borderRadius: '14px', border: '0.5px solid var(--border)', zIndex: 91, padding: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)' }}>
                {editMode ? 'Editar decisión' : 'Nueva decisión'}
              </span>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#9ca3af', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Tipo */}
              <div>
                <label style={labelSt}>Tipo *</label>
                <select
                  value={form.tipo}
                  onChange={e => {
                    setForm((f: any) => ({ ...f, tipo: e.target.value, tiendaId: '', proveedorId: '', proveedorAnteriorId: '', snapDetalle: null }))
                    setSnapData(null); setTiendaQuery('')
                  }}
                  style={inp()}
                >
                  <option value="">Selecciona un tipo…</option>
                  {TIPOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              {/* ── CAMBIO_PROVEEDOR: form estructurado ── */}
              {esCambioProveedor ? (
                <>
                  {/* Tienda autocomplete */}
                  <div ref={tiendaRef} style={{ position: 'relative' }}>
                    <label style={labelSt}>Tienda *</label>
                    {selectedTienda ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', background: '#dbeafe', color: '#1e40af', borderRadius: '5px', padding: '3px 8px', fontWeight: 600 }}>
                          {selectedTienda.codigo}
                        </span>
                        {selectedTienda.nombreCc && <span style={{ fontSize: '12px', color: '#6b7280' }}>{selectedTienda.nombreCc}</span>}
                        <button onClick={() => { setForm((f: any) => ({ ...f, tiendaId: '', proveedorAnteriorId: '', snapDetalle: null })); setTiendaQuery(''); setSnapData(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '14px', marginLeft: 'auto' }}>×</button>
                      </div>
                    ) : (
                      <input
                        value={tiendaQuery}
                        onChange={e => { setTiendaQuery(e.target.value); setShowTiendaDrop(true) }}
                        onFocus={() => setShowTiendaDrop(true)}
                        placeholder="Buscar por código o nombre…"
                        style={inp()}
                      />
                    )}
                    {showTiendaDrop && !selectedTienda && tiendaOptions.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '8px', zIndex: 100, maxHeight: '180px', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                        {tiendaOptions.map(t => (
                          <div
                            key={t.id}
                            onMouseDown={() => {
                              setForm((f: any) => ({ ...f, tiendaId: t.id }))
                              setTiendaQuery(''); setShowTiendaDrop(false)
                              loadSnapForTienda(t.id)
                            }}
                            style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)', borderBottom: '0.5px solid var(--border)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--background)'}
                            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                          >
                            <strong>{t.codigo}</strong>{t.nombreCc ? ` — ${t.nombreCc}` : ''}{t.distrito ? ` · ${t.distrito}` : ''}
                            {t.proveedorNombre && <span style={{ float: 'right', fontSize: '10px', color: '#9ca3af' }}>{t.proveedorNombre}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Indicadores actuales (auto-cargados) */}
                  {snapLoading && (
                    <div style={{ fontSize: '12px', color: '#9ca3af', padding: '8px', background: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                      Cargando indicadores…
                    </div>
                  )}
                  {snapData && !snapLoading && (
                    <div style={{ background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: '10px', padding: '12px 14px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#15803d', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Indicadores actuales · {snapData.snap.periodo}</span>
                        <span style={{ color: '#6b7280', fontWeight: 400 }}>Proveedor: {snapData.tienda.proveedorNombre ?? '—'}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                        {[
                          { label: 'SLA Respuesta', value: snapData.snap.slaRespuestaPct != null ? fmtPct(snapData.snap.slaRespuestaPct) : '—' },
                          { label: 'SLA Resolución', value: snapData.snap.slaResolucionPct != null ? fmtPct(snapData.snap.slaResolucionPct) : '—' },
                          { label: 'MTTR promedio', value: fmtMttr(snapData.snap.mttrPromedio) },
                          { label: 'Incidentes', value: snapData.snap.totalIncidentes },
                          { label: 'SLA vencidos', value: snapData.snap.incidentesSlaVencido },
                          { label: 'IEI acumulado', value: snapData.snap.ieiAcumulado != null ? fmtIei(snapData.snap.ieiAcumulado) : '—' },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ background: 'white', borderRadius: '6px', padding: '6px 8px', border: '0.5px solid #bbf7d0' }}>
                            <div style={{ fontSize: '9px', color: '#9ca3af', marginBottom: '2px' }}>{label}</div>
                            <div style={{ fontSize: '12px', fontWeight: 700 }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      {snapData.snap.contratoSlaResolucion && (
                        <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '6px' }}>
                          Contrato vigente: SLA respuesta {snapData.snap.contratoSlaRespuesta}min · SLA resolución {snapData.snap.contratoSlaResolucion}min
                        </div>
                      )}
                    </div>
                  )}

                  {/* Proveedor actual (auto-fill, readonly) */}
                  <div>
                    <label style={labelSt}>Proveedor actual</label>
                    <input
                      readOnly
                      value={snapData?.tienda?.proveedorNombre ?? (tiendas.find(t => t.id === form.tiendaId)?.proveedorNombre ?? '—')}
                      style={{ ...inp(), background: '#f9fafb', color: '#6b7280', cursor: 'default' }}
                    />
                  </div>

                  {/* Proveedor al que migra */}
                  <div>
                    <label style={labelSt}>Proveedor al que migra <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none' }}>(opcional)</span></label>
                    <select
                      value={form.proveedorId}
                      onChange={e => setForm((f: any) => ({ ...f, proveedorId: e.target.value }))}
                      style={inp()}
                    >
                      <option value="">Seleccionar proveedor nuevo…</option>
                      {proveedores
                        .filter(p => p.id !== form.proveedorAnteriorId)
                        .map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>

                  {/* Justificación */}
                  <div>
                    <label style={labelSt}>Justificación / Motivo *</label>
                    <textarea
                      value={form.motivo}
                      onChange={e => setForm((f: any) => ({ ...f, motivo: e.target.value }))}
                      placeholder="¿Por qué se propone este cambio de proveedor?"
                      rows={3}
                      style={{ ...inp(), resize: 'vertical' }}
                    />
                  </div>

                  {/* Título auto-sugerido o editable */}
                  <div>
                    <label style={labelSt}>Título *</label>
                    <input
                      value={form.titulo}
                      onChange={e => setForm((f: any) => ({ ...f, titulo: e.target.value }))}
                      placeholder={selectedTienda ? `Cambio de proveedor — ${selectedTienda.codigo}` : 'Título de la decisión'}
                      style={inp()}
                    />
                  </div>
                </>
              ) : (
                /* ── Otros tipos: form genérico ── */
                <>
                  <div>
                    <label style={labelSt}>Título *</label>
                    <input value={form.titulo} onChange={e => setForm((f: any) => ({ ...f, titulo: e.target.value }))} placeholder="Título de la decisión" style={inp()} />
                  </div>
                  <div>
                    <label style={labelSt}>Motivo *</label>
                    <textarea value={form.motivo} onChange={e => setForm((f: any) => ({ ...f, motivo: e.target.value }))} placeholder="¿Por qué se toma esta decisión?" rows={3} style={{ ...inp(), resize: 'vertical' }} />
                  </div>
                  <div>
                    <label style={labelSt}>Descripción</label>
                    <textarea value={form.descripcion} onChange={e => setForm((f: any) => ({ ...f, descripcion: e.target.value }))} placeholder="Detalle adicional opcional" rows={2} style={{ ...inp(), resize: 'vertical' }} />
                  </div>

                  {/* Tienda autocomplete */}
                  <div ref={tiendaRef} style={{ position: 'relative' }}>
                    <label style={labelSt}>Tienda (opcional)</label>
                    {selectedTienda ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', background: '#dbeafe', color: '#1e40af', borderRadius: '5px', padding: '3px 8px' }}>{tiendaLabel(selectedTienda)}</span>
                        <button onClick={() => { setForm((f: any) => ({ ...f, tiendaId: '' })); setTiendaQuery('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '14px' }}>×</button>
                      </div>
                    ) : (
                      <input value={tiendaQuery} onChange={e => { setTiendaQuery(e.target.value); setShowTiendaDrop(true) }} onFocus={() => setShowTiendaDrop(true)} placeholder="Buscar por código o nombre…" style={inp()} />
                    )}
                    {showTiendaDrop && !selectedTienda && tiendaOptions.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '8px', zIndex: 100, maxHeight: '180px', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                        {tiendaOptions.map(t => (
                          <div key={t.id} onMouseDown={() => { setForm((f: any) => ({ ...f, tiendaId: t.id })); setTiendaQuery(''); setShowTiendaDrop(false) }} style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)', borderBottom: '0.5px solid var(--border)' }} onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--background)'} onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}>
                            <strong>{t.codigo}</strong>{t.nombreCc ? ` — ${t.nombreCc}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={labelSt}>Proveedor (opcional)</label>
                    <select value={form.proveedorId} onChange={e => setForm((f: any) => ({ ...f, proveedorId: e.target.value }))} style={inp()}>
                      <option value="">Sin proveedor</option>
                      {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>

                  <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: '12px' }}>
                    <label style={{ ...labelSt, marginBottom: '10px' }}>Indicadores actuales <span style={{ fontWeight: 400, textTransform: 'none', color: '#9ca3af' }}>(opcional)</span></label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div><label style={labelSt}>SLA (%)</label><input type="number" step="0.1" min="0" max="100" value={form.snapSlaPct} onChange={e => setForm((f: any) => ({ ...f, snapSlaPct: e.target.value }))} style={inp()} /></div>
                      <div><label style={labelSt}>MTTR (min)</label><input type="number" min="0" value={form.snapMttrMinutos} onChange={e => setForm((f: any) => ({ ...f, snapMttrMinutos: e.target.value }))} style={inp()} /></div>
                      <div><label style={labelSt}>IEI (S/)</label><input type="number" step="0.01" min="0" value={form.snapIei} onChange={e => setForm((f: any) => ({ ...f, snapIei: e.target.value }))} style={inp()} /></div>
                      <div><label style={labelSt}>Nº incidentes</label><input type="number" min="0" value={form.snapIncidentes} onChange={e => setForm((f: any) => ({ ...f, snapIncidentes: e.target.value }))} style={inp()} /></div>
                    </div>
                  </div>
                </>
              )}

              {saveError && (
                <div style={{ fontSize: '12px', color: '#b91c1c', background: '#fee2e2', borderRadius: '6px', padding: '8px 10px' }}>{saveError}</div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button onClick={closeModal} style={{ flex: 1, padding: '9px', fontSize: '12px', background: 'transparent', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button
                  onClick={editMode ? handleUpdate : handleCreate}
                  disabled={saving || !form.tipo || !form.titulo || !form.motivo || (esCambioProveedor && !form.tiendaId)}
                  style={{ flex: 2, padding: '9px', fontSize: '12px', fontWeight: 600, background: saving ? '#93c5fd' : '#185FA5', color: 'white', border: 'none', borderRadius: '8px', cursor: saving ? 'default' : 'pointer', opacity: (!form.tipo || !form.titulo || !form.motivo || (esCambioProveedor && !form.tiendaId)) ? 0.6 : 1 }}
                >
                  {saving ? 'Guardando…' : editMode ? 'Guardar cambios' : 'Guardar decisión'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Label style ────────────────────────────────────────────────────────────────
const labelSt: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }

// ── DecisionCard ───────────────────────────────────────────────────────────────

function DecisionCard({ dec, onClick }: { dec: any; onClick: () => void }) {
  const est  = ESTADO_STYLE[dec.estado] ?? ESTADO_STYLE.PENDIENTE
  const tipo = TIPO_LABELS[dec.tipo] ?? dec.tipo
  const esCambio = dec.tipo === 'CAMBIO_PROVEEDOR'

  return (
    <div onClick={onClick} style={{ background: 'var(--card)', border: `0.5px solid ${dec.estado === 'PROPUESTO' ? '#fde047' : 'var(--border)'}`, borderRadius: '10px', padding: '14px 16px', cursor: 'pointer', transition: 'box-shadow 0.15s', display: 'flex', flexDirection: 'column', gap: '8px' }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: est.bg, color: est.color }}>
          {dec.estado === 'PROPUESTO' ? '⏳ Pendiente aprobación' : est.label}
        </span>
        <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '20px', background: '#f3f4f6', color: '#374151' }}>{tipo}</span>
        {dec.tiendaCodigo && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '5px', background: '#e0f2fe', color: '#075985' }}>{dec.tiendaCodigo}</span>}
        {esCambio && dec.proveedorAnteriorNombre && dec.proveedorNombre && (
          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '5px', background: '#fef3c7', color: '#92400e' }}>
            {dec.proveedorAnteriorNombre} → {dec.proveedorNombre}
          </span>
        )}
        {!esCambio && dec.proveedorNombre && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '5px', background: '#ede9fe', color: '#5b21b6' }}>{dec.proveedorNombre}</span>}
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtDate(dec.creadoEn)}</span>
      </div>

      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>{dec.titulo}</div>
      <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{dec.motivo}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', color: '#374151' }}>
          <span style={{ color: '#9ca3af' }}>Responsable: </span>
          {dec.responsableNombre}
          {dec.responsableRol && <span style={{ color: '#9ca3af', marginLeft: '4px' }}>({ROL_LABELS[dec.responsableRol] ?? dec.responsableRol})</span>}
        </span>
        {dec.fechaSeguimiento && (
          <span style={{ fontSize: '11px', color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <IcoCalendar /> Seguimiento: {fmtDate(dec.fechaSeguimiento)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── DetailPanel ────────────────────────────────────────────────────────────────

function DetailPanel({
  detalle, canCrear, canAprobar, ejecutarMode, ejecutarForm, savingAction,
  rechazarModal, rechazarMotivo,
  ejecutarCPConfirm, ejecutarCPError, fechaSeguimientoCP,
  comparativaOpen, comparativaData, comparativaLoading,
  onEjecutarForm, onEnEjecucion, onEjecutar, onCancelEjecutar, onConfirmEjecutar, onCancelar,
  onAprobar, onRechazarOpen, onRechazarClose, onRechazarMotivoChange, onConfirmRechazar, onEditar,
  onEjecutarCPStart, onEjecutarCPCancel, onEjecutarCPConfirm, onFechaSeguimientoCPChange,
  onComparativaOpen, onComparativaClose,
}: {
  detalle: any; canCrear: boolean; canAprobar: boolean
  ejecutarMode: boolean; ejecutarForm: any; savingAction: boolean
  rechazarModal: boolean; rechazarMotivo: string
  ejecutarCPConfirm: 'idle'|'confirming'|'error'; ejecutarCPError: string; fechaSeguimientoCP: string
  comparativaOpen: boolean; comparativaData: any; comparativaLoading: boolean
  onEjecutarForm: (k: string, v: any) => void
  onEnEjecucion: () => void; onEjecutar: () => void; onCancelEjecutar: () => void; onConfirmEjecutar: () => void
  onCancelar: () => void
  onAprobar: () => void; onRechazarOpen: () => void; onRechazarClose: () => void
  onRechazarMotivoChange: (v: string) => void; onConfirmRechazar: () => void; onEditar: () => void
  onEjecutarCPStart: () => void; onEjecutarCPCancel: () => void; onEjecutarCPConfirm: () => void
  onFechaSeguimientoCPChange: (v: string) => void
  onComparativaOpen: () => void; onComparativaClose: () => void
}) {
  const est     = ESTADO_STYLE[detalle.estado] ?? ESTADO_STYLE.PENDIENTE
  const tipo    = TIPO_LABELS[detalle.tipo] ?? detalle.tipo
  const esCambio = detalle.tipo === 'CAMBIO_PROVEEDOR'
  const canAct  = canCrear && !['CANCELADA','EJECUTADA','RECHAZADO'].includes(detalle.estado)

  // Comparativa habilitada si ejecutada hace más de 30 días
  const diasDesdeEjecucion = detalle.ejecutadaEn
    ? Math.floor((Date.now() - new Date(detalle.ejecutadaEn).getTime()) / (86400000))
    : null
  const comparativaHabilitada = esCambio && detalle.estado === 'EJECUTADA' && diasDesdeEjecucion != null && diasDesdeEjecucion >= 30

  function Row({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null
    return (
      <div>
        <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '12px', color: 'var(--foreground)' }}>{value}</div>
      </div>
    )
  }

  return (
    <>
      {/* Estado + tipo */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: est.bg, color: est.color }}>
          {detalle.estado === 'PROPUESTO' ? '⏳ Pendiente aprobación' : est.label}
        </span>
        <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: '#f3f4f6', color: '#374151' }}>{tipo}</span>
        {canCrear && detalle.estado === 'PROPUESTO' && (
          <button onClick={onEditar} style={{ marginLeft: 'auto', fontSize: '11px', padding: '3px 10px', borderRadius: '6px', border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer' }}>
            Editar
          </button>
        )}
      </div>

      {/* Banner PROPUESTO */}
      {detalle.estado === 'PROPUESTO' && (
        <div style={{ background: '#fefce8', border: '0.5px solid #fde047', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#854d0e', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>⏳</span>
          <span>Pendiente de aprobación por Supervisor o Gerencia.</span>
        </div>
      )}

      {/* Título */}
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>{detalle.titulo}</div>
      <Row label="Motivo / Justificación" value={detalle.motivo} />
      {detalle.descripcion && <Row label="Descripción" value={detalle.descripcion} />}

      {/* Tienda + proveedores */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {detalle.tiendaCodigo && (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Tienda</div>
            <span style={{ fontSize: '12px', background: '#e0f2fe', color: '#075985', borderRadius: '5px', padding: '2px 8px' }}>
              {detalle.tiendaCodigo}{detalle.tiendaNombre ? ` — ${detalle.tiendaNombre}` : ''}
            </span>
          </div>
        )}
        {esCambio ? (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Cambio de proveedor</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', background: '#fee2e2', color: '#b91c1c', borderRadius: '5px', padding: '2px 8px' }}>{detalle.proveedorAnteriorNombre ?? '—'}</span>
              <span style={{ fontSize: '14px', color: '#9ca3af' }}>→</span>
              <span style={{ fontSize: '12px', background: '#dcfce7', color: '#15803d', borderRadius: '5px', padding: '2px 8px' }}>{detalle.proveedorNombre ?? 'Por definir'}</span>
            </div>
          </div>
        ) : (
          detalle.proveedorNombre && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Proveedor</div>
              <span style={{ fontSize: '12px', background: '#ede9fe', color: '#5b21b6', borderRadius: '5px', padding: '2px 8px' }}>{detalle.proveedorNombre}</span>
            </div>
          )
        )}
      </div>

      <Row label="Responsable" value={`${detalle.responsableNombre} (${ROL_LABELS[detalle.responsableRol] ?? detalle.responsableRol})`} />

      {/* Fechas */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <Row label="Creado" value={fmtDate(detalle.creadoEn) ?? undefined} />
        {detalle.fechaSeguimiento && <Row label="Seguimiento" value={fmtDate(detalle.fechaSeguimiento) ?? undefined} />}
        {detalle.ejecutadaEn && <Row label="Ejecutada el" value={fmtDate(detalle.ejecutadaEn) ?? undefined} />}
      </div>

      {/* Info aprobación / rechazo */}
      {detalle.aprobadoEn && detalle.aprobadoPorNombre && (
        <div style={{ background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#15803d' }}>
          Aprobado por <strong>{detalle.aprobadoPorNombre}</strong> el {fmtDate(detalle.aprobadoEn)}
        </div>
      )}
      {detalle.estado === 'RECHAZADO' && detalle.rechazadoMotivo && (
        <div style={{ background: '#fff1f2', border: '0.5px solid #fecdd3', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#9d174d' }}>
          <strong>Motivo de rechazo:</strong> {detalle.rechazadoMotivo}
        </div>
      )}

      {/* Snapshot indicadores */}
      {(detalle.snapDetalle || detalle.snapSlaPct != null || detalle.snapMttrMinutos != null) && (() => {
        const sd = detalle.snapDetalle
        const pd = detalle.postDetalle
        return (
          <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px 12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              Indicadores al decidir {detalle.snapPeriodo ? `· ${detalle.snapPeriodo}` : ''}
            </div>
            {sd ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {[
                  { label: 'SLA Respuesta', snap: sd.slaRespuestaPct, post: pd?.slaRespuestaPct, fmt: fmtPct, lb: false },
                  { label: 'SLA Resolución', snap: sd.slaResolucionPct, post: pd?.slaResolucionPct, fmt: fmtPct, lb: false },
                  { label: 'MTTR', snap: sd.mttrPromedio, post: pd?.mttrPromedio, fmt: fmtMttr, lb: true },
                  { label: 'Incidentes', snap: sd.totalIncidentes, post: pd?.totalIncidentes, fmt: (v: any) => v ?? '—', lb: true },
                  { label: 'SLA vencidos', snap: sd.incidentesSlaVencido, post: pd?.incidentesSlaVencido, fmt: (v: any) => v ?? '—', lb: true },
                  { label: 'IEI acum.', snap: sd.ieiAcumulado, post: pd?.ieiAcumulado, fmt: fmtIei, lb: true },
                ].map(({ label, snap, post, fmt, lb }) => (
                  <div key={label} style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '6px', padding: '6px 8px' }}>
                    <div style={{ fontSize: '9px', color: '#9ca3af', marginBottom: '2px' }}>{label}</div>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>{fmt(snap)}</div>
                    {post != null && (
                      <div style={{ fontSize: '10px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <DeltaBadge before={snap} after={post} lowerBetter={lb} />
                        <span style={{ color: '#374151' }}>{fmt(post)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <MetricBox label="SLA" value={fmtPct(detalle.snapSlaPct)} post={fmtPct(detalle.postSlaPct)} lowerBetter={false} raw={{ b: detalle.snapSlaPct, a: detalle.postSlaPct }} />
                <MetricBox label="MTTR" value={fmtMttr(detalle.snapMttrMinutos)} post={fmtMttr(detalle.postMttrMinutos)} lowerBetter raw={{ b: detalle.snapMttrMinutos, a: detalle.postMttrMinutos }} />
                <MetricBox label="IEI" value={fmtIei(detalle.snapIei)} post={fmtIei(detalle.postIei)} lowerBetter raw={{ b: detalle.snapIei, a: detalle.postIei }} />
                <MetricBox label="Incidentes" value={detalle.snapIncidentes ?? '—'} post={detalle.postIncidentes ?? null} lowerBetter raw={{ b: detalle.snapIncidentes, a: detalle.postIncidentes }} />
              </div>
            )}
          </div>
        )
      })()}

      {detalle.resultadoNota && <Row label="Nota de resultado" value={detalle.resultadoNota} />}

      {/* ── Comparativa post-ejecución (≥30 días) ─────────────────────────── */}
      {esCambio && detalle.estado === 'EJECUTADA' && (
        <div>
          {comparativaHabilitada ? (
            !comparativaOpen ? (
              <button onClick={onComparativaOpen} style={{ width: '100%', padding: '9px', fontSize: '12px', fontWeight: 600, background: '#185FA5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                Ver comparativa con nuevo proveedor
              </button>
            ) : (
              <div style={{ background: '#eff6ff', border: '0.5px solid #bfdbfe', borderRadius: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e40af' }}>Comparativa — {detalle.proveedorAnteriorNombre ?? 'Anterior'} vs {detalle.proveedorNombre ?? 'Actual'}</div>
                  <button onClick={onComparativaClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '14px' }}>×</button>
                </div>
                {comparativaLoading ? (
                  <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '16px' }}>Cargando datos actuales…</div>
                ) : comparativaData && detalle.snapDetalle ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {[
                      { label: 'SLA Respuesta', old: detalle.snapDetalle?.slaRespuestaPct, now: comparativaData.snap?.slaRespuestaPct, fmt: fmtPct, lb: false },
                      { label: 'SLA Resolución', old: detalle.snapDetalle?.slaResolucionPct, now: comparativaData.snap?.slaResolucionPct, fmt: fmtPct, lb: false },
                      { label: 'MTTR', old: detalle.snapDetalle?.mttrPromedio, now: comparativaData.snap?.mttrPromedio, fmt: fmtMttr, lb: true },
                      { label: 'Incidentes', old: detalle.snapDetalle?.totalIncidentes, now: comparativaData.snap?.totalIncidentes, fmt: (v: any) => v ?? '—', lb: true },
                      { label: 'SLA vencidos', old: detalle.snapDetalle?.incidentesSlaVencido, now: comparativaData.snap?.incidentesSlaVencido, fmt: (v: any) => v ?? '—', lb: true },
                      { label: 'IEI acum.', old: detalle.snapDetalle?.ieiAcumulado, now: comparativaData.snap?.ieiAcumulado, fmt: fmtIei, lb: true },
                    ].map(({ label, old, now, fmt, lb }) => (
                      <div key={label} style={{ background: 'white', border: '0.5px solid #bfdbfe', borderRadius: '6px', padding: '7px 8px' }}>
                        <div style={{ fontSize: '9px', color: '#9ca3af', marginBottom: '3px' }}>{label}</div>
                        <div style={{ fontSize: '10px', color: '#6b7280' }}>{fmt(old)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
                          <DeltaBadge before={old} after={now} lowerBetter={lb} />
                          <span style={{ fontSize: '12px', fontWeight: 700 }}>{fmt(now)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center' }}>Sin datos disponibles para comparar.</div>
                )}
                <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '8px' }}>Período actual: {comparativaData?.snap?.periodo ?? 'Últimos 90 días'}</div>
              </div>
            )
          ) : diasDesdeEjecucion != null && diasDesdeEjecucion < 30 ? (
            <div style={{ fontSize: '11px', color: '#6b7280', background: '#f9fafb', borderRadius: '8px', padding: '8px 12px', textAlign: 'center' }}>
              Comparativa disponible en {30 - diasDesdeEjecucion} día{30 - diasDesdeEjecucion !== 1 ? 's' : ''} (mínimo 30 días con el nuevo proveedor)
            </div>
          ) : null}
        </div>
      )}

      {/* ── Aprobación (Supervisor o Gerencia, solo PROPUESTO) ────────────── */}
      {canAprobar && detalle.estado === 'PROPUESTO' && !rechazarModal && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aprobación</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ActionBtn onClick={onAprobar} loading={savingAction} color="#15803d" label="Aprobar" />
            <ActionBtn onClick={onRechazarOpen} loading={false} color="#9d174d" label="Rechazar" outline />
          </div>
        </div>
      )}

      {/* ── Modal rechazo inline ────────────────────────────────────────────── */}
      {rechazarModal && (
        <div style={{ background: '#fff1f2', border: '0.5px solid #fecdd3', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#9d174d', marginBottom: '10px' }}>Motivo del rechazo</div>
          <textarea value={rechazarMotivo} onChange={e => onRechazarMotivoChange(e.target.value)} placeholder="Explica por qué se rechaza esta decisión…" rows={3} style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid #fecdd3', borderRadius: '8px', background: 'white', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button onClick={onRechazarClose} style={{ flex: 1, padding: '8px', fontSize: '12px', background: 'transparent', border: '0.5px solid #fecdd3', borderRadius: '8px', cursor: 'pointer', color: '#9d174d' }}>Atrás</button>
            <button onClick={onConfirmRechazar} disabled={savingAction || !rechazarMotivo.trim()} style={{ flex: 2, padding: '8px', fontSize: '12px', fontWeight: 600, background: savingAction || !rechazarMotivo.trim() ? '#fbcfe8' : '#9d174d', color: 'white', border: 'none', borderRadius: '8px', cursor: savingAction || !rechazarMotivo.trim() ? 'default' : 'pointer' }}>
              {savingAction ? 'Guardando…' : 'Confirmar rechazo'}
            </button>
          </div>
        </div>
      )}

      {/* ── Acciones CAMBIO_PROVEEDOR: Actualizar decisión ──────────────────── */}
      {esCambio && canAprobar && canAct && detalle.estado === 'PENDIENTE' && ejecutarCPConfirm !== 'confirming' && ejecutarCPConfirm !== 'error' && !rechazarModal && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ejecutar cambio</div>
          {/* Fecha seguimiento opcional */}
          <div>
            <label style={{ ...labelSt, marginBottom: '4px' }}>Fecha de seguimiento <span style={{ fontWeight: 400, textTransform: 'none', color: '#9ca3af' }}>(opcional)</span></label>
            <input type="date" value={fechaSeguimientoCP} onChange={e => onFechaSeguimientoCPChange(e.target.value)} style={{ ...inp2(), width: '200px' }} />
          </div>
          <button onClick={onEjecutarCPStart} style={{ padding: '9px 18px', fontSize: '12px', fontWeight: 700, background: '#15803d', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', alignSelf: 'flex-start' }}>
            Actualizar decisión →
          </button>
          <ActionBtn onClick={onCancelar} loading={savingAction} color="#b91c1c" label="Cancelar decisión" outline />
        </div>
      )}

      {/* ── Confirmación doble CAMBIO_PROVEEDOR ─────────────────────────────── */}
      {esCambio && (ejecutarCPConfirm === 'confirming' || ejecutarCPConfirm === 'error') && (
        <div style={{ background: '#fef3c7', border: '0.5px solid #f59e0b', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', marginBottom: '8px' }}>⚠ Confirmar cambio de proveedor</div>
          <div style={{ fontSize: '12px', color: '#78350f', marginBottom: '12px', lineHeight: 1.5 }}>
            Esto cambiará el proveedor de <strong>{detalle.tiendaCodigo}</strong> de <strong>{detalle.proveedorAnteriorNombre ?? '—'}</strong> a <strong>{detalle.proveedorNombre ?? '—'}</strong>. Esta acción no se puede deshacer.
            <br />Los incidentes históricos quedarán atribuidos al proveedor anterior.
          </div>
          {ejecutarCPError && (
            <div style={{ fontSize: '12px', color: '#b91c1c', background: '#fee2e2', borderRadius: '6px', padding: '8px 10px', marginBottom: '10px' }}>
              {ejecutarCPError}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onEjecutarCPCancel} style={{ flex: 1, padding: '8px', fontSize: '12px', background: 'transparent', border: '0.5px solid #f59e0b', borderRadius: '8px', cursor: 'pointer', color: '#92400e' }}>Cancelar</button>
            <button onClick={onEjecutarCPConfirm} disabled={savingAction} style={{ flex: 2, padding: '8px', fontSize: '12px', fontWeight: 700, background: savingAction ? '#86efac' : '#15803d', color: 'white', border: 'none', borderRadius: '8px', cursor: savingAction ? 'default' : 'pointer' }}>
              {savingAction ? 'Ejecutando…' : 'Confirmar cambio de proveedor'}
            </button>
          </div>
        </div>
      )}

      {/* ── Acciones genéricas (no CAMBIO_PROVEEDOR) ────────────────────────── */}
      {!esCambio && canAct && !ejecutarMode && !rechazarModal && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Acciones</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {detalle.estado === 'PENDIENTE' && <ActionBtn onClick={onEnEjecucion} loading={savingAction} color="#185FA5" label="Marcar en ejecución" />}
            {['PENDIENTE', 'EN_EJECUCION'].includes(detalle.estado) && <ActionBtn onClick={onEjecutar} loading={false} color="#15803d" label="Marcar ejecutada" />}
            <ActionBtn onClick={onCancelar} loading={savingAction} color="#b91c1c" label="Cancelar" outline />
          </div>
        </div>
      )}

      {/* ── Form ejecutar genérico ────────────────────────────────────────── */}
      {!esCambio && ejecutarMode && (
        <div style={{ background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#15803d', marginBottom: '12px' }}>Registrar resultado</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={labelSt}>Nota de resultado</label>
              <textarea value={ejecutarForm.resultadoNota} onChange={e => onEjecutarForm('resultadoNota', e.target.value)} placeholder="Describe el resultado de la ejecución…" rows={3} style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid #bbf7d0', borderRadius: '8px', background: 'white', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div><label style={labelSt}>SLA post (%)</label><input type="number" step="0.1" value={ejecutarForm.postSlaPct} onChange={e => onEjecutarForm('postSlaPct', e.target.value)} style={postInp()} /></div>
              <div><label style={labelSt}>MTTR post (min)</label><input type="number" value={ejecutarForm.postMttrMinutos} onChange={e => onEjecutarForm('postMttrMinutos', e.target.value)} style={postInp()} /></div>
              <div><label style={labelSt}>IEI post (S/)</label><input type="number" step="0.01" value={ejecutarForm.postIei} onChange={e => onEjecutarForm('postIei', e.target.value)} style={postInp()} /></div>
              <div><label style={labelSt}>Incidentes post</label><input type="number" value={ejecutarForm.postIncidentes} onChange={e => onEjecutarForm('postIncidentes', e.target.value)} style={postInp()} /></div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={onCancelEjecutar} style={{ flex: 1, padding: '8px', fontSize: '12px', background: 'transparent', border: '0.5px solid #bbf7d0', borderRadius: '8px', cursor: 'pointer', color: '#15803d' }}>Atrás</button>
              <button onClick={onConfirmEjecutar} disabled={savingAction} style={{ flex: 2, padding: '8px', fontSize: '12px', fontWeight: 600, background: savingAction ? '#86efac' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: savingAction ? 'default' : 'pointer' }}>
                {savingAction ? 'Guardando…' : 'Confirmar ejecución'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── MetricBox ──────────────────────────────────────────────────────────────────

function MetricBox({ label, value, post, lowerBetter, raw }: { label: string; value: any; post: any; lowerBetter: boolean; raw: { b: any; a: any } }) {
  const hasPost = raw.a != null && raw.a !== ''
  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '7px', padding: '8px 10px' }}>
      <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>{value ?? '—'}</div>
      {hasPost && (
        <div style={{ fontSize: '11px', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <DeltaBadge before={raw.b} after={raw.a} lowerBetter={lowerBetter} />
          <span style={{ color: '#374151' }}>{post}</span>
        </div>
      )}
    </div>
  )
}

// ── ActionBtn ──────────────────────────────────────────────────────────────────

function ActionBtn({ onClick, loading, color, label, outline }: { onClick: () => void; loading: boolean; color: string; label: string; outline?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} style={{ padding: '7px 14px', fontSize: '11px', fontWeight: 600, borderRadius: '7px', cursor: loading ? 'default' : 'pointer', background: outline ? 'transparent' : color, color: outline ? color : 'white', border: outline ? `0.5px solid ${color}` : 'none', opacity: loading ? 0.6 : 1 }}>
      {loading ? '…' : label}
    </button>
  )
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function postInp(): React.CSSProperties {
  return { width: '100%', padding: '6px 9px', fontSize: '12px', border: '0.5px solid #bbf7d0', borderRadius: '7px', background: 'white', outline: 'none', boxSizing: 'border-box' }
}

function inp2(): React.CSSProperties {
  return { padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }
}

function IcoCalendar() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
