'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { PERMISOS_POR_ROL } from '@/lib/permisos'

const ROL_COLORS: Record<string, { bg: string; color: string }> = {
  AGENTE:          { bg: '#f3f4f6', color: '#374151' },
  SUPERVISOR:      { bg: '#dbeafe', color: '#1e40af' },
  GERENCIA:        { bg: '#dcfce7', color: '#15803d' },
  INFRAESTRUCTURA: { bg: '#ede9fe', color: '#7c3aed' },
}

const PERMISOS_GRUPOS = [
  {
    key: 'INCIDENTES',
    items: [
      { key: 'incidentes.ver',      label: 'Ver incidentes' },
      { key: 'incidentes.crear',    label: 'Crear incidentes' },
      { key: 'incidentes.editar',   label: 'Editar incidentes' },
      { key: 'incidentes.eliminar', label: 'Eliminar incidentes' },
    ],
  },
  {
    key: 'ESCALAMIENTOS',
    items: [
      { key: 'escalamientos.ver',    label: 'Ver escalamientos' },
      { key: 'escalamientos.crear',  label: 'Crear escalamientos' },
      { key: 'escalamientos.editar', label: 'Editar escalamientos' },
    ],
  },
  {
    key: 'MANTENIMIENTO',
    items: [
      { key: 'mantenimiento.ver',    label: 'Ver mantenimiento' },
      { key: 'mantenimiento.editar', label: 'Editar tiendas' },
    ],
  },
  {
    key: 'USUARIOS',
    items: [
      { key: 'usuarios.ver',    label: 'Ver usuarios' },
      { key: 'usuarios.editar', label: 'Editar usuarios' },
    ],
  },
  {
    key: 'DASHBOARD & REPORTES',
    items: [
      { key: 'dashboard.ver', label: 'Ver dashboard' },
      { key: 'reportes.ver',  label: 'Ver reportes' },
    ],
  },
  {
    key: 'ADMINISTRACIÓN',
    items: [
      { key: 'admin', label: 'Editor bloque A — identificación y tiempos' },
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

function inputStyle(): React.CSSProperties {
  return { width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }
}

export default function UsuariosPage() {
  const { data: session } = useSession()
  const myRol = (session?.user as any)?.rol ?? 'AGENTE'

  const [usuarios, setUsuarios] = useState<any[]>([])
  const [modal, setModal] = useState<{ open: boolean; data: any; isNew: boolean }>({ open: false, data: BLANK, isNew: false })
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const fetchUsuarios = useCallback(async () => {
    const res = await fetch('/api/usuarios')
    setUsuarios(await res.json())
  }, [])

  useEffect(() => { fetchUsuarios() }, [fetchUsuarios])

  function openEdit(u: any) {
    setShowPass(false)
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
    setModal({ open: true, isNew: true, data: { ...BLANK, permisos: [...PERMISOS_POR_ROL['AGENTE']] } })
  }

  async function handleSave() {
    setSaving(true)
    const body = { ...modal.data, cluster: modal.data.cluster || null }
    if (modal.isNew) {
      await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else {
      await fetch(`/api/usuarios/${modal.data.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    setSaving(false)
    setModal(m => ({ ...m, open: false }))
    fetchUsuarios()
  }

  async function handleDelete(u: any) {
    if (!confirm(`¿Eliminar al usuario "${u.nombre}"? Esta acción no se puede deshacer.`)) return
    await fetch(`/api/usuarios/${u.id}`, { method: 'DELETE' })
    fetchUsuarios()
  }

  async function toggleActivo(u: any) {
    await fetch(`/api/usuarios/${u.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !u.activo }) })
    fetchUsuarios()
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

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Gestión de usuarios</h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{usuarios.length} usuarios</div>
        </div>
        <button onClick={openNew}
          style={{ padding: '7px 14px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
          + Nuevo usuario
        </button>
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--muted)' }}>
              {['Usuario', 'Correo', 'Celular', 'Rol', 'Estado', ''].map(h => (
                <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u, idx) => {
              const rc = ROL_COLORS[u.rol] ?? ROL_COLORS.AGENTE
              const nombreCompleto = [u.nombre, u.apellido].filter(Boolean).join(' ')
              return (
                <tr key={u.id} style={{ borderTop: idx > 0 ? '0.5px solid var(--border)' : 'none', opacity: u.activo ? 1 : 0.5 }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#3b82f6', flexShrink: 0 }}>
                        {initials(u.nombre, u.apellido)}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 500 }}>{nombreCompleto}</div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted-foreground)' }}>{u.email}</td>
                  <td style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted-foreground)' }}>{u.celular || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: rc.bg, color: rc.color }}>{u.rol}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => toggleActivo(u)}
                      style={{ position: 'relative', width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: u.activo ? '#22c55e' : '#d1d5db', transition: 'background 0.2s' }}>
                      <span style={{ position: 'absolute', top: '2px', left: u.activo ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                    </button>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => openEdit(u)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: '13px', padding: '3px 7px', borderRadius: '5px' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--muted)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                        ✏
                      </button>
                      {myRol === 'SUPERVISOR' && (
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
      </div>

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
                  {['AGENTE','SUPERVISOR','GERENCIA','INFRAESTRUCTURA'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Permisos — solo SUPERVISOR puede ver y editar */}
              {myRol === 'SUPERVISOR' && (
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
