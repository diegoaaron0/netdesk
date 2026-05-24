'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Badge, estadoToVariant, impactoToVariant } from '@/components/ui/Badge'


function tiempoTranscurrido(desde: string | Date, hasta?: string | Date | null) {
  const ms = (hasta ? new Date(hasta).getTime() : Date.now()) - new Date(desde).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function limaToday(): string {
  return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)
}

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
}

const OPEN_ESTADOS = ['ABIERTO', 'EN_SEGUIMIENTO', 'ESCALADO_N1', 'ESCALADO_N2', 'ESCALADO_N3']
const CLOSED_ESTADOS = ['RESUELTO', 'CANCELADO', 'CERRADO']

function sortIncidentes(items: any[]): any[] {
  const overdue     = items.filter(i => i.isOverdue).sort((a, b) => new Date(a.horaRegistro).getTime() - new Date(b.horaRegistro).getTime())
  const openRegular = items.filter(i => !i.isOverdue && OPEN_ESTADOS.includes(i.estado)).sort((a, b) => new Date(b.horaRegistro).getTime() - new Date(a.horaRegistro).getTime())
  const closed      = items.filter(i => !i.isOverdue && !OPEN_ESTADOS.includes(i.estado)).sort((a, b) => new Date(b.horaRegistro).getTime() - new Date(a.horaRegistro).getTime())
  return [...overdue, ...openRegular, ...closed]
}

// SVG icons
const IconAbiertos = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#378ADD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 2v4M16 2v4M2 10h20"/>
  </svg>
)
const IconEscalados = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C2600A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
)
const IconResueltos = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#27500A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
)

export default function IncidentesPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const userRol  = (session?.user as any)?.rol ?? 'AGENTE'
  const today    = limaToday()

  const [data, setData]                       = useState<any[]>([])
  const [agentes, setAgentes]                 = useState<any[]>([])
  const [proveedoresList, setProveedoresList] = useState<any[]>([])
  const [myId, setMyId]                       = useState<string | null>(null)

  const [fechaDesde, setFechaDesde]           = useState(today)
  const [fechaHasta, setFechaHasta]           = useState(today)
  const [estado, setEstado]                   = useState('')
  const [agente, setAgente]                   = useState('')
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [filtroResolucion, setFiltroResolucion] = useState<'todos'|'agente'|'proveedor'>('todos')
  const [misRegistros, setMisRegistros]         = useState(false)
  const [q, setQ]                               = useState('')
  const [debouncedQ, setDebouncedQ]           = useState('')
  const [page, setPage]                       = useState(1)
  const [perPage]                             = useState(20)
  const [, setTick]                           = useState(0)

  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(t) }, [q])
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 30000); return () => clearInterval(id) }, [])

  useEffect(() => {
    const tiendaId    = searchParams.get('tiendaId')
    const proveedorId = searchParams.get('proveedorId')
    const codigo      = searchParams.get('codigo')
    if (codigo) setQ(codigo)
    if (tiendaId) {
      fetch('/api/tiendas').then(r => r.json()).then((list: any[]) => {
        if (!Array.isArray(list)) return
        const t = list.find((x: any) => x.id === tiendaId)
        if (t) setQ(t.codigo)
      }).catch(() => {})
    }
    if (proveedorId) {
      fetch('/api/proveedores').then(r => r.json()).then((list: any[]) => {
        if (!Array.isArray(list)) return
        const p = list.find((x: any) => x.id === proveedorId)
        if (p) setFiltroProveedor(p.nombre)
      }).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams()
    if (estado) params.set('estado', estado)
    if (agente) params.set('agente', agente)
    if (debouncedQ) {
      params.set('q', debouncedQ)
    } else {
      params.set('fechaDesde', fechaDesde)
      params.set('fechaHasta', fechaHasta)
    }
    const res  = await fetch(`/api/incidentes?${params}`)
    const rows = await res.json()
    setData(Array.isArray(rows) ? rows : [])
    setPage(1)
  }, [estado, agente, fechaDesde, fechaHasta, debouncedQ])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    fetch('/api/usuarios/publico').then(r => r.json()).then((list: any[]) => {
      if (!Array.isArray(list)) return
      setAgentes(list)
      const email = (session?.user as any)?.email
      if (email) {
        const me = list.find((a: any) => a.email === email)
        if (me) setMyId(me.id)
      }
    })
  }, [session?.user])

  useEffect(() => {
    fetch('/api/proveedores').then(r => r.json()).then((list: any[]) => {
      if (Array.isArray(list)) setProveedoresList(list)
    })
  }, [])

  function clearFilters() {
    const t = limaToday()
    setFechaDesde(t); setFechaHasta(t)
    setEstado(''); setAgente(''); setFiltroProveedor('')
    setFiltroResolucion('todos')
    setMisRegistros(false); setQ(''); setPage(1)
  }

  async function handleDelete(e: React.MouseEvent, incId: string) {
    e.stopPropagation()
    if (!confirm('¿Eliminar este incidente? Esta acción no se puede deshacer.')) return
    await fetch(`/api/incidentes/${incId}`, { method: 'DELETE' })
    fetchData()
  }

  // Filter + sort (text search is handled server-side when q is set)
  const filtered = sortIncidentes(data).filter(inc => {
    if (misRegistros && myId && inc.agenteId !== myId) return false
    if (filtroProveedor && inc.proveedorNombre !== filtroProveedor) return false
    if (filtroResolucion !== 'todos') {
      const expected = filtroResolucion === 'agente' ? 'AGENTE' : 'PROVEEDOR'
      if (inc.resueltoPor !== expected) return false
    }
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage)

  // Metrics (over full data, not filtered)
  const abiertos  = data.filter(i => OPEN_ESTADOS.includes(i.estado)).length
  const escalados = data.filter(i => i.estado?.startsWith('ESCALADO')).length
  const resueltos = data.filter(i => i.estado === 'RESUELTO').length

  const selStyle: React.CSSProperties = {
    padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)',
    borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none',
  }
  const inputStyle: React.CSSProperties = {
    ...selStyle, minWidth: '260px', flex: 1,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--foreground)', margin: 0, lineHeight: 1.2 }}>Incidentes</h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '3px' }}>Resumen y listado de incidentes</div>
        </div>
        <button
          onClick={() => router.push('/incidentes/nuevo')}
          style={{
            padding: '9px 20px', background: 'hsl(221,83%,45%)', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            boxShadow: '0 1px 3px rgba(59,130,246,0.3)',
          }}>
          + Nuevo incidente
        </button>
      </div>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        {[
          { label: 'Abiertos', value: abiertos, color: '#185FA5', sub: 'incidentes', icon: <IconAbiertos /> },
          { label: 'Escalados', value: escalados, color: '#854F0B', sub: 'incidentes', icon: <IconEscalados /> },
          { label: 'Resueltos', value: resueltos, color: '#27500A', sub: 'incidentes', icon: <IconResueltos /> },
        ].map(m => (
          <div key={m.label} style={{ background: 'var(--card)', borderRadius: '10px', padding: '14px 16px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {m.icon}
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 600, color: m.value > 0 ? m.color : 'var(--foreground)', lineHeight: 1.1 }}>{m.value}</div>
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Fila 1: búsqueda global + mis registros */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            placeholder="Buscar por código, ID InvGate o tienda... (busca en todo el historial)"
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1) }}
            style={{ ...inputStyle }}
          />
          <button
            onClick={() => { setMisRegistros(v => !v); setPage(1) }}
            style={{
              padding: '6px 14px', fontSize: '12px', fontWeight: misRegistros ? 600 : 400,
              border: misRegistros ? '1px solid #166534' : '1px solid var(--border)',
              borderRadius: '8px', cursor: 'pointer',
              background: misRegistros ? '#14532d' : 'var(--card)',
              color: misRegistros ? '#86efac' : 'var(--foreground)', outline: 'none',
              whiteSpace: 'nowrap',
            }}>
            Mis registros
          </button>
        </div>

        {/* Fila 2: fechas + selects + limpiar */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Fecha desde</label>
            <input type="date" value={fechaDesde}
              onChange={e => { setFechaDesde(e.target.value); setPage(1) }}
              style={{ ...selStyle }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Fecha hasta</label>
            <input type="date" value={fechaHasta}
              onChange={e => { setFechaHasta(e.target.value); setPage(1) }}
              style={{ ...selStyle }} />
          </div>

          <select value={estado} onChange={e => { setEstado(e.target.value); setPage(1) }} style={selStyle}>
            <option value="">Estados</option>
            {['ABIERTO','EN_SEGUIMIENTO','ESCALADO_N1','ESCALADO_N2','ESCALADO_N3','RESUELTO','CANCELADO','CERRADO'].map(e => (
              <option key={e} value={e}>{e.replace(/_/g,' ')}</option>
            ))}
          </select>

          <select
            value={filtroResolucion}
            onChange={e => {
              const val = e.target.value as 'todos'|'agente'|'proveedor'
              setFiltroResolucion(val)
              if (val !== 'todos' && estado !== 'RESUELTO') setEstado('RESUELTO')
              setPage(1)
            }}
            style={selStyle}>
            <option value="todos">Resolución</option>
            <option value="agente">Por agente</option>
            <option value="proveedor">Por proveedor</option>
          </select>

          <select value={filtroProveedor} onChange={e => { setFiltroProveedor(e.target.value); setPage(1) }} style={selStyle}>
            <option value="">Proveedores</option>
            {proveedoresList.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
          </select>

          <select value={agente} onChange={e => { setAgente(e.target.value); setPage(1) }} style={selStyle}>
            <option value="">Agentes</option>
            {agentes.filter(a => a.rol === 'AGENTE' || a.rol === 'SUPERVISOR' || a.rol === 'INFRAESTRUCTURA').map(a => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>

          <button onClick={clearFilters}
            style={{ padding: '6px 10px', fontSize: '11px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--card)', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              {['ID / Hora', 'Tienda', 'Usuario', 'Tipo', 'Impacto', 'Estado', 'Cluster', 'Tiempo', ''].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '32px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
                  No hay incidentes para mostrar
                </td>
              </tr>
            )}
            {paginated.map((inc, idx) => {
              const isOpen    = OPEN_ESTADOS.includes(inc.estado) && !inc.isOverdue
              const isOverdue = !!inc.isOverdue
              const isClosed  = CLOSED_ESTADOS.includes(inc.estado) && !inc.isOverdue

              let rowBg       = 'transparent'
              let rowBgHover  = 'var(--muted)'
              let textColor   = 'var(--foreground)'
              let mutedColor  = 'var(--muted-foreground)'

              if (isOverdue) {
                rowBg      = 'rgba(239,68,68,0.06)'
                rowBgHover = 'rgba(239,68,68,0.12)'
                textColor  = '#dc2626'
                mutedColor = '#f87171'
              } else if (isOpen) {
                rowBg      = '#0d1117'
                rowBgHover = '#111827'
                textColor  = 'rgba(255,255,255,0.9)'
                mutedColor = 'rgba(255,255,255,0.45)'
              } else if (isClosed) {
                rowBg      = 'rgba(0,0,0,0.02)'
                rowBgHover = 'rgba(0,0,0,0.05)'
              }

              return (
                <tr key={inc.id}
                  onClick={() => router.push(`/incidentes/${inc.id}`)}
                  style={{
                    borderTop:  idx > 0 ? '1px solid var(--border)' : 'none',
                    borderLeft: isOverdue ? '3px solid #ef4444' : (isOpen ? '3px solid #1d4ed8' : '3px solid transparent'),
                    background: rowBg,
                    cursor:     'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = rowBgHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>

                  {/* ID / Hora */}
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: textColor }}>
                      {inc.codigo}
                    </div>
                    {inc.ticketInvgate && (
                      <div style={{ fontSize: '10px', color: mutedColor, marginTop: '1px' }}>#{inc.ticketInvgate}</div>
                    )}
                    <div style={{ fontSize: '10px', color: mutedColor, marginTop: '1px' }}>
                      {new Date(inc.horaRegistro).toLocaleString('es-PE', {
                        timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit',
                        day: '2-digit', month: '2-digit',
                      })}
                    </div>
                  </td>

                  {/* Tienda */}
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, lineHeight: 1, color: textColor }}>
                      {inc.tiendaCodigo}
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '2px', color: textColor }}>
                      {inc.tiendaNombre}
                    </div>
                    <div style={{ fontSize: '10px', marginTop: '1px', color: mutedColor }}>
                      {inc.proveedorNombre} · {inc.tiendaDistrito}
                    </div>
                  </td>

                  {/* Usuario */}
                  <td style={{ padding: '9px 12px', fontSize: '11px', color: mutedColor, whiteSpace: 'nowrap' }}>
                    {inc.agenteName ?? '—'}
                  </td>

                  {/* Tipo */}
                  <td style={{ padding: '9px 12px', fontSize: '11px', color: textColor, whiteSpace: 'nowrap' }}>
                    {TIPO_LABELS[inc.tipo] ?? inc.tipo}
                    {inc.tipoPersonalizado && (
                      <div style={{ fontSize: '10px', color: mutedColor, marginTop: '1px' }}>{inc.tipoPersonalizado}</div>
                    )}
                  </td>

                  {/* Impacto */}
                  <td style={{ padding: '9px 12px' }}><Badge variant={impactoToVariant(inc.nivelImpacto)} /></td>

                  {/* Estado */}
                  <td style={{ padding: '9px 12px' }}>
                    <Badge variant={estadoToVariant(inc.estado)} />
                    {inc.estado === 'RESUELTO' && inc.resueltoPor && (
                      <span style={{ display: 'block', marginTop: '2px', fontSize: '10px', padding: '1px 6px', borderRadius: '999px', fontWeight: 600, background: inc.resueltoPor === 'AGENTE' ? '#EFF6FF' : '#F0FDF4', color: inc.resueltoPor === 'AGENTE' ? '#1D4ED8' : '#15803D' }}>
                        {inc.resueltoPor === 'AGENTE' ? '↩ Agente' : '↩ Proveedor'}
                      </span>
                    )}
                  </td>

                  {/* Cluster */}
                  <td style={{ padding: '9px 12px' }}>
                    {inc.tiendaCluster
                      ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, fontFamily: 'monospace', background: isOpen ? 'rgba(255,255,255,0.1)' : 'var(--muted)', color: isOpen ? 'rgba(255,255,255,0.8)' : 'var(--foreground)', letterSpacing: '0.05em' }}>{inc.tiendaCluster}</span>
                      : <span style={{ color: mutedColor, fontSize: '10px' }}>—</span>
                    }
                  </td>

                  {/* Tiempo */}
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: '11px', fontWeight: isOverdue ? 700 : 400, color: isOverdue ? '#dc2626' : mutedColor, whiteSpace: 'nowrap' }}>
                    {tiempoTranscurrido(inc.horaRegistro, inc.horaFin)}
                  </td>

                  {/* Acciones */}
                  <td style={{ padding: '9px 12px' }}>
                    {inc.estado === 'CANCELADO' && userRol === 'SUPERVISOR' && (
                      <button
                        onClick={e => handleDelete(e, inc.id)}
                        title="Eliminar incidente"
                        style={{ padding: '4px 8px', fontSize: '11px', background: 'rgba(220,38,38,0.1)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.2)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.1)' }}>
                        <IconTrash /> Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Paginación */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
            {filtered.length === 0
              ? 'Sin resultados'
              : `Mostrando ${(page - 1) * perPage + 1} a ${Math.min(page * perPage, filtered.length)} de ${filtered.length}`
            }
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--foreground)', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>
              ‹
            </button>
            <span style={{ fontSize: '12px', padding: '4px 10px', border: '1px solid hsl(221,83%,45%)', borderRadius: '6px', background: 'hsl(221,83%,45%)', color: 'white', minWidth: '28px', textAlign: 'center' }}>
              {page}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--foreground)', cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>
              ›
            </button>
            <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginLeft: '4px' }}>20 por página</span>
          </div>
        </div>
      </div>
    </div>
  )
}
