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
  if (estado === 'critica') return { label: '● Crítica',      color: '#A32D2D', bg: '#FCEBEB' }
  if (estado === 'revisar') return { label: '● En revisión',  color: '#854F0B', bg: '#FAEEDA' }
  return                           { label: '● Estabilizada', color: '#3B6D11', bg: '#EAF3DE' }
}

function Tooltip({ lines }: { lines: string[] }) {
  return (
    <div style={{ position: 'absolute', zIndex: 50, bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '6px', background: '#1e293b', color: 'white', borderRadius: '8px', padding: '8px 12px', fontSize: '11px', lineHeight: 1.6, minWidth: '180px', maxWidth: '260px', whiteSpace: 'normal', boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
      <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '4px solid #1e293b' }} />
    </div>
  )
}

function TooltipCell({ children, lines }: { children: React.ReactNode; lines: string[] }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && <Tooltip lines={lines} />}
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

  useEffect(() => { fetchData() }, [refreshKey, proveedorId])

  const goDetalle = () => {
    const params = new URLSearchParams({ desde, hasta })
    if (proveedorId) params.set('proveedorId', proveedorId)
    router.push(`/dashboard/tiendas-criticas?${params}`)
  }

  const tiendas = data?.tiendas ?? []
  const resumen = data?.resumen

  return (
    <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>C. Tiendas críticas</div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
            Ranking de tiendas con mayor impacto y necesidad de revisión estructural.
          </div>
        </div>
        <button onClick={goDetalle}
          style={{ padding: '5px 12px', fontSize: '11px', background: '#E6F1FB', color: '#185FA5', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
          Ver detalle →
        </button>
      </div>

      {!loading && resumen && (
        <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
          <span style={{ color: '#A32D2D', fontWeight: 600 }}>{resumen.totalCriticas}</span> críticas ·{' '}
          Costo acumulado: <strong>{fmtCosto(resumen.costoAcumulado)}</strong> ·{' '}
          Reincidencias: <strong>{resumen.reincidenciasDetectadas}</strong>
        </div>
      )}

      {loading && (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Cargando...
        </div>
      )}

      {!loading && tiendas.length === 0 && (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
          Sin tiendas críticas en el período
        </div>
      )}

      {!loading && tiendas.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                {['#', 'Tienda', 'Proveedor', 'Distrito', 'Incidentes', 'MTTR prom.', 'Costo est.', 'Estado'].map((h) => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiendas.slice(0, 5).map((t, i) => {
                const badge = estadoBadge(t.estado)
                return (
                  <tr key={t.tiendaId} style={{ borderTop: i > 0 ? '0.5px solid #f3f4f6' : 'none' }}>
                    <td style={{ padding: '7px 8px', fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 500 }}>{i + 1}</td>
                    <td style={{ padding: '7px 8px', fontWeight: 600 }}>{t.tiendaCodigo}</td>
                    <td style={{ padding: '7px 8px' }}>
                      {t.proveedorNombre
                        ? <span style={{ padding: '1px 7px', borderRadius: '999px', background: '#E6F1FB', color: '#185FA5', fontWeight: 500, fontSize: '10px' }}>{t.proveedorNombre}</span>
                        : <span style={{ color: '#888780' }}>—</span>}
                    </td>
                    <td style={{ padding: '7px 8px', color: 'var(--muted-foreground)', fontSize: '11px', whiteSpace: 'nowrap' }}>{t.distrito ?? '—'}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 600 }}>{t.incidentes}</td>
                    <td style={{ padding: '7px 8px' }}>
                      <TooltipCell lines={[
                        `MTTR tienda: ${fmtMin(t.mttrPromedioMin)}`,
                        `Horas afectadas: ${t.horasAfectadas != null ? `${t.horasAfectadas}h` : '—'}`,
                      ]}>
                        <span style={{ color: t.mttrPromedioMin != null && t.mttrPromedioMin > 240 ? '#A32D2D' : t.mttrPromedioMin != null && t.mttrPromedioMin > 120 ? '#854F0B' : '#0f172a', textDecoration: 'underline dotted', cursor: 'help' }}>
                          {fmtMin(t.mttrPromedioMin)}
                        </span>
                      </TooltipCell>
                    </td>
                    <td style={{ padding: '7px 8px' }}>
                      <TooltipCell lines={[
                        `Costo: ${fmtCosto(t.costoEstimado)}`,
                        `Horas caída: ${t.horasAfectadas != null ? `${t.horasAfectadas}h` : '—'}`,
                        `Venta/hora: ${t.ventaHoraPromedio != null ? fmtCosto(t.ventaHoraPromedio) : '—'}`,
                        'Margen bruto: 35%',
                      ]}>
                        <span style={{ fontFamily: 'monospace', textDecoration: 'underline dotted', cursor: 'help' }}>
                          {t.costoEstimado > 0 ? fmtCosto(t.costoEstimado) : '—'}
                        </span>
                      </TooltipCell>
                    </td>
                    <td style={{ padding: '7px 8px' }}>
                      <TooltipCell lines={t.motivosPrincipales.length ? t.motivosPrincipales : ['Sin motivos registrados']}>
                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '999px', background: badge.bg, color: badge.color, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'help', textDecoration: 'underline dotted' }}>
                          {badge.label}
                        </span>
                      </TooltipCell>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {tiendas.length > 5 && (
            <div style={{ padding: '6px 8px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
              Mostrando 5 de {tiendas.length} tiendas críticas —{' '}
              <button onClick={goDetalle} style={{ background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', fontSize: '11px', fontWeight: 500, padding: 0 }}>ver todas</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
