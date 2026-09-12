'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import RoutersContingenciaTI from './RoutersCont'
import { apiMutate } from '@/lib/api-mutate'
import { can } from '@/lib/permisos'

export type PeriodoLista = '30d' | '3m' | '6m' | 'anio' | 'custom'

export const PERIODO_OPCIONES: { key: PeriodoLista; label: string }[] = [
  { key: '30d',  label: '30 días' },
  { key: '3m',   label: '3 meses' },
  { key: '6m',   label: '6 meses' },
  { key: 'anio', label: 'Año' },
]

/** Traduce el preset elegido a las fechas YYYY-MM-DD que espera el endpoint.
 *  Se calcula en hora Lima (UTC-5) para que "hoy" no se corra de día entre las
 *  19:00 y la medianoche, cuando en UTC ya es el día siguiente — ver CLAUDE.md.
 *  Exportada para test. */
export function rangoDePeriodo(
  periodo: PeriodoLista,
  desdeCustom: string,
  hastaCustom: string,
  ahoraMs: number = Date.now(),
): { desde: string; hasta: string } {
  if (periodo === 'custom') return { desde: desdeCustom, hasta: hastaCustom }

  const diaLima = (ms: number) => new Date(ms - 5 * 3600000).toISOString().slice(0, 10)
  const hasta = diaLima(ahoraMs)

  if (periodo === '30d') return { desde: diaLima(ahoraMs - 30 * 24 * 3600000), hasta }

  const meses: Record<'3m' | '6m' | 'anio', number> = { '3m': 3, '6m': 6, anio: 12 }
  const d = new Date(ahoraMs - 5 * 3600000)
  // Se retrocede el mes con el día en 1 y recién después se repone el día,
  // acotado al último del mes destino: restarle 3 meses a un 31 de mayo con
  // setUTCMonth a secas cae en "31 de febrero" y JS lo corre a marzo.
  const dia = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - meses[periodo])
  const ultimoDelMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dia, ultimoDelMes))
  return { desde: d.toISOString().slice(0, 10), hasta }
}

const PROVEEDOR_COLORS: Record<string, { bg: string; color: string }> = {
  BITEL:             { bg: 'var(--info-bg)', color: 'var(--info)' },
  CLARO:             { bg: 'var(--danger-bg)', color: 'var(--danger)' },
  CONVERGIA:         { bg: 'var(--purple-bg)', color: 'var(--purple)' },
  ENTEL:             { bg: 'var(--ok-bg)', color: 'var(--ok)' },
  MOVISTAR:          { bg: 'var(--info-bg)', color: 'var(--info)' },
  GTD:               { bg: 'var(--warn-bg)', color: 'var(--warn)' },
  'GTD PERU':        { bg: 'var(--warn-bg)', color: 'var(--warn)' },
  FIBERLUX:          { bg: 'var(--warn-bg)', color: 'var(--warn)' },
  FIBERTEL:          { bg: 'var(--warn-bg)', color: 'var(--warn)' },
  'FIBRA AMAZÓNICA': { bg: 'var(--ok-bg)', color: 'var(--ok)' },
  DITSAC:            { bg: 'var(--danger-bg)', color: 'var(--danger)' },
  'DIT SAC':         { bg: 'var(--danger-bg)', color: 'var(--danger)' },
  TELCONET:          { bg: 'var(--info-bg)', color: 'var(--info)' },
  GONET:             { bg: 'var(--ok-bg)', color: 'var(--ok)' },
  AMERICATEL:        { bg: 'var(--info-bg)', color: 'var(--purple)' },
  WIN:               { bg: 'var(--ok-bg)', color: 'var(--ok)' },
}

function provColor(nombre: string | null) {
  if (!nombre) return { bg: 'var(--muted-foreground)', color: 'var(--muted-foreground)' }
  const key = nombre.toUpperCase()
  return PROVEEDOR_COLORS[key] ?? { bg: 'var(--surface-2)', color: 'var(--muted-foreground)' }
}


function relTime(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

const CAMPO_LABELS: Record<string, string> = {
  celularTienda: 'Celular tienda',
  nombreCc: 'Nombre CC', direccion: 'Dirección', distrito: 'Distrito',
  provincia: 'Provincia', cluster: 'Cluster', supervisorNombre: 'Supervisor',
  supervisorCelular: 'Celular supervisor', perfilSupervisor: 'Clasificación',
  tipoConexion: 'Tipo conexión', tipoServicio: 'Tipo servicio',
  cidServicio: 'CID', tieneContingencia: 'Tiene contingencia', contingenciaActiva: 'Contingencia activa',
  contingenciaDescripcion: 'Desc. contingencia', contingenciaChip: 'Chip contingencia',
  contingenciaPaquete: 'Paquete contingencia', costoMensual: 'Costo mensual',
  instruccionReporte: 'Instrucción específica', contactoSoporte: 'Contacto soporte',
  administradorNombre: 'Admin nombre', administradorEmail: 'Email',
  administradorCelular: 'Admin celular', proveedorId: 'Proveedor',
  ventaHoraSoles: 'Venta/hora S/.', formato: 'Formato', extras: 'Extras',
}

const BLANK = {
  codigo: '', nombreCc: '', formato: '', direccion: '', referencia: '',
  distrito: '', provincia: '', ubicacion: '', cluster: '',
  supervisorNombre: '', proveedorId: '', tieneContingencia: false,
  instruccionReporte: '', contactoSoporte: '', administradorNombre: '',
  administradorEmail: '', administradorCelular: '',
}

function inp(): React.CSSProperties {
  return {
    width: '100%', padding: '6px 9px', fontSize: '12px',
    border: '1px solid var(--border)', borderRadius: '7px',
    background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box',
  }
}

const PAGE_SIZE = 50


export default function TiendasPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const canEdit = can(session, 'mantenimiento.editar')
  const canBaja = can(session, 'mantenimiento.eliminar')

  const [tiendas, setTiendas] = useState<any[]>([])
  const [allProveedores, setAllProveedores] = useState<{ id: string; nombre: string }[]>([])
  const [filtros, setFiltros] = useState({ q: '', proveedor: '', cluster: '', sort: '', supervisor: '', estado: '' })
  // Período del listado (incidentes + IEI). El default de 30 días replica lo
  // que mostraba la columna fija anterior, para que nadie note el cambio.
  const [periodo, setPeriodo] = useState<PeriodoLista>('30d')
  const [periodoDesde, setPeriodoDesde] = useState('')
  const [periodoHasta, setPeriodoHasta] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<{ open: boolean; data: any }>({ open: false, data: BLANK })
  const [saving, setSaving] = useState(false)
  const [historial, setHistorial] = useState<any[]>([])
  const [showHistorial, setShowHistorial] = useState(false)
  const [loadingHist, setLoadingHist] = useState(false)
  const [sinProveedorPanel, setSinProveedorPanel] = useState(false)
  const [exportingMaestro, setExportingMaestro] = useState(false)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; codigo: string; step: 1 | 2 } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [tab, setTab] = useState<'tiendas' | 'routers'>('tiendas')
  const [verArchivadas, setVerArchivadas] = useState(false)
  const [archivadaDesde, setArchivadaDesde] = useState('')
  const [archivadaHasta, setArchivadaHasta] = useState('')
  const [bajaModal, setBajaModal] = useState<{ id: string; codigo: string; motivo: string; error: string } | null>(null)
  const [bajaSaving, setBajaSaving] = useState(false)

  // Rango efectivo del listado: null en 30d para dejar que el backend aplique
  // su default y no discrepar con el "hoy" del navegador.
  const paramsPeriodo = useCallback(() => {
    if (periodo === '30d') return null
    const { desde, hasta } = rangoDePeriodo(periodo, periodoDesde, periodoHasta)
    return desde && hasta ? { desde, hasta } : null
  }, [periodo, periodoDesde, periodoHasta])

  async function downloadMaestro() {
    setExportingMaestro(true)
    try {
      // El CSV sale con el mismo período que la pantalla, si no las dos
      // columnas nuevas contradirían lo que el usuario está viendo.
      const qs = new URLSearchParams()
      const rango = paramsPeriodo()
      if (rango) { qs.set('desde', rango.desde); qs.set('hasta', rango.hasta) }
      const res = await fetch(`/api/tiendas/export${qs.toString() ? `?${qs}` : ''}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : 'netdesk_maestro_tiendas.csv'
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: filename })
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setExportingMaestro(false)
    }
  }

  const fetchTiendas = useCallback(async () => {
    const params = new URLSearchParams()
    if (filtros.proveedor)  params.set('proveedor', filtros.proveedor)
    if (filtros.cluster)    params.set('cluster', filtros.cluster)
    if (filtros.supervisor) params.set('supervisor', filtros.supervisor)
    params.set('estado', verArchivadas ? 'ARCHIVADA' : 'ACTIVA')
    if (verArchivadas && archivadaDesde) params.set('archivadaDesde', archivadaDesde)
    if (verArchivadas && archivadaHasta) params.set('archivadaHasta', archivadaHasta)
    const rango = paramsPeriodo()
    if (rango) { params.set('desde', rango.desde); params.set('hasta', rango.hasta) }
    const res = await fetch(`/api/tiendas?${params}`)
    if (!res.ok) return
    const data = await res.json()
    if (!Array.isArray(data)) return
    setTiendas(data)
  }, [filtros.proveedor, filtros.cluster, filtros.supervisor, verArchivadas, archivadaDesde, archivadaHasta, paramsPeriodo])

  useEffect(() => { fetchTiendas() }, [fetchTiendas])

  useEffect(() => {
    fetch('/api/proveedores').then(r => r.json()).then(d => {
      setAllProveedores(Array.isArray(d) ? d.sort((a: any, b: any) => a.nombre.localeCompare(b.nombre)) : [])
    })
  }, [])

  async function openHistorial() {
    setShowHistorial(true)
    setLoadingHist(true)
    const res = await fetch('/api/tiendas/historial')
    const data = await res.json()
    setHistorial(Array.isArray(data) ? data : [])
    setLoadingHist(false)
  }

  async function handleSave() {
    setSaving(true)
    const body = {
      ...modal.data,
      tieneContingencia: !!modal.data.tieneContingencia,
      cluster: modal.data.cluster || null,
      proveedorId: modal.data.proveedorId || null,
    }
    const { ok } = await apiMutate('/api/tiendas', { method: 'POST', json: body, errorPrefix: 'No se pudo crear la tienda' })
    setSaving(false)
    if (!ok) return
    setModal(m => ({ ...m, open: false }))
    fetchTiendas()
  }

  function setField(k: string, v: any) { setModal(m => ({ ...m, data: { ...m.data, [k]: v } })) }

  async function handleDelete(id: string) {
    setDeleting(true)
    const res = await fetch(`/api/tiendas/${id}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) {
      setDeleteConfirm(null)
      fetchTiendas()
    } else {
      const err = await res.json()
      alert(err.error ?? 'Error al eliminar')
      setDeleteConfirm(null)
    }
  }

  async function handleBaja() {
    if (!bajaModal) return
    if (!bajaModal.motivo.trim()) {
      setBajaModal(m => m ? { ...m, error: 'El motivo es obligatorio' } : m)
      return
    }
    setBajaSaving(true)
    const res = await fetch(`/api/tiendas/${bajaModal.id}/baja`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: bajaModal.motivo.trim() }),
    })
    setBajaSaving(false)
    if (res.ok) {
      setBajaModal(null)
      fetchTiendas()
    } else {
      const err = await res.json().catch(() => ({}))
      setBajaModal(m => m ? { ...m, error: err.error ?? 'No se pudo dar de baja la tienda' } : m)
    }
  }

  const supervisores = Array.from(new Set(tiendas.map(t => t.supervisorNombre).filter(Boolean))).sort()
  let filtered = tiendas.filter(t => {
    if (filtros.q) {
      const q = filtros.q.toLowerCase()
      if (
        !t.codigo?.toLowerCase().includes(q) &&
        !t.nombreCc?.toLowerCase().includes(q) &&
        !t.distrito?.toLowerCase().includes(q) &&
        !t.supervisorNombre?.toLowerCase().includes(q)
      ) return false
    }
    if (filtros.estado) {
      const estado = t.estadoServicio ?? 'ACTIVO'
      if (estado !== filtros.estado) return false
    }
    return true
  })

  function esCatalogo(t: any) {
    return (
      /-C$/i.test(t.codigo ?? '') ||
      t.nombreCc?.toLowerCase().includes('catalogo') ||
      t.formato?.toLowerCase().includes('catalogo') ||
      t.distrito?.toLowerCase().includes('catalogo')
    )
  }

  filtered = [...filtered].sort((a, b) => {
    const aCat = esCatalogo(a) ? 1 : 0
    const bCat = esCatalogo(b) ? 1 : 0
    if (aCat !== bCat) return aCat - bCat
    if (filtros.sort === 'incidentes') {
      return (Number(b.incidentCount) || 0) - (Number(a.incidentCount) || 0)
    }
    if (filtros.sort === 'iei') {
      // null (sin venta configurada) va al final: no es "costó 0", es "no se sabe".
      const av = a.ieiPeriodo == null ? -1 : Number(a.ieiPeriodo)
      const bv = b.ieiPeriodo == null ? -1 : Number(b.ieiPeriodo)
      return bv - av
    }
    return 0
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalContingencia = tiendas.filter(t => t.contingenciaActiva).length
  const totalIncidentesPeriodo = tiendas.reduce((sum, t) => sum + (Number(t.incidentCount) || 0), 0)
  const totalIeiPeriodo = tiendas.reduce((sum, t) => sum + (t.ieiPeriodo == null ? 0 : Number(t.ieiPeriodo)), 0)
  const etiquetaPeriodo =
    periodo === 'custom'
      ? (periodoDesde && periodoHasta ? `${periodoDesde} a ${periodoHasta}` : 'últimos 30 días')
      : (PERIODO_OPCIONES.find(p => p.key === periodo)?.label ?? '30 días').toLowerCase()
  const sinProveedor = tiendas.filter(t => !t.proveedorId)
  const totalActivo = tiendas.filter(t => !t.estadoServicio || t.estadoServicio === 'ACTIVO').length
  const totalInactivo = tiendas.filter(t => t.estadoServicio === 'INACTIVO').length

  const thStyle: React.CSSProperties = {
    padding: '9px 12px', fontSize: '10px', fontWeight: 700,
    color: 'var(--muted-foreground)', textTransform: 'uppercase',
    letterSpacing: '0.06em', textAlign: 'left',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
    background: 'var(--muted)',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--muted)', borderRadius: '10px', padding: '4px', width: 'fit-content' }}>
            {(['tiendas', 'routers'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: '6px 16px', fontSize: '12px', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: tab === t ? 600 : 400, background: tab === t ? 'var(--gradient-primary)' : 'transparent', color: tab === t ? 'white' : 'var(--foreground)', whiteSpace: 'nowrap' }}>
                {t === 'tiendas' ? 'Tiendas' : 'Routers Contingencia TI'}
              </button>
            ))}
          </div>
          {tab === 'tiendas' && (
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
              {filtered.length} de {tiendas.length} tiendas
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={downloadMaestro} disabled={exportingMaestro}
            style={{ padding: '7px 12px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: exportingMaestro ? 'not-allowed' : 'pointer', color: exportingMaestro ? 'var(--muted-foreground)' : 'var(--foreground)' }}>
            {exportingMaestro ? 'Generando...' : '↓ Exportar CSV'}
          </button>
          <button onClick={openHistorial}
            style={{ padding: '7px 12px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
            Historial
          </button>
          <button onClick={() => { setVerArchivadas(v => !v); setPage(1) }}
            title="Las tiendas dadas de baja no se borran, quedan archivadas"
            style={{ padding: '7px 12px', background: verArchivadas ? 'var(--surface-2)' : 'var(--muted)', border: verArchivadas ? '1px solid var(--border)' : '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: verArchivadas ? 'var(--muted-foreground)' : 'var(--foreground)', fontWeight: verArchivadas ? 600 : 400 }}>
            {verArchivadas ? '✓ Viendo archivadas' : 'Ver archivadas'}
          </button>
          {canEdit && (
            <button onClick={() => setModal({ open: true, data: { ...BLANK } })}
              style={{ padding: '7px 14px', background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
              + Nueva tienda
            </button>
          )}
        </div>
      </div>

      {tab === 'routers' && <RoutersContingenciaTI />}

      {tab === 'tiendas' && <>
      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', marginBottom: '16px' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#3b82f6' }}>{tiendas.length}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Total tiendas</div>
        </div>
        <div
          onClick={() => { setFiltros(f => ({ ...f, estado: f.estado === 'ACTIVO' ? '' : 'ACTIVO' })); setPage(1) }}
          style={{ background: filtros.estado === 'ACTIVO' ? 'var(--ok-bg)' : 'var(--card)', border: filtros.estado === 'ACTIVO' ? '1px solid var(--ok-border)' : '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', cursor: 'pointer' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ok)' }}>{totalActivo}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Activas</div>
        </div>
        <div
          onClick={() => { setFiltros(f => ({ ...f, estado: f.estado === 'INACTIVO' ? '' : 'INACTIVO' })); setPage(1) }}
          style={{ background: filtros.estado === 'INACTIVO' ? 'var(--surface-2)' : 'var(--card)', border: filtros.estado === 'INACTIVO' ? '1px solid var(--border)' : '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', cursor: 'pointer' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--muted-foreground)' }}>{totalInactivo}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Inactivas</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--warn)' }}>{totalContingencia}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Contingencia activa</div>
        </div>
        <div
          onClick={() => sinProveedor.length > 0 && setSinProveedorPanel(v => !v)}
          style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', cursor: sinProveedor.length > 0 ? 'pointer' : 'default' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: sinProveedor.length > 0 ? 'var(--purple)' : 'var(--muted-foreground)' }}>{sinProveedor.length}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Sin proveedor</div>
        </div>
      </div>

      {/* Sin proveedor panel */}
      {sinProveedorPanel && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--purple-border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--purple)' }}>Sin proveedor asignado ({sinProveedor.length})</div>
            <button onClick={() => setSinProveedorPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--muted-foreground)' }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {sinProveedor.map(t => (
              <span key={t.id} onClick={() => router.push(`/tiendas/${t.id}`)}
                style={{ fontSize: '11px', padding: '3px 8px', background: 'var(--muted)', borderRadius: '5px', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 600 }}>
                {t.codigo}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Período — manda sobre las columnas Incidentes e IEI */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 600 }}>Período</span>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--muted)', borderRadius: '9px', padding: '3px' }}>
          {PERIODO_OPCIONES.map(p => (
            <button key={p.key} onClick={() => { setPeriodo(p.key); setPage(1) }}
              style={{ padding: '5px 12px', fontSize: '11px', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: periodo === p.key ? 600 : 400, background: periodo === p.key ? 'var(--gradient-primary)' : 'transparent', color: periodo === p.key ? 'white' : 'var(--foreground)', whiteSpace: 'nowrap' }}>
              {p.label}
            </button>
          ))}
          <button onClick={() => { setPeriodo('custom'); setPage(1) }}
            style={{ padding: '5px 12px', fontSize: '11px', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: periodo === 'custom' ? 600 : 400, background: periodo === 'custom' ? 'var(--gradient-primary)' : 'transparent', color: periodo === 'custom' ? 'white' : 'var(--foreground)', whiteSpace: 'nowrap' }}>
            Personalizado ▾
          </button>
        </div>
        {periodo === 'custom' && (
          <>
            <input type="date" value={periodoDesde} onChange={e => { setPeriodoDesde(e.target.value); setPage(1) }}
              style={{ padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)' }} />
            <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>a</span>
            <input type="date" value={periodoHasta} onChange={e => { setPeriodoHasta(e.target.value); setPage(1) }}
              style={{ padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)' }} />
            {!(periodoDesde && periodoHasta) && (
              <span style={{ fontSize: '11px', color: 'var(--warn)' }}>Elegí ambas fechas — mientras tanto se muestran los últimos 30 días</span>
            )}
          </>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <input
          placeholder="Buscar código, nombre, distrito, supervisor..."
          value={filtros.q}
          onChange={e => { setFiltros(f => ({ ...f, q: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', minWidth: '240px' }}
        />
        <select value={filtros.proveedor} onChange={e => { setFiltros(f => ({ ...f, proveedor: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {/* Sale del padrón completo de proveedores, no de las tiendas ya
              filtradas: derivarlo de la lista visible dejaba una sola opción
              apenas se elegía un proveedor, y no había forma de cambiar a otro
              sin volver antes a "Todos". El backend filtra por nombre. */}
          {allProveedores.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <select value={filtros.cluster} onChange={e => { setFiltros(f => ({ ...f, cluster: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los clusters</option>
          {['A', 'B', 'C', 'D'].map(c => <option key={c} value={c}>Cluster {c}</option>)}
        </select>
        <select value={filtros.supervisor} onChange={e => { setFiltros(f => ({ ...f, supervisor: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los supervisores</option>
          {supervisores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filtros.estado} onChange={e => { setFiltros(f => ({ ...f, estado: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Activo</option>
          <option value="INACTIVO">Inactivo</option>
        </select>
        <select value={filtros.sort} onChange={e => { setFiltros(f => ({ ...f, sort: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Ordenar: Código</option>
          <option value="incidentes">Ordenar: Mayor incidentes</option>
          <option value="iei">Ordenar: Mayor IEI</option>
        </select>
        {verArchivadas && (
          <>
            <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Baja desde
              <input type="date" value={archivadaDesde} onChange={e => { setArchivadaDesde(e.target.value); setPage(1) }}
                style={{ padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)' }} />
            </label>
            <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              hasta
              <input type="date" value={archivadaHasta} onChange={e => { setArchivadaHasta(e.target.value); setPage(1) }}
                style={{ padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)' }} />
            </label>
          </>
        )}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '1080px', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Código</th>
              <th style={thStyle}>Nombre CC</th>
              <th style={thStyle}>Proveedor</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Cluster</th>
              <th style={thStyle}>Conexión</th>
              <th style={thStyle}>Distrito</th>
              <th style={thStyle}>Supervisor</th>
              <th style={thStyle}>Estado</th>
              <th style={{ ...thStyle, textAlign: 'center' }} title={`Incidentes del período: ${etiquetaPeriodo}`}>Incidentes</th>
              <th style={{ ...thStyle, textAlign: 'right' }} title={`Impacto económico del período: ${etiquetaPeriodo}`}>IEI (S/)</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(t => {
              const prov = provColor(t.proveedorNombre)
              const isInactive = t.estadoServicio === 'INACTIVO'
              const isArchived = t.estado === 'ARCHIVADA'
              const isHovered = hoveredRow === t.id
              return (
                <tr
                  key={t.id}
                  onClick={() => router.push(`/tiendas/${t.id}`)}
                  onMouseEnter={() => setHoveredRow(t.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    cursor: 'pointer',
                    background: isHovered
                      ? 'var(--muted)'
                      : t.contingenciaActiva
                      ? 'rgba(245,158,11,0.05)'
                      : 'transparent',
                    borderBottom: '1px solid var(--border)',
                    opacity: isArchived ? 0.5 : isInactive ? 0.55 : 1,
                    filter: isArchived ? 'grayscale(1)' : undefined,
                    borderLeft: t.contingenciaActiva ? '3px solid var(--warn-border)' : '3px solid transparent',
                  }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
                    {t.codigo}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--foreground)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.nombreCc || <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {t.proveedorNombre ? (
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: prov.bg, color: prov.color, whiteSpace: 'nowrap' }}>
                        {t.proveedorNombre}
                      </span>
                    ) : (
                      <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: t.cluster ? 'var(--foreground)' : 'var(--muted-foreground)', textAlign: 'center' }}>
                    {t.cluster || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                    {t.tipoConexion || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--foreground)', whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.distrito || <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--muted-foreground)', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.supervisorNombre || '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {isArchived ? (
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--surface-2)', color: 'var(--muted-foreground)', fontWeight: 600 }}>ARCHIVADA</span>
                    ) : isInactive ? (
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--surface-2)', color: 'var(--muted-foreground)', fontWeight: 600 }}>INACTIVO</span>
                    ) : (
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--ok-bg)', color: 'var(--ok)', fontWeight: 600 }}>ACTIVO</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'center', color: Number(t.incidentCount) > 0 ? 'var(--danger)' : 'var(--muted-foreground)', fontWeight: Number(t.incidentCount) > 0 ? 600 : 400 }}>
                    {Number(t.incidentCount) || 0}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {t.ieiPeriodo == null ? (
                      // Mismo aviso que la ficha: sin venta configurada el IEI no
                      // se puede calcular — no es "costó S/ 0".
                      <span title="Sin venta configurada — el IEI no se puede calcular para esta tienda"
                        style={{ color: 'var(--warn)', fontSize: '10px', background: 'var(--warn-bg)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                        sin venta
                      </span>
                    ) : (
                      <span style={{ color: Number(t.ieiPeriodo) > 0 ? 'var(--foreground)' : 'var(--muted-foreground)', fontWeight: Number(t.ieiPeriodo) > 0 ? 600 : 400 }}>
                        {Number(t.ieiPeriodo).toLocaleString('es-PE')}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    {isArchived ? (
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
                        Baja: {t.archivadaEn ? new Date(t.archivadaEn).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : '—'}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                        {t.contingenciaActiva && (
                          <span style={{ fontSize: '10px', background: 'var(--warn-bg)', color: 'var(--warn)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>⚠</span>
                        )}
                        {canBaja && (
                          <button
                            onClick={e => { e.stopPropagation(); setBajaModal({ id: t.id, codigo: t.codigo, motivo: '', error: '' }) }}
                            title="Dar de baja"
                            style={{ background: 'none', border: '1px solid transparent', borderRadius: '5px', padding: '2px 5px', cursor: 'pointer', fontSize: '12px', color: 'var(--muted-foreground)', lineHeight: 1, transition: 'color 0.1s, border-color 0.1s' }}
                            onMouseEnter={e => { const b = e.currentTarget; b.style.color = 'var(--danger)'; b.style.borderColor = 'var(--danger)' }}
                            onMouseLeave={e => { const b = e.currentTarget; b.style.color = 'var(--muted-foreground)'; b.style.borderColor = 'transparent' }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: '40px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
                  No se encontraron tiendas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer: summary + pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
        <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
          {totalIncidentesPeriodo > 0 &&
            `${totalIncidentesPeriodo} incidentes · S/ ${totalIeiPeriodo.toLocaleString('es-PE')} de impacto (${etiquetaPeriodo})`}
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '5px 12px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>
              ← Anterior
            </button>
            <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
              {page} / {totalPages} · {filtered.length} tiendas
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: '5px 12px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {/* Historial slide-in */}
      {showHistorial && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={() => setShowHistorial(false)}>
          <div
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '380px', background: 'var(--card)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Historial de cambios</div>
              <button onClick={() => setShowHistorial(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {loadingHist && <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', marginTop: '20px' }}>Cargando...</div>}
              {!loadingHist && historial.length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', marginTop: '20px' }}>Sin cambios registrados</div>
              )}
              {historial.map(h => (
                <div key={h.id} style={{ marginBottom: '10px', padding: '10px', background: 'var(--muted)', borderRadius: '8px', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 700 }}>{h.tiendaCodigo}</span>
                    <span style={{ color: 'var(--muted-foreground)' }}>{relTime(h.editadoEn)}</span>
                  </div>
                  <div style={{ fontWeight: 500, color: 'var(--foreground)', marginBottom: '2px' }}>
                    {CAMPO_LABELS[h.campoEditado] ?? h.campoEditado}
                  </div>
                  <div style={{ color: 'var(--muted-foreground)', display: 'flex', gap: '4px', flexWrap: 'wrap', fontSize: '10px' }}>
                    {h.valorAnterior && <span style={{ textDecoration: 'line-through' }}>{h.valorAnterior}</span>}
                    {h.valorAnterior && h.valorNuevo && <span>→</span>}
                    {h.valorNuevo && <span style={{ color: 'var(--foreground)' }}>{h.valorNuevo}</span>}
                  </div>
                  {h.usuarioNombre && <div style={{ marginTop: '4px', color: 'var(--muted-foreground)', fontSize: '10px' }}>por {h.usuarioNombre}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,7,20,0.72)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '22px 24px' }}>
            {deleteConfirm.step === 1 ? (
              <>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Eliminar tienda (solo errores de carga)</div>
                <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '22px' }}>
                  Este camino es distinto de "Dar de baja" y mucho más angosto: solo funciona si <strong style={{ color: 'var(--foreground)' }}>{deleteConfirm.codigo}</strong> nunca tuvo ninguna ficha de contrato ni ningún incidente registrado — es decir, si se creó por error. Cualquier tienda que ya operó debe darse de baja, no eliminarse.
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setDeleteConfirm(null)}
                    style={{ padding: '8px 16px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
                    Cancelar
                  </button>
                  <button onClick={() => setDeleteConfirm(c => c ? { ...c, step: 2 } : c)}
                    style={{ padding: '8px 16px', background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                    Continuar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--danger)', marginBottom: '6px' }}>Confirmar eliminación</div>
                <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '22px' }}>
                  Esta acción es <strong>permanente</strong> y no queda registro. La tienda <strong style={{ color: 'var(--foreground)' }}>{deleteConfirm.codigo}</strong> y toda su configuración serán eliminadas. Si tiene alguna ficha o incidente, esto va a fallar — usa "Dar de baja" en su lugar.
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setDeleteConfirm(null)}
                    style={{ padding: '8px 16px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
                    Cancelar
                  </button>
                  <button onClick={() => handleDelete(deleteConfirm.id)} disabled={deleting}
                    style={{ padding: '8px 16px', background: 'var(--danger-bg)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}>
                    {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Dar de baja modal */}
      {bajaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,7,20,0.72)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '420px', padding: '22px 24px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Dar de baja</div>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '14px' }}>
              La tienda <strong style={{ color: 'var(--foreground)' }}>{bajaModal.codigo}</strong> quedará archivada, no se borra — sigue disponible en "Ver archivadas" con su historial. Se bloquea si tiene ficha de contrato activa (dar de baja el contrato primero en Gestión de Cambios), un router externo asignado, o incidentes abiertos.
            </div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>
              Motivo (obligatorio)
            </label>
            <textarea
              value={bajaModal.motivo}
              onChange={e => setBajaModal(m => m ? { ...m, motivo: e.target.value, error: '' } : m)}
              placeholder="Ej: local cerrado definitivamente, cierre de operaciones en la zona…"
              rows={3}
              style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '7px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: '10px' }}
            />
            {bajaModal.error && (
              <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: '7px', padding: '8px 12px', fontSize: '12px', color: 'var(--danger)', marginBottom: '14px' }}>
                {bajaModal.error}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => { const b = bajaModal; setBajaModal(null); setDeleteConfirm({ id: b.id, codigo: b.codigo, step: 1 }) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'underline', padding: 0 }}>
                ¿Se creó por error? Eliminar en su lugar
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setBajaModal(null)}
                  style={{ padding: '8px 16px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button onClick={handleBaja} disabled={bajaSaving}
                  style={{ padding: '8px 16px', background: 'var(--danger-bg)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: bajaSaving ? 'not-allowed' : 'pointer', opacity: bajaSaving ? 0.6 : 1 }}>
                  {bajaSaving ? 'Guardando...' : 'Dar de baja'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nueva tienda modal */}
      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,7,20,0.72)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Nueva tienda</div>
              <button onClick={() => setModal(m => ({ ...m, open: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {([
                ['codigo',               'Código *',          'text'],
                ['nombreCc',             'Nombre CC',         'text'],
                ['formato',              'Formato',           'text'],
                ['direccion',            'Dirección',         'text'],
                ['referencia',           'Referencia',        'text'],
                ['distrito',             'Distrito',          'text'],
                ['provincia',            'Provincia',         'text'],
                ['supervisorNombre',     'Supervisor',        'text'],
                ['instruccionReporte',   'Instrucción específica', 'textarea'],
                ['administradorCelular', 'Admin celular',     'text'],
              ] as [string, string, string][]).map(([key, label, type]) => (
                <div key={key} style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>{label}</label>
                  {type === 'textarea'
                    ? <textarea value={modal.data[key] ?? ''} onChange={e => setField(key, e.target.value)} style={{ ...inp(), minHeight: '56px', resize: 'vertical' }} />
                    : <input value={modal.data[key] ?? ''} onChange={e => setField(key, e.target.value)} style={inp()} />
                  }
                </div>
              ))}

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Cluster</label>
                <select value={modal.data.cluster ?? ''} onChange={e => setField('cluster', e.target.value)} style={inp()}>
                  <option value="">Sin cluster</option>
                  {['A', 'B', 'C', 'D'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Proveedor</label>
                <select value={modal.data.proveedorId ?? ''} onChange={e => setField('proveedorId', e.target.value)} style={inp()}>
                  <option value="">Sin proveedor</option>
                  {allProveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button onClick={() => setModal(m => ({ ...m, open: false }))}
                  style={{ padding: '8px 16px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving || !modal.data.codigo}
                  style={{ padding: '8px 16px', background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', opacity: saving || !modal.data.codigo ? 0.6 : 1 }}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  )
}
