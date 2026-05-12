'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
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
  causaPrincipal: string | null
  estado: string
  esAlertaFuerte?: boolean
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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d: DayData = payload[0]?.payload
  if (!d) return null
  const diasVsMeta = d.slaPct != null ? d.slaPct - 90 : null
  const shortDia = d.dia.slice(5).split('-').reverse().join('/')

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', minWidth: '220px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
      <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '13px' }}>Fecha: {shortDia}</div>
      <div style={{ color: 'var(--muted-foreground)', marginBottom: '6px' }}>
        <div>Incidentes registrados: <strong>{d.registrados}</strong></div>
        <div>Incidentes evaluables SLA: <strong>{d.evaluables}</strong></div>
      </div>
      <div style={{ borderTop: '0.5px solid #e5e7eb', paddingTop: '6px', marginBottom: '6px' }}>
        <div>Dentro SLA: <strong style={{ color: '#3B6D11' }}>{d.dentraSLA}</strong></div>
        <div>Fuera SLA: <strong style={{ color: '#A32D2D' }}>{d.fueraSLA}</strong></div>
        <div>SLA: <strong style={{ color: estadoColor(d.estado) }}>{d.slaPct != null ? `${d.slaPct}%` : '—'}</strong></div>
        <div>Meta SLA: <strong>90%</strong></div>
        {diasVsMeta != null && (
          <div>Diferencia vs meta: <strong style={{ color: diasVsMeta < 0 ? '#A32D2D' : '#3B6D11' }}>{diasVsMeta >= 0 ? '+' : ''}{diasVsMeta} pp</strong></div>
        )}
      </div>
      <div style={{ borderTop: '0.5px solid #e5e7eb', paddingTop: '6px', marginBottom: '6px' }}>
        <div>T. prom. primera respuesta: <strong>{fmtMin(d.tPromRespuestaMin)}</strong></div>
        <div>T. prom. resolución: <strong>{fmtMin(d.tPromResolucionMin)}</strong></div>
        {d.nivelPromedioAlcanzado != null && <div>Nivel promedio alcanzado: <strong>Nivel {d.nivelPromedioAlcanzado}</strong></div>}
        <div>Casos escalados a N2+: <strong>{d.casosEscaladosN2}</strong></div>
      </div>
      {d.proveedorMasAfectado && (
        <div style={{ borderTop: '0.5px solid #e5e7eb', paddingTop: '6px' }}>
          <div>Proveedor más afectado: <strong style={{ color: '#185FA5' }}>{d.proveedorMasAfectado}</strong></div>
          {d.causaPrincipal && <div>Principal causa: <strong>{d.causaPrincipal}</strong></div>}
        </div>
      )}
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

  useEffect(() => { fetchData() }, [refreshKey])

  const alertas = (data ?? []).filter((d) => d.slaPct != null && d.slaPct < 70)

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
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
            Evolución diaria de incidentes y cumplimiento SLA en el período
          </div>
        </div>
        <button onClick={goDetalle}
          style={{ padding: '5px 12px', fontSize: '11px', background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
          Ver detalle →
        </button>
      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
          <div style={{ width: 10, height: 10, background: '#185FA5', borderRadius: 2 }} />
          Incidentes registrados
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
          <div style={{ width: 16, height: 2, background: '#1D9E75', borderRadius: 1 }} />
          SLA (%)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
          <div style={{ width: 16, height: 2, background: '#888', borderRadius: 1, borderTop: '2px dashed #888' }} />
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
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine yAxisId="right" y={90} stroke="#888780" strokeDasharray="4 3" strokeWidth={1.5} />
              <Bar yAxisId="left" dataKey="registrados" fill="#185FA5" radius={[2, 2, 0, 0]} barSize={Math.max(4, Math.min(18, 400 / Math.max(data.length, 1)))} />
              <Line
                yAxisId="right"
                dataKey="slaPct"
                stroke="#1D9E75"
                strokeWidth={2}
                dot={<CustomDot />}
                activeDot={{ r: 5, fill: '#1D9E75' }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Alertas automáticas */}
          {alertas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
              {alertas.map((d) => (
                <div key={d.dia} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#FFF5F5', border: '0.5px solid #FECACA', borderRadius: '8px', fontSize: '11px' }}>
                  <span style={{ color: '#A32D2D', fontWeight: 600 }}>⚠</span>
                  <span>
                    <strong>{d.dia.slice(5).split('-').reverse().join('/')}</strong>
                    {' → '}SLA <strong style={{ color: '#A32D2D' }}>{d.slaPct}%</strong>
                    {d.evaluables > 0 && ` (${d.dentraSLA} de ${d.evaluables} evaluables)`}
                    {d.causaPrincipal && ` — ${d.causaPrincipal}`}
                    {d.proveedorMasAfectado && d.fueraSLA > 0 && ` — ${d.fueraSLA} caso${d.fueraSLA > 1 ? 's' : ''} fuera de SLA`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
