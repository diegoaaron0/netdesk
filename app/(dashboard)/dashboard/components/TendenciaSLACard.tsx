'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer, CartesianGrid,
} from 'recharts'

interface ProvDay {
  registrados: number
  evaluables: number
  dentraSLA: number
  fueraSLA: number
  slaPct: number | null
}

interface DayData {
  dia: string
  registrados: number
  evaluables: number
  dentraSLA: number
  fueraSLA: number
  slaPct: number | null
  tPromResolucionMin: number | null
  proveedorMasAfectado: string | null
  estado: string
  porProveedor?: Record<string, ProvDay>
}

interface Resumen {
  slaPct: number
  evaluables: number
  fueraSLA: number
  tPromResolucionMin: number | null
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

function slaColor(v: number | null): string {
  if (v == null) return '#888780'
  if (v < 70) return '#A32D2D'
  if (v < 90) return '#BA7517'
  return '#1D9E75'
}
function slaBg(v: number | null): string {
  if (v == null) return '#F5F5F3'
  if (v < 70) return '#FCEBEB'
  if (v < 90) return '#FAEEDA'
  return '#EAF3DE'
}
function slaLabel(v: number | null): string {
  if (v == null) return 'Sin datos'
  if (v < 70) return 'Crítico'
  if (v < 90) return 'En revisión'
  return 'Estable'
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d: DayData = payload[0]?.payload
  if (!d) return null
  const shortDia = d.dia.slice(5).split('-').reverse().join('/')
  const pct = d.slaPct
  const col = slaColor(pct)

  const provEntries = Object.entries(d.porProveedor ?? {})
    .sort((a, b) => (b[1].fueraSLA - a[1].fueraSLA) || (b[1].registrados - a[1].registrados))

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', minWidth: '220px', maxWidth: '280px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
      {/* Header: fecha + SLA global */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '7px', borderBottom: '0.5px solid #e5e7eb' }}>
        <span style={{ fontWeight: 700, fontSize: '13px' }}>{shortDia}</span>
        {pct != null
          ? <span style={{ fontWeight: 700, fontSize: '15px', color: col }}>{pct}% global</span>
          : <span style={{ fontSize: '11px', color: '#888' }}>Sin evaluables</span>
        }
      </div>

      {/* Desglose por proveedor */}
      {provEntries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {provEntries.map(([prov, m]) => {
            const pc = m.slaPct
            const c = slaColor(pc)
            return (
              <div key={prov} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: '11px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prov}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, fontSize: '11px' }}>
                  <span style={{ color: '#64748b' }}>{m.registrados} inc.</span>
                  {pc != null
                    ? <span style={{ fontWeight: 700, color: c, minWidth: '36px', textAlign: 'right' }}>{pc}%</span>
                    : <span style={{ color: '#888', fontStyle: 'italic', minWidth: '36px', textAlign: 'right' }}>s/eval</span>
                  }
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MTTR al pie */}
      {d.tPromResolucionMin != null && (
        <div style={{ marginTop: '7px', paddingTop: '6px', borderTop: '0.5px solid #f0f0f0', fontSize: '11px', color: '#64748b' }}>
          MTTR: <strong style={{ color: d.tPromResolucionMin > 120 ? '#A32D2D' : '#1D9E75' }}>{fmtMin(d.tPromResolucionMin)}</strong>
        </div>
      )}
    </div>
  )
}

function CustomDot(props: any) {
  const { cx, cy, payload } = props
  if (!payload || payload.slaPct == null) return null
  const col = slaColor(payload.slaPct)
  return <circle cx={cx} cy={cy} r={payload.slaPct < 70 ? 5 : 3} fill={col} stroke="white" strokeWidth={1.5} />
}

export default function TendenciaSLACard({ desde, hasta, proveedorId, refreshKey }: Props) {
  const router = useRouter()
  const [byDay, setByDay]     = useState<DayData[] | null>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/tendencia-sla?${params}`)
      if (res.ok) {
        const json = await res.json()
        setByDay(json.byDay ?? [])
        setResumen(json.resumen ?? null)
      }
    } finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [refreshKey, proveedorId, desde, hasta])

  const diasCriticos = (byDay ?? []).filter((d) => d.slaPct != null && d.slaPct < 70).length
  const slaPct       = resumen?.slaPct ?? null
  const slaPctColor  = slaColor(slaPct)
  const slaPctBg     = slaBg(slaPct)

  const goDetalle = () => {
    const params = new URLSearchParams({ desde, hasta })
    if (proveedorId) params.set('proveedorId', proveedorId)
    router.push(`/dashboard/tendencia-sla?${params}`)
  }

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>A. Tendencia de incidentes y SLA</div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '1px' }}>
            Evolución diaria de incidentes y cumplimiento SLA en el período
          </div>
        </div>
        <button onClick={goDetalle} style={{ background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>
          Ver detalle →
        </button>
      </div>

      {/* KPI principal + stats */}
      {!loading && resumen && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
          {/* SLA% grande */}
          <div style={{ background: slaPctBg, borderRadius: '10px', padding: '12px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '110px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: slaPctColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>SLA del período</div>
            <div style={{ fontSize: '36px', fontWeight: 700, color: slaPctColor, lineHeight: 1 }}>
              {slaPct != null ? `${slaPct}%` : '—'}
            </div>
            <div style={{ fontSize: '11px', color: slaPctColor, marginTop: '3px', fontWeight: 500 }}>{slaLabel(slaPct)}</div>
          </div>

          {/* Stats secundarios */}
          <div style={{ display: 'flex', gap: '8px', flex: 1, flexWrap: 'wrap' }}>
            {[
              { label: 'Evaluables', value: resumen.evaluables },
              { label: 'Fuera SLA', value: resumen.fueraSLA, red: resumen.fueraSLA > 0 },
              { label: 'Días críticos', value: diasCriticos, red: diasCriticos > 0 },
              { label: 'MTTR prom.', value: fmtMin(resumen.tPromResolucionMin), mono: true },
            ].map(({ label, value, red, mono }) => (
              <div key={label} style={{ background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: '8px', padding: '10px 14px', flex: 1, minWidth: '80px' }}>
                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>{label}</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: red ? '#A32D2D' : '#0f172a', fontFamily: mono ? 'monospace' : undefined }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
          <div style={{ width: 12, height: 12, background: '#185FA540', border: '1px solid #185FA5', borderRadius: 2 }} />
          Incidentes
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
          <div style={{ width: 16, height: 2, background: slaPctColor, borderRadius: 1 }} />
          SLA (%)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
          <div style={{ width: 16, height: 0, borderTop: '2px dashed #888' }} />
          Meta 90%
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', fontSize: '10px' }}>
          <span style={{ padding: '1px 6px', background: '#EAF3DE60', color: '#3B6D11', borderRadius: '4px', border: '0.5px solid #3B6D1130' }}>≥ 90%</span>
          <span style={{ padding: '1px 6px', background: '#FAEEDA60', color: '#854F0B', borderRadius: '4px', border: '0.5px solid #854F0B30' }}>70–89%</span>
          <span style={{ padding: '1px 6px', background: '#FCEBEB60', color: '#A32D2D', borderRadius: '4px', border: '0.5px solid #A32D2D30' }}>{'< 70%'}</span>
        </div>
      </div>

      {loading && (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Cargando...
        </div>
      )}

      {!loading && (!byDay || byDay.length === 0) && (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Sin datos en el período seleccionado
        </div>
      )}

      {!loading && byDay && byDay.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={byDay} margin={{ top: 2, right: 36, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(136,135,128,0.10)" />

            {/* Bandas de zona SLA como fondo */}
            <ReferenceArea yAxisId="right" y1={0}  y2={70} fill="#FCEBEB" fillOpacity={0.35} />
            <ReferenceArea yAxisId="right" y1={70} y2={90} fill="#FAEEDA" fillOpacity={0.35} />
            <ReferenceArea yAxisId="right" y1={90} y2={100} fill="#EAF3DE" fillOpacity={0.35} />

            <XAxis
              dataKey="dia"
              tick={{ fontSize: 10, fill: '#888780' }}
              tickFormatter={(d) => d.slice(5).split('-').reverse().join('/')}
              tickLine={false}
            />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#888780' }} tickLine={false} axisLine={false}
              width={22}
              label={{ value: 'Inc.', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#888780', dx: 4 }}
            />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#888780' }} tickLine={false} axisLine={false}
              tickFormatter={(v) => `${v}%`} width={34}
            />

            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine yAxisId="right" y={90} stroke="#888780" strokeDasharray="4 3" strokeWidth={1.5} />

            <Bar yAxisId="left" dataKey="registrados" fill="#185FA530" stroke="#185FA560" strokeWidth={0.5} radius={[2, 2, 0, 0]} />
            <Line
              yAxisId="right"
              dataKey="slaPct"
              stroke={slaPctColor}
              strokeWidth={2.5}
              dot={<CustomDot />}
              activeDot={{ r: 5, fill: slaPctColor }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
