'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const PROVEEDOR_COLORS: Record<string, { bg: string; color: string }> = {
  BITEL:             { bg: '#dbeafe', color: '#1e40af' },
  CLARO:             { bg: '#fee2e2', color: '#b91c1c' },
  CONVERGIA:         { bg: '#ede9fe', color: '#7c3aed' },
  ENTEL:             { bg: '#dcfce7', color: '#15803d' },
  MOVISTAR:          { bg: '#1e3a8a', color: '#bfdbfe' },
  GTD:               { bg: '#ffedd5', color: '#c2410c' },
  'GTD PERU':        { bg: '#ffedd5', color: '#c2410c' },
  FIBERLUX:          { bg: '#fef9c3', color: '#854d0e' },
  FIBERTEL:          { bg: '#fef3c7', color: '#713f12' },
  'FIBRA AMAZÓNICA': { bg: '#d1fae5', color: '#065f46' },
  DITSAC:            { bg: '#fce7f3', color: '#9d174d' },
  'DIT SAC':         { bg: '#fce7f3', color: '#9d174d' },
  TELCONET:          { bg: '#e0f2fe', color: '#075985' },
  GONET:             { bg: '#d1fae5', color: '#064e3b' },
  AMERICATEL:        { bg: '#e0e7ff', color: '#3730a3' },
  WIN:               { bg: '#ecfdf5', color: '#047857' },
}

function provColor(nombre: string | null) {
  if (!nombre) return { bg: '#f3f4f6', color: '#6b7280' }
  const key = nombre.toUpperCase()
  return PROVEEDOR_COLORS[key] ?? { bg: '#f3f4f6', color: '#6b7280' }
}

function parseCSVText(text: string) {
  const firstLine = text.trim().split(/\r?\n/)[0] ?? ''
  const sep = firstLine.includes(';') ? ';' : ','
  function parseLine(line: string): string[] {
    const res: string[] = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === sep && !inQ) { res.push(cur.trim()); cur = '' }
      else cur += ch
    }
    res.push(cur.trim())
    return res
  }
  const lines = text.trim().split(/\r?\n/)
  const headers = parseLine(lines[0])
  const rows = lines.slice(1).filter(l => l.trim()).map(l => {
    const vals = parseLine(l)
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
  return { headers, rows }
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
  instruccionReporte: 'I.E.', contactoSoporte: 'Contacto soporte',
  administradorNombre: 'Admin nombre', administradorEmail: 'Email',
  administradorCelular: 'Admin celular', proveedorId: 'Proveedor',
  ventaHoraSoles: 'Venta/hora S/.', formato: 'Formato', extras: 'Extras',
}

const BLANK = {
  codigo: '', nombreCc: '', formato: '', direccion: '', referencia: '',
  distrito: '', provincia: '', ubicacion: '', cluster: '',
  supervisorNombre: '', proveedorId: '', tipoConexion: '',
  tipoServicio: '', cidServicio: '', tieneContingencia: false, costoMensual: '',
  instruccionReporte: '', contactoSoporte: '', administradorNombre: '',
  administradorEmail: '', administradorCelular: '',
}

function inp(): React.CSSProperties {
  return {
    width: '100%', padding: '6px 9px', fontSize: '12px',
    border: '0.5px solid var(--border)', borderRadius: '7px',
    background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box',
  }
}

const PAGE_SIZE = 50

const PREVIEW_COLS = ['codigo', 'nombre_cc', 'proveedor', 'distrito', 'tipo_conexion']

export default function TiendasPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const userRol = (session?.user as any)?.rol ?? 'AGENTE'
  const canEdit = ['SUPERVISOR', 'INFRAESTRUCTURA'].includes(userRol)

  const [tiendas, setTiendas] = useState<any[]>([])
  const [allProveedores, setAllProveedores] = useState<{ id: string; nombre: string }[]>([])
  const [filtros, setFiltros] = useState({ q: '', proveedor: '', cluster: '', sort: '', supervisor: '', estado: '' })
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

  // Import state
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<any[]>([])
  const [importHeaders, setImportHeaders] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function downloadMaestro() {
    setExportingMaestro(true)
    try {
      const res = await fetch('/api/tiendas/export')
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
    const res = await fetch(`/api/tiendas?${params}`)
    if (!res.ok) return
    const data = await res.json()
    if (!Array.isArray(data)) return
    setTiendas(data)
  }, [filtros.proveedor, filtros.cluster, filtros.supervisor])

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
      costoMensual: modal.data.costoMensual || null,
      cluster: modal.data.cluster || null,
      proveedorId: modal.data.proveedorId || null,
    }
    await fetch('/api/tiendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    setModal(m => ({ ...m, open: false }))
    fetchTiendas()
  }

  function setField(k: string, v: any) { setModal(m => ({ ...m, data: { ...m.data, [k]: v } })) }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const { headers, rows } = parseCSVText(text)
      setImportHeaders(headers)
      setImportRows(rows)
      setImportResult(null)
    }
    reader.readAsText(file, 'iso-8859-1')
    if (fileRef.current) fileRef.current.value = ''
  }

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

  async function handleImport() {
    setImporting(true)
    setImportResult(null)
    const res = await fetch('/api/tiendas/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: importRows }),
    })
    const result = await res.json()
    setImportResult(result)
    setImporting(false)
    if (!result.error) fetchTiendas()
  }

  const supervisores = Array.from(new Set(tiendas.map(t => t.supervisorNombre).filter(Boolean))).sort()
  const proveedoresUnicos = Array.from(
    new Map(tiendas.filter(t => t.proveedorId && t.proveedorNombre).map(t => [t.proveedorId, t.proveedorNombre])).entries()
  ).map(([id, nombre]) => ({ id, nombre })).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre))

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

  filtered = [...filtered].sort((a, b) => {
    const aCat = a.formato?.toLowerCase().includes('catalogo') ? 1 : 0
    const bCat = b.formato?.toLowerCase().includes('catalogo') ? 1 : 0
    if (aCat !== bCat) return aCat - bCat
    if (filtros.sort === 'incidentes') {
      return (Number(b.incidentCount) || 0) - (Number(a.incidentCount) || 0)
    }
    return 0
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalContingencia = tiendas.filter(t => t.contingenciaActiva).length
  const totalIncidentes30d = tiendas.reduce((sum, t) => sum + (Number(t.incidentCount) || 0), 0)
  const sinProveedor = tiendas.filter(t => !t.proveedorId)
  const totalActivo = tiendas.filter(t => !t.estadoServicio || t.estadoServicio === 'ACTIVO').length
  const totalInactivo = tiendas.filter(t => t.estadoServicio === 'INACTIVO').length

  const thStyle: React.CSSProperties = {
    padding: '9px 12px', fontSize: '10px', fontWeight: 700,
    color: 'var(--muted-foreground)', textTransform: 'uppercase',
    letterSpacing: '0.06em', textAlign: 'left',
    borderBottom: '0.5px solid var(--border)', whiteSpace: 'nowrap',
    background: 'var(--muted)',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Tiendas</h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
            {filtered.length} de {tiendas.length} tiendas
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {canEdit && (
            <button
              onClick={() => { setShowImport(true); setImportRows([]); setImportResult(null) }}
              style={{ padding: '7px 12px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
              ↑ Importar CSV
            </button>
          )}
          <button onClick={downloadMaestro} disabled={exportingMaestro}
            style={{ padding: '7px 12px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: exportingMaestro ? 'not-allowed' : 'pointer', color: exportingMaestro ? 'var(--muted-foreground)' : 'var(--foreground)' }}>
            {exportingMaestro ? 'Generando...' : '↓ Exportar CSV'}
          </button>
          <button onClick={openHistorial}
            style={{ padding: '7px 12px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
            Historial
          </button>
          {canEdit && (
            <button onClick={() => setModal({ open: true, data: { ...BLANK } })}
              style={{ padding: '7px 14px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
              + Nueva tienda
            </button>
          )}
        </div>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', marginBottom: '16px' }}>
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#3b82f6' }}>{tiendas.length}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Total tiendas</div>
        </div>
        <div
          onClick={() => { setFiltros(f => ({ ...f, estado: f.estado === 'ACTIVO' ? '' : 'ACTIVO' })); setPage(1) }}
          style={{ background: filtros.estado === 'ACTIVO' ? '#f0fdf4' : 'var(--card)', border: filtros.estado === 'ACTIVO' ? '0.5px solid #22c55e' : '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px', cursor: 'pointer' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>{totalActivo}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Activas</div>
        </div>
        <div
          onClick={() => { setFiltros(f => ({ ...f, estado: f.estado === 'INACTIVO' ? '' : 'INACTIVO' })); setPage(1) }}
          style={{ background: filtros.estado === 'INACTIVO' ? '#f9fafb' : 'var(--card)', border: filtros.estado === 'INACTIVO' ? '0.5px solid #9ca3af' : '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px', cursor: 'pointer' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#9ca3af' }}>{totalInactivo}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Inactivas</div>
        </div>
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>{totalContingencia}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Contingencia activa</div>
        </div>
        <div
          onClick={() => sinProveedor.length > 0 && setSinProveedorPanel(v => !v)}
          style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px', cursor: sinProveedor.length > 0 ? 'pointer' : 'default' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: sinProveedor.length > 0 ? '#8b5cf6' : 'var(--muted-foreground)' }}>{sinProveedor.length}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Sin proveedor</div>
        </div>
      </div>

      {/* Sin proveedor panel */}
      {sinProveedorPanel && (
        <div style={{ background: 'var(--card)', border: '0.5px solid #8b5cf6', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#7c3aed' }}>Sin proveedor asignado ({sinProveedor.length})</div>
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

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <input
          placeholder="Buscar código, nombre, distrito, supervisor..."
          value={filtros.q}
          onChange={e => { setFiltros(f => ({ ...f, q: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', minWidth: '240px' }}
        />
        <select value={filtros.proveedor} onChange={e => { setFiltros(f => ({ ...f, proveedor: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {proveedoresUnicos.map((p: any) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <select value={filtros.cluster} onChange={e => { setFiltros(f => ({ ...f, cluster: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los clusters</option>
          {['A', 'B', 'C', 'D'].map(c => <option key={c} value={c}>Cluster {c}</option>)}
        </select>
        <select value={filtros.supervisor} onChange={e => { setFiltros(f => ({ ...f, supervisor: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los supervisores</option>
          {supervisores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filtros.estado} onChange={e => { setFiltros(f => ({ ...f, estado: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Activo</option>
          <option value="INACTIVO">Inactivo</option>
        </select>
        <select value={filtros.sort} onChange={e => { setFiltros(f => ({ ...f, sort: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Ordenar: Código</option>
          <option value="incidentes">Ordenar: Mayor incidentes</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
              <th style={{ ...thStyle, textAlign: 'center' }}>Inc. 30d</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(t => {
              const prov = provColor(t.proveedorNombre)
              const isInactive = t.estadoServicio === 'INACTIVO'
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
                    borderBottom: '0.5px solid var(--border)',
                    opacity: isInactive ? 0.55 : 1,
                    borderLeft: t.contingenciaActiva ? '3px solid #f59e0b' : '3px solid transparent',
                  }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
                    {t.codigo}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--foreground)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                  <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--muted-foreground)', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.supervisorNombre || '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {isInactive ? (
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: '#f3f4f6', color: '#6b7280', fontWeight: 600 }}>INACTIVO</span>
                    ) : (
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontWeight: 600 }}>ACTIVO</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'center', color: Number(t.incidentCount) > 0 ? '#dc2626' : 'var(--muted-foreground)', fontWeight: Number(t.incidentCount) > 0 ? 600 : 400 }}>
                    {Number(t.incidentCount) || 0}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                      {t.contingenciaActiva && (
                        <span style={{ fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>⚠</span>
                      )}
                      {canEdit && (
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteConfirm({ id: t.id, codigo: t.codigo, step: 1 }) }}
                          title="Eliminar tienda"
                          style={{ background: 'none', border: '0.5px solid transparent', borderRadius: '5px', padding: '2px 5px', cursor: 'pointer', fontSize: '12px', color: '#9ca3af', lineHeight: 1, transition: 'color 0.1s, border-color 0.1s' }}
                          onMouseEnter={e => { const b = e.currentTarget; b.style.color = '#ef4444'; b.style.borderColor = '#fecaca' }}
                          onMouseLeave={e => { const b = e.currentTarget; b.style.color = '#9ca3af'; b.style.borderColor = 'transparent' }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: '40px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
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
          {totalIncidentes30d > 0 && `${totalIncidentes30d} incidentes totales (30d)`}
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '5px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>
              ← Anterior
            </button>
            <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
              {page} / {totalPages} · {filtered.length} tiendas
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: '5px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {/* Historial slide-in */}
      {showHistorial && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={() => setShowHistorial(false)}>
          <div
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '380px', background: 'var(--card)', borderLeft: '0.5px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

      {/* Import CSV modal */}
      {showImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Importar tiendas desde CSV</div>
                <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                  Columnas: codigo, nombre_cc, proveedor, tipo_conexion, distrito, provincia, supervisor_nombre, administrador_nombre, contacto_soporte, administrador_email, telefono_fijo
                </div>
              </div>
              <button onClick={() => setShowImport(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--muted-foreground)', flexShrink: 0, marginLeft: '12px' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {/* File picker */}
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFileSelect} style={{ display: 'none' }} />
              <div
                onClick={() => fileRef.current?.click()}
                style={{ border: '1.5px dashed var(--border)', borderRadius: '10px', padding: '24px', textAlign: 'center', cursor: 'pointer', marginBottom: '16px', background: 'var(--muted)' }}>
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>📁</div>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--foreground)' }}>
                  {importRows.length > 0 ? `${importRows.length} filas cargadas` : 'Click para seleccionar archivo CSV'}
                </div>
                {importRows.length > 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                    Columnas: {importHeaders.join(', ')}
                  </div>
                )}
                {importRows.length === 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '4px' }}>Codificación: iso-8859-1 (Latin-1)</div>
                )}
              </div>

              {/* Preview */}
              {importRows.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                    Vista previa (primeras 3 filas)
                  </div>
                  <div style={{ overflow: 'auto', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                      <thead>
                        <tr style={{ background: 'var(--muted)' }}>
                          {PREVIEW_COLS.filter(c => importHeaders.includes(c)).map(c => (
                            <th key={c} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', borderBottom: '0.5px solid var(--border)' }}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 3).map((row, i) => (
                          <tr key={i} style={{ borderBottom: '0.5px solid var(--border)' }}>
                            {PREVIEW_COLS.filter(c => importHeaders.includes(c)).map(c => (
                              <td key={c} style={{ padding: '7px 10px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--foreground)' }}>
                                {row[c] || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Result */}
              {importResult && !importResult.error && (
                <div style={{ padding: '12px 14px', borderRadius: '8px', background: importResult.errors?.length > 0 ? '#fffbeb' : '#f0fdf4', border: `0.5px solid ${importResult.errors?.length > 0 ? '#f59e0b' : '#22c55e'}`, marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: importResult.errors?.length > 0 ? '#92400e' : '#15803d', marginBottom: '6px' }}>
                    Importación completada
                  </div>
                  <div style={{ display: 'flex', gap: '20px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    <span>✓ <strong style={{ color: '#15803d' }}>{importResult.created}</strong> creadas</span>
                    <span>↺ <strong style={{ color: '#1e40af' }}>{importResult.updated}</strong> actualizadas</span>
                    <span>— <strong>{importResult.skipped}</strong> omitidas</span>
                  </div>
                  {importResult.errors?.length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '10px', color: '#92400e' }}>
                      {importResult.errors.slice(0, 5).map((e: string, i: number) => <div key={i}>⚠ {e}</div>)}
                      {importResult.errors.length > 5 && <div>... y {importResult.errors.length - 5} más</div>}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowImport(false)}
                  style={{ padding: '8px 16px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
                  Cerrar
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || importRows.length === 0}
                  style={{ padding: '8px 16px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: importing || importRows.length === 0 ? 'not-allowed' : 'pointer', opacity: importing || importRows.length === 0 ? 0.6 : 1 }}>
                  {importing ? 'Importando...' : `Importar ${importRows.length} tiendas`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '22px 24px' }}>
            {deleteConfirm.step === 1 ? (
              <>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Eliminar tienda</div>
                <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '22px' }}>
                  ¿Deseas eliminar la tienda <strong style={{ color: 'var(--foreground)' }}>{deleteConfirm.codigo}</strong>? Solo se puede eliminar si no tiene incidentes registrados.
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setDeleteConfirm(null)}
                    style={{ padding: '8px 16px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
                    Cancelar
                  </button>
                  <button onClick={() => setDeleteConfirm(c => c ? { ...c, step: 2 } : c)}
                    style={{ padding: '8px 16px', background: '#fee2e2', color: '#b91c1c', border: '0.5px solid #fecaca', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                    Continuar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#b91c1c', marginBottom: '6px' }}>Confirmar eliminación</div>
                <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '22px' }}>
                  Esta acción es <strong>permanente</strong>. La tienda <strong style={{ color: 'var(--foreground)' }}>{deleteConfirm.codigo}</strong> y toda su configuración serán eliminadas.
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setDeleteConfirm(null)}
                    style={{ padding: '8px 16px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
                    Cancelar
                  </button>
                  <button onClick={() => handleDelete(deleteConfirm.id)} disabled={deleting}
                    style={{ padding: '8px 16px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}>
                    {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Nueva tienda modal */}
      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                ['tipoConexion',         'Tipo conexión',     'text'],
                ['cidServicio',          'CID / Servicio',    'text'],
                ['instruccionReporte',   'I.E.',              'textarea'],
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
                  style={{ padding: '8px 16px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving || !modal.data.codigo}
                  style={{ padding: '8px 16px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', opacity: saving || !modal.data.codigo ? 0.6 : 1 }}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
