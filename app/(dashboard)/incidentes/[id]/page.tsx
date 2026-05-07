'use client'
import { useEffect, useState, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Badge, estadoToVariant, impactoToVariant } from '@/components/ui/Badge'
import { CronometroPrincipal } from '@/components/incidentes/CronometroPrincipal'
import { CronometroEscalamiento } from '@/components/incidentes/CronometroEscalamiento'
import { GuiaEscalamiento } from '@/components/incidentes/GuiaEscalamiento'
import { AdjuntosZona } from '@/components/incidentes/AdjuntosZona'
import { can } from '@/lib/permisos'

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
}

function inputStyle(disabled?: boolean): React.CSSProperties {
  return { width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: disabled ? 'var(--muted)' : 'var(--card)', color: disabled ? 'var(--muted-foreground)' : 'var(--foreground)', outline: 'none' }
}
function textareaStyle(disabled?: boolean): React.CSSProperties {
  return { width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: disabled ? 'var(--muted)' : 'var(--card)', color: disabled ? 'var(--muted-foreground)' : 'var(--foreground)', outline: 'none', minHeight: '72px', resize: 'vertical' }
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', alignItems: 'start', gap: '8px', marginBottom: '9px' }}>
      <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)', paddingTop: '7px' }}>{label}</label>
      <div>{children}</div>
    </div>
  )
}

function ReadonlyVal({ value, mono }: { value: string; mono?: boolean }) {
  return (
    <div style={{ padding: '7px 10px', fontSize: '12px', background: 'var(--muted)', borderRadius: '8px', color: 'var(--muted-foreground)', fontFamily: mono ? 'monospace' : undefined }}>
      {value || '—'}
    </div>
  )
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', marginBottom: '14px' }}>
      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', fontWeight: 600 }}>{title}</div>
        {action}
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

function relativeTime(date: string | Date) {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'hace un momento'
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h ${m % 60}m`
  return new Date(date).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function toDatetimeLocal(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  const lima = new Date(d.getTime() - 5 * 3600000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${lima.getUTCFullYear()}-${p(lima.getUTCMonth()+1)}-${p(lima.getUTCDate())}T${p(lima.getUTCHours())}:${p(lima.getUTCMinutes())}`
}
function fromDatetimeLocal(val: string) {
  if (!val) return null
  return new Date(val + ':00-05:00').toISOString()
}

function minToHM(min: number | null) {
  if (!min) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function buildCorreo(inc: any, nivel: number, nivelData: any) {
  return `Asunto: [NetDesk ${inc.codigo}] Avería Internet — ${inc.tiendaCodigo} ${inc.tiendaNombre} · ${inc.tiendaDistrito}

Estimados ${nivelData?.nombreContacto ?? 'Soporte'},

Reportamos avería en la tienda ${inc.tiendaCodigo} — ${inc.tiendaNombre}
Dirección: ${inc.tiendaDireccion ?? '—'}
Proveedor: ${inc.proveedorNombre ?? '—'}
CID / Servicio: ${inc.tiendaCid ?? '—'}
Tipo de conexión: ${inc.tiendaTipoConexion ?? '—'}

Tipo de falla: ${TIPO_LABELS[inc.tipo] ?? inc.tipo}
Hora de inicio: ${new Date(inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
Usuarios afectados: ${inc.usuariosAfectados ?? '—'}
Descripción: ${inc.descripcionInicial ?? '—'}

Descartes realizados:
${inc.descartesRealizados ?? '—'}

Adjuntamos evidencias.
Quedamos atentos a su respuesta.

Service Desk — Footloose Perú
Ticket NetDesk: ${inc.codigo}
RUC: 20427799973`
}

export default function IncidenteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: session } = useSession()

  const [inc, setInc] = useState<any>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [supervisorEdit, setSupervisorEdit] = useState(false)
  const [showReopenModal, setShowReopenModal] = useState(false)
  const [reopenMotivo, setReopenMotivo] = useState('')
  const [reopening, setReopening] = useState(false)
  const [escTimerEdits, setEscTimerEdits] = useState<Record<string, string>>({})
  const [savingTimers, setSavingTimers] = useState(false)

  // Escalation
  const [showEscalarForm, setShowEscalarForm] = useState(false)
  const [escForm, setEscForm] = useState({
    nivel: 1, nivelEscId: '', contactoEscalado: '', emailContacto: '',
    telefonoContacto: '', tiempoEstimadoSolucion: '', cuerpoCorreo: '',
  })
  const [copiedCorreo, setCopiedCorreo] = useState(false)

  const fetchInc = useCallback(async () => {
    const res = await fetch(`/api/incidentes/${id}`)
    const data = await res.json()
    setInc(data)
    setEditForm({
      ticketInvgate: data.ticketInvgate ?? '',
      ticketProveedor: data.ticketProveedor ?? '',
      descartesRealizados: data.descartesRealizados ?? '',
      solucionAplicada: data.solucionAplicada ?? '',
      observaciones: data.observaciones ?? '',
      nivelImpacto: data.nivelImpacto ?? 'MEDIO',
      tipo: data.tipo ?? 'CAIDA_TOTAL',
      estado: data.estado ?? 'ABIERTO',
      usuariosAfectados: data.usuariosAfectados ?? '',
      descripcionInicial: data.descripcionInicial ?? '',
      horaRegistro: toDatetimeLocal(data.horaRegistro),
      horaFin: toDatetimeLocal(data.horaFin),
    })
  }, [id])

  useEffect(() => { fetchInc() }, [fetchInc])

  useEffect(() => {
    if (!inc?.escalamientos) return
    const edits: Record<string, string> = {}
    for (const esc of inc.escalamientos) {
      edits[`${esc.id}-envio`] = toDatetimeLocal(esc.horaEnvioCorreo) ?? ''
      edits[`${esc.id}-resp`]  = toDatetimeLocal(esc.horaRespuesta) ?? ''
    }
    setEscTimerEdits(edits)
  }, [inc])

  // Auto-fill escalation form when nivel changes
  useEffect(() => {
    if (!inc?.nivelesProveedor) return
    const nivelData = inc.nivelesProveedor.find((n: any) => n.nivel === escForm.nivel)
    if (nivelData) {
      const correo = buildCorreo(inc, escForm.nivel, nivelData)
      setEscForm(f => ({
        ...f,
        nivelEscId: nivelData.id,
        contactoEscalado: nivelData.nombreContacto ?? '',
        emailContacto: nivelData.email ?? '',
        telefonoContacto: nivelData.celular ?? '',
        cuerpoCorreo: correo,
      }))
    } else {
      setEscForm(f => ({ ...f, nivelEscId: '', contactoEscalado: '', emailContacto: '', telefonoContacto: '', cuerpoCorreo: buildCorreo(inc, f.nivel, null) }))
    }
  }, [escForm.nivel, inc])

  if (!inc) return (
    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>
      Cargando...
    </div>
  )

  const isClosed  = ['RESUELTO', 'CANCELADO', 'CERRADO'].includes(inc.estado)
  const canManage = can(session, 'incidentes.editar')
  const canBlockA = canManage && supervisorEdit
  const canEdit   = !isClosed || (canManage && supervisorEdit)

  function setEdit(k: string, v: string) { setEditForm((f: any) => ({ ...f, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    const body: any = { ...editForm }
    if ('horaRegistro' in body) body.horaRegistro = fromDatetimeLocal(body.horaRegistro)
    if ('horaFin' in body) body.horaFin = body.horaFin ? fromDatetimeLocal(body.horaFin) : null
    if (body.horaRegistro && body.horaFin) {
      body.mttrMinutos = Math.round((new Date(body.horaFin).getTime() - new Date(body.horaRegistro).getTime()) / 60000)
    } else if (body.horaFin === null) {
      body.mttrMinutos = null
    }
    await fetch(`/api/incidentes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    fetchInc()
  }

  async function handleResolver() {
    if (!confirm('¿Marcar como resuelto? Se registrará la hora actual como fin del incidente.')) return
    await fetch(`/api/incidentes/${id}/resolver`, { method: 'POST' })
    fetchInc()
  }

  async function handleCancelar() {
    if (!confirm('¿Cancelar este incidente?')) return
    await fetch(`/api/incidentes/${id}/cancelar`, { method: 'POST' })
    fetchInc()
  }

  async function handleReopen() {
    setReopening(true)
    await fetch(`/api/incidentes/${id}/reabrir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: reopenMotivo }),
    })
    setReopening(false)
    setShowReopenModal(false)
    setReopenMotivo('')
    fetchInc()
  }

  async function handleEscalar() {
    if (!escForm.contactoEscalado || !escForm.emailContacto) return alert('Completa el contacto y email')
    await fetch(`/api/incidentes/${id}/escalar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(escForm),
    })
    setShowEscalarForm(false)
    fetchInc()
  }

  async function handleEnvioCorreo(escId: string) {
    await fetch(`/api/escalamientos/${escId}/envio`, { method: 'PUT' })
    fetchInc()
  }

  async function handleRespuesta(escId: string) {
    await fetch(`/api/escalamientos/${escId}/respuesta`, { method: 'PUT' })
    fetchInc()
  }

  async function copyCorreo() {
    await navigator.clipboard.writeText(escForm.cuerpoCorreo)
    setCopiedCorreo(true)
    setTimeout(() => setCopiedCorreo(false), 2000)
  }

  async function saveEscTimers() {
    setSavingTimers(true)
    for (const esc of [segundoEsc, tercerEsc].filter(Boolean)) {
      const envio = escTimerEdits[`${esc.id}-envio`] ?? ''
      const resp  = escTimerEdits[`${esc.id}-resp`]  ?? ''
      await fetch(`/api/escalamientos/${esc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          horaEnvioCorreo: envio ? fromDatetimeLocal(envio) : null,
          horaRespuesta:   resp  ? fromDatetimeLocal(resp)  : null,
        }),
      })
    }
    setSavingTimers(false)
    fetchInc()
  }

  // Compute timers
  const primerEsc  = inc.escalamientos?.[0]
  const segundoEsc = inc.escalamientos?.[1]
  const tercerEsc  = inc.escalamientos?.[2]

  // T2: exact Lima time of first email sent
  const horaCorreoT2 = primerEsc?.horaEnvioCorreo
    ? new Date(primerEsc.horaEnvioCorreo).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })
    : '—'

  // T3: if N1 responded → N1 response time; else if 2nd escalation email → "Hasta 2do correo"
  let t3Label = 'T3 — Respuesta N1'
  let t3Value: string
  if (primerEsc?.tiempoRespuestaMin != null) {
    t3Value = minToHM(primerEsc.tiempoRespuestaMin)
  } else if (primerEsc?.horaEnvioCorreo && segundoEsc?.horaEnvioCorreo) {
    t3Label = 'T3 — Hasta 2do correo'
    t3Value = minToHM(Math.round((new Date(segundoEsc.horaEnvioCorreo).getTime() - new Date(primerEsc.horaEnvioCorreo).getTime()) / 60000))
  } else {
    t3Value = '—'
  }

  // T4: from last escalation that has a response → resolution
  const lastEscWithResp = [...(inc.escalamientos ?? [])].reverse().find((e: any) => e.horaRespuesta)
  const tiempoResolucion = inc.horaFin && lastEscWithResp?.horaRespuesta
    ? Math.round((new Date(inc.horaFin).getTime() - new Date(lastEscWithResp.horaRespuesta).getTime()) / 60000)
    : null

  const btnBase: React.CSSProperties = { padding: '7px 14px', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }

  return (
    <div style={{ paddingBottom: '56px' }}>
      {/* ── Back button ── */}
      <button onClick={() => router.push('/incidentes')}
        style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', fontSize: '12px', cursor: 'pointer', padding: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
        ← Volver a incidentes
      </button>

      {/* ── Header ── */}
      <div style={{ background: '#0d1117', borderRadius: '10px', padding: '16px 20px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{inc.codigo}</span>
              <Badge variant={impactoToVariant(inc.nivelImpacto)} />
              <Badge variant={estadoToVariant(inc.estado)} />
              <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', padding: '2px 7px', borderRadius: '4px' }}>
                {TIPO_LABELS[inc.tipo] ?? inc.tipo}
              </span>
              {/* Edit toggle for elevated roles */}
              {isClosed && canManage && (
                <button
                  onClick={() => setSupervisorEdit(v => !v)}
                  title="Editar incidente cerrado"
                  style={{ background: supervisorEdit ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)', border: 'none', color: supervisorEdit ? '#93c5fd' : 'rgba(255,255,255,0.4)', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}
                >
                  ✏ {supervisorEdit ? 'Editando' : 'Editar'}
                </button>
              )}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 500, color: 'white', marginBottom: '4px' }}>
              {inc.tiendaCodigo} — {inc.tiendaNombre}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
              {inc.proveedorNombre} · {inc.tiendaDistrito} · Agente: {inc.agenteNombre}
            </div>
            {inc.actualizadoEn && (
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '5px' }}>
                Última edición: {new Date(inc.actualizadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          <CronometroPrincipal horaRegistro={inc.horaRegistro} horaFin={inc.horaFin} />
        </div>
      </div>

      {inc.proveedorInstruccion && (
        <GuiaEscalamiento proveedor={inc.proveedorNombre} instruccion={inc.proveedorInstruccion} />
      )}

      {/* ── Reopen modal ── */}
      {showReopenModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '400px', margin: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>Reabrir incidente</div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '16px' }}>El incidente volverá a estado ABIERTO y se restablecerá el cronómetro.</div>
            <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)', display: 'block', marginBottom: '6px' }}>Motivo (opcional)</label>
            <textarea
              value={reopenMotivo}
              onChange={e => setReopenMotivo(e.target.value)}
              placeholder="¿Por qué se reabre este incidente?"
              style={{ width: '100%', padding: '8px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--muted)', color: 'var(--foreground)', outline: 'none', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => { setShowReopenModal(false); setReopenMotivo('') }}
                style={{ flex: 1, padding: '8px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleReopen} disabled={reopening}
                style={{ flex: 1, padding: '8px', background: '#92400e', color: '#fde68a', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: reopening ? 'wait' : 'pointer' }}>
                {reopening ? 'Reabriendo...' : 'Confirmar reapertura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '14px' }}>

        {/* ── LEFT COLUMN ── */}
        <div>
          {/* Block A — editable by managers when supervisorEdit is on */}
          <SectionCard title="A — Identificación & Tiempos">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <div>
                <FieldRow label="Tienda"><ReadonlyVal value={`${inc.tiendaCodigo} — ${inc.tiendaNombre}`} /></FieldRow>
                <FieldRow label="Proveedor"><ReadonlyVal value={inc.proveedorNombre} /></FieldRow>
                <FieldRow label="CID / Servicio"><ReadonlyVal value={inc.tiendaCid} mono /></FieldRow>
                <FieldRow label="Tipo conexión"><ReadonlyVal value={inc.tiendaTipoConexion} /></FieldRow>

                <FieldRow label="Nivel de impacto">
                  {canBlockA ? (
                    <select style={inputStyle()} value={editForm.nivelImpacto} onChange={e => setEdit('nivelImpacto', e.target.value)}>
                      {['ALTO','MEDIO','BAJO'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px' }}>
                      <Badge variant={impactoToVariant(inc.nivelImpacto)} />
                      <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{inc.nivelImpacto}</span>
                    </div>
                  )}
                </FieldRow>

                <FieldRow label="Tipo">
                  {canBlockA ? (
                    <select style={inputStyle()} value={editForm.tipo} onChange={e => setEdit('tipo', e.target.value)}>
                      {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  ) : (
                    <ReadonlyVal value={TIPO_LABELS[inc.tipo] ?? inc.tipo} />
                  )}
                </FieldRow>

                <FieldRow label="Estado">
                  {canBlockA ? (
                    <select style={inputStyle()} value={editForm.estado} onChange={e => setEdit('estado', e.target.value)}>
                      {['ABIERTO','EN_SEGUIMIENTO','ESCALADO_N1','ESCALADO_N2','ESCALADO_N3','RESUELTO','CERRADO','CANCELADO'].map(v => <option key={v} value={v}>{v.replace(/_/g,' ')}</option>)}
                    </select>
                  ) : (
                    <div style={{ paddingTop: '4px' }}><Badge variant={estadoToVariant(inc.estado)} /></div>
                  )}
                </FieldRow>

                <FieldRow label="Usuarios">
                  {canBlockA ? (
                    <input style={inputStyle()} value={editForm.usuariosAfectados} onChange={e => setEdit('usuariosAfectados', e.target.value)} placeholder="N.º usuarios afectados" />
                  ) : (
                    <ReadonlyVal value={inc.usuariosAfectados ?? '—'} />
                  )}
                </FieldRow>

                <FieldRow label="Descripción inicial">
                  {canBlockA ? (
                    <textarea style={textareaStyle()} value={editForm.descripcionInicial} onChange={e => setEdit('descripcionInicial', e.target.value)} placeholder="Descripción del incidente..." />
                  ) : (
                    <ReadonlyVal value={inc.descripcionInicial ?? '—'} />
                  )}
                </FieldRow>

                {inc.reabiertaInfo && (
                  <FieldRow label="Reapertura">
                    <div style={{ padding: '7px 10px', fontSize: '11px', background: 'rgba(146,64,14,0.1)', border: '0.5px solid rgba(146,64,14,0.25)', borderRadius: '8px', color: '#d97706' }}>
                      {inc.reabiertaInfo}
                    </div>
                  </FieldRow>
                )}
              </div>
              <div>
                <FieldRow label="Registrado por"><ReadonlyVal value={inc.agenteNombre} /></FieldRow>

                <FieldRow label="Hora registro">
                  {canBlockA ? (
                    <input type="datetime-local" style={inputStyle()} value={editForm.horaRegistro} onChange={e => setEdit('horaRegistro', e.target.value)} />
                  ) : (
                    <ReadonlyVal value={new Date(inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima' })} />
                  )}
                </FieldRow>

                <FieldRow label="Hora fin">
                  {canBlockA ? (
                    <input type="datetime-local" style={inputStyle()} value={editForm.horaFin} onChange={e => setEdit('horaFin', e.target.value)} />
                  ) : (
                    <ReadonlyVal value={inc.horaFin ? new Date(inc.horaFin).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '—'} />
                  )}
                </FieldRow>

                <FieldRow label="MTTR total"><ReadonlyVal value={minToHM(inc.mttrMinutos)} /></FieldRow>

                {/* 4 timers */}
                <div style={{ marginTop: '8px', padding: '10px 12px', background: 'var(--muted)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Tiempos del incidente</div>
                  {[
                    { label: 'T1 — Duración total', value: minToHM(inc.mttrMinutos) },
                    { label: 'T2 — 1er correo enviado', value: horaCorreoT2 },
                    { label: t3Label, value: t3Value },
                    { label: 'T4 — Respuesta a solución', value: minToHM(tiempoResolucion) },
                  ].map(t => (
                    <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{t.label}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 500, color: t.value === '—' ? 'var(--muted-foreground)' : 'var(--foreground)' }}>{t.value}</span>
                    </div>
                  ))}
                  {canManage && supervisorEdit && (segundoEsc || tercerEsc) && (
                    <>
                      <div style={{ borderTop: '0.5px solid var(--border)', margin: '8px 0 6px' }} />
                      {([
                        segundoEsc ? { escId: segundoEsc.id, label: '2do correo enviado', field: 'envio' } : null,
                        segundoEsc ? { escId: segundoEsc.id, label: 'Respuesta N2',        field: 'resp'  } : null,
                        tercerEsc  ? { escId: tercerEsc.id,  label: '3er correo enviado', field: 'envio' } : null,
                        tercerEsc  ? { escId: tercerEsc.id,  label: 'Respuesta N3',        field: 'resp'  } : null,
                      ].filter(Boolean) as { escId: string; label: string; field: string }[]).map(row => (
                        <div key={`${row.escId}-${row.field}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', gap: '8px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', flexShrink: 0 }}>{row.label}</span>
                          <input
                            type="datetime-local"
                            value={escTimerEdits[`${row.escId}-${row.field}`] ?? ''}
                            onChange={e => setEscTimerEdits(p => ({ ...p, [`${row.escId}-${row.field}`]: e.target.value }))}
                            style={{ fontSize: '10px', border: '0.5px solid var(--border)', borderRadius: '4px', background: 'var(--card)', color: 'var(--foreground)', padding: '2px 4px', maxWidth: '160px' }}
                          />
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                        <button onClick={saveEscTimers} disabled={savingTimers}
                          style={{ padding: '3px 10px', fontSize: '10px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                          {savingTimers ? '...' : 'Guardar tiempos'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Block B — Gestión */}
          <SectionCard title="B — Gestión">
            <FieldRow label="Ticket Invgate">
              <input disabled={!canEdit} style={inputStyle(!canEdit)} value={editForm.ticketInvgate} onChange={e => setEdit('ticketInvgate', e.target.value)} placeholder="Ej: 12345" />
            </FieldRow>
            <FieldRow label="Ticket proveedor">
              <input disabled={!canEdit} style={inputStyle(!canEdit)} value={editForm.ticketProveedor} onChange={e => setEdit('ticketProveedor', e.target.value)} placeholder="Nro. de ticket del proveedor" />
            </FieldRow>
            <FieldRow label="Descartes realizados">
              <textarea disabled={!canEdit} style={textareaStyle(!canEdit)} value={editForm.descartesRealizados} onChange={e => setEdit('descartesRealizados', e.target.value)} placeholder="Describe los descartes y verificaciones realizados..." />
            </FieldRow>
            <FieldRow label="Solución aplicada">
              <textarea disabled={!canEdit} style={textareaStyle(!canEdit)} value={editForm.solucionAplicada} onChange={e => setEdit('solucionAplicada', e.target.value)} placeholder="Describe la solución aplicada..." />
            </FieldRow>
            <FieldRow label="Observaciones">
              <textarea disabled={!canEdit} style={textareaStyle(!canEdit)} value={editForm.observaciones} onChange={e => setEdit('observaciones', e.target.value)} placeholder="Notas adicionales..." />
            </FieldRow>

            <div style={{ borderTop: '0.5px solid var(--border)', marginTop: '10px', paddingTop: '12px' }}>
              <AdjuntosZona incidenteId={id} disabled={!canEdit} />
            </div>

            {(canEdit || canBlockA) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button onClick={handleSave} disabled={saving} style={{ ...btnBase, background: 'hsl(221,83%,23%)', color: 'white' }}>
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            )}
          </SectionCard>

          {/* Resolve / Cancel */}
          {!isClosed && (
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button onClick={handleCancelar} style={{ ...btnBase, background: 'var(--muted)', border: '0.5px solid var(--border)', fontWeight: 400 }}>
                Cancelar incidente
              </button>
              <button onClick={handleResolver} style={{ ...btnBase, background: '#14532d', color: '#86efac' }}>
                Marcar como resuelto
              </button>
            </div>
          )}

          {/* Reopen button */}
          {isClosed && inc.estado !== 'CANCELADO' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button onClick={() => setShowReopenModal(true)}
                style={{ ...btnBase, background: 'rgba(133,79,11,0.15)', color: '#d97706', border: '0.5px solid rgba(133,79,11,0.3)' }}>
                Reabrir incidente
              </button>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div>
          <SectionCard
            title="D — Escalamientos"
            action={!isClosed ? (
              <button onClick={() => setShowEscalarForm(v => !v)}
                style={{ ...btnBase, padding: '4px 10px', background: 'hsl(221,83%,23%)', color: 'white', fontSize: '11px' }}>
                + Agregar nivel
              </button>
            ) : undefined}
          >
            {/* Escalation form */}
            {showEscalarForm && (
              <div style={{ marginBottom: '14px', padding: '12px', background: 'var(--muted)', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '10px' }}>Nuevo escalamiento</div>

                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Nivel</label>
                  <select style={{ ...inputStyle(), marginTop: '0' }} value={escForm.nivel}
                    onChange={e => setEscForm(f => ({ ...f, nivel: Number(e.target.value) }))}>
                    {[1, 2, 3, 4].map(n => <option key={n} value={n}>Nivel {n}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Contacto</label>
                  <input style={inputStyle()} value={escForm.contactoEscalado}
                    onChange={e => setEscForm(f => ({ ...f, contactoEscalado: e.target.value }))} placeholder="Nombre del contacto" />
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Email</label>
                  <input style={inputStyle()} value={escForm.emailContacto}
                    onChange={e => setEscForm(f => ({ ...f, emailContacto: e.target.value }))} placeholder="email@proveedor.com" />
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Teléfono / WhatsApp</label>
                  <input style={inputStyle()} value={escForm.telefonoContacto}
                    onChange={e => setEscForm(f => ({ ...f, telefonoContacto: e.target.value }))} placeholder="+51 9XX XXX XXX" />
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Tiempo estimado de solución</label>
                  <input style={inputStyle()} value={escForm.tiempoEstimadoSolucion}
                    onChange={e => setEscForm(f => ({ ...f, tiempoEstimadoSolucion: e.target.value }))} placeholder="Ej: 2 horas, antes de las 3pm" />
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Borrador de correo</label>
                    <button onClick={copyCorreo} style={{ fontSize: '10px', padding: '2px 8px', background: copiedCorreo ? '#14532d' : 'transparent', color: copiedCorreo ? '#86efac' : 'var(--muted-foreground)', border: '0.5px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                      {copiedCorreo ? '✓ Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <textarea
                    value={escForm.cuerpoCorreo}
                    onChange={e => setEscForm(f => ({ ...f, cuerpoCorreo: e.target.value }))}
                    style={{ ...inputStyle(), minHeight: '140px', fontSize: '10px', lineHeight: 1.55, resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setShowEscalarForm(false)}
                    style={{ flex: 1, padding: '7px', background: 'transparent', border: '0.5px solid var(--border)', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button onClick={handleEscalar}
                    style={{ flex: 1, padding: '7px', background: '#854F0B', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}>
                    Escalar →
                  </button>
                </div>
              </div>
            )}

            {/* Escalation list */}
            {(!inc.escalamientos || inc.escalamientos.length === 0) && !showEscalarForm && (
              <div style={{ textAlign: 'center', padding: '20px', fontSize: '11px', color: 'var(--muted-foreground)' }}>Sin escalamientos</div>
            )}

            {inc.escalamientos?.map((esc: any) => (
              <EscalamientoCard
                key={esc.id}
                esc={esc}
                isClosed={isClosed}
                onEnvio={() => handleEnvioCorreo(esc.id)}
                onRespuesta={() => handleRespuesta(esc.id)}
              />
            ))}
          </SectionCard>
        </div>
      </div>

      {/* ── Sticky back button ── */}
      <div style={{ position: 'fixed', bottom: 0, left: '192px', right: 0, zIndex: 40, background: 'var(--card)', borderTop: '0.5px solid var(--border)', padding: '10px 18px' }}>
        <button onClick={() => router.push('/incidentes')}
          style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ← Volver a incidentes
        </button>
      </div>
    </div>
  )
}

function EscalamientoCard({ esc, isClosed, onEnvio, onRespuesta }: {
  esc: any; isClosed: boolean
  onEnvio: () => void; onRespuesta: () => void
}) {
  const [showCorreo, setShowCorreo] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(esc.cuerpoCorreo ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const horaCreado = new Date(esc.creadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })

  return (
    <div style={{ marginBottom: '12px', padding: '12px', background: 'var(--muted)', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600 }}>Nivel {esc.nivel} — {esc.contactoEscalado}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>{esc.emailContacto}</div>
          {esc.telefonoContacto && (
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>📞 {esc.telefonoContacto}</div>
          )}
        </div>
        <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textAlign: 'right' }}>
          {horaCreado}
        </div>
      </div>

      {esc.tiempoEstimadoSolucion && (
        <div style={{ fontSize: '10px', marginBottom: '8px', padding: '4px 8px', background: 'rgba(133,79,11,0.12)', borderRadius: '4px', color: '#854F0B' }}>
          ⏱ Estimado: {esc.tiempoEstimadoSolucion}
        </div>
      )}

      <CronometroEscalamiento horaEnvio={esc.horaEnvioCorreo} horaRespuesta={esc.horaRespuesta} />

      {/* Correo borrador collapsible */}
      {esc.cuerpoCorreo && (
        <div style={{ marginTop: '8px' }}>
          <button onClick={() => setShowCorreo(v => !v)}
            style={{ fontSize: '10px', color: 'var(--muted-foreground)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
            {showCorreo ? 'Ocultar borrador' : 'Ver borrador de correo'}
          </button>
          {showCorreo && (
            <div style={{ marginTop: '6px' }}>
              <pre style={{ fontSize: '9px', whiteSpace: 'pre-wrap', background: 'var(--card)', padding: '8px', borderRadius: '6px', color: 'var(--foreground)', lineHeight: 1.55, margin: 0 }}>
                {esc.cuerpoCorreo}
              </pre>
              <button onClick={copy}
                style={{ marginTop: '4px', fontSize: '10px', padding: '3px 10px', background: copied ? '#14532d' : 'transparent', color: copied ? '#86efac' : 'var(--muted-foreground)', border: '0.5px solid var(--border)', borderRadius: '5px', cursor: 'pointer' }}>
                {copied ? '✓ Copiado' : 'Copiar correo'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!esc.horaEnvioCorreo && !isClosed && (
        <button onClick={onEnvio}
          style={{ width: '100%', marginTop: '8px', padding: '7px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}>
          Correo enviado → iniciar cronómetro
        </button>
      )}
      {esc.horaEnvioCorreo && !esc.horaRespuesta && !isClosed && (
        <button onClick={onRespuesta}
          style={{ width: '100%', marginTop: '8px', padding: '7px', background: '#14532d', color: '#86efac', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}>
          Registrar primera respuesta
        </button>
      )}
      {esc.horaRespuesta && (
        <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--muted-foreground)', textAlign: 'center' }}>
          Respondido en {esc.tiempoRespuestaMin}m · {new Date(esc.horaRespuesta).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}
