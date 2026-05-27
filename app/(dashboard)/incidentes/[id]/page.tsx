'use client'
import { useEffect, useState, use, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Badge, estadoToVariant, impactoToVariant } from '@/components/ui/Badge'
import { CronometroPrincipal } from '@/components/incidentes/CronometroPrincipal'
import { CronometroEscalamiento } from '@/components/incidentes/CronometroEscalamiento'
import { GuiaEscalamiento } from '@/components/incidentes/GuiaEscalamiento'
import { AdjuntosZona, compressImage } from '@/components/incidentes/AdjuntosZona'
import { can } from '@/lib/permisos'

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
  CORTE_ELECTRICO: '⚡ Corte eléctrico',
}

const ALCANCE_LABELS: Record<string, string> = {
  SOLO_TIENDA: 'Solo la tienda', MALL: 'El mall',
  CUADRA_CALLE: 'Cuadra / calle', ZONA_AMPLIA: 'Zona amplia',
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

function buildDescartes(inc: any): string {
  const parts: string[] = []
  if (inc.descEnergia === true)  parts.push('Energía verificada: OK')
  if (inc.descEnergia === false) parts.push('Energía verificada: Falla')
  if (inc.descRouter  === true)  parts.push('Router/ONT verificado: OK')
  if (inc.descRouter  === false) parts.push('Router/ONT verificado: Falla')
  if (inc.descDns     === true)  parts.push('Cambio DNS aplicado: OK')
  if (inc.descDns     === false) parts.push('Cambio DNS aplicado: Falla')
  if (inc.checkIpconfig)     parts.push('Ipconfig ejecutado')
  if (inc.checkPingGw)       parts.push('Ping a gateway')
  if (inc.checkPingInternet) parts.push('Ping a internet')
  if (inc.checkTracert)      parts.push('Tracert ejecutado')
  if (inc.checkDns)          parts.push('Validó DNS')
  if (inc.checkRenovarIp)    parts.push('Renovó IP')
  if (inc.descartesDetallado) parts.push(inc.descartesDetallado)
  else if (inc.descartesRealizados) parts.push(inc.descartesRealizados)
  return parts.length > 0 ? parts.join('\n') : 'Pendiente de documentar'
}

function buildCorreo(inc: any, nivelData: any, nivel: number = 1, prevEscs: any[] = []) {
  const fmtH = (d: string | null | undefined) => d
    ? new Date(d).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'
  const prefix = nivel === 2
    ? `El presente correo es una escalación debido a que no obtuvimos respuesta al correo enviado el ${fmtH(prevEscs[0]?.horaEnvioCorreo)}. Se requiere atención inmediata.\n\n`
    : nivel === 3
    ? `Tercer escalamiento. Los correos anteriores (N1: ${fmtH(prevEscs[0]?.horaEnvioCorreo)}, N2: ${fmtH(prevEscs[1]?.horaEnvioCorreo)}) no recibieron respuesta. Exigimos atención urgente y solución en el menor tiempo posible.\n\n`
    : nivel === 4
    ? `Cuarto y último escalamiento. Situación crítica sin resolución. Solicitamos intervención de nivel gerencial.\n\n`
    : ''
  return `${prefix}Asunto: [NetDesk ${inc.codigo}] Avería Internet — ${inc.tiendaCodigo} ${inc.tiendaNombre} · ${inc.tiendaDistrito}

Estimados ${nivelData?.nombreContacto ?? 'Soporte'},

Reportamos avería en la tienda ${inc.tiendaCodigo} — ${inc.tiendaNombre}
Dirección: ${inc.tiendaDireccion ?? '—'}
Proveedor: ${inc.proveedorNombre ?? '—'}
CID / Servicio: ${inc.tiendaCid ?? '—'}
Tipo de conexión: ${inc.tiendaTipoConexion ?? '—'}

Tipo de falla: ${TIPO_LABELS[inc.tipo] ?? inc.tipo}
Hora de inicio: ${new Date(inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
Usuarios afectados: ${inc.usuariosAfectados ?? '—'}

Descartes realizados:
${buildDescartes(inc)}

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
const IcoLayers  = () => <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.35"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 12l10 5 10-5"/><path d="M2 17l10 5 10-5"/></svg>
const IcoShield  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>

function TimeRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
      <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 500, color: color ?? (value === '—' || value === 'En curso' ? 'var(--muted-foreground)' : 'var(--foreground)') }}>{value}</span>
    </div>
  )
}

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
  const [saveError, setSaveError]   = useState('')
  const [contNotice, setContNotice] = useState(false)
  const [supervisorEdit, setSupervisorEdit] = useState(false)
  const [showReopenModal, setShowReopenModal] = useState(false)
  const [showReopenWarning, setShowReopenWarning] = useState(false)
  const [minutosDesdeResolucion, setMinutosDesdeResolucion] = useState(0)
  const [reopenMotivo, setReopenMotivo] = useState('')
  const [reopening, setReopening]   = useState(false)
  const [showGuia, setShowGuia]       = useState(false)
  const [showSolucionado, setShowSolucionado] = useState(false)

  // Escalamiento
  const [showNivelMenu, setShowNivelMenu] = useState(false)

  // Bloques operación (colapsables)
  const [showContBlock, setShowContBlock] = useState(false)
  const [showMovBlock,  setShowMovBlock]  = useState(false)

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
      // Operación / gestión
      estadoOperacion:     data.estadoOperacion     ?? '',
      contActivadoPor:     data.contActivadoPor     ?? '',
      contHoraActivacion:  toDatetimeLocal(data.contHoraActivacion),
      contRendimiento:     data.contRendimiento     ?? '',
      contObservacion:     data.contObservacion     ?? '',
      movActivadoPor:      data.movActivadoPor      ?? '',
      movHoraActivacion:   toDatetimeLocal(data.movHoraActivacion),
      movRendimiento:      data.movRendimiento      ?? '',
      movObservacion:      data.movObservacion      ?? '',
      descEnergia:         data.descEnergia         ?? null,
      descRouter:          data.descRouter          ?? null,
      descDns:             data.descDns             ?? null,
      checkIpconfig:       data.checkIpconfig       ?? false,
      checkPingGw:         data.checkPingGw         ?? false,
      checkPingInternet:   data.checkPingInternet   ?? false,
      checkTracert:        data.checkTracert        ?? false,
      checkDns:            data.checkDns            ?? false,
      checkRenovarIp:      data.checkRenovarIp      ?? false,
      descartesDetallado:  data.descartesDetallado  ?? '',
      boletaManual:        data.boletaManual        ?? null,
      ventaParcial:        data.ventaParcial        ?? null,
      cajasAfectadas:      data.cajasAfectadas      ?? null,
      cajasTotales:        data.cajasTotales        ?? null,
      alcanceCorte:        data.alcanceCorte        ?? null,
      tuvoUps:             data.tuvoUps             ?? null,
    })
  }, [id])

  useEffect(() => { fetchInc() }, [fetchInc])

  useEffect(() => {
    if (!inc?.tiendaId) return
    fetch(`/api/tiendas/${inc.tiendaId}/historial`)
      .then(r => r.json())
      .then(d => setHistorial(Array.isArray(d) ? d.filter((h: any) => h.id !== inc.id) : []))
  }, [inc?.tiendaId, inc?.id])

  if (!inc) return (
    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Cargando...</div>
  )

  const userEmail  = (session?.user as any)?.email
  const isClosed   = ['RESUELTO', 'CANCELADO', 'CERRADO'].includes(inc.estado)
  const canManage  = can(session, 'incidentes.editar')
  const isMyInc    = userEmail === inc.agenteEmail
  const canEditB   = canManage || (isMyInc && !isClosed)
  const canEditA   = canManage && supervisorEdit
  const isSupervisor = (session?.user as any)?.rol === 'SUPERVISOR'

  function setEdit(k: string, v: any) { setEditForm((f: any) => ({ ...f, [k]: v })) }

  function handleEstadoOperacion(val: string) {
    const clears: any = {}
    if (val !== 'CONTINGENCIA') {
      clears.contActivadoPor = ''; clears.contHoraActivacion = ''
      clears.contRendimiento = ''; clears.contObservacion = ''
    }
    if (val !== 'DATOS_MOVILES') {
      clears.movActivadoPor = ''; clears.movHoraActivacion = ''
      clears.movRendimiento = ''; clears.movObservacion = ''
    }
    setEditForm((f: any) => ({ ...f, estadoOperacion: val, ...clears }))
    setShowContBlock(val === 'CONTINGENCIA')
    setShowMovBlock(val === 'DATOS_MOVILES')
  }

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
    if ('contHoraActivacion' in body) body.contHoraActivacion = body.contHoraActivacion ? fromDatetimeLocal(body.contHoraActivacion) : null
    if ('movHoraActivacion'  in body) body.movHoraActivacion  = body.movHoraActivacion  ? fromDatetimeLocal(body.movHoraActivacion)  : null
    // Factor operativo automático por tier de rendimiento
    const rfCont: Record<string, string> = { TOTAL: '0.90', PARCIAL: '0.50', FALLIDA: '0.00' }
    const rfMov:  Record<string, string> = { EFECTIVA: '0.75', PARCIAL: '0.50', LIMITADA: '0.25', NO_FUNCIONO: '0.00' }
    if (body.estadoOperacion === 'BOLETA_MANUAL') {
      body.factorOperativo = '0.40'; body.operacionManual = true; body.tipoOperacionManual = 'BOLETA_MANUAL'
    } else if (body.estadoOperacion === 'CONTINGENCIA') {
      body.factorOperativo = rfCont[body.contRendimiento] ?? null; body.operacionManual = false; body.tipoOperacionManual = null
    } else if (body.estadoOperacion === 'DATOS_MOVILES') {
      body.factorOperativo = rfMov[body.movRendimiento] ?? null; body.operacionManual = false; body.tipoOperacionManual = null
    } else {
      body.factorOperativo = null; body.operacionManual = false; body.tipoOperacionManual = null
    }
    setSaveError('')
    const res = await fetch(`/api/incidentes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setSaveError(data?.error ?? `Error ${res.status} al guardar`)
      setSaving(false)
      return
    }
    setSaving(false)
    fetchInc()
  }

  async function handleSolucionado() {
    setShowSolucionado(false)
    await fetch(`/api/incidentes/${id}/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resueltoPor: 'AGENTE', atribucionFinal: 'Gestión interna Service Desk', evaluableProveedor: false }),
    })
    fetchInc()
  }

  async function handleResolver() {
    if (!confirm('¿Marcar como resuelto? Se registrará la hora actual como fin del incidente.')) return
    const res = await fetch(`/api/incidentes/${id}/resolver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resueltoPor: 'PROVEEDOR' }),
    })
    const data = await res.json().catch(() => ({}))
    if (data.contingenciaMantieneActiva) setContNotice(true)
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

  async function handleEscalarNivel(nivel: number) {
    setShowNivelMenu(false)
    const nivelData = inc.nivelesProveedor?.find((n: any) => n.nivel === nivel)
    const prevEscs = [...(inc.escalamientos ?? [])].sort((a: any, b: any) => a.nivel - b.nivel).filter((e: any) => e.nivel < nivel)
    const cuerpoCorreo = buildCorreo(inc, nivelData, nivel, prevEscs)
    await fetch(`/api/incidentes/${id}/escalar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nivel,
        nivelEscId:             nivelData?.id             ?? null,
        contactoEscalado:       nivelData?.nombreContacto ?? `Nivel ${nivel}`,
        emailContacto:          nivelData?.email          ?? '',
        telefonoContacto:       nivelData?.celular        ?? null,
        tiempoEstimadoSolucion: null,
        cuerpoCorreo,
      }),
    })
    fetchInc()
    setTimeout(() => escRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200)
  }

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
              {inc.estado === 'RESUELTO' && inc.resueltoPor && (
                <span style={{ fontSize: '10px', background: inc.resueltoPor === 'AGENTE' ? 'rgba(59,130,246,0.25)' : 'rgba(34,197,94,0.25)', color: inc.resueltoPor === 'AGENTE' ? '#93c5fd' : '#86efac', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  {inc.resueltoPor === 'AGENTE' ? 'Resuelto por Agente' : 'Resuelto por Proveedor'}
                </span>
              )}
              <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', padding: '2px 8px', borderRadius: '4px' }}>
                {TIPO_LABELS[inc.tipo] ?? inc.tipo}
              </span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: 'white', marginBottom: '4px', lineHeight: 1.2 }}>
              {inc.tiendaCodigo} — {inc.tiendaNombre}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.38)' }}>
              {inc.tipo === 'CORTE_ELECTRICO' ? '⚡ Energía Eléctrica' : (inc.proveedorNombre ?? '—')} · {inc.tiendaDistrito} · Agente: {inc.agenteNombre}
            </div>
            {inc.actualizadoEn && (
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.18)', marginTop: '5px' }}>
                Última edición: {new Date(inc.actualizadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            {inc.tiendaReferencia && (
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', marginTop: '4px' }}>
                {inc.tiendaReferencia} · Agente: {inc.agenteNombre ?? '—'}
              </div>
            )}
            {inc.tiendaAdminCelular && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginTop: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 600, color: 'rgba(255,255,255,0.72)', fontFamily: 'monospace', letterSpacing: '0.02em' }}>{inc.tiendaAdminCelular}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{inc.proveedorNombre ?? '—'}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px', flexShrink: 0, marginLeft: '20px' }}>
            <div style={{ position: 'relative', alignSelf: 'flex-end' }}
              onMouseEnter={() => setShowGuia(true)}
              onMouseLeave={() => setShowGuia(false)}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', userSelect: 'none' }}>?</div>
              {inc.proveedorInstruccion && (
                <div style={{ position: 'absolute', top: '26px', right: 0, zIndex: 200, minWidth: '300px', opacity: showGuia ? 1 : 0, pointerEvents: showGuia ? 'auto' : 'none', transition: 'opacity 0.2s ease', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', borderRadius: '10px', overflow: 'hidden' }}>
                  <GuiaEscalamiento proveedor={inc.proveedorNombre} instruccion={inc.proveedorInstruccion} />
                </div>
              )}
            </div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Tiempo del incidente</div>
            <CronometroPrincipal horaRegistro={inc.horaRegistro} horaFin={inc.horaFin} />
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.22)', textAlign: 'right', lineHeight: 1.5 }}>
              Creado: {new Date(inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </div>

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

      {/* ── Reopen warning modal (> 30 min) ── */}
      {showReopenWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '420px', margin: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: '#d97706' }}>
              ⚠ Han pasado {minutosDesdeResolucion >= 60
                ? `${Math.floor(minutosDesdeResolucion / 60)}h ${minutosDesdeResolucion % 60}m`
                : `${minutosDesdeResolucion} minutos`} desde la resolución
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '6px', lineHeight: 1.6 }}>
              El servicio estuvo operativo durante ese tiempo. Según la política del equipo, esto se considera una <strong>nueva falla</strong> y debe registrarse como un incidente independiente.
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '20px', padding: '8px 10px', background: 'var(--muted)', borderRadius: '8px' }}>
              Reabrir infla el MTTR con el tiempo que el servicio estuvo OK. Un nuevo incidente mantiene los registros limpios.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={() => { setShowReopenWarning(false); router.push(`/incidentes/nuevo?from=${id}`) }}
                style={{ padding: '10px', background: 'hsl(221,83%,45%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                + Crear nuevo incidente (recomendado)
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setShowReopenWarning(false); setShowReopenModal(true) }}
                  style={{ flex: 1, padding: '8px', background: 'rgba(133,79,11,0.12)', color: '#d97706', border: '1px solid rgba(133,79,11,0.3)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                  Reabrir de todas formas
                </button>
                <button onClick={() => setShowReopenWarning(false)}
                  style={{ flex: 1, padding: '8px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Solucionado modal ── */}
      {showSolucionado && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '380px', margin: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>¿Confirmas que fue solucionado por el agente?</div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '20px' }}>Se registrará: resuelto por agente, no evaluable al proveedor.</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowSolucionado(false)}
                style={{ flex: 1, padding: '8px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSolucionado}
                style={{ flex: 1, padding: '8px', background: '#14532d', color: '#86efac', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Sí, solucionado por agente</button>
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

            {/* Fila 1: Ticket InvGate | Ticket Proveedor | Estado operación */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Ticket InvGate</label>
                <input disabled={!canEditB} style={iStyle(!canEditB)} value={editForm.ticketInvgate} onChange={e => setEdit('ticketInvgate', e.target.value)} placeholder="Ej: 12345" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Ticket Proveedor</label>
                <input disabled={!canEditB} style={iStyle(!canEditB)} value={editForm.ticketProveedor} onChange={e => setEdit('ticketProveedor', e.target.value)} placeholder="Nro. ticket proveedor" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Estado operación</label>
                <select disabled={!canEditB} style={iStyle(!canEditB)} value={editForm.estadoOperacion ?? ''} onChange={e => handleEstadoOperacion(e.target.value)}>
                  <option value="">Sin operación especial</option>
                  <option value="CONTINGENCIA">Operación con contingencia</option>
                  <option value="DATOS_MOVILES">Operación con datos móviles</option>
                  <option value="BOLETA_MANUAL">Operación con boletas manuales</option>
                  <option value="CAIDA">Operación con caída</option>
                </select>
              </div>
            </div>

            {/* Bloque Contingencia — colapsable */}
            {editForm.estadoOperacion === 'CONTINGENCIA' && (() => {
              const rend = editForm.contRendimiento
              const rendLabel: Record<string,string> = { TOTAL:'Cubrió total', PARCIAL:'Con limitaciones', FALLIDA:'No funcionó' }
              const summary = [editForm.contActivadoPor && `Por: ${editForm.contActivadoPor}`, rend && rendLabel[rend]].filter(Boolean).join(' · ')
              return (
                <div style={{ border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '14px', overflow: 'hidden' }}>
                  <button type="button" onClick={() => setShowContBlock(v => !v)}
                    style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--muted)', border:'none', cursor:'pointer', textAlign:'left' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <span style={{ fontSize:'12px', fontWeight:600, color:'var(--foreground)' }}>Contingencia</span>
                      {!showContBlock && summary && <span style={{ fontSize:'10px', color:'var(--muted-foreground)' }}>{summary}</span>}
                    </div>
                    <span style={{ fontSize:'10px', color:'var(--muted-foreground)' }}>{showContBlock ? '▲' : '▼'}</span>
                  </button>
                  {showContBlock && (
                    <div style={{ padding:'14px', background:'var(--muted)' }}>
                      {!inc?.tiendaTieneContingencia && editForm.contActivadoPor && (
                        <div style={{ background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', marginBottom: '3px' }}>
                            ⚠ Esta tienda no tiene enlace de contingencia permanente registrado
                          </div>
                          <div style={{ fontSize: '11px', color: '#78350f', lineHeight: 1.5 }}>
                            Describe en <strong>Observación</strong> qué se instaló (router portátil, chip, equipo prestado, etc.)
                            para que quede registrado en la ficha de la tienda y sea visible al equipo.
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Activado por</label>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {(['TIENDA','AGENTE','INFRAESTRUCTURA'] as const).map(opt => (
                              <button key={opt} type="button" disabled={!canEditB} onClick={() => setEdit('contActivadoPor', opt)}
                                style={{ padding: '5px 11px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--border)', cursor: !canEditB ? 'default' : 'pointer', fontWeight: editForm.contActivadoPor === opt ? 600 : 400, background: editForm.contActivadoPor === opt ? 'hsl(221,83%,45%)' : 'var(--card)', color: editForm.contActivadoPor === opt ? 'white' : 'var(--foreground)' }}>
                                {opt.charAt(0) + opt.slice(1).toLowerCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Hora de activación</label>
                          <input type="datetime-local" disabled={!canEditB} style={iStyle(!canEditB)} value={editForm.contHoraActivacion ?? ''} onChange={e => setEdit('contHoraActivacion', e.target.value)} />
                        </div>
                      </div>
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Rendimiento</label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {[{v:'TOTAL',l:'Cubrió completamente',bg:'#dcfce7',c:'#15803d'},{v:'PARCIAL',l:'Con limitaciones',bg:'#fef9c3',c:'#a16207'},{v:'FALLIDA',l:'No funcionó',bg:'#fee2e2',c:'#b91c1c'}].map(({v,l,bg,c}) => {
                            const sel = editForm.contRendimiento === v
                            return <button key={v} type="button" disabled={!canEditB} onClick={() => setEdit('contRendimiento', v)} style={{ padding:'4px 10px',fontSize:'11px',borderRadius:'6px',border:`1px solid ${sel?c:'var(--border)'}`,cursor:!canEditB?'default':'pointer',background:sel?bg:'var(--card)',color:sel?c:'var(--muted-foreground)',fontWeight:sel?600:400 }}>{l}</button>
                          })}
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px', color: (!inc?.tiendaTieneContingencia && editForm.contActivadoPor) ? '#92400e' : 'var(--muted-foreground)' }}>
                          {(!inc?.tiendaTieneContingencia && editForm.contActivadoPor) ? 'Descripción de contingencia temporal *' : 'Observación'}
                        </label>
                        <textarea disabled={!isSupervisor}
                          style={{ ...taStyle(!isSupervisor), border: (!inc?.tiendaTieneContingencia && editForm.contActivadoPor && !editForm.contObservacion) ? '1.5px solid #f59e0b' : undefined }}
                          value={editForm.contObservacion ?? ''}
                          onChange={e => setEdit('contObservacion', e.target.value)}
                          placeholder={(!inc?.tiendaTieneContingencia && editForm.contActivadoPor) ? 'Ej: Router TP-Link portátil con chip Entel, instalado por técnico el 23/05...' : 'Describe el comportamiento de la contingencia...'} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Bloque Datos Móviles — colapsable */}
            {editForm.estadoOperacion === 'DATOS_MOVILES' && (() => {
              const rend = editForm.movRendimiento
              const rendLabel: Record<string,string> = { EFECTIVA:'Efectiva 75%', PARCIAL:'Parcial 50%', LIMITADA:'Limitada 25%', NO_FUNCIONO:'No funcionó 0%' }
              const summary = [editForm.movActivadoPor && `Por: ${editForm.movActivadoPor}`, rend && rendLabel[rend]].filter(Boolean).join(' · ')
              return (
                <div style={{ border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '14px', overflow: 'hidden' }}>
                  <button type="button" onClick={() => setShowMovBlock(v => !v)}
                    style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--muted)', border:'none', cursor:'pointer', textAlign:'left' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <span style={{ fontSize:'12px', fontWeight:600, color:'var(--foreground)' }}>Datos móviles</span>
                      {!showMovBlock && summary && <span style={{ fontSize:'10px', color:'var(--muted-foreground)' }}>{summary}</span>}
                    </div>
                    <span style={{ fontSize:'10px', color:'var(--muted-foreground)' }}>{showMovBlock ? '▲' : '▼'}</span>
                  </button>
                  {showMovBlock && (
                    <div style={{ padding:'14px', background:'var(--muted)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Activado por</label>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {(['TIENDA','AGENTE','INFRAESTRUCTURA'] as const).map(opt => (
                              <button key={opt} type="button" disabled={!canEditB} onClick={() => setEdit('movActivadoPor', opt)}
                                style={{ padding:'5px 11px',fontSize:'11px',borderRadius:'6px',border:'1px solid var(--border)',cursor:!canEditB?'default':'pointer',fontWeight:editForm.movActivadoPor===opt?600:400,background:editForm.movActivadoPor===opt?'hsl(221,83%,45%)':'var(--card)',color:editForm.movActivadoPor===opt?'white':'var(--foreground)' }}>
                                {opt.charAt(0) + opt.slice(1).toLowerCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Hora de activación</label>
                          <input type="datetime-local" disabled={!canEditB} style={iStyle(!canEditB)} value={editForm.movHoraActivacion ?? ''} onChange={e => setEdit('movHoraActivacion', e.target.value)} />
                        </div>
                      </div>
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Rendimiento</label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {[{v:'EFECTIVA',l:'Efectiva 75%',bg:'#dcfce7',c:'#15803d'},{v:'PARCIAL',l:'Parcial 50%',bg:'#fef9c3',c:'#a16207'},{v:'LIMITADA',l:'Limitada 25%',bg:'#fed7aa',c:'#c2410c'},{v:'NO_FUNCIONO',l:'No funcionó 0%',bg:'#fee2e2',c:'#b91c1c'}].map(({v,l,bg,c}) => {
                            const sel = editForm.movRendimiento === v
                            return <button key={v} type="button" disabled={!canEditB} onClick={() => setEdit('movRendimiento', v)} style={{ padding:'4px 10px',fontSize:'11px',borderRadius:'6px',border:`1px solid ${sel?c:'var(--border)'}`,cursor:!canEditB?'default':'pointer',background:sel?bg:'var(--card)',color:sel?c:'var(--muted-foreground)',fontWeight:sel?600:400 }}>{l}</button>
                          })}
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Observación</label>
                        <textarea disabled={!canEditB} style={taStyle(!canEditB)} value={editForm.movObservacion ?? ''} onChange={e => setEdit('movObservacion', e.target.value)} placeholder="Describe el comportamiento de los datos móviles..." />
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Descartes */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginBottom: '14px' }}>
              {inc.tipo === 'CORTE_ELECTRICO' ? (
                <>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '12px' }}>Datos del corte eléctrico</div>
                  <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', padding: '14px' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Alcance del corte</label>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {(['SOLO_TIENDA', 'MALL', 'CUADRA_CALLE', 'ZONA_AMPLIA'] as const).map(v => {
                          const sel = editForm.alcanceCorte === v
                          return (
                            <button key={v} type="button" disabled={!canEditB}
                              onClick={() => setEdit('alcanceCorte', v)}
                              style={{ padding: '5px 14px', fontSize: '12px', borderRadius: '20px', border: `1px solid ${sel ? '#B45309' : 'var(--border)'}`, cursor: !canEditB ? 'default' : 'pointer', fontWeight: sel ? 600 : 400, background: sel ? 'rgba(245,158,11,0.15)' : 'var(--card)', color: sel ? '#B45309' : 'var(--muted-foreground)' }}>
                              {ALCANCE_LABELS[v]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: !canEditB ? 'default' : 'pointer', color: 'var(--foreground)' }}>
                        <input type="checkbox" disabled={!canEditB}
                          checked={!!editForm.tuvoUps}
                          onChange={e => setEdit('tuvoUps', e.target.checked)}
                          style={{ cursor: !canEditB ? 'default' : 'pointer', accentColor: '#B45309', width: '14px', height: '14px' }} />
                        La tienda tenía UPS activo
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '12px' }}>Descartes realizados</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      {/* Sí/No */}
                      <div style={{ marginBottom: '12px' }}>
                        {[{key:'descEnergia',label:'Energía eléctrica'},{key:'descRouter',label:'Router / ONT encendido'},{key:'descDns',label:'Se cambió DNS'}].map(({key,label}) => (
                          <div key={key} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'7px' }}>
                            <span style={{ fontSize:'11px',color:'var(--foreground)' }}>{label}</span>
                            <div style={{ display:'flex',gap:'4px' }}>
                              {([true,false] as const).map(val => (
                                <button key={String(val)} type="button" disabled={!canEditB}
                                  onClick={() => setEdit(key, editForm[key] === val ? null : val)}
                                  style={{ padding:'2px 10px',fontSize:'11px',borderRadius:'5px',border:'1px solid var(--border)',cursor:!canEditB?'default':'pointer',background:editForm[key]===val?(val?'#dcfce7':'#fee2e2'):'var(--muted)',color:editForm[key]===val?(val?'#15803d':'#b91c1c'):'var(--muted-foreground)',fontWeight:editForm[key]===val?600:400 }}>
                                  {val?'Sí':'No'}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Checklist */}
                      <div style={{ display:'flex',flexDirection:'column',gap:'7px' }}>
                        {[{key:'checkIpconfig',label:'Se ejecutó ipconfig'},{key:'checkPingGw',label:'Se realizó ping a gateway'},{key:'checkPingInternet',label:'Se realizó ping a internet'},{key:'checkTracert',label:'Se realizó tracert'},{key:'checkDns',label:'Se validó DNS'},{key:'checkRenovarIp',label:'Se renovó IP'}].map(({key,label}) => (
                          <label key={key} style={{ display:'flex',alignItems:'center',gap:'7px',fontSize:'11px',cursor:!canEditB?'default':'pointer',color:editForm[key]?'var(--foreground)':'var(--muted-foreground)' }}>
                            <input type="checkbox" disabled={!canEditB} checked={!!editForm[key]} onChange={e => setEdit(key, e.target.checked)}
                              style={{ cursor:!canEditB?'default':'pointer',accentColor:'hsl(221,83%,45%)',width:'13px',height:'13px' }} />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                    {/* Acciones registradas */}
                    <div>
                      <div style={{ fontSize:'10px',fontWeight:600,color:'var(--muted-foreground)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:'8px' }}>Acciones registradas</div>
                      <div style={{ background:'var(--muted)',borderRadius:'8px',padding:'10px 12px',minHeight:'120px' }}>
                        {(() => {
                          const acc = [
                            editForm.checkPingGw       && 'Ping a gateway',
                            editForm.checkPingInternet && 'Ping a internet',
                            editForm.checkIpconfig     && 'Ejecutó ipconfig',
                            editForm.checkTracert      && 'Tracert ejecutado',
                            editForm.checkDns          && 'Validó DNS',
                            editForm.checkRenovarIp    && 'Renovó IP',
                            editForm.descEnergia === true && 'Energía verificada',
                            editForm.descRouter  === true && 'Router/ONT verificado',
                            editForm.descDns     === true && 'Cambio DNS aplicado',
                          ].filter(Boolean) as string[]
                          return acc.length > 0
                            ? <div style={{ display:'flex',flexDirection:'column',gap:'5px' }}>
                                {acc.map(a => (
                                  <div key={a} style={{ display:'flex',alignItems:'center',gap:'6px',fontSize:'11px',color:'var(--foreground)' }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                                    {a}
                                  </div>
                                ))}
                              </div>
                            : <div style={{ fontSize:'11px',color:'var(--muted-foreground)',fontStyle:'italic' }}>Sin acciones registradas aún</div>
                        })()}
                      </div>
                    </div>
                  </div>
                </>
              )}
              {/* Condiciones de venta (IEI) */}
              <div style={{ marginTop:'12px', background:'var(--muted)', border:'1px solid var(--border)', borderRadius:'10px', padding:'12px' }}>
                <div style={{ fontSize:'11px', fontWeight:600, color:'var(--foreground)', marginBottom:'10px' }}>Condiciones de venta</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'8px 24px', marginBottom:'10px' }}>
                  {([{ key:'boletaManual', label:'¿Se usó boleta manual?' }, { key:'ventaParcial', label:'¿Hubo venta parcial?' }] as const).map(({ key, label }) => (
                    <label key={key} style={{ display:'flex', alignItems:'center', gap:'7px', fontSize:'11px', cursor:!canEditB?'default':'pointer', color:'var(--foreground)' }}>
                      <input type="checkbox" disabled={!canEditB}
                        checked={!!editForm[key]}
                        onChange={e => setEdit(key, e.target.checked ? true : null)}
                        style={{ cursor:!canEditB?'default':'pointer', accentColor:'hsl(221,83%,45%)', width:'13px', height:'13px' }} />
                      {label}
                    </label>
                  ))}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                  <div>
                    <label style={{ display:'block', fontSize:'10px', fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'4px' }}>Cajas afectadas</label>
                    <input type="number" min="0" disabled={!canEditB} style={iStyle(!canEditB)}
                      value={editForm.cajasAfectadas ?? ''}
                      onChange={e => setEdit('cajasAfectadas', e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="Ej: 2" />
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:'10px', fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'4px' }}>Cajas totales</label>
                    <input type="number" min="1" disabled={!canEditB} style={iStyle(!canEditB)}
                      value={editForm.cajasTotales ?? ''}
                      onChange={e => setEdit('cajasTotales', e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="Ej: 4" />
                  </div>
                </div>
              </div>

            {/* Comentarios */}
              <div
                style={{ marginTop:'12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'10px', padding:'12px' }}
              >
                <div style={{ fontSize:'11px',fontWeight:600,color:'var(--foreground)',marginBottom:'8px' }}>Comentarios</div>
                <textarea disabled={!canEditB}
                  style={{ ...taStyle(!canEditB), minHeight:'72px' }}
                  value={editForm.descartesDetallado ?? ''} onChange={e => setEdit('descartesDetallado', e.target.value)}
                  placeholder="Describe qué se validó, resultados, respuesta de tienda, acciones del agente..."
                />
                <div style={{ marginTop:'10px' }}>
                  <AdjuntosZona incidenteId={id} disabled={!canEditB} />
                </div>
              </div>
            </div>

            {inc.reabiertaInfo && (
              <div style={{ marginBottom:'12px',padding:'8px 12px',fontSize:'11px',background:'rgba(146,64,14,0.1)',border:'1px solid rgba(146,64,14,0.25)',borderRadius:'8px',color:'#d97706' }}>
                {inc.reabiertaInfo}
              </div>
            )}

            {/* Botón Solucionado */}
            {!isClosed && (
              <div style={{ display:'flex',justifyContent:'flex-end',borderTop:'1px solid var(--border)',paddingTop:'12px' }}>
                <button type="button" onClick={() => setShowSolucionado(true)}
                  style={{ padding:'7px 20px',background:'#14532d',color:'#86efac',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:600,cursor:'pointer' }}>
                  ✓ Solucionado
                </button>
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
              <ResumenRow icon={<IcoWifi />} label="Proveedor">
                {inc.tipo === 'CORTE_ELECTRICO'
                  ? <span style={{ color: '#B45309', fontWeight: 600 }}>⚡ Energía Eléctrica</span>
                  : (inc.proveedorNombre ?? '—')}
              </ResumenRow>
              {inc.tipo === 'CORTE_ELECTRICO' && (
                <ResumenRow icon={<IcoConn />} label="Alcance del corte">
                  <span style={{ fontWeight: 500 }}>{ALCANCE_LABELS[inc.alcanceCorte] ?? inc.alcanceCorte ?? '—'}</span>
                  {inc.tuvoUps != null && (
                    <span style={{ marginLeft: '8px', fontSize: '10px', color: inc.tuvoUps ? '#15803d' : 'var(--muted-foreground)' }}>
                      {inc.tuvoUps ? '· UPS activo' : '· Sin UPS'}
                    </span>
                  )}
                </ResumenRow>
              )}
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

              {inc.estadoOperacion && (
                <ResumenRow icon={<IcoConn />} label="Estado operación">
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)', fontWeight: 500 }}>
                    {({ CONTINGENCIA: 'Contingencia', DATOS_MOVILES: 'Datos móviles', BOLETA_MANUAL: 'Boleta manual', CAIDA: 'Caída' } as Record<string,string>)[inc.estadoOperacion] ?? inc.estadoOperacion}
                  </span>
                </ResumenRow>
              )}
              {inc.factorOperativo != null && (
                <ResumenRow icon={<IcoImpact />} label="Factor operativo">
                  {parseFloat(inc.factorOperativo) === 0
                    ? <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#b91c1c' }}>Inoperativa</span>
                    : <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{(parseFloat(inc.factorOperativo) * 100).toFixed(0)}%</span>
                  }
                </ResumenRow>
              )}
              <ResumenRow icon={<IcoShield />} label="Contingencia">
                {(() => {
                  const tiene = inc.tiendaTieneContingencia
                  if (!tiene) return <span style={{ color: 'var(--muted-foreground)' }}>No</span>
                  if (inc.estadoOperacion !== 'CONTINGENCIA') return <span style={{ color: '#15803d', fontWeight: 500 }}>Sí</span>
                  const rend = inc.contRendimiento
                  const rendLabelMap: Record<string,{l:string;c:string}> = {
                    TOTAL:      { l: 'Cubrió completamente', c: '#15803d' },
                    EFECTIVA:   { l: 'Cubrió completamente', c: '#15803d' },
                    PARCIAL:    { l: 'Con limitaciones',     c: '#a16207' },
                    LIMITADA:   { l: 'Con limitaciones',     c: '#a16207' },
                    FALLIDA:    { l: 'No funcionó',          c: '#b91c1c' },
                    NO_FUNCIONO:{ l: 'No funcionó',          c: '#b91c1c' },
                    INOPERATIVA:{ l: 'No funcionó',          c: '#b91c1c' },
                  }
                  const rendInfo = rend ? rendLabelMap[rend] : null
                  if (rendInfo?.c === '#b91c1c') {
                    return <span style={{ color: '#b91c1c', fontWeight: 500 }}>Activa — {rendInfo.l}</span>
                  }
                  return <span style={{ color: '#15803d', fontWeight: 600 }}>Activa{rendInfo ? ` — ${rendInfo.l}` : ''}</span>
                })()}
              </ResumenRow>

              {/* Tiempos */}
              <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--muted)', borderRadius: '8px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Tiempos del incidente</div>
                <TimeRow label="Hora inicio" value={new Date(inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
                <TimeRow label="Tiempo total" value={inc.mttrMinutos ? minToHM(inc.mttrMinutos) : 'En curso'} />
                {[...(inc.escalamientos ?? [])].sort((a: any, b: any) => a.nivel - b.nivel).map((esc: any) => {
                  const enviado = esc.horaEnvioCorreo
                    ? new Date(esc.horaEnvioCorreo).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : '—'
                  let respVal = '—', respColor: string | undefined
                  if (esc.noHuboRespuesta) {
                    respVal = 'No hubo respuesta'; respColor = '#b91c1c'
                  } else if (esc.tiempoRespuestaMin != null) {
                    respVal = minToHM(esc.tiempoRespuestaMin)
                  } else if (esc.horaEnvioCorreo && esc.estadoCronometro === 'VENCIDO') {
                    const exc = Math.round((Date.now() - new Date(esc.horaEnvioCorreo).getTime()) / 60000) - 60
                    respVal = exc > 0 ? `Excedido ${minToHM(exc)}` : 'Vencido'; respColor = '#d97706'
                  }
                  return (
                    <div key={esc.id}>
                      <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '6px 0 4px', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>Nivel {esc.nivel}</div>
                      <TimeRow label={`Enviado N${esc.nivel}`} value={enviado} />
                      <TimeRow label={`Respuesta N${esc.nivel}`} value={respVal} color={respColor} />
                    </div>
                  )
                })}
                {inc.horaFin && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0 4px' }} />
                    <TimeRow label="Hora solución" value={new Date(inc.horaFin).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
                  </>
                )}

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
                <a href={`/tiendas/${inc.tiendaId}`}
                  onClick={e => { e.preventDefault(); router.push(`/tiendas/${inc.tiendaId}`) }}
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

      {/* ── Block D — Escalamientos (solo visible cuando hay escalamientos) ── */}
      {inc.escalamientos?.length > 0 && (
        <div ref={escRef} style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', marginTop: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>D — Escalamientos</div>
          </div>
          <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '12px' }}>
            {inc.escalamientos.map((esc: any) => (
              <EscalamientoCard key={esc.id} esc={esc} allEscs={inc.escalamientos} inc={inc} isClosed={isClosed} onRefresh={fetchInc} />
            ))}
          </div>
        </div>
      )}

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
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowNivelMenu(v => !v)}
                  style={{ ...btn, background: 'hsl(221,83%,45%)', color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  Escalar incidente <IcoArrow />
                </button>
                {showNivelMenu && (
                  <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: '6px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 50, minWidth: '150px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                    {[1,2,3,4].map(n => (
                      <button key={n} onClick={() => handleEscalarNivel(n)}
                        style={{ padding: '7px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', textAlign: 'left', color: 'var(--foreground)' }}>
                        Escalar N{n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {isClosed && inc.estado !== 'CANCELADO' && (
            <button onClick={() => {
              const mins = inc.horaFin
                ? Math.round((Date.now() - new Date(inc.horaFin).getTime()) / 60000)
                : 0
              setMinutosDesdeResolucion(mins)
              if (mins > 30) {
                setShowReopenWarning(true)
              } else {
                setShowReopenModal(true)
              }
            }}
              style={{ ...btn, background: 'rgba(133,79,11,0.15)', color: '#d97706', border: '1px solid rgba(133,79,11,0.3)' }}>
              Reabrir incidente
            </button>
          )}
          {saveError && (
            <span style={{ fontSize: '12px', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 10px', maxWidth: '320px' }}>
              {saveError}
            </span>
          )}
          {contNotice && (
            <div style={{ fontSize: '12px', color: '#92400e', background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: '8px', padding: '8px 12px', maxWidth: '380px', lineHeight: 1.5, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠</span>
              <span>
                <strong>Incidente cerrado.</strong> La tienda permanece en <strong>contingencia activa</strong> porque el router temporal sigue instalado.
                Desactívala desde la ficha de la tienda cuando el proveedor restituya el servicio definitivo.
              </span>
              <button onClick={() => setContNotice(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: '16px', flexShrink: 0, padding: 0, lineHeight: 1 }}>×</button>
            </div>
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
const IcoPhone  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.43A2 2 0 0 1 3.6 1.25h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.84a16 16 0 0 0 6.07 6.07l.96-1.06a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>

function AtcLlamadaRow({ atc, isClosed, onFin, onSaveNotas, onDelete }: {
  atc: any; isClosed: boolean; onFin: () => void; onSaveNotas: (n: string) => void; onDelete: () => void
}) {
  const [notas, setNotas] = useState(atc.notas ?? '')
  const inicio = new Date(atc.inicio).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <div style={{ padding: '10px 12px', background: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <IcoPhone />
          <span style={{ fontSize: '11px', fontWeight: 600 }}>{inicio}</span>
          {atc.fin
            ? <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>· {atc.duracionMin != null ? minToHM(atc.duracionMin) : '—'}</span>
            : <span style={{ fontSize: '10px', color: '#15803d', fontWeight: 500 }}>● En curso</span>}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {!atc.fin && !isClosed && (
            <button onClick={onFin} style={{ padding: '2px 8px', fontSize: '10px', background: '#fee2e2', color: '#b91c1c', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '4px', cursor: 'pointer' }}>
              ■ Finalizar
            </button>
          )}
          {!isClosed && (
            <button onClick={onDelete} style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '4px', color: '#dc2626', cursor: 'pointer' }}>
              <IcoTrashEsc />
            </button>
          )}
        </div>
      </div>
      <textarea value={notas} onChange={e => setNotas(e.target.value)} onBlur={() => onSaveNotas(notas)}
        placeholder="Notas de la llamada..."
        disabled={isClosed}
        style={{ width: '100%', padding: '6px 8px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--muted)', color: 'var(--foreground)', outline: 'none', resize: 'vertical', minHeight: '48px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
    </div>
  )
}

function EscalamientoCard({ esc, allEscs, inc, isClosed, onRefresh }: {
  esc: any; allEscs: any[]; inc: any; isClosed: boolean; onRefresh: () => void
}) {
  const [showTemplate, setShowTemplate] = useState(false)
  const [copied, setCopied]             = useState(false)
  const [respuestaText, setRespuestaText] = useState(esc.respuestaTexto ?? '')
  const [tiempoEstText, setTiempoEstText] = useState(esc.tiempoEstimadoSolucion ?? '')
  const [horaRespManual, setHoraRespManual] = useState('')
  const [editTiempos, setEditTiempos] = useState(false)
  const [horaEnvioEdit, setHoraEnvioEdit] = useState(toDatetimeLocal(esc.horaEnvioCorreo) ?? '')
  const [horaRespEdit, setHoraRespEdit] = useState(toDatetimeLocal(esc.horaRespuesta) ?? '')
  const [savingTiempos, setSavingTiempos] = useState(false)
  const [saving, setSaving]             = useState(false)

  useEffect(() => {
    if (!editTiempos) {
      setHoraEnvioEdit(toDatetimeLocal(esc.horaEnvioCorreo) ?? '')
      setHoraRespEdit(toDatetimeLocal(esc.horaRespuesta) ?? '')
    }
  }, [esc.horaEnvioCorreo, esc.horaRespuesta, editTiempos])
  const [showAtc, setShowAtc]           = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [escAdjKey, setEscAdjKey] = useState(0)

  const nivelData  = inc.nivelesProveedor?.find((n: any) => n.nivel === esc.nivel)
  const prevEscs   = allEscs.filter((e: any) => e.nivel < esc.nivel).sort((a: any, b: any) => a.nivel - b.nivel)
  const templateText = buildCorreo(inc, nivelData, esc.nivel, prevEscs)
  const [templateBody, setTemplateBody] = useState<string>(esc.cuerpoCorreo ?? templateText)

  const isRespondido   = !!esc.horaRespuesta
  const isSinRespuesta = !!esc.noHuboRespuesta
  const isCorriendo    = !!esc.horaEnvioCorreo && !isRespondido && !isSinRespuesta
  const horaCreado     = new Date(esc.horaEnvioCorreo ?? esc.creadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })

  async function copyTemplate() {
    await navigator.clipboard.writeText(templateBody)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function saveTemplate() {
    setSavingTemplate(true)
    await fetch(`/api/escalamientos/${esc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cuerpoCorreo: templateBody }),
    })
    setSavingTemplate(false)
  }

  async function handleEnvio() {
    await fetch(`/api/escalamientos/${esc.id}/envio`, { method: 'PUT' })
    onRefresh()
  }

  async function handleRespuesta() {
    setSaving(true)
    await fetch(`/api/escalamientos/${esc.id}/respuesta`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        respuestaTexto: respuestaText,
        tiempoEstimadoSolucion: tiempoEstText,
        horaRespuesta: fromDatetimeLocal(horaRespManual) ?? undefined,
      }),
    })
    setSaving(false); onRefresh()
  }

  async function handleSinRespuesta() {
    if (!confirm('¿Confirmar que no hubo respuesta del proveedor?')) return
    await fetch(`/api/escalamientos/${esc.id}/sin-respuesta`, { method: 'PUT' })
    onRefresh()
  }

  async function handleDelete() {
    const msg = isRespondido
      ? `Nivel ${esc.nivel} ya tiene respuesta registrada. ¿Eliminar de todas formas? Esta acción no se puede deshacer.`
      : isCorriendo
        ? 'El cronómetro ya está corriendo. ¿Eliminar de todas formas?'
        : '¿Eliminar este escalamiento?'
    if (!confirm(msg)) return
    await fetch(`/api/escalamientos/${esc.id}`, { method: 'DELETE' })
    onRefresh()
  }

  async function handleGuardarTiempos() {
    setSavingTiempos(true)
    await fetch(`/api/escalamientos/${esc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        horaEnvioCorreo: fromDatetimeLocal(horaEnvioEdit),
        horaRespuesta:   fromDatetimeLocal(horaRespEdit),
      }),
    })
    setSavingTiempos(false)
    setEditTiempos(false)
    onRefresh()
  }

  async function iniciarAtc() {
    await fetch(`/api/escalamientos/${esc.id}/atc`, { method: 'POST' })
    onRefresh()
  }

  async function finalizarAtc(atcId: string) {
    await fetch(`/api/atc/${atcId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finalizar: true }) })
    onRefresh()
  }

  async function guardarNotasAtc(atcId: string, notas: string) {
    await fetch(`/api/atc/${atcId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notas }) })
  }

  async function eliminarAtc(atcId: string) {
    if (!confirm('¿Eliminar esta llamada ATC?')) return
    await fetch(`/api/atc/${atcId}`, { method: 'DELETE' })
    onRefresh()
  }

  return (
    <div style={{ background: 'var(--muted)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>Nivel {esc.nivel}</span>
          <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{esc.contactoEscalado}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isRespondido && <span style={{ fontSize: '10px', padding: '2px 8px', background: '#dcfce7', color: '#15803d', borderRadius: '20px', fontWeight: 600 }}>Respondido</span>}
          {isSinRespuesta && <span style={{ fontSize: '10px', padding: '2px 8px', background: '#fee2e2', color: '#b91c1c', borderRadius: '20px', fontWeight: 600 }}>Sin respuesta</span>}
          <span style={{ fontSize: '9px', color: 'var(--muted-foreground)' }}>{horaCreado}</span>
          {!isClosed && isRespondido && (
            <button onClick={() => setEditTiempos(v => !v)} title="Editar tiempos"
              style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: editTiempos ? '#dbeafe' : 'rgba(0,0,0,0.06)', border: `1px solid ${editTiempos ? '#93c5fd' : 'var(--border)'}`, borderRadius: '5px', color: editTiempos ? '#1d4ed8' : 'var(--muted-foreground)', cursor: 'pointer', fontSize: '11px' }}>
              ✎
            </button>
          )}
          {!isClosed && (
            <button onClick={handleDelete} title="Eliminar escalamiento"
              style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '5px', color: '#dc2626', cursor: 'pointer' }}>
              <IcoTrashEsc />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '14px' }}>

        {/* Sección envío: paste aquí guarda con contexto='envio' */}
        <div onPaste={!isClosed ? async (e) => {
          const items = e.clipboardData?.items
          if (!items) return
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              const file = item.getAsFile()
              if (!file) continue
              const reader = new FileReader()
              const dataUrl = await new Promise<string>(res => { reader.onload = ev => res(ev.target!.result as string); reader.readAsDataURL(file) })
              const compressed = await compressImage(dataUrl)
              await fetch('/api/adjuntos', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: compressed, nombre:`captura-${Date.now()}.jpg`, tipo:'image/jpeg', tamanoBytes: Math.round(compressed.length*0.75), escalamientoId: esc.id, contexto: 'envio' }) })
              setEscAdjKey(k => k + 1)
            }
          }
        } : undefined}>

        {/* 1. Contacto */}
        <div style={{ marginBottom: '12px', padding: '10px 12px', background: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>{esc.contactoEscalado}</div>
          {esc.emailContacto && <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>✉ {esc.emailContacto}</div>}
          {esc.telefonoContacto && <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '3px' }}>📱 {esc.telefonoContacto}</div>}
        </div>

        {/* 2. Plantilla */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <button onClick={() => setShowTemplate(v => !v)}
              style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              📄 Plantilla de correo {showTemplate ? '▲' : '▼'}
            </button>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={copyTemplate}
                style={{ fontSize: '10px', padding: '2px 9px', background: copied ? '#14532d' : 'transparent', color: copied ? '#86efac' : 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                {copied ? '✓ Copiado' : '📋 Copiar'}
              </button>
              {!isClosed && (
                <button onClick={() => setTemplateBody(buildCorreo(inc, nivelData, esc.nivel, prevEscs))}
                  style={{ fontSize: '10px', padding: '2px 9px', background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                  🔄 Actualizar
                </button>
              )}
              {showTemplate && !isClosed && (
                <button onClick={saveTemplate} disabled={savingTemplate}
                  style={{ fontSize: '10px', padding: '2px 9px', background: savingTemplate ? 'var(--muted)' : 'hsl(221,83%,45%)', color: savingTemplate ? 'var(--muted-foreground)' : 'white', border: 'none', borderRadius: '4px', cursor: savingTemplate ? 'wait' : 'pointer' }}>
                  {savingTemplate ? 'Guardando...' : '💾 Guardar'}
                </button>
              )}
            </div>
          </div>
          {showTemplate && (
            <textarea
              value={templateBody}
              onChange={e => setTemplateBody(e.target.value)}
              disabled={isClosed}
              style={{ width: '100%', fontSize: '9px', whiteSpace: 'pre-wrap', background: 'var(--card)', padding: '10px 12px', borderRadius: '8px', color: 'var(--foreground)', lineHeight: 1.55, border: '1px solid var(--border)', fontFamily: 'monospace', resize: 'vertical', minHeight: '220px', outline: 'none', boxSizing: 'border-box' }}
            />
          )}
        </div>

        {/* 3. Adjuntos */}
        <div style={{ marginBottom: '12px' }}>
          <AdjuntosZona key={`${escAdjKey}-1`} escalamientoId={esc.id} contexto="envio" disabled={isClosed} />
        </div>

        {/* 4. Correo enviado */}
        {!esc.horaEnvioCorreo && !isClosed && !isSinRespuesta && (
          <button onClick={handleEnvio}
            style={{ width: '100%', padding: '10px', background: 'hsl(221,83%,45%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginBottom: '8px' }}>
            ✉ Correo enviado → Iniciar cronómetro
          </button>
        )}

        </div>{/* /sección envío */}

        {/* Sección respuesta: paste aquí guarda con contexto='respuesta' */}
        <div onPaste={!isClosed ? async (e) => {
          const items = e.clipboardData?.items
          if (!items) return
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              const file = item.getAsFile()
              if (!file) continue
              const reader = new FileReader()
              const dataUrl = await new Promise<string>(res => { reader.onload = ev => res(ev.target!.result as string); reader.readAsDataURL(file) })
              const compressed = await compressImage(dataUrl)
              await fetch('/api/adjuntos', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: compressed, nombre:`captura-${Date.now()}.jpg`, tipo:'image/jpeg', tamanoBytes: Math.round(compressed.length*0.75), escalamientoId: esc.id, contexto: 'respuesta' }) })
              setEscAdjKey(k => k + 1)
            }
          }
        } : undefined}>

        {/* 5. Cronómetro + respuesta */}
        {isCorriendo && (
          <div>
            <CronometroEscalamiento horaEnvio={esc.horaEnvioCorreo} horaRespuesta={esc.horaRespuesta} />
            <div style={{ marginTop: '10px' }}>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Respuesta del proveedor</label>
              <textarea value={respuestaText} onChange={e => setRespuestaText(e.target.value)}
                placeholder="Documenta aquí la respuesta recibida..."
                style={{ width: '100%', padding: '7px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', resize: 'vertical', minHeight: '60px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginTop: '8px' }}>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Tiempo estimado de solución</label>
              <input value={tiempoEstText} onChange={e => setTiempoEstText(e.target.value)}
                placeholder="Ej: 2 horas, antes de las 3pm"
                style={{ width: '100%', padding: '7px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
            </div>
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Adjuntos respuesta</div>
              <AdjuntosZona key={`${escAdjKey}-2`} escalamientoId={esc.id} contexto="respuesta" disabled={isClosed} />
            </div>
            {!isClosed && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>
                    Hora de respuesta <span style={{ fontWeight: 400, textTransform: 'none' }}>(dejar vacío = ahora)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={horaRespManual}
                    onChange={e => setHoraRespManual(e.target.value)}
                    style={{ padding: '5px 8px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleRespuesta} disabled={saving}
                    style={{ flex: 1, padding: '8px', background: '#14532d', color: '#86efac', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
                    {saving ? 'Guardando...' : '✓ Registrar respuesta recibida'}
                  </button>
                  <button onClick={handleSinRespuesta}
                    style={{ flex: 1, padding: '8px', background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '8px', fontSize: '11px', cursor: 'pointer' }}>
                    ✗ No hubo respuesta
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Respondido */}
        {isRespondido && (
          <div style={{ marginBottom: '8px' }}>
            <div style={{ padding: '10px 12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#15803d' }}>
                ✓ Respondido en {minToHM(esc.tiempoRespuestaMin)} · {new Date(esc.horaRespuesta).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}
              </div>
              {esc.tiempoEstimadoSolucion && <div style={{ fontSize: '10px', color: '#15803d', marginTop: '3px' }}>Estimado proveedor: {esc.tiempoEstimadoSolucion}</div>}
              {esc.respuestaTexto && <div style={{ fontSize: '11px', color: 'var(--foreground)', marginTop: '6px', whiteSpace: 'pre-wrap' }}>{esc.respuestaTexto}</div>}
            </div>
            {editTiempos && (
              <div style={{ marginTop: '8px', padding: '10px 12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #93c5fd', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Corregir tiempos</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>Hora envío N{esc.nivel}</div>
                    <input type="datetime-local" value={horaEnvioEdit} onChange={e => setHoraEnvioEdit(e.target.value)}
                      style={{ width: '100%', padding: '5px 7px', fontSize: '11px', border: '1px solid #93c5fd', borderRadius: '6px', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>Hora respuesta</div>
                    <input type="datetime-local" value={horaRespEdit} onChange={e => setHoraRespEdit(e.target.value)}
                      style={{ width: '100%', padding: '5px 7px', fontSize: '11px', border: '1px solid #93c5fd', borderRadius: '6px', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <button onClick={handleGuardarTiempos} disabled={savingTiempos}
                  style={{ padding: '6px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: savingTiempos ? 'wait' : 'pointer' }}>
                  {savingTiempos ? 'Guardando...' : 'Guardar tiempos'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sin respuesta */}
        {isSinRespuesta && !isRespondido && (
          <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid rgba(220,38,38,0.3)', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#b91c1c' }}>✗ No hubo respuesta del proveedor</div>
          </div>
        )}

        </div>{/* /sección respuesta */}

        {/* ATC */}
        <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
          <button onClick={() => setShowAtc(v => !v)}
            style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <IcoPhone /> Llamadas ATC {(esc.atcLlamadas?.length ?? 0) > 0 ? `(${esc.atcLlamadas.length})` : ''} {showAtc ? '▲' : '▼'}
          </button>
          {showAtc && (
            <div style={{ marginTop: '10px' }}>
              {(esc.atcLlamadas ?? []).map((atc: any) => (
                <AtcLlamadaRow key={atc.id} atc={atc} isClosed={isClosed}
                  onFin={() => finalizarAtc(atc.id)}
                  onSaveNotas={notas => guardarNotasAtc(atc.id, notas)}
                  onDelete={() => eliminarAtc(atc.id)}
                />
              ))}
              {!isClosed && (
                <button onClick={iniciarAtc}
                  style={{ width: '100%', marginTop: '4px', padding: '7px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                  <IcoPhone /> Iniciar nueva llamada ATC
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
