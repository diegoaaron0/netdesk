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
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '8px', padding: '8px 10px', fontSize: '11px', minWidth: '210px', maxWidth: '260px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', paddingBottom: '5px', borderBottom: '0.5px solid #e5e7eb' }}>
        <span style={{ fontWeight: 700, fontSize: '12px' }}>{shortDia}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: '#64748b' }}>{d.evaluables} eval. · {d.registrados} inc.</span>
          {pct != null
            ? <span style={{ fontWeight: 700, fontSize: '13px', color: col }}>{pct}%</span>
            : <span style={{ color: '#888', fontStyle: 'italic' }}>sin eval.</span>
          }
        </div>
      </div>

      {provEntries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {provEntries.map(([prov, m]) => {
            const pc = m.slaPct
            const c = slaColor(pc)
            return (
              <div key={prov} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prov}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, fontSize: '10px' }}>
                  {m.fueraSLA > 0 && <span style={{ color: '#A32D2D', fontWeight: 600 }}>✗{m.fueraSLA}</span>}
                  <span style={{ color: '#64748b' }}>{m.registrados} inc.</span>
                  {pc != null
                    ? <span style={{ fontWeight: 700, color: c, minWidth: '28px', textAlign: 'right' }}>{pc}%</span>
                    : <span style={{ color: '#888', fontStyle: 'italic', minWidth: '28px', textAlign: 'right' }}>s/eval</span>
                  }
                </div>
              </div>
            )
          })}
        </div>
      )}

      {d.tPromResolucionMin != null && (
        <div style={{ marginTop: '5px', paddingTop: '4px', borderTop: '0.5px solid #f0f0f0', fontSize: '10px', color: '#64748b' }}>
          MTTR del día: <strong style={{ color: d.tPromResolucionMin > 120 ? '#A32D2D' : '#1D9E75' }}>{fmtMin(d.tPromResolucionMin)}</strong>
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
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

      {/* Header: título + leyenda + botón — una sola fila */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginRight: 'auto' }}>A. Tendencia de incidentes y SLA</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '10px', color: '#64748b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: 9, height: 9, background: '#185FA540', border: '1px solid #185FA5', borderRadius: 2 }} />
            Dentro SLA
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: 9, height: 9, background: '#A32D2D25', border: '1px solid #A32D2D70', borderRadius: 2 }} />
            Fuera SLA
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: 14, height: 2, background: slaPctColor, borderRadius: 1 }} />
            SLA %
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: 14, height: 0, borderTop: '2px dashed #888' }} />
            Meta 90%
          </div>
          <span style={{ padding: '1px 5px', background: '#EAF3DE60', color: '#3B6D11', borderRadius: '4px', border: '0.5px solid #3B6D1130' }}>≥ 90%</span>
          <span style={{ padding: '1px 5px', background: '#FAEEDA60', color: '#854F0B', borderRadius: '4px', border: '0.5px solid #854F0B30' }}>70–89%</span>
          <span style={{ padding: '1px 5px', background: '#FCEBEB60', color: '#A32D2D', borderRadius: '4px', border: '0.5px solid #A32D2D30' }}>{'< 70%'}</span>
        </div>
        <button onClick={goDetalle} style={{ background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '7px', padding: '4px 10px', fontSize: '11px', fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>
          Ver detalle →
        </button>
      </div>

      {/* Stats strip — una sola fila compacta */}
      {!loading && resumen && (
        <div style={{ display: 'flex', alignItems: 'stretch', background: slaPctBg, borderRadius: '8px', overflow: 'hidden', border: `0.5px solid ${slaPctColor}30` }}>
          <div style={{ padding: '6px 14px', borderRight: '0.5px solid #e5e7eb30', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '90px' }}>
            <div style={{ fontSize: '9px', fontWeight: 600, color: slaPctColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1px' }}>SLA período</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: slaPctColor, lineHeight: 1 }}>{slaPct != null ? `${slaPct}%` : '—'}</span>
              <span style={{ fontSize: '10px', color: slaPctColor, fontWeight: 500 }}>{slaLabel(slaPct)}</span>
            </div>
          </div>
          {[
            { label: 'Evaluables', value: String(resumen.evaluables), red: false, mono: false },
            { label: 'Fuera SLA', value: String(resumen.fueraSLA), red: resumen.fueraSLA > 0, mono: false },
            { label: 'Días críticos', value: String(diasCriticos), red: diasCriticos > 0, mono: false },
            { label: 'MTTR prom.', value: fmtMin(resumen.tPromResolucionMin), red: false, mono: true },
          ].map(({ label, value, red, mono }) => (
            <div key={label} style={{ padding: '6px 12px', borderRight: '0.5px solid #e5e7eb30', display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, minWidth: '70px' }}>
              <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1px' }}>{label}</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: red ? '#A32D2D' : '#0f172a', fontFamily: mono ? 'monospace' : undefined, lineHeight: 1.1 }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Cargando...
        </div>
      )}

      {!loading && (!byDay || byDay.length === 0) && (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Sin datos en el período seleccionado
        </div>
      )}

      {!loading && byDay && byDay.length > 0 && (
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={byDay} margin={{ top: 2, right: 34, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(136,135,128,0.10)" />

            <ReferenceArea yAxisId="right" y1={0}  y2={70} fill="#FCEBEB" fillOpacity={0.30} />
            <ReferenceArea yAxisId="right" y1={70} y2={90} fill="#FAEEDA" fillOpacity={0.30} />
            <ReferenceArea yAxisId="right" y1={90} y2={100} fill="#EAF3DE" fillOpacity={0.30} />

            <XAxis
              dataKey="dia"
              tick={{ fontSize: 9, fill: '#888780' }}
              tickFormatter={(d) => d.slice(5).split('-').reverse().join('/')}
              tickLine={false}
            />
            <YAxis yAxisId="left" tick={{ fontSize: 9, fill: '#888780' }} tickLine={false} axisLine={false}
              width={20}
              label={{ value: 'Inc.', angle: -90, position: 'insideLeft', fontSize: 8, fill: '#888780', dx: 4 }}
            />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]}
              tick={{ fontSize: 9, fill: '#888780' }} tickLine={false} axisLine={false}
              tickFormatter={(v) => `${v}%`} width={30}
            />

            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine yAxisId="right" y={90} stroke="#888780" strokeDasharray="4 3" strokeWidth={1.5} />

            {/* Barras apiladas: dentro SLA (azul) + fuera SLA (rojo) */}
            <Bar yAxisId="left" dataKey="dentraSLA" stackId="inc" fill="#185FA540" stroke="#185FA560" strokeWidth={0.5} radius={[0, 0, 0, 0]} name="Dentro SLA" />
            <Bar yAxisId="left" dataKey="fueraSLA"  stackId="inc" fill="#A32D2D25" stroke="#A32D2D70" strokeWidth={0.5} radius={[2, 2, 0, 0]} name="Fuera SLA" />

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
