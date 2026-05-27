'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip as ReTooltip } from 'recharts'
import DashboardAnalitico from './components/DashboardAnalitico'
import { SLA_RESOLUCION_POR_TIPO } from '@/lib/sla-core'

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
const DONUT_COLORS: Record<string, string> = {
  SLA_VENCIDO: '#A32D2D', EN_RIESGO_SLA: '#C84B00',
  ESCALADO: '#854F0B', PENDIENTE_PROVEEDOR: '#5B21B6', ABIERTO: '#185FA5',
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
function downloadCSV(activos: any[], resoluciones: any[]) {
  const BOM = '﻿'
  const headers = ['Código','Tienda','Distrito','Proveedor','Tipo','Impacto','Estado','Agente','Hora Registro','Hora Fin','MTTR (min)','Resuelto Por']
  const toRow = (r: any, estado: string) => [
    r.codigo ?? '', r.tienda_nombre ?? r.tienda_codigo ?? '', r.tienda_distrito ?? '',
    r.proveedor_nombre ?? '', TIPO_LABELS[r.tipo] ?? r.tipo ?? '', r.nivel_impacto ?? '',
    estado, r.agente_nombre ?? '', fmtHora(r.hora_registro), fmtHora(r.hora_fin ?? null),
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
  a.download = `incidentes_${new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)}.csv`
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
  const slaLimite = SLA_RESOLUCION_POR_TIPO[inc.tipo] ?? 120
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

function DonutTooltip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  const badge = BADGE_OP[entry.name] ?? { label: entry.name, bg: 'white', color: '#333' }
  const pct = total > 0 ? Math.round(entry.value / total * 100) : 0
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '11px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <div style={{ fontWeight: 600 }}>Estado: {badge.label}</div>
      <div>Cantidad: <strong>{entry.value}</strong></div>
      <div>Porcentaje: <strong>{pct}%</strong></div>
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

export default function DashboardPage() {
  const router = useRouter()
  const [op, setOp]                       = useState<any>(null)
  const [tick, setTick]                   = useState(0)
  const [decPendientes, setDecPendientes] = useState<number | null>(null)
  const [tab, setTab]   = useState<'operativo' | 'analitico'>('operativo')

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const t = p.get('tab')
    if (t === 'analitico' || t === 'operativo') setTab(t)
  }, [])

  const fetchOp = useCallback(async () => {
    const res = await fetch('/api/dashboard/operativo')
    if (res.ok) setOp(await res.json())
  }, [])

  const fetchDecPendientes = useCallback(async () => {
    const res = await fetch('/api/decisiones?estado=PROPUESTO')
    if (res.ok) {
      const data = await res.json()
      setDecPendientes(Array.isArray(data) ? data.length : null)
    }
  }, [])

  useEffect(() => { fetchOp(); fetchDecPendientes() }, [fetchOp, fetchDecPendientes])
  useEffect(() => {
    const id = setInterval(() => { setTick(t => t + 1); fetchOp() }, 30000)
    return () => clearInterval(id)
  }, [fetchOp])
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
            {tab === 'operativo' ? 'Dashboard operativo' : 'Dashboard analítico'}
          </h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {tab === 'operativo'
              ? <><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />Actualización en tiempo real</>
              : 'Vista analítica'
            }
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--muted)', borderRadius: '10px', padding: '4px' }}>
          {(['operativo', 'analitico'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); router.replace(`?tab=${t}`, { scroll: false }) }}
              style={{ padding: '7px 18px', fontSize: '13px', border: 'none', borderRadius: '7px', cursor: 'pointer', background: tab === t ? 'hsl(221,83%,23%)' : 'transparent', color: tab === t ? 'white' : 'var(--foreground)', fontWeight: tab === t ? 600 : 400 }}>
              {t === 'operativo' ? 'Operativo' : 'Analítico'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'operativo' && (
        op
          ? <OperativoView op={op} tick={tick} router={router} decPendientes={decPendientes} onRefresh={fetchOp} />
          : <div style={{ padding: '60px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando...</div>
      )}
      {tab === 'analitico' && <DashboardAnalitico />}
    </div>
  )
}

// ─── OperativoView ────────────────────────────────────────────────────────────

function OperativoView({ op, tick, router, decPendientes, onRefresh }: { op: any; tick: number; router: any; decPendientes: number | null; onRefresh: () => void }) {
  const { activos, resoluciones, contingenciasActivas, equipoStats, proveedoresPendientes, actividadReciente, kpis } = op
  const [provFiltro,      setProvFiltro]      = useState('Todos')
  const [cardFiltro,      setCardFiltro]      = useState<string | null>(null)
  const [asignarOpen,     setAsignarOpen]     = useState(false)
  const [tabActividad,    setTabActividad]    = useState<'todos'|'escalados'|'resueltos'|'respuestas'>('todos')
  const [turnoInicio,     setTurnoInicio]     = useState('08:00')
  const [filtroHeredados, setFiltroHeredados] = useState(false)
  const [confirmarCont,   setConfirmarCont]   = useState<string | null>(null)
  const [desactivandoCont, setDesactivandoCont] = useState<string | null>(null)

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

  // Computed donut data
  const donutData = useMemo(() => {
    const now = Date.now()
    const counts: Record<string, number> = {}
    for (const inc of (activos ?? [])) {
      const { estadoOp } = getEstadoOpClient(inc, now)
      counts[estadoOp] = (counts[estadoOp] ?? 0) + 1
    }
    return Object.entries(counts).map(([estado, value]) => ({ estado, value }))
  }, [activos, tick])

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
  }, [activos, provFiltro, cardFiltro, filtroHeredados, turnoInicio, tick])

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
      {/* Toolbar: CSV download */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <button
          onClick={() => downloadCSV(activos ?? [], resoluciones ?? [])}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '11px', fontWeight: 600, background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--foreground)' }}>
          ⬇ Descargar CSV del día
        </button>
      </div>

      {/* KPI Cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {kpiCards.map((card) => (
          <div key={card.label}
            onClick={() => { if (card.link) router.push(card.link); else if (card.filterKey) handleCardClick(card.filterKey) }}
            style={{ background: 'var(--card)', border: `0.5px solid ${cardFiltro === card.filterKey && card.filterKey ? '#185FA5' : 'var(--border)'}`, borderRadius: '12px', padding: '14px 16px', cursor: card.filterKey || card.link ? 'pointer' : 'default', boxShadow: cardFiltro === card.filterKey && card.filterKey ? '0 0 0 2px rgba(24,95,165,0.15)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div style={{ width: 36, height: 36, borderRadius: '8px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                {card.icon}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.3 }}>{card.label}</div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: card.colorIcon, lineHeight: 1 }}>{card.value}</div>
            {card.sub && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '4px' }}>{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* Panel contingencias activas — persistente, span completo */}
      {(contingenciasActivas ?? []).length > 0 && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: '12px', padding: '12px 16px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '15px' }}>⚠</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {(contingenciasActivas ?? []).length} tienda{(contingenciasActivas ?? []).length > 1 ? 's' : ''} en contingencia activa
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {(contingenciasActivas ?? []).map((c: any) => {
              const rendLabel: Record<string,{l:string;bg:string;c:string}> = {
                TOTAL:   { l: 'Cubrió total',    bg: '#dcfce7', c: '#15803d' },
                PARCIAL: { l: 'Con limitaciones', bg: '#fef9c3', c: '#a16207' },
                FALLIDA: { l: 'No funcionó',      bg: '#fee2e2', c: '#b91c1c' },
              }
              const rend = c.cont_rendimiento ? rendLabel[c.cont_rendimiento] : null
              const horaActivacion = c.cont_hora_activacion
                ? new Date(c.cont_hora_activacion).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
                : null
              const confirmando  = confirmarCont === c.tienda_id
              const desactivando = desactivandoCont === c.tienda_id
              return (
                <div key={c.tienda_id} style={{ background: 'white', border: '1px solid #f59e0b', borderRadius: '8px', padding: '8px 12px', minWidth: '220px', flex: '1 1 220px', maxWidth: '340px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#78350f' }}>{c.tienda_codigo} — {c.tienda_nombre}</span>
                    {rend && (
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: rend.bg, color: rend.c, whiteSpace: 'nowrap', marginLeft: '6px' }}>
                        {rend.l}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '10px', color: '#92400e', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {c.tienda_distrito && <span>{c.tienda_distrito}</span>}
                    {c.proveedor_nombre && <span>· {c.proveedor_nombre}</span>}
                    {horaActivacion && <span>· Activada {horaActivacion}</span>}
                  </div>
                  {c.contingencia_descripcion && (
                    <div style={{ fontSize: '10px', color: '#78350f', marginTop: '4px', fontStyle: 'italic', lineHeight: 1.4 }}>
                      {c.contingencia_descripcion}
                    </div>
                  )}
                  {/* Footer: incidente link + acción desactivar */}
                  <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    {c.incidente_codigo
                      ? <span onClick={() => router.push(`/incidentes/${c.incidente_id}`)} style={{ fontSize: '10px', color: '#92400e', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'monospace' }}>
                          {c.incidente_codigo}
                        </span>
                      : <span />
                    }
                    {confirmando ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px' }}>
                        <span style={{ color: '#78350f', fontWeight: 500 }}>¿Confirmar?</span>
                        <button
                          disabled={desactivando}
                          onClick={() => c.incidente_id ? desactivarContingencia(c.incidente_id, c.tienda_id) : undefined}
                          style={{ padding: '2px 8px', fontSize: '10px', fontWeight: 700, background: '#b45309', color: 'white', border: 'none', borderRadius: '4px', cursor: desactivando ? 'default' : 'pointer', opacity: desactivando ? 0.6 : 1 }}>
                          {desactivando ? '…' : 'Sí'}
                        </button>
                        <button
                          disabled={desactivando}
                          onClick={() => setConfirmarCont(null)}
                          style={{ padding: '2px 8px', fontSize: '10px', background: '#fef3c7', color: '#78350f', border: '1px solid #fcd34d', borderRadius: '4px', cursor: 'pointer' }}>
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmarCont(c.tienda_id)}
                        style={{ padding: '2px 10px', fontSize: '10px', fontWeight: 600, background: '#fef3c7', color: '#78350f', border: '1px solid #f59e0b', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Desactivar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Body grid: main + sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '14px', alignItems: 'start' }}>

        {/* ── MAIN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

            {/* Donut */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Distribución por estado</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
                  <PieChart width={120} height={120}>
                    <Pie data={donutData} dataKey="value" nameKey="estado" cx="50%" cy="50%" innerRadius={38} outerRadius={56} paddingAngle={2}>
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={DONUT_COLORS[entry.estado] ?? '#6B7280'} />
                      ))}
                    </Pie>
                    <ReTooltip content={<DonutTooltip total={totalActivos} />} />
                  </PieChart>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1 }}>{totalActivos}</div>
                    <div style={{ fontSize: '9px', color: 'var(--muted-foreground)' }}>activos</div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  {donutData.map(e => {
                    const badge = BADGE_OP[e.estado]
                    return (
                      <div key={e.estado} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '2px', background: DONUT_COLORS[e.estado] ?? '#6B7280', flexShrink: 0 }} />
                        <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', flex: 1 }}>{badge?.label ?? e.estado}</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'monospace' }}>{e.value}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Resumen del turno */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Resumen del turno</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {([
                  { label: 'Creados hoy',   value: kpis.creadosHoy ?? 0,  color: '#185FA5', bg: '#E6F1FB' },
                  { label: 'Activos ahora', value: kpis.abiertos,          color: '#C84B00', bg: '#FFF3E0' },
                  { label: 'Resueltos hoy', value: kpis.resueltoHoy,       color: '#27500A', bg: '#EAF3DE' },
                  { label: 'MTTR promedio', value: mttrProm != null ? fmtMin(mttrProm) : '—', color: '#5B21B6', bg: '#EEE8FF' },
                ] as const).map(({ label, value, color, bg }) => (
                  <div key={label} style={{ background: bg, borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '22px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '4px' }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '0.5px solid var(--border)', display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                <span>Agente: <strong style={{ color: 'var(--foreground)' }}>{kpis.resueltoHoyAgente}</strong></span>
                <span>Proveedor: <strong style={{ color: 'var(--foreground)' }}>{kpis.resueltoHoyProveedor}</strong></span>
              </div>
            </div>
          </div>

          {/* Estado del equipo */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Estado del equipo</div>
              <button onClick={() => setAsignarOpen(true)}
                style={{ padding: '5px 12px', fontSize: '11px', background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                + Asignar
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {(equipoStats ?? []).map((ag: any, idx: number) => {
                const carga = ag.casosActivos === 0 ? 'libre'
                  : ag.casosActivos <= 2 ? 'normal'
                  : ag.casosActivos <= 4 ? 'cargado'
                  : 'saturado'
                const cargaBadge = {
                  libre:    { label: 'Libre',    bg: '#F3F4F6', color: '#6B7280' },
                  normal:   { label: 'Normal',   bg: '#EAF3DE', color: '#27500A' },
                  cargado:  { label: 'Cargado',  bg: '#FFF3E0', color: '#C84B00' },
                  saturado: { label: 'Saturado', bg: '#FCEBEB', color: '#A32D2D' },
                }[carga]
                const borderColor = carga === 'saturado' ? '#FECACA' : carga === 'cargado' ? '#FED7AA' : '#E5E7EB'
                return (
                  <div key={ag.id} style={{ padding: '12px', background: 'var(--muted)', borderRadius: '10px', border: `0.5px solid ${borderColor}` }}>
                    {/* Header: avatar + nombre + badge carga */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <AvatarCircle nombre={ag.nombre} color={AVATAR_COLORS[idx % AVATAR_COLORS.length]} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ag.nombre}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
                          <span style={{ fontSize: '9px', color: 'var(--muted-foreground)' }}>{ag.rol}</span>
                          <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', background: cargaBadge.bg, color: cargaBadge.color }}>
                            {cargaBadge.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Métricas principales: número grande + dos columnas */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ textAlign: 'center', minWidth: '44px' }}>
                        <div style={{ fontSize: '24px', fontWeight: 700, lineHeight: 1, color: carga === 'saturado' ? '#A32D2D' : carga === 'cargado' ? '#C84B00' : 'var(--foreground)' }}>{ag.casosActivos}</div>
                        <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginTop: '2px' }}>activos</div>
                      </div>
                      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                        <div style={{ background: ag.enRiesgoSla > 0 ? '#FEF2F2' : 'transparent', borderRadius: '6px', padding: '4px 6px', border: ag.enRiesgoSla > 0 ? '0.5px solid #FECACA' : '0.5px solid transparent' }}>
                          <div style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1, color: ag.enRiesgoSla > 0 ? '#A32D2D' : 'var(--muted-foreground)' }}>{ag.enRiesgoSla}</div>
                          <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginTop: '1px' }}>En riesgo</div>
                        </div>
                        <div style={{ background: '#F0FDF4', borderRadius: '6px', padding: '4px 6px', border: '0.5px solid #BBF7D0' }}>
                          <div style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1, color: '#27500A' }}>{ag.resueltoHoyAgente + ag.resueltoHoyProveedor}</div>
                          <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginTop: '1px' }}>Resueltos hoy</div>
                        </div>
                      </div>
                    </div>

                    {/* Métricas secundarias */}
                    <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: '6px', fontSize: '11px', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                      {ag.escalados > 0 && (
                        <span style={{ color: '#854F0B' }}>↑ {ag.escalados} escal.</span>
                      )}
                      {ag.pendientesProveedor > 0 && (
                        <span style={{ color: '#5B21B6' }}>⏳ {ag.pendientesProveedor} pend.</span>
                      )}
                      <span style={{ color: 'var(--muted-foreground)' }}>Sol. ag. {ag.resueltoHoyAgente} · prov. {ag.resueltoHoyProveedor}</span>
                      {ag.mttrPromedioAgente != null && (
                        <span style={{ color: ag.mttrPromedioAgente > 240 ? '#A32D2D' : ag.mttrPromedioAgente > 120 ? '#854F0B' : '#3B6D11' }}>
                          MTTR {fmtMin(ag.mttrPromedioAgente)}
                        </span>
                      )}
                    </div>

                    <button onClick={() => setAsignarOpen(true)}
                      style={{ marginTop: '8px', width: '100%', padding: '5px', fontSize: '11px', background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: '#185FA5', fontWeight: 500 }}>
                      Asignar
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Cola operativa */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>

            {/* Banner heredados */}
            {incidentesHeredados.length > 0 && (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '8px 14px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                <span>📋 <strong>{incidentesHeredados.length}</strong> incidente(s) heredado(s) del turno anterior</span>
                <input type="time" value={turnoInicio} onChange={e => setTurnoInicio(e.target.value)} style={{ fontSize: '12px', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '2px 6px' }} />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>
                Cola operativa
                {(cardFiltro || filtroHeredados) && <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: '8px' }}>({colaFiltrada.length} mostrando)</span>}
              </div>
              {(cardFiltro || filtroHeredados) && (
                <button onClick={() => { setCardFiltro(null); setFiltroHeredados(false) }}
                  style={{ fontSize: '11px', background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', textDecoration: 'underline' }}>
                  Limpiar filtro
                </button>
              )}
            </div>

            {/* Provider filter chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              {PROVS.map(p => (
                <button key={p} onClick={() => setProvFiltro(p)}
                  style={{ padding: '4px 12px', fontSize: '11px', fontWeight: provFiltro === p ? 600 : 400, background: provFiltro === p ? 'hsl(221,83%,23%)' : 'var(--muted)', color: provFiltro === p ? 'white' : 'var(--foreground)', border: 'none', borderRadius: '999px', cursor: 'pointer' }}>
                  {p}
                </button>
              ))}
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                    {['ID', 'Tienda', 'Proveedor', 'Tipo', 'Impacto', 'Estado operativo', 'Asignado a', 'Tiempo abierto', 'Acción'].map(h => (
                      <th key={h} style={{ padding: '7px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colaFiltrada.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)' }}>Sin incidentes</td></tr>
                  )}
                  {colaFiltrada.map((inc: any, idx: number) => {
                    const imp  = IMP_BADGE[inc.nivel_impacto] ?? IMP_BADGE.BAJO
                    const nowM = Date.now()
                    const { minutosTranscurridos } = getEstadoOpClient(inc, nowM)
                    return (
                      <tr key={inc.id} style={{
                        borderTop: idx > 0 ? '0.5px solid var(--border)' : 'none',
                        borderLeft: inc.estadoOp === 'SLA_VENCIDO' ? '3px solid #DC2626' : inc.estadoOp === 'EN_RIESGO_SLA' ? '3px solid #F59E0B' : inc.estadoOp === 'ESCALADO' ? '3px solid #B45309' : '3px solid transparent',
                        backgroundColor: inc.estadoOp === 'SLA_VENCIDO' ? '#FEF2F2' : inc.estadoOp === 'EN_RIESGO_SLA' ? '#FFFBEB' : 'transparent',
                        transition: 'background-color 0.2s',
                      }}>
                        <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '10px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{inc.codigo}</td>
                        <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 500 }}>{inc.tienda_codigo}</div>
                          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{inc.tienda_nombre}</div>
                        </td>
                        <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                          {inc.proveedor_nombre
                            ? <span style={{ padding: '1px 7px', borderRadius: '999px', background: '#E6F1FB', color: '#185FA5', fontSize: '10px', fontWeight: 500 }}>{inc.proveedor_nombre}</span>
                            : <span style={{ color: '#888' }}>—</span>}
                        </td>
                        <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{TIPO_LABELS[inc.tipo] ?? inc.tipo}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '4px', background: imp.bg, color: imp.color }}>{imp.label}</span>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <SLABadge inc={inc} nowMs={nowM} />
                          {inc.sinMovimiento && (
                            <span style={{ display: 'block', marginTop: '2px', fontSize: '10px', padding: '1px 5px', borderRadius: '999px', background: '#F1F5F9', color: '#475569' }}>
                              ⏸ {fmtMin(inc.sinMovimientoMin)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px', whiteSpace: 'nowrap', fontSize: '11px' }}>{inc.agente_nombre ?? '—'}</td>
                        <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', color: minutosTranscurridos >= 240 ? '#A32D2D' : minutosTranscurridos >= 120 ? '#C84B00' : 'var(--foreground)' }}>
                          {fmtMin(minutosTranscurridos)}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <button onClick={() => router.push(`/incidentes/${inc.id}`)}
                            style={{ padding: '4px 10px', fontSize: '10px', background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
                            Ver →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--muted-foreground)' }}>
              Mostrando {colaFiltrada.length} de {totalActivos} incidente{totalActivos !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* ── SIDEBAR ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Pendientes proveedor */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Pendientes proveedor</div>
            {(proveedoresPendientes ?? []).length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', padding: '8px 0' }}>Sin pendientes de proveedor</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                    {['Proveedor', 'Pend.', 'Más antiguo', 'Acción'].map(h => (
                      <th key={h} style={{ padding: '5px 6px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(proveedoresPendientes ?? []).map((p: any, i: number) => (
                    <tr key={p.nombre} style={{ borderTop: i > 0 ? '0.5px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '7px 6px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '999px', background: '#E6F1FB', color: '#185FA5', fontSize: '10px', fontWeight: 600 }}>{p.nombre}</span>
                      </td>
                      <td style={{ padding: '7px 6px', fontWeight: 700, fontFamily: 'monospace' }}>{p.count}</td>
                      <td style={{ padding: '7px 6px', fontFamily: 'monospace', color: p.masAntiguoMin > 60 ? '#A32D2D' : p.masAntiguoMin > 30 ? '#C84B00' : 'var(--foreground)', fontWeight: 500 }}>
                        {fmtEspera(p.masAntiguoMin)}
                      </td>
                      <td style={{ padding: '7px 6px' }}>
                        <button onClick={() => { setProvFiltro(p.nombre); setCardFiltro('pendientes') }}
                          style={{ fontSize: '10px', background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          Ver →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Alertas rápidas */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Alertas rápidas</div>
            {alertas.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#27500A', padding: '8px 0' }}>✓ Sin alertas activas</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {alertas.slice(0, 6).map((a, i) => {
                  const cfg = {
                    vencido:     { icon: '🔴', bg: '#FCEBEB', border: '#FECACA', color: '#A32D2D' },
                    riesgo:      { icon: '⚠',  bg: '#FFF3E0', border: '#FDBA74', color: '#C84B00' },
                    pendiente:   { icon: '🏢', bg: '#EEE8FF', border: '#C4B5FD', color: '#5B21B6' },
                    sin_resp:    { icon: '⏱',  bg: '#FAEEDA', border: '#FCD34D', color: '#854F0B' },
                    sobrecarga:  { icon: '👤', bg: '#E6F1FB', border: '#93C5FD', color: '#185FA5' },
                  }[a.tipo] ?? { icon: '●', bg: 'var(--muted)', border: 'var(--border)', color: 'var(--foreground)' }
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', background: cfg.bg, border: `0.5px solid ${cfg.border}`, borderRadius: '8px', fontSize: '11px' }}>
                      <span style={{ fontSize: '14px', flexShrink: 0 }}>{cfg.icon}</span>
                      <span style={{ flex: 1, color: cfg.color }}>{a.texto}</span>
                      <button
                        onClick={() => {
                          if (a.filterKey) setCardFiltro(a.filterKey)
                          if (a.provFilter) setProvFiltro(a.provFilter)
                        }}
                        style={{ fontSize: '10px', fontWeight: 600, background: 'none', border: 'none', color: cfg.color, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {a.accion} →
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Actividad reciente */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Actividad reciente</div>
              <button onClick={() => router.push('/incidentes')}
                style={{ fontSize: '10px', color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                Ver toda →
              </button>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
              {([
                { key: 'todos',      label: 'Todos' },
                { key: 'escalados',  label: 'Escalados' },
                { key: 'resueltos',  label: 'Resueltos' },
                { key: 'respuestas', label: 'Respuestas prov.' },
              ] as const).map(tab => (
                <button key={tab.key} onClick={() => setTabActividad(tab.key)}
                  style={{ padding: '4px 12px', fontSize: '11px', fontWeight: tabActividad === tab.key ? 600 : 400, background: tabActividad === tab.key ? 'hsl(221,83%,23%)' : 'var(--muted)', color: tabActividad === tab.key ? 'white' : 'var(--foreground)', border: 'none', borderRadius: '999px', cursor: 'pointer' }}>
                  {tab.label}
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
            <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {actFiltrada.length === 0 ? (
                <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', padding: '8px 0' }}>Sin actividad reciente</div>
              ) : (
                actFiltrada.map((ev: any, i: number) => {
                  const conf: Record<string, { icon: string; color: string }> = {
                    CREADO:               { icon: '●', color: '#185FA5' },
                    ESCALADO:             { icon: '↑', color: '#C84B00' },
                    RESPUESTA_PROVEEDOR:  { icon: '✓', color: '#27500A' },
                    RESUELTO:             { icon: '✓', color: '#27500A' },
                  }
                  const c = conf[ev.tipo_evento] ?? { icon: '●', color: '#888' }
                  let texto = ''
                  if (ev.tipo_evento === 'CREADO')              texto = `Incidente ${ev.codigo} registrado por ${ev.actor}`
                  else if (ev.tipo_evento === 'ESCALADO')       texto = `Incidente ${ev.codigo} escalado${ev.nivel ? ` a Nivel ${ev.nivel}` : ''}${ev.proveedor_nombre ? ` (${ev.proveedor_nombre})` : ''} por ${ev.actor}`
                  else if (ev.tipo_evento === 'RESPUESTA_PROVEEDOR') texto = `Respuesta de ${ev.proveedor_nombre ?? 'proveedor'} en incidente ${ev.codigo}`
                  else if (ev.tipo_evento === 'RESUELTO')       texto = `Incidente ${ev.codigo} resuelto por ${ev.actor}`
                  else texto = ev.codigo ?? ''
                  const { text: horaText, isOld } = fmtHoraEvento(ev.hora)
                  return (
                    <div key={i} style={{ display: 'flex', gap: '8px', padding: '6px 0', borderTop: i > 0 ? '0.5px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize: '10px', color: isOld ? '#B45309' : 'var(--muted-foreground)', whiteSpace: 'nowrap', minWidth: isOld ? '68px' : '38px', paddingTop: '1px', fontWeight: isOld ? 600 : 400 }}>{horaText}</div>
                      <span style={{ color: c.color, fontSize: '12px', paddingTop: '1px', flexShrink: 0 }}>{c.icon}</span>
                      <div style={{ fontSize: '11px', flex: 1, lineHeight: 1.4, color: isOld ? 'var(--muted-foreground)' : 'var(--foreground)' }}>{texto}</div>
                    </div>
                  )
                })
              )}
            </div>
              )
            })()}
          </div>
        </div>
      </div>

      {asignarOpen && (
        <AsignarModal activos={activos ?? []} equipo={equipoStats ?? []} onClose={() => setAsignarOpen(false)} onRefresh={onRefresh} />
      )}
    </>
  )
}
