'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'

const PROVEEDOR_COLORS: Record<string, { bg: string; color: string }> = {
  BITEL:            { bg: '#dbeafe', color: '#1e40af' },
  CLARO:            { bg: '#fee2e2', color: '#b91c1c' },
  CONVERGIA:        { bg: '#ede9fe', color: '#7c3aed' },
  ENTEL:            { bg: '#dcfce7', color: '#15803d' },
  MOVISTAR:         { bg: '#1e3a8a', color: '#bfdbfe' },
  GTD:              { bg: '#ffedd5', color: '#c2410c' },
  FIBERLUX:         { bg: '#fef9c3', color: '#854d0e' },
  'FIBRA AMAZÓNICA':{ bg: '#d1fae5', color: '#065f46' },
  DITSAC:           { bg: '#fce7f3', color: '#9d174d' },
  TELCONET:         { bg: '#e0f2fe', color: '#075985' },
  GONET:            { bg: '#f0fdf4', color: '#166534' },
}

function provColor(nombre: string | null) {
  if (!nombre) return { bg: '#f3f4f6', color: '#6b7280' }
  return PROVEEDOR_COLORS[nombre.toUpperCase()] ?? { bg: '#f3f4f6', color: '#6b7280' }
}

const BLANK = {
  codigo: '', nombreCc: '', formato: '', direccion: '', referencia: '',
  distrito: '', provincia: '', ubicacion: '', cluster: '',
  supervisorNombre: '', proveedorId: '', tipoConexion: '', tipoServicio: '',
  cidServicio: '', tieneContingencia: false, costoMensual: '',
  instruccionReporte: '', contactoSoporte: '', administradorNombre: '',
  administradorEmail: '', administradorCelular: '',
}

function inputStyle(): React.CSSProperties {
  return { width: '100%', padding: '6px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }
}

export default function MantenimientoPage() {
  const { data: session } = useSession()
  const userRol = (session?.user as any)?.rol ?? 'AGENTE'
  const canEdit = ['SUPERVISOR', 'INFRAESTRUCTURA'].includes(userRol)

  const [tiendas, setTiendas] = useState<any[]>([])
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([])
  const [filtros, setFiltros] = useState({ q: '', proveedor: '', cluster: '', sort: '' })
  const [modal, setModal] = useState<{ open: boolean; data: any; isNew: boolean }>({ open: false, data: BLANK, isNew: false })
  const [saving, setSaving] = useState(false)

  const fetchTiendas = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filtros.proveedor) params.set('proveedor', filtros.proveedor)
      if (filtros.cluster)   params.set('cluster', filtros.cluster)
      const res = await fetch(`/api/tiendas?${params}`)
      if (!res.ok) {
        const txt = await res.text()
        console.error('[mantenimiento] API error', res.status, txt)
        return
      }
      const data = await res.json()
      if (!Array.isArray(data)) {
        console.error('[mantenimiento] respuesta inesperada:', data)
        return
      }
      setTiendas(data)
      const provMap = new Map<string, string>()
      data.forEach((t: any) => { if (t.proveedorId && t.proveedorNombre) provMap.set(t.proveedorId, t.proveedorNombre) })
      setProveedores(Array.from(provMap.entries()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)))
    } catch (e) {
      console.error('[mantenimiento] fetch error:', e)
    }
  }, [filtros.proveedor, filtros.cluster])

  useEffect(() => { fetchTiendas() }, [fetchTiendas])

  function openEdit(t: any) {
    setModal({ open: true, isNew: false, data: { ...t, proveedorId: t.proveedorId ?? '', cluster: t.cluster ?? '', tieneContingencia: t.tieneContingencia ?? false, costoMensual: t.costoMensual ?? '' } })
  }
  function openNew() {
    setModal({ open: true, isNew: true, data: { ...BLANK } })
  }

  async function handleSave() {
    setSaving(true)
    const body = { ...modal.data, tieneContingencia: !!modal.data.tieneContingencia, costoMensual: modal.data.costoMensual || null, cluster: modal.data.cluster || null, proveedorId: modal.data.proveedorId || null }
    if (modal.isNew) {
      await fetch('/api/tiendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else {
      await fetch(`/api/tiendas/${modal.data.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    setSaving(false)
    setModal(m => ({ ...m, open: false }))
    fetchTiendas()
  }

  function setField(k: string, v: any) { setModal(m => ({ ...m, data: { ...m.data, [k]: v } })) }

  let filtered = tiendas.filter(t => {
    if (!filtros.q) return true
    const q = filtros.q.toLowerCase()
    return t.codigo?.toLowerCase().includes(q) || t.nombreCc?.toLowerCase().includes(q)
  })
  if (filtros.sort === 'incidentes') {
    filtered = [...filtered].sort((a, b) => (Number(b.incidentCount) || 0) - (Number(a.incidentCount) || 0))
  }

  const inp = inputStyle()

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Mantenimiento</h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{filtered.length} tiendas</div>
        </div>
        {canEdit && (
          <button onClick={openNew}
            style={{ padding: '7px 14px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
            + Nueva tienda
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input placeholder="Buscar código o nombre..." value={filtros.q} onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', minWidth: '200px' }} />
        <select value={filtros.proveedor} onChange={e => setFiltros(f => ({ ...f, proveedor: e.target.value }))}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <select value={filtros.cluster} onChange={e => setFiltros(f => ({ ...f, cluster: e.target.value }))}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los clusters</option>
          {['A','B','C','D'].map(c => <option key={c} value={c}>Cluster {c}</option>)}
        </select>
        <select value={filtros.sort} onChange={e => setFiltros(f => ({ ...f, sort: e.target.value }))}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Ordenar: Código</option>
          <option value="incidentes">Ordenar: Mayor incidentes (30d)</option>
        </select>
      </div>

      {/* Grid de cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
        {filtered.map(t => {
          const prov = provColor(t.proveedorNombre)
          return (
            <div key={t.id} style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '14px', position: 'relative', transition: 'box-shadow 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>

              {/* Edit pencil */}
              {canEdit && (
                <button onClick={() => openEdit(t)}
                  style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: '13px', padding: '2px 5px', borderRadius: '4px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--muted)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  title="Editar tienda">
                  ✏
                </button>
              )}

              {/* Código */}
              <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em', marginBottom: '2px' }}>
                {t.codigo}
              </div>

              {/* Nombre CC */}
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--foreground)', lineHeight: 1.3, paddingRight: '20px' }}>
                {t.nombreCc || '—'}
              </div>
              {/* Dirección */}
              {t.direccion && (
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px', marginBottom: '8px', lineHeight: 1.3, paddingRight: '20px' }}>
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
                {t.supervisorNombre && <div><span style={{ fontWeight: 500 }}>Supervisor:</span> {t.supervisorNombre}</div>}
                {t.contactoSoporte  && <div><span style={{ fontWeight: 500 }}>Tel:</span> {t.contactoSoporte}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal edición */}
      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{modal.isNew ? 'Nueva tienda' : `Editar ${modal.data.codigo}`}</div>
              <button onClick={() => setModal(m => ({ ...m, open: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {([
                ['codigo',              'Código',             'text'],
                ['nombreCc',           'Nombre CC',          'text'],
                ['formato',            'Formato',            'text'],
                ['direccion',          'Dirección',          'text'],
                ['referencia',         'Referencia',         'text'],
                ['distrito',           'Distrito',           'text'],
                ['provincia',          'Provincia',          'text'],
                ['ubicacion',          'Ubicación',          'text'],
                ['supervisorNombre',   'Supervisor',         'text'],
                ['tipoConexion',       'Tipo conexión',      'text'],
                ['tipoServicio',       'Tipo servicio',      'text'],
                ['cidServicio',        'CID / Servicio',     'text'],
                ['costoMensual',       'Costo mensual',      'text'],
                ['instruccionReporte', 'Instrucción reporte','textarea'],
                ['contactoSoporte',    'Contacto / Tel',     'text'],
                ['administradorNombre','Admin nombre',       'text'],
                ['administradorEmail', 'Admin email',        'text'],
                ['administradorCelular','Admin celular',     'text'],
              ] as [string, string, string][]).map(([key, label, type]) => (
                <div key={key} style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>{label}</label>
                  {type === 'textarea'
                    ? <textarea value={modal.data[key] ?? ''} onChange={e => setField(key, e.target.value)} style={{ ...inp, minHeight: '60px', resize: 'vertical' }} />
                    : <input value={modal.data[key] ?? ''} onChange={e => setField(key, e.target.value)} style={inp} />
                  }
                </div>
              ))}

              {/* Cluster select */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Cluster</label>
                <select value={modal.data.cluster ?? ''} onChange={e => setField('cluster', e.target.value)} style={inp}>
                  <option value="">Sin cluster</option>
                  {['A','B','C','D'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Proveedor select */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Proveedor</label>
                <select value={modal.data.proveedorId ?? ''} onChange={e => setField('proveedorId', e.target.value)} style={inp}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>

              {/* Contingencia */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <input type="checkbox" id="contingencia" checked={!!modal.data.tieneContingencia} onChange={e => setField('tieneContingencia', e.target.checked)} />
                <label htmlFor="contingencia" style={{ fontSize: '12px' }}>Tiene contingencia</label>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setModal(m => ({ ...m, open: false }))}
                  style={{ padding: '8px 16px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '8px 16px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
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
