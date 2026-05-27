'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { DistribucionTipoResponse, TipoResumen } from '@/types/distribution-type'

interface Props {
  desde: string
  hasta: string
  proveedorId: string
  refreshKey: number
}

function fmtMin(min: number | null | undefined) {
  if (!min) return '—'
  const h = Math.floor(min / 60); const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d: TipoResumen = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px', padding: '8px 10px', fontSize: '11px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: '160px' }}>
      <div style={{ fontWeight: 700, marginBottom: '4px', color: d.color, display: 'flex', alignItems: 'center', gap: '5px' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
        {d.label}
      </div>
      <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div><strong style={{ color: '#0f172a' }}>{d.cantidad}</strong> incidentes · <strong style={{ color: d.color }}>{d.pct}%</strong></div>
        <div>Tiendas afectadas: <strong style={{ color: '#0f172a' }}>{d.tiendasAfectadas}</strong></div>
        {d.mttrPromedioMin != null && <div>MTTR prom.: <strong style={{ color: '#0f172a' }}>{fmtMin(d.mttrPromedioMin)}</strong></div>}
        {d.causaMasFrecuente && <div>Causa: <strong style={{ color: '#854F0B' }}>{d.causaMasFrecuente}</strong></div>}
        {d.proveedorMasAsociado && <div>Proveedor: <strong style={{ color: '#185FA5' }}>{d.proveedorMasAsociado}</strong></div>}
      </div>
    </div>
  )
}

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.06) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: '10px', fontWeight: 700 }}>
      {`${Math.round(percent * 100)}%`}
    </text>
  )
}

export default function DistributionByTypeCard({ desde, hasta, proveedorId, refreshKey }: Props) {
  const router = useRouter()
  const [data, setData] = useState<DistribucionTipoResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/distribucion-tipo?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [refreshKey, proveedorId, desde, hasta])

  const goDetalle = () => {
    const params = new URLSearchParams({ desde, hasta })
    if (proveedorId) params.set('proveedorId', proveedorId)
    router.push(`/dashboard/distribucion-tipo?${params}`)
  }

  const tipos = data?.tiposResumen ?? []
  const total = data?.total ?? 0

  return (
    <div onClick={goDetalle} style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px', height: '100%', boxSizing: 'border-box', cursor: 'pointer' }}>

      {/* Header: título + botón en una fila */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginRight: 'auto' }}>D. Distribución por tipo</span>
      </div>

      {loading && (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Cargando...
        </div>
      )}

      {!loading && total === 0 && (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Sin incidentes en el período
        </div>
      )}

      {!loading && total > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie
                data={tipos}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={78}
                dataKey="cantidad"
                startAngle={90}
                endAngle={-270}
                stroke="none"
                label={<PieLabel />}
                labelLine={false}
              >
                {tipos.map((t, i) => (
                  <Cell key={i} fill={t.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* mini leyenda compacta debajo */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 10px', fontSize: '9px', color: '#64748b' }}>
            {tipos.map((t) => (
              <div key={t.tipo} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.color }} />
                <span style={{ fontWeight: 500, color: '#0f172a' }}>{t.label}</span>
                <span style={{ color: '#888' }}>{t.cantidad}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{total}</span>
            <span style={{ marginLeft: '4px' }}>incidentes totales</span>
          </div>
        </div>
      )}
    </div>
  )
}
