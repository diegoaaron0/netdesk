'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const ESTADO_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  BORRADOR:  { label: 'Borrador',  bg: '#F1F5F9', color: '#475569' },
  ACTIVA:    { label: 'Activa',    bg: '#ECFDF5', color: '#065F46' },
  HISTORICA: { label: 'Historial', bg: '#F8FAFC', color: '#94A3B8' },
}

function GcTabs({ active }: { active: 'acciones' | 'fichas' }) {
  const router = useRouter()
  const tabs = [
    { id: 'acciones' as const, label: 'Acciones', href: '/gestion-cambios' },
    { id: 'fichas'   as const, label: 'Fichas',   href: '/gestion-cambios/fichas' },
  ]
  return (
    <div style={{ display: 'flex', gap: '2px', borderBottom: '0.5px solid var(--border)', marginBottom: '16px' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => router.push(t.href)}
          style={{ padding: '8px 16px', fontSize: '12px', fontWeight: active === t.id ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer', color: active === t.id ? 'var(--foreground)' : 'var(--muted-foreground)', borderBottom: active === t.id ? '2px solid hsl(221,83%,23%)' : '2px solid transparent', transition: 'color 0.15s' }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export default function FichasPage() {
  const router = useRouter()
  const [rows,   setRows]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [proveedores, setProveedores] = useState<any[]>([])
  const [filtroEstado,    setFiltroEstado]    = useState('')
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [buscar, setBuscar] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filtroEstado)    p.set('estado',      filtroEstado)
    if (filtroProveedor) p.set('proveedorId', filtroProveedor)
    if (buscar)          p.set('buscar',      buscar)
    fetch(`/api/fichas?${p}`)
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [filtroEstado, filtroProveedor, buscar])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/proveedores').then(r => r.json()).then(d => setProveedores(Array.isArray(d) ? d : []))
  }, [])

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>Gestión de Cambios</h1>
          <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
            Fichas de servicio por tienda — contratos y escalamientos
          </p>
        </div>
        <button
          onClick={() => router.push('/gestion-cambios/fichas/nueva')}
          style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 600, background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
          + Nueva ficha
        </button>
      </div>

      <GcTabs active="fichas" />

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input
          value={buscar}
          onChange={e => setBuscar(e.target.value)}
          placeholder="Buscar por código..."
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)', minWidth: '160px' }}
        />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)' }}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)' }}>
          <option value="">Todos los proveedores</option>
          {proveedores.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {(filtroEstado || filtroProveedor || buscar) && (
          <button onClick={() => { setFiltroEstado(''); setFiltroProveedor(''); setBuscar('') }}
            style={{ padding: '6px 12px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', cursor: 'pointer' }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Cargando...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>
            No hay fichas{(filtroEstado || filtroProveedor || buscar) ? ' con estos filtros' : ''}.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                {['Estado', 'Código', 'Tienda', 'Proveedor', 'Tipo conexión', 'CID', 'SLA', 'Activa desde', 'Niveles'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const est = ESTADO_CONFIG[r.estado] ?? ESTADO_CONFIG.BORRADOR
                return (
                  <tr key={r.id}
                    onClick={() => router.push(`/gestion-cambios/fichas/${r.id}`)}
                    style={{ borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: 600, background: est.bg, color: est.color }}>{est.label}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', color: 'hsl(221,83%,23%)', whiteSpace: 'nowrap' }}>{r.codigo}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--foreground)' }}>{r.tiendaCodigo}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{r.tiendaNombreCc}</div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--foreground)', whiteSpace: 'nowrap' }}>{r.proveedorNombre}</td>
                    <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{r.tipoConexion ?? '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{r.cidServicio ?? '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{r.slaComprometido ?? '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                      {r.activadoEn ? new Date(r.activadoEn).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' }) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--muted-foreground)', textAlign: 'center' }}>
                      {r.totalNiveles > 0
                        ? <span style={{ background: '#EFF6FF', color: '#1D4ED8', padding: '1px 7px', borderRadius: '99px', fontWeight: 600, fontSize: '10px' }}>{r.totalNiveles}</span>
                        : <span style={{ color: '#DC2626', fontSize: '10px' }}>Sin niveles</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--muted-foreground)', textAlign: 'right' }}>
        {rows.length} ficha{rows.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
