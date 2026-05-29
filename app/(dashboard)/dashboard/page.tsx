'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import DashboardAnalitico from './components/DashboardAnalitico'
import { SLA_RESOLUCION_DEFAULT_MIN } from '@/lib/sla-core'

// ─── Constants ────────────────────────────────────────────────────────────────
const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros', CORTE_ELECTRICO: '⚡ Corte eléctrico',
}
const PROVS = ['Todos', 'BITEL', 'CLARO', 'ENTEL', 'CONVERGIA', 'MOVISTAR', 'WIN', 'OTROS']

const BADGE_OP: Record<string, { label: string; bg: string; color: string }> = {
  SLA_VENCIDO:         { label: 'SLA Vencido',    bg: '#FCEBEB', color: '#A32D2D' },
  EN_RIESGO_SLA:       { label: 'En riesgo SLA',  bg: '#FFF3E0', color: '#C84B00' },
  ESCALADO:            { label: 'Escalado',        bg: '#FAEEDA', color: '#633806' },
  PENDIENTE_PROVEEDOR: { label: 'Pend. proveedor', bg: '#EEE8FF', color: '#5B21B6' },
  ABIERTO:             { label: 'Abierto',         bg: '#E6F1FB', color: '#185FA5' },
}
const ORDEN_OP: Record<string, number> = {
  SLA_VENCIDO: 0, EN_RIESGO_SLA: 1, ESCALADO: 2, PENDIENTE_PROVEEDOR: 3, ABIERTO: 4,
}
const IMP_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  ALTO:  { label: 'Alto',  bg: '#FCEBEB', color: '#A32D2D' },
  MEDIO: { label: 'Medio', bg: '#FFF3E0', color: '#C84B00' },
  BAJO:  { label: 'Bajo',  bg: '#E6F1FB', color: '#185FA5' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tsMs(d: string | Date | null): number {
  if (!d) return 0
  const raw = typeof d === 'string' && !d.includes('Z') && !d.includes('+') ? d + 'Z' : d
  return new Date(raw).getTime()
}
function fmtMin(min: number): string {
  if (min < 0) return '0m'
  const h = Math.floor(min / 60); const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function fmtHora(d: string | Date | null): string {
  if (!d) return '—'
  const raw = typeof d === 'string' && !d.includes('Z') && !d.includes('+') ? d + 'Z' : d
  return new Date(raw).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
}
function fmtFechaHora(d: string | Date | null): string {
  if (!d) return '—'
  const raw = typeof d === 'string' && !d.includes('Z') && !d.includes('+') ? d + 'Z' : d
  const date = new Date(raw)
  const fecha = date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' })
  const hora  = date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
  return `${fecha} ${hora}`
}
function fmtHoraEvento(d: string | Date | null): { text: string; isOld: boolean } {
  if (!d) return { text: '—', isOld: false }
  const raw = typeof d === 'string' && !d.includes('Z') && !d.includes('+') ? d + 'Z' : d
  const date = new Date(raw)
  const hoyLima    = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)
  const eventoLima = new Date(date.getTime() - 5 * 3600000).toISOString().slice(0, 10)
  const isOld = eventoLima !== hoyLima
  const tStr = date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
  if (isOld) {
    const dStr = date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', timeZone: 'America/Lima' })
    return { text: `${dStr} ${tStr}`, isOld: true }
  }
  return { text: tStr, isOld: false }
}
function downloadCSV(activos: any[], resoluciones: any[], fecha?: string) {
  const BOM = '﻿'
  const headers = ['Código','Tienda','Distrito','Cluster','Proveedor','Tipo','Impacto','Estado','Agente','Hora Registro','Hora Fin','MTTR (min)','Resuelto Por']
  const toRow = (r: any, estado: string) => [
    r.codigo ?? '', r.tienda_nombre ?? r.tienda_codigo ?? '', r.tienda_distrito ?? '',
    r.tienda_cluster ?? '', r.proveedor_nombre ?? '', TIPO_LABELS[r.tipo] ?? r.tipo ?? '',
    r.nivel_impacto ?? '', estado, r.agente_nombre ?? '',
    fmtFechaHora(r.hora_registro), fmtFechaHora(r.hora_fin ?? null),
    r.mttr_minutos ?? '', r.resuelto_por ?? '',
  ]
  const rows = [
    ...resoluciones.map((r: any) => toRow(r, 'RESUELTO')),
    ...activos.map((i: any) => toRow(i, i.estado)),
  ]
  const csv = BOM + [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `incidentes_${fecha ?? new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
function fmtEspera(min: number): string {
  if (min < 60) return `${min}m esperando`
  const h = Math.floor(min / 60); const m = min % 60
  if (min < 120) return `${h}h ${m}m esperando`
  return `${h}h ${m}m ⚠`
}
function initials(nombre: string): string {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
function getEstadoOpClient(inc: any, nowMs: number) {
  const minutos  = (nowMs - tsMs(inc.hora_registro)) / 60000
  const slaLimite = SLA_RESOLUCION_DEFAULT_MIN
  const pct = minutos / slaLimite
  let estadoOp: string
  if (pct >= 1.0) estadoOp = 'SLA_VENCIDO'
  else if (pct >= 0.7) estadoOp = 'EN_RIESGO_SLA'
  else if (inc.pendiente_proveedor) estadoOp = 'PENDIENTE_PROVEEDOR'
  else if ((inc.estado ?? '').startsWith('ESCALADO')) estadoOp = 'ESCALADO'
  else estadoOp = 'ABIERTO'
  return { estadoOp, pctSla: Math.round(pct * 100), minutosTranscurridos: Math.round(minutos), slaLimite }
}
function buildAlertas(activos: any[], equipo: any[], provsPend: any[], nowMs: number) {
  const alertas: { tipo: string; texto: string; accion: string; filterKey?: string; provFilter?: string }[] = []
  const venc  = activos.filter(i => getEstadoOpClient(i, nowMs).estadoOp === 'SLA_VENCIDO')
  const riesg = activos.filter(i => getEstadoOpClient(i, nowMs).estadoOp === 'EN_RIESGO_SLA')
  if (venc.length > 0)  alertas.push({ tipo: 'vencido',  texto: `${venc.length} incidente${venc.length > 1 ? 's' : ''} con SLA vencido`,    accion: 'Ver casos',    filterKey: 'enRiesgo' })
  if (riesg.length > 0) alertas.push({ tipo: 'riesgo',   texto: `${riesg.length} incidente${riesg.length > 1 ? 's' : ''} en riesgo SLA`,     accion: 'Ver casos',    filterKey: 'enRiesgo' })
  for (const p of provsPend) {
    alertas.push({ tipo: 'pendiente', texto: `${p.count} pendiente${p.count > 1 ? 's' : ''} proveedor ${p.nombre}`, accion: 'Ver pendientes', filterKey: 'pendientes', provFilter: p.nombre })
    if (p.masAntiguoMin >= 240) alertas.push({ tipo: 'sin_resp', texto: `Sin respuesta de ${p.nombre} hace ${fmtMin(p.masAntiguoMin)}`, accion: 'Revisar' })
  }
  for (const ag of equipo) {
    if (ag.casosActivos > 3) alertas.push({ tipo: 'sobrecarga', texto: `${ag.nombre} tiene ${ag.casosActivos} casos activos`, accion: 'Reasignar' })
  }
  return alertas
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SLABadge({ inc, nowMs }: { inc: any; nowMs: number }) {
  const { estadoOp, pctSla, minutosTranscurridos, slaLimite } = getEstadoOpClient(inc, nowMs)
  const [show, setShow] = useState(false)
  const badge = BADGE_OP[estadoOp] ?? BADGE_OP.ABIERTO
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '4px', background: badge.bg, color: badge.color, cursor: 'help', whiteSpace: 'nowrap', textDecoration: 'underline dotted' }}>
        {badge.label}
      </span>
      {show && (
        <div style={{ position: 'absolute', zIndex: 99, bottom: '120%', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: 'white', borderRadius: '8px', padding: '8px 12px', fontSize: '11px', lineHeight: 1.7, minWidth: '200px', whiteSpace: 'normal', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', pointerEvents: 'none' }}>
          <div>Tiempo abierto: <strong>{fmtMin(minutosTranscurridos)}</strong></div>
          <div>SLA permitido: <strong>{fmtMin(slaLimite)}</strong></div>
          <div>Consumido: <strong style={{ color: pctSla >= 100 ? '#FCA5A5' : pctSla >= 70 ? '#FCD34D' : '#86EFAC' }}>{pctSla}%</strong></div>
          <div>Estado: <strong>{badge.label}</strong></div>
          <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '4px solid #1e293b' }} />
        </div>
      )}
    </div>
  )
}

function AvatarCircle({ nombre, color }: { nombre: string; color: string }) {
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
      {initials(nombre)}
    </div>
  )
}

const AVATAR_COLORS = ['#185FA5','#5B21B6','#A32D2D','#2D7A4A','#854F0B','#0C447C']

// ─── Modal ────────────────────────────────────────────────────────────────────

function AsignarModal({ activos, equipo, onClose, onRefresh }: { activos: any[]; equipo: any[]; onClose: () => void; onRefresh: () => void }) {
  const [incId, setIncId]     = useState('')
  const [agenteId, setAgenteId] = useState('')
  const [ok, setOk]           = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  async function confirmar() {
    if (!incId || !agenteId) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/incidentes/${incId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registradoPorId: agenteId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? 'Error al reasignar el incidente')
        setSaving(false)
        return
      }
      setOk(true)
      setTimeout(() => { onClose(); onRefresh() }, 1500)
    } catch {
      setError('Error de red. Intenta de nuevo.')
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '24px', width: '380px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Asignar / Reasignar incidente</div>
        {ok ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#27500A', fontWeight: 600 }}>✓ Reasignación confirmada</div>
        ) : (
          <>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px' }}>Incidente</label>
              <select value={incId} onChange={e => setIncId(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)' }}>
                <option value=''>— Seleccionar —</option>
                {activos.map((i: any) => (
                  <option key={i.id} value={i.id}>{i.codigo} — {i.tienda_nombre ?? i.tienda_codigo}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px' }}>Agente destino</label>
              <select value={agenteId} onChange={e => setAgenteId(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)' }}>
                <option value=''>— Seleccionar —</option>
                {equipo.map((ag: any) => (
                  <option key={ag.id} value={ag.id}>{ag.nombre} ({ag.casosActivos} activos)</option>
                ))}
              </select>
            </div>
            {error && (
              <div style={{ fontSize: '11px', color: '#b91c1c', background: '#fee2e2', borderRadius: '6px', padding: '7px 10px', marginBottom: '12px' }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} disabled={saving} style={{ padding: '7px 16px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', cursor: saving ? 'default' : 'pointer' }}>Cancelar</button>
              <button onClick={confirmar} disabled={saving || !incId || !agenteId} style={{ padding: '7px 16px', fontSize: '12px', border: 'none', borderRadius: '7px', background: saving ? '#93c5fd' : 'hsl(221,83%,23%)', color: 'white', cursor: saving || !incId || !agenteId ? 'default' : 'pointer', fontWeight: 600, opacity: !incId || !agenteId ? 0.5 : 1 }}>
                {saving ? 'Guardando…' : 'Confirmar asignación'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

function todayLima(): string {
  return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)
}

export default function DashboardPage() {
  const router = useRouter()
  const [op, setOp]                       = useState<any>(null)
  const [tick, setTick]                   = useState(0)
  const [decPendientes, setDecPendientes] = useState<number | null>(null)
  const [tab, setTab]   = useState<'operativo' | 'analitico'>('operativo')
  const [fecha, setFecha] = useState<string>(todayLima())
  const isToday = fecha === todayLima()

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const t = p.get('tab')
    if (t === 'analitico' || t === 'operativo') setTab(t)
  }, [])

  const fetchOp = useCallback(async () => {
    const url = isToday ? '/api/dashboard/operativo' : `/api/dashboard/operativo?fecha=${fecha}`
    const res = await fetch(url)
    if (res.ok) setOp(await res.json())
  }, [fecha, isToday])

  const fetchDecPendientes = useCallback(async () => {
    const res = await fetch('/api/decisiones?estado=PROPUESTO')
    if (res.ok) {
      const data = await res.json()
      setDecPendientes(Array.isArray(data) ? data.length : null)
    }
  }, [])

  useEffect(() => { setOp(null); fetchOp(); fetchDecPendientes() }, [fetchOp, fetchDecPendientes])
  useEffect(() => {
    if (!isToday) return
    const id = setInterval(() => { setTick(t => t + 1); fetchOp() }, 30000)
    return () => clearInterval(id)
  }, [fetchOp, isToday])
  useEffect(() => {
    if (!isToday) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [isToday])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
            {tab === 'operativo' ? 'Dashboard operativo' : 'Dashboard analítico'}
          </h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {tab === 'operativo'
              ? isToday
                ? <><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />Actualización en tiempo real</>
                : <span style={{ color: '#C84B00', fontWeight: 600 }}>Vista histórica — {fecha}</span>
              : 'Vista analítica'
            }
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {tab === 'operativo' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="date"
                value={fecha}
                max={todayLima()}
                onChange={e => setFecha(e.target.value || todayLima())}
                style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--foreground)' }}
              />
              {!isToday && (
                <button onClick={() => setFecha(todayLima())}
                  style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600, background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Volver a hoy
                </button>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--muted)', borderRadius: '10px', padding: '4px' }}>
            {(['operativo', 'analitico'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); router.replace(`?tab=${t}`, { scroll: false }) }}
                style={{ padding: '7px 18px', fontSize: '13px', border: 'none', borderRadius: '7px', cursor: 'pointer', background: tab === t ? 'hsl(221,83%,23%)' : 'transparent', color: tab === t ? 'white' : 'var(--foreground)', fontWeight: tab === t ? 600 : 400 }}>
                {t === 'operativo' ? 'Operativo' : 'Analítico'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'operativo' && (
        op
          ? <OperativoView op={op} tick={tick} router={router} decPendientes={decPendientes} onRefresh={fetchOp} isToday={isToday} fecha={fecha} />
          : <div style={{ padding: '60px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando...</div>
      )}
      {tab === 'analitico' && <DashboardAnalitico />}
    </div>
  )
}

// ─── OperativoView ────────────────────────────────────────────────────────────

function OperativoView({ op, tick, router, decPendientes, onRefresh, isToday, fecha }: { op: any; tick: number; router: any; decPendientes: number | null; onRefresh: () => void; isToday: boolean; fecha: string }) {
  const { activos, resoluciones, contingenciasActivas, equipoStats, proveedoresPendientes, actividadReciente, kpis } = op
  const [provFiltro,      setProvFiltro]      = useState('Todos')
  const [cardFiltro,      setCardFiltro]      = useState<string | null>(null)
  const [asignarOpen,     setAsignarOpen]     = useState(false)
  const [tabActividad,    setTabActividad]    = useState<'todos'|'escalados'|'resueltos'|'respuestas'>('todos')
  const [turnoInicio,     setTurnoInicio]     = useState('08:00')
  const [filtroHeredados, setFiltroHeredados] = useState(false)
  const [confirmarCont,   setConfirmarCont]   = useState<string | null>(null)
  const [desactivandoCont, setDesactivandoCont] = useState<string | null>(null)
  const [agenteFilter,    setAgenteFilter]    = useState<string | null>(null)

  async function desactivarContingencia(incidenteId: string, tiendaId: string) {
    setDesactivandoCont(tiendaId)
    try {
      const res = await fetch(`/api/incidentes/${incidenteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contActivadoPor: null }),
      })
      if (res.ok) { setConfirmarCont(null); onRefresh() }
    } finally {
      setDesactivandoCont(null)
    }
  }

  const nowMs = Date.now()

  // MTTR promedio hoy (de resoluciones)
  const mttrProm = useMemo(() => {
    const vals = (resoluciones ?? []).filter((r: any) => r.mttr_minutos != null).map((r: any) => r.mttr_minutos as number)
    return vals.length ? Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length) : null
  }, [resoluciones])

  const totalActivos = (activos ?? []).length

  // Computed alerts
  const alertas = useMemo(() => {
    const now = Date.now()
    return buildAlertas(activos ?? [], equipoStats ?? [], proveedoresPendientes ?? [], now)
  }, [activos, equipoStats, proveedoresPendientes, tick])

  // Filtered + sorted queue
  const colaFiltrada = useMemo(() => {
    const now = Date.now()
    let lista = (activos ?? []).map((inc: any) => ({ ...inc, ...getEstadoOpClient(inc, now) }))

    if (provFiltro !== 'Todos') lista = lista.filter((i: any) => i.proveedor_nombre === provFiltro)

    if (cardFiltro === 'enRiesgo')    lista = lista.filter((i: any) => ['EN_RIESGO_SLA','SLA_VENCIDO'].includes(i.estadoOp))
    else if (cardFiltro === 'escalados')  lista = lista.filter((i: any) => i.estado.startsWith('ESCALADO'))
    else if (cardFiltro === 'pendientes') lista = lista.filter((i: any) => i.pendiente_proveedor)

    if (agenteFilter) lista = lista.filter((i: any) => i.agente_id === agenteFilter)

    if (filtroHeredados) {
      const hoyLima = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)
      const [hh, mm] = turnoInicio.split(':').map(Number)
      const turnoMs = Date.UTC(parseInt(hoyLima.slice(0,4)), parseInt(hoyLima.slice(5,7))-1, parseInt(hoyLima.slice(8,10)), hh + 5, mm)
      lista = lista.filter((i: any) => tsMs(i.hora_registro) < turnoMs)
    }

    lista.sort((a: any, b: any) => {
      const d = (ORDEN_OP[a.estadoOp] ?? 4) - (ORDEN_OP[b.estadoOp] ?? 4)
      return d !== 0 ? d : b.minutosTranscurridos - a.minutosTranscurridos
    })
    return lista
  }, [activos, provFiltro, cardFiltro, agenteFilter, filtroHeredados, turnoInicio, tick])

  // Inherited incidents from previous shift
  const incidentesHeredados = useMemo(() => {
    const hoyLima = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)
    const [hh, mm] = turnoInicio.split(':').map(Number)
    const turnoMs = Date.UTC(parseInt(hoyLima.slice(0,4)), parseInt(hoyLima.slice(5,7))-1, parseInt(hoyLima.slice(8,10)), hh + 5, mm)
    return (activos ?? []).filter((inc: any) => tsMs(inc.hora_registro) < turnoMs)
  }, [activos, turnoInicio])

  function handleCardClick(key: string) {
    setCardFiltro(prev => prev === key ? null : key)
  }

  // KPI card definitions
  const kpiCards: Array<{ icon: string; label: string; value: any; sub?: string; filterKey: string | null; colorIcon: string; bg: string; link?: string }> = [
    { icon: '📋', label: 'Incidentes abiertos',  value: kpis.abiertos,            sub: undefined,                                filterKey: 'abiertos',  colorIcon: '#185FA5', bg: '#E6F1FB' },
    { icon: '⚠',  label: 'En riesgo SLA',         value: kpis.enRiesgoSla,          sub: kpis.vencidoSla > 0 ? `${kpis.vencidoSla} vencidos` : undefined, filterKey: 'enRiesgo',  colorIcon: '#C84B00', bg: '#FFF3E0' },
    { icon: '↑',  label: 'Escalados',              value: kpis.escalados,            sub: undefined,                                filterKey: 'escalados', colorIcon: '#A32D2D', bg: '#FCEBEB' },
    { icon: '🏢', label: 'Pendientes proveedor',   value: kpis.pendientesProveedor,  sub: undefined,                                filterKey: 'pendientes', colorIcon: '#5B21B6', bg: '#EEE8FF' },
    { icon: '✓',  label: 'Resueltos hoy',          value: kpis.resueltoHoy,          sub: `Agente ${kpis.resueltoHoyAgente} · Proveedor ${kpis.resueltoHoyProveedor}`, filterKey: null, colorIcon: '#27500A', bg: '#EAF3DE' },
    { icon: '👤', label: 'Agentes en gestión',     value: `${kpis.agentesEnGestion}/${kpis.totalAgentes}`, sub: undefined, filterKey: null, colorIcon: '#185FA5', bg: '#E6F1FB' },
    ...(decPendientes != null ? [{ icon: '📊', label: 'Decisiones propuestas', value: decPendientes, sub: 'Esperan aprobación', filterKey: null, colorIcon: '#7C3AED', bg: '#EDE9FE', link: '/decisiones' }] : []),
  ]

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        {!isToday ? (
          <div style={{ padding: '4px 12px', background: '#FFF3E0', border: '1px solid #FDBA74', borderRadius: '7px', fontSize: '11px', color: '#C84B00', fontWeight: 600 }}>
            ⏪ Vista histórica — {fecha} · Solo lectura
          </div>
        ) : <div />}
        <button onClick={() => downloadCSV(activos ?? [], resoluciones ?? [], fecha)}
          style={{ padding: '4px 12px', fontSize: '11px', fontWeight: 600, background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '7px', cursor: 'pointer', color: 'var(--foreground)' }}>
          ⬇ CSV
        </button>
      </div>

      {/* KPI Cards row — compact */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '6px', marginBottom: '10px' }}>
        {kpiCards.map((card) => (
          <div key={card.label}
            onClick={() => { if (card.link) router.push(card.link); else if (card.filterKey) handleCardClick(card.filterKey) }}
            style={{ background: 'var(--card)', border: `0.5px solid ${cardFiltro === card.filterKey && card.filterKey ? '#185FA5' : 'var(--border)'}`, borderRadius: '10px', padding: '9px 11px', cursor: card.filterKey || card.link ? 'pointer' : 'default', boxShadow: cardFiltro === card.filterKey && card.filterKey ? '0 0 0 2px rgba(24,95,165,0.15)' : 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: 24, height: 24, borderRadius: '5px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0 }}>
                {card.icon}
              </div>
              <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', lineHeight: 1.2 }}>{card.label}</div>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: card.colorIcon, lineHeight: 1 }}>{card.value}</div>
            {card.sub && <div style={{ fontSize: '9px', color: 'var(--muted-foreground)' }}>{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* Contingencias — tira horizontal */}
      {(contingenciasActivas ?? []).length > 0 && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: '10px', padding: '7px 10px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
            <span>⚠</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {(contingenciasActivas ?? []).length} tienda{(contingenciasActivas ?? []).length > 1 ? 's' : ''} en contingencia activa
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
            {(contingenciasActivas ?? []).map((c: any) => {
              const confirmando  = confirmarCont === c.tienda_id
              const desactivando = desactivandoCont === c.tienda_id
              const esExterno    = !!c.cont_es_externo
              const mins = c.cont_hora_activacion
                ? Math.round((nowMs - new Date(c.cont_hora_activacion).getTime()) / 60000)
                : null
              const durStr = mins != null
                ? (mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`)
                : null
              const borderColor = esExterno ? '#ea580c' : '#f59e0b'
              const bgColor     = esExterno ? '#fff7ed' : 'white'
              const textColor   = esExterno ? '#7c2d12' : '#78350f'
              return (
                <div key={c.tienda_id} style={{ flex: '0 0 auto', background: bgColor, border: `1.5px solid ${borderColor}`, borderRadius: '7px', padding: '5px 10px', minWidth: '170px', maxWidth: '240px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                      {esExterno && <span style={{ marginRight: '4px' }}>📦</span>}
                      {c.tienda_codigo} — {c.tienda_nombre}
                    </div>
                    {durStr && (
                      <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 700, color: borderColor, flexShrink: 0, marginLeft: '6px' }}>{durStr}</span>
                    )}
                  </div>
                  <div style={{ fontSize: '9px', color: textColor, display: 'flex', gap: '5px', marginTop: '2px', opacity: 0.8 }}>
                    {c.tienda_distrito && <span>{c.tienda_distrito}</span>}
                    {c.proveedor_nombre && <span>· {c.proveedor_nombre}</span>}
                    {esExterno && <span style={{ fontWeight: 700 }}>· EXTERNO</span>}
                  </div>
                  <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {c.incidente_codigo ? <span onClick={() => router.push(`/incidentes/${c.incidente_id}`)} style={{ fontSize: '9px', color: textColor, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'monospace' }}>{c.incidente_codigo}</span> : <span />}
                    {confirmando ? (
                      <div style={{ display: 'flex', gap: '3px', fontSize: '9px', alignItems: 'center' }}>
                        <span style={{ color: textColor }}>¿Confirmar?</span>
                        <button disabled={desactivando} onClick={() => c.incidente_id ? desactivarContingencia(c.incidente_id, c.tienda_id) : undefined} style={{ padding: '1px 5px', fontSize: '9px', fontWeight: 700, background: '#b45309', color: 'white', border: 'none', borderRadius: '3px', cursor: desactivando ? 'default' : 'pointer', opacity: desactivando ? 0.6 : 1 }}>{desactivando ? '…' : 'Sí'}</button>
                        <button disabled={desactivando} onClick={() => setConfirmarCont(null)} style={{ padding: '1px 5px', fontSize: '9px', background: '#fef3c7', color: '#78350f', border: '1px solid #fcd34d', borderRadius: '3px', cursor: 'pointer' }}>No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmarCont(c.tienda_id)} style={{ padding: '1px 7px', fontSize: '9px', fontWeight: 600, background: esExterno ? '#fed7aa' : '#fef3c7', color: textColor, border: `1px solid ${borderColor}`, borderRadius: '3px', cursor: 'pointer' }}>Desactivar</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main grid: LEFT (cola + equipo) | RIGHT (sidebar) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '12px', alignItems: 'start' }}>

        {/* ── LEFT ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* Cola operativa */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
            {incidentesHeredados.length > 0 && (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '7px', padding: '5px 10px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                <span>📋 <strong>{incidentesHeredados.length}</strong> heredado(s) del turno anterior</span>
                <input type="time" value={turnoInicio} onChange={e => setTurnoInicio(e.target.value)} style={{ fontSize: '11px', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '1px 5px' }} />
              </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>
                Cola operativa
                <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: '6px' }}>{colaFiltrada.length} de {totalActivos}</span>
                {agenteFilter && (() => { const ag = (equipoStats ?? []).find((a: any) => a.id === agenteFilter); return ag ? <span style={{ fontSize: '10px', fontWeight: 500, marginLeft: '8px', padding: '1px 7px', borderRadius: '999px', background: '#E6F1FB', color: '#185FA5' }}>· {ag.nombre.split(' ')[0]}</span> : null })()}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {(cardFiltro || filtroHeredados || agenteFilter) && (
                  <button onClick={() => { setCardFiltro(null); setFiltroHeredados(false); setAgenteFilter(null) }}
                    style={{ fontSize: '10px', background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', textDecoration: 'underline' }}>Limpiar filtros</button>
                )}
              </div>
            </div>

            {/* Estado op. filter chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
              {([
                { key: null,            label: 'Todos',         bg: 'var(--muted)',  fg: 'var(--foreground)', border: 'var(--border)' },
                { key: 'enRiesgo',      label: 'SLA Vencido / En Riesgo', bg: '#FFF3E0', fg: '#C84B00', border: '#FDBA74' },
                { key: 'escalados',     label: 'Escalado',       bg: '#FAEEDA',  fg: '#633806', border: '#F59E0B' },
                { key: 'pendientes',    label: 'Pend. proveedor',bg: '#EEE8FF',  fg: '#5B21B6', border: '#C4B5FD' },
              ] as const).map(({ key, label, bg, fg, border }) => {
                const active = cardFiltro === key
                return (
                  <button key={key ?? 'todos'} onClick={() => setCardFiltro(key)}
                    style={{ padding: '3px 10px', fontSize: '10px', fontWeight: active ? 600 : 400, background: active ? bg : 'var(--muted)', color: active ? fg : 'var(--foreground)', border: active ? `1px solid ${border}` : 'none', borderRadius: '999px', cursor: 'pointer' }}>
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Provider filter chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
              {PROVS.map(p => (
                <button key={p} onClick={() => setProvFiltro(p)}
                  style={{ padding: '2px 9px', fontSize: '10px', fontWeight: provFiltro === p ? 600 : 400, background: provFiltro === p ? 'hsl(221,83%,23%)' : 'var(--muted)', color: provFiltro === p ? 'white' : 'var(--foreground)', border: 'none', borderRadius: '999px', cursor: 'pointer' }}>
                  {p}
                </button>
              ))}
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto', maxHeight: '460px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                    {['ID','Tienda','Proveedor','Tipo','Impacto','Estado op.','Agente','Tiempo','Acción'].map(h => (
                      <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colaFiltrada.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>📥</div>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>Sin incidentes activos</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '4px' }}>Cuando haya incidentes, aparecerán aquí.</div>
                      </td>
                    </tr>
                  )}
                  {colaFiltrada.map((inc: any, idx: number) => {
                    const imp  = IMP_BADGE[inc.nivel_impacto] ?? IMP_BADGE.BAJO
                    const nowM = Date.now()
                    const { minutosTranscurridos } = getEstadoOpClient(inc, nowM)
                    const isCritical = inc.estadoOp === 'SLA_VENCIDO'
                    return (
                      <tr key={inc.id} style={{
                        borderTop: idx > 0 ? '0.5px solid var(--border)' : 'none',
                        borderLeft: inc.estadoOp === 'SLA_VENCIDO' ? '3px solid #DC2626' : inc.estadoOp === 'EN_RIESGO_SLA' ? '3px solid #F59E0B' : inc.estadoOp === 'ESCALADO' ? '3px solid #B45309' : inc.estadoOp === 'PENDIENTE_PROVEEDOR' ? '3px solid #7C3AED' : '3px solid transparent',
                        backgroundColor: inc.estadoOp === 'SLA_VENCIDO' ? '#FEF2F2' : inc.estadoOp === 'EN_RIESGO_SLA' ? '#FFFBEB' : 'transparent',
                      }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{inc.codigo}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600, fontSize: '11px' }}>{inc.tienda_codigo}</div>
                          <div style={{ fontSize: '9px', color: 'var(--muted-foreground)' }}>{inc.tienda_nombre}</div>
                          {inc.tienda_distrito && <div style={{ fontSize: '9px', color: 'var(--muted-foreground)' }}>{inc.tienda_distrito}</div>}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          {inc.proveedor_nombre
                            ? <span style={{ padding: '1px 7px', borderRadius: '999px', background: '#E6F1FB', color: '#185FA5', fontSize: '10px', fontWeight: 500, whiteSpace: 'nowrap' }}>{inc.proveedor_nombre}</span>
                            : <span style={{ color: '#888', fontSize: '9px' }}>—</span>}
                        </td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', fontSize: '10px' }}>{TIPO_LABELS[inc.tipo] ?? inc.tipo}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '4px', background: imp.bg, color: imp.color }}>{imp.label}</span>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <SLABadge inc={inc} nowMs={nowM} />
                          {inc.sinMovimiento && <span style={{ display: 'block', marginTop: '2px', fontSize: '9px', padding: '1px 4px', borderRadius: '999px', background: '#F1F5F9', color: '#475569' }}>⏸ {fmtMin(inc.sinMovimientoMin)}</span>}
                        </td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', fontSize: '10px' }}>{inc.agente_nombre ?? '—'}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', color: minutosTranscurridos >= 240 ? '#A32D2D' : minutosTranscurridos >= 120 ? '#C84B00' : 'var(--foreground)' }}>
                          {fmtMin(minutosTranscurridos)}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => router.push(`/incidentes/${inc.id}`)}
                              style={{ padding: '3px 8px', fontSize: '10px', background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
                              Ver →
                            </button>
                            {isCritical && isToday && (
                              <button onClick={() => router.push(`/incidentes/${inc.id}#escalamiento`)}
                                style={{ padding: '3px 8px', fontSize: '10px', background: '#FCEBEB', color: '#A32D2D', border: '1px solid #FECACA', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                ↑ Escalar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Equipo — cards clicables */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>
                Equipo
                {agenteFilter && <span style={{ fontSize: '10px', fontWeight: 400, color: '#185FA5', marginLeft: '8px', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setAgenteFilter(null)}>Quitar filtro agente</span>}
              </div>
              {isToday && (
                <button onClick={() => setAsignarOpen(true)}
                  style={{ padding: '4px 12px', fontSize: '11px', background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                  + Asignar
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {(equipoStats ?? []).map((ag: any, idx: number) => {
                const carga = ag.casosActivos === 0 ? 'libre' : ag.casosActivos <= 2 ? 'normal' : ag.casosActivos <= 4 ? 'cargado' : 'saturado'
                const cargaBadge = {
                  libre:    { label: 'Libre',    bg: '#F3F4F6', color: '#6B7280' },
                  normal:   { label: 'Normal',   bg: '#EAF3DE', color: '#27500A' },
                  cargado:  { label: 'Cargado',  bg: '#FFF3E0', color: '#C84B00' },
                  saturado: { label: 'Saturado', bg: '#FCEBEB', color: '#A32D2D' },
                }[carga]
                const borderColor = carga === 'saturado' ? '#FECACA' : carga === 'cargado' ? '#FED7AA' : 'var(--border)'
                const isSelectedAgent = agenteFilter === ag.id
                return (
                  <div key={ag.id}
                    onClick={() => setAgenteFilter(isSelectedAgent ? null : ag.id)}
                    style={{ flex: '1 1 160px', padding: '10px 12px', background: isSelectedAgent ? '#EFF6FF' : 'var(--muted)', borderRadius: '10px', border: `1px solid ${isSelectedAgent ? '#185FA5' : borderColor}`, cursor: 'pointer', boxShadow: isSelectedAgent ? '0 0 0 2px rgba(24,95,165,0.15)' : 'none', transition: 'all 0.15s' }}>
                    {/* Avatar + nombre + rol */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: AVATAR_COLORS[idx % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                        {initials(ag.nombre)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ag.nombre.split(' ').slice(0,2).join(' ')}</div>
                        <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginTop: '1px' }}>{ag.rol}</div>
                      </div>
                    </div>
                    {/* Stats row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
                      {([
                        { label: 'ACT.', value: ag.casosActivos, color: ag.casosActivos > 4 ? '#A32D2D' : ag.casosActivos > 2 ? '#C84B00' : 'var(--foreground)' },
                        { label: 'RES.', value: ag.resueltoHoyAgente + ag.resueltoHoyProveedor, color: '#27500A' },
                        { label: 'ESC.', value: ag.escalados, color: ag.escalados > 0 ? '#C84B00' : 'var(--muted-foreground)' },
                      ]).map(({ label, value, color }, i) => (
                        <div key={label} style={{ flex: 1, textAlign: 'center', borderRight: i < 2 ? '0.5px solid var(--border)' : 'none', paddingRight: i < 2 ? '0' : undefined }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                          <div style={{ fontSize: '8px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{label}</div>
                        </div>
                      ))}
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: '999px', background: cargaBadge.bg, color: cargaBadge.color }}>{cargaBadge.label}</span>
                        <div style={{ fontSize: '8px', color: 'var(--muted-foreground)', marginTop: '2px' }}>CARGA</div>
                      </div>
                    </div>
                    {/* MTTR si tiene resueltos */}
                    {ag.mttrPromedioAgente != null && (
                      <div style={{ marginTop: '6px', paddingTop: '5px', borderTop: '0.5px solid var(--border)', fontSize: '9px', color: 'var(--muted-foreground)' }}>
                        MTTR: <strong style={{ color: ag.mttrPromedioAgente > 240 ? '#A32D2D' : ag.mttrPromedioAgente > 120 ? '#C84B00' : '#27500A' }}>{fmtMin(ag.mttrPromedioAgente)}</strong>
                        {ag.pendientesProveedor > 0 && <span style={{ marginLeft: '8px', color: '#5B21B6' }}>⏳ {ag.pendientesProveedor} pend.</span>}
                      </div>
                    )}
                    {ag.mttrPromedioAgente == null && ag.pendientesProveedor > 0 && (
                      <div style={{ marginTop: '6px', paddingTop: '5px', borderTop: '0.5px solid var(--border)', fontSize: '9px', color: '#5B21B6' }}>
                        ⏳ {ag.pendientesProveedor} pend. proveedor
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── SIDEBAR ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

          {/* Resumen del turno */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Resumen del turno</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
              {([
                { label: 'Creados',   value: kpis.creadosHoy ?? 0,  color: '#185FA5', bg: '#E6F1FB' },
                { label: 'Activos',   value: kpis.abiertos,          color: '#C84B00', bg: '#FFF3E0' },
                { label: 'Resueltos', value: kpis.resueltoHoy,       color: '#27500A', bg: '#EAF3DE' },
                { label: 'MTTR',      value: mttrProm != null ? fmtMin(mttrProm) : '—', color: '#5B21B6', bg: '#EEE8FF' },
              ] as const).map(({ label, value, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: '7px', padding: '7px 9px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '7px', paddingTop: '6px', borderTop: '0.5px solid var(--border)', display: 'flex', gap: '10px', fontSize: '9px', color: 'var(--muted-foreground)' }}>
              <span>Ag. <strong style={{ color: 'var(--foreground)' }}>{kpis.resueltoHoyAgente}</strong></span>
              <span>Prov. <strong style={{ color: 'var(--foreground)' }}>{kpis.resueltoHoyProveedor}</strong></span>
            </div>
            {/* Barra de resolución */}
            {(kpis.creadosHoy ?? 0) > 0 && (
              <div style={{ marginTop: '7px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--muted-foreground)', marginBottom: '3px' }}>
                  <span>Tasa resolución</span>
                  <strong>{Math.round(kpis.resueltoHoy / (kpis.creadosHoy ?? 1) * 100)}%</strong>
                </div>
                <div style={{ height: '4px', background: 'var(--muted)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, Math.round(kpis.resueltoHoy / (kpis.creadosHoy ?? 1) * 100))}%`, height: '100%', background: '#27500A', borderRadius: '2px', transition: 'width 0.4s' }} />
                </div>
              </div>
            )}
          </div>

          {/* Pendientes proveedor */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Pendientes proveedor</div>
            {(proveedoresPendientes ?? []).length === 0 ? (
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Sin pendientes</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                    {['Proveedor','Pend.','Espera',''].map(h => (
                      <th key={h} style={{ padding: '3px 4px', textAlign: 'left', fontSize: '8px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(proveedoresPendientes ?? []).map((p: any, i: number) => (
                    <tr key={p.nombre} style={{ borderTop: i > 0 ? '0.5px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '5px 4px' }}><span style={{ padding: '1px 6px', borderRadius: '999px', background: '#E6F1FB', color: '#185FA5', fontSize: '9px', fontWeight: 600 }}>{p.nombre}</span></td>
                      <td style={{ padding: '5px 4px', fontWeight: 700, fontSize: '12px', textAlign: 'center' }}>{p.count}</td>
                      <td style={{ padding: '5px 4px', fontSize: '9px', color: p.masAntiguoMin > 60 ? '#A32D2D' : p.masAntiguoMin > 30 ? '#C84B00' : 'var(--foreground)', fontWeight: 500 }}>{fmtEspera(p.masAntiguoMin)}</td>
                      <td style={{ padding: '5px 4px' }}>
                        <button onClick={() => { setProvFiltro(p.nombre); setCardFiltro('pendientes') }}
                          style={{ fontSize: '9px', background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', fontWeight: 500 }}>Ver →</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Alertas */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Alertas</div>
            {alertas.length === 0 ? (
              <div style={{ fontSize: '10px', color: '#27500A' }}>✓ Sin alertas activas</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {alertas.slice(0, 5).map((a, i) => {
                  const cfg = {
                    vencido:    { icon: '🔴', bg: '#FCEBEB', border: '#FECACA', color: '#A32D2D' },
                    riesgo:     { icon: '⚠',  bg: '#FFF3E0', border: '#FDBA74', color: '#C84B00' },
                    pendiente:  { icon: '🏢', bg: '#EEE8FF', border: '#C4B5FD', color: '#5B21B6' },
                    sin_resp:   { icon: '⏱',  bg: '#FAEEDA', border: '#FCD34D', color: '#854F0B' },
                    sobrecarga: { icon: '👤', bg: '#E6F1FB', border: '#93C5FD', color: '#185FA5' },
                  }[a.tipo] ?? { icon: '●', bg: 'var(--muted)', border: 'var(--border)', color: 'var(--foreground)' }
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 8px', background: cfg.bg, border: `0.5px solid ${cfg.border}`, borderRadius: '7px' }}>
                      <span style={{ fontSize: '11px', flexShrink: 0 }}>{cfg.icon}</span>
                      <span style={{ flex: 1, color: cfg.color, fontSize: '10px' }}>{a.texto}</span>
                      <button onClick={() => { if (a.filterKey) setCardFiltro(a.filterKey); if (a.provFilter) setProvFiltro(a.provFilter) }}
                        style={{ fontSize: '9px', fontWeight: 600, background: 'none', border: 'none', color: cfg.color, cursor: 'pointer', whiteSpace: 'nowrap' }}>{a.accion} →</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Actividad reciente */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600 }}>Actividad reciente</div>
              <button onClick={() => router.push('/incidentes')} style={{ fontSize: '9px', color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Ver toda →</button>
            </div>
            <div style={{ display: 'flex', gap: '3px', marginBottom: '7px', flexWrap: 'wrap' }}>
              {([
                { key: 'todos',      label: 'Todos' },
                { key: 'escalados',  label: 'Escalados' },
                { key: 'resueltos',  label: 'Resueltos' },
                { key: 'respuestas', label: 'Resp. prov.' },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setTabActividad(t.key)}
                  style={{ padding: '2px 8px', fontSize: '9px', fontWeight: tabActividad === t.key ? 600 : 400, background: tabActividad === t.key ? 'hsl(221,83%,23%)' : 'var(--muted)', color: tabActividad === t.key ? 'white' : 'var(--foreground)', border: 'none', borderRadius: '999px', cursor: 'pointer' }}>
                  {t.label}
                </button>
              ))}
            </div>
            {(() => {
              const actFiltrada = (actividadReciente ?? []).filter((ev: any) => {
                if (tabActividad === 'escalados')  return ev.tipo_evento === 'ESCALADO'
                if (tabActividad === 'resueltos')  return ev.tipo_evento === 'RESUELTO'
                if (tabActividad === 'respuestas') return ev.tipo_evento === 'RESPUESTA_PROVEEDOR'
                return true
              })
              return (
                <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                  {actFiltrada.length === 0 ? (
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>Sin actividad</div>
                  ) : actFiltrada.map((ev: any, i: number) => {
                    const conf: Record<string, { icon: string; color: string }> = {
                      CREADO:              { icon: '●', color: '#185FA5' },
                      ESCALADO:            { icon: '↑', color: '#C84B00' },
                      RESPUESTA_PROVEEDOR: { icon: '✓', color: '#27500A' },
                      RESUELTO:            { icon: '✓', color: '#27500A' },
                    }
                    const c = conf[ev.tipo_evento] ?? { icon: '●', color: '#888' }
                    let texto = ''
                    if (ev.tipo_evento === 'CREADO')              texto = `${ev.codigo} por ${ev.actor}`
                    else if (ev.tipo_evento === 'ESCALADO')       texto = `${ev.codigo} escalado${ev.nivel ? ` N${ev.nivel}` : ''}${ev.proveedor_nombre ? ` · ${ev.proveedor_nombre}` : ''}`
                    else if (ev.tipo_evento === 'RESPUESTA_PROVEEDOR') texto = `Resp. ${ev.proveedor_nombre ?? 'prov.'} — ${ev.codigo}`
                    else if (ev.tipo_evento === 'RESUELTO')       texto = `${ev.codigo} resuelto · ${ev.actor}`
                    else texto = ev.codigo ?? ''
                    const { text: horaText, isOld } = fmtHoraEvento(ev.hora)
                    return (
                      <div key={i} style={{ display: 'flex', gap: '5px', padding: '5px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: '9px', color: isOld ? '#B45309' : 'var(--muted-foreground)', whiteSpace: 'nowrap', minWidth: isOld ? '55px' : '32px', paddingTop: '1px', fontWeight: isOld ? 600 : 400 }}>{horaText}</div>
                        <span style={{ color: c.color, fontSize: '10px', paddingTop: '1px', flexShrink: 0 }}>{c.icon}</span>
                        <div style={{ fontSize: '10px', flex: 1, lineHeight: 1.3, color: isOld ? 'var(--muted-foreground)' : 'var(--foreground)' }}>{texto}</div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {asignarOpen && isToday && (
        <AsignarModal activos={activos ?? []} equipo={equipoStats ?? []} onClose={() => setAsignarOpen(false)} onRefresh={onRefresh} />
      )}
    </>
  )
}
