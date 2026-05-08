'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const PROVEEDOR_COLORS: Record<string, { bg: string; color: string }> = {
  BITEL:              { bg: '#dbeafe', color: '#1e40af' },
  CLARO:              { bg: '#fee2e2', color: '#b91c1c' },
  CONVERGIA:          { bg: '#ede9fe', color: '#7c3aed' },
  ENTEL:              { bg: '#dcfce7', color: '#15803d' },
  MOVISTAR:           { bg: '#1e3a8a', color: '#bfdbfe' },
  GTD:                { bg: '#ffedd5', color: '#c2410c' },
  FIBERLUX:           { bg: '#fef9c3', color: '#854d0e' },
  'FIBRA AMAZÓNICA':  { bg: '#d1fae5', color: '#065f46' },
  DITSAC:             { bg: '#fce7f3', color: '#9d174d' },
  TELCONET:           { bg: '#e0f2fe', color: '#075985' },
  GONET:              { bg: '#f0fdf4', color: '#166534' },
}

function provColor(nombre: string | null) {
  if (!nombre) return { bg: '#f3f4f6', color: '#6b7280' }
  return PROVEEDOR_COLORS[nombre.toUpperCase()] ?? { bg: '#f3f4f6', color: '#6b7280' }
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
  nombreCc: 'Nombre CC', direccion: 'Dirección', distrito: 'Distrito',
  provincia: 'Provincia', cluster: 'Cluster', supervisorNombre: 'Supervisor',
  perfilSupervisor: 'Perfil sup.', tipoConexion: 'Tipo conexión', tipoServicio: 'Tipo servicio',
  cidServicio: 'CID', tieneContingencia: 'Tiene contingencia', contingenciaActiva: 'Contingencia activa',
  contingenciaDescripcion: 'Desc. contingencia', costoMensual: 'Costo mensual',
  instruccionReporte: 'Instrucción reporte', contactoSoporte: 'Contacto soporte',
  administradorNombre: 'Admin nombre', administradorEmail: 'Admin email',
  administradorCelular: 'Admin celular', proveedorId: 'Proveedor', ventaHoraSoles: 'Venta/hora S/.',
  formato: 'Formato',
}

const BLANK = {
  codigo: '', nombreCc: '', formato: '', direccion: '', referencia: '',
  distrito: '', provincia: '', ubicacion: '', cluster: '',
  supervisorNombre: '', perfilSupervisor: '', proveedorId: '', tipoConexion: '',
  tipoServicio: '', cidServicio: '', tieneContingencia: false, costoMensual: '',
  instruccionReporte: '', contactoSoporte: '', administradorNombre: '',
  administradorEmail: '', administradorCelular: '',
}

const PERFILES_SUPERVISOR = [
  { emoji: '',   label: 'Sin definir' },
  { emoji: '😡', label: 'Crítico' },
  { emoji: '😤', label: 'Exigente' },
  { emoji: '😐', label: 'Neutral' },
  { emoji: '🙂', label: 'Colaborativo' },
]

function inp(): React.CSSProperties {
  return { width: '100%', padding: '6px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }
}

const PAGE_SIZE = 20

export default function MantenimientoPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const userRol = (session?.user as any)?.rol ?? 'AGENTE'
  const canEdit = ['SUPERVISOR', 'INFRAESTRUCTURA'].includes(userRol)

  const [tiendas, setTiendas] = useState<any[]>([])
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([])
  const [filtros, setFiltros] = useState({ q: '', proveedor: '', cluster: '', sort: '' })
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<{ open: boolean; data: any }>({ open: false, data: BLANK })
  const [saving, setSaving] = useState(false)
  const [historial, setHistorial] = useState<any[]>([])
  const [showHistorial, setShowHistorial] = useState(false)
  const [loadingHist, setLoadingHist] = useState(false)

  const fetchTiendas = useCallback(async () => {
    const params = new URLSearchParams()
    if (filtros.proveedor) params.set('proveedor', filtros.proveedor)
    if (filtros.cluster)   params.set('cluster', filtros.cluster)
    const res = await fetch(`/api/tiendas?${params}`)
    if (!res.ok) return
    const data = await res.json()
    if (!Array.isArray(data)) return
    setTiendas(data)
    const map = new Map<string, string>()
    data.forEach((t: any) => { if (t.proveedorId && t.proveedorNombre) map.set(t.proveedorId, t.proveedorNombre) })
    setProveedores(Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)))
  }, [filtros.proveedor, filtros.cluster])

  useEffect(() => { fetchTiendas() }, [fetchTiendas])

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
    const body = { ...modal.data, tieneContingencia: !!modal.data.tieneContingencia, costoMensual: modal.data.costoMensual || null, cluster: modal.data.cluster || null, proveedorId: modal.data.proveedorId || null }
    await fetch('/api/tiendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    setModal(m => ({ ...m, open: false }))
    fetchTiendas()
  }

  function setField(k: string, v: any) { setModal(m => ({ ...m, data: { ...m.data, [k]: v } })) }

  let filtered = tiendas.filter(t => {
    if (!filtros.q) return true
    const q = filtros.q.toLowerCase()
    return t.codigo?.toLowerCase().includes(q) || t.nombreCc?.toLowerCase().includes(q) || t.distrito?.toLowerCase().includes(q)
  })
  if (filtros.sort === 'incidentes') {
    filtered = [...filtered].sort((a, b) => (Number(b.incidentCount) || 0) - (Number(a.incidentCount) || 0))
  }

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalContingencia = tiendas.filter(t => t.contingenciaActiva).length
  const totalConIncidentes = tiendas.filter(t => Number(t.incidentCount) > 0).length
  const totalSinProveedor = tiendas.filter(t => !t.proveedorId).length

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Mantenimiento de tiendas</h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{filtered.length} tiendas</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={openHistorial}
            style={{ padding: '7px 12px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
            Historial de cambios
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Total tiendas', value: tiendas.length, color: '#3b82f6' },
          { label: 'En contingencia', value: totalContingencia, color: '#f59e0b' },
          { label: 'Con incidentes (30d)', value: totalConIncidentes, color: '#ef4444' },
          { label: 'Sin proveedor', value: totalSinProveedor, color: '#8b5cf6' },
        ].map(m => (
          <div key={m.label} style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input placeholder="Buscar código, nombre o distrito..." value={filtros.q}
          onChange={e => { setFiltros(f => ({ ...f, q: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', minWidth: '220px' }} />
        <select value={filtros.proveedor} onChange={e => { setFiltros(f => ({ ...f, proveedor: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <select value={filtros.cluster} onChange={e => { setFiltros(f => ({ ...f, cluster: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los clusters</option>
          {['A','B','C','D'].map(c => <option key={c} value={c}>Cluster {c}</option>)}
        </select>
        <select value={filtros.sort} onChange={e => { setFiltros(f => ({ ...f, sort: e.target.value })); setPage(1) }}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Ordenar: Código</option>
          <option value="incidentes">Ordenar: Mayor incidentes (30d)</option>
        </select>
      </div>

      {/* Grid de cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
        {paginated.map(t => {
          const prov = provColor(t.proveedorNombre)
          return (
            <div key={t.id} onClick={() => router.push(`/mantenimiento/${t.id}`)}
              style={{ background: 'var(--card)', border: t.contingenciaActiva ? '1.5px solid #f59e0b' : '0.5px solid var(--border)', borderRadius: '12px', padding: '14px', cursor: 'pointer', transition: 'box-shadow 0.15s', position: 'relative' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>

              {/* Contingencia badge */}
              {t.contingenciaActiva && (
                <div style={{ position: 'absolute', top: '10px', right: '10px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '2px 7px', fontSize: '9px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>
                  ⚠ Contingencia
                </div>
              )}

              {/* Código */}
              <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em', marginBottom: '2px' }}>
                {t.codigo}
              </div>

              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--foreground)', lineHeight: 1.3, paddingRight: t.contingenciaActiva ? '90px' : '0' }}>
                {t.nombreCc || '—'}
              </div>

              {t.direccion && (
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px', marginBottom: '8px', lineHeight: 1.3 }}>
                  {t.direccion}
                </div>
              )}
              {!t.direccion && <div style={{ marginBottom: '8px' }} />}

              {/* Badges */}
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {t.proveedorNombre && (
                  <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: prov.bg, color: prov.color }}>
                    {t.proveedorNombre}
                  </span>
                )}
                {t.cluster && (
                  <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: 'var(--muted)', color: 'var(--foreground)' }}>
                    Cluster {t.cluster}
                  </span>
                )}
                {Number(t.incidentCount) > 0 && (
                  <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
                    {t.incidentCount} inc. (30d)
                  </span>
                )}
              </div>

              {/* Detalles */}
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.7 }}>
                {t.tipoConexion && <div><span style={{ fontWeight: 500 }}>Conexión:</span> {t.tipoConexion}</div>}
                {t.cidServicio  && <div><span style={{ fontWeight: 500 }}>CID:</span> <span style={{ fontFamily: 'monospace' }}>{t.cidServicio}</span></div>}
                {(t.distrito || t.provincia) && <div><span style={{ fontWeight: 500 }}>Ubic.:</span> {[t.distrito, t.provincia].filter(Boolean).join(', ')}</div>}
                {t.supervisorNombre && (
                  <div>
                    <span style={{ fontWeight: 500 }}>Supervisor:</span>{' '}
                    {t.perfilSupervisor ? `${t.perfilSupervisor} ` : ''}{t.supervisorNombre}
                  </div>
                )}
                {t.administradorCelular && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                    {t.administradorCelular}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', justifyContent: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '5px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>
            ← Anterior
          </button>
          <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
            Página {page} de {totalPages} · {filtered.length} tiendas
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '5px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>
            Siguiente →
          </button>
        </div>
      )}

      {/* Historial slide-in panel */}
      {showHistorial && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={() => setShowHistorial(false)}>
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '380px', background: 'var(--card)', borderLeft: '0.5px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column' }}
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
                  <div style={{ color: 'var(--muted-foreground)', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
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

      {/* Modal nueva tienda */}
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
                ['instruccionReporte',   'Instrucción',       'textarea'],
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

              {/* Cluster */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Cluster</label>
                <select value={modal.data.cluster ?? ''} onChange={e => setField('cluster', e.target.value)} style={inp()}>
                  <option value="">Sin cluster</option>
                  {['A','B','C','D'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Proveedor */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Proveedor</label>
                <select value={modal.data.proveedorId ?? ''} onChange={e => setField('proveedorId', e.target.value)} style={inp()}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button onClick={() => setModal(m => ({ ...m, open: false }))}
                  style={{ padding: '8px 16px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
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
