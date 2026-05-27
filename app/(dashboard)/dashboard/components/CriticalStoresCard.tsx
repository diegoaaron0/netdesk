'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { TiendasCriticasResponse, TiendaCritica } from '@/types/critical-stores'

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
function fmtCosto(n: number) {
  return `S/ ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
}

function estadoBadge(estado: TiendaCritica['estado']) {
  if (estado === 'critica') return { label: '● Crít.',   color: '#A32D2D', bg: '#FCEBEB' }
  if (estado === 'revisar') return { label: '● Rev.',    color: '#854F0B', bg: '#FAEEDA' }
  return                           { label: '● Ok',      color: '#3B6D11', bg: '#EAF3DE' }
}

function HoverTip({ children, lines }: { children: React.ReactNode; lines: string[] }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{ position: 'absolute', zIndex: 50, bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '6px', background: '#1e293b', color: 'white', borderRadius: '8px', padding: '7px 10px', fontSize: '10px', lineHeight: 1.6, minWidth: '160px', maxWidth: '240px', whiteSpace: 'normal', boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>
          {lines.map((l, i) => <div key={i}>{l}</div>)}
          <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '4px solid #1e293b' }} />
        </div>
      )}
    </div>
  )
}

export default function CriticalStoresCard({ desde, hasta, proveedorId, refreshKey }: Props) {
  const router = useRouter()
  const [data, setData] = useState<TiendasCriticasResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (proveedorId) params.set('proveedorId', proveedorId)
      const res = await fetch(`/api/dashboard/tiendas-criticas?${params}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [desde, hasta, proveedorId])

  useEffect(() => { fetchData() }, [refreshKey, proveedorId, desde, hasta])

  const goDetalle = () => {
    const params = new URLSearchParams({ desde, hasta })
    if (proveedorId) params.set('proveedorId', proveedorId)
    router.push(`/dashboard/tiendas-criticas?${params}`)
  }

  const tiendas = data?.tiendas ?? []
  const resumen = data?.resumen

  return (
    <div onClick={goDetalle} style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px', height: '100%', boxSizing: 'border-box', cursor: 'pointer' }}>

      {/* Header: título + resumen inline + botón */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginRight: 'auto' }}>C. Tiendas críticas</span>
        {!loading && resumen && (
          <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#64748b' }}>
            <span><strong style={{ color: resumen.reincidenciasDetectadas > 0 ? '#A32D2D' : '#0f172a' }}>{resumen.reincidenciasDetectadas}</strong> reincid.</span>
            <span><strong style={{ color: '#0f172a' }}>{tiendas.length}</strong> tiendas</span>
            <span>Costo: <strong style={{ color: '#0f172a' }}>{fmtCosto(resumen.costoAcumulado)}</strong></span>
          </div>
        )}
      </div>

      {loading && (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Cargando...
        </div>
      )}

      {!loading && tiendas.length === 0 && (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Sin tiendas críticas en el período
        </div>
      )}

      {!loading && tiendas.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                {[
                  { label: 'Tienda',    align: 'left' as const },
                  { label: 'Est.',      align: 'center' as const },
                  { label: 'Incs',      align: 'center' as const },
                  { label: 'MTTR',      align: 'right' as const },
                  { label: 'Costo est.', align: 'right' as const },
                  { label: 'Reincid.',  align: 'center' as const },
                ].map((h) => (
                  <th key={h.label} style={{ padding: '4px 6px', textAlign: h.align, fontSize: '9px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiendas.slice(0, 6).map((t, i) => {
                const badge = estadoBadge(t.estado)
                const motivo = t.motivosPrincipales?.[0] ?? null
                return (
                  <tr key={t.tiendaId} style={{ borderTop: i > 0 ? '0.5px solid #f3f4f6' : 'none' }}>
                    <td style={{ padding: '4px 6px', maxWidth: '110px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.tiendaCodigo}</div>
                      {motivo && <div style={{ fontSize: '9px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{motivo}</div>}
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 4px', borderRadius: '5px', background: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>{badge.label}</span>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 600, color: '#0f172a' }}>{t.incidentes}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                      <HoverTip lines={[
                        `MTTR tienda: ${fmtMin(t.mttrPromedioMin)}`,
                        `Horas afectadas: ${t.horasAfectadas != null ? `${t.horasAfectadas}h` : '—'}`,
                      ]}>
                        <span style={{ fontWeight: 500, color: t.mttrPromedioMin != null && t.mttrPromedioMin > 240 ? '#A32D2D' : t.mttrPromedioMin != null && t.mttrPromedioMin > 120 ? '#BA7517' : '#0f172a', textDecoration: 'underline dotted', cursor: 'help', whiteSpace: 'nowrap' }}>
                          {fmtMin(t.mttrPromedioMin)}
                        </span>
                      </HoverTip>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                      <HoverTip lines={[
                        `Costo: ${fmtCosto(t.costoEstimado)}`,
                        `Horas caída: ${t.horasAfectadas != null ? `${t.horasAfectadas}h` : '—'}`,
                        `Venta/hora: ${t.ventaHoraPromedio != null ? fmtCosto(t.ventaHoraPromedio) : '—'}`,
                      ]}>
                        <span style={{ fontFamily: 'monospace', textDecoration: 'underline dotted', cursor: 'help', whiteSpace: 'nowrap', color: t.costoEstimado > 0 ? '#0f172a' : '#888780' }}>
                          {t.costoEstimado > 0 ? fmtCosto(t.costoEstimado) : '—'}
                        </span>
                      </HoverTip>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: t.reincidencias > 0 ? 600 : 400, color: t.reincidencias > 0 ? '#A32D2D' : '#64748b' }}>
                      {t.reincidencias > 0 ? t.reincidencias : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {tiendas.length > 6 && (
            <div style={{ padding: '4px 6px', fontSize: '10px', color: '#64748b' }}>
              +{tiendas.length - 6} más (ver detalle)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
