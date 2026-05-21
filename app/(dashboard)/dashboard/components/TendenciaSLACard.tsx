'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fmtSLA } from '@/lib/sla-display'
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid,
} from 'recharts'

interface DayData {
  dia: string
  registrados: number
  evaluables: number
  dentraSLA: number
  fueraSLA: number
  slaPct: number | null
  tPromRespuestaMin: number | null
  tPromResolucionMin: number | null
  nivelPromedioAlcanzado: number | null
  casosEscaladosN2: number
  proveedorMasAfectado: string | null
  proveedoresAfectados?: string[]
  causaPrincipal: string | null
  estado: string
  esAlertaFuerte?: boolean
  scoreEficiencia?: number | null
}

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

function estadoColor(estado: string) {
  if (estado === 'optimo')    return '#3B6D11'
  if (estado === 'en_riesgo') return '#854F0B'
  if (estado === 'critico')   return '#A32D2D'
  return '#888780'
}

function estadoLabel(estado: string) {
  if (estado === 'optimo')    return 'Estable'
  if (estado === 'en_riesgo') return 'En revisión'
  if (estado === 'critico')   return 'Crítico'
  return 'Sin muestra suficiente'
}

function getSlaStroke(data: DayData[]): string {
  const valid = data.filter(d => d.slaPct != null)
  if (valid.length === 0) return '#1D9E75'
  const avg = valid.reduce((sum, d) => sum + (d.slaPct ?? 0), 0) / valid.length
  if (avg < 70) return '#A32D2D'
  if (avg < 90) return '#BA7517'
  return '#1D9E75'
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d: DayData = payload[0]?.payload
  if (!d) return null
  const shortDia = d.dia.slice(5).split('-').reverse().join('/')
  const tResolvColor = d.tPromResolucionMin == null ? '#64748b'
    : d.tPromResolucionMin > 240 ? '#A32D2D'
    : d.tPromResolucionMin > 60  ? '#BA7517'
    : '#1D9E75'

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', minWidth: '260px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: '0.5px solid #e5e7eb' }}>
        <span style={{ fontWeight: 700, fontSize: '13px' }}>{shortDia}</span>
        {(() => {
          const ef = fmtSLA({ score: d.scoreEficiencia ?? null, tRealMin: d.tPromRespuestaMin ?? null, tLimiteMin: 60 })
          return (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: ef.color }}>{ef.texto}</div>
              {ef.subTexto && <div style={{ fontSize: '10px', color: '#6B7280' }}>{ef.subTexto}</div>}
            </div>
          )
        })()}
      </div>
      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Volumen</div>
          <div>Registrados: <strong>{d.registrados}</strong></div>
          <div>Evaluables: <strong>{d.evaluables}</strong></div>
          <div>Dentro SLA: <strong style={{ color: '#1D9E75' }}>{d.dentraSLA}</strong></div>
          <div>Fuera SLA: <strong style={{ color: '#A32D2D' }}>{d.fueraSLA}</strong></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Tiempos</div>
          <div>T. Respuesta: <strong>{fmtMin(d.tPromRespuestaMin)}</strong></div>
          <div>T. Resolución: <strong style={{ color: tResolvColor }}>{fmtMin(d.tPromResolucionMin)}</strong></div>
          {(() => {
            const provs = d.proveedoresAfectados?.length ? d.proveedoresAfectados : (d.proveedorMasAfectado ? [d.proveedorMasAfectado] : [])
            if (provs.length === 0) return null
            if (provs.length === 1) return (
              <div style={{ marginTop: '2px' }}>Prov.: <strong style={{ color: '#185FA5' }}>{provs[0]}</strong></div>
            )
            return (
              <div style={{ marginTop: '2px' }}>
                <div style={{ color: '#64748b', marginBottom: '2px' }}>Proveedores afectados:</div>
                {provs.map((p) => (
                  <div key={p} style={{ color: '#185FA5', fontWeight: 600 }}>· {p}</div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

function CustomDot(props: any) {
  const { cx, cy, payload } = props
  if (!payload || payload.slaPct == null) return null
  const col = estadoColor(payload.estado)
  const isAlert = payload.slaPct < 70
  return (
    <circle cx={cx} cy={cy} r={isAlert ? 5 : 3}
      fill={col} stroke="white" strokeWidth={isAlert ? 2 : 1} />
  )
}

export default function TendenciaSLACard({ desde, hasta, proveedorId, refreshKey }: Props) {
  const router = useRouter()
  const [data, setData] = useState<DayData[] | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/tendencia-sla?${params}`)
      if (res.ok) {
        const json = await res.json()
        setData(json.byDay ?? [])
      }
    } finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [refreshKey, proveedorId])

  const alertas      = (data ?? []).filter((d) => d.slaPct != null && d.slaPct < 70)
  const diasCriticos = alertas.length
  const slaStroke    = data ? getSlaStroke(data) : '#1D9E75'

  const goDetalle = () => {
    const params = new URLSearchParams({ desde, hasta })
    if (proveedorId) params.set('proveedorId', proveedorId)
    router.push(`/dashboard/tendencia-sla?${params}`)
  }

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>A. Tendencia de incidentes y SLA</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
              Evolución diaria de incidentes y cumplimiento SLA en el período
            </div>
            <span style={{
              padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 600,
              background: diasCriticos > 0 ? '#FCEBEB' : '#F5F5F3',
              color: diasCriticos > 0 ? '#A32D2D' : '#888780',
            }}>
              {diasCriticos} días críticos
            </span>
          </div>
        </div>
        <button onClick={goDetalle} style={{ background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Ver detalle →</button>
      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
          <div style={{ width: 16, height: 10, background: '#185FA540', border: '1px solid #185FA5', borderRadius: 2 }} />
          Incidentes registrados
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
          <div style={{ width: 16, height: 2, background: slaStroke, borderRadius: 1 }} />
          SLA (%)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
          <div style={{ width: 16, height: 0, borderTop: '2px dashed #F59E0B' }} />
          T. resolución prom.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
          <div style={{ width: 16, height: 0, borderTop: '2px dashed #888' }} />
          Meta SLA 90%
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', fontSize: '10px' }}>
          <span style={{ padding: '2px 7px', background: '#EAF3DE', color: '#3B6D11', borderRadius: '999px' }}>Estable ≥ 90%</span>
          <span style={{ padding: '2px 7px', background: '#FAEEDA', color: '#854F0B', borderRadius: '999px' }}>En revisión 70–89%</span>
          <span style={{ padding: '2px 7px', background: '#FCEBEB', color: '#A32D2D', borderRadius: '999px' }}>Crítico &lt; 70%</span>
        </div>
      </div>

      {loading && (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Cargando...
        </div>
      )}

      {!loading && (!data || data.length === 0) && (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Sin datos en el período seleccionado
        </div>
      )}

      {!loading && data && data.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={data} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(136,135,128,0.12)" />
              <XAxis
                dataKey="dia"
                tick={{ fontSize: 10, fill: '#888780' }}
                tickFormatter={(d) => d.slice(5).split('-').reverse().join('/')}
                tickLine={false}
              />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#888780' }} tickLine={false} axisLine={false} label={{ value: 'Incidentes', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#888780', dx: -4 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: '#888780' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
              <YAxis yAxisId="right2" orientation="right" domain={[0, 600]} hide={true} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine yAxisId="right" y={90} stroke="#888780" strokeDasharray="4 3" strokeWidth={1.5} />
              <Area
                yAxisId="left"
                dataKey="registrados"
                fill="#185FA580"
                stroke="#185FA5"
                strokeWidth={1.5}
              />
              <Line
                yAxisId="right"
                dataKey="slaPct"
                stroke={slaStroke}
                strokeWidth={2}
                dot={<CustomDot />}
                activeDot={{ r: 5, fill: slaStroke }}
                connectNulls
              />
              <Line
                yAxisId="right2"
                dataKey="tPromResolucionMin"
                stroke="#F59E0B"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>

        </>
      )}
    </div>
  )
}
