'use client'
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { MetricCard } from '@/components/ui/MetricCard'
import { Badge, estadoToVariant, impactoToVariant } from '@/components/ui/Badge'

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
}

function toDate(d: string) { return new Date(d).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) }

export default function ReportesPage() {
  const [data, setData] = useState<any[]>([])
  const [filtros, setFiltros] = useState({
    desde: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    hasta: new Date().toISOString().slice(0, 10),
    proveedor: '',
    estado: '',
  })

  useEffect(() => {
    const params = new URLSearchParams()
    if (filtros.estado) params.set('estado', filtros.estado)
    if (filtros.desde) params.set('fecha', filtros.desde)
    fetch(`/api/incidentes?${params}`).then(r => r.json()).then(rows => {
      const filtered = rows.filter((r: any) => {
        const d = new Date(r.horaRegistro)
        const desde = new Date(filtros.desde)
        const hasta = new Date(filtros.hasta); hasta.setDate(hasta.getDate() + 1)
        if (d < desde || d > hasta) return false
        if (filtros.proveedor && r.proveedorNombre !== filtros.proveedor) return false
        return true
      })
      setData(filtered)
    })
  }, [filtros])

  const total = data.length
  const resueltos = data.filter(i => i.mttrMinutos)
  const mttrAvg = resueltos.length > 0 ? Math.round(resueltos.reduce((s: number, i: any) => s + i.mttrMinutos, 0) / resueltos.length) : 0
  const pctEscalados = total > 0 ? Math.round((data.filter(i => i.estado?.startsWith('ESCALADO')).length / total) * 100) : 0

  const provMttr: Record<string, number[]> = {}
  data.forEach(i => {
    const n = i.proveedorNombre ?? 'Sin proveedor'
    if (i.mttrMinutos) (provMttr[n] = provMttr[n] ?? []).push(i.mttrMinutos)
  })
  const peorProveedor = Object.entries(provMttr).sort((a, b) => {
    const avgA = a[1].reduce((s, v) => s + v, 0) / a[1].length
    const avgB = b[1].reduce((s, v) => s + v, 0) / b[1].length
    return avgB - avgA
  })[0]?.[0] ?? '—'

  const chartData: Record<string, number> = {}
  data.forEach(i => {
    const d = new Date(i.horaRegistro).toLocaleDateString('es-PE', { timeZone: 'America/Lima', month: '2-digit', day: '2-digit' })
    chartData[d] = (chartData[d] ?? 0) + 1
  })
  const chartRows = Object.entries(chartData).sort().map(([fecha, total]) => ({ fecha, total }))

  const uniqueProvs = [...new Set(data.map(i => i.proveedorNombre).filter(Boolean))]

  function exportCSV() {
    const headers = ['Código', 'Tienda', 'Proveedor', 'Tipo', 'Impacto', 'Estado', 'MTTR', 'Hora registro']
    const rows = data.map(i => [
      i.codigo, i.tiendaNombre, i.proveedorNombre, TIPO_LABELS[i.tipo] ?? i.tipo,
      i.nivelImpacto, i.estado, i.mttrMinutos ?? '', toDate(i.horaRegistro),
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `reporte-netdesk-${filtros.desde}-${filtros.hasta}.csv`
    a.click()
  }

  function inputStyle(): React.CSSProperties {
    return { padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Reportes</h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{total} incidentes en el período</div>
        </div>
        <button onClick={exportCSV}
          style={{ padding: '7px 14px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
          Exportar CSV
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div><label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Desde</label>
          <input type="date" style={inputStyle()} value={filtros.desde} onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} /></div>
        <div><label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Hasta</label>
          <input type="date" style={inputStyle()} value={filtros.hasta} onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} /></div>
        <div><label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Proveedor</label>
          <select style={inputStyle()} value={filtros.proveedor} onChange={e => setFiltros(f => ({ ...f, proveedor: e.target.value }))}>
            <option value="">Todos</option>
            {uniqueProvs.map(p => <option key={p} value={p}>{p}</option>)}
          </select></div>
        <div><label style={{ fontSize: '10px', color: 'var(--muted-foreground)', display: 'block', marginBottom: '3px' }}>Estado</label>
          <select style={inputStyle()} value={filtros.estado} onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}>
            <option value="">Todos</option>
            {['ABIERTO', 'EN_SEGUIMIENTO', 'ESCALADO_N1', 'ESCALADO_N2', 'ESCALADO_N3', 'RESUELTO', 'CANCELADO', 'CERRADO'].map(e => (
              <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>
            ))}
          </select></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        <MetricCard label="Total" value={total} />
        <MetricCard label="MTTR promedio" value={mttrAvg > 0 ? `${mttrAvg}m` : '—'} />
        <MetricCard label="% Escalados" value={`${pctEscalados}%`} valueColor={pctEscalados > 30 ? '#A32D2D' : undefined} />
        <MetricCard label="Peor proveedor" value={peorProveedor} sub="por MTTR" />
      </div>

      {chartRows.length > 0 && (
        <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>Incidentes por día</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="total" stroke="#378ADD" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', fontSize: '12px', fontWeight: 600 }}>Detalle de incidentes</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--muted)' }}>
                {['Código', 'Tienda', 'Proveedor', 'Tipo', 'Impacto', 'Estado', 'MTTR', 'Fecha'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Sin datos en el período</td></tr>
              )}
              {data.map((i, idx) => (
                <tr key={i.id} style={{ borderTop: idx > 0 ? '0.5px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '10px' }}>{i.codigo}</td>
                  <td style={{ padding: '7px 10px', fontSize: '11px' }}>{i.tiendaNombre}</td>
                  <td style={{ padding: '7px 10px', fontSize: '11px' }}>{i.proveedorNombre}</td>
                  <td style={{ padding: '7px 10px', fontSize: '11px' }}>{TIPO_LABELS[i.tipo] ?? i.tipo}</td>
                  <td style={{ padding: '7px 10px' }}><Badge variant={impactoToVariant(i.nivelImpacto)} /></td>
                  <td style={{ padding: '7px 10px' }}><Badge variant={estadoToVariant(i.estado)} /></td>
                  <td style={{ padding: '7px 10px', fontSize: '11px' }}>{i.mttrMinutos ? `${i.mttrMinutos}m` : '—'}</td>
                  <td style={{ padding: '7px 10px', fontSize: '11px', color: 'var(--muted-foreground)' }}>{toDate(i.horaRegistro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
