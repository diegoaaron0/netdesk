'use client'
import { useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
type Modulo  = 'OPERATIVO' | 'ANALITICO' | 'INCIDENTES' | 'TIENDAS' | 'PROVEEDORES'
type Formato = 'CSV' | 'EXCEL' | 'PDF' | 'IMAGEN_KPI'
type Status  = 'LISTO' | 'PENDIENTE' | 'PROXIMAMENTE'

interface Seccion {
  id: string; label: string; desc: string; status: Status
  tipoDato: string; registros: string; formatos: string
}

// ── Section catalog ────────────────────────────────────────────────────────────
const CATALOG: Record<Modulo, Seccion[]> = {
  OPERATIVO: [
    { id:'cola-op',    label:'Cola operativa',         desc:'Incidentes activos con estado SLA en tiempo real', status:'PROXIMAMENTE', tipoDato:'Tabla', registros:'Tiempo real', formatos:'—' },
    { id:'abiertos',   label:'Incidentes abiertos',    desc:'Detalle de incidentes sin resolver',               status:'PROXIMAMENTE', tipoDato:'Tabla', registros:'Tiempo real', formatos:'—' },
    { id:'riesgo-sla', label:'En riesgo SLA',          desc:'Incidentes próximos a vencer el SLA',              status:'PROXIMAMENTE', tipoDato:'Tabla', registros:'Tiempo real', formatos:'—' },
    { id:'escal-op',   label:'Escalados',              desc:'Incidentes escalados activos',                     status:'PROXIMAMENTE', tipoDato:'Tabla', registros:'Tiempo real', formatos:'—' },
    { id:'pend-prov',  label:'Pendientes proveedor',   desc:'Incidentes esperando respuesta de proveedor',      status:'PROXIMAMENTE', tipoDato:'Tabla', registros:'Tiempo real', formatos:'—' },
    { id:'equipo',     label:'Estado del equipo',      desc:'Carga de trabajo y métricas por agente',           status:'PROXIMAMENTE', tipoDato:'Tabla', registros:'Tiempo real', formatos:'—' },
    { id:'actividad',  label:'Actividad reciente',     desc:'Feed de eventos de las últimas 24 horas',          status:'PROXIMAMENTE', tipoDato:'Lista', registros:'Tiempo real', formatos:'—' },
    { id:'alertas',    label:'Alertas rápidas',        desc:'Alertas automáticas del sistema operativo',        status:'PROXIMAMENTE', tipoDato:'Lista', registros:'Tiempo real', formatos:'—' },
  ],
  ANALITICO: [
    { id:'kpis',        label:'KPIs superiores',                 desc:'Resumen de indicadores principales del período',      status:'LISTO',        tipoDato:'Resumen analítico', registros:'7 métricas',    formatos:'CSV' },
    { id:'tend-sla',    label:'Tendencia de incidentes y SLA',   desc:'Evolución diaria de incidentes y cumplimiento SLA',  status:'LISTO',        tipoDato:'Gráfica + Tabla',  registros:'31 días',      formatos:'CSV' },
    { id:'imp-prov',    label:'Impacto por proveedor',           desc:'MTTR e indicadores de impacto por proveedor',        status:'LISTO',        tipoDato:'Tabla',             registros:'6 proveedores', formatos:'CSV' },
    { id:'tiendas-crit',label:'Tiendas críticas',                desc:'Ranking de tiendas con mayor impacto y reincidencia',status:'LISTO',        tipoDato:'Ranking',           registros:'15 tiendas',   formatos:'CSV' },
    { id:'dist-tipo',   label:'Distribución por tipo',           desc:'Distribución de incidentes por tipo de caída',       status:'LISTO',        tipoDato:'Tabla + Gráfica',  registros:'4 tipos',      formatos:'CSV' },
    { id:'sla-prov',    label:'Cumplimiento SLA por proveedor',  desc:'Detalle de SLA respuesta y resolución',              status:'LISTO',        tipoDato:'Tabla',             registros:'6 proveedores', formatos:'CSV' },
    { id:'imp-geo',     label:'Impacto geográfico',              desc:'Distribución de incidentes por zona geográfica',     status:'LISTO',        tipoDato:'Tabla',             registros:'Por zona',     formatos:'CSV' },
    { id:'sla-6m',      label:'Tendencia SLA últimos 6 meses',   desc:'Evolución mensual del cumplimiento SLA por proveedor',status:'LISTO',       tipoDato:'Gráfica',           registros:'6 meses',      formatos:'CSV' },
    { id:'insights',    label:'Insights y decisiones sugeridas', desc:'Conclusiones automáticas y recomendaciones de acción',status:'PROXIMAMENTE', tipoDato:'Recomendaciones',  registros:'—',            formatos:'PDF' },
  ],
  INCIDENTES: [
    { id:'detalle',   label:'Detalle de incidentes',     desc:'Listado completo con todos los campos del período',   status:'LISTO',     tipoDato:'Tabla', registros:'Todos en período', formatos:'CSV' },
    { id:'escal',     label:'Escalamientos',             desc:'Historial de escalamientos por incidente',            status:'PENDIENTE', tipoDato:'Tabla', registros:'—',               formatos:'CSV' },
    { id:'hist-est',  label:'Historial de estados',      desc:'Cambios de estado en el período seleccionado',        status:'PENDIENTE', tipoDato:'Tabla', registros:'—',               formatos:'CSV' },
    { id:'fuera-sla', label:'Casos fuera de SLA',        desc:'Incidentes que superaron el tiempo límite SLA',       status:'PENDIENTE', tipoDato:'Tabla', registros:'—',               formatos:'CSV' },
    { id:'tickets',   label:'Tickets InvGate / proveedor',desc:'Correlación con tickets de sistemas externos',       status:'PENDIENTE', tipoDato:'Tabla', registros:'—',               formatos:'CSV' },
  ],
  TIENDAS: [
    { id:'maestro',      label:'Maestro de tiendas',      desc:'Catálogo completo de tiendas con todos los campos', status:'LISTO',     tipoDato:'Tabla', registros:'Todas las tiendas', formatos:'CSV' },
    { id:'prov-tienda',  label:'Proveedores por tienda',  desc:'Proveedor de conectividad asignado por tienda',     status:'PENDIENTE', tipoDato:'Tabla', registros:'—',                formatos:'CSV' },
    { id:'cid',          label:'CID',                     desc:'Identificadores de circuito por tienda',            status:'PENDIENTE', tipoDato:'Tabla', registros:'—',                formatos:'CSV' },
    { id:'conexion',     label:'Conexión',                desc:'Tipo y estado de conexión por tienda',              status:'PENDIENTE', tipoDato:'Tabla', registros:'—',                formatos:'CSV' },
    { id:'contactos',    label:'Contactos',               desc:'Contactos de administración por tienda',            status:'PENDIENTE', tipoDato:'Tabla', registros:'—',                formatos:'CSV' },
    { id:'contingencia', label:'Contingencia',            desc:'Estado de contingencia activa por tienda',          status:'PENDIENTE', tipoDato:'Tabla', registros:'—',                formatos:'CSV' },
    { id:'hist-cambios', label:'Historial de cambios',    desc:'Registro de modificaciones de tiendas',             status:'PENDIENTE', tipoDato:'Tabla', registros:'—',                formatos:'CSV' },
  ],
  PROVEEDORES: [
    { id:'res-prov',  label:'Resumen por proveedor',      desc:'KPIs agregados por proveedor en el período',       status:'PENDIENTE', tipoDato:'Tabla', registros:'—', formatos:'CSV' },
    { id:'sla-p',     label:'SLA por proveedor',          desc:'Cumplimiento SLA histórico por proveedor',         status:'PENDIENTE', tipoDato:'Tabla', registros:'—', formatos:'CSV' },
    { id:'mttr-p',    label:'MTTR por proveedor',         desc:'Tiempo promedio de resolución por proveedor',      status:'PENDIENTE', tipoDato:'Tabla', registros:'—', formatos:'CSV' },
    { id:'inc-p',     label:'Incidentes por proveedor',   desc:'Volumen y tipos de incidentes por proveedor',      status:'PENDIENTE', tipoDato:'Tabla', registros:'—', formatos:'CSV' },
  ],
}

// ── Quick templates ────────────────────────────────────────────────────────────
const PLANTILLAS = [
  { id:'mg',  nombre:'Reporte mensual gerencial',  desc:'KPIs, SLA, tiendas críticas e insights',    color:'#7F77DD', bg:'#F0EFFF',
    modulo:'ANALITICO' as Modulo, formato:'CSV' as Formato, secciones:['kpis','sla-prov','tiendas-crit','imp-prov'] },
  { id:'sp',  nombre:'Seguimiento proveedores',     desc:'Cumplimiento y tendencia mensual',           color:'#185FA5', bg:'#E6F1FB',
    modulo:'ANALITICO' as Modulo, formato:'CSV' as Formato, secciones:['imp-prov','sla-prov','sla-6m'] },
  { id:'tc',  nombre:'Tiendas críticas',            desc:'Reincidencia, impacto y contingencia',       color:'#A32D2D', bg:'#FCEBEB',
    modulo:'ANALITICO' as Modulo, formato:'CSV' as Formato, secciones:['tiendas-crit','imp-geo'] },
  { id:'sla', nombre:'SLA proveedores',             desc:'Cumplimiento y tendencia mensual',           color:'#1D9E75', bg:'#EAF3DE',
    modulo:'ANALITICO' as Modulo, formato:'CSV' as Formato, secciones:['sla-prov','sla-6m'] },
  { id:'io',  nombre:'Incidentes operativos',       desc:'Detalle, escalamientos y casos fuera SLA',   color:'#854F0B', bg:'#FAEEDA',
    modulo:'INCIDENTES' as Modulo, formato:'CSV' as Formato, secciones:['detalle','escal','fuera-sla'] },
  { id:'rt',  nombre:'Reincidencia por tienda',     desc:'Patrones, tipos e impacto estimado',         color:'#378ADD', bg:'#E6F3FF',
    modulo:'ANALITICO' as Modulo, formato:'CSV' as Formato, secciones:['tiendas-crit','dist-tipo','imp-geo'] },
]

// ── Module metadata ────────────────────────────────────────────────────────────
const MODULO_META: Record<Modulo, { label: string; desc: string }> = {
  OPERATIVO:  { label: 'Operativo',    desc: 'Supervisión en tiempo real' },
  ANALITICO:  { label: 'Analítico',    desc: 'Análisis y métricas' },
  INCIDENTES: { label: 'Incidentes',   desc: 'Detalle de incidentes' },
  TIENDAS:    { label: 'Tiendas',      desc: 'Información de tiendas' },
  PROVEEDORES:{ label: 'Proveedores',  desc: 'Evaluación de proveedores' },
}

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
}

// ── CSV helpers ────────────────────────────────────────────────────────────────
function esc(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s
}
function csvRow(...cells: unknown[]) { return cells.map(esc).join(',') }
function downloadCsv(content: string, filename: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ── Analítico CSV (client-side, from /api/reportes) ───────────────────────────
async function buildAnaliticoCsv(
  secciones: Set<string>, desde: string, hasta: string,
): Promise<string> {
  const res = await fetch(`/api/reportes?desde=${desde}&hasta=${hasta}`)
  if (!res.ok) throw new Error('Error al obtener datos analíticos')
  const d = await res.json()
  const lines: string[] = []

  if (secciones.has('kpis') && d.totales) {
    const t = d.totales
    lines.push('=== KPIs SUPERIORES ===')
    lines.push(csvRow('Métrica', 'Valor'))
    lines.push(csvRow('Total incidentes', t.total))
    lines.push(csvRow('MTTR promedio (min)', t.mttrAvg))
    lines.push(csvRow('Cumplimiento SLA (%)', t.slaPct))
    lines.push(csvRow('Tiendas afectadas', t.tiendas))
    lines.push(csvRow('Total período anterior', t.prevTotal))
    lines.push(csvRow('MTTR período anterior (min)', t.prevMttrAvg))
    lines.push('')
  }

  if (secciones.has('tend-sla') && d.byDay?.length) {
    lines.push('=== TENDENCIA DE INCIDENTES Y SLA ===')
    lines.push(csvRow('Fecha', 'Total incidentes', 'Resueltos'))
    for (const r of d.byDay) lines.push(csvRow(r.dia, r.total, r.resueltos))
    lines.push('')
  }

  if (secciones.has('imp-prov') && d.mttrProveedor?.length) {
    lines.push('=== IMPACTO POR PROVEEDOR ===')
    lines.push(csvRow('Proveedor', 'Total incidentes', 'MTTR promedio (min)'))
    for (const r of d.mttrProveedor) lines.push(csvRow(r.nombre, r.total, r.mttr_avg))
    lines.push('')
  }

  if (secciones.has('tiendas-crit') && d.topTiendas?.length) {
    lines.push('=== TIENDAS CRÍTICAS (TOP 10) ===')
    lines.push(csvRow('Código', 'Nombre', 'Distrito', 'Proveedor', 'Total incidentes', 'MTTR (min)'))
    for (const r of d.topTiendas) lines.push(csvRow(r.codigo, r.nombre, r.distrito, r.proveedor, r.total, r.mttr_avg))
    lines.push('')
  }

  if (secciones.has('dist-tipo') && d.byTipo?.length) {
    lines.push('=== DISTRIBUCIÓN POR TIPO ===')
    lines.push(csvRow('Tipo', 'Descripción', 'Total'))
    for (const r of d.byTipo) lines.push(csvRow(r.tipo, TIPO_LABELS[r.tipo] ?? r.tipo, r.total))
    lines.push('')
  }

  if (secciones.has('sla-prov') && d.slaProveedor?.length) {
    lines.push('=== CUMPLIMIENTO SLA POR PROVEEDOR ===')
    lines.push(csvRow('Proveedor', 'Total incidentes', 'SLA (%)'))
    for (const r of d.slaProveedor) lines.push(csvRow(r.nombre, r.total, r.sla_pct))
    lines.push('')
  }

  if (secciones.has('imp-geo') && d.byZona?.length) {
    lines.push('=== IMPACTO GEOGRÁFICO ===')
    lines.push(csvRow('Zona', 'Total incidentes'))
    for (const r of d.byZona) lines.push(csvRow(r.zona, r.total))
    lines.push('')
  }

  if (secciones.has('sla-6m') && d.slaTendencia?.length) {
    lines.push('=== TENDENCIA SLA ÚLTIMOS 6 MESES ===')
    lines.push(csvRow('Mes', 'Proveedor', 'SLA (%)'))
    for (const r of d.slaTendencia) lines.push(csvRow(r.mes, r.nombre, r.sla_pct))
    lines.push('')
  }

  return lines.join('\r\n')
}

// ── Tiendas CSV (client-side, from /api/tiendas) ──────────────────────────────
async function buildTiendasCsv(proveedor: string): Promise<string> {
  const params = new URLSearchParams()
  if (proveedor && proveedor !== 'Todos') params.set('proveedor', proveedor)
  const res = await fetch(`/api/tiendas${params.toString() ? '?' + params : ''}`)
  if (!res.ok) throw new Error('Error al obtener tiendas')
  const tiendas: any[] = await res.json()
  const lines = [
    csvRow('Código','Nombre CC','Formato','Dirección','Distrito','Provincia','Cluster','Proveedor',
           'Tipo Conexión','CID Servicio','Supervisor','Tiene Contingencia','Costo Mensual'),
  ]
  for (const t of tiendas) {
    lines.push(csvRow(t.codigo, t.nombreCc, t.formato, t.direccion, t.distrito, t.provincia,
      t.cluster, t.proveedorNombre, t.tipoConexion, t.cidServicio, t.supervisorNombre,
      t.tieneContingencia ? 'Sí' : 'No', t.costoMensual))
  }
  return lines.join('\r\n')
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, { bg: string; color: string; label: string }> = {
    LISTO:        { bg: '#EAF3DE', color: '#3B6D11', label: 'Listo' },
    PENDIENTE:    { bg: '#FFF4E0', color: '#854F0B', label: 'Pendiente' },
    PROXIMAMENTE: { bg: '#F1F0FF', color: '#7F77DD', label: 'Próximamente' },
  }
  const s = styles[status]
  return (
    <span style={{ padding: '2px 8px', background: s.bg, color: s.color, borderRadius: '999px', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

function InputLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px', fontWeight: 500 }}>{children}</div>
}

function inputStyle(): React.CSSProperties {
  return { padding: '7px 10px', fontSize: '12px', border: '0.5px solid #e5e7eb', borderRadius: '8px', background: 'white', color: '#0f172a', outline: 'none', width: '100%', boxSizing: 'border-box' }
}

function MsgBanner({ text, tipo }: { text: string; tipo: 'ok' | 'error' | 'info' }) {
  const styles = {
    ok:    { bg: '#EAF3DE', color: '#3B6D11', border: '#C7E3A8' },
    error: { bg: '#FCEBEB', color: '#A32D2D', border: '#FECACA' },
    info:  { bg: '#E6F1FB', color: '#185FA5', border: '#BFDBFE' },
  }
  const s = styles[tipo]
  return (
    <div style={{ padding: '10px 14px', background: s.bg, border: `0.5px solid ${s.border}`, borderRadius: '8px', fontSize: '12px', color: s.color, fontWeight: 500, marginBottom: '12px' }}>
      {text}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ReportesPage() {
  const hoy  = new Date().toISOString().slice(0, 10)
  const primero = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const [fechaInicio, setFechaInicio] = useState(primero)
  const [fechaFin,    setFechaFin]    = useState(hoy)
  const [proveedor,   setProveedor]   = useState('Todos')
  const [estado,      setEstado]      = useState('Todos')
  const [modulo,      setModulo]      = useState<Modulo>('ANALITICO')
  const [formato,     setFormato]     = useState<Formato>('CSV')
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(
    new Set(['kpis','tend-sla','imp-prov','tiendas-crit','dist-tipo','sla-prov','sla-6m'])
  )
  const [msg,       setMsg]       = useState<{ text: string; tipo: 'ok'|'error'|'info' } | null>(null)
  const [generando, setGenerando] = useState(false)

  const seccionesDisp = CATALOG[modulo]
  const selArr = [...seleccionadas]

  function mostrarMsg(text: string, tipo: 'ok'|'error'|'info', dur = 5000) {
    setMsg({ text, tipo })
    setTimeout(() => setMsg(null), dur)
  }

  function cambiarModulo(m: Modulo) {
    setModulo(m)
    setSeleccionadas(new Set())
    setMsg(null)
  }

  function toggleSeccion(id: string) {
    setSeleccionadas(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function seleccionarTodo() {
    setSeleccionadas(new Set(seccionesDisp.filter(s => s.status !== 'PROXIMAMENTE').map(s => s.id)))
  }

  function limpiarSeleccion() { setSeleccionadas(new Set()) }

  function aplicarPlantilla(p: typeof PLANTILLAS[0]) {
    setModulo(p.modulo)
    setFormato(p.formato)
    setSeleccionadas(new Set(p.secciones))
    mostrarMsg(`Plantilla "${p.nombre}" aplicada.`, 'ok', 3000)
  }

  function validar(): string | null {
    if (!fechaInicio)  return 'Fecha inicio es requerida.'
    if (!fechaFin)     return 'Fecha fin es requerida.'
    if (new Date(fechaInicio) > new Date(fechaFin)) return 'Fecha inicio no puede ser mayor a fecha fin.'
    if (seleccionadas.size === 0) return 'Selecciona al menos una sección para generar el reporte.'
    return null
  }

  async function generarReporte() {
    const err = validar()
    if (err) { mostrarMsg(err, 'error'); return }

    if (formato !== 'CSV') {
      mostrarMsg(`Exportación ${formato === 'EXCEL' ? 'Excel' : formato === 'PDF' ? 'PDF' : 'Imagen KPI'} pendiente de implementación.`, 'info')
      return
    }

    // Check if any selected section is actually LISTO
    const listasSeleccionadas = selArr.filter(id => {
      const s = seccionesDisp.find(x => x.id === id)
      return s?.status === 'LISTO'
    })
    if (listasSeleccionadas.length === 0) {
      mostrarMsg('Las secciones seleccionadas aún no están disponibles para exportar (Pendiente / Próximamente).', 'info')
      return
    }

    const hasPendientes = listasSeleccionadas.length < selArr.length
    setGenerando(true)

    try {
      switch (modulo) {
        case 'INCIDENTES': {
          // Server-side CSV via existing export endpoint
          const params = new URLSearchParams({ desde: fechaInicio, hasta: fechaFin })
          if (estado !== 'Todos') params.set('estado', estado)
          window.location.href = `/api/reportes/export?${params}`
          break
        }
        case 'ANALITICO': {
          const csv = await buildAnaliticoCsv(new Set(listasSeleccionadas), fechaInicio, fechaFin)
          if (!csv.trim()) { mostrarMsg('Sin datos en el período seleccionado.', 'info'); break }
          downloadCsv(csv, `netdesk_analitico_${fechaInicio}_${fechaFin}.csv`)
          if (hasPendientes) mostrarMsg(`Secciones exportadas: ${listasSeleccionadas.length}. Algunas secciones seleccionadas aún no están disponibles.`, 'info')
          break
        }
        case 'TIENDAS': {
          const csv = await buildTiendasCsv(proveedor)
          downloadCsv(csv, `netdesk_tiendas_${fechaInicio}_${fechaFin}.csv`)
          break
        }
        default:
          mostrarMsg(`Exportación CSV para módulo ${MODULO_META[modulo].label} pendiente de implementación.`, 'info')
      }
    } catch (e: any) {
      mostrarMsg(`Error al generar el reporte: ${e?.message ?? 'error desconocido'}.`, 'error')
    } finally {
      setGenerando(false)
    }
  }

  const todoSeleccionado = seleccionadas.size > 0 &&
    seleccionadas.size === seccionesDisp.filter(s => s.status !== 'PROXIMAMENTE').length

  const secSelDesc = seleccionadas.size === 0 ? '—'
    : seleccionadas.size === 1 ? '1 sección'
    : `${seleccionadas.size} secciones`

  const fmtLabel: Record<Formato, string> = {
    CSV: 'CSV', EXCEL: 'Excel', PDF: 'PDF', IMAGEN_KPI: 'Imagen KPI',
  }

  return (
    <div style={{ maxWidth: '1200px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: '#0f172a' }}>Reportes</h1>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
            Genera exportaciones personalizadas de operación, análisis e incidentes.
          </div>
        </div>
        <button style={{ padding: '6px 12px', fontSize: '11px', background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ color: '#185FA5', fontWeight: 700 }}>?</span> Guía de uso
        </button>
      </div>

      {msg && <MsgBanner text={msg.text} tipo={msg.tipo} />}

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', padding: '12px 16px', background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: '120px' }}>
          <InputLabel>Fecha inicio</InputLabel>
          <input type="date" style={inputStyle()} value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
        </div>
        <div style={{ minWidth: '120px' }}>
          <InputLabel>Fecha fin</InputLabel>
          <input type="date" style={inputStyle()} value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
        </div>
        <div style={{ minWidth: '120px' }}>
          <InputLabel>Proveedor</InputLabel>
          <select style={inputStyle()} value={proveedor} onChange={e => setProveedor(e.target.value)}>
            {['Todos','BITEL','CLARO','ENTEL','CONVERGIA','MOVISTAR','WIN','OTROS'].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ minWidth: '140px' }}>
          <InputLabel>Estado</InputLabel>
          <select style={inputStyle()} value={estado} onChange={e => setEstado(e.target.value)}>
            {['Todos','Abierto','En gestión','En riesgo SLA','Escalado','Pendiente proveedor','Resuelto','Cancelado'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ minWidth: '130px' }}>
          <InputLabel>Módulo</InputLabel>
          <select style={inputStyle()} value={modulo} onChange={e => cambiarModulo(e.target.value as Modulo)}>
            {(Object.keys(MODULO_META) as Modulo[]).map(m => <option key={m} value={m}>{MODULO_META[m].label}</option>)}
          </select>
        </div>
        <div style={{ minWidth: '120px' }}>
          <InputLabel>Formato</InputLabel>
          <select style={inputStyle()} value={formato} onChange={e => setFormato(e.target.value as Formato)}>
            {(['CSV','EXCEL','PDF','IMAGEN_KPI'] as Formato[]).map(f => <option key={f} value={f}>{fmtLabel[f]}</option>)}
          </select>
        </div>
        <button
          onClick={() => { const err = validar(); if (err) mostrarMsg(err, 'error'); else mostrarMsg('Filtros aplicados.', 'ok', 2000) }}
          style={{ padding: '7px 16px', background: '#185FA5', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
          Aplicar filtros
        </button>
      </div>

      {/* ── Main 3-column grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 296px', gap: '14px', marginBottom: '16px', alignItems: 'stretch' }}>

        {/* Col 1: Module selector + Recent reports */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              1. Selecciona el módulo
            </div>
            {(Object.keys(MODULO_META) as Modulo[]).map(m => (
              <button key={m} onClick={() => cambiarModulo(m)}
                style={{ width: '100%', padding: '9px 12px', marginBottom: '5px', border: modulo === m ? '1.5px solid #185FA5' : '0.5px solid #e5e7eb', borderRadius: '8px', background: modulo === m ? '#E6F1FB' : 'white', textAlign: 'left', cursor: 'pointer', display: 'block' }}>
                <div style={{ fontWeight: 600, fontSize: '12px', color: modulo === m ? '#185FA5' : '#0f172a' }}>
                  {MODULO_META[m].label}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>{MODULO_META[m].desc}</div>
              </button>
            ))}
          </div>

          {/* 7. Reportes recientes */}
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '14px', flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              7. Reportes recientes
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: '6px' }}>
              <div style={{ fontSize: '20px', opacity: 0.3 }}>📄</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>Sin reportes generados aún</div>
              <div style={{ fontSize: '10px', color: '#cbd5e1', textAlign: 'center' }}>Los reportes exportados aparecerán aquí</div>
            </div>
            <div style={{ fontSize: '9px', color: '#cbd5e1', textAlign: 'center', marginTop: '4px' }}>
              Historial — próximamente disponible
            </div>
          </div>
        </div>

        {/* Col 2: Section checkboxes */}
        <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              2. Selecciona las secciones a incluir
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', cursor: 'pointer', color: '#0f172a', userSelect: 'none' }}>
              <input type="checkbox" checked={todoSeleccionado}
                onChange={e => e.target.checked ? seleccionarTodo() : limpiarSeleccion()} />
              Seleccionar todo
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {seccionesDisp.map(sec => {
              const seleccionada = seleccionadas.has(sec.id)
              const deshabilitada = sec.status === 'PROXIMAMENTE'
              return (
                <div key={sec.id}
                  onClick={() => !deshabilitada && toggleSeccion(sec.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', border: `0.5px solid ${seleccionada ? '#185FA5' : '#e5e7eb'}`, borderRadius: '8px', background: seleccionada ? '#F0F7FF' : 'white', cursor: deshabilitada ? 'default' : 'pointer', opacity: deshabilitada ? 0.55 : 1 }}>
                  <input type="checkbox" checked={seleccionada} readOnly disabled={deshabilitada}
                    style={{ cursor: deshabilitada ? 'default' : 'pointer', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>{sec.label}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>{sec.desc}</div>
                  </div>
                  <StatusBadge status={sec.status} />
                </div>
              )
            })}
          </div>

          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '10px' }}>
            {seleccionadas.size} de {seccionesDisp.filter(s => s.status !== 'PROXIMAMENTE').length} secciones seleccionadas
          </div>
        </div>

        {/* Col 3: Summary + Export */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* 3. Summary card */}
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              3. Resumen del reporte
            </div>
            {([
              ['Rango de fechas:', `${fechaInicio.split('-').reverse().join('/')} - ${fechaFin.split('-').reverse().join('/')}`],
              ['Proveedor:', proveedor],
              ['Estado:', estado],
              ['Módulo:', MODULO_META[modulo].label],
              ['Formato:', fmtLabel[formato]],
              ['Secciones selec.:', secSelDesc],
              ['Registros estim.:', seleccionadas.size > 0 ? '~ pendiente' : '—'],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '5px', fontSize: '11px' }}>
                <span style={{ color: '#64748b', flexShrink: 0 }}>{label}</span>
                <span style={{ fontWeight: 500, color: '#0f172a', textAlign: 'right' }}>{value}</span>
              </div>
            ))}
            <div style={{ marginTop: '8px', padding: '4px 10px', background: seleccionadas.size > 0 ? '#EAF3DE' : '#F8F9FA', borderRadius: '6px', fontSize: '10px', fontWeight: 600, color: seleccionadas.size > 0 ? '#3B6D11' : '#64748b', textAlign: 'center' }}>
              {seleccionadas.size > 0 ? '✓ Listo para generar' : 'Selecciona secciones'}
            </div>
          </div>

          {/* 4. Export format + Generate */}
          <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              4. Exportar en formato
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px', marginBottom: '12px' }}>
              {([
                { fmt: 'CSV'        as Formato, label: 'CSV',        sub: 'Listo',        color: '#1D9E75', bg: '#EAF3DE' },
                { fmt: 'EXCEL'      as Formato, label: 'Excel',      sub: 'Listo',        color: '#185FA5', bg: '#E6F1FB' },
                { fmt: 'PDF'        as Formato, label: 'PDF',        sub: 'Próximamente', color: '#A32D2D', bg: '#FCEBEB' },
                { fmt: 'IMAGEN_KPI' as Formato, label: 'Imagen KPI', sub: 'Próximamente', color: '#854F0B', bg: '#FAEEDA' },
              ]).map(({ fmt, label, sub, color, bg }) => (
                <button key={fmt} onClick={() => setFormato(fmt)}
                  style={{ padding: '8px 6px', border: formato === fmt ? `2px solid ${color}` : '0.5px solid #e5e7eb', borderRadius: '8px', background: formato === fmt ? bg : 'white', cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '12px', color: formato === fmt ? color : '#0f172a' }}>{label}</div>
                  <div style={{ fontSize: '9px', color: formato === fmt ? color : '#94a3b8', marginTop: '2px' }}>{sub}</div>
                </button>
              ))}
            </div>

            <button onClick={generarReporte} disabled={generando}
              style={{ width: '100%', padding: '10px', background: generando ? '#93c5fd' : '#185FA5', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: generando ? 'default' : 'pointer', marginBottom: '8px' }}>
              {generando ? 'Generando...' : '↓ Generar reporte'}
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button onClick={() => document.getElementById('preview-section')?.scrollIntoView({ behavior: 'smooth' })}
                style={{ padding: '7px', background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', color: '#185FA5' }}>
                Vista previa
              </button>
              <button onClick={limpiarSeleccion}
                style={{ padding: '7px', background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', color: '#A32D2D' }}>
                Limpiar selección
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── Bottom 2-column grid (5 + 6) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '0' }}>

        {/* 5. Quick templates */}
        <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            5. Plantillas rápidas
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {PLANTILLAS.map(p => (
              <button key={p.id} onClick={() => aplicarPlantilla(p)}
                style={{ padding: '10px 12px', background: p.bg, border: `0.5px solid ${p.color}40`, borderRadius: '10px', textAlign: 'left', cursor: 'pointer', display: 'block' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: p.color, marginBottom: '3px' }}>{p.nombre}</div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>{p.desc}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '10px' }}>
            Al seleccionar una plantilla se aplicarán los filtros y secciones recomendadas.
          </div>
        </div>

        {/* 6. Content preview table */}
        <div id="preview-section" style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            6. Vista previa del contenido
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Sección','Tipo de dato','Registros','Formato','Estado'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '10px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selArr.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
                      Selecciona secciones para ver la vista previa
                    </td>
                  </tr>
                )}
                {selArr.map(id => {
                  const sec = seccionesDisp.find(s => s.id === id)
                  if (!sec) return null
                  return (
                    <tr key={id} style={{ borderTop: '0.5px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 500, color: '#0f172a' }}>{sec.label}</td>
                      <td style={{ padding: '6px 8px', color: '#64748b' }}>{sec.tipoDato}</td>
                      <td style={{ padding: '6px 8px', color: '#64748b' }}>{sec.registros}</td>
                      <td style={{ padding: '6px 8px', color: '#64748b' }}>{sec.formatos}</td>
                      <td style={{ padding: '6px 8px' }}><StatusBadge status={sec.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {selArr.length > 0 && (
            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '0.5px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b' }}>
              <span>Total estimado de registros</span>
              <span style={{ fontWeight: 600 }}>— pendiente de calcular</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
