'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { apiMutate } from '@/lib/api-mutate'
import { TIPO_LABELS } from '@/lib/gestion-cambios-config'

function GcTabs({ active }: { active: 'acciones' | 'fichas' }) {
  const router = useRouter()
  const tabs = [
    { id: 'acciones' as const, label: 'Acciones',   href: '/gestion-cambios' },
    { id: 'fichas'   as const, label: 'Fichas',     href: '/gestion-cambios/fichas' },
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

const ESTADO_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  BORRADOR:      { label: 'Borrador',       bg: '#F1F5F9', color: '#475569' },
  PROPUESTO:     { label: 'Propuesto',      bg: '#EFF6FF', color: '#1D4ED8' },
  APROBADO:      { label: 'Aprobado',       bg: '#F0FDF4', color: '#15803D' },
  COMPLETADO:    { label: 'Completado',     bg: '#ECFDF5', color: '#065F46' },
  RECHAZADO:     { label: 'Rechazado',      bg: '#FEF2F2', color: '#991B1B' },
  CANCELADO:     { label: 'Cancelado',      bg: '#F8FAFC', color: '#94A3B8' },
}

function fmtFecha(d: string | null) {
  if (!d) return '—'
  return new Date(d + (d.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima',
  })
}

function diasParaEval(fechaStr: string | null) {
  if (!fechaStr) return null
  const diff = Math.ceil((new Date(fechaStr + 'T12:00:00').getTime() - Date.now()) / 86400000)
  return diff
}

export default function GestionCambiosPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [rows, setRows]           = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroTipo,   setFiltroTipo]   = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const userRol = (session?.user as any)?.rol ?? ''
  const userId  = (session?.user as any)?.id  ?? ''
  const puedeEliminar = (r: any) =>
    r.estado === 'BORRADOR' && (r.creadoPorId === userId || ['SUPERVISOR', 'GERENCIA', 'DEMO'].includes(userRol))

  async function eliminarBorrador(e: React.MouseEvent, id: string, codigo: string) {
    e.stopPropagation()
    if (!confirm(`¿Eliminar el borrador ${codigo}?`)) return
    setDeletingId(id)
    const { ok } = await apiMutate(`/api/gestion-cambios/${id}`, { method: 'DELETE', errorPrefix: 'No se pudo eliminar el borrador' })
    setDeletingId(null)
    if (!ok) return
    load()
  }

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filtroEstado) params.set('estado', filtroEstado)
    if (filtroTipo)   params.set('tipo',   filtroTipo)
    fetch(`/api/gestion-cambios?${params}`)
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [filtroEstado, filtroTipo])

  useEffect(() => { load() }, [load])

  const pendientesAprobacion = rows.filter(r => r.estado === 'PROPUESTO').length
  // Acciones completadas con evaluaciones 30/90 aún pendientes (la evaluación es opcional)
  const enEvaluacion = rows.filter(r => r.estado === 'COMPLETADO')

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>Gestión de Cambios</h1>
          <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
            Registro formal de acciones de mejora, cambios y evaluaciones TI
          </p>
        </div>
        <button
          onClick={() => router.push('/gestion-cambios/nueva')}
          style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 600, background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
          + Nueva acción
        </button>
      </div>

      <GcTabs active="acciones" />

      {/* Alertas rápidas */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {pendientesAprobacion > 0 && (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', color: '#1D4ED8' }}>
            <strong>{pendientesAprobacion}</strong> acción{pendientesAprobacion > 1 ? 'es' : ''} esperando aprobación de gerencia
          </div>
        )}
        {enEvaluacion.map(r => {
          const dias30 = r.fechaEval30 && !r.eval30Completada ? diasParaEval(r.fechaEval30) : null
          const dias90 = r.fechaEval90 && !r.eval90Completada ? diasParaEval(r.fechaEval90) : null
          const dias   = dias30 ?? dias90
          if (dias === null || dias > 7) return null
          return (
            <div key={r.id} style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', color: '#92400E', cursor: 'pointer' }}
              onClick={() => router.push(`/gestion-cambios/${r.id}`)}>
              <strong>{r.codigo}</strong> — evaluación {dias30 !== null ? '30d' : '90d'} vence en {dias <= 0 ? 'hoy/vencida' : `${dias}d`}
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)' }}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)' }}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {(filtroEstado || filtroTipo) && (
          <button onClick={() => { setFiltroEstado(''); setFiltroTipo('') }}
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
            No hay acciones registradas
            {(filtroEstado || filtroTipo) && ' con estos filtros'}.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                {['Código', 'Tipo', 'Título / Alcance', 'Proveedor', 'Estado', 'Evaluación', 'Creado', ''].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const est    = ESTADO_CONFIG[r.estado] ?? ESTADO_CONFIG.BORRADOR
                const dias30 = r.fechaEval30 && !r.eval30Completada ? diasParaEval(r.fechaEval30) : null
                const dias90 = r.fechaEval90 && !r.eval90Completada ? diasParaEval(r.fechaEval90) : null
                const evalAlert = (dias30 !== null && dias30 <= 7) || (dias90 !== null && dias90 <= 7)
                return (
                  <tr key={r.id}
                    onClick={() => router.push(`/gestion-cambios/${r.id}`)}
                    style={{ borderTop: i > 0 ? '0.5px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', color: 'hsl(221,83%,23%)', whiteSpace: 'nowrap' }}>{r.codigo}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', background: 'var(--muted)', color: 'var(--muted-foreground)', fontWeight: 500 }}>
                        {TIPO_LABELS[r.tipo] ?? r.tipo}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: '280px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>
                        {r.alcance === 'ZONA'
                          ? `Zona: ${r.zonaDescripcion ?? '—'} · ${r.nTiendas} tienda${r.nTiendas !== 1 ? 's' : ''}`
                          : r.tiendaCodigo ? `${r.tiendaCodigo} — ${r.tiendaNombre}` : '—'}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                      {r.proveedorAnteriorNombre && r.proveedorNuevoNombre
                        ? <span style={{ color: 'var(--muted-foreground)' }}>{r.proveedorAnteriorNombre} <span style={{ color: '#059669' }}>→</span> {r.proveedorNuevoNombre}</span>
                        : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: 600, background: est.bg, color: est.color }}>{est.label}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '10px', whiteSpace: 'nowrap' }}>
                      {dias30 !== null && (
                        <span style={{ color: dias30 <= 0 ? '#DC2626' : dias30 <= 7 ? '#D97706' : '#059669', fontWeight: evalAlert ? 700 : 400 }}>
                          30d: {dias30 <= 0 ? 'vencida' : `en ${dias30}d`}
                        </span>
                      )}
                      {dias90 !== null && (
                        <span style={{ marginLeft: dias30 !== null ? '6px' : 0, color: dias90 <= 0 ? '#DC2626' : dias90 <= 7 ? '#D97706' : '#6B7280' }}>
                          90d: {dias90 <= 0 ? 'vencida' : `en ${dias90}d`}
                        </span>
                      )}
                      {dias30 === null && dias90 === null && (
                        <span style={{ color: 'var(--muted-foreground)' }}>
                          {r.eval30Completada && r.eval90Completada ? '✓ Completa' : r.ejecutadoEn ? fmtFecha(r.fechaEval30) : '—'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                      <div>{fmtFecha(r.creadoEn)}</div>
                      <div style={{ fontSize: '10px' }}>{r.creadoPorNombre}</div>
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      {puedeEliminar(r) && (
                        <button
                          onClick={e => eliminarBorrador(e, r.id, r.codigo)}
                          disabled={deletingId === r.id}
                          style={{ padding: '4px 10px', fontSize: '10px', fontWeight: 600, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: '6px', cursor: 'pointer', opacity: deletingId === r.id ? 0.6 : 1 }}>
                          {deletingId === r.id ? '…' : 'Eliminar'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--muted-foreground)', textAlign: 'right' }}>
        {rows.length} acción{rows.length !== 1 ? 'es' : ''}
      </div>
    </div>
  )
}
