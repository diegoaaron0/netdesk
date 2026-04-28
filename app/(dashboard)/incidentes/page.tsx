'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, estadoToVariant, impactoToVariant } from '@/components/ui/Badge'
import { MetricCard } from '@/components/ui/MetricCard'

function tiempoTranscurrido(desde: string | Date, hasta?: string | Date | null) {
  const ms = (hasta ? new Date(hasta).getTime() : Date.now()) - new Date(desde).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
}

export default function IncidentesPage() {
  const router = useRouter()
  const [data, setData] = useState<any[]>([])
  const [agentes, setAgentes] = useState<any[]>([])
  const [filtros, setFiltros] = useState({ q: '', estado: '', agente: '', fecha: '' })
  const [tick, setTick] = useState(0)

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams()
    if (filtros.estado) params.set('estado', filtros.estado)
    if (filtros.agente) params.set('agente', filtros.agente)
    if (filtros.fecha) params.set('fecha', filtros.fecha)
    const res = await fetch(`/api/incidentes?${params}`)
    const rows = await res.json()
    setData(rows)
  }, [filtros])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetch('/api/usuarios').then(r => r.json()).then(setAgentes) }, [])
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const abiertos = data.filter(i => i.estado === 'ABIERTO' || i.estado === 'EN_SEGUIMIENTO').length
  const escalados = data.filter(i => i.estado?.startsWith('ESCALADO')).length
  const resueltosHoy = data.filter(i => {
    if (i.estado !== 'RESUELTO' || !i.horaFin) return false
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    return new Date(i.horaFin) >= hoy
  }).length
  const resueltos = data.filter(i => i.mttrMinutos)
  const mttrAvg = resueltos.length > 0
    ? Math.round(resueltos.reduce((s: number, i: any) => s + i.mttrMinutos, 0) / resueltos.length)
    : 0

  const filtered = data.filter(i => {
    if (!filtros.q) return true
    const q = filtros.q.toLowerCase()
    return i.codigo?.toLowerCase().includes(q) || i.tiendaNombre?.toLowerCase().includes(q) || i.proveedorNombre?.toLowerCase().includes(q)
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Incidentes</h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{data.length} registros</div>
        </div>
        <button onClick={() => router.push('/incidentes/nuevo')}
          style={{ padding: '7px 14px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
          + Nuevo incidente
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        <MetricCard label="Abiertos" value={abiertos} valueColor={abiertos > 0 ? '#185FA5' : undefined} />
        <MetricCard label="Escalados" value={escalados} valueColor={escalados > 0 ? '#854F0B' : undefined} />
        <MetricCard label="Resueltos hoy" value={resueltosHoy} valueColor="#27500A" />
        <MetricCard label="MTTR promedio" value={mttrAvg > 0 ? `${mttrAvg}m` : '—'} sub="minutos" />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <input placeholder="Buscar incidente..." value={filtros.q} onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', minWidth: '200px' }} />
        <select value={filtros.estado} onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los estados</option>
          {['ABIERTO','EN_SEGUIMIENTO','ESCALADO_N1','ESCALADO_N2','ESCALADO_N3','RESUELTO','CANCELADO','CERRADO'].map(e => (
            <option key={e} value={e}>{e.replace('_', ' ')}</option>
          ))}
        </select>
        <select value={filtros.agente} onChange={e => setFiltros(f => ({ ...f, agente: e.target.value }))}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Todos los agentes</option>
          {agentes.filter(a => a.rol === 'AGENTE' || a.rol === 'SUPERVISOR').map(a => (
            <option key={a.id} value={a.id}>{a.nombre}</option>
          ))}
        </select>
        <input type="date" value={filtros.fecha} onChange={e => setFiltros(f => ({ ...f, fecha: e.target.value }))}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
      </div>

      <div style={{ background: 'var(--card)', borderRadius: '10px', overflow: 'hidden', border: '0.5px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--muted)' }}>
              {['ID / Hora', 'Tienda', 'Tipo', 'Impacto', 'Estado', 'Cluster', 'Tiempo'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>No hay incidentes</td></tr>
            )}
            {filtered.map((inc, idx) => {
              const closed = inc.estado === 'RESUELTO' || inc.estado === 'CANCELADO' || inc.estado === 'CERRADO'
              return (
              <tr key={inc.id} onClick={() => router.push(`/incidentes/${inc.id}`)}
                style={{ borderTop: idx > 0 ? '0.5px solid var(--border)' : 'none', cursor: 'pointer', opacity: closed ? 0.52 : 1 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '9px 12px' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, color: 'var(--foreground)' }}>{inc.codigo}</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>
                    {new Date(inc.horaRegistro).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                  </div>
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em', lineHeight: 1 }}>{inc.tiendaCodigo}</div>
                  <div style={{ fontSize: '12px', color: 'var(--foreground)', marginTop: '3px' }}>{inc.tiendaNombre}</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>{inc.proveedorNombre} · {inc.tiendaDistrito}</div>
                </td>
                <td style={{ padding: '9px 12px', fontSize: '11px' }}>{TIPO_LABELS[inc.tipo] ?? inc.tipo}</td>
                <td style={{ padding: '9px 12px' }}><Badge variant={impactoToVariant(inc.nivelImpacto)} /></td>
                <td style={{ padding: '9px 12px' }}><Badge variant={estadoToVariant(inc.estado)} /></td>
                <td style={{ padding: '9px 12px' }}>
                  {inc.tiendaCluster ? (
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, fontFamily: 'monospace', background: 'var(--muted)', color: 'var(--foreground)', letterSpacing: '0.05em' }}>
                      {inc.tiendaCluster}
                    </span>
                  ) : <span style={{ color: 'var(--muted-foreground)', fontSize: '10px' }}>—</span>}
                </td>
                <td style={{ padding: '9px 12px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>
                  {tiempoTranscurrido(inc.horaRegistro, inc.horaFin)}
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  )
}
