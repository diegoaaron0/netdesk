'use client'
import { useEffect, useState, use, useCallback, useRef } from 'react'
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

// ── Helpers ──────────────────────────────────────────────────────────────────
function iStyle(dis?: boolean): React.CSSProperties {
  return { width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: dis ? 'var(--muted)' : 'var(--card)', color: dis ? 'var(--muted-foreground)' : 'var(--foreground)', outline: 'none' }
}
function taStyle(dis?: boolean): React.CSSProperties {
  return { ...iStyle(dis), minHeight: '72px', resize: 'vertical' as const, fontFamily: 'inherit' }
}

function toDatetimeLocal(iso: string | null | undefined) {
  if (!iso) return ''
  const lima = new Date(new Date(iso).getTime() - 5 * 3600000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${lima.getUTCFullYear()}-${p(lima.getUTCMonth()+1)}-${p(lima.getUTCDate())}T${p(lima.getUTCHours())}:${p(lima.getUTCMinutes())}`
}
function fromDatetimeLocal(val: string) {
  if (!val) return null
  return new Date(val + ':00-05:00').toISOString()
}
function minToHM(min: number | null) {
  if (!min) return '—'
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function mttrFromHoras(h1: string, h2: string) {
  return Math.round((new Date(h2).getTime() - new Date(h1).getTime()) / 60000)
}

function buildCorreo(inc: any, nivelData: any) {
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

// ── Small icon set ────────────────────────────────────────────────────────────
const IcoStore  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
const IcoWifi   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
const IcoCid    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
const IcoConn   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
const IcoClust  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
const IcoImpact = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
const IcoType   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
const IcoUsers  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
const IcoStatus = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
const IcoClock  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const IcoEdit   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IcoArrow  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
const IcoExt    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
const IcoLayers = () => <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.35"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 12l10 5 10-5"/><path d="M2 17l10 5 10-5"/></svg>

function ResumenRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: '22px', flexShrink: 0, color: 'var(--muted-foreground)' }}>{icon}</div>
      <div style={{ width: '130px', flexShrink: 0, fontSize: '11px', color: 'var(--muted-foreground)' }}>{label}</div>
      <div style={{ flex: 1, fontSize: '12px', fontWeight: 500, color: 'var(--foreground)' }}>{children}</div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', alignItems: 'start', gap: '8px', marginBottom: '10px' }}>
      <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)', paddingTop: '7px' }}>{label}</label>
      <div>{children}</div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function IncidenteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router  = useRouter()
  const { data: session } = useSession()
  const escRef  = useRef<HTMLDivElement>(null)

  const [inc, setInc]               = useState<any>(null)
  const [historial, setHistorial]   = useState<any[]>([])
  const [editForm, setEditForm]     = useState<any>({})
  const [saving, setSaving]         = useState(false)
  const [supervisorEdit, setSupervisorEdit] = useState(false)
  const [showReopenModal, setShowReopenModal] = useState(false)
  const [reopenMotivo, setReopenMotivo] = useState('')
  const [reopening, setReopening]   = useState(false)

  // Escalamiento
  const [showEscalarForm, setShowEscalarForm] = useState(false)
  const [escForm, setEscForm] = useState({
    nivel: 1, nivelEscId: '', contactoEscalado: '', emailContacto: '',
    telefonoContacto: '', tiempoEstimadoSolucion: '', cuerpoCorreo: '',
  })
  const [copiedCorreo, setCopiedCorreo] = useState(false)

  const fetchInc = useCallback(async () => {
    const res  = await fetch(`/api/incidentes/${id}`)
    const data = await res.json()
    setInc(data)
    setEditForm({
      ticketInvgate:       data.ticketInvgate       ?? '',
      ticketProveedor:     data.ticketProveedor     ?? '',
      descartesRealizados: data.descartesRealizados ?? '',
      solucionAplicada:    data.solucionAplicada    ?? '',
      observaciones:       data.observaciones       ?? '',
      nivelImpacto:        data.nivelImpacto        ?? 'ALTO',
      tipo:                data.tipo                ?? 'CAIDA_TOTAL',
      tipoPersonalizado:   data.tipoPersonalizado   ?? '',
      otrosClasificacion:  data.otrosClasificacion  ?? '',
      estado:              data.estado              ?? 'ABIERTO',
      usuariosAfectados:   data.usuariosAfectados   ?? '',
      descripcionInicial:  data.descripcionInicial  ?? '',
      horaRegistro:        toDatetimeLocal(data.horaRegistro),
      horaFin:             toDatetimeLocal(data.horaFin),
    })
  }, [id])

  useEffect(() => { fetchInc() }, [fetchInc])

  useEffect(() => {
    if (!inc?.tiendaId) return
    fetch(`/api/tiendas/${inc.tiendaId}/historial`)
      .then(r => r.json())
      .then(d => setHistorial(Array.isArray(d) ? d.filter((h: any) => h.id !== inc.id) : []))
  }, [inc?.tiendaId, inc?.id])

  useEffect(() => {
    if (!inc?.nivelesProveedor) return
    const nivelData = inc.nivelesProveedor.find((n: any) => n.nivel === escForm.nivel)
    setEscForm(f => ({
      ...f,
      nivelEscId:       nivelData?.id            ?? '',
      contactoEscalado: nivelData?.nombreContacto ?? '',
      emailContacto:    nivelData?.email          ?? '',
      telefonoContacto: nivelData?.celular        ?? '',
      cuerpoCorreo:     buildCorreo(inc, nivelData),
    }))
  }, [escForm.nivel, inc])

  if (!inc) return (
    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Cargando...</div>
  )

  const userEmail  = (session?.user as any)?.email
  const isClosed   = ['RESUELTO', 'CANCELADO', 'CERRADO'].includes(inc.estado)
  const canManage  = can(session, 'incidentes.editar')
  const isMyInc    = userEmail === inc.agenteEmail
  const canEditB   = canManage || (isMyInc && !isClosed)
  const canEditA   = canManage && supervisorEdit

  function setEdit(k: string, v: string) { setEditForm((f: any) => ({ ...f, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    const body: any = { ...editForm }
    if ('horaRegistro' in body) body.horaRegistro = fromDatetimeLocal(body.horaRegistro)
    if ('horaFin' in body) body.horaFin = body.horaFin ? fromDatetimeLocal(body.horaFin) : null
    if (body.horaRegistro && body.horaFin) {
      body.mttrMinutos = mttrFromHoras(body.horaRegistro, body.horaFin)
    } else if (body.horaFin === null) {
      body.mttrMinutos = null
    }
    await fetch(`/api/incidentes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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
    await fetch(`/api/incidentes/${id}/reabrir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: reopenMotivo }) })
    setReopening(false); setShowReopenModal(false); setReopenMotivo('')
    fetchInc()
  }

  async function handleEscalar() {
    if (!escForm.contactoEscalado || !escForm.emailContacto) return alert('Completa el contacto y email')
    await fetch(`/api/incidentes/${id}/escalar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(escForm) })
    setShowEscalarForm(false)
    fetchInc()
  }

  function openEscalarForm() {
    setShowEscalarForm(true)
    setTimeout(() => escRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  async function copyCorreo() {
    await navigator.clipboard.writeText(escForm.cuerpoCorreo)
    setCopiedCorreo(true); setTimeout(() => setCopiedCorreo(false), 2000)
  }

  // Timers T1–T4
  const primerEsc  = inc.escalamientos?.[0]
  const segundoEsc = inc.escalamientos?.[1]
  const horaCorreoT2 = primerEsc?.horaEnvioCorreo
    ? new Date(primerEsc.horaEnvioCorreo).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })
    : '—'
  let t3Label = 'T3 — Respuesta N1'
  let t3Value: string
  if (primerEsc?.tiempoRespuestaMin != null) {
    t3Value = minToHM(primerEsc.tiempoRespuestaMin)
  } else if (primerEsc?.horaEnvioCorreo && segundoEsc?.horaEnvioCorreo) {
    t3Label = 'T3 — Hasta 2do correo'
    t3Value = minToHM(mttrFromHoras(primerEsc.horaEnvioCorreo, segundoEsc.horaEnvioCorreo))
  } else {
    t3Value = '—'
  }
  const lastEscWithResp = [...(inc.escalamientos ?? [])].reverse().find((e: any) => e.horaRespuesta)
  const tiempoResolucion = inc.horaFin && lastEscWithResp?.horaRespuesta
    ? mttrFromHoras(lastEscWithResp.horaRespuesta, inc.horaFin) : null

  const btn: React.CSSProperties = { padding: '8px 16px', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }

  return (
    <div style={{ paddingBottom: '64px' }}>

      {/* ── Header ── */}
      <div style={{ background: '#0d1117', borderRadius: '12px', padding: '18px 22px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{inc.codigo}</span>
              <Badge variant={impactoToVariant(inc.nivelImpacto)} />
              <Badge variant={estadoToVariant(inc.estado)} />
              <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', padding: '2px 8px', borderRadius: '4px' }}>
                {TIPO_LABELS[inc.tipo] ?? inc.tipo}
              </span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: 'white', marginBottom: '4px', lineHeight: 1.2 }}>
              {inc.tiendaCodigo} — {inc.tiendaNombre}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.38)' }}>
              {inc.proveedorNombre} · {inc.tiendaDistrito} · Agente: {inc.agenteNombre}
            </div>
            {inc.actualizadoEn && (
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.18)', marginTop: '5px' }}>
                Última edición: {new Date(inc.actualizadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          <CronometroPrincipal horaRegistro={inc.horaRegistro} horaFin={inc.horaFin} />
        </div>
      </div>

      {/* Guía */}
      {inc.proveedorInstruccion && (
        <GuiaEscalamiento proveedor={inc.proveedorNombre} instruccion={inc.proveedorInstruccion} />
      )}

      {/* ── Reopen modal ── */}
      {showReopenModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '400px', margin: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>Reabrir incidente</div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '16px' }}>El incidente volverá a estado ABIERTO y se restablecerá el cronómetro.</div>
            <textarea value={reopenMotivo} onChange={e => setReopenMotivo(e.target.value)}
              placeholder="¿Por qué se reabre este incidente?"
              style={{ width: '100%', padding: '8px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--muted)', color: 'var(--foreground)', outline: 'none', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => { setShowReopenModal(false); setReopenMotivo('') }}
                style={{ flex: 1, padding: '8px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleReopen} disabled={reopening}
                style={{ flex: 1, padding: '8px', background: '#92400e', color: '#fde68a', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: reopening ? 'wait' : 'pointer' }}>
                {reopening ? 'Reabriendo...' : 'Confirmar reapertura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '16px', alignItems: 'start' }}>

        {/* LEFT — Block B */}
        <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>B — Gestión</div>
          </div>
          <div style={{ padding: '16px 18px' }}>
            <FieldRow label="Ticket Invgate">
              <input disabled={!canEditB} style={iStyle(!canEditB)} value={editForm.ticketInvgate} onChange={e => setEdit('ticketInvgate', e.target.value)} placeholder="Ej: 12345" />
            </FieldRow>
            <FieldRow label="Ticket proveedor">
              <input disabled={!canEditB} style={iStyle(!canEditB)} value={editForm.ticketProveedor} onChange={e => setEdit('ticketProveedor', e.target.value)} placeholder="Nro. de ticket del proveedor" />
            </FieldRow>
            <FieldRow label="Descartes realizados">
              <textarea disabled={!canEditB} style={taStyle(!canEditB)} value={editForm.descartesRealizados} onChange={e => setEdit('descartesRealizados', e.target.value)} placeholder="Describe los descartes y verificaciones realizados..." />
            </FieldRow>
            <FieldRow label="Solución aplicada">
              <textarea disabled={!canEditB} style={taStyle(!canEditB)} value={editForm.solucionAplicada} onChange={e => setEdit('solucionAplicada', e.target.value)} placeholder="Describe la solución aplicada..." />
            </FieldRow>
            <FieldRow label="Observaciones">
              <textarea disabled={!canEditB} style={taStyle(!canEditB)} value={editForm.observaciones} onChange={e => setEdit('observaciones', e.target.value)} placeholder="Notas adicionales..." />
            </FieldRow>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: '10px', paddingTop: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: '8px' }}>Adjuntos</div>
              <AdjuntosZona incidenteId={id} disabled={!canEditB} />
            </div>

            {inc.reabiertaInfo && (
              <div style={{ marginTop: '12px', padding: '8px 12px', fontSize: '11px', background: 'rgba(146,64,14,0.1)', border: '1px solid rgba(146,64,14,0.25)', borderRadius: '8px', color: '#d97706' }}>
                {inc.reabiertaInfo}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Resumen + Historial */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Resumen del incidente */}
          <div style={{ background: 'var(--card)', border: '2px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>Resumen del incidente</div>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>Información del incidente registrado.</div>
              </div>
              {canManage && (
                <button onClick={() => setSupervisorEdit(v => !v)}
                  title={supervisorEdit ? 'Salir de edición' : 'Editar campos'}
                  style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', borderRadius: '6px', background: supervisorEdit ? 'hsl(221,83%,45%)' : 'var(--card)', color: supervisorEdit ? 'white' : 'var(--muted-foreground)', cursor: 'pointer' }}>
                  <IcoEdit />
                </button>
              )}
            </div>
            <div style={{ padding: '12px 16px' }}>
              <ResumenRow icon={<IcoStore />} label="Tienda">{inc.tiendaCodigo} — {inc.tiendaNombre}</ResumenRow>
              <ResumenRow icon={<IcoWifi />} label="Proveedor">{inc.proveedorNombre ?? '—'}</ResumenRow>
              <ResumenRow icon={<IcoCid />} label="CID / Servicio"><span style={{ fontFamily: 'monospace' }}>{inc.tiendaCid ?? '—'}</span></ResumenRow>
              <ResumenRow icon={<IcoConn />} label="Tipo de conexión">{inc.tiendaTipoConexion ?? '—'}</ResumenRow>
              <ResumenRow icon={<IcoClust />} label="Cluster">{inc.tiendaCluster ?? '—'}</ResumenRow>

              <ResumenRow icon={<IcoImpact />} label="Nivel de impacto">
                {canEditA ? (
                  <select style={{ ...iStyle(), fontSize: '11px', padding: '4px 6px' }} value={editForm.nivelImpacto} onChange={e => setEdit('nivelImpacto', e.target.value)}>
                    {['ALTO','MEDIO','BAJO'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : <Badge variant={impactoToVariant(inc.nivelImpacto)} />}
              </ResumenRow>

              <ResumenRow icon={<IcoType />} label="Tipo de incidente">
                {canEditA ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <select style={{ ...iStyle(), fontSize: '11px', padding: '4px 6px' }} value={editForm.tipo} onChange={e => setEdit('tipo', e.target.value)}>
                      {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    {editForm.tipo === 'OTROS' && (
                      <>
                        <input style={{ ...iStyle(), fontSize: '11px', padding: '4px 6px' }} placeholder="Describe brevemente el problema" value={editForm.tipoPersonalizado} onChange={e => setEdit('tipoPersonalizado', e.target.value)} />
                        <select style={{ ...iStyle(), fontSize: '11px', padding: '4px 6px' }} value={editForm.otrosClasificacion} onChange={e => setEdit('otrosClasificacion', e.target.value)}>
                          <option value="">Sin clasificar</option>
                          <option value="Energía">Energía</option>
                          <option value="Router / Equipo">Router / Equipo</option>
                          <option value="Sistema / Software">Sistema / Software</option>
                          <option value="Cableado">Cableado</option>
                          <option value="Usuario">Usuario</option>
                          <option value="No clasificado">No clasificado</option>
                        </select>
                      </>
                    )}
                  </div>
                ) : (
                  <div>
                    <div>{TIPO_LABELS[inc.tipo] ?? inc.tipo}</div>
                    {inc.tipo === 'OTROS' && inc.tipoPersonalizado && (
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>{inc.tipoPersonalizado}</div>
                    )}
                    {inc.tipo === 'OTROS' && (inc.otrosClasificacion || inc.tipoPersonalizado) && (
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>
                        {inc.otrosClasificacion || 'Sin clasificar'}
                      </div>
                    )}
                  </div>
                )}
              </ResumenRow>

              <ResumenRow icon={<IcoUsers />} label="Usuarios afectados">
                {canEditA ? (
                  <input style={{ ...iStyle(), fontSize: '11px', padding: '4px 6px' }} value={editForm.usuariosAfectados} onChange={e => setEdit('usuariosAfectados', e.target.value)} />
                ) : (inc.usuariosAfectados ?? '—')}
              </ResumenRow>

              <ResumenRow icon={<IcoStatus />} label="Estado">
                {canEditA ? (
                  <select style={{ ...iStyle(), fontSize: '11px', padding: '4px 6px' }} value={editForm.estado} onChange={e => setEdit('estado', e.target.value)}>
                    {['ABIERTO','EN_SEGUIMIENTO','ESCALADO_N1','ESCALADO_N2','ESCALADO_N3','RESUELTO','CERRADO','CANCELADO'].map(v => <option key={v} value={v}>{v.replace(/_/g,' ')}</option>)}
                  </select>
                ) : <Badge variant={estadoToVariant(inc.estado)} />}
              </ResumenRow>

              {/* Tiempos */}
              <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--muted)', borderRadius: '8px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Tiempos del incidente</div>
                {[
                  { label: 'T1 — Duración total',        value: minToHM(inc.mttrMinutos) },
                  { label: 'T2 — 1er correo enviado',    value: horaCorreoT2 },
                  { label: t3Label,                       value: t3Value },
                  { label: 'T4 — Respuesta a solución',  value: minToHM(tiempoResolucion) },
                ].map(t => (
                  <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{t.label}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 500, color: t.value === '—' ? 'var(--muted-foreground)' : 'var(--foreground)' }}>{t.value}</span>
                  </div>
                ))}

                {/* Hora registro / fin (editable by supervisor) */}
                {canEditA && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0 6px' }} />
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>Hora registro</div>
                    <input type="datetime-local" style={{ ...iStyle(), fontSize: '10px', padding: '4px 6px', marginBottom: '6px' }} value={editForm.horaRegistro} onChange={e => setEdit('horaRegistro', e.target.value)} />
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>Hora fin</div>
                    <input type="datetime-local" style={{ ...iStyle(), fontSize: '10px', padding: '4px 6px' }} value={editForm.horaFin} onChange={e => setEdit('horaFin', e.target.value)} />
                  </>
                )}
                {!canEditA && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0 6px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <IcoClock />
                      <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
                        {new Date(inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {inc.horaFin ? ` → ${new Date(inc.horaFin).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}` : ''}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Historial reciente */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Historial reciente de la tienda</div>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>Últimos incidentes registrados en esta tienda.</div>
              </div>
              {inc.tiendaId && (
                <a href={`/mantenimiento/${inc.tiendaId}`}
                  onClick={e => { e.preventDefault(); router.push(`/mantenimiento/${inc.tiendaId}`) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'hsl(221,83%,50%)', textDecoration: 'none', whiteSpace: 'nowrap', marginTop: '2px' }}>
                  Ver historial completo <IcoExt />
                </a>
              )}
            </div>
            <div style={{ padding: '0 16px' }}>
              {historial.length === 0 ? (
                <div style={{ padding: '14px 0', fontSize: '11px', color: 'var(--muted-foreground)', textAlign: 'center' }}>Sin incidentes previos</div>
              ) : historial.map((h: any, idx: number) => {
                const mttr = h.mttrMinutos ? minToHM(h.mttrMinutos)
                  : (h.horaFin ? minToHM(mttrFromHoras(h.horaRegistro, h.horaFin)) : null)
                return (
                  <div key={h.id} onClick={() => router.push(`/incidentes/${h.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 0', borderBottom: idx < historial.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
                    <div style={{ flexShrink: 0 }}><Badge variant={estadoToVariant(h.estado)} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600 }}>{h.codigo}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>
                        {new Date(h.horaRegistro).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' })}
                        {' · '}{new Date(h.horaRegistro).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', textAlign: 'right', flexShrink: 0 }}>
                      <div>{TIPO_LABELS[h.tipo] ?? h.tipo}</div>
                      {mttr && <div style={{ color: 'var(--foreground)', fontWeight: 500 }}>{mttr}</div>}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{h.agenteName ?? '—'}</div>
                    <div style={{ color: 'var(--muted-foreground)', flexShrink: 0 }}><IcoArrow /></div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>{/* end RIGHT */}
      </div>{/* end main grid */}

      {/* ── Block D — Escalamientos ── */}
      <div ref={escRef} style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', marginTop: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>D — Escalamientos</div>
          {!isClosed && (
            <button onClick={() => setShowEscalarForm(v => !v)}
              style={{ padding: '5px 12px', background: showEscalarForm ? 'var(--muted)' : 'hsl(221,83%,45%)', color: showEscalarForm ? 'var(--foreground)' : 'white', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
              + Agregar nivel
            </button>
          )}
        </div>

        <div style={{ padding: '16px 18px' }}>
          {/* Escalation form */}
          {showEscalarForm && (
            <div style={{ marginBottom: '16px', padding: '14px', background: 'var(--muted)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>Nuevo escalamiento</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Nivel</label>
                  <select style={iStyle()} value={escForm.nivel} onChange={e => setEscForm(f => ({ ...f, nivel: Number(e.target.value) }))}>
                    {[1,2,3,4].map(n => <option key={n} value={n}>Nivel {n}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Tiempo estimado de solución</label>
                  <input style={iStyle()} value={escForm.tiempoEstimadoSolucion} onChange={e => setEscForm(f => ({ ...f, tiempoEstimadoSolucion: e.target.value }))} placeholder="Ej: 2 horas, antes de las 3pm" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Contacto</label>
                  <input style={iStyle()} value={escForm.contactoEscalado} onChange={e => setEscForm(f => ({ ...f, contactoEscalado: e.target.value }))} placeholder="Nombre del contacto" />
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Email</label>
                  <input style={iStyle()} value={escForm.emailContacto} onChange={e => setEscForm(f => ({ ...f, emailContacto: e.target.value }))} placeholder="email@proveedor.com" />
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Teléfono / WhatsApp</label>
                  <input style={iStyle()} value={escForm.telefonoContacto} onChange={e => setEscForm(f => ({ ...f, telefonoContacto: e.target.value }))} placeholder="+51 9XX XXX XXX" />
                </div>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Borrador de correo</label>
                  <button onClick={copyCorreo} style={{ fontSize: '10px', padding: '2px 8px', background: copiedCorreo ? '#14532d' : 'transparent', color: copiedCorreo ? '#86efac' : 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                    {copiedCorreo ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
                <textarea value={escForm.cuerpoCorreo} onChange={e => setEscForm(f => ({ ...f, cuerpoCorreo: e.target.value }))}
                  style={{ ...iStyle(), minHeight: '130px', fontSize: '10px', lineHeight: 1.55, resize: 'vertical', fontFamily: 'monospace' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowEscalarForm(false)}
                  style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleEscalar}
                  style={{ flex: 1, padding: '8px', background: '#854F0B', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Escalar →</button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {(!inc.escalamientos || inc.escalamientos.length === 0) && !showEscalarForm && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 20px', gap: '8px' }}>
              <IcoLayers />
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted-foreground)' }}>Sin escalamientos</div>
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', opacity: 0.7 }}>Agrega un nivel para iniciar el proceso de escalamiento.</div>
            </div>
          )}

          {/* Escalamiento cards */}
          {inc.escalamientos && inc.escalamientos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
              {inc.escalamientos.map((esc: any) => (
                <EscalamientoCard key={esc.id} esc={esc} isClosed={isClosed}
                  onEnvio={async () => { await fetch(`/api/escalamientos/${esc.id}/envio`, { method: 'PUT' }); fetchInc() }}
                  onRespuesta={async () => { await fetch(`/api/escalamientos/${esc.id}/respuesta`, { method: 'PUT' }); fetchInc() }}
                  onDelete={async () => {
                    await fetch(`/api/escalamientos/${esc.id}`, { method: 'DELETE' })
                    fetchInc()
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky bottom bar ── */}
      <div style={{ position: 'fixed', bottom: 0, left: '192px', right: 0, zIndex: 40, background: 'var(--card)', borderTop: '1px solid var(--border)', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => router.push('/incidentes')}
          style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
          ← Volver a incidentes
        </button>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isClosed && (
            <>
              <button onClick={handleCancelar}
                style={{ ...btn, background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)', fontWeight: 400 }}>
                Cancelar incidente
              </button>
              <button onClick={handleResolver}
                style={{ ...btn, background: '#14532d', color: '#86efac' }}>
                Marcar como resuelto
              </button>
              <button onClick={openEscalarForm}
                style={{ ...btn, background: 'hsl(221,83%,45%)', color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}>
                Escalar incidente <IcoArrow />
              </button>
            </>
          )}
          {isClosed && inc.estado !== 'CANCELADO' && (
            <button onClick={() => setShowReopenModal(true)}
              style={{ ...btn, background: 'rgba(133,79,11,0.15)', color: '#d97706', border: '1px solid rgba(133,79,11,0.3)' }}>
              Reabrir incidente
            </button>
          )}
          {(canEditB || canEditA) && (
            <button onClick={handleSave} disabled={saving}
              style={{ ...btn, background: 'hsl(221,83%,45%)', color: 'white', border: '1px solid hsl(221,83%,35%)' }}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── EscalamientoCard ──────────────────────────────────────────────────────────
const IcoTrashEsc = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>

function EscalamientoCard({ esc, isClosed, onEnvio, onRespuesta, onDelete }: {
  esc: any; isClosed: boolean; onEnvio: () => void; onRespuesta: () => void; onDelete: () => void
}) {
  const [showCorreo, setShowCorreo]       = useState(false)
  const [copied, setCopied]               = useState(false)
  const [respuesta, setRespuesta]         = useState(esc.respuestaTexto ?? '')
  const [savingResp, setSavingResp]       = useState(false)
  const [deleting, setDeleting]           = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(esc.cuerpoCorreo ?? '')
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function saveRespuesta() {
    setSavingResp(true)
    await fetch(`/api/escalamientos/${esc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respuestaTexto: respuesta }),
    })
    setSavingResp(false)
  }

  async function handleDelete() {
    if (esc.horaEnvioCorreo && !esc.horaRespuesta) {
      if (!confirm('El cronómetro ya está corriendo. ¿Eliminar de todas formas este escalamiento?')) return
    } else {
      if (!confirm('¿Eliminar este escalamiento?')) return
    }
    setDeleting(true)
    await onDelete()
  }

  const canDelete = !isClosed && !esc.horaRespuesta

  const horaCreado = new Date(esc.creadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })

  return (
    <div style={{ padding: '14px', background: 'var(--muted)', borderRadius: '10px', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600 }}>Nivel {esc.nivel} — {esc.contactoEscalado}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{esc.emailContacto}</div>
          {esc.telefonoContacto && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>📞 {esc.telefonoContacto}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '9px', color: 'var(--muted-foreground)' }}>{horaCreado}</span>
          {canDelete && (
            <button onClick={handleDelete} disabled={deleting} title="Eliminar escalamiento"
              style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '5px', color: '#dc2626', cursor: deleting ? 'wait' : 'pointer' }}>
              <IcoTrashEsc />
            </button>
          )}
        </div>
      </div>

      {esc.tiempoEstimadoSolucion && (
        <div style={{ fontSize: '10px', marginBottom: '8px', padding: '4px 8px', background: 'rgba(133,79,11,0.12)', borderRadius: '4px', color: '#854F0B' }}>
          ⏱ Estimado: {esc.tiempoEstimadoSolucion}
        </div>
      )}

      <CronometroEscalamiento horaEnvio={esc.horaEnvioCorreo} horaRespuesta={esc.horaRespuesta} />

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
                style={{ marginTop: '4px', fontSize: '10px', padding: '3px 10px', background: copied ? '#14532d' : 'transparent', color: copied ? '#86efac' : 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '5px', cursor: 'pointer' }}>
                {copied ? '✓ Copiado' : 'Copiar correo'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Respuesta del proveedor */}
      <div style={{ marginTop: '10px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: '4px' }}>Respuesta del proveedor</div>
        <textarea
          value={respuesta}
          onChange={e => setRespuesta(e.target.value)}
          onBlur={saveRespuesta}
          placeholder="Anota lo que respondió el proveedor..."
          disabled={isClosed}
          style={{ width: '100%', padding: '6px 8px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '6px', background: isClosed ? 'var(--muted)' : 'var(--card)', color: 'var(--foreground)', outline: 'none', resize: 'vertical', minHeight: '56px', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
        />
        {!isClosed && (
          <button onClick={saveRespuesta} disabled={savingResp}
            style={{ marginTop: '4px', fontSize: '10px', padding: '3px 10px', background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '5px', cursor: 'pointer' }}>
            {savingResp ? 'Guardando...' : 'Guardar respuesta'}
          </button>
        )}
      </div>

      {/* Adjuntos del escalamiento */}
      <div style={{ marginTop: '10px' }}>
        <AdjuntosZona escalamientoId={esc.id} disabled={isClosed} />
      </div>

      {!esc.horaEnvioCorreo && !isClosed && (
        <button onClick={onEnvio}
          style={{ width: '100%', marginTop: '8px', padding: '7px', background: 'hsl(221,83%,45%)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}>
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
