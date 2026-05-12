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

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d: TipoResumen = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
      <div style={{ fontWeight: 600, marginBottom: '4px' }}>Tipo: {d.label}</div>
      <div>Incidentes: <strong>{d.cantidad}</strong></div>
      <div>Porcentaje: <strong>{d.pct}%</strong></div>
      {d.causaMasFrecuente && (
        <div style={{ marginTop: '4px', color: '#854F0B' }}>
          Causa más frecuente: <strong>{d.causaMasFrecuente}</strong>
        </div>
      )}
    </div>
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

  useEffect(() => { fetchData() }, [refreshKey])

  const goDetalle = () => {
    const params = new URLSearchParams({ desde, hasta })
    if (proveedorId) params.set('proveedorId', proveedorId)
    router.push(`/dashboard/distribucion-tipo?${params}`)
  }

  const tipos = data?.tiposResumen ?? []
  const total = data?.total ?? 0

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>D. Distribución por tipo</div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
            Desglose de incidentes según su tipo en el período seleccionado
          </div>
        </div>
        <button onClick={goDetalle}
          style={{ padding: '5px 12px', fontSize: '11px', background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
          Ver detalle →
        </button>
      </div>

      {loading && (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Cargando...
        </div>
      )}

      {!loading && total === 0 && (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Sin incidentes en el período seleccionado
        </div>
      )}

      {!loading && total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          {/* Donut */}
          <div style={{ position: 'relative', width: '200px', height: '200px', flexShrink: 0 }}>
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie
                  data={tipos}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={90}
                  dataKey="cantidad"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  {tipos.map((t, i) => (
                    <Cell key={i} fill={t.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{total}</div>
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px', lineHeight: 1.3 }}>Incidentes<br/>Totales</div>
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            {tipos.map((t) => (
              <div key={t.tipo} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                <span style={{ fontSize: '12px', flex: 1, color: '#0f172a' }}>{t.label}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', minWidth: '44px', textAlign: 'right' }}>{t.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
