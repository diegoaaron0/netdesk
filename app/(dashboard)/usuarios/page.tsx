'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { PERMISOS_POR_ROL, can } from '@/lib/permisos'

const ROL_META: Record<string, { label: string; bg: string; color: string; desc: string }> = {
  AGENTE:          { label: 'Agente TTI',      bg: '#f3f4f6', color: '#374151', desc: 'Operación diaria de incidentes' },
  SUPERVISOR:      { label: 'Supervisor',      bg: '#dbeafe', color: '#1e40af', desc: 'Gestión completa del sistema' },
  GERENCIA:        { label: 'Gerencia',         bg: '#dcfce7', color: '#15803d', desc: 'Visibilidad total, solo lectura' },
  INFRAESTRUCTURA: { label: 'Infraestructura', bg: '#ede9fe', color: '#7c3aed', desc: 'Operación + configuración + reportes' },
}

const PERMISOS_GRUPOS = [
  {
    key: 'INCIDENTES',
    items: [
      { key: 'incidentes.ver',      label: 'Ver incidentes' },
      { key: 'incidentes.crear',    label: 'Registrar nuevo incidente' },
      { key: 'incidentes.reabrir',  label: 'Reabrir incidentes cerrados' },
      { key: 'incidentes.editar',   label: 'Editar incidentes ajenos' },
      { key: 'incidentes.eliminar', label: 'Eliminar incidentes cancelados' },
    ],
  },
  {
    key: 'ESCALAMIENTOS',
    items: [
      { key: 'escalamientos.crear',     label: 'Escalar incidente' },
      { key: 'escalamientos.envio',     label: 'Registrar envío de correo' },
      { key: 'escalamientos.respuesta', label: 'Registrar respuesta proveedor' },
    ],
  },
  {
    key: 'TIENDAS',
    items: [
      { key: 'mantenimiento.ver',     label: 'Ver módulo tiendas' },
      { key: 'mantenimiento.editar',  label: 'Editar datos de tiendas' },
      { key: 'mantenimiento.agregar', label: 'Agregar nueva tienda' },
    ],
  },
  {
    key: 'PROVEEDORES',
    items: [
      { key: 'proveedores.ver',    label: 'Ver proveedores' },
      { key: 'proveedores.editar', label: 'Editar proveedores' },
    ],
  },
  {
    key: 'ANÁLISIS',
    items: [
      { key: 'dashboard.ver',     label: 'Ver dashboard operativo' },
      { key: 'reportes.ver',      label: 'Ver reportes' },
      { key: 'reportes.exportar', label: 'Exportar CSV de reportes' },
    ],
  },
  {
    key: 'DECISIONES',
    items: [
      { key: 'decisiones.ver',   label: 'Ver decisiones' },
      { key: 'decisiones.crear', label: 'Proponer decisiones' },
    ],
  },
  {
    key: 'USUARIOS',
    items: [
      { key: 'usuarios.ver',    label: 'Ver módulo usuarios' },
      { key: 'usuarios.editar', label: 'Editar datos de usuarios' },
      { key: 'usuarios.crear',  label: 'Crear nuevos usuarios' },
    ],
  },
]

const BLANK = {
  nombre: '', apellido: '', email: '', celular: '',
  password: 'soporte123', rol: 'AGENTE', cluster: '', activo: true,
  permisos: PERMISOS_POR_ROL['AGENTE'] as string[],
}

function initials(nombre: string, apellido?: string) {
  const parts = [nombre, apellido].filter(Boolean).join(' ')
  return parts.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function fmtMttr(mins: number | null | undefined) {
  if (!mins) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function inputStyle(): React.CSSProperties {
  return { width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }
}

export default function UsuariosPage() {
  const { data: session } = useSession()
  const myRol = (session?.user as any)?.rol ?? 'AGENTE'
  const canEdit = can(session, 'usuarios.editar')
  const canCreate = can(session, 'usuarios.crear')

  const [usuarios, setUsuarios] = useState<any[]>([])
  const [filtroRol, setFiltroRol] = useState<string>('TODOS')
  const [modal, setModal] = useState<{ open: boolean; data: any; isNew: boolean }>({ open: false, data: BLANK, isNew: false })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [historial, setHistorial] = useState<{ open: boolean; usuario: any; items: any[]; loading: boolean }>({ open: false, usuario: null, items: [], loading: false })
  const [historialTab, setHistorialTab] = useState<'todos' | 'resueltos'>('todos')

  const fetchUsuarios = useCallback(async () => {
    const res = await fetch('/api/usuarios')
    setUsuarios(await res.json())
  }, [])

  useEffect(() => { fetchUsuarios() }, [fetchUsuarios])

  function openEdit(u: any) {
    setShowPass(false)
    setSaveError('')
    setModal({
      open: true, isNew: false,
      data: {
        ...u,
        password: u.password ?? 'soporte123',
        cluster: u.cluster ?? '',
        permisos: u.permisos ?? PERMISOS_POR_ROL[u.rol] ?? [],
      },
    })
  }
  function openNew() {
    setShowPass(false)
    setSaveError('')
    setModal({ open: true, isNew: true, data: { ...BLANK, permisos: [...PERMISOS_POR_ROL['AGENTE']] } })
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    const defaultPerms = PERMISOS_POR_ROL[modal.data.rol] ?? []
    const currentPerms: string[] = modal.data.permisos ?? []
    const esDefault =
      defaultPerms.length === currentPerms.length &&
      defaultPerms.every(p => currentPerms.includes(p)) &&
      currentPerms.every(p => defaultPerms.includes(p))
    const body = {
      ...modal.data,
      cluster: modal.data.cluster || null,
      permisos: esDefault ? null : currentPerms,
    }
    try {
      const res = modal.isNew
        ? await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch(`/api/usuarios/${modal.data.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveError(data?.error ?? `Error ${res.status} al guardar`)
        setSaving(false)
        return
      }
    } catch {
      setSaveError('Error de red. Verifica tu conexión.')
      setSaving(false)
      return
    }
    setSaving(false)
    setModal(m => ({ ...m, open: false }))
    setSaveError('')
    fetchUsuarios()
    if (!esDefault && !modal.isNew) {
      alert('Permisos personalizados guardados. El usuario debe cerrar sesión y volver a entrar para que los cambios tomen efecto.')
    }
  }

  async function handleDelete(u: any) {
    if (u.activo) {
      alert('Desactiva primero al usuario antes de eliminarlo.')
      return
    }
    if (!confirm(`¿Eliminar permanentemente a "${u.nombre}"? Sus tickets quedarán intactos pero el usuario no podrá acceder.`)) return
    await fetch(`/api/usuarios/${u.id}`, { method: 'DELETE' })
    fetchUsuarios()
  }

  async function toggleActivo(u: any) {
    await fetch(`/api/usuarios/${u.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !u.activo }) })
    fetchUsuarios()
  }

  async function openHistorial(u: any) {
    setHistorial({ open: true, usuario: u, items: [], loading: true })
    const res = await fetch(`/api/usuarios/${u.id}/incidentes-resueltos`)
    const items = res.ok ? await res.json() : []
    setHistorial(prev => ({ ...prev, items, loading: false }))
  }

  function setField(k: string, v: any) {
    if (k === 'rol') {
      setModal(m => ({ ...m, data: { ...m.data, rol: v, permisos: [...(PERMISOS_POR_ROL[v] ?? [])] } }))
    } else {
      setModal(m => ({ ...m, data: { ...m.data, [k]: v } }))
    }
  }

  function togglePermiso(key: string) {
    setModal(m => {
      const current: string[] = m.data.permisos ?? []
      const next = current.includes(key) ? current.filter(p => p !== key) : [...current, key]
      return { ...m, data: { ...m.data, permisos: next } }
    })
  }

  const inp = inputStyle()

  const usuariosFiltrados = filtroRol === 'TODOS' ? usuarios : usuarios.filter(u => u.rol === filtroRol)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Gestión de usuarios</h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{usuarios.length} usuarios registrados</div>
        </div>
        {canCreate && (
          <button onClick={openNew}
            style={{ padding: '7px 14px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
            + Nuevo usuario
          </button>
        )}
      </div>

      {/* Stats por rol */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', marginBottom: '14px' }}>
        {(['TODOS', ...Object.keys(ROL_META)] as const).map(rol => {
          const count = rol === 'TODOS' ? usuarios.filter(u => u.activo).length : usuarios.filter(u => u.rol === rol && u.activo).length
          const meta = rol !== 'TODOS' ? ROL_META[rol] : null
          const isActive = filtroRol === rol
          return (
            <div key={rol} onClick={() => setFiltroRol(rol)}
              style={{ background: 'var(--card)', border: `1px solid ${isActive ? '#185FA5' : 'var(--border)'}`, borderRadius: '10px', padding: '10px 14px', cursor: 'pointer', boxShadow: isActive ? '0 0 0 2px rgba(24,95,165,0.12)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)' }}>{meta?.label ?? 'Todos los roles'}</div>
                  {meta && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px', lineHeight: 1.3 }}>{meta.desc}</div>}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: meta?.color ?? '#185FA5', lineHeight: 1, marginLeft: '8px' }}>{count}</div>
              </div>
              {meta && (
                <div style={{ marginTop: '6px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '3px', background: meta.bg, color: meta.color }}>{meta.label}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--muted)' }}>
              {['Usuario', 'Correo', 'Celular', 'Cluster', 'Rol', 'Estado', ''].map(h => (
                <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuariosFiltrados.map((u, idx) => {
              const rc = ROL_META[u.rol] ?? ROL_META.AGENTE
              const nombreCompleto = [u.nombre, u.apellido].filter(Boolean).join(' ')
              return (
                <tr key={u.id}
                  style={{ borderTop: idx > 0 ? '0.5px solid var(--border)' : 'none', opacity: u.activo ? 1 : 0.45, cursor: 'pointer' }}
                  onClick={() => openHistorial(u)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: rc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: rc.color, flexShrink: 0 }}>
                        {initials(u.nombre, u.apellido)}
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 500 }}>{nombreCompleto}</div>
                        {!u.activo && <div style={{ fontSize: '9px', color: '#dc2626', fontWeight: 600 }}>INACTIVO</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted-foreground)' }}>{u.email}</td>
                  <td style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{u.celular || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted-foreground)' }}>{u.cluster || <span style={{ color: 'var(--border)' }}>—</span>}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: rc.bg, color: rc.color }}>{rc.label}</span>
                    {u.permisos && Array.isArray(u.permisos) && u.permisos.length > 0 && (
                      <div style={{ fontSize: '9px', color: '#854F0B', marginTop: '2px' }}>Permisos personalizados</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                    {canEdit ? (
                      <button onClick={() => toggleActivo(u)}
                        style={{ position: 'relative', width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: u.activo ? '#22c55e' : '#d1d5db', transition: 'background 0.2s' }}>
                        <span style={{ position: 'absolute', top: '2px', left: u.activo ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                      </button>
                    ) : (
                      <span style={{ fontSize: '10px', fontWeight: 600, color: u.activo ? '#15803d' : '#dc2626' }}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {canEdit && (
                        <button onClick={() => openEdit(u)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: '13px', padding: '3px 7px', borderRadius: '5px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--muted)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                          ✏
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={() => handleDelete(u)}
                          title="Eliminar usuario"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '13px', padding: '3px 7px', borderRadius: '5px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.08)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                          🗑
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {usuariosFiltrados.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
            Sin usuarios para este rol
          </div>
        )}
      </div>

      {/* Panel historial */}
      {historial.open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} onClick={() => setHistorial(p => ({ ...p, open: false }))} />
          <div style={{ width: '520px', background: 'var(--card)', borderLeft: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Historial de gestión — {historial.usuario?.nombre}</div>
              <button onClick={() => setHistorial(p => ({ ...p, open: false }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', padding: '10px 18px 0', flexShrink: 0, borderBottom: '0.5px solid var(--border)' }}>
              {(['todos', 'resueltos'] as const).map(tab => (
                <button key={tab} onClick={() => setHistorialTab(tab)} style={{
                  padding: '5px 12px', fontSize: '11px', fontWeight: 500, border: 'none', cursor: 'pointer',
                  borderRadius: '6px 6px 0 0', marginBottom: '-0.5px',
                  background: historialTab === tab ? 'var(--card)' : 'transparent',
                  color: historialTab === tab ? 'var(--foreground)' : 'var(--muted-foreground)',
                  borderBottom: historialTab === tab ? '2px solid #185FA5' : '2px solid transparent',
                }}>
                  {tab === 'todos' ? 'Todos' : 'Resueltos por mí'}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {historial.loading ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Cargando...</div>
              ) : historial.items.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Sin incidentes registrados</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--muted)', position: 'sticky', top: 0 }}>
                      {['Código', 'Tienda', 'Tipo', 'MTTR', 'Estado', 'Fecha', 'Resolución'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(historialTab === 'resueltos'
                      ? historial.items.filter((inc: any) => inc.resueltoPor === 'AGENTE')
                      : historial.items
                    ).map((inc: any) => (
                      <tr key={inc.id} style={{ borderTop: '0.5px solid var(--border)' }}>
                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 600, fontSize: '11px' }}>{inc.codigo}</td>
                        <td style={{ padding: '7px 10px', fontSize: '11px', color: 'var(--muted-foreground)' }}>{inc.tiendaCodigo ?? '—'}</td>
                        <td style={{ padding: '7px 10px', fontSize: '11px' }}>{inc.tipo ?? '—'}</td>
                        <td style={{ padding: '7px 10px', fontSize: '11px' }}>{fmtMttr(inc.mttrMinutos)}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: '#f3f4f6', color: '#374151' }}>{inc.estado}</span>
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: '10px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                          {inc.horaRegistro ? new Date(inc.horaRegistro).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          {inc.resueltoPor === 'AGENTE' && (
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', background: '#EFF6FF', color: '#1D4ED8' }}>↩ Agente</span>
                          )}
                          {inc.resueltoPor === 'PROVEEDOR' && (
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', background: '#F0FDF4', color: '#15803D' }}>↩ Proveedor</span>
                          )}
                          {!inc.resueltoPor && <span style={{ color: 'var(--muted-foreground)', fontSize: '10px' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '520px', maxHeight: '92vh', overflow: 'auto' }}>
            <div style={{ padding: '14px 20px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{modal.isNew ? 'Nuevo usuario' : 'Editar usuario'}</div>
              <button onClick={() => setModal(m => ({ ...m, open: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Nombre</label>
                  <input value={modal.data.nombre} onChange={e => setField('nombre', e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Apellido</label>
                  <input value={modal.data.apellido ?? ''} onChange={e => setField('apellido', e.target.value)} style={inp} />
                </div>
              </div>

              {[['email', 'Correo'], ['celular', 'Celular']].map(([k, l]) => (
                <div key={k} style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>{l}</label>
                  <input value={modal.data[k] ?? ''} onChange={e => setField(k, e.target.value)} style={inp} />
                </div>
              ))}

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Contraseña</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input type={showPass ? 'text' : 'password'} value={modal.data.password ?? ''} onChange={e => setField('password', e.target.value)} style={{ ...inp, flex: 1 }} />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    style={{ padding: '7px 10px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--muted)', cursor: 'pointer', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    {showPass ? 'Ocultar' : 'Ver'}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Rol</label>
                <select value={modal.data.rol} onChange={e => setField('rol', e.target.value)} style={inp}>
                  {Object.entries(ROL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                {modal.data.rol && ROL_META[modal.data.rol] && (
                  <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '4px' }}>{ROL_META[modal.data.rol].desc}</div>
                )}
              </div>

              {/* Permisos — solo quien puede editar usuarios */}
              {canEdit && (
                <div style={{ marginBottom: '14px', padding: '12px', background: 'var(--muted)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                    Permisos del sistema
                  </div>
                  {PERMISOS_GRUPOS.map(grupo => (
                    <div key={grupo.key} style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {grupo.key}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                        {grupo.items.map(item => {
                          const checked = (modal.data.permisos ?? []).includes(item.key)
                          return (
                            <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', padding: '3px 0' }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePermiso(item.key)}
                                style={{ width: '13px', height: '13px', cursor: 'pointer' }}
                              />
                              <span style={{ color: 'var(--foreground)' }}>{item.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <button type="button" onClick={() => setField('activo', !modal.data.activo)}
                  style={{ position: 'relative', width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: modal.data.activo ? '#22c55e' : '#d1d5db' }}>
                  <span style={{ position: 'absolute', top: '2px', left: modal.data.activo ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white' }} />
                </button>
                <span style={{ fontSize: '12px', color: 'var(--foreground)' }}>{modal.data.activo ? 'Activo' : 'Inactivo'}</span>
              </div>

              {saveError && (
                <div style={{ marginBottom: '10px', padding: '8px 12px', background: '#fee2e2', border: '0.5px solid #fca5a5', borderRadius: '7px', fontSize: '11px', color: '#b91c1c' }}>
                  {saveError}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setModal(m => ({ ...m, open: false })); setSaveError('') }}
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
