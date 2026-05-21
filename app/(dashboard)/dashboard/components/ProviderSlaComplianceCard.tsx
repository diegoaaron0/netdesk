'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { SLAProveedorResponse } from '@/types/provider-sla-compliance'
import { fmtSLA } from '@/lib/sla-display'

interface Props {
  desde: string
  hasta: string
  proveedorId: string
  refreshKey: number
}

function slaColor(pct: number | null) {
  if (pct == null) return '#A32D2D'
  if (pct >= 90) return '#3B6D11'
  if (pct >= 70) return '#854F0B'
  return '#A32D2D'
}
function slaBg(pct: number | null) {
  if (pct == null) return '#FCEBEB'
  if (pct >= 90) return '#EAF3DE'
  if (pct >= 70) return '#FAEEDA'
  return '#FCEBEB'
}
function estadoLabel(pct: number | null) {
  if (pct == null) return 'Sin datos'
  if (pct >= 90) return 'Estable'
  if (pct >= 70) return 'En revisión'
  return 'Crítico'
}
function fmtMin(min: number | null | undefined) {
  if (min == null) return '—'
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function Sk({ w = '60%', h = 14 }: { w?: string; h?: number }) {
  return (
    <div style={{ width: w, height: h, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', borderRadius: 4, animation: 'shimmer 1.4s infinite' }} />
  )
}

export default function ProviderSlaComplianceCard({ desde, hasta, proveedorId, refreshKey }: Props) {
  const router = useRouter()
  const [data, setData] = useState<SLAProveedorResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/sla-proveedor?${params}`)
      if (res.ok) setData(await res.json())
      else setError(true)
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [refreshKey, proveedorId])

  const g = data?.resumenGlobal
  const proveedores = data?.proveedores ?? []

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>E. Cumplimiento SLA por proveedor</div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Respuesta y resolución vs objetivos contractuales</div>
        </div>
        <button onClick={() => router.push(`/dashboard/sla-proveedor?desde=${desde}&hasta=${hasta}${proveedorId ? `&proveedorId=${proveedorId}` : ''}`)} style={{ background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Ver detalle →</button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        {[
          { label: 'Proveedores evaluados', value: loading ? null : (g?.proveedoresEvaluados ?? 0), suffix: '' },
          { label: 'SLA general', value: loading ? null : (g?.slaGeneral != null ? `${g.slaGeneral}%` : '—'), suffix: '', color: g?.slaGeneral != null ? slaColor(g.slaGeneral) : undefined },
          { label: 'Fuera de SLA', value: loading ? null : (g?.fueraSLATotal ?? 0), suffix: ' casos' },
          { label: 'Escalados N2', value: loading ? null : (g?.casosEscaladosN2 ?? 0), suffix: ' casos' },
        ].map(({ label, value, suffix, color }) => (
          <div key={label} style={{ background: 'var(--muted)', borderRadius: '8px', padding: '8px 10px' }}>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>{label}</div>
            {loading
              ? <Sk w="50%" h={20} />
              : <div style={{ fontSize: '18px', fontWeight: 700, color: color ?? '#0f172a', lineHeight: 1 }}>{value}{suffix}</div>
            }
          </div>
        ))}
      </div>

      {/* Table */}
      {error ? (
        <div style={{ fontSize: '12px', color: '#A32D2D', padding: '12px 0', textAlign: 'center' }}>Error al cargar datos</div>
      ) : (
        <div>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 90px 90px 90px', gap: '8px', padding: '6px 0', borderBottom: '0.5px solid var(--border)' }}>
            {['Proveedor', 'SLA%', 'T. Respuesta', 'T. Resolución', 'Estado'].map((h) => (
              <span key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
            ))}
          </div>

          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 90px 90px 90px', gap: '8px', padding: '10px 0', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
                <Sk w="70%" /><Sk w="80px" /><Sk w="50px" /><Sk w="50px" /><Sk w="60px" />
              </div>
            ))
          ) : proveedores.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', padding: '20px 0', textAlign: 'center' }}>Sin datos en el período</div>
          ) : (
            proveedores.slice(0, 5).map((p, i) => (
              <div key={p.proveedorId} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 90px 90px 90px', gap: '8px', padding: '10px 0', borderBottom: i < Math.min(proveedores.length, 5) - 1 ? '0.5px solid var(--border)' : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#0f172a' }}>{p.nombre}</span>

                {/* SLA% — efficiency score */}
                {(() => {
                  const ef = fmtSLA({ score: p.scoreEficiencia ?? p.slaPct, tRealMin: p.tPromRespuestaMin ?? null, tLimiteMin: 60 })
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: ef.color, lineHeight: 1 }}>{ef.texto}</span>
                        {p.evaluables > 0 && (
                          <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>({p.evaluables})</span>
                        )}
                      </div>
                      {ef.subTexto && <div style={{ fontSize: '10px', color: '#6B7280' }}>{ef.subTexto}</div>}
                    </div>
                  )
                })()}

                <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{fmtMin(p.tPromRespuestaMin)}</span>
                <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{fmtMin(p.tPromResolucionMin)}</span>

                <span style={{
                  fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap',
                  background: slaBg(p.slaPct), color: slaColor(p.slaPct),
                }}>
                  {estadoLabel(p.slaPct)}
                </span>
              </div>
            ))
          )}

          {!loading && proveedores.length > 5 && (
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', paddingTop: '8px', textAlign: 'center' }}>
              +{proveedores.length - 5} proveedores más —{' '}
              <span
                onClick={() => router.push(`/dashboard/sla-proveedor?desde=${desde}&hasta=${hasta}${proveedorId ? `&proveedorId=${proveedorId}` : ''}`)}
                style={{ color: '#185FA5', cursor: 'pointer', textDecoration: 'underline' }}
              >
                ver todos
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer note */}
      {!loading && g != null && (
        <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', borderTop: '0.5px solid var(--border)', paddingTop: '8px' }}>
          Meta SLA: respuesta ≤60 min (N1, sin escalamiento a N2) · resolución variable por tipo · solo incidentes RESUELTO con correo N1 enviado
        </div>
      )}
    </div>
  )
}
