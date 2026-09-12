'use client'
import { useEffect, useState, use, useCallback, useRef, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Badge, estadoToVariant, impactoToVariant } from '@/components/ui/Badge'
import { CronometroPrincipal } from '@/components/incidentes/CronometroPrincipal'
import { GuiaEscalamiento } from '@/components/incidentes/GuiaEscalamiento'
import { AdjuntosZona } from '@/components/incidentes/AdjuntosZona'
import { InfraEscalamientoPanel } from '@/components/incidentes/InfraEscalamientoPanel'
import { GrupoMasivoPanel } from '@/components/incidentes/GrupoMasivoPanel'
import { EscalamientoCard } from '@/components/incidentes/EscalamientoCard'
import { iStyle, taStyle, toDatetimeLocal, fromDatetimeLocal, minToHM, TIPO_LABELS, buildCorreo, setupIncidenteAutoRefresh } from '@/components/incidentes/helpers'
import { can } from '@/lib/permisos'
import { apiMutate } from '@/lib/api-mutate'
import { normContFactor, normBoletaFactor, diaSemanaLima } from '@/lib/impacto-calc'
import { DASHBOARD_CONFIG } from '@/lib/dashboard-config'

const ALCANCE_LABELS: Record<string, string> = {
  SOLO_TIENDA: 'Solo la tienda', MALL: 'El mall',
  CUADRA_CALLE: 'Cuadra / calle', ZONA_AMPLIA: 'Zona amplia',
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function mttrFromHoras(h1: string, h2: string) {
  return Math.round((new Date(h2).getTime() - new Date(h1).getTime()) / 60000)
}

interface SegmentoIeiEnCurso { desdeMs: number; hastaMs: number; horas: number; factor: number; descripcion: string; ieiParcial: number }
const FACTOR_BASE_IEI_EN_CURSO: Record<string, number> = { CAIDA_TOTAL: 1.00, INTERMITENCIA: 0.50, LENTITUD: 0.30, CORTE_ELECTRICO: 1.00 }

/** IEI "en curso" de un incidente ABIERTO (bloque IEI del panel de detalle) —
 *  mismo cálculo que calcImpactoRow (lib/impacto-calc.ts) pero usando `nowMs`
 *  como límite superior en vez de hora_fin. Exportada solo para poder
 *  probarla en test (mismo cálculo, sin cambios de lógica salvo el gate de
 *  movActivadoPor — ver comentario abajo). */
export function calcIeiEnCurso(inc: any, nowMs: number): { ieiEnCurso: number; ventaHoraEnCurso: number; segmentosEnCurso: SegmentoIeiEnCurso[] } {
  if (!inc.tiendaVentaHoraSoles) return { ieiEnCurso: 0, ventaHoraEnCurso: 0, segmentosEnCurso: [] }
  const tsMs = (v: any) => v ? new Date(v).getTime() : null
  const dow = diaSemanaLima(new Date(inc.horaRegistro))
  const isFDS = dow === 0 || dow === 5 || dow === 6
  const ventaHoraEnCurso = isFDS
    ? Number(inc.tiendaVentaHoraFdsSoles ?? inc.tiendaVentaHoraSoles)
    : Number(inc.tiendaVentaHoraSoles ?? inc.tiendaVentaHoraFdsSoles)
  const startMs = new Date(inc.horaRegistro).getTime()
  // contHoraActivacion solo cuenta como activación de router si contActivadoPor
  // está seteado. Mismo gate para movHoraActivacion/movActivadoPor — bug real
  // confirmado en producción: sin este chequeo, un timestamp fantasma en
  // mov_hora_activacion (sin mov_activado_por) se contaba como datos móviles
  // activo. Boleta manual tiene su propio campo, boletaHoraActivacion.
  const contStartMs = inc.contActivadoPor ? tsMs(inc.contHoraActivacion) : null
  const contEndMs   = tsMs(inc.contHoraDesactivacion)
  const movStartMs  = inc.movActivadoPor ? tsMs(inc.movHoraActivacion) : null
  const movEndMs    = tsMs(inc.movHoraDesactivacion)
  const contF = contStartMs !== null ? normContFactor(inc.contRendimiento) : null
  const movF  = movStartMs  !== null ? normContFactor(inc.movRendimiento)  : null
  const bolF  = inc.boletaManual ? normBoletaFactor(inc.boletaRendimiento, inc.tipo) : null
  const bolStartMs = inc.boletaManual
    ? (inc.boletaHoraActivacion ? tsMs(inc.boletaHoraActivacion) : startMs)
    : null
  const bpSet = new Set([startMs, nowMs])
  const addBp = (t: number | null) => { if (t && t > startMs && t < nowMs) bpSet.add(t) }
  addBp(contStartMs); addBp(contEndMs); addBp(movStartMs); addBp(movEndMs); addBp(bolStartMs)
  const bps = Array.from(bpSet).sort((a, b) => a - b)
  let ieiEnCurso = 0
  const segmentosEnCurso: SegmentoIeiEnCurso[] = []
  for (let i = 0; i < bps.length - 1; i++) {
    const segS = bps[i], segE = bps[i + 1]
    const mid = (segS + segE) / 2, h = (segE - segS) / 3600000
    const opts: { f: number; label: string }[] = []
    const bolActiva = bolF !== null && bolStartMs !== null && mid >= bolStartMs
    if (inc.tipo === 'CORTE_ELECTRICO') {
      if (bolActiva) opts.push({ f: bolF!, label: `boleta ${inc.boletaRendimiento?.toLowerCase() ?? 'efectiva'}` })
      else opts.push({ f: 1.00, label: 'sin mitigación' })
    } else {
      if (contF !== null && contStartMs !== null && mid >= contStartMs && (contEndMs === null || mid < contEndMs))
        opts.push({ f: contF, label: `router ${inc.contEsExterno ? 'externo' : 'propio'}${inc.contRendimiento ? ' ' + inc.contRendimiento.toLowerCase() : ''}` })
      if (movF !== null && movStartMs !== null && mid >= movStartMs && (movEndMs === null || mid < movEndMs))
        opts.push({ f: movF, label: `datos móviles${inc.movRendimiento ? ' ' + inc.movRendimiento.toLowerCase() : ''}` })
      if (bolActiva) opts.push({ f: bolF!, label: `boleta ${inc.boletaRendimiento?.toLowerCase() ?? 'efectiva'}` })
      if (!opts.length) opts.push({ f: FACTOR_BASE_IEI_EN_CURSO[inc.tipo] ?? 1.00, label: 'sin mitigación' })
    }
    const best = opts.reduce((a, b) => (a.f <= b.f ? a : b))
    const segIEI = ventaHoraEnCurso * h * DASHBOARD_CONFIG.MARGEN_BRUTO * best.f
    ieiEnCurso += segIEI
    segmentosEnCurso.push({ desdeMs: segS, hastaMs: segE, horas: Math.round(h * 100) / 100, factor: best.f, descripcion: best.label, ieiParcial: Math.round(segIEI) })
  }
  return { ieiEnCurso: Math.round(ieiEnCurso), ventaHoraEnCurso, segmentosEnCurso }
}

/** IEI en vivo del tramo actualmente abierto (tabla "Desglose por tramos") —
 *  venta/hora × horas transcurridas desde tramo.desde × margen × tramo.factor.
 *  El factor ya viene resuelto del backend (Paso 3) — no se reimplementa esa
 *  parte, solo se proyecta el tiempo transcurrido. Exportada solo para test. */
export function calcIeiTramoAbierto(
  tramo: { desde: string | Date; hasta: string | Date | null; factor: string | number } | null,
  tienda: { ventaHoraSoles?: number | string | null; ventaHoraFdsSoles?: number | string | null } | null,
  nowMs: number,
): number {
  if (!tramo || tramo.hasta != null) return 0
  const desdeMs = new Date(tramo.desde).getTime()
  const horas = Math.max(0, (nowMs - desdeMs) / 3600000)
  const dow = diaSemanaLima(new Date(tramo.desde))
  const isFDS = dow === 0 || dow === 5 || dow === 6
  const ventaHora = isFDS
    ? Number(tienda?.ventaHoraFdsSoles ?? tienda?.ventaHoraSoles ?? 0)
    : Number(tienda?.ventaHoraSoles ?? tienda?.ventaHoraFdsSoles ?? 0)
  return Math.round(ventaHora * horas * DASHBOARD_CONFIG.MARGEN_BRUTO * Number(tramo.factor))
}

/** Checklist de descartes, agrupado por etapa del diagnóstico. Los dos primeros
 *  grupos son Sí/No (nullable: null = no respondido); los dos últimos, checkbox.
 *  "Se cambió DNS" (descDns) no está acá a propósito: era una acción correctiva
 *  entre diagnósticos. Se dejó de ofrecer, pero los incidentes que ya lo tienen
 *  respondido lo siguen mostrando en modo lectura. */
export const DESCARTES_SINO = [
  {
    titulo: 'Capa física',
    items: [
      { key: 'descEnergia',  label: 'Energía eléctrica' },
      { key: 'descRouter',   label: 'Router / ONT encendido con luces normales' },
      { key: 'descCableado', label: 'Cableado conectado correctamente' },
    ],
  },
  {
    titulo: 'Reinicio',
    items: [
      { key: 'descReinicioEquipo', label: 'Se reinició el equipo (router / ONT)' },
    ],
  },
]

export const DESCARTES_CHECK = [
  {
    titulo: 'Conectividad / red',
    items: [
      { key: 'checkIpconfig',     label: 'Se ejecutó ipconfig' },
      { key: 'checkRenovarIp',    label: 'Se renovó IP (DHCP)' },
      { key: 'checkPingGw',       label: 'Ping a gateway' },
      { key: 'checkPingInternet', label: 'Ping a internet' },
      { key: 'checkTracert',      label: 'Tracert' },
    ],
  },
  {
    titulo: 'DNS',
    items: [
      { key: 'checkDns', label: 'Se validó resolución DNS' },
    ],
  },
]

/** Total de la tabla "Desglose por tramos": suma el ie_tramo ya sellado de los
 *  tramos cerrados más el IEI en vivo del abierto (que aún no tiene ie_tramo).
 *  Es el mismo número que muestra el IEI del incidente, para que la fila de
 *  total y la cabecera no puedan contradecirse. Exportada solo para test. */
export function sumaIeiTramos(
  tramos: { hasta: string | Date | null; ieTramo?: string | number | null }[],
  ieiTramoAbiertoLive: number,
): number {
  const cerrados = tramos
    .filter(t => t.hasta != null)
    .reduce((s, t) => s + Number(t.ieTramo ?? 0), 0)
  return cerrados + ieiTramoAbiertoLive
}

/** El botón de editar un tramo (Paso 5) requiere el permiso incidentes.editar-tramos
 *  Y que el tramo ya esté cerrado — el tramo abierto se edita desde el control de
 *  mitigación, nunca desde acá. Exportada solo para test. */
export function puedeEditarTramo(tienePermiso: boolean, tramo: { hasta: string | Date | null }): boolean {
  return tienePermiso && tramo.hasta != null
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

  // Fase 4 — control único de mitigación (reemplaza los 3 bloques viejos de
  // Contingencia/Datos móviles/Boleta manual) + tabla de Desglose por tramos.
  const [tramos, setTramos]                       = useState<any[]>([])
  const [mitigacionTipo, setMitigacionTipo]         = useState('SIN_MITIGACION')
  const [mitigacionRendimiento, setMitigacionRendimiento] = useState('')
  const [mitigacionRouterExternoId, setMitigacionRouterExternoId] = useState<string | null>(null)
  const [savingMitigacion, setSavingMitigacion]     = useState(false)
  const [mitigacionError, setMitigacionError]       = useState('')
  const [editandoTramoId, setEditandoTramoId]       = useState<string | null>(null)
  const [editTramoDesde, setEditTramoDesde]         = useState('')
  const [editTramoHasta, setEditTramoHasta]         = useState('')
  const [savingTramoEdit, setSavingTramoEdit]       = useState(false)
  const [tramoEditError, setTramoEditError]         = useState('')

  const fetchTramos = useCallback(async () => {
    const res = await fetch(`/api/incidentes/${id}/tramos`)
    if (!res.ok) return
    const data = await res.json()
    setTramos(Array.isArray(data) ? data : [])
  }, [id])

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
      horaFin:              toDatetimeLocal(data.horaFin),
      // La mitigación (cont_*, mov_*, boleta_*) NO vive acá: se opera con el
      // control de tramos, que llama a POST /mitigacion. Esos campos quedaron
      // congelados como dato histórico y el PUT los ignora, así que mandarlos
      // en el body no hacía nada — solo ensuciaba cada guardado.
      // horaRegistroOriginal tampoco: lo escribe /reabrir, no el agente.
      routerExternoId:       data.routerExternoId ?? null,
      descEnergia:         data.descEnergia         ?? null,
      descRouter:          data.descRouter          ?? null,
      descCableado:        data.descCableado        ?? null,
      descReinicioEquipo:  data.descReinicioEquipo  ?? null,
      descDns:             data.descDns             ?? null,
      checkIpconfig:       data.checkIpconfig       ?? false,
      checkPingGw:         data.checkPingGw         ?? false,
      checkPingInternet:   data.checkPingInternet   ?? false,
      checkTracert:        data.checkTracert        ?? false,
      checkDns:            data.checkDns            ?? false,
      checkRenovarIp:      data.checkRenovarIp      ?? false,
      descartesDetallado:  data.descartesDetallado  ?? '',
      ventaParcial:        data.ventaParcial        ?? null,
      cajasAfectadas:      data.cajasAfectadas      ?? null,
      cajasTotales:        data.cajasTotales        ?? null,
      alcanceCorte:        data.alcanceCorte        ?? null,
      tuvoUps:             data.tuvoUps             ?? null,
    })
  }, [id])

  // Refresco liviano de solo `inc` (sin tocar editForm) para el auto-refresh
  // periódico/al recuperar foco — fetchInc() completo resetearía cualquier
  // edición en curso del formulario cada vez que corre.
  const fetchIncOnly = useCallback(async () => {
    const res  = await fetch(`/api/incidentes/${id}`)
    const data = await res.json()
    setInc(data)
    fetchTramos()
  }, [id, fetchTramos])

  useEffect(() => { fetchInc(); fetchTramos() }, [fetchInc, fetchTramos])
  // Sincroniza el control único de mitigación con el tramo actualmente
  // abierto — igual que editForm se sincroniza con `inc` en fetchInc.
  useEffect(() => {
    const abierto = tramos.find((t: any) => t.hasta == null)
    setMitigacionTipo(abierto?.tipo ?? 'SIN_MITIGACION')
    setMitigacionRendimiento('')
    setMitigacionRouterExternoId(abierto?.routerExternoId ?? null)
  }, [tramos])
  useEffect(() => {
    const isClosed = inc && ['RESUELTO', 'CANCELADO', 'CERRADO'].includes(inc.estado)
    return setupIncidenteAutoRefresh(fetchIncOnly, { enabled: !!inc && !isClosed })
  }, [inc?.id, inc?.estado, fetchIncOnly])
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
    fetch(`/api/tiendas/${inc.tiendaId}/ultimos-incidentes`)
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
  const tramoAbiertoActual = tramos.find((t: any) => t.hasta == null) ?? null
  const ieiTramoAbiertoLive = calcIeiTramoAbierto(
    tramoAbiertoActual,
    { ventaHoraSoles: inc.tiendaVentaHoraSoles, ventaHoraFdsSoles: inc.tiendaVentaHoraFdsSoles },
    Date.now(),
  )
  const ieiTotalTramos = sumaIeiTramos(tramos, ieiTramoAbiertoLive)

  const canEditTramos = can(session, 'incidentes.editar-tramos')

  function setEdit(k: string, v: any) { setEditForm((f: any) => ({ ...f, [k]: v })) }

  // Fase 4 — control único de mitigación. Reemplaza los 3 bloques viejos
  // (Contingencia/Datos móviles/Boleta manual) — llama al endpoint nuevo del
  // Paso 3, no al PUT viejo. El PUT viejo con cont_*/mov_*/boleta_* sigue
  // intacto en el backend, simplemente esta pantalla ya no lo usa para esto.
  async function handleGuardarMitigacion() {
    // Router externo exige elegir cuál — el backend también lo rechaza (400),
    // esto solo evita el viaje redondo cuando ya se sabe que va a fallar.
    if (mitigacionTipo === 'ROUTER_EXTERNO' && !mitigacionRouterExternoId) {
      setMitigacionError('Debe seleccionar cuál router externo usar')
      return
    }
    setSavingMitigacion(true)
    setMitigacionError('')
    const { ok, data } = await apiMutate(`/api/incidentes/${id}/mitigacion`, {
      method: 'POST',
      json: {
        tipo: mitigacionTipo,
        rendimiento: mitigacionRendimiento || undefined,
        routerExternoId: mitigacionTipo === 'ROUTER_EXTERNO' ? mitigacionRouterExternoId : undefined,
      },
      errorPrefix: 'No se pudo cambiar la mitigación',
    })
    setSavingMitigacion(false)
    if (!ok) { setMitigacionError(data?.error ?? 'Error al guardar'); return }
    fetchTramos()
    fetchIncOnly()
  }

  function iniciarEdicionTramo(tramo: any) {
    setEditandoTramoId(tramo.id)
    setEditTramoDesde(toDatetimeLocal(tramo.desde))
    setEditTramoHasta(toDatetimeLocal(tramo.hasta))
    setTramoEditError('')
  }

  async function handleGuardarTramoEdit(tramoId: string) {
    setSavingTramoEdit(true)
    setTramoEditError('')
    const { ok, data } = await apiMutate(`/api/incidentes/${id}/tramos/${tramoId}`, {
      method: 'PATCH',
      json: {
        desde: fromDatetimeLocal(editTramoDesde),
        hasta: fromDatetimeLocal(editTramoHasta),
      },
      errorPrefix: 'No se pudo editar el tramo',
    })
    setSavingTramoEdit(false)
    if (!ok) { setTramoEditError(data?.error ?? 'Error al guardar'); return }
    setEditandoTramoId(null)
    fetchTramos()
  }

  async function handleSave() {
    setSaving(true)
    const body: any = { ...editForm }
    if ('horaRegistro'         in body) body.horaRegistro         = fromDatetimeLocal(body.horaRegistro)
    if ('horaFin'              in body) body.horaFin              = body.horaFin ? fromDatetimeLocal(body.horaFin) : null
    if (body.horaRegistro && body.horaFin) {
      body.mttrMinutos = mttrFromHoras(body.horaRegistro, body.horaFin)
    } else if (body.horaFin === null) {
      body.mttrMinutos = null
    }
    // Acá se derivaba estadoOperacion / factorOperativo / operacionManual desde
    // los rendimientos de cont_* y mov_*. Todo eso lo resuelve ahora el tramo
    // abierto (POST /mitigacion): su factor ES el factor operativo.
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

  // Un nivel de ficha es "infra interna" SOLO cuando su contacto se llama
  // Infraestructura. NO se detecta por dominio de correo: proveedores como
  // "Soporte Bitel Footloose" también usan @footloose.pe y NO son infra.
  // Estos niveles no se escalan como proveedor: van por el botón INFRAESTRUCTURA.
  function esNivelInfra(nd: any): boolean {
    if (!nd) return false
    return String(nd.nombreContacto ?? '').toLowerCase().includes('infra')
  }

  function handleEscalarNivel(nivel: number) {
    setShowNivelMenu(false)
    const nivelInfra = inc.nivelesProveedor?.find((n: any) => n.nivel === nivel)
    if (esNivelInfra(nivelInfra)) {
      alert(`El nivel N${nivel} de esta tienda es Infraestructura interna (${nivelInfra?.nombreContacto ?? ''}).\n\nNo se escala como proveedor. Usa el botón 🔧 Infraestructura para pasar el incidente al equipo de infra.`)
      return
    }
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
      <div style={{ background: 'var(--surface-2)', borderRadius: '12px', padding: '11px 16px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{inc.codigo}</span>
              <Badge variant={impactoToVariant(inc.nivelImpacto)} />
              <Badge variant={estadoToVariant(inc.estado)} />
              {!isClosed && (inc.escalamientos ?? []).some((e: any) =>
                e.horaEnvioCorreo && !e.horaRespuesta && !e.noHuboRespuesta &&
                Date.now() - new Date(e.horaEnvioCorreo).getTime() > 60 * 60000
              ) && (
                <span title="SLA de respuesta excedido" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: 'var(--danger)', fontWeight: 600 }}>
                  <span className="nd-pulse" style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--danger-bg)', flexShrink: 0 }} />
                  SLA vencido
                </span>
              )}
              {inc.escaladoInfraId && !isClosed && (
                <span style={{ fontSize: '10px', background: 'rgba(99,102,241,0.25)', color: 'var(--info)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.04em' }}>
                  🔧 INFRAESTRUCTURA
                </span>
              )}
              {inc.estado === 'RESUELTO' && inc.resueltoPor && (
                <span style={{
                  fontSize: '10px',
                  background: inc.resueltoPor === 'AGENTE' ? 'rgba(59,130,246,0.25)' : inc.resueltoPor === 'INFRAESTRUCTURA' ? 'rgba(99,102,241,0.25)' : inc.resueltoPor === 'ENERGIA_ELECTRICA' ? 'rgba(234,179,8,0.25)' : 'rgba(34,197,94,0.25)',
                  color:      inc.resueltoPor === 'AGENTE' ? 'var(--info)'               : inc.resueltoPor === 'INFRAESTRUCTURA' ? 'var(--info)'               : inc.resueltoPor === 'ENERGIA_ELECTRICA' ? 'var(--warn)'              : 'var(--ok)',
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
                    color:      (inc as any).motivoReabertura === 'TIENDA_SIN_INTERNET' ? 'var(--danger)'              : 'var(--warn)',
                  }}>
                  ↩ reabierto
                </span>
              )}
              <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.08)', color: 'var(--muted-foreground)', padding: '2px 8px', borderRadius: '4px' }}>
                {TIPO_LABELS[inc.tipo] ?? inc.tipo}
              </span>
            </div>
            {/* Título y timer en la misma línea: el cronómetro sigue visible pero
                deja de ser el bloque más alto de la pantalla. */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '16px', marginBottom: '3px' }}>
              <div style={{ fontSize: '17px', fontWeight: 600, color: 'white', lineHeight: 1.2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {inc.tiendaCodigo} — {inc.tiendaNombre}
              </div>
              {/* El label lo pone CronometroPrincipal, que además alterna entre
                  "Tiempo del incidente" y "Tiempo total" según esté resuelto. */}
              <CronometroPrincipal compacto horaRegistro={inc.horaRegistro} horaFin={inc.horaFin} tiempoAcumuladoMin={(inc as any).tiempoAcumuladoMin} horaRegistroOriginal={(inc as any).horaRegistroOriginal} />
            </div>
            {/* Toda la metadata en una sola línea que envuelve, en vez de cinco
                bloques apilados. No se quita ningún dato, solo se compacta. */}
            <div style={{ fontSize: '11px', color: 'var(--faint-foreground)', lineHeight: 1.6 }}>
              {inc.tipo === 'CORTE_ELECTRICO' ? '⚡ Energía Eléctrica' : (inc.proveedorNombre ?? '—')} · {inc.tiendaDistrito}
              {inc.escaladoInfraId
                ? <> · <span style={{ color: 'var(--info)' }}>Infra: {[inc.infraNombre, inc.infraApellido].filter(Boolean).join(' ')}</span> · Escalado por: {inc.agenteNombre}</>
                : <> · Agente: {inc.agenteNombre}</>
              }
              {inc.tiendaReferencia && <> · {inc.tiendaReferencia}</>}
              {inc.tiendaAdminCelular && (
                <> · <span style={{ fontFamily: 'monospace', color: 'var(--foreground)', fontWeight: 600 }}>{inc.tiendaAdminCelular}</span></>
              )}
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>
                {' · '}Creado: {new Date((inc as any).horaRegistroOriginal ?? inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {inc.actualizadoEn && <>{' · '}Última edición: {new Date(inc.actualizadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</>}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '16px' }}>
            {canDelete && (
              <button onClick={handleEliminar} title="Eliminar incidente"
                style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: '6px', color: 'var(--danger)', cursor: 'pointer', flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>
            )}
            <div style={{ position: 'relative' }}
              onMouseEnter={() => setShowGuia(true)}
              onMouseLeave={() => setShowGuia(false)}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', fontSize: '11px', fontWeight: 700, color: 'var(--faint-foreground)', userSelect: 'none' }}>?</div>
              {((inc as any).tiendaInstruccion || inc.proveedorInstruccion) && (
                <div style={{ position: 'absolute', top: '26px', right: 0, zIndex: 200, minWidth: '300px', opacity: showGuia ? 1 : 0, pointerEvents: showGuia ? 'auto' : 'none', transition: 'opacity 0.2s ease', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', borderRadius: '10px', overflow: 'hidden' }}>
                  <GuiaEscalamiento proveedor={inc.proveedorNombre} instruccion={(inc as any).tiendaInstruccion || inc.proveedorInstruccion} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Reopen modal ── */}
      {showReopenModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,7,20,0.72)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                    style={{ padding: '12px 14px', background: 'var(--danger-bg)', border: '1.5px solid var(--danger-border)', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--danger)', marginBottom: '2px' }}>
                      Tienda nuevamente sin internet
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--danger)' }}>
                      El proveedor planteó una solución incorrecta — el servicio volvió a caer.
                    </div>
                  </button>
                  <button
                    onClick={() => setReopenMotivo('ERROR_AGENTE')}
                    style={{ padding: '12px 14px', background: 'var(--warn-bg)', border: '1.5px solid var(--warn-border)', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--warn)', marginBottom: '2px' }}>
                      Error de gestión de agente
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--warn)' }}>
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
                  background: reopenMotivo === 'TIENDA_SIN_INTERNET' ? 'var(--danger-bg)' : 'var(--warn-bg)',
                  color: reopenMotivo === 'TIENDA_SIN_INTERNET' ? 'var(--danger)' : 'var(--warn)',
                  border: `1px solid ${reopenMotivo === 'TIENDA_SIN_INTERNET' ? 'var(--danger-border)' : 'var(--warn-border)'}`,
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
                    style={{ flex: 1, padding: '8px', background: (!reopenJustificacion.trim() || reopening) ? 'var(--muted)' : 'var(--warn-bg)', color: (!reopenJustificacion.trim() || reopening) ? 'var(--muted-foreground)' : 'var(--warn-bg)', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: (reopening || !reopenJustificacion.trim()) ? 'not-allowed' : 'pointer' }}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,7,20,0.72)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '420px', margin: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: 'var(--warn)' }}>
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
                style={{ padding: '10px', background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                + Crear nuevo incidente (recomendado)
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setShowReopenWarning(false); setShowReopenModal(true) }}
                  style={{ flex: 1, padding: '8px', background: 'rgba(133,79,11,0.12)', color: 'var(--warn)', border: '1px solid rgba(133,79,11,0.3)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,7,20,0.72)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '380px', margin: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>¿Estás seguro de saltar el N{skipConfirm.saltar}?</div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '20px' }}>Se registrará un escalamiento de Nivel {skipConfirm.nivel} sin pasar por el N{skipConfirm.saltar}.</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setSkipConfirm(null)}
                style={{ flex: 1, padding: '8px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => { doEscalar(skipConfirm.nivel); setSkipConfirm(null) }}
                style={{ flex: 1, padding: '8px', background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                Sí, saltar N{skipConfirm.saltar}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resolver modal — paso 1: elegir modo ── */}
      {showResolverModal && !resolverMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,7,20,0.72)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--purple)' }}>Infraestructura</div>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,7,20,0.72)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                style={{ flex: 1, padding: '8px', background: 'var(--ok-bg)', color: 'var(--ok)', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                Sí, resuelto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Escalar a Infraestructura ── */}
      {showInfraModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,7,20,0.72)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px 24px', width: '400px', maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>🔧 Escalar a Infraestructura</div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '14px' }}>Selecciona el agente que tomará el caso. El incidente quedará asignado a él.</div>
            {infraLoadingAg ? (
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', padding: '12px 0' }}>Cargando agentes...</div>
            ) : infraAgentes.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--danger)', padding: '12px 0' }}>No hay agentes de infraestructura registrados.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {infraAgentes.map(ag => (
                  <button key={ag.id} onClick={() => setInfraSelectedId(ag.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: infraSelectedId === ag.id ? 'rgba(99,102,241,.1)' : 'var(--muted)', border: `1.5px solid ${infraSelectedId === ag.id ? '#818cf8' : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(99,102,241,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'var(--purple)', flexShrink: 0 }}>
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
            {infraError && <div style={{ fontSize: '11px', color: 'var(--danger)', marginBottom: '8px' }}>{infraError}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInfraModal(false)} style={{ padding: '7px 14px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleEscalarInfra} disabled={infraSaving || !infraSelectedId}
                style={{ padding: '7px 14px', background: infraSaving || !infraSelectedId ? 'var(--info-bg)' : 'var(--purple-bg)', color: 'white', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: infraSaving || !infraSelectedId ? 'not-allowed' : 'pointer' }}>
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

            {/* Fila 1: Ticket InvGate | Ticket Proveedor | Mitigación activa */}
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
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Mitigación activa</label>
                <select disabled={!canEditB || isClosed} style={iStyle(!canEditB || isClosed)} value={mitigacionTipo} onChange={e => { setMitigacionTipo(e.target.value); if (e.target.value !== 'ROUTER_EXTERNO') setMitigacionRouterExternoId(null); setMitigacionError('') }}>
                  <option value="SIN_MITIGACION">Sin mitigación</option>
                  {inc.tipo !== 'CORTE_ELECTRICO' && <option value="ROUTER_PROPIO">Router propio</option>}
                  {inc.tipo !== 'CORTE_ELECTRICO' && <option value="ROUTER_EXTERNO">Router externo</option>}
                  {inc.tipo !== 'CORTE_ELECTRICO' && <option value="DATOS_MOVILES">Datos móviles</option>}
                  <option value="BOLETA_MANUAL">Boleta manual</option>
                </select>
              </div>
            </div>

            {/* Fase 4 (Paso 1 de frontend) — control único de mitigación: reemplaza
                los 3 bloques viejos (Contingencia/Datos móviles/Boleta manual).
                Llama a POST /api/incidentes/[id]/mitigacion (Paso 3), no al PUT viejo. */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '14px', padding: '14px', background: 'var(--muted)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>Mitigación</span>
                {tramoAbiertoActual && tramoAbiertoActual.tipo !== 'SIN_MITIGACION' && (
                  <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
                    Activa desde {toDatetimeLocal(tramoAbiertoActual.desde).slice(11, 16)}
                  </span>
                )}
              </div>
              {/* Selector de router externo — mismo criterio que ya usaba el
                  formulario viejo: solo se puede ELEGIR un router EN_TIENDA_INACTIVO
                  ya asignado a esta tienda; los demás se muestran mas deshabilitados
                  para que quede claro por qué no aparecen como opción real. */}
              {mitigacionTipo === 'ROUTER_EXTERNO' && (() => {
                const enEstaTienda = todosRouters.filter(r => r.estado === 'EN_TIENDA_INACTIVO' && r.tiendaActualId === inc?.tiendaId)
                const enUso        = todosRouters.filter(r => r.estado === 'EN_TIENDA_ACTIVO')
                const otrosLugares = todosRouters.filter(r => r.estado !== 'EN_TIENDA_ACTIVO' && !(r.estado === 'EN_TIENDA_INACTIVO' && r.tiendaActualId === inc?.tiendaId))
                const dis = !canEditB || isClosed
                return (
                  <div style={{ marginBottom: '10px', padding: '8px 12px', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', borderRadius: '8px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--warn)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Router externo a utilizar</label>
                    <select
                      disabled={dis}
                      value={mitigacionRouterExternoId ?? ''}
                      onChange={e => setMitigacionRouterExternoId(e.target.value || null)}
                      style={{ width: '100%', padding: '6px 9px', fontSize: '12px', border: '1px solid var(--warn-border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--warn)' }}>
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
                      <div style={{ fontSize: '10px', color: 'var(--warn)', marginTop: '4px', opacity: 0.8 }}>
                        Sin routers en esta tienda. Primero despliega un router desde Routers Contingencia TI.
                      </div>
                    )}
                  </div>
                )
              })()}
              {mitigacionTipo !== 'SIN_MITIGACION' && (
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Rendimiento</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[{ v: 'EFECTIVO', l: 'Efectivo', bg: 'var(--ok-bg)', c: 'var(--ok-bg)' }, { v: 'PARCIAL', l: 'Parcial', bg: 'var(--warn-bg)', c: 'var(--warn-bg)' }, { v: 'NULO', l: 'Nulo', bg: 'var(--danger-bg)', c: 'var(--danger-bg)' }].map(({ v, l, bg, c }) => {
                      const sel = mitigacionRendimiento === v
                      const dis = !canEditB || isClosed
                      return (
                        <button key={v} type="button" disabled={dis} onClick={() => setMitigacionRendimiento(v)}
                          style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '6px', border: `1px solid ${sel ? c : 'var(--border)'}`, cursor: dis ? 'default' : 'pointer', background: sel ? bg : 'var(--card)', color: sel ? c : 'var(--muted-foreground)', fontWeight: sel ? 600 : 400 }}>
                          {l}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <button type="button" disabled={!canEditB || isClosed || savingMitigacion} onClick={handleGuardarMitigacion}
                style={{ padding: '6px 14px', fontSize: '11px', fontWeight: 600, borderRadius: '6px', border: 'none', cursor: (!canEditB || isClosed || savingMitigacion) ? 'default' : 'pointer', background: 'var(--gradient-primary)', color: 'white', opacity: (!canEditB || isClosed) ? 0.5 : 1 }}>
                {savingMitigacion ? 'Guardando...' : 'Guardar mitigación'}
              </button>
              {mitigacionError && <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '6px' }}>{mitigacionError}</div>}
            </div>

            {/* Desglose por tramos — Fase 4 */}
            {tramos.length > 0 && (() => {
              const claseLabel: Record<string, string> = {
                SIN_MITIGACION: 'Sin mitigación', ROUTER_PROPIO: 'Router propio', ROUTER_EXTERNO: 'Router externo',
                DATOS_MOVILES: 'Datos móviles', BOLETA_MANUAL: 'Boleta manual',
              }
              const fmtHora = (v: string) => v ? new Date(v).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
              const fmtDuracion = (desde: string, hasta: string | null) => {
                const finMs = hasta ? new Date(hasta).getTime() : Date.now()
                const min = Math.round((finMs - new Date(desde).getTime()) / 60000)
                return minToHM(min)
              }
              return (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '10px' }}>Desglose por tramos</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted-foreground)', textAlign: 'left' }}>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Desde</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Hasta</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Duración</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Mitigación</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Factor</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>IEI del tramo</th>
                          {canEditTramos && <th style={{ padding: '6px 8px', fontWeight: 600 }}></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {tramos.map((t: any) => {
                          const abierto = t.hasta == null
                          const ieiTramo = abierto ? ieiTramoAbiertoLive : Number(t.ieTramo ?? 0)
                          const enEdicion = editandoTramoId === t.id
                          return (
                            <Fragment key={t.id}>
                              <tr style={{ borderBottom: '1px solid var(--border)', background: abierto ? 'rgba(245,158,11,0.06)' : undefined }}>
                                <td style={{ padding: '6px 8px' }}>{fmtHora(t.desde)}</td>
                                <td style={{ padding: '6px 8px' }}>{abierto ? <span style={{ color: 'var(--warn)', fontWeight: 600 }}>En curso</span> : fmtHora(t.hasta)}</td>
                                <td style={{ padding: '6px 8px' }}>{fmtDuracion(t.desde, t.hasta)}</td>
                                <td style={{ padding: '6px 8px' }}>{claseLabel[t.tipo] ?? t.tipo}</td>
                                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{Number(t.factor).toFixed(2)}</td>
                                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>S/ {Math.round(ieiTramo).toLocaleString('es-PE')}</td>
                                {canEditTramos && (
                                  <td style={{ padding: '6px 8px' }}>
                                    {puedeEditarTramo(canEditTramos, t) && !enEdicion && (
                                      <button type="button" onClick={() => iniciarEdicionTramo(t)}
                                        style={{ padding: '3px 8px', fontSize: '10px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', color: 'var(--foreground)' }}>
                                        Editar
                                      </button>
                                    )}
                                  </td>
                                )}
                              </tr>
                              {enEdicion && (
                                <tr key={`${t.id}-edit`}>
                                  <td colSpan={canEditTramos ? 7 : 6} style={{ padding: '10px 8px', background: 'var(--card)', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                      <div>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>Desde</label>
                                        <input type="datetime-local" style={iStyle(false)} value={editTramoDesde} onChange={e => setEditTramoDesde(e.target.value)} />
                                      </div>
                                      <div>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>Hasta</label>
                                        <input type="datetime-local" style={iStyle(false)} value={editTramoHasta} onChange={e => setEditTramoHasta(e.target.value)} />
                                      </div>
                                      <button type="button" disabled={savingTramoEdit} onClick={() => handleGuardarTramoEdit(t.id)}
                                        style={{ padding: '6px 14px', fontSize: '11px', fontWeight: 600, borderRadius: '6px', border: 'none', cursor: savingTramoEdit ? 'default' : 'pointer', background: 'var(--gradient-primary)', color: 'white' }}>
                                        {savingTramoEdit ? 'Guardando...' : 'Guardar'}
                                      </button>
                                      <button type="button" onClick={() => setEditandoTramoId(null)}
                                        style={{ padding: '6px 14px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--card)', color: 'var(--foreground)' }}>
                                        Cancelar
                                      </button>
                                    </div>
                                    {tramoEditError && <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '6px' }}>{tramoEditError}</div>}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                      {/* Total: cerrados (ie_tramo) + el abierto calculado en vivo.
                          Es el mismo ieiTotalTramos que muestra el IEI del incidente,
                          así que la tabla y la cabecera nunca se contradicen. */}
                      <tfoot>
                        <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--muted)', fontWeight: 700 }}>
                          <td colSpan={5} style={{ padding: '8px', textAlign: 'right', color: 'var(--foreground)' }}>
                            Total
                          </td>
                          <td style={{ padding: '8px', fontFamily: 'monospace', color: 'var(--foreground)' }}>
                            S/ {Math.round(ieiTotalTramos).toLocaleString('es-PE')}
                          </td>
                          {canEditTramos && <td style={{ padding: '8px' }}></td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
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
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--warn)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Alcance del corte</label>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {(['SOLO_TIENDA', 'MALL', 'CUADRA_CALLE', 'ZONA_AMPLIA'] as const).map(v => {
                          const sel = editForm.alcanceCorte === v
                          return (
                            <button key={v} type="button" disabled={!canEditB}
                              onClick={() => setEdit('alcanceCorte', v)}
                              style={{ padding: '5px 14px', fontSize: '12px', borderRadius: '20px', border: `1px solid ${sel ? 'var(--warn-border)' : 'var(--border)'}`, cursor: !canEditB ? 'default' : 'pointer', fontWeight: sel ? 600 : 400, background: sel ? 'rgba(245,158,11,0.15)' : 'var(--card)', color: sel ? 'var(--warn-bg)' : 'var(--muted-foreground)' }}>
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
                          style={{ cursor: !canEditB ? 'default' : 'pointer', accentColor: 'var(--warn)', width: '14px', height: '14px' }} />
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
                      {/* Grupos Sí/No: capa física y reinicio */}
                      {DESCARTES_SINO.map(grupo => (
                        <div key={grupo.titulo} style={{ marginBottom: '14px' }}>
                          <div style={{ fontSize:'10px',fontWeight:600,color:'var(--muted-foreground)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:'7px' }}>
                            {grupo.titulo}
                          </div>
                          {grupo.items.map(({ key, label }) => (
                            <div key={key} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'7px',gap:'8px' }}>
                              <span style={{ fontSize:'11px',color:'var(--foreground)' }}>{label}</span>
                              <div style={{ display:'flex',gap:'4px',flexShrink:0 }}>
                                {([true,false] as const).map(val => (
                                  <button key={String(val)} type="button" disabled={!canEditB}
                                    onClick={() => setEdit(key, editForm[key] === val ? null : val)}
                                    style={{ padding:'2px 10px',fontSize:'11px',borderRadius:'5px',border:'1px solid var(--border)',cursor:!canEditB?'default':'pointer',background:editForm[key]===val?(val?'var(--ok-bg)':'var(--danger-bg)'):'var(--muted)',color:editForm[key]===val?(val?'var(--ok-bg)':'var(--danger-bg)'):'var(--muted-foreground)',fontWeight:editForm[key]===val?600:400 }}>
                                    {val?'Sí':'No'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}

                      {/* Grupos de checkbox: conectividad y DNS */}
                      {DESCARTES_CHECK.map(grupo => (
                        <div key={grupo.titulo} style={{ marginBottom: '14px' }}>
                          <div style={{ fontSize:'10px',fontWeight:600,color:'var(--muted-foreground)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:'7px' }}>
                            {grupo.titulo}
                          </div>
                          <div style={{ display:'flex',flexDirection:'column',gap:'7px' }}>
                            {grupo.items.map(({ key, label }) => (
                              <label key={key} style={{ display:'flex',alignItems:'center',gap:'7px',fontSize:'11px',cursor:!canEditB?'default':'pointer',color:editForm[key]?'var(--foreground)':'var(--muted-foreground)' }}>
                                <input type="checkbox" disabled={!canEditB} checked={!!editForm[key]} onChange={e => setEdit(key, e.target.checked)}
                                  style={{ cursor:!canEditB?'default':'pointer',accentColor:'var(--primary)',width:'13px',height:'13px' }} />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* Histórico: "Se cambió DNS" se descontinuó, pero los incidentes
                          que ya lo respondieron lo siguen mostrando, en solo lectura. */}
                      {(editForm.descDns === true || editForm.descDns === false) && (
                        <div style={{ borderTop:'1px dashed var(--border)',paddingTop:'10px',marginTop:'2px' }}>
                          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px' }}>
                            <span style={{ fontSize:'11px',color:'var(--muted-foreground)' }}>
                              Se cambió DNS
                              <span style={{ fontSize:'10px',fontStyle:'italic' }}> · campo descontinuado</span>
                            </span>
                            <span style={{ padding:'2px 10px',fontSize:'11px',borderRadius:'5px',flexShrink:0,background:'var(--muted)',color:editForm.descDns?'var(--ok-bg)':'var(--danger-bg)',fontWeight:600 }}>
                              {editForm.descDns ? 'Sí' : 'No'}
                            </span>
                          </div>
                        </div>
                      )}
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
                            editForm.descCableado === true && 'Cableado verificado',
                            editForm.descReinicioEquipo === true && 'Equipo reiniciado',
                            // Solo en incidentes históricos: el campo ya no se ofrece.
                            editForm.descDns     === true && 'Cambio DNS aplicado',
                          ].filter(Boolean) as string[]
                          return acc.length > 0
                            ? <div style={{ display:'flex',flexDirection:'column',gap:'5px' }}>
                                {acc.map(a => (
                                  <div key={a} style={{ display:'flex',alignItems:'center',gap:'6px',fontSize:'11px',color:'var(--foreground)' }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
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
              <div style={{ marginBottom:'12px',padding:'8px 12px',fontSize:'11px',background:'rgba(146,64,14,0.1)',border:'1px solid rgba(146,64,14,0.25)',borderRadius:'8px',color:'var(--warn)' }}>
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
                  style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', borderRadius: '6px', background: supervisorEdit ? 'var(--gradient-primary)' : 'var(--card)', color: supervisorEdit ? 'white' : 'var(--muted-foreground)', cursor: 'pointer' }}>
                  <IcoEdit />
                </button>
              )}
            </div>
            <div style={{ padding: '12px 16px' }}>
              <ResumenRow icon={<IcoStore />} label="Tienda">{inc.tiendaCodigo} — {inc.tiendaNombre}</ResumenRow>
              <ResumenRow icon={<IcoWifi />} label="Proveedor">
                {inc.tipo === 'CORTE_ELECTRICO'
                  ? <span style={{ color: 'var(--warn)', fontWeight: 600 }}>⚡ Energía Eléctrica</span>
                  : (inc.proveedorNombre ?? '—')}
              </ResumenRow>
              {inc.tipo === 'CORTE_ELECTRICO' && (
                <ResumenRow icon={<IcoConn />} label="Alcance del corte">
                  <span style={{ fontWeight: 500 }}>{ALCANCE_LABELS[inc.alcanceCorte] ?? inc.alcanceCorte ?? '—'}</span>
                  {inc.tuvoUps != null && (
                    <span style={{ marginLeft: '8px', fontSize: '10px', color: inc.tuvoUps ? 'var(--ok)' : 'var(--muted-foreground)' }}>
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
                  if (inc.estadoOperacion !== 'CONTINGENCIA') return <span style={{ color: 'var(--ok)', fontWeight: 500 }}>Sí</span>
                  const rend = inc.contRendimiento
                  const rendLabelMap: Record<string,{l:string;c:string}> = {
                    EFECTIVO:   { l: 'Efectivo 100%',        c: 'var(--ok)' },
                    TOTAL:      { l: 'Total 100%',           c: 'var(--ok)' },
                    PARCIAL:    { l: 'Parcial 75%',          c: 'var(--warn)' },
                    NULO:       { l: 'Nulo 0%',              c: 'var(--danger)' },
                    // legacy
                    EFECTIVA:   { l: 'Efectivo 100%',        c: 'var(--ok)' },
                    LIMITADA:   { l: 'Parcial',              c: 'var(--warn)' },
                    FALLIDA:    { l: 'Nulo 0%',              c: 'var(--danger)' },
                    NO_FUNCIONO:{ l: 'Nulo 0%',              c: 'var(--danger)' },
                    INOPERATIVA:{ l: 'Nulo 0%',              c: 'var(--danger)' },
                  }
                  const rendInfo = rend ? rendLabelMap[rend] : null
                  if (rendInfo?.c === 'var(--danger)') {
                    return <span style={{ color: 'var(--danger)', fontWeight: 500 }}>Activa — {rendInfo.l}</span>
                  }
                  return <span style={{ color: 'var(--ok)', fontWeight: 600 }}>Activa{rendInfo ? ` — ${rendInfo.l}` : ''}</span>
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
                  <TimeRow label="MTTR acumulado (prev.)" value={minToHM((inc as any).tiempoAcumuladoMin)} color="var(--warn)" />
                )}
                {(inc as any).motivoReabertura && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0 4px' }} />
                    <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Reabertura</div>
                    <TimeRow
                      label="Motivo"
                      value={(inc as any).motivoReabertura === 'TIENDA_SIN_INTERNET' ? 'Tienda sin internet (proveedor)' : 'Error de gestión de agente'}
                      color={(inc as any).motivoReabertura === 'TIENDA_SIN_INTERNET' ? 'var(--danger)' : 'var(--warn)'}
                    />
                    {(inc as any).justificacionReabertura && (
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '3px', lineHeight: 1.4, fontStyle: 'italic' }}>
                        "{(inc as any).justificacionReabertura}"
                      </div>
                    )}
                    {canEditA ? (
                      <div style={{ marginBottom: '5px' }}>
                        <div style={{ fontSize: '10px', color: 'var(--warn)', marginBottom: '3px' }}>Hora reapertura</div>
                        <input type="datetime-local" style={{ ...iStyle(), fontSize: '10px', padding: '4px 6px' }} value={editForm.horaRegistro} onChange={e => setEdit('horaRegistro', e.target.value)} />
                      </div>
                    ) : (
                      <TimeRow label="Hora reapertura" value={new Date(inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} color="var(--warn)" />
                    )}
                    {(inc as any).horaFinAnterior && (
                      <TimeRow label="Cierre anterior" value={new Date((inc as any).horaFinAnterior).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} color="var(--muted-foreground)" />
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
                  if (esc.noHuboRespuesta) respColor = 'var(--danger)'
                  else if (esc.horaEnvioCorreo && esc.estadoCronometro === 'VENCIDO' && !esc.horaRespuesta) respColor = 'var(--warn)'
                  return (
                    <div key={esc.id}>
                      <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '6px 0 4px', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>Nivel {esc.nivel}</div>
                      <TimeRow label={`Enviado N${esc.nivel}`} value={enviado} />
                      {esc.noHuboRespuesta ? (
                        <TimeRow label={`Respuesta N${esc.nivel}`} value="No hubo respuesta" color="var(--danger)" />
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
                    <TimeRow label="Escalado a Infra" value={new Date(inc.horaEscaladoInfra).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} color="var(--purple)" />
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
                    {/* En un incidente reabierto, la hora de inicio original la
                        escribe /reabrir y el PUT ya no la acepta: se muestra
                        pero no se edita. Editable era un control muerto —
                        además, moverla sin mover horaFinAnterior es lo que
                        dejaba el incidente en estado inconsistente. */}
                    {(inc as any).motivoReabertura && (
                      <>
                        <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>Hora inicio (original)</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '6px' }}>
                          {new Date((inc as any).horaRegistroOriginal ?? inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </>
                    )}
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>
                      {(inc as any).motivoReabertura ? 'Hora registro (período actual)' : 'Hora registro'}
                    </div>
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

              {/* Historial de contingencias — debajo de tiempos */}
              {(inc.contActivadoPor || inc.movActivadoPor || (Array.isArray(inc.mitigacionesPrevias) && inc.mitigacionesPrevias.length > 0)) && (() => {
                type CEntry = { tipo: string; inicio: string | null; fin: string | null; mins: number; activo: boolean; previo?: boolean }
                const entries: CEntry[] = []
                // Mitigaciones de periodos anteriores (archivadas al reabrir) — solo lectura
                const claseLabel: Record<string, string> = { ROUTER_PROPIO: 'Router propio', ROUTER_EXTERNO: 'Router ext.', DATOS_MOVILES: 'Datos móviles' }
                for (const p of (Array.isArray(inc.mitigacionesPrevias) ? inc.mitigacionesPrevias : [])) {
                  const mins = p.horaActivacion && p.horaDesactivacion
                    ? Math.round((new Date(p.horaDesactivacion).getTime() - new Date(p.horaActivacion).getTime()) / 60000)
                    : 0
                  const routerSuf = p.routerExternoCodigo ? ` · ${p.routerExternoCodigo}` : ''
                  entries.push({ tipo: `${claseLabel[p.clase] ?? p.clase}${routerSuf} (previo)`, inicio: p.horaActivacion ?? null, fin: p.horaDesactivacion ?? null, mins, activo: false, previo: true })
                }
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
                          <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontStyle: e.previo ? 'italic' : 'normal' }}>{e.tipo}</span>
                          <span style={{ fontSize: '10px', fontWeight: 600, color: e.previo ? 'var(--muted-foreground)' : (e.activo ? 'var(--warn)' : 'var(--ok)') }}>
                            {e.previo ? '↻ Reapertura' : (e.activo ? '⏱ Activo' : '✓ Fin')}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted-foreground)' }}>
                            {e.inicio ? toDatetimeLocal(e.inicio).slice(11,16) : '—'}
                            {' → '}
                            {e.fin ? toDatetimeLocal(e.fin).slice(11,16) : (e.activo ? 'ahora' : '—')}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 500, color: e.activo ? 'var(--warn)' : 'var(--foreground)' }}>
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
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--primary)', textDecoration: 'none', whiteSpace: 'nowrap', marginTop: '2px' }}>
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
        const MARGEN = DASHBOARD_CONFIG.MARGEN_BRUTO

        // Cálculo en curso (activo) usando Date.now() — lógica en calcIeiEnCurso arriba.
        void tick  // dependencia para re-render cada segundo
        const { ieiEnCurso, ventaHoraEnCurso, segmentosEnCurso } = (!esResuelto && inc.tiendaVentaHoraSoles)
          ? calcIeiEnCurso(inc, Date.now())
          : { ieiEnCurso: 0, ventaHoraEnCurso: 0, segmentosEnCurso: [] as SegmentoIeiEnCurso[] }

        const tieneIei = tramos.length > 0 || (esResuelto ? !!inc.ieiCalc : !!inc.tiendaVentaHoraSoles)
        if (!tieneIei) return null

        const fmtMs = (ms:number) => new Date(ms).toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit'})
        const fmtH  = (h:number)  => h < 1 ? `${Math.round(h*60)}m` : `${h.toFixed(1)}h`

        // IEI acumulado de periodos anteriores (reaperturas). En curso se suma al
        // periodo actual; al resolver el backend ya lo incluye en impactoEstimado.
        const ieiAcumPrev   = Number(inc.ieiCalc?.ieiAcumulado ?? 0)
        // Fase 4 (Paso 3 de frontend) — el total deja de venir del cálculo cliente
        // viejo (cont_*/mov_*/boleta_*) en cuanto el incidente ya tiene tramos:
        // usa SUM(ie_tramo) + el tramo abierto en vivo (ieiTotalTramos, arriba).
        // Sin tramos todavía (incidentes que no pasaron por el flujo nuevo) cae
        // al cálculo viejo, para no dejarlos en S/ 0.
        const displayIei    = tramos.length > 0 ? ieiTotalTramos : (esResuelto ? (inc.ieiCalc?.impactoEstimado ?? 0) : (ieiEnCurso + ieiAcumPrev))
        const displayVH     = esResuelto ? inc.ieiCalc?.ventaHora : ventaHoraEnCurso
        const displaySegs   = esResuelto ? (inc.ieiCalc?.segmentos ?? []) : segmentosEnCurso
        const displayMotivo = esResuelto ? inc.ieiCalc?.motivoFactor : null
        const faltaInfo     = esResuelto && inc.ieiCalc?.faltaInformacion

        return (
          <div style={{ background: 'var(--card)', borderRadius: '12px', border: `1px solid ${esResuelto ? 'var(--border)' : 'var(--warn-border)'}`, marginTop: '16px' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Impacto Económico Estimado (IEI)</div>
                {!esResuelto && (
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: 'var(--warn-bg)', color: 'var(--warn)', border: '1px solid var(--warn-border)' }}>
                    En curso ⏱
                  </span>
                )}
                {esResuelto && !faltaInfo && (
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: 'var(--ok-bg)', color: 'var(--ok)', border: '1px solid var(--ok-border)' }}>
                    Calculado
                  </span>
                )}
              </div>
              {!faltaInfo && (
                <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700, color: displayIei > 0 ? 'var(--danger)' : 'var(--ok)' }}>
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
                        { label: 'Acumulado',       value: `${Math.round((Date.now() - new Date(inc.horaRegistro).getTime()) / 60000)}m ${ieiAcumPrev > 0 ? 'desde reapertura' : 'desde inicio'}` },
                        ...(ieiAcumPrev > 0 ? [
                          { label: 'IEI previo',  value: `S/ ${ieiAcumPrev.toLocaleString('es-PE')}` },
                          { label: 'IEI actual',  value: `S/ ${ieiEnCurso.toLocaleString('es-PE')}` },
                        ] : []),
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
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
                        Detalle del cálculo (motor viejo)
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
                            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{fmtMs(seg.desdeMs)}</td>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{fmtMs(seg.hastaMs)}</td>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{fmtH(seg.horas)}</td>
                              <td style={{ padding: '6px 10px', color: 'var(--foreground)', textTransform: 'capitalize' }}>{seg.descripcion}</td>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{seg.factor.toFixed(2)}</td>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700, color: seg.ieiParcial > 0 ? 'var(--danger)' : 'var(--ok)' }}>
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
              { label: 'SLA Respuesta', value: inc.slaMetrics.slaRespuestaPct != null ? `${inc.slaMetrics.slaRespuestaPct}%` : '—', sub: inc.slaMetrics.tPrimeraRespuestaMin != null ? `${inc.slaMetrics.tPrimeraRespuestaMin} min` : 'Sin respuesta', score: inc.slaMetrics.slaRespuestaPct },
              { label: 'T. Primera Respuesta', value: inc.slaMetrics.tPrimeraRespuestaMin != null ? `${inc.slaMetrics.tPrimeraRespuestaMin} min` : '—', sub: `límite ${inc.slaMetrics.slaRespuestaObj} min`, score: null },
              { label: 'SLA Resolución', value: inc.slaMetrics.slaResolucionPct != null ? `${inc.slaMetrics.slaResolucionPct}%` : (inc.slaMetrics.slaRespuestaPct === 0 ? '0%' : '—'), sub: inc.slaMetrics.tResolucionMin != null ? `${inc.slaMetrics.tResolucionMin} min` : (inc.slaMetrics.slaRespuestaPct === 0 ? 'Sin respuesta' : 'En curso'), score: inc.slaMetrics.slaResolucionPct },
              { label: 'T. Resolución', value: inc.slaMetrics.tResolucionMin != null ? `${inc.slaMetrics.tResolucionMin} min` : '—', sub: `límite ${inc.slaMetrics.slaResolucionObj} min`, score: null },
            ].map(m => (
              <div key={m.label} style={{ background: 'var(--background)', borderRadius: '8px', padding: '10px 14px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>{m.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: m.score != null ? (m.score >= 80 ? 'var(--ok)' : m.score >= 60 ? 'var(--warn)' : 'var(--danger)') : 'var(--foreground)' }}>{m.value}</div>
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
                style={{ ...btn, background: 'var(--ok-bg)', color: 'var(--ok)' }}>
                Marcar como resuelto
              </button>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowNivelMenu(v => !v)}
                  style={{ ...btn, background: 'var(--gradient-primary)', color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  Escalar incidente <IcoArrow />
                </button>
                {showNivelMenu && (
                  <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: '6px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 50, minWidth: '160px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                    {[1,2,3,4].map(n => {
                      const nd = inc.nivelesProveedor?.find((x: any) => x.nivel === n)
                      if (esNivelInfra(nd)) return (
                        <div key={n} style={{ padding: '7px 10px', background: 'rgba(99,102,241,.07)', border: '1px dashed rgba(99,102,241,.4)', borderRadius: '6px', fontSize: '10px', color: '#818cf8', lineHeight: 1.35 }}>
                          <strong>N{n} es Infraestructura</strong><br />
                          No escalar como proveedor → usa 🔧 Infraestructura
                        </div>
                      )
                      return (
                        <button key={n} onClick={() => handleEscalarNivel(n)}
                          style={{ padding: '7px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', textAlign: 'left', color: 'var(--foreground)' }}>
                          Escalar N{n}
                        </button>
                      )
                    })}
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
              // +30 min desde el cierre → advertencia blanda, NUNCA bloqueo.
              // Decisión de negocio confirmada: se sugiere registrar un incidente
              // nuevo en vez de reabrir (ver showReopenWarning), pero el agente
              // puede igual reabrir si corresponde. La API de reabrir no repite
              // esta validación — el único freno es esta advertencia en pantalla.
              if (mins > 30) {
                setShowReopenWarning(true)
              } else {
                setShowReopenModal(true)
              }
            }}
              style={{ ...btn, background: 'rgba(133,79,11,0.15)', color: 'var(--warn)', border: '1px solid rgba(133,79,11,0.3)' }}>
              Reabrir incidente
            </button>
          )}
          {saveError && (
            <span style={{ fontSize: '12px', color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: '6px', padding: '4px 10px', maxWidth: '320px' }}>
              {saveError}
            </span>
          )}
          {contNotice && (
            <div style={{ fontSize: '12px', color: 'var(--warn)', background: 'var(--warn-bg)', border: '1.5px solid var(--warn-border)', borderRadius: '8px', padding: '8px 12px', maxWidth: '380px', lineHeight: 1.5, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠</span>
              <span>
                <strong>Incidente cerrado.</strong> La tienda permanece en <strong>contingencia activa</strong> porque el router temporal sigue instalado.
                Desactívala desde la ficha de la tienda cuando el proveedor restituya el servicio definitivo.
              </span>
              <button onClick={() => setContNotice(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warn)', fontSize: '16px', flexShrink: 0, padding: 0, lineHeight: 1 }}>×</button>
            </div>
          )}
          {(canEditB || canEditA) && (
            <button onClick={handleSave} disabled={saving}
              style={{ ...btn, background: 'var(--gradient-primary)', color: 'white', border: '1px solid var(--primary)' }}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
