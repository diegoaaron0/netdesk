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

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return null
  const dt = new Date(d)
  return dt.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
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
  return `S/${Number(v).toFixed(2)}`
}

function inp(): React.CSSProperties {
  return { width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }
}

function DeltaBadge({ before, after, lowerBetter = false }: { before: string | number | null, after: string | number | null, lowerBetter?: boolean }) {
  if (before == null || after == null || before === '' || after === '') return <span style={{ color: '#9ca3af' }}>—</span>
  const b = Number(before), a = Number(after)
  const improved = lowerBetter ? a < b : a > b
  const same = a === b
  const arrow = same ? '→' : improved ? '↑' : '↓'
  const color = same ? '#9ca3af' : improved ? '#16a34a' : '#dc2626'
  return <span style={{ color, fontWeight: 600 }}>{arrow}</span>
}

// ── Blank form ─────────────────────────────────────────────────────────────────

const BLANK_FORM = {
  tipo: '', titulo: '', motivo: '', descripcion: '',
  tiendaId: '', proveedorId: '', fechaSeguimiento: '',
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
  const canGerencia = userRol === 'GERENCIA'

  const [lista, setLista]         = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [filtros, setFiltros]     = useState({ estado: '', tipo: '', q: '' })
  const [selected, setSelected]   = useState<any | null>(null)
  const [detalle, setDetalle]     = useState<any | null>(null)
  const [loadingDet, setLoadingDet] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)

  // Modal nueva decisión
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState<any>(BLANK_FORM)
  const [saving, setSaving] = useState(false)

  // Tiendas y proveedores para selects
  const [tiendas, setTiendas]       = useState<{ id: string; codigo: string; nombreCc: string | null }[]>([])
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([])
  const [tiendaQuery, setTiendaQuery] = useState('')
  const [showTiendaDrop, setShowTiendaDrop] = useState(false)
  const tiendaRef = useRef<HTMLDivElement>(null)

  // Panel "marcar ejecutada"
  const [ejecutarMode, setEjecutarMode] = useState(false)
  const [ejecutarForm, setEjecutarForm] = useState<any>(BLANK_EJECUTAR)
  const [savingAction, setSavingAction] = useState(false)

  // Modal rechazo
  const [rechazarModal, setRechazarModal]   = useState(false)
  const [rechazarMotivo, setRechazarMotivo] = useState('')

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchLista = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filtros.estado) p.set('estado', filtros.estado)
    if (filtros.tipo)   p.set('tipo',   filtros.tipo)
    const res = await fetch(`/api/decisiones?${p}`)
    if (res.ok) {
      const data = await res.json()
      setLista(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [filtros.estado, filtros.tipo])

  useEffect(() => { fetchLista() }, [fetchLista])

  useEffect(() => {
    fetch('/api/tiendas').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setTiendas(d.map((t: any) => ({ id: t.id, codigo: t.codigo, nombreCc: t.nombreCc })))
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

  function openPanel(dec: any) {
    setSelected(dec)
    setPanelOpen(true)
    setEjecutarMode(false)
    setEjecutarForm(BLANK_EJECUTAR)
    setRechazarModal(false)
    setRechazarMotivo('')
    fetchDetalle(dec.id)
  }

  function closePanel() {
    setPanelOpen(false)
    setSelected(null)
    setDetalle(null)
    setEjecutarMode(false)
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function patchEstado(id: string, estado: string, extra?: Record<string, unknown>) {
    setSavingAction(true)
    await fetch(`/api/decisiones/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, ...extra }),
    })
    setSavingAction(false)
    fetchLista()
    fetchDetalle(id)
  }

  async function handleEjecutar() {
    if (!detalle) return
    setSavingAction(true)
    await fetch(`/api/decisiones/${detalle.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estado: 'EJECUTADA',
        resultadoNota:   ejecutarForm.resultadoNota   || null,
        postSlaPct:      ejecutarForm.postSlaPct      || null,
        postMttrMinutos: ejecutarForm.postMttrMinutos ? Number(ejecutarForm.postMttrMinutos) : null,
        postIei:         ejecutarForm.postIei         || null,
        postIncidentes:  ejecutarForm.postIncidentes  ? Number(ejecutarForm.postIncidentes) : null,
      }),
    })
    setSavingAction(false)
    setEjecutarMode(false)
    fetchLista()
    fetchDetalle(detalle.id)
  }

  async function handleAprobar() {
    if (!detalle) return
    setSavingAction(true)
    await fetch(`/api/decisiones/${detalle.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _action: 'aprobar' }),
    })
    setSavingAction(false)
    fetchLista()
    fetchDetalle(detalle.id)
  }

  async function handleRechazar() {
    if (!detalle || !rechazarMotivo.trim()) return
    setSavingAction(true)
    await fetch(`/api/decisiones/${detalle.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _action: 'rechazar', rechazadoMotivo: rechazarMotivo }),
    })
    setSavingAction(false)
    setRechazarModal(false)
    setRechazarMotivo('')
    fetchLista()
    fetchDetalle(detalle.id)
  }

  async function handleCreate() {
    if (!form.tipo || !form.titulo || !form.motivo) return
    setSaving(true)
    await fetch('/api/decisiones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        tiendaId:    form.tiendaId    || null,
        proveedorId: form.proveedorId || null,
        fechaSeguimiento: form.fechaSeguimiento || null,
      }),
    })
    setSaving(false)
    setModal(false)
    setForm(BLANK_FORM)
    setTiendaQuery('')
    fetchLista()
  }

  // ── Filter ───────────────────────────────────────────────────────────────────

  const visible = lista.filter(d => {
    if (!filtros.q) return true
    const q = filtros.q.toLowerCase()
    return d.titulo?.toLowerCase().includes(q) || d.motivo?.toLowerCase().includes(q)
  })

  // ── Tienda autocomplete helpers ───────────────────────────────────────────────

  const tiendaOptions = tiendas.filter(t =>
    !tiendaQuery || t.codigo.toLowerCase().includes(tiendaQuery.toLowerCase()) ||
    (t.nombreCc ?? '').toLowerCase().includes(tiendaQuery.toLowerCase())
  ).slice(0, 10)

  const selectedTienda = tiendas.find(t => t.id === form.tiendaId)

  // Close dropdown on outside click
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
            onClick={() => { setForm(BLANK_FORM); setTiendaQuery(''); setModal(true) }}
            style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 600, background: '#185FA5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + Nueva decisión
          </button>
        )}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 28px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={filtros.estado}
          onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}
          style={{ ...inp(), width: '160px' }}
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_STYLE).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <select
          value={filtros.tipo}
          onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}
          style={{ ...inp(), width: '200px' }}
        >
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
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
            No hay decisiones registradas.
          </div>
        ) : visible.map(dec => (
          <DecisionCard key={dec.id} dec={dec} onClick={() => openPanel(dec)} />
        ))}
      </div>

      {/* ── Side panel ─────────────────────────────────────────────────────── */}
      {panelOpen && (
        <>
          <div
            onClick={closePanel}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 79 }}
          />
          <aside style={{
            position: 'fixed', top: 0, right: 0, width: '420px', maxWidth: '95vw',
            height: '100vh', background: 'var(--card)', borderLeft: '0.5px solid var(--border)',
            zIndex: 80, overflowY: 'auto', display: 'flex', flexDirection: 'column',
          }}>
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
                  canGerencia={canGerencia}
                  ejecutarMode={ejecutarMode}
                  ejecutarForm={ejecutarForm}
                  savingAction={savingAction}
                  rechazarModal={rechazarModal}
                  rechazarMotivo={rechazarMotivo}
                  onEjecutarForm={(k, v) => setEjecutarForm((f: any) => ({ ...f, [k]: v }))}
                  onEnEjecucion={() => patchEstado(detalle.id, 'EN_EJECUCION')}
                  onEjecutar={() => setEjecutarMode(true)}
                  onCancelEjecutar={() => setEjecutarMode(false)}
                  onConfirmEjecutar={handleEjecutar}
                  onCancelar={() => patchEstado(detalle.id, 'CANCELADA')}
                  onAprobar={handleAprobar}
                  onRechazarOpen={() => setRechazarModal(true)}
                  onRechazarClose={() => { setRechazarModal(false); setRechazarMotivo('') }}
                  onRechazarMotivoChange={setRechazarMotivo}
                  onConfirmRechazar={handleRechazar}
                  onEditar={() => {/* future */ }}
                />
              </div>
            ) : null}
          </aside>
        </>
      )}

      {/* ── Modal nueva decisión ────────────────────────────────────────────── */}
      {modal && (
        <>
          <div onClick={() => setModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 90 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: '480px', maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto',
            background: 'var(--card)', borderRadius: '14px', border: '0.5px solid var(--border)',
            zIndex: 91, padding: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)' }}>Nueva decisión</span>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#9ca3af', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Tipo */}
              <div>
                <label style={labelSt}>Tipo *</label>
                <select value={form.tipo} onChange={e => setForm((f: any) => ({ ...f, tipo: e.target.value }))} style={inp()}>
                  <option value="">Selecciona un tipo…</option>
                  {TIPOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              {/* Título */}
              <div>
                <label style={labelSt}>Título *</label>
                <input value={form.titulo} onChange={e => setForm((f: any) => ({ ...f, titulo: e.target.value }))} placeholder="Título de la decisión" style={inp()} />
              </div>

              {/* Motivo */}
              <div>
                <label style={labelSt}>Motivo *</label>
                <textarea
                  value={form.motivo}
                  onChange={e => setForm((f: any) => ({ ...f, motivo: e.target.value }))}
                  placeholder="¿Por qué se toma esta decisión?"
                  rows={3}
                  style={{ ...inp(), resize: 'vertical' }}
                />
              </div>

              {/* Descripción */}
              <div>
                <label style={labelSt}>Descripción</label>
                <textarea
                  value={form.descripcion}
                  onChange={e => setForm((f: any) => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Detalle adicional opcional"
                  rows={2}
                  style={{ ...inp(), resize: 'vertical' }}
                />
              </div>

              {/* Tienda autocomplete */}
              <div ref={tiendaRef} style={{ position: 'relative' }}>
                <label style={labelSt}>Tienda (opcional)</label>
                {selectedTienda ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', background: '#dbeafe', color: '#1e40af', borderRadius: '5px', padding: '3px 8px' }}>
                      {selectedTienda.codigo} — {selectedTienda.nombreCc}
                    </span>
                    <button onClick={() => { setForm((f: any) => ({ ...f, tiendaId: '' })); setTiendaQuery('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '14px' }}>×</button>
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
                        onMouseDown={() => { setForm((f: any) => ({ ...f, tiendaId: t.id })); setTiendaQuery(''); setShowTiendaDrop(false) }}
                        style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)', borderBottom: '0.5px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--background)'}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                      >
                        <strong>{t.codigo}</strong> {t.nombreCc ? `— ${t.nombreCc}` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Proveedor */}
              <div>
                <label style={labelSt}>Proveedor (opcional)</label>
                <select value={form.proveedorId} onChange={e => setForm((f: any) => ({ ...f, proveedorId: e.target.value }))} style={inp()}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>

              {/* Fecha seguimiento */}
              <div>
                <label style={labelSt}>Fecha de seguimiento</label>
                <input type="date" value={form.fechaSeguimiento} onChange={e => setForm((f: any) => ({ ...f, fechaSeguimiento: e.target.value }))} style={inp()} />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button onClick={() => setModal(false)} style={{ flex: 1, padding: '9px', fontSize: '12px', background: 'transparent', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving || !form.tipo || !form.titulo || !form.motivo}
                  style={{ flex: 2, padding: '9px', fontSize: '12px', fontWeight: 600, background: saving ? '#93c5fd' : '#185FA5', color: 'white', border: 'none', borderRadius: '8px', cursor: saving ? 'default' : 'pointer' }}
                >
                  {saving ? 'Guardando…' : 'Guardar decisión'}
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
  const hasSnap = dec.snapSlaPct != null || dec.snapMttrMinutos != null || dec.snapIei != null || dec.snapIncidentes != null
  const hasPost = dec.postSlaPct != null

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px',
        padding: '14px 16px', cursor: 'pointer', transition: 'box-shadow 0.15s',
        display: 'flex', flexDirection: 'column', gap: '8px',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}
    >
      {/* Row 1: badges + date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: est.bg, color: est.color }}>
          {est.label}
        </span>
        <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '20px', background: '#f3f4f6', color: '#374151' }}>
          {tipo}
        </span>
        {dec.tiendaCodigo && (
          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '5px', background: '#e0f2fe', color: '#075985' }}>
            {dec.tiendaCodigo}
          </span>
        )}
        {dec.proveedorNombre && (
          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '5px', background: '#ede9fe', color: '#5b21b6' }}>
            {dec.proveedorNombre}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
          {fmtDate(dec.creadoEn)}
        </span>
      </div>

      {/* Row 2: title */}
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>
        {dec.titulo}
      </div>

      {/* Row 3: motivo */}
      <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {dec.motivo}
      </div>

      {/* Row 4: responsable + seguimiento */}
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

      {/* Row 5: snapshot + comparativa */}
      {hasSnap && (
        <div style={{ fontSize: '11px', color: '#6b7280', background: '#f9fafb', borderRadius: '6px', padding: '6px 10px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {dec.snapSlaPct     != null && <span>SLA: <strong>{fmtPct(dec.snapSlaPct)}</strong></span>}
          {dec.snapMttrMinutos != null && <span>MTTR: <strong>{fmtMttr(dec.snapMttrMinutos)}</strong></span>}
          {dec.snapIei        != null && <span>IEI: <strong>{fmtIei(dec.snapIei)}</strong></span>}
          {dec.snapIncidentes != null && <span>Inc: <strong>{dec.snapIncidentes}</strong></span>}
          {dec.snapPeriodo && <span style={{ color: '#9ca3af' }}>{dec.snapPeriodo}</span>}
          {hasPost && (
            <>
              <span style={{ color: '#d1d5db', margin: '0 2px' }}>·</span>
              {dec.postSlaPct     != null && <span>SLA: {fmtPct(dec.snapSlaPct)} <DeltaBadge before={dec.snapSlaPct}     after={dec.postSlaPct}     /> {fmtPct(dec.postSlaPct)}</span>}
              {dec.postMttrMinutos != null && <span>MTTR: {fmtMttr(dec.snapMttrMinutos)} <DeltaBadge before={dec.snapMttrMinutos} after={dec.postMttrMinutos} lowerBetter /> {fmtMttr(dec.postMttrMinutos)}</span>}
              {dec.postIei        != null && <span>IEI: {fmtIei(dec.snapIei)} <DeltaBadge before={dec.snapIei}        after={dec.postIei}        lowerBetter /> {fmtIei(dec.postIei)}</span>}
              {dec.postIncidentes != null && <span>Inc: {dec.snapIncidentes} <DeltaBadge before={dec.snapIncidentes}  after={dec.postIncidentes}  lowerBetter /> {dec.postIncidentes}</span>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── DetailPanel ────────────────────────────────────────────────────────────────

function DetailPanel({
  detalle, canCrear, canGerencia, ejecutarMode, ejecutarForm, savingAction,
  rechazarModal, rechazarMotivo,
  onEjecutarForm, onEnEjecucion, onEjecutar, onCancelEjecutar, onConfirmEjecutar, onCancelar,
  onAprobar, onRechazarOpen, onRechazarClose, onRechazarMotivoChange, onConfirmRechazar,
  onEditar,
}: {
  detalle: any; canCrear: boolean; canGerencia: boolean; ejecutarMode: boolean; ejecutarForm: any; savingAction: boolean
  rechazarModal: boolean; rechazarMotivo: string
  onEjecutarForm: (k: string, v: any) => void
  onEnEjecucion: () => void; onEjecutar: () => void; onCancelEjecutar: () => void; onConfirmEjecutar: () => void
  onCancelar: () => void
  onAprobar: () => void; onRechazarOpen: () => void; onRechazarClose: () => void
  onRechazarMotivoChange: (v: string) => void; onConfirmRechazar: () => void
  onEditar: () => void
}) {
  const est  = ESTADO_STYLE[detalle.estado] ?? ESTADO_STYLE.PENDIENTE
  const tipo = TIPO_LABELS[detalle.tipo] ?? detalle.tipo
  const canAct = canCrear && detalle.estado !== 'CANCELADA' && detalle.estado !== 'EJECUTADA' && detalle.estado !== 'RECHAZADO'

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
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: est.bg, color: est.color }}>{est.label}</span>
        <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: '#f3f4f6', color: '#374151' }}>{tipo}</span>
      </div>

      {/* Título */}
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>{detalle.titulo}</div>

      <Row label="Motivo" value={detalle.motivo} />
      {detalle.descripcion && <Row label="Descripción" value={detalle.descripcion} />}

      {/* Tienda / proveedor */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {detalle.tiendaCodigo && (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Tienda</div>
            <span style={{ fontSize: '12px', background: '#e0f2fe', color: '#075985', borderRadius: '5px', padding: '2px 8px' }}>{detalle.tiendaCodigo}{detalle.tiendaNombre ? ` — ${detalle.tiendaNombre}` : ''}</span>
          </div>
        )}
        {detalle.proveedorNombre && (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Proveedor</div>
            <span style={{ fontSize: '12px', background: '#ede9fe', color: '#5b21b6', borderRadius: '5px', padding: '2px 8px' }}>{detalle.proveedorNombre}</span>
          </div>
        )}
      </div>

      {/* Responsable */}
      <Row label="Responsable" value={`${detalle.responsableNombre} (${ROL_LABELS[detalle.responsableRol] ?? detalle.responsableRol})`} />
      {detalle.responsableEmail && <Row label="Email responsable" value={detalle.responsableEmail} />}

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

      {/* Snapshot */}
      {(detalle.snapSlaPct != null || detalle.snapMttrMinutos != null) && (
        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            Indicadores al momento de decidir {detalle.snapPeriodo ? `· ${detalle.snapPeriodo}` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <MetricBox label="SLA" value={fmtPct(detalle.snapSlaPct)} post={fmtPct(detalle.postSlaPct)} lowerBetter={false} raw={{ b: detalle.snapSlaPct, a: detalle.postSlaPct }} />
            <MetricBox label="MTTR" value={fmtMttr(detalle.snapMttrMinutos)} post={fmtMttr(detalle.postMttrMinutos)} lowerBetter raw={{ b: detalle.snapMttrMinutos, a: detalle.postMttrMinutos }} />
            <MetricBox label="IEI" value={fmtIei(detalle.snapIei)} post={fmtIei(detalle.postIei)} lowerBetter raw={{ b: detalle.snapIei, a: detalle.postIei }} />
            <MetricBox label="Incidentes" value={detalle.snapIncidentes ?? '—'} post={detalle.postIncidentes ?? null} lowerBetter raw={{ b: detalle.snapIncidentes, a: detalle.postIncidentes }} />
          </div>
        </div>
      )}

      {/* Resultado nota */}
      {detalle.resultadoNota && <Row label="Nota de resultado" value={detalle.resultadoNota} />}

      {/* ── Acciones aprobación (GERENCIA, solo PROPUESTO) ────────────────── */}
      {canGerencia && detalle.estado === 'PROPUESTO' && !rechazarModal && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aprobación</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <ActionBtn onClick={onAprobar} loading={savingAction} color="#15803d" label="Aprobar" />
            <ActionBtn onClick={onRechazarOpen} loading={false} color="#9d174d" label="Rechazar" outline />
          </div>
        </div>
      )}

      {/* ── Modal rechazo inline ───────────────────────────────────────────── */}
      {rechazarModal && (
        <div style={{ background: '#fff1f2', border: '0.5px solid #fecdd3', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#9d174d', marginBottom: '10px' }}>Motivo del rechazo</div>
          <textarea
            value={rechazarMotivo}
            onChange={e => onRechazarMotivoChange(e.target.value)}
            placeholder="Explica por qué se rechaza esta decisión…"
            rows={3}
            style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid #fecdd3', borderRadius: '8px', background: 'white', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button onClick={onRechazarClose} style={{ flex: 1, padding: '8px', fontSize: '12px', background: 'transparent', border: '0.5px solid #fecdd3', borderRadius: '8px', cursor: 'pointer', color: '#9d174d' }}>
              Atrás
            </button>
            <button
              onClick={onConfirmRechazar}
              disabled={savingAction || !rechazarMotivo.trim()}
              style={{ flex: 2, padding: '8px', fontSize: '12px', fontWeight: 600, background: savingAction || !rechazarMotivo.trim() ? '#fbcfe8' : '#9d174d', color: 'white', border: 'none', borderRadius: '8px', cursor: savingAction || !rechazarMotivo.trim() ? 'default' : 'pointer' }}
            >
              {savingAction ? 'Guardando…' : 'Confirmar rechazo'}
            </button>
          </div>
        </div>
      )}

      {/* ── Acciones ──────────────────────────────────────────────────────── */}
      {canAct && !ejecutarMode && !rechazarModal && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Acciones</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {detalle.estado === 'PENDIENTE' && (
              <ActionBtn onClick={onEnEjecucion} loading={savingAction} color="#185FA5" label="Marcar en ejecución" />
            )}
            {(detalle.estado === 'PENDIENTE' || detalle.estado === 'EN_EJECUCION') && (
              <ActionBtn onClick={onEjecutar} loading={false} color="#15803d" label="Marcar ejecutada" />
            )}
            <ActionBtn onClick={onCancelar} loading={savingAction} color="#b91c1c" label="Cancelar" outline />
          </div>
        </div>
      )}

      {/* ── Form ejecutar ─────────────────────────────────────────────────── */}
      {ejecutarMode && (
        <div style={{ background: '#f0fdf4', border: '0.5px solid #bbf7d0', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#15803d', marginBottom: '12px' }}>Registrar resultado de ejecución</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={labelSt}>Nota de resultado</label>
              <textarea
                value={ejecutarForm.resultadoNota}
                onChange={e => onEjecutarForm('resultadoNota', e.target.value)}
                placeholder="Describe qué ocurrió al ejecutar la decisión…"
                rows={3}
                style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid #bbf7d0', borderRadius: '8px', background: 'white', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelSt}>SLA post (%)</label>
                <input type="number" step="0.1" value={ejecutarForm.postSlaPct} onChange={e => onEjecutarForm('postSlaPct', e.target.value)} placeholder="ej. 85.5" style={{ ...postInp() }} />
              </div>
              <div>
                <label style={labelSt}>MTTR post (min)</label>
                <input type="number" value={ejecutarForm.postMttrMinutos} onChange={e => onEjecutarForm('postMttrMinutos', e.target.value)} placeholder="ej. 120" style={{ ...postInp() }} />
              </div>
              <div>
                <label style={labelSt}>IEI post (S/)</label>
                <input type="number" step="0.01" value={ejecutarForm.postIei} onChange={e => onEjecutarForm('postIei', e.target.value)} placeholder="ej. 450.00" style={{ ...postInp() }} />
              </div>
              <div>
                <label style={labelSt}>Incidentes post</label>
                <input type="number" value={ejecutarForm.postIncidentes} onChange={e => onEjecutarForm('postIncidentes', e.target.value)} placeholder="ej. 8" style={{ ...postInp() }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
              <button onClick={onCancelEjecutar} style={{ flex: 1, padding: '8px', fontSize: '12px', background: 'transparent', border: '0.5px solid #bbf7d0', borderRadius: '8px', cursor: 'pointer', color: '#15803d' }}>
                Atrás
              </button>
              <button
                onClick={onConfirmEjecutar}
                disabled={savingAction}
                style={{ flex: 2, padding: '8px', fontSize: '12px', fontWeight: 600, background: savingAction ? '#86efac' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: savingAction ? 'default' : 'pointer' }}
              >
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
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: '7px 14px', fontSize: '11px', fontWeight: 600, borderRadius: '7px', cursor: loading ? 'default' : 'pointer',
        background: outline ? 'transparent' : color,
        color: outline ? color : 'white',
        border: outline ? `0.5px solid ${color}` : 'none',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? '…' : label}
    </button>
  )
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function postInp(): React.CSSProperties {
  return { width: '100%', padding: '6px 9px', fontSize: '12px', border: '0.5px solid #bbf7d0', borderRadius: '7px', background: 'white', outline: 'none', boxSizing: 'border-box' }
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
