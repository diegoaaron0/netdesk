'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Badge, estadoToVariant, impactoToVariant } from '@/components/ui/Badge'
import { MetricCard } from '@/components/ui/MetricCard'

function tiempoTranscurrido(desde: string | Date, hasta?: string | Date | null) {
  const ms = (hasta ? new Date(hasta).getTime() : Date.now()) - new Date(desde).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function limaDateStr(offsetDays = 0): string {
  return new Date(Date.now() - 5 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
}

type QuickFilter = 'hoy' | 'ayer' | '7dias'

export default function IncidentesPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const userRol = (session?.user as any)?.rol ?? 'AGENTE'

  const [data, setData]               = useState<any[]>([])
  const [agentes, setAgentes]         = useState<any[]>([])
  const [myId, setMyId]               = useState<string | null>(null)
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('hoy')
  const [fechaCustom, setFechaCustom] = useState('')
  const [estado, setEstado]           = useState('')
  const [agente, setAgente]           = useState('')
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [misRegistros, setMisRegistros] = useState(false)
  const [q, setQ]                     = useState('')
  const [debouncedQ, setDebouncedQ]   = useState('')
  const [, setTick]                   = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams()
    if (estado)   params.set('estado', estado)
    if (agente)   params.set('agente', agente)

    if (fechaCustom) {
      params.set('fechaDesde', fechaCustom)
      params.set('fechaHasta', fechaCustom)
    } else {
      const today = limaDateStr()
      if (quickFilter === 'hoy') {
        params.set('fechaDesde', today)
        params.set('fechaHasta', today)
      } else if (quickFilter === 'ayer') {
        const ayer = limaDateStr(-1)
        params.set('fechaDesde', ayer)
        params.set('fechaHasta', ayer)
      } else {
        params.set('fechaDesde', limaDateStr(-6))
        params.set('fechaHasta', today)
      }
    }

    const res  = await fetch(`/api/incidentes?${params}`)
    const rows = await res.json()
    setData(Array.isArray(rows) ? rows : [])
  }, [estado, agente, quickFilter, fechaCustom])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    fetch('/api/usuarios').then(r => r.json()).then((list: any[]) => {
      setAgentes(list)
      const email = (session?.user as any)?.email
      if (email) {
        const me = list.find((a: any) => a.email === email)
        if (me) setMyId(me.id)
      }
    })
  }, [session?.user])

  function handleQuickFilter(f: QuickFilter) {
    setQuickFilter(f)
    setFechaCustom('')
  }

  async function handleDelete(e: React.MouseEvent, incId: string) {
    e.stopPropagation()
    if (!confirm('¿Eliminar este incidente? Esta acción no se puede deshacer.')) return
    await fetch(`/api/incidentes/${incId}`, { method: 'DELETE' })
    fetchData()
  }

  const overdue = data.filter(i => i.isOverdue)
  const regular = data.filter(i => !i.isOverdue)

  // Unique proveedores from loaded data
  const proveedoresUnicos = Array.from(new Set(data.map(i => i.proveedorNombre).filter(Boolean))).sort()

  const applyFilters = (items: any[]) => {
    let result = items
    if (misRegistros && myId) result = result.filter(i => i.agenteId === myId)
    if (filtroProveedor) result = result.filter(i => i.proveedorNombre === filtroProveedor)
    if (debouncedQ) {
      const sq = debouncedQ.toLowerCase()
      result = result.filter(i =>
        i.codigo?.toLowerCase().includes(sq) ||
        i.tiendaCodigo?.toLowerCase().includes(sq) ||
        i.tiendaNombre?.toLowerCase().includes(sq)
      )
    }
    return result
  }

  const filteredOverdue = applyFilters(overdue)
  const filteredRegular = applyFilters(regular)
  const allFiltered     = [...filteredOverdue, ...filteredRegular]

  const abiertos    = data.filter(i => i.estado === 'ABIERTO' || i.estado === 'EN_SEGUIMIENTO').length
  const escalados   = data.filter(i => i.estado?.startsWith('ESCALADO')).length
  const resueltosHoy = regular.filter(i => {
    if (i.estado !== 'RESUELTO' || !i.horaFin) return false
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    return new Date(i.horaFin) >= hoy
  }).length
  const conMttr = regular.filter(i => i.mttrMinutos)
  const mttrAvg = conMttr.length > 0
    ? Math.round(conMttr.reduce((s: number, i: any) => s + i.mttrMinutos, 0) / conMttr.length)
    : 0

  const qBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', fontSize: '12px', fontWeight: active ? 600 : 400,
    border: active ? 'none' : '0.5px solid var(--border)',
    borderRadius: '8px', cursor: 'pointer',
    background: active ? 'hsl(221,83%,23%)' : 'var(--card)',
    color: active ? 'white' : 'var(--foreground)', outline: 'none',
    whiteSpace: 'nowrap' as const,
  })

  const selStyle: React.CSSProperties = {
    padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)',
    borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Incidentes</h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
            {allFiltered.length} registros
            {overdue.length > 0 && (
              <span style={{ color: '#dc2626', fontWeight: 600 }}>
                {' · '}{overdue.length} vencido{overdue.length > 1 ? 's' : ''} sin cerrar
              </span>
            )}
          </div>
        </div>
        <button onClick={() => router.push('/incidentes/nuevo')}
          style={{ padding: '7px 14px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
          + Nuevo incidente
        </button>
      </div>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        <MetricCard label="Abiertos" value={abiertos} valueColor={abiertos > 0 ? '#185FA5' : undefined} />
        <MetricCard label="Escalados" value={escalados} valueColor={escalados > 0 ? '#854F0B' : undefined} />
        <MetricCard label="Resueltos hoy" value={resueltosHoy} valueColor="#27500A" />
        <MetricCard label="MTTR promedio" value={mttrAvg > 0 ? `${mttrAvg}m` : '—'} sub="minutos" />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Buscar ID o tienda..."
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ ...selStyle, minWidth: '190px' }}
        />

        <div style={{ display: 'flex', gap: '4px' }}>
          {(['hoy', 'ayer', '7dias'] as QuickFilter[]).map(f => (
            <button key={f} onClick={() => handleQuickFilter(f)}
              style={qBtnStyle(!fechaCustom && quickFilter === f)}>
              {f === 'hoy' ? 'Hoy' : f === 'ayer' ? 'Ayer' : '7 días'}
            </button>
          ))}
        </div>

        <input
          type="date"
          value={fechaCustom}
          onChange={e => setFechaCustom(e.target.value)}
          style={{ ...selStyle, borderColor: fechaCustom ? 'hsl(221,83%,23%)' : 'var(--border)' }}
        />

        <select value={estado} onChange={e => setEstado(e.target.value)} style={selStyle}>
          <option value="">Todos los estados</option>
          {['ABIERTO','EN_SEGUIMIENTO','ESCALADO_N1','ESCALADO_N2','ESCALADO_N3','RESUELTO','CANCELADO','CERRADO'].map(e => (
            <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>
          ))}
        </select>

        <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)} style={selStyle}>
          <option value="">Todos los proveedores</option>
          {proveedoresUnicos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={agente} onChange={e => setAgente(e.target.value)} style={selStyle}>
          <option value="">Todos los agentes</option>
          {agentes.filter(a => a.rol === 'AGENTE' || a.rol === 'SUPERVISOR').map(a => (
            <option key={a.id} value={a.id}>{a.nombre}</option>
          ))}
        </select>

        <button
          onClick={() => setMisRegistros(v => !v)}
          style={{
            padding: '6px 12px', fontSize: '12px', fontWeight: misRegistros ? 600 : 400,
            border: misRegistros ? 'none' : '0.5px solid var(--border)',
            borderRadius: '8px', cursor: 'pointer',
            background: misRegistros ? '#14532d' : 'var(--card)',
            color: misRegistros ? '#86efac' : 'var(--foreground)', outline: 'none',
            whiteSpace: 'nowrap' as const,
          }}>
          Mis registros
        </button>
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--card)', borderRadius: '10px', overflow: 'hidden', border: '0.5px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--muted)' }}>
              {['ID / Hora', 'Tienda', 'Usuario', 'Tipo', 'Impacto', 'Estado', 'Cluster', 'Tiempo', ''].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allFiltered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
                  No hay incidentes
                </td>
              </tr>
            )}
            {allFiltered.map((inc, idx) => {
              const closed    = inc.estado === 'RESUELTO' || inc.estado === 'CANCELADO' || inc.estado === 'CERRADO'
              const isOverdue = !!inc.isOverdue
              const isAbierto = inc.estado === 'ABIERTO'

              const rowBg = isOverdue ? 'rgba(239,68,68,0.04)' : 'transparent'
              const rowBgHover = isOverdue ? 'rgba(239,68,68,0.09)' : 'var(--muted)'
              const textColor = isOverdue ? '#dc2626' : 'var(--foreground)'
              const mutedColor = isOverdue ? '#f87171' : 'var(--muted-foreground)'

              return (
                <tr key={inc.id}
                  onClick={() => router.push(`/incidentes/${inc.id}`)}
                  style={{
                    borderTop:   idx > 0 ? '0.5px solid var(--border)' : 'none',
                    borderLeft:  isOverdue ? '3px solid #ef4444' : (isAbierto ? '3px solid #0f172a' : '3px solid transparent'),
                    background:  rowBg,
                    cursor:      'pointer',
                    opacity:     closed && !isAbierto ? 0.6 : 1,
                    boxShadow:   isAbierto && !isOverdue ? 'inset 0 0 0 1.5px #0f172a' : 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = rowBgHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>

                  {/* ID / Hora */}
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, color: textColor }}>
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
                    <div style={{ fontFamily: 'monospace', fontSize: isAbierto && !isOverdue ? '18px' : '15px', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1, color: isOverdue ? '#dc2626' : (isAbierto ? '#0f172a' : textColor) }}>
                      {inc.tiendaCodigo}
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '3px', fontWeight: isAbierto && !isOverdue ? 600 : 400, color: isOverdue ? '#dc2626' : textColor }}>
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
                  <td style={{ padding: '9px 12px', fontSize: '11px', color: textColor }}>{TIPO_LABELS[inc.tipo] ?? inc.tipo}</td>

                  {/* Impacto */}
                  <td style={{ padding: '9px 12px' }}><Badge variant={impactoToVariant(inc.nivelImpacto)} /></td>

                  {/* Estado */}
                  <td style={{ padding: '9px 12px' }}><Badge variant={estadoToVariant(inc.estado)} /></td>

                  {/* Cluster */}
                  <td style={{ padding: '9px 12px' }}>
                    {inc.tiendaCluster
                      ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, fontFamily: 'monospace', background: 'var(--muted)', color: 'var(--foreground)', letterSpacing: '0.05em' }}>{inc.tiendaCluster}</span>
                      : <span style={{ color: mutedColor, fontSize: '10px' }}>—</span>
                    }
                  </td>

                  {/* Tiempo */}
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: '11px', fontWeight: isOverdue ? 700 : 400, color: isOverdue ? '#dc2626' : mutedColor }}>
                    {tiempoTranscurrido(inc.horaRegistro, inc.horaFin)}
                  </td>

                  {/* Acciones */}
                  <td style={{ padding: '9px 12px' }}>
                    {inc.estado === 'CANCELADO' && userRol === 'SUPERVISOR' && (
                      <button
                        onClick={e => handleDelete(e, inc.id)}
                        title="Eliminar incidente"
                        style={{ padding: '3px 8px', fontSize: '11px', background: 'rgba(220,38,38,0.1)', color: '#dc2626', border: '0.5px solid rgba(220,38,38,0.3)', borderRadius: '5px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.2)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.1)' }}>
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
