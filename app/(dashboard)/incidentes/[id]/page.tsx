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
import { parseEtaMin } from '@/lib/sla-core'
import { apiMutate } from '@/lib/api-mutate'

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
  const [tick, setTick]             = useState(0)
  const [historial, setHistorial]   = useState<any[]>([])
  const [editForm, setEditForm]     = useState<any>({})
  const [todosRouters, setTodosRouters] = useState<{ id: string; codigo: string; estado: string; tiendaActualId: string | null; tiendaCodigo: string | null; almacenActual: string | null }[]>([])
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [contNotice, setContNotice] = useState(false)
  const [supervisorEdit, setSupervisorEdit] = useState(false)
  const [showReopenModal, setShowReopenModal] = useState(false)
  const [showReopenWarning, setShowReopenWarning] = useState(false)
  const [minutosDesdeResolucion, setMinutosDesdeResolucion] = useState(0)
  const [reopenMotivo, setReopenMotivo] = useState<'TIENDA_SIN_INTERNET' | 'ERROR_AGENTE' | null>(null)
  const [reopenJustificacion, setReopenJustificacion] = useState('')
  const [reopening, setReopening]   = useState(false)
  const [showGuia, setShowGuia]       = useState(false)
  const [showResolverModal, setShowResolverModal] = useState(false)
  const [resolverMode, setResolverMode] = useState<'PROVEEDOR' | 'AGENTE' | 'INFRAESTRUCTURA' | 'ENERGIA_ELECTRICA' | null>(null)
  const [skipConfirm, setSkipConfirm] = useState<{ nivel: number; saltar: number } | null>(null)

  // Escalamiento
  const [showNivelMenu, setShowNivelMenu] = useState(false)

  // Escalamiento a Infraestructura
  const [showInfraModal, setShowInfraModal]       = useState(false)
  const [infraAgentes, setInfraAgentes]           = useState<any[]>([])
  const [infraLoadingAg, setInfraLoadingAg]       = useState(false)
  const [infraSelectedId, setInfraSelectedId]     = useState('')
  const [infraNota, setInfraNota]                 = useState('')
  const [infraSaving, setInfraSaving]             = useState(false)
  const [infraError, setInfraError]               = useState('')

  // Bloques operación (colapsables)
  const [showContBlock, setShowContBlock] = useState(false)
  const [showMovBlock,  setShowMovBlock]  = useState(false)
  const [showBoletaBlock, setShowBoletaBlock] = useState(false)

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
      horaRegistro:         toDatetimeLocal(data.horaRegistro),
      horaRegistroOriginal: toDatetimeLocal(data.horaRegistroOriginal),
      horaFin:              toDatetimeLocal(data.horaFin),
      // Operación / gestión
      estadoOperacion:     data.estadoOperacion     ?? '',
      contActivadoPor:     data.contActivadoPor     ?? '',
      contEsExterno:       data.contEsExterno       ?? false,
      contHoraActivacion:  toDatetimeLocal(data.contHoraActivacion),
      contRendimiento:     data.contRendimiento     ?? '',
      contObservacion:     data.contObservacion     ?? '',
      movActivadoPor:      data.movActivadoPor      ?? '',
      movHoraActivacion:   toDatetimeLocal(data.movHoraActivacion),
      movRendimiento:      data.movRendimiento      ?? '',
      movObservacion:      data.movObservacion      ?? '',
      contHoraDesactivacion: toDatetimeLocal(data.contHoraDesactivacion),
      movHoraDesactivacion:  toDatetimeLocal(data.movHoraDesactivacion),
      routerExternoId:       data.routerExternoId ?? null,
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
      boletaHoraActivacion: toDatetimeLocal(data.boletaHoraActivacion),
      ventaParcial:        data.ventaParcial        ?? null,
      cajasAfectadas:      data.cajasAfectadas      ?? null,
      cajasTotales:        data.cajasTotales        ?? null,
      alcanceCorte:        data.alcanceCorte        ?? null,
      tuvoUps:             data.tuvoUps             ?? null,
    })
    setShowContBlock(data.estadoOperacion === 'CONTINGENCIA' || !!data.contActivadoPor)
    setShowMovBlock(data.estadoOperacion === 'DATOS_MOVILES'  || !!data.movActivadoPor)
    setShowBoletaBlock(data.estadoOperacion === 'BOLETA_MANUAL')
  }, [id])

  useEffect(() => { fetchInc() }, [fetchInc])
  useEffect(() => {
    fetch('/api/routers-externos')
      .then(r => r.json())
      .then((data: any) => {
        const rows = Array.isArray(data) ? data : []
        setTodosRouters(rows.map((r: any) => ({
          id:            r.id,
          codigo:        r.codigo,
          estado:        r.estado,
          tiendaActualId: r.tienda_actual_id ?? null,
          tiendaCodigo:  r.tienda_codigo ?? null,
          almacenActual: r.almacen_actual ?? null,
        })))
      })
      .catch(() => setTodosRouters([]))
  }, [])
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

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
  const userRol    = (session?.user as any)?.rol ?? ''
  const isClosed   = ['RESUELTO', 'CANCELADO', 'CERRADO'].includes(inc.estado)
  // canManage: solo SUPERVISOR y DEMO pueden editar incidentes cerrados
  const canManage  = ['SUPERVISOR', 'DEMO'].includes(userRol)
  const isMyInc    = userEmail === inc.agenteEmail
  // canEditB: cuando abierto → cualquiera con incidentes.editar; cuando cerrado → solo supervisor/demo
  const canEditB   = canManage || (can(session, 'incidentes.editar') && !isClosed)
  const canEditA   = canManage && supervisorEdit
  const isSupervisor = userRol === 'SUPERVISOR'
  const canDelete  = can(session, 'incidentes.eliminar')

  function setEdit(k: string, v: any) { setEditForm((f: any) => ({ ...f, [k]: v })) }

  function handleEstadoOperacion(val: string) {
    const seals: any = {}
    if (editForm.estadoOperacion === 'CONTINGENCIA' && editForm.contActivadoPor && !editForm.contHoraDesactivacion) {
      seals.contHoraDesactivacion = toDatetimeLocal(new Date().toISOString())
    }
    if (editForm.estadoOperacion === 'DATOS_MOVILES' && editForm.movActivadoPor && !editForm.movHoraDesactivacion) {
      seals.movHoraDesactivacion = toDatetimeLocal(new Date().toISOString())
    }
    setEditForm((f: any) => ({ ...f, estadoOperacion: val, ...seals }))
    setShowContBlock(val === 'CONTINGENCIA' || !!editForm.contActivadoPor)
    setShowMovBlock(val === 'DATOS_MOVILES'  || !!editForm.movActivadoPor)
    setShowBoletaBlock(val === 'BOLETA_MANUAL')
  }

  async function handleDesactivarCont() {
    const { ok } = await apiMutate(`/api/incidentes/${id}`, {
      method: 'PUT',
      json: { contHoraDesactivacion: new Date().toISOString() },
      errorPrefix: 'No se pudo desactivar la contingencia',
    })
    if (!ok) return
    fetchInc()
  }

  async function handleDesactivarMov() {
    const { ok } = await apiMutate(`/api/incidentes/${id}`, {
      method: 'PUT',
      json: { movHoraDesactivacion: new Date().toISOString() },
      errorPrefix: 'No se pudo desactivar los datos móviles',
    })
    if (!ok) return
    fetchInc()
  }

  async function handleSave() {
    setSaving(true)
    const body: any = { ...editForm }
    if ('horaRegistro'         in body) body.horaRegistro         = fromDatetimeLocal(body.horaRegistro)
    if ('horaRegistroOriginal' in body) body.horaRegistroOriginal = body.horaRegistroOriginal ? fromDatetimeLocal(body.horaRegistroOriginal) : null
    if ('horaFin'              in body) body.horaFin              = body.horaFin ? fromDatetimeLocal(body.horaFin) : null
    if (body.horaRegistro && body.horaFin) {
      body.mttrMinutos = mttrFromHoras(body.horaRegistro, body.horaFin)
    } else if (body.horaFin === null) {
      body.mttrMinutos = null
    }
    if ('contHoraActivacion'    in body) body.contHoraActivacion    = body.contHoraActivacion    ? fromDatetimeLocal(body.contHoraActivacion)    : null
    if ('movHoraActivacion'     in body) body.movHoraActivacion     = body.movHoraActivacion     ? fromDatetimeLocal(body.movHoraActivacion)     : null
    if ('contHoraDesactivacion' in body) body.contHoraDesactivacion = body.contHoraDesactivacion ? fromDatetimeLocal(body.contHoraDesactivacion) : null
    if ('movHoraDesactivacion'  in body) body.movHoraDesactivacion  = body.movHoraDesactivacion  ? fromDatetimeLocal(body.movHoraDesactivacion)  : null
    if ('boletaHoraActivacion'  in body) body.boletaHoraActivacion  = body.boletaHoraActivacion  ? fromDatetimeLocal(body.boletaHoraActivacion)  : null
    // Factor operativo: EFECTIVO=100%, PARCIAL=75%, NULO=0% (más legacy)
    const rfUnif: Record<string, string> = {
      EFECTIVO: '1.00', PARCIAL: '0.75', NULO: '0.00',
      TOTAL: '1.00',                                     // boleta manual
      EFECTIVA: '0.75', LIMITADA: '0.25', FALLIDA: '0.00', NO_FUNCIONO: '0.00', // legacy
    }
    if (body.estadoOperacion === 'BOLETA_MANUAL') {
      body.factorOperativo = rfUnif[body.contRendimiento] ?? '1.00'
      body.operacionManual = true; body.tipoOperacionManual = 'BOLETA_MANUAL'
      body.boletaManual = true
      body.boletaRendimiento = body.contRendimiento || null
    } else if (body.estadoOperacion === 'CONTINGENCIA') {
      body.factorOperativo = rfUnif[body.contRendimiento] ?? null
      body.operacionManual = false; body.tipoOperacionManual = null
    } else if (body.estadoOperacion === 'DATOS_MOVILES') {
      body.factorOperativo = rfUnif[body.movRendimiento] ?? null
      body.operacionManual = false; body.tipoOperacionManual = null
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

  async function doResolver(modo: 'PROVEEDOR' | 'AGENTE' | 'INFRAESTRUCTURA' | 'ENERGIA_ELECTRICA') {
    setShowResolverModal(false); setResolverMode(null)
    const body = modo === 'AGENTE'
      ? { resueltoPor: 'AGENTE',             atribucionFinal: 'Gestión interna Service Desk',    evaluableProveedor: false }
      : modo === 'INFRAESTRUCTURA'
      ? { resueltoPor: 'INFRAESTRUCTURA',    atribucionFinal: 'Gestión Infraestructura interna', evaluableProveedor: false }
      : modo === 'ENERGIA_ELECTRICA'
      ? { resueltoPor: 'ENERGIA_ELECTRICA',  atribucionFinal: 'Regresó energía eléctrica',       evaluableProveedor: false }
      : { resueltoPor: 'PROVEEDOR' }
    const { ok, data } = await apiMutate(`/api/incidentes/${id}/resolver`, {
      method: 'POST',
      json: body,
      errorPrefix: 'No se pudo resolver el incidente',
    })
    if (!ok) return
    if (data?.contingenciaMantieneActiva) setContNotice(true)
    fetchInc()
  }

  async function openInfraModal() {
    setShowNivelMenu(false)
    setInfraSelectedId(''); setInfraNota(''); setInfraError('')
    setShowInfraModal(true)
    if (infraAgentes.length === 0) {
      setInfraLoadingAg(true)
      const r = await fetch('/api/usuarios/infra')
      const d = await r.json()
      setInfraAgentes(Array.isArray(d) ? d : [])
      setInfraLoadingAg(false)
    }
  }

  async function handleEscalarInfra() {
    if (!infraSelectedId) { setInfraError('Selecciona un agente de infraestructura'); return }
    setInfraSaving(true)
    const { ok } = await apiMutate(`/api/incidentes/${id}`, {
      method: 'PUT',
      json: { escaladoInfraId: infraSelectedId, horaEscaladoInfra: new Date().toISOString(), notaEscaladoInfra: infraNota || null },
      errorPrefix: 'No se pudo escalar a infraestructura',
    })
    setInfraSaving(false)
    if (!ok) return
    setShowInfraModal(false); fetchInc()
  }

  async function handleCancelar() {
    if (!confirm('¿Cancelar este incidente?')) return
    const { ok } = await apiMutate(`/api/incidentes/${id}/cancelar`, { method: 'POST', errorPrefix: 'No se pudo cancelar el incidente' })
    if (!ok) return
    fetchInc()
  }

  async function handleEliminar() {
    if (!confirm(`¿Eliminar permanentemente el incidente ${inc.codigo}? Esta acción no se puede deshacer.`)) return
    const { ok } = await apiMutate(`/api/incidentes/${id}`, { method: 'DELETE', errorPrefix: 'No se pudo eliminar el incidente' })
    if (ok) router.push('/incidentes')
  }

  async function handleReopen() {
    if (!reopenMotivo) return
    setReopening(true)
    const { ok } = await apiMutate(`/api/incidentes/${id}/reabrir`, {
      method: 'POST',
      json: { motivo: reopenMotivo, justificacion: reopenJustificacion },
      errorPrefix: 'No se pudo reabrir el incidente',
    })
    setReopening(false)
    if (!ok) return
    setShowReopenModal(false)
    setReopenMotivo(null)
    setReopenJustificacion('')
    fetchInc()
  }

  async function doEscalar(nivel: number) {
    const nivelData = inc.nivelesProveedor?.find((n: any) => n.nivel === nivel)
    const prevEscs = [...(inc.escalamientos ?? [])].sort((a: any, b: any) => a.nivel - b.nivel).filter((e: any) => e.nivel < nivel)
    const cuerpoCorreo = buildCorreo(inc, nivelData, nivel, prevEscs)
    const { ok } = await apiMutate(`/api/incidentes/${id}/escalar`, {
      method: 'POST',
      json: {
        nivel,
        fichaNivelId:           nivelData?.id             ?? null,
        contactoEscalado:       nivelData?.nombreContacto ?? `Nivel ${nivel}`,
        emailContacto:          nivelData?.email          ?? '',
        telefonoContacto:       nivelData?.celular        ?? null,
        tiempoEstimadoSolucion: null,
        cuerpoCorreo,
      },
      errorPrefix: 'No se pudo escalar',
    })
    if (!ok) return
    fetchInc()
    setTimeout(() => escRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200)
  }

  function handleEscalarNivel(nivel: number) {
    setShowNivelMenu(false)
    const sortedEscs = [...(inc.escalamientos ?? [])].sort((a: any, b: any) => a.nivel - b.nivel)
    const lastEsc = sortedEscs[sortedEscs.length - 1]
    if (lastEsc && !lastEsc.horaRespuesta && !lastEsc.noHuboRespuesta) {
      alert(`Estás esperando aún la respuesta del nivel ${lastEsc.nivel}. Dale un estado para poder continuar con el escalamiento.`)
      return
    }
    const existingNiveles = (inc.escalamientos ?? []).map((e: any) => e.nivel as number)
    const expectedNivel = existingNiveles.length > 0 ? Math.max(...existingNiveles) + 1 : 1
    if (nivel > expectedNivel) {
      setSkipConfirm({ nivel, saltar: expectedNivel })
      return
    }
    doEscalar(nivel)
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
              {!isClosed && (inc.escalamientos ?? []).some((e: any) =>
                e.horaEnvioCorreo && !e.horaRespuesta && !e.noHuboRespuesta &&
                Date.now() - new Date(e.horaEnvioCorreo).getTime() > 60 * 60000
              ) && (
                <span title="SLA de respuesta excedido" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#fca5a5', fontWeight: 600 }}>
                  <span className="nd-pulse" style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                  SLA vencido
                </span>
              )}
              {inc.escaladoInfraId && !isClosed && (
                <span style={{ fontSize: '10px', background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.04em' }}>
                  🔧 INFRAESTRUCTURA
                </span>
              )}
              {inc.estado === 'RESUELTO' && inc.resueltoPor && (
                <span style={{
                  fontSize: '10px',
                  background: inc.resueltoPor === 'AGENTE' ? 'rgba(59,130,246,0.25)' : inc.resueltoPor === 'INFRAESTRUCTURA' ? 'rgba(99,102,241,0.25)' : inc.resueltoPor === 'ENERGIA_ELECTRICA' ? 'rgba(234,179,8,0.25)' : 'rgba(34,197,94,0.25)',
                  color:      inc.resueltoPor === 'AGENTE' ? '#93c5fd'               : inc.resueltoPor === 'INFRAESTRUCTURA' ? '#a5b4fc'               : inc.resueltoPor === 'ENERGIA_ELECTRICA' ? '#fde047'              : '#86efac',
                  padding: '2px 8px', borderRadius: '4px', fontWeight: 600,
                }}>
                  {inc.resueltoPor === 'AGENTE' ? 'Resuelto por Agente' : inc.resueltoPor === 'INFRAESTRUCTURA' ? 'Resuelto por Infraestructura' : inc.resueltoPor === 'ENERGIA_ELECTRICA' ? '⚡ Regresó energía eléctrica' : 'Resuelto por Proveedor'}
                </span>
              )}
              {(inc as any).motivoReabertura && (
                <span
                  title={(inc as any).motivoReabertura === 'TIENDA_SIN_INTERNET' ? 'Reabierto — solución incorrecta del proveedor' : 'Reabierto — error de gestión de agente'}
                  style={{
                    fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                    background: (inc as any).motivoReabertura === 'TIENDA_SIN_INTERNET' ? 'rgba(185,28,28,0.25)' : 'rgba(146,64,14,0.25)',
                    color:      (inc as any).motivoReabertura === 'TIENDA_SIN_INTERNET' ? '#fca5a5'              : '#fcd34d',
                  }}>
                  ↩ reabierto
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
              {inc.tipo === 'CORTE_ELECTRICO' ? '⚡ Energía Eléctrica' : (inc.proveedorNombre ?? '—')} · {inc.tiendaDistrito}
              {inc.escaladoInfraId
                ? <> · <span style={{ color: '#a5b4fc' }}>Infra: {[inc.infraNombre, inc.infraApellido].filter(Boolean).join(' ')}</span> · Escalado por: {inc.agenteNombre}</>
                : <> · Agente: {inc.agenteNombre}</>
              }
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
            {canDelete && (
              <button onClick={handleEliminar} title="Eliminar incidente"
                style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: '6px', color: '#fca5a5', cursor: 'pointer', flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>
            )}
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
            <CronometroPrincipal horaRegistro={inc.horaRegistro} horaFin={inc.horaFin} tiempoAcumuladoMin={(inc as any).tiempoAcumuladoMin} horaRegistroOriginal={(inc as any).horaRegistroOriginal} />
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.22)', textAlign: 'right', lineHeight: 1.5 }}>
              Creado: {new Date((inc as any).horaRegistroOriginal ?? inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Reopen modal ── */}
      {showReopenModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '420px', margin: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Reabrir incidente</div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '20px', lineHeight: 1.5 }}>
              El cronómetro se reinicia desde ahora. El tiempo activo anterior se acumula y se sumará al MTTR final.
            </div>

            {/* Paso 1 — Seleccionar motivo */}
            {!reopenMotivo && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                  ¿Por qué se reabre?
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={() => setReopenMotivo('TIENDA_SIN_INTERNET')}
                    style={{ padding: '12px 14px', background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#b91c1c', marginBottom: '2px' }}>
                      Tienda nuevamente sin internet
                    </div>
                    <div style={{ fontSize: '10px', color: '#991b1b' }}>
                      El proveedor planteó una solución incorrecta — el servicio volvió a caer.
                    </div>
                  </button>
                  <button
                    onClick={() => setReopenMotivo('ERROR_AGENTE')}
                    style={{ padding: '12px 14px', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', marginBottom: '2px' }}>
                      Error de gestión de agente
                    </div>
                    <div style={{ fontSize: '10px', color: '#78350f' }}>
                      El incidente se cerró por error — el servicio aún no estaba restablecido.
                    </div>
                  </button>
                </div>
                <button
                  onClick={() => { setShowReopenModal(false); setReopenMotivo(null); setReopenJustificacion('') }}
                  style={{ width: '100%', marginTop: '12px', padding: '8px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </>
            )}

            {/* Paso 2 — Justificación */}
            {reopenMotivo && (
              <>
                <div style={{
                  padding: '8px 12px', borderRadius: '7px', marginBottom: '14px', fontSize: '11px', fontWeight: 600,
                  background: reopenMotivo === 'TIENDA_SIN_INTERNET' ? '#fef2f2' : '#fffbeb',
                  color: reopenMotivo === 'TIENDA_SIN_INTERNET' ? '#b91c1c' : '#92400e',
                  border: `1px solid ${reopenMotivo === 'TIENDA_SIN_INTERNET' ? '#fca5a5' : '#fde68a'}`,
                }}>
                  {reopenMotivo === 'TIENDA_SIN_INTERNET' ? '🔴 Tienda nuevamente sin internet' : '⚠️ Error de gestión de agente'}
                  <button
                    onClick={() => setReopenMotivo(null)}
                    style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'inherit', opacity: 0.6 }}
                  >
                    cambiar
                  </button>
                </div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px' }}>
                  Justificación
                </div>
                <textarea
                  value={reopenJustificacion}
                  onChange={e => setReopenJustificacion(e.target.value)}
                  placeholder="Describe brevemente la situación..."
                  autoFocus
                  style={{ width: '100%', padding: '8px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--muted)', color: 'var(--foreground)', outline: 'none', minHeight: '72px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                  <button
                    onClick={() => { setShowReopenModal(false); setReopenMotivo(null); setReopenJustificacion('') }}
                    style={{ flex: 1, padding: '8px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleReopen}
                    disabled={reopening || !reopenJustificacion.trim()}
                    style={{ flex: 1, padding: '8px', background: (!reopenJustificacion.trim() || reopening) ? 'var(--muted)' : '#92400e', color: (!reopenJustificacion.trim() || reopening) ? 'var(--muted-foreground)' : '#fde68a', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: (reopening || !reopenJustificacion.trim()) ? 'not-allowed' : 'pointer' }}
                  >
                    {reopening ? 'Reabriendo...' : 'Confirmar reapertura'}
                  </button>
                </div>
              </>
            )}
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
              Si el servicio estuvo operativo ese tiempo, esto es una nueva falla independiente. Un incidente nuevo mantiene los registros limpios y el análisis de proveedores preciso.
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

      {/* ── Skip nivel confirm modal ── */}
      {skipConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '380px', margin: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>¿Estás seguro de saltar el N{skipConfirm.saltar}?</div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '20px' }}>Se registrará un escalamiento de Nivel {skipConfirm.nivel} sin pasar por el N{skipConfirm.saltar}.</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setSkipConfirm(null)}
                style={{ flex: 1, padding: '8px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => { doEscalar(skipConfirm.nivel); setSkipConfirm(null) }}
                style={{ flex: 1, padding: '8px', background: 'hsl(221,83%,45%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                Sí, saltar N{skipConfirm.saltar}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resolver modal — paso 1: elegir modo ── */}
      {showResolverModal && !resolverMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '360px', margin: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>¿Cómo se resolvió?</div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <button onClick={() => setResolverMode('PROVEEDOR')}
                style={{ flex: 1, minWidth: '80px', padding: '16px 8px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--muted)', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', marginBottom: '4px' }}>🌐</div>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>Proveedor</div>
              </button>
              {isSupervisor && inc.escaladoInfraId ? (
                <button onClick={() => setResolverMode('INFRAESTRUCTURA')}
                  style={{ flex: 1, minWidth: '80px', padding: '16px 8px', border: '1.5px solid rgba(99,102,241,.4)', borderRadius: '10px', background: 'rgba(99,102,241,.07)', cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', marginBottom: '4px' }}>🔧</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#4f46e5' }}>Infraestructura</div>
                </button>
              ) : (
                <button onClick={() => setResolverMode('AGENTE')}
                  style={{ flex: 1, minWidth: '80px', padding: '16px 8px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--muted)', cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', marginBottom: '4px' }}>👤</div>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>Agente</div>
                </button>
              )}
              {inc.tipo === 'CORTE_ELECTRICO' && (
                <button onClick={() => setResolverMode('ENERGIA_ELECTRICA')}
                  style={{ flex: 1, minWidth: '80px', padding: '16px 8px', border: '1.5px solid rgba(234,179,8,.4)', borderRadius: '10px', background: 'rgba(234,179,8,.07)', cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', marginBottom: '4px' }}>⚡</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#ca8a04' }}>Regresó energía</div>
                </button>
              )}
            </div>
            <button onClick={() => setShowResolverModal(false)}
              style={{ width: '100%', padding: '8px', background: 'none', border: 'none', color: 'var(--muted-foreground)', fontSize: '12px', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Resolver modal — paso 2: confirmar ── */}
      {showResolverModal && resolverMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '360px', margin: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
              {resolverMode === 'ENERGIA_ELECTRICA'
                ? '⚡ ¿Confirmas que regresó la energía eléctrica?'
                : `¿Confirmas resolución por ${resolverMode === 'PROVEEDOR' ? 'Proveedor' : resolverMode === 'INFRAESTRUCTURA' ? 'Infraestructura' : 'Agente'}?`}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '20px' }}>
              Se registrará la hora actual como fin del incidente.
              {(resolverMode === 'AGENTE' || resolverMode === 'INFRAESTRUCTURA' || resolverMode === 'ENERGIA_ELECTRICA') && ' No evaluable al proveedor.'}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setResolverMode(null)}
                style={{ flex: 1, padding: '8px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                ← Volver
              </button>
              <button onClick={() => doResolver(resolverMode)}
                style={{ flex: 1, padding: '8px', background: '#14532d', color: '#86efac', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                Sí, resuelto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Escalar a Infraestructura ── */}
      {showInfraModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px 24px', width: '400px', maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>🔧 Escalar a Infraestructura</div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '14px' }}>Selecciona el agente que tomará el caso. El incidente quedará asignado a él.</div>
            {infraLoadingAg ? (
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', padding: '12px 0' }}>Cargando agentes...</div>
            ) : infraAgentes.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#b91c1c', padding: '12px 0' }}>No hay agentes de infraestructura registrados.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {infraAgentes.map(ag => (
                  <button key={ag.id} onClick={() => setInfraSelectedId(ag.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: infraSelectedId === ag.id ? 'rgba(99,102,241,.1)' : 'var(--muted)', border: `1.5px solid ${infraSelectedId === ag.id ? '#818cf8' : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(99,102,241,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#4f46e5', flexShrink: 0 }}>
                      {ag.nombre?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>{[ag.nombre, ag.apellido].filter(Boolean).join(' ')}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{ag.email}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>Nota (opcional)</div>
              <textarea value={infraNota} onChange={e => setInfraNota(e.target.value)} placeholder="Motivo del escalamiento, contexto..."
                style={{ ...taStyle(), fontSize: '11px', minHeight: '60px' }} />
            </div>
            {infraError && <div style={{ fontSize: '11px', color: '#b91c1c', marginBottom: '8px' }}>{infraError}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInfraModal(false)} style={{ padding: '7px 14px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleEscalarInfra} disabled={infraSaving || !infraSelectedId}
                style={{ padding: '7px 14px', background: infraSaving || !infraSelectedId ? '#c7d2fe' : '#4f46e5', color: 'white', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: infraSaving || !infraSelectedId ? 'not-allowed' : 'pointer' }}>
                {infraSaving ? 'Escalando...' : 'Confirmar'}
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
                  {editForm.tipo !== 'CORTE_ELECTRICO' && <option value="CONTINGENCIA">Operación con contingencia</option>}
                  {editForm.tipo !== 'CORTE_ELECTRICO' && <option value="DATOS_MOVILES">Operación con datos móviles</option>}
                  <option value="BOLETA_MANUAL">Operación con boletas manuales</option>
                  {editForm.tipo !== 'CORTE_ELECTRICO' && <option value="CAIDA">Operación con caída</option>}
                </select>
              </div>
            </div>

            {/* Bloque Contingencia — colapsable */}
            {(editForm.estadoOperacion === 'CONTINGENCIA' || !!inc.contActivadoPor) && (() => {
              const rend = editForm.contRendimiento
              const rendLabel: Record<string,string> = { EFECTIVO:'Efectivo', PARCIAL:'Parcial', NULO:'Sin cobertura', TOTAL:'Cubrió total', FALLIDA:'No funcionó' }
              const summary = [editForm.contActivadoPor && `Por: ${editForm.contActivadoPor}`, rend && rendLabel[rend]].filter(Boolean).join(' · ')
              const contSellada = !!inc.contHoraDesactivacion
              // Nunca bloquear por sellado — auto-deactivation handles it
              const contDis = !canEditB
              return (
                <div style={{ border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '14px', overflow: 'hidden' }}>
                  <button type="button" onClick={() => setShowContBlock(v => !v)}
                    style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background: 'var(--muted)', border:'none', cursor:'pointer', textAlign:'left' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <span style={{ fontSize:'12px', fontWeight:600, color: 'var(--foreground)' }}>
                        {editForm.contEsExterno ? 'Contingencia externa' : 'Contingencia'}
                      </span>
                      {!showContBlock && summary && <span style={{ fontSize:'10px', color:'var(--muted-foreground)' }}>{summary}</span>}
                      {!showContBlock && inc.contHoraActivacion && (() => {
                        const fin = inc.contHoraDesactivacion ?? (isClosed ? inc.horaFin : null)
                        const mins = fin
                          ? Math.round((new Date(fin).getTime() - new Date(inc.contHoraActivacion).getTime()) / 60000)
                          : Math.round((Date.now() - new Date(inc.contHoraActivacion).getTime()) / 60000)
                        const horaStr = toDatetimeLocal(inc.contHoraActivacion).slice(11, 16)
                        return <span style={{ fontSize:'10px', color: fin ? 'var(--muted-foreground)' : '#d97706', fontFamily:'monospace' }}>· {horaStr} · {minToHM(mins)}{!fin ? ' ⏱' : ''}</span>
                      })()}
                    </div>
                    <span style={{ fontSize:'10px', color:'var(--muted-foreground)' }}>{showContBlock ? '▲' : '▼'}</span>
                  </button>
                  {showContBlock && (
                    <div style={{ padding:'14px', background:'var(--muted)' }}>
                      {/* Tipo: badge fijo si ya activado; selector si aún no */}
                      {editForm.contActivadoPor ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '12px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tipo</span>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)' }}>
                            {editForm.contEsExterno ? 'Router externo' : 'Router propio'}
                          </span>
                        </div>
                      ) : inc?.tiendaTieneContingencia ? (
                        /* Tienda con contingencia propia: toggle propio ↔ externo */
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', padding: '8px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                          <button type="button" disabled={contDis} onClick={() => setEdit('contEsExterno', !editForm.contEsExterno)}
                            style={{ width:'36px', height:'20px', borderRadius:'10px', border:'none', cursor: contDis ? 'default' : 'pointer', background: editForm.contEsExterno ? 'hsl(221,83%,23%)' : '#d1d5db', position:'relative', flexShrink:0, transition:'background 0.2s' }}>
                            <span style={{ position:'absolute', top:'2px', left: editForm.contEsExterno ? '18px' : '2px', width:'16px', height:'16px', borderRadius:'50%', background:'white', transition:'left 0.2s' }} />
                          </button>
                          <div>
                            <div style={{ fontSize:'11px', fontWeight: editForm.contEsExterno ? 700 : 400, color: 'var(--foreground)' }}>
                              Router externo (llevado a tienda)
                            </div>
                            <div style={{ fontSize:'10px', color:'var(--muted-foreground)' }}>
                              {editForm.contEsExterno ? 'Se llevó equipo externo a esta tienda' : 'La tienda usó su contingencia propia'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Tienda sin contingencia propia: solo externo disponible */
                        <div style={{ marginBottom: '12px', padding: '7px 10px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)' }}>Router externo</span>
                          <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>— La tienda no tiene contingencia propia registrada</span>
                        </div>
                      )}

                      {/* Selector de router externo — solo cuando contEsExterno y aún no activado */}
                      {editForm.contEsExterno && !editForm.contActivadoPor && !contSellada && (() => {
                        const enEstaTienda = todosRouters.filter(r => r.estado === 'EN_TIENDA_INACTIVO' && r.tiendaActualId === inc?.tiendaId)
                        const enUso        = todosRouters.filter(r => r.estado === 'EN_TIENDA_ACTIVO')
                        const otrosLugares = todosRouters.filter(r => r.estado !== 'EN_TIENDA_ACTIVO' && !(r.estado === 'EN_TIENDA_INACTIVO' && r.tiendaActualId === inc?.tiendaId))
                        return (
                          <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px' }}>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Router externo a utilizar</label>
                            <select
                              disabled={contDis}
                              value={editForm.routerExternoId ?? ''}
                              onChange={e => setEdit('routerExternoId', e.target.value || null)}
                              style={{ width: '100%', padding: '6px 9px', fontSize: '12px', border: '0.5px solid #FCD34D', borderRadius: '6px', background: 'white', color: '#92400E' }}>
                              <option value="">— Seleccionar router —</option>
                              {enEstaTienda.length > 0 && (
                                <optgroup label={`En esta tienda — disponibles (${enEstaTienda.length})`}>
                                  {enEstaTienda.map(r => (
                                    <option key={r.id} value={r.id}>{r.codigo}</option>
                                  ))}
                                </optgroup>
                              )}
                              {enUso.length > 0 && (
                                <optgroup label="En uso en otro incidente">
                                  {enUso.map(r => (
                                    <option key={r.id} value={r.id} disabled>{r.codigo} — {r.tiendaCodigo ?? 'en tienda'} (activo)</option>
                                  ))}
                                </optgroup>
                              )}
                              {otrosLugares.length > 0 && (
                                <optgroup label="En almacén u otra tienda">
                                  {otrosLugares.map(r => (
                                    <option key={r.id} value={r.id} disabled>
                                      {r.codigo} — {r.estado === 'DISPONIBLE' ? (r.almacenActual ?? 'Almacén TI') : `${r.tiendaCodigo ?? 'otra tienda'} (inactivo)`}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                            {enEstaTienda.length === 0 && (
                              <div style={{ fontSize: '10px', color: '#92400E', marginTop: '4px', opacity: 0.8 }}>
                                Sin routers en esta tienda. Primero despliega un router desde Routers Contingencia TI.
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {/* Router asignado (read-only cuando ya está activado) */}
                      {editForm.contEsExterno && editForm.contActivadoPor && inc?.routerExternoId && (
                        <div style={{ marginBottom: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '6px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Router</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', color: '#92400E' }}>{todosRouters.find(r => r.id === inc.routerExternoId)?.codigo ?? 'RE-???'}</span>
                        </div>
                      )}

                      {contSellada ? (
                        /* Vista compacta sellada: timestamps + rendimiento + observación editables */
                        <>
                          {inc.contHoraActivacion && (
                            <div style={{ marginBottom: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 10px', background: 'rgba(100,116,139,0.08)', border: '0.5px solid rgba(100,116,139,0.3)', borderRadius: '6px', fontSize: '10px', color: 'var(--muted-foreground)' }}>
                              <span>⏱</span>
                              <span style={{ fontFamily: 'monospace', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <input type="time" disabled={!canManage}
                                  value={editForm.contHoraActivacion?.slice(11,16) ?? ''}
                                  onChange={e => setEdit('contHoraActivacion', (editForm.contHoraActivacion?.slice(0,11) ?? '') + e.target.value)}
                                  style={{ background: 'transparent', border: 'none', borderBottom: canManage ? '1px dotted var(--muted-foreground)' : 'none', fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted-foreground)', padding: '0', width: '62px', cursor: canManage ? 'pointer' : 'default', outline: 'none' }} />
                                <span>→</span>
                                <input type="time" disabled={!canManage}
                                  value={editForm.contHoraDesactivacion?.slice(11,16) ?? ''}
                                  onChange={e => setEdit('contHoraDesactivacion', (editForm.contHoraDesactivacion?.slice(0,11) ?? editForm.contHoraActivacion?.slice(0,11) ?? '') + e.target.value)}
                                  style={{ background: 'transparent', border: 'none', borderBottom: canManage ? '1px dotted var(--muted-foreground)' : 'none', fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted-foreground)', padding: '0', width: '62px', cursor: canManage ? 'pointer' : 'default', outline: 'none' }} />
                              </span>
                              <span style={{ fontSize: '9px' }}>Por: {editForm.contActivadoPor}</span>
                            </div>
                          )}
                          <div style={{ marginBottom: '10px' }}>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Rendimiento</label>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {[{v:'EFECTIVO',l:'Efectivo 100%',bg:'#dcfce7',c:'#15803d'},{v:'PARCIAL',l:'Parcial 75%',bg:'#fef9c3',c:'#a16207'},{v:'NULO',l:'Nulo 0%',bg:'#fee2e2',c:'#b91c1c'}].map(({v,l,bg,c}) => {
                                const sel = editForm.contRendimiento === v
                                return <button key={v} type="button" disabled={contDis} onClick={() => setEdit('contRendimiento', v)} style={{ padding:'4px 10px',fontSize:'11px',borderRadius:'6px',border:`1px solid ${sel?c:'var(--border)'}`,cursor:contDis?'default':'pointer',background:sel?bg:'var(--card)',color:sel?c:'var(--muted-foreground)',fontWeight:sel?600:400 }}>{l}</button>
                              })}
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Observación</label>
                            <textarea disabled={!canEditB} style={taStyle(!canEditB)}
                              value={editForm.contObservacion ?? ''} onChange={e => setEdit('contObservacion', e.target.value)}
                              placeholder="Describe el comportamiento de la contingencia..." />
                          </div>
                        </>
                      ) : (
                        /* Form completo cuando está activo */
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Activado por</label>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                {(['TIENDA','AGENTE','INFRAESTRUCTURA'] as const).map(opt => (
                                  <button key={opt} type="button" disabled={contDis} onClick={() => setEdit('contActivadoPor', opt)}
                                    style={{ padding: '5px 11px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--border)', cursor: contDis ? 'default' : 'pointer', fontWeight: editForm.contActivadoPor === opt ? 600 : 400, background: editForm.contActivadoPor === opt ? 'hsl(221,83%,45%)' : 'var(--card)', color: editForm.contActivadoPor === opt ? 'white' : 'var(--foreground)' }}>
                                    {opt.charAt(0) + opt.slice(1).toLowerCase()}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Hora de activación</label>
                              <input type="datetime-local" disabled={contDis} style={iStyle(contDis)} value={editForm.contHoraActivacion ?? ''} onChange={e => setEdit('contHoraActivacion', e.target.value)} />
                            </div>
                          </div>
                          <div style={{ marginBottom: '10px' }}>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Rendimiento</label>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {[{v:'EFECTIVO',l:'Efectivo 100%',bg:'#dcfce7',c:'#15803d'},{v:'PARCIAL',l:'Parcial 75%',bg:'#fef9c3',c:'#a16207'},{v:'NULO',l:'Nulo 0%',bg:'#fee2e2',c:'#b91c1c'}].map(({v,l,bg,c}) => {
                                const sel = editForm.contRendimiento === v
                                return <button key={v} type="button" disabled={contDis} onClick={() => setEdit('contRendimiento', v)} style={{ padding:'4px 10px',fontSize:'11px',borderRadius:'6px',border:`1px solid ${sel?c:'var(--border)'}`,cursor:contDis?'default':'pointer',background:sel?bg:'var(--card)',color:sel?c:'var(--muted-foreground)',fontWeight:sel?600:400 }}>{l}</button>
                              })}
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px', color: 'var(--muted-foreground)' }}>Observación</label>
                            <textarea disabled={!canEditB}
                              style={{ ...taStyle(!canEditB) }}
                              value={editForm.contObservacion ?? ''}
                              onChange={e => setEdit('contObservacion', e.target.value)}
                              placeholder="Describe el comportamiento de la contingencia..." />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Bloque Datos Móviles — colapsable */}
            {(editForm.estadoOperacion === 'DATOS_MOVILES' || !!inc.movActivadoPor) && (() => {
              const rend = editForm.movRendimiento
              const rendLabel: Record<string,string> = { EFECTIVO:'Efectivo', PARCIAL:'Parcial', NULO:'Sin cobertura', EFECTIVA:'Efectiva', LIMITADA:'Limitada', NO_FUNCIONO:'No funcionó' }
              const summary = [editForm.movActivadoPor && `Por: ${editForm.movActivadoPor}`, rend && rendLabel[rend]].filter(Boolean).join(' · ')
              const movSellada = !!inc.movHoraDesactivacion
              const movDis = !canEditB
              return (
                <div style={{ border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '14px', overflow: 'hidden' }}>
                  <button type="button" onClick={() => setShowMovBlock(v => !v)}
                    style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--muted)', border:'none', cursor:'pointer', textAlign:'left' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <span style={{ fontSize:'12px', fontWeight:600, color:'var(--foreground)' }}>Datos móviles</span>
                      {!showMovBlock && summary && <span style={{ fontSize:'10px', color:'var(--muted-foreground)' }}>{summary}</span>}
                      {!showMovBlock && inc.movHoraActivacion && (() => {
                        const fin = inc.movHoraDesactivacion ?? (isClosed ? inc.horaFin : null)
                        const mins = fin
                          ? Math.round((new Date(fin).getTime() - new Date(inc.movHoraActivacion).getTime()) / 60000)
                          : Math.round((Date.now() - new Date(inc.movHoraActivacion).getTime()) / 60000)
                        const horaStr = toDatetimeLocal(inc.movHoraActivacion).slice(11, 16)
                        return <span style={{ fontSize:'10px', color: fin ? 'var(--muted-foreground)' : '#2563eb', fontFamily:'monospace' }}>· {horaStr} · {minToHM(mins)}{!fin ? ' ⏱' : ''}</span>
                      })()}
                    </div>
                    <span style={{ fontSize:'10px', color:'var(--muted-foreground)' }}>{showMovBlock ? '▲' : '▼'}</span>
                  </button>
                  {showMovBlock && (
                    <div style={{ padding:'14px', background:'var(--muted)' }}>
                      {movSellada ? (
                        /* Vista compacta sellada: timestamps + rendimiento + observación editables */
                        <>
                          {inc.movHoraActivacion && (
                            <div style={{ marginBottom: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 10px', background: 'rgba(100,116,139,0.08)', border: '0.5px solid rgba(100,116,139,0.3)', borderRadius: '6px', fontSize: '10px', color: 'var(--muted-foreground)' }}>
                              <span>⏱</span>
                              <span style={{ fontFamily: 'monospace', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <input type="time" disabled={!canManage}
                                  value={editForm.movHoraActivacion?.slice(11,16) ?? ''}
                                  onChange={e => setEdit('movHoraActivacion', (editForm.movHoraActivacion?.slice(0,11) ?? '') + e.target.value)}
                                  style={{ background: 'transparent', border: 'none', borderBottom: canManage ? '1px dotted var(--muted-foreground)' : 'none', fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted-foreground)', padding: '0', width: '62px', cursor: canManage ? 'pointer' : 'default', outline: 'none' }} />
                                <span>→</span>
                                <input type="time" disabled={!canManage}
                                  value={editForm.movHoraDesactivacion?.slice(11,16) ?? ''}
                                  onChange={e => setEdit('movHoraDesactivacion', (editForm.movHoraDesactivacion?.slice(0,11) ?? editForm.movHoraActivacion?.slice(0,11) ?? '') + e.target.value)}
                                  style={{ background: 'transparent', border: 'none', borderBottom: canManage ? '1px dotted var(--muted-foreground)' : 'none', fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted-foreground)', padding: '0', width: '62px', cursor: canManage ? 'pointer' : 'default', outline: 'none' }} />
                              </span>
                              <span style={{ fontSize: '9px' }}>Por: {editForm.movActivadoPor}</span>
                            </div>
                          )}
                          <div style={{ marginBottom: '10px' }}>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Rendimiento</label>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {[{v:'EFECTIVO',l:'Efectivo 100%',bg:'#dcfce7',c:'#15803d'},{v:'PARCIAL',l:'Parcial 75%',bg:'#fef9c3',c:'#a16207'},{v:'NULO',l:'Nulo 0%',bg:'#fee2e2',c:'#b91c1c'}].map(({v,l,bg,c}) => {
                                const sel = editForm.movRendimiento === v
                                return <button key={v} type="button" disabled={movDis} onClick={() => setEdit('movRendimiento', v)} style={{ padding:'4px 10px',fontSize:'11px',borderRadius:'6px',border:`1px solid ${sel?c:'var(--border)'}`,cursor:movDis?'default':'pointer',background:sel?bg:'var(--card)',color:sel?c:'var(--muted-foreground)',fontWeight:sel?600:400 }}>{l}</button>
                              })}
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Observación</label>
                            <textarea disabled={!canEditB} style={taStyle(!canEditB)} value={editForm.movObservacion ?? ''} onChange={e => setEdit('movObservacion', e.target.value)} placeholder="Describe el comportamiento de los datos móviles..." />
                          </div>
                        </>
                      ) : (
                        /* Form completo cuando está activo */
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Activado por</label>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                {(['TIENDA','AGENTE','INFRAESTRUCTURA'] as const).map(opt => (
                                  <button key={opt} type="button" disabled={movDis} onClick={() => setEdit('movActivadoPor', opt)}
                                    style={{ padding:'5px 11px',fontSize:'11px',borderRadius:'6px',border:'1px solid var(--border)',cursor:movDis?'default':'pointer',fontWeight:editForm.movActivadoPor===opt?600:400,background:editForm.movActivadoPor===opt?'hsl(221,83%,45%)':'var(--card)',color:editForm.movActivadoPor===opt?'white':'var(--foreground)' }}>
                                    {opt.charAt(0) + opt.slice(1).toLowerCase()}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Hora de activación</label>
                              <input type="datetime-local" disabled={movDis} style={iStyle(movDis)} value={editForm.movHoraActivacion ?? ''} onChange={e => setEdit('movHoraActivacion', e.target.value)} />
                            </div>
                          </div>
                          <div style={{ marginBottom: '10px' }}>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Rendimiento</label>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {[{v:'EFECTIVO',l:'Efectivo 100%',bg:'#dcfce7',c:'#15803d'},{v:'PARCIAL',l:'Parcial 75%',bg:'#fef9c3',c:'#a16207'},{v:'NULO',l:'Nulo 0%',bg:'#fee2e2',c:'#b91c1c'}].map(({v,l,bg,c}) => {
                                const sel = editForm.movRendimiento === v
                                return <button key={v} type="button" disabled={movDis} onClick={() => setEdit('movRendimiento', v)} style={{ padding:'4px 10px',fontSize:'11px',borderRadius:'6px',border:`1px solid ${sel?c:'var(--border)'}`,cursor:movDis?'default':'pointer',background:sel?bg:'var(--card)',color:sel?c:'var(--muted-foreground)',fontWeight:sel?600:400 }}>{l}</button>
                              })}
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Observación</label>
                            <textarea disabled={movDis} style={taStyle(movDis)} value={editForm.movObservacion ?? ''} onChange={e => setEdit('movObservacion', e.target.value)} placeholder="Describe el comportamiento de los datos móviles..." />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Bloque Boleta Manual — colapsable */}
            {(editForm.estadoOperacion === 'BOLETA_MANUAL' || !!inc.boletaManual) && (() => {
              const rend = editForm.contRendimiento
              const rendLabel: Record<string,string> = { TOTAL:'Total', PARCIAL:'Parcial', NULO:'Nulo' }
              const summary = [editForm.boletaHoraActivacion && 'Hora registrada', rend && rendLabel[rend]].filter(Boolean).join(' · ')
              return (
                <div style={{ border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '14px', overflow: 'hidden' }}>
                  <button type="button" onClick={() => setShowBoletaBlock(v => !v)}
                    style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--muted)', border:'none', cursor:'pointer', textAlign:'left' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <span style={{ fontSize:'12px', fontWeight:600, color:'var(--foreground)' }}>Boleta manual</span>
                      {!showBoletaBlock && summary && <span style={{ fontSize:'10px', color:'var(--muted-foreground)' }}>{summary}</span>}
                    </div>
                    <span style={{ fontSize:'10px', color:'var(--muted-foreground)' }}>{showBoletaBlock ? '▲' : '▼'}</span>
                  </button>
                  {showBoletaBlock && (
                    <div style={{ padding:'14px', background:'var(--muted)' }}>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Hora de activación manual</label>
                        <input type="datetime-local" disabled={!canEditB} style={iStyle(!canEditB)} value={editForm.boletaHoraActivacion ?? ''} onChange={e => setEdit('boletaHoraActivacion', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Rendimiento</label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {[{v:'TOTAL',l:'Total 100%',bg:'#dcfce7',c:'#15803d'},{v:'PARCIAL',l:'Parcial 75%',bg:'#fef9c3',c:'#a16207'},{v:'NULO',l:'Nulo 0%',bg:'#fee2e2',c:'#b91c1c'}].map(({v,l,bg,c}) => {
                            const sel = editForm.contRendimiento === v
                            return <button key={v} type="button" disabled={!canEditB} onClick={() => setEdit('contRendimiento', v)} style={{ padding:'4px 10px',fontSize:'11px',borderRadius:'6px',border:`1px solid ${sel?c:'var(--border)'}`,cursor:!canEditB?'default':'pointer',background:sel?bg:'var(--card)',color:sel?c:'var(--muted-foreground)',fontWeight:sel?600:400 }}>{l}</button>
                          })}
                        </div>
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
                      {/* Cajas afectadas — debajo de acciones */}
                      <div style={{ marginTop:'10px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                        <div>
                          <label style={{ display:'block', fontSize:'10px', fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'4px' }}>Cajas afectadas</label>
                          <input type="number" min="0" disabled={!canEditB} style={iStyle(!canEditB)}
                            value={editForm.cajasAfectadas ?? ''}
                            onChange={e => setEdit('cajasAfectadas', e.target.value === '' ? null : Number(e.target.value))}
                            placeholder="Ej: 2" />
                        </div>
                        <div>
                          <label style={{ display:'block', fontSize:'10px', fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'4px' }}>Cajas totales</label>
                          <div style={{ ...iStyle(true), color:'var(--muted-foreground)' }}>
                            {inc.tiendaCajasTotales ?? inc.cajasTotales ?? '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

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
                    {['ABIERTO','EN_SEGUIMIENTO','ESCALADO_N1','ESCALADO_N2','ESCALADO_N3','RESUELTO','CANCELADO'].map(v => <option key={v} value={v}>{v.replace(/_/g,' ')}</option>)}
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
              <ResumenRow icon={<IcoShield />} label="Contingencia">
                {(() => {
                  const tiene = inc.tiendaTieneContingencia
                  if (!tiene) return <span style={{ color: 'var(--muted-foreground)' }}>No</span>
                  if (inc.estadoOperacion !== 'CONTINGENCIA') return <span style={{ color: '#15803d', fontWeight: 500 }}>Sí</span>
                  const rend = inc.contRendimiento
                  const rendLabelMap: Record<string,{l:string;c:string}> = {
                    EFECTIVO:   { l: 'Efectivo 100%',        c: '#15803d' },
                    TOTAL:      { l: 'Total 100%',           c: '#15803d' },
                    PARCIAL:    { l: 'Parcial 75%',          c: '#a16207' },
                    NULO:       { l: 'Nulo 0%',              c: '#b91c1c' },
                    // legacy
                    EFECTIVA:   { l: 'Efectivo 100%',        c: '#15803d' },
                    LIMITADA:   { l: 'Parcial',              c: '#a16207' },
                    FALLIDA:    { l: 'Nulo 0%',              c: '#b91c1c' },
                    NO_FUNCIONO:{ l: 'Nulo 0%',              c: '#b91c1c' },
                    INOPERATIVA:{ l: 'Nulo 0%',              c: '#b91c1c' },
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
                <TimeRow label="Hora inicio" value={new Date((inc as any).horaRegistroOriginal ?? inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
                <TimeRow label="Tiempo total" value={(() => {
                  if (!inc.horaFin) return 'En curso'
                  const base = (inc as any).horaRegistroOriginal ?? inc.horaRegistro
                  return minToHM(Math.round((new Date(inc.horaFin).getTime() - new Date(base).getTime()) / 60000))
                })()} />
                {(inc as any).tiempoAcumuladoMin != null && (
                  <TimeRow label="MTTR acumulado (prev.)" value={minToHM((inc as any).tiempoAcumuladoMin)} color="#d97706" />
                )}
                {(inc as any).motivoReabertura && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0 4px' }} />
                    <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Reabertura</div>
                    <TimeRow
                      label="Motivo"
                      value={(inc as any).motivoReabertura === 'TIENDA_SIN_INTERNET' ? 'Tienda sin internet (proveedor)' : 'Error de gestión de agente'}
                      color={(inc as any).motivoReabertura === 'TIENDA_SIN_INTERNET' ? '#b91c1c' : '#92400e'}
                    />
                    {(inc as any).justificacionReabertura && (
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '3px', lineHeight: 1.4, fontStyle: 'italic' }}>
                        "{(inc as any).justificacionReabertura}"
                      </div>
                    )}
                    {canEditA ? (
                      <div style={{ marginBottom: '5px' }}>
                        <div style={{ fontSize: '10px', color: '#d97706', marginBottom: '3px' }}>Hora reapertura</div>
                        <input type="datetime-local" style={{ ...iStyle(), fontSize: '10px', padding: '4px 6px' }} value={editForm.horaRegistro} onChange={e => setEdit('horaRegistro', e.target.value)} />
                      </div>
                    ) : (
                      <TimeRow label="Hora reapertura" value={new Date(inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} color="#d97706" />
                    )}
                    {(inc as any).horaFinAnterior && (
                      <TimeRow label="Cierre anterior" value={new Date((inc as any).horaFinAnterior).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} color="#6b7280" />
                    )}
                  </>
                )}
                {[...(inc.escalamientos ?? [])].sort((a: any, b: any) => a.nivel - b.nivel).map((esc: any) => {
                  const enviado = esc.horaEnvioCorreo
                    ? new Date(esc.horaEnvioCorreo).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : '—'
                  const horaRespStr = esc.horaRespuesta
                    ? new Date(esc.horaRespuesta).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : null
                  let respColor: string | undefined
                  if (esc.noHuboRespuesta) respColor = '#b91c1c'
                  else if (esc.horaEnvioCorreo && esc.estadoCronometro === 'VENCIDO' && !esc.horaRespuesta) respColor = '#d97706'
                  return (
                    <div key={esc.id}>
                      <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '6px 0 4px', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>Nivel {esc.nivel}</div>
                      <TimeRow label={`Enviado N${esc.nivel}`} value={enviado} />
                      {esc.noHuboRespuesta ? (
                        <TimeRow label={`Respuesta N${esc.nivel}`} value="No hubo respuesta" color="#b91c1c" />
                      ) : horaRespStr ? (
                        <div style={{ marginBottom: '5px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{`Respuesta N${esc.nivel}`}</span>
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 500 }}>{horaRespStr}</span>
                          </div>
                          {esc.tiempoRespuestaMin != null && (
                            <div style={{ textAlign: 'right', fontSize: '10px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                              {minToHM(esc.tiempoRespuestaMin)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <TimeRow label={`Respuesta N${esc.nivel}`} value={
                          esc.horaEnvioCorreo && esc.estadoCronometro === 'VENCIDO'
                            ? `Excedido ${minToHM(Math.max(0, Math.round((Date.now() - new Date(esc.horaEnvioCorreo).getTime()) / 60000) - 60))}`
                            : '—'
                        } color={respColor} />
                      )}
                    </div>
                  )
                })}
                {inc.horaEscaladoInfra && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0 4px' }} />
                    <TimeRow label="Escalado a Infra" value={new Date(inc.horaEscaladoInfra).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} color="#6366f1" />
                  </>
                )}
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
                    {(inc as any).motivoReabertura ? (
                      <>
                        <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>Hora inicio (original)</div>
                        <input type="datetime-local" style={{ ...iStyle(), fontSize: '10px', padding: '4px 6px', marginBottom: '6px' }} value={editForm.horaRegistroOriginal ?? ''} onChange={e => setEdit('horaRegistroOriginal', e.target.value)} />
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>Hora registro</div>
                        <input type="datetime-local" style={{ ...iStyle(), fontSize: '10px', padding: '4px 6px', marginBottom: '6px' }} value={editForm.horaRegistro} onChange={e => setEdit('horaRegistro', e.target.value)} />
                      </>
                    )}
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

              {/* Historial de contingencias — debajo de tiempos */}
              {(inc.contActivadoPor || inc.movActivadoPor) && (() => {
                type CEntry = { tipo: string; inicio: string | null; fin: string | null; mins: number; activo: boolean }
                const entries: CEntry[] = []
                if (inc.contActivadoPor) {
                  const fin = inc.contHoraDesactivacion ?? (isClosed ? inc.horaFin : null)
                  const mins = inc.contHoraActivacion
                    ? (fin ? Math.round((new Date(fin).getTime() - new Date(inc.contHoraActivacion).getTime()) / 60000)
                           : Math.round((Date.now() - new Date(inc.contHoraActivacion).getTime()) / 60000))
                    : 0
                  entries.push({ tipo: inc.contEsExterno ? 'Router ext.' : 'Router propio', inicio: inc.contHoraActivacion, fin: inc.contHoraDesactivacion, mins, activo: !inc.contHoraDesactivacion && !isClosed })
                }
                if (inc.movActivadoPor) {
                  const fin = inc.movHoraDesactivacion ?? (isClosed ? inc.horaFin : null)
                  const mins = inc.movHoraActivacion
                    ? (fin ? Math.round((new Date(fin).getTime() - new Date(inc.movHoraActivacion).getTime()) / 60000)
                           : Math.round((Date.now() - new Date(inc.movHoraActivacion).getTime()) / 60000))
                    : 0
                  entries.push({ tipo: 'Datos móviles', inicio: inc.movHoraActivacion, fin: inc.movHoraDesactivacion, mins, activo: !inc.movHoraDesactivacion && !isClosed })
                }
                return (
                  <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--muted)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Contingencias</div>
                    {entries.map((e, i) => (
                      <div key={i} style={{ marginBottom: i < entries.length - 1 ? '8px' : 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{e.tipo}</span>
                          <span style={{ fontSize: '10px', fontWeight: 600, color: e.activo ? '#d97706' : '#15803d' }}>
                            {e.activo ? '⏱ Activo' : '✓ Fin'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted-foreground)' }}>
                            {e.inicio ? toDatetimeLocal(e.inicio).slice(11,16) : '—'}
                            {' → '}
                            {e.fin ? toDatetimeLocal(e.fin).slice(11,16) : (e.activo ? 'ahora' : '—')}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 500, color: e.activo ? '#d97706' : 'var(--foreground)' }}>
                            {minToHM(e.mins)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>

          {/* ── Incidente Masivo ── */}
          <GrupoMasivoPanel inc={inc} onRefresh={fetchInc} />

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
          </div>

        </div>{/* end RIGHT */}
      </div>{/* end main grid */}

      {/* ── Block IEI — Impacto Económico Estimado ── */}
      {(() => {
        const esResuelto = inc.estado === 'RESUELTO'
        const MARGEN = 0.35
        const FACTOR_BASE: Record<string,number> = { CAIDA_TOTAL:1.00, INTERMITENCIA:0.50, LENTITUD:0.30, CORTE_ELECTRICO:1.00 }
        const nC = (r:string|null|undefined) => { if(!r)return 0.20;const v=r.toUpperCase();if(v==='EFECTIVO'||v==='TOTAL'||v==='EFECTIVA')return 0.00;if(v==='PARCIAL'||v==='LIMITADA')return 0.20;return 1.00 }
        const nB = (r:string|null|undefined) => { const c=inc.tipo==='CORTE_ELECTRICO';if(!r)return c?0.00:0.10;const v=r.toUpperCase();if(v==='EFECTIVA'||v==='TOTAL')return c?0.00:0.10;if(v==='PARCIAL')return 0.30;return 1.00 }
        const tsMs = (v:any) => v ? new Date(v).getTime() : null

        // Cálculo en curso (activo) usando Date.now()
        let ieiEnCurso = 0
        let ventaHoraEnCurso = 0
        const segmentosEnCurso: {desdeMs:number;hastaMs:number;horas:number;factor:number;descripcion:string;ieiParcial:number}[] = []
        if (!esResuelto && inc.tiendaVentaHoraSoles) {
          const nowMs  = Date.now()
          void tick  // dependencia para re-render cada segundo
          const dow = new Date(inc.horaRegistro).getDay()
          const isFDS = dow===0||dow===5||dow===6
          ventaHoraEnCurso = isFDS
            ? Number(inc.tiendaVentaHoraFdsSoles ?? inc.tiendaVentaHoraSoles)
            : Number(inc.tiendaVentaHoraSoles ?? inc.tiendaVentaHoraFdsSoles)
          const startMs = new Date(inc.horaRegistro).getTime()
          // contHoraActivacion es compartido por BOLETA_MANUAL — solo aplica como router si contActivadoPor está seteado
          const contStartMs = inc.contActivadoPor ? tsMs(inc.contHoraActivacion) : null
          const contEndMs   = tsMs(inc.contHoraDesactivacion)
          const movStartMs  = tsMs(inc.movHoraActivacion)
          const movEndMs    = tsMs(inc.movHoraDesactivacion)
          const contF = contStartMs !== null ? nC(inc.contRendimiento) : null
          const movF  = movStartMs  !== null ? nC(inc.movRendimiento)  : null
          const bolF  = inc.boletaManual ? nB(inc.boletaRendimiento) : null
          const bolStartMs = inc.boletaManual
            ? (inc.boletaHoraActivacion ? tsMs(inc.boletaHoraActivacion) : startMs)
            : null
          const bpSet = new Set([startMs, nowMs])
          const addBp = (t:number|null) => { if(t&&t>startMs&&t<nowMs)bpSet.add(t) }
          addBp(contStartMs);addBp(contEndMs);addBp(movStartMs);addBp(movEndMs);addBp(bolStartMs)
          const bps = Array.from(bpSet).sort((a,b)=>a-b)
          for(let i=0;i<bps.length-1;i++){
            const segS=bps[i], segE=bps[i+1]
            const mid=(segS+segE)/2, h=(segE-segS)/3600000
            const opts:{f:number;label:string}[]=[]
            const bolActiva = bolF!==null && bolStartMs!==null && mid>=bolStartMs
            if(inc.tipo==='CORTE_ELECTRICO'){
              if(bolActiva) opts.push({f:bolF!, label:`boleta ${inc.boletaRendimiento?.toLowerCase()??'efectiva'}`})
              else opts.push({f:1.00, label:'sin mitigación'})
            } else {
              if(contF!==null&&contStartMs!==null&&mid>=contStartMs&&(contEndMs===null||mid<contEndMs))
                opts.push({f:contF, label:`router ${inc.contEsExterno?'externo':'propio'}${inc.contRendimiento?' '+inc.contRendimiento.toLowerCase():''}`})
              if(movF!==null&&movStartMs!==null&&mid>=movStartMs&&(movEndMs===null||mid<movEndMs))
                opts.push({f:movF, label:`datos móviles${inc.movRendimiento?' '+inc.movRendimiento.toLowerCase():''}`})
              if(bolActiva) opts.push({f:bolF!, label:`boleta ${inc.boletaRendimiento?.toLowerCase()??'efectiva'}`})
              if(!opts.length) opts.push({f:FACTOR_BASE[inc.tipo]??1.00, label:'sin mitigación'})
            }
            const best=opts.reduce((a,b)=>a.f<=b.f?a:b)
            const segIEI=ventaHoraEnCurso*h*MARGEN*best.f
            ieiEnCurso+=segIEI
            segmentosEnCurso.push({desdeMs:segS,hastaMs:segE,horas:Math.round(h*100)/100,factor:best.f,descripcion:best.label,ieiParcial:Math.round(segIEI)})
          }
          ieiEnCurso = Math.round(ieiEnCurso)
        }

        const tieneIei = esResuelto ? !!inc.ieiCalc : !!inc.tiendaVentaHoraSoles
        if (!tieneIei) return null

        const fmtMs = (ms:number) => new Date(ms).toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit'})
        const fmtH  = (h:number)  => h < 1 ? `${Math.round(h*60)}m` : `${h.toFixed(1)}h`

        const displayIei    = esResuelto ? (inc.ieiCalc?.impactoEstimado ?? 0) : ieiEnCurso
        const displayVH     = esResuelto ? inc.ieiCalc?.ventaHora : ventaHoraEnCurso
        const displaySegs   = esResuelto ? (inc.ieiCalc?.segmentos ?? []) : segmentosEnCurso
        const displayMotivo = esResuelto ? inc.ieiCalc?.motivoFactor : null
        const faltaInfo     = esResuelto && inc.ieiCalc?.faltaInformacion

        return (
          <div style={{ background: 'var(--card)', borderRadius: '12px', border: `1px solid ${esResuelto ? 'var(--border)' : '#f59e0b'}`, marginTop: '16px' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Impacto Económico Estimado (IEI)</div>
                {!esResuelto && (
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: '#fef3c7', color: '#92400e', border: '0.5px solid #f59e0b' }}>
                    En curso ⏱
                  </span>
                )}
                {esResuelto && !faltaInfo && (
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: '#d1fae5', color: '#065f46', border: '0.5px solid #6ee7b7' }}>
                    Calculado
                  </span>
                )}
              </div>
              {!faltaInfo && (
                <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700, color: displayIei > 0 ? '#b91c1c' : '#16a34a' }}>
                  {displayIei > 0 ? `S/ ${displayIei.toLocaleString('es-PE')}` : 'S/ 0'}
                  {!esResuelto && <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: '4px' }}>hasta ahora</span>}
                </div>
              )}
              {faltaInfo && <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos suficientes</div>}
            </div>
            <div style={{ padding: '14px 18px' }}>
              {faltaInfo ? (
                <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{inc.ieiCalc?.motivoFactor}</div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: displaySegs.length > 1 ? '14px' : '0' }}>
                    {[
                      { label: 'Venta/hora',      value: displayVH ? `S/ ${Number(displayVH).toLocaleString('es-PE')}` : '—' },
                      ...(esResuelto ? [
                        { label: 'Venta esperada',  value: `S/ ${inc.ieiCalc?.ventaEsperadaAfectada?.toLocaleString('es-PE') ?? '—'}` },
                        { label: 'Impacto bruto',   value: `S/ ${inc.ieiCalc?.impactoEconomicoBruto?.toLocaleString('es-PE') ?? '—'}` },
                        { label: 'Margen aplicado', value: `${((inc.ieiCalc?.margenUsado ?? MARGEN) * 100).toFixed(0)}%` },
                        { label: 'Factor prom.',    value: (inc.ieiCalc?.factorAplicado ?? 0).toFixed(2) },
                      ] : [
                        { label: 'Margen aplicado', value: '35%' },
                        { label: 'Acumulado',       value: `${Math.round((Date.now() - new Date(inc.horaRegistro).getTime()) / 60000)}m desde inicio` },
                      ]),
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>{label}</div>
                        <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {displaySegs.length > 1 && (
                    <div style={{ background: 'var(--muted)', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '7px 12px', borderBottom: '0.5px solid var(--border)' }}>
                        Desglose por tramos
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                          <tr style={{ background: 'var(--card)' }}>
                            {['Desde','Hasta','Duración','Mitigación activa','Factor','IEI tramo'].map(h => (
                              <th key={h} style={{ padding: '5px 10px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {displaySegs.map((seg: any, i: number) => (
                            <tr key={i} style={{ borderTop: '0.5px solid var(--border)' }}>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{fmtMs(seg.desdeMs)}</td>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{fmtMs(seg.hastaMs)}</td>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{fmtH(seg.horas)}</td>
                              <td style={{ padding: '6px 10px', color: 'var(--foreground)', textTransform: 'capitalize' }}>{seg.descripcion}</td>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{seg.factor.toFixed(2)}</td>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700, color: seg.ieiParcial > 0 ? '#b91c1c' : '#16a34a' }}>
                                {seg.ieiParcial > 0 ? `S/ ${seg.ieiParcial.toLocaleString('es-PE')}` : 'S/ 0'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(displaySegs.length <= 1 && displayMotivo) && (
                    <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '6px' }}>{displayMotivo}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Block D.SLA — Métricas SLA del incidente ── */}
      {inc.slaMetrics?.evaluable && (
        <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', marginTop: '16px' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>D.SLA — Métricas de respuesta del proveedor</div>
          </div>
          <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {[
              { label: 'SLA Respuesta', value: inc.slaMetrics.scoreRespuesta != null ? `${inc.slaMetrics.scoreRespuesta}%` : '—', sub: inc.slaMetrics.tPrimeraRespuestaMin != null ? `${inc.slaMetrics.tPrimeraRespuestaMin} min` : 'Sin respuesta', score: inc.slaMetrics.scoreRespuesta },
              { label: 'T. Primera Respuesta', value: inc.slaMetrics.tPrimeraRespuestaMin != null ? `${inc.slaMetrics.tPrimeraRespuestaMin} min` : '—', sub: `límite ${inc.slaMetrics.slaRespuestaObj} min`, score: null },
              { label: 'SLA Resolución', value: inc.slaMetrics.scoreResolucion != null ? `${inc.slaMetrics.scoreResolucion}%` : (inc.slaMetrics.scoreRespuesta === 0 ? '0%' : '—'), sub: inc.slaMetrics.tResolucionMin != null ? `${inc.slaMetrics.tResolucionMin} min` : (inc.slaMetrics.scoreRespuesta === 0 ? 'Sin respuesta' : 'En curso'), score: inc.slaMetrics.scoreResolucion },
              { label: 'T. Resolución', value: inc.slaMetrics.tResolucionMin != null ? `${inc.slaMetrics.tResolucionMin} min` : '—', sub: `límite ${inc.slaMetrics.slaResolucionObj} min`, score: null },
            ].map(m => (
              <div key={m.label} style={{ background: 'var(--background)', borderRadius: '8px', padding: '10px 14px', border: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>{m.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: m.score != null ? (m.score >= 80 ? '#16a34a' : m.score >= 60 ? '#d97706' : '#dc2626') : 'var(--foreground)' }}>{m.value}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{m.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Block D — Escalamientos + Infraestructura ── */}
      {(inc.escalamientos?.length > 0 || !isClosed || inc.escaladoInfraId) && (
        <div ref={escRef} style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', marginTop: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>D — Escalamientos</div>
          </div>
          <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '12px' }}>
            {inc.escalamientos?.map((esc: any) => (
              <EscalamientoCard key={esc.id} esc={esc} allEscs={inc.escalamientos} inc={inc} isClosed={isClosed} onRefresh={fetchInc} />
            ))}
            <InfraEscalamientoPanel inc={inc} isClosed={isClosed} onRefresh={fetchInc} />
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
              <button onClick={() => { setResolverMode(null); setShowResolverModal(true) }}
                style={{ ...btn, background: '#14532d', color: '#86efac' }}>
                Marcar como resuelto
              </button>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowNivelMenu(v => !v)}
                  style={{ ...btn, background: 'hsl(221,83%,45%)', color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  Escalar incidente <IcoArrow />
                </button>
                {showNivelMenu && (
                  <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: '6px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 50, minWidth: '160px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                    {[1,2,3,4].map(n => (
                      <button key={n} onClick={() => handleEscalarNivel(n)}
                        style={{ padding: '7px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', textAlign: 'left', color: 'var(--foreground)' }}>
                        Escalar N{n}
                      </button>
                    ))}
                    {!inc.escaladoInfraId && (
                      <>
                        <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
                        <button onClick={openInfraModal}
                          style={{ padding: '7px 12px', background: 'rgba(99,102,241,.07)', border: '1px solid rgba(99,102,241,.35)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', textAlign: 'left', color: '#818cf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          🔧 Infraestructura
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          {isClosed && inc.estado !== 'CANCELADO' && can(session, 'incidentes.reabrir') && (
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

// ── GrupoMasivoPanel ─────────────────────────────────────────────────────────
const IcoLink = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>

function GrupoMasivoPanel({ inc, onRefresh }: { inc: any; onRefresh: () => void }) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [mode, setMode]       = useState<'view' | 'create' | 'add'>('view')
  const [razon, setRazon]     = useState('')
  const [motivo, setMotivo]   = useState('')
  const [tiendaQ, setTiendaQ] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const gm = inc.grupoMasivo

  async function handleCreate() {
    if (!razon.trim()) { setError('Ingresa la razón del incidente masivo'); return }
    setSaving(true); setError('')
    const res = await fetch('/api/grupos-masivos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ razon, motivo, incidenteId: inc.id }),
    })
    setSaving(false)
    if (res.ok) { setMode('view'); setRazon(''); setMotivo(''); onRefresh() }
    else setError('Error al crear el grupo')
  }

  async function handleAddTienda() {
    if (!tiendaQ.trim()) return
    setSaving(true); setError('')
    const res = await fetch(`/api/grupos-masivos/${gm.id}/vincular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiendaCodigo: tiendaQ.trim() }),
    })
    setSaving(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setTiendaQ(''); onRefresh() }
    else setError(data.error ?? 'Error al vincular tienda')
  }

  async function handleDesvincular(incidenteId: string) {
    const { ok } = await apiMutate(`/api/grupos-masivos/${gm.id}/desvincular`, {
      method: 'POST',
      json: { incidenteId },
      errorPrefix: 'No se pudo desvincular el incidente',
    })
    if (!ok) return
    onRefresh()
  }

  async function handleUpdateGrupo() {
    setSaving(true); setError('')
    const res = await fetch(`/api/grupos-masivos/${gm.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ razon, motivo }),
    })
    setSaving(false)
    if (res.ok) { setMode('view'); onRefresh() }
    else setError('Error al actualizar')
  }

  return (
    <div style={{ background: 'var(--card)', border: `1px solid ${gm ? 'rgba(245,158,11,0.5)' : 'var(--border)'}`, borderRadius: '12px', overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', background: gm ? 'rgba(245,158,11,0.07)' : 'var(--muted)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <IcoLink />
          <span style={{ fontSize: '12px', fontWeight: 600, color: gm ? '#92400e' : 'var(--foreground)' }}>
            {gm ? `Incidente masivo · ${gm.codigo}` : 'Vincular incidente masivo'}
          </span>
          {gm && (
            <span style={{ fontSize: '10px', background: 'rgba(245,158,11,0.2)', color: '#92400e', borderRadius: '10px', padding: '1px 7px', fontWeight: 700 }}>
              {gm.incidentes?.length ?? 0} tiendas
            </span>
          )}
        </div>
        <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '14px 16px' }}>
          {!gm && mode === 'view' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                Vincula este incidente a un grupo masivo para relacionarlo con otras tiendas afectadas por la misma falla.
              </p>
              <button onClick={() => setMode('create')}
                style={{ padding: '8px 14px', background: '#92400e', color: '#fef3c7', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                + Crear nuevo grupo masivo
              </button>
            </div>
          )}

          {!gm && mode === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Razón *</label>
                <input value={razon} onChange={e => setRazon(e.target.value)}
                  placeholder="Ej: Falla fibra Movistar zona norte Lima"
                  style={iStyle()} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Motivo (opcional)</label>
                <input value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder="Ej: Corte de cableado en cámara subterránea"
                  style={iStyle()} />
              </div>
              {error && <div style={{ fontSize: '11px', color: '#dc2626' }}>{error}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleCreate} disabled={saving}
                  style={{ flex: 1, padding: '8px', background: '#92400e', color: '#fef3c7', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
                  {saving ? 'Creando...' : 'Crear grupo'}
                </button>
                <button onClick={() => { setMode('view'); setError('') }}
                  style={{ padding: '8px 14px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {gm && (
            <div>
              {mode === 'view' && (
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', marginBottom: '2px' }}>{gm.razon}</div>
                    {gm.motivo && <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{gm.motivo}</div>}
                  </div>

                  {/* Lista de incidentes vinculados */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                    {(gm.incidentes ?? []).map((linked: any) => (
                      <div key={linked.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 9px', background: 'var(--muted)', borderRadius: '7px', borderLeft: linked.id === inc.id ? '3px solid #f59e0b' : '3px solid var(--border)' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: linked.id === inc.id ? '#92400e' : 'var(--foreground)' }}>{linked.tiendaCodigo}</span>
                        <span style={{ fontSize: '11px', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linked.tiendaNombre}</span>
                        <Badge variant={estadoToVariant(linked.estado)} />
                        {linked.id !== inc.id && (
                          <button type="button" onClick={() => router.push(`/incidentes/${linked.id}`)}
                            style={{ fontSize: '10px', color: 'hsl(221,83%,50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>
                            <IcoExt />
                          </button>
                        )}
                        {linked.id !== inc.id && (
                          <button type="button" onClick={() => handleDesvincular(linked.id)}
                            title="Desvincular"
                            style={{ fontSize: '10px', color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Añadir tienda */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <input value={tiendaQ} onChange={e => setTiendaQ(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddTienda()}
                      placeholder="Código tienda (ej: FL123)"
                      style={{ ...iStyle(), flex: 1, fontSize: '11px' }} />
                    <button onClick={handleAddTienda} disabled={saving || !tiendaQ.trim()}
                      style={{ padding: '6px 12px', background: 'hsl(221,83%,45%)', color: 'white', border: 'none', borderRadius: '7px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      + Añadir
                    </button>
                  </div>
                  {error && <div style={{ fontSize: '11px', color: '#dc2626', marginBottom: '6px' }}>{error}</div>}

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => { setMode('create'); setRazon(gm.razon ?? ''); setMotivo(gm.motivo ?? '') }}
                      style={{ fontSize: '10px', color: 'var(--muted-foreground)', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                      ✎ Editar
                    </button>
                    <button onClick={() => handleDesvincular(inc.id)}
                      style={{ fontSize: '10px', color: '#b91c1c', background: 'none', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                      Salir del grupo
                    </button>
                  </div>
                </>
              )}

              {mode === 'create' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Razón</label>
                    <input value={razon} onChange={e => setRazon(e.target.value)} style={iStyle()} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Motivo</label>
                    <input value={motivo} onChange={e => setMotivo(e.target.value)} style={iStyle()} />
                  </div>
                  {error && <div style={{ fontSize: '11px', color: '#dc2626' }}>{error}</div>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleUpdateGrupo} disabled={saving}
                      style={{ flex: 1, padding: '8px', background: '#92400e', color: '#fef3c7', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
                      {saving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                    <button onClick={() => { setMode('view'); setError('') }}
                      style={{ padding: '8px 14px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── InfraEscalamientoPanel ────────────────────────────────────────────────────
function InfraEscalamientoPanel({ inc, isClosed, onRefresh }: { inc: any; isClosed: boolean; onRefresh: () => void }) {
  if (!inc.escaladoInfraId) return null

  const fmtH = (iso: string) => new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  async function handleLiberar() {
    const { ok } = await apiMutate(`/api/incidentes/${inc.id}`, {
      method: 'PUT',
      json: { escaladoInfraId: null, horaEscaladoInfra: null, notaEscaladoInfra: null },
      errorPrefix: 'No se pudo liberar el incidente de infraestructura',
    })
    if (!ok) return
    onRefresh()
  }

  return (
    <div style={{ background: 'linear-gradient(135deg,rgba(99,102,241,.07) 0%,rgba(139,92,246,.04) 100%)', border: '1.5px solid rgba(99,102,241,.3)', borderRadius: '10px', padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px' }}>🔧</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#4f46e5' }}>Escalado a Infraestructura</span>
        </div>
        {!isClosed && (
          <button onClick={handleLiberar}
            style={{ fontSize: '10px', padding: '2px 8px', background: 'transparent', border: '1px solid rgba(99,102,241,.4)', borderRadius: '4px', color: '#6366f1', cursor: 'pointer' }}>
            Liberar
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
        <div>
          <div style={{ color: 'var(--muted-foreground)', fontSize: '10px', marginBottom: '2px' }}>Agente asignado</div>
          <div style={{ fontWeight: 600 }}>{[inc.infraNombre, inc.infraApellido].filter(Boolean).join(' ')}</div>
          {inc.infraEmail   && <div style={{ color: 'var(--muted-foreground)' }}>{inc.infraEmail}</div>}
          {inc.infraCelular && <div style={{ color: 'var(--muted-foreground)' }}>{inc.infraCelular}</div>}
        </div>
        <div>
          <div style={{ color: 'var(--muted-foreground)', fontSize: '10px', marginBottom: '2px' }}>Hora escalado</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inc.horaEscaladoInfra ? fmtH(inc.horaEscaladoInfra) : '—'}</div>
        </div>
      </div>
      {inc.notaEscaladoInfra && (
        <div style={{ marginTop: '8px', fontSize: '11px', background: 'rgba(99,102,241,.07)', borderRadius: '6px', padding: '6px 10px' }}>
          {inc.notaEscaladoInfra}
        </div>
      )}
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
  const finHora = atc.fin ? new Date(atc.fin).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }) : null
  return (
    <div style={{ padding: '10px 12px', background: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <IcoPhone />
          <span style={{ fontSize: '11px', fontWeight: 600 }}>{inicio}</span>
          {finHora
            ? <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>→ {finHora} · {atc.duracionMin != null ? minToHM(atc.duracionMin) : '—'}</span>
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
  const [showRespText, setShowRespText] = useState(false)
  const etaMinsInit = parseEtaMin(esc.tiempoEstimadoSolucion ?? '') ?? 0
  const [etaH, setEtaH] = useState(Math.floor(etaMinsInit / 60))
  const [etaM, setEtaM] = useState(etaMinsInit % 60)
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
    await apiMutate(`/api/escalamientos/${esc.id}`, {
      method: 'PUT',
      json: { cuerpoCorreo: templateBody },
      errorPrefix: 'No se pudo guardar la plantilla',
    })
    setSavingTemplate(false)
  }

  async function handleEnvio() {
    const { ok } = await apiMutate(`/api/escalamientos/${esc.id}/envio`, { method: 'PUT', errorPrefix: 'No se pudo registrar el envío' })
    if (!ok) return
    onRefresh()
  }

  async function handleRespuesta() {
    setSaving(true)
    const totalMin = etaH * 60 + etaM
    const tiempoEstFinal = totalMin > 0 ? String(totalMin) : ''
    const { ok } = await apiMutate(`/api/escalamientos/${esc.id}/respuesta`, {
      method: 'PUT',
      json: {
        respuestaTexto: respuestaText,
        tiempoEstimadoSolucion: tiempoEstFinal,
        horaRespuesta: fromDatetimeLocal(horaRespManual) ?? undefined,
      },
      errorPrefix: 'No se pudo registrar la respuesta',
    })
    setSaving(false)
    if (!ok) return
    onRefresh()
  }

  async function handleSinRespuesta() {
    if (!confirm('¿Confirmar que no hubo respuesta del proveedor?')) return
    const { ok } = await apiMutate(`/api/escalamientos/${esc.id}/sin-respuesta`, { method: 'PUT', errorPrefix: 'No se pudo registrar' })
    if (!ok) return
    onRefresh()
  }

  async function handleDelete() {
    const msg = isRespondido
      ? `Nivel ${esc.nivel} ya tiene respuesta registrada. ¿Eliminar de todas formas? Esta acción no se puede deshacer.`
      : isCorriendo
        ? 'El cronómetro ya está corriendo. ¿Eliminar de todas formas?'
        : '¿Eliminar este escalamiento?'
    if (!confirm(msg)) return
    const { ok } = await apiMutate(`/api/escalamientos/${esc.id}`, { method: 'DELETE', errorPrefix: 'No se pudo eliminar el escalamiento' })
    if (!ok) return
    onRefresh()
  }

  async function handleGuardarTiempos() {
    setSavingTiempos(true)
    const { ok } = await apiMutate(`/api/escalamientos/${esc.id}`, {
      method: 'PUT',
      json: {
        horaEnvioCorreo: fromDatetimeLocal(horaEnvioEdit),
        horaRespuesta:   fromDatetimeLocal(horaRespEdit),
      },
      errorPrefix: 'No se pudieron guardar los tiempos',
    })
    setSavingTiempos(false)
    if (!ok) return
    setEditTiempos(false)
    onRefresh()
  }

  async function iniciarAtc() {
    const { ok } = await apiMutate(`/api/escalamientos/${esc.id}/atc`, { method: 'POST', errorPrefix: 'No se pudo iniciar la llamada ATC' })
    if (!ok) return
    onRefresh()
  }

  async function finalizarAtc(atcId: string) {
    if (!confirm('¿Finalizar la llamada? Esto registrará la primera respuesta del proveedor.')) return
    const { ok } = await apiMutate(`/api/atc/${atcId}`, { method: 'PUT', json: { finalizar: true }, errorPrefix: 'No se pudo finalizar la llamada' })
    if (!ok) return
    onRefresh()
  }

  async function guardarNotasAtc(atcId: string, notas: string) {
    await apiMutate(`/api/atc/${atcId}`, { method: 'PUT', json: { notas }, errorPrefix: 'No se pudieron guardar las notas' })
  }

  async function eliminarAtc(atcId: string) {
    if (!confirm('¿Eliminar esta llamada ATC?')) return
    const { ok } = await apiMutate(`/api/atc/${atcId}`, { method: 'DELETE', errorPrefix: 'No se pudo eliminar la llamada' })
    if (!ok) return
    onRefresh()
  }

  const pasteHandler = (contexto: 'envio' | 'respuesta') => !isClosed ? async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile(); if (!file) continue
        const reader = new FileReader()
        const dataUrl = await new Promise<string>(res => { reader.onload = ev => res(ev.target!.result as string); reader.readAsDataURL(file) })
        const compressed = await compressImage(dataUrl)
        const { ok } = await apiMutate('/api/adjuntos', { method: 'POST', json: { url: compressed, nombre: `captura-${Date.now()}.jpg`, tipo: 'image/jpeg', tamanoBytes: Math.round(compressed.length*0.75), escalamientoId: esc.id, contexto }, errorPrefix: 'No se pudo adjuntar la captura' })
        if (!ok) return
        setEscAdjKey(k => k + 1)
      }
    }
  } : undefined

  return (
    <div style={{ background: 'var(--muted)', borderRadius: '12px', border: `1px solid ${isRespondido ? '#86efac' : isSinRespuesta ? 'rgba(220,38,38,0.3)' : 'var(--border)'}`, overflow: 'hidden' }}>

      {/* ── Header compacto ── */}
      <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 700 }}>N{esc.nivel}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>{esc.contactoEscalado}</span>
              {isRespondido  && <span style={{ fontSize: '10px', padding: '1px 7px', background: '#dcfce7', color: '#15803d', borderRadius: '20px', fontWeight: 600 }}>Respondido</span>}
              {isSinRespuesta && <span style={{ fontSize: '10px', padding: '1px 7px', background: '#fee2e2', color: '#b91c1c', borderRadius: '20px', fontWeight: 600 }}>Sin respuesta</span>}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
              {esc.emailContacto    && <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>✉ {esc.emailContacto}</span>}
              {esc.telefonoContacto && <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>📱 {esc.telefonoContacto}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, marginLeft: '8px' }}>
            <span style={{ fontSize: '9px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{horaCreado}</span>
            {!isClosed && isRespondido && (
              <button onClick={() => setEditTiempos(v => !v)} title="Editar tiempos"
                style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: editTiempos ? '#dbeafe' : 'rgba(0,0,0,0.06)', border: `1px solid ${editTiempos ? '#93c5fd' : 'var(--border)'}`, borderRadius: '4px', color: editTiempos ? '#1d4ed8' : 'var(--muted-foreground)', cursor: 'pointer', fontSize: '11px' }}>✎</button>
            )}
            {!isClosed && (
              <button onClick={handleDelete} title="Eliminar"
                style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '4px', color: '#dc2626', cursor: 'pointer' }}>
                <IcoTrashEsc />
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 12px' }} onPaste={pasteHandler('envio')}>

        {/* Plantilla */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <button onClick={() => setShowTemplate(v => !v)}
              style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              📄 Plantilla de correo {showTemplate ? '▲' : '▼'}
            </button>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={copyTemplate}
                style={{ fontSize: '10px', padding: '2px 8px', background: copied ? '#14532d' : 'transparent', color: copied ? '#86efac' : 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>
                {copied ? '✓ Copiado' : '📋 Copiar'}
              </button>
              {!isClosed && <button onClick={() => setTemplateBody(buildCorreo(inc, nivelData, esc.nivel, prevEscs))}
                style={{ fontSize: '10px', padding: '2px 8px', background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}>🔄 Actualizar</button>}
              {showTemplate && !isClosed && (
                <button onClick={saveTemplate} disabled={savingTemplate}
                  style={{ fontSize: '10px', padding: '2px 8px', background: savingTemplate ? 'var(--muted)' : 'hsl(221,83%,45%)', color: savingTemplate ? 'var(--muted-foreground)' : 'white', border: 'none', borderRadius: '4px', cursor: savingTemplate ? 'wait' : 'pointer' }}>
                  {savingTemplate ? '...' : '💾 Guardar'}
                </button>
              )}
            </div>
          </div>
          {showTemplate && (
            <textarea value={templateBody} onChange={e => setTemplateBody(e.target.value)} disabled={isClosed}
              style={{ width: '100%', fontSize: '9px', background: 'var(--card)', padding: '8px 10px', borderRadius: '8px', color: 'var(--foreground)', lineHeight: 1.5, border: '1px solid var(--border)', fontFamily: 'monospace', resize: 'vertical', minHeight: '200px', outline: 'none', boxSizing: 'border-box' }} />
          )}
        </div>

        {/* Adjuntos envío */}
        <div style={{ marginBottom: '8px' }}>
          <AdjuntosZona key={`${escAdjKey}-1`} escalamientoId={esc.id} contexto="envio" disabled={isClosed} />
        </div>

        {/* Botón correo enviado */}
        {!esc.horaEnvioCorreo && !isClosed && !isSinRespuesta && (
          <button onClick={handleEnvio}
            style={{ width: '100%', padding: '9px', background: 'hsl(221,83%,45%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginBottom: '6px' }}>
            ✉ Correo enviado → Iniciar cronómetro
          </button>
        )}
      </div>

      {/* ── Sección respuesta ── */}
      <div onPaste={pasteHandler('respuesta')}>

        {isCorriendo && (
          <div style={{ padding: '0 12px 12px' }}>
            {/* Cronómetro + formulario en 2 columnas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px', alignItems: 'start', marginBottom: '8px' }}>
              <CronometroEscalamiento horaEnvio={esc.horaEnvioCorreo} horaRespuesta={esc.horaRespuesta} />
              <div>
                <button type="button" onClick={() => setShowRespText(v => !v)}
                  style={{ fontSize: '10px', fontWeight: 600, color: 'var(--foreground)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Respuesta del proveedor {showRespText ? '▲' : '▼'}
                </button>
                {showRespText && (
                  <textarea value={respuestaText} onChange={e => setRespuestaText(e.target.value)}
                    placeholder="Documenta la respuesta recibida..."
                    style={{ width: '100%', padding: '6px 8px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', resize: 'vertical', minHeight: '52px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                )}
              </div>
            </div>

            {/* ETA + Hora de respuesta en grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>ETA proveedor</label>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <input type="number" min="0" max="99" value={etaH} onChange={e => setEtaH(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ width: '48px', padding: '5px 6px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', textAlign: 'center' }} />
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>h</span>
                  <input type="number" min="0" max="59" value={etaM} onChange={e => setEtaM(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                    style={{ width: '48px', padding: '5px 6px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', textAlign: 'center' }} />
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>min</span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                  Hora respuesta <span style={{ fontWeight: 400, textTransform: 'none' }}>(vacío = ahora)</span>
                </label>
                <input type="datetime-local" value={horaRespManual} onChange={e => setHoraRespManual(e.target.value)}
                  style={{ width: '100%', padding: '5px 7px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Adjuntos respuesta */}
            <div style={{ marginBottom: '8px' }}>
              <AdjuntosZona key={`${escAdjKey}-2`} escalamientoId={esc.id} contexto="respuesta" disabled={isClosed} />
            </div>

            {/* Botones acción */}
            {!isClosed && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleRespuesta} disabled={saving}
                  style={{ flex: 1, padding: '8px', background: '#14532d', color: '#86efac', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
                  {saving ? 'Guardando...' : '✓ Registrar respuesta'}
                </button>
                <button onClick={handleSinRespuesta}
                  style={{ flex: 1, padding: '8px', background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '8px', fontSize: '11px', cursor: 'pointer' }}>
                  ✗ No hubo respuesta
                </button>
              </div>
            )}
          </div>
        )}

        {/* Respondido */}
        {isRespondido && (
          <div style={{ margin: '0 12px 10px' }}>
            <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#15803d' }}>
                ✓ {minToHM(esc.tiempoRespuestaMin)} · {new Date(esc.horaRespuesta).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}
                {esc.tiempoEstimadoSolucion && (() => {
                  const m = parseEtaMin(esc.tiempoEstimadoSolucion)
                  return <span style={{ fontWeight: 400, marginLeft: '8px' }}>· ETA: {m != null ? minToHM(m) : esc.tiempoEstimadoSolucion}</span>
                })()}
              </div>
              {esc.respuestaTexto && (
                <div style={{ marginTop: '4px' }}>
                  <button type="button" onClick={() => setShowRespText(v => !v)}
                    style={{ fontSize: '10px', color: '#15803d', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                    {showRespText ? '▲ Ocultar' : '▼ Ver respuesta'}
                  </button>
                  {showRespText && <div style={{ fontSize: '11px', color: 'var(--foreground)', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{esc.respuestaTexto}</div>}
                </div>
              )}
            </div>
            {editTiempos && (
              <div style={{ marginTop: '6px', padding: '8px 12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #93c5fd', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Corregir tiempos</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>Envío N{esc.nivel}</div>
                    <input type="datetime-local" value={horaEnvioEdit} onChange={e => setHoraEnvioEdit(e.target.value)}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #93c5fd', borderRadius: '6px', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>Respuesta</div>
                    <input type="datetime-local" value={horaRespEdit} onChange={e => setHoraRespEdit(e.target.value)}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #93c5fd', borderRadius: '6px', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <button onClick={handleGuardarTiempos} disabled={savingTiempos}
                  style={{ padding: '5px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: savingTiempos ? 'wait' : 'pointer' }}>
                  {savingTiempos ? 'Guardando...' : 'Guardar tiempos'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sin respuesta */}
        {isSinRespuesta && !isRespondido && (
          <div style={{ margin: '0 12px 10px', padding: '7px 12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid rgba(220,38,38,0.3)' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#b91c1c' }}>✗ No hubo respuesta del proveedor</div>
          </div>
        )}
      </div>

      {/* ATC */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
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
  )
}
