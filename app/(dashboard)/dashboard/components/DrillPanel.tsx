'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DrillIncidente {
  id: string
  codigo: string
  tipo: string
  horaInicio: string | null
  horaRegistroMs: number | null
  horaFin: string | null
  mttrMin: number | null
  horaEnvioN1: string | null
  horaRespuesta: string | null
  noHuboRespuesta: boolean
  evaluableProveedor: boolean
  minHastaEnvio: number | null
  minRespuesta: number | null
  minSolucionDesdeCorreo: number | null
  dentroSLA: boolean | null
}

interface DrillTienda {
  codigo: string
  nombre: string
  distrito: string | null
  mttrAvg: number | null
  incidentesCount: number
  slaOk: number
  slaFail: number
  incidentes: DrillIncidente[]
}

interface DrillProveedor {
  nombre: string
  slaPct: number | null
  mttrAvg: number | null
  incidentesCount: number
  tiendas: DrillTienda[]
}

interface DrillResponse {
  proveedores: DrillProveedor[]
}

export interface DrillPanelProps {
  open: boolean
  onClose: () => void
  metrica: 'sla' | 'mttr' | 'reincidencia' | null
  desde: string
  hasta: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function fmtMin(min: number | null): string {
  if (min == null) return '—'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60); const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
  CORTE_ELECTRICO: 'Corte eléctrico',
}

function slaColor(pct: number | null) {
  if (pct == null) return 'var(--muted-foreground)'
  if (pct >= 90) return '#3B6D11'
  if (pct >= 70) return '#854F0B'
  return '#A32D2D'
}
function mttrClr(min: number | null) {
  if (min == null) return 'var(--muted-foreground)'
  if (min < 120) return '#3B6D11'
  if (min < 240) return '#854F0B'
  return '#A32D2D'
}

// ─── Timeline row ─────────────────────────────────────────────────────────────

export function TimelineRow({ dot, label, hora, delta, isAlert = false, isLast = false }: {
  dot: 'blue' | 'orange' | 'green' | 'red' | 'purple' | 'gray'
  label: string
  hora: string | null
  delta: string | null
  isAlert?: boolean
  isLast?: boolean
}) {
  const colors = { blue: '#3B82F6', orange: '#F59E0B', green: '#10B981', red: '#EF4444', purple: '#8B5CF6', gray: '#9CA3AF' }
  const c = colors[dot]
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', position: 'relative' }}>
      {!isLast && (
        <div style={{ position: 'absolute', left: '5px', top: '14px', bottom: '-2px', width: '1px', background: '#e5e7eb' }} />
      )}
      <div style={{ width: 11, height: 11, borderRadius: '50%', background: isAlert ? '#FEE2E2' : c, border: isAlert ? `2px solid ${c}` : 'none', flexShrink: 0, marginTop: 3, zIndex: 1 }} />
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: isAlert ? 600 : 500, color: isAlert ? '#A32D2D' : '#374151' }}>{label}</span>
          {hora && <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>{hora}</span>}
        </div>
        {delta && <span style={{ fontSize: 10, color: '#9CA3AF', display: 'block', marginTop: 1 }}>{delta}</span>}
      </div>
    </div>
  )
}

// ─── Incident card with timeline ──────────────────────────────────────────────

export type { DrillIncidente }
export function IncidentTimeline({ inc, onNavigate }: { inc: DrillIncidente; onNavigate: () => void }) {
  const isAgente  = !inc.horaEnvioN1
  const isAbierto = !inc.horaFin
  const status    = isAgente ? 'na' : inc.dentroSLA === true ? 'ok' : inc.dentroSLA === false ? 'fail' : 'na'

  const elapsedMin = isAbierto && inc.horaRegistroMs
    ? Math.round((Date.now() - inc.horaRegistroMs) / 60000)
    : null

  const borderColor = isAbierto
    ? '#FCA5A5'
    : isAgente ? '#e5e7eb'
    : status === 'fail' ? '#fca5a5' : status === 'ok' ? '#bbf7d0' : 'var(--border)'

  return (
    <div style={{
      background: isAbierto ? '#FFF8F8' : 'var(--background)',
      border: `0.5px solid ${borderColor}`,
      borderRadius: 8, padding: '10px 12px', fontSize: 11,
      opacity: isAgente && !isAbierto ? 0.82 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={onNavigate} style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {inc.codigo}
          </button>
          <span style={{ color: 'var(--muted-foreground)' }}>·</span>
          <span style={{ color: 'var(--muted-foreground)' }}>{TIPO_LABELS[inc.tipo] ?? inc.tipo}</span>
          {isAgente && !isAbierto && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#F3F4F6', color: '#6B7280', fontWeight: 500 }}>
              agente · no evaluable
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isAbierto && elapsedMin != null && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 700, background: '#FECACA', color: '#B91C1C', whiteSpace: 'nowrap' }}>
              ABIERTO · {fmtMin(elapsedMin)}
            </span>
          )}
          {inc.mttrMin != null && !isAbierto && (
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted-foreground)' }}>{fmtMin(inc.mttrMin)}</span>
          )}
          {!isAgente && !isAbierto && status !== 'na' && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 600, background: status === 'ok' ? '#EAF3DE' : '#FCEBEB', color: status === 'ok' ? '#3B6D11' : '#A32D2D' }}>
              {status === 'ok' ? '✓ SLA' : '✗ SLA'}
            </span>
          )}
        </div>
      </div>

      <TimelineRow dot="blue" label="Inicio del incidente" hora={inc.horaInicio} delta={null} isLast={isAgente && !inc.horaFin} />
      {isAgente ? (
        inc.horaFin
          ? <TimelineRow dot="green" label="Resuelto por agente" hora={inc.horaFin} delta={inc.mttrMin != null ? `${fmtMin(inc.mttrMin)} total` : null} isLast />
          : <TimelineRow dot="gray" label="En atención por agente" hora={null} delta={elapsedMin != null ? `${fmtMin(elapsedMin)} abierto` : null} isAlert isLast />
      ) : (
        <>
          {inc.horaEnvioN1 && (
            <TimelineRow dot="orange" label="Correo N1 enviado" hora={inc.horaEnvioN1} delta={inc.minHastaEnvio != null ? `+${fmtMin(inc.minHastaEnvio)} desde inicio` : null} />
          )}
          {inc.horaRespuesta
            ? <TimelineRow dot="green" label="Respuesta recibida" hora={inc.horaRespuesta} delta={inc.minRespuesta != null ? `+${fmtMin(inc.minRespuesta)} desde correo` : null} />
            : inc.horaEnvioN1
              ? <TimelineRow dot="red" label="No hubo respuesta" hora={null} delta={null} isAlert />
              : null
          }
          {inc.horaFin
            ? <TimelineRow dot="purple" label="Incidente resuelto" hora={inc.horaFin} delta={inc.minSolucionDesdeCorreo != null ? `+${fmtMin(inc.minSolucionDesdeCorreo)} desde correo` : null} isLast />
            : <TimelineRow dot="red" label="Sin resolver" hora={null} delta={elapsedMin != null ? `${fmtMin(elapsedMin)} abierto` : null} isAlert isLast />
          }
        </>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DrillPanel({ open, onClose, metrica, desde, hasta }: DrillPanelProps) {
  const router = useRouter()
  const [data, setData]               = useState<DrillResponse | null>(null)
  const [loading, setLoading]         = useState(false)
  const [selectedProv, setSelectedProv]       = useState<string | null>(null)
  const [expandedTienda, setExpandedTienda]   = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setSelectedProv(null); setExpandedTienda(null); return }
    setLoading(true); setData(null)
    const params = new URLSearchParams({ desde, hasta })
    fetch(`/api/dashboard/drill-down?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [open, desde, hasta])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  const proveedores = data?.proveedores ?? []

  const sortedProvs = [...proveedores].sort((a, b) => {
    if (metrica === 'sla')  return (a.slaPct  ?? 100) - (b.slaPct  ?? 100)
    if (metrica === 'mttr') return (b.mttrAvg ?? 0)   - (a.mttrAvg ?? 0)
    // reincidencia: ordenar por tiendas con 2+ incidentes desc
    const aReinc = a.tiendas.filter(t => t.incidentesCount >= 2).length
    const bReinc = b.tiendas.filter(t => t.incidentesCount >= 2).length
    return bReinc !== aReinc ? bReinc - aReinc : b.incidentesCount - a.incidentesCount
  })

  const selData = selectedProv ? proveedores.find(p => p.nombre === selectedProv) ?? null : null

  const sortedTiendas = selData
    ? [...selData.tiendas]
      .filter(t => metrica !== 'reincidencia' || t.incidentesCount >= 2)
      .sort((a, b) =>
        metrica === 'sla'          ? (b.slaFail - a.slaFail)
        : metrica === 'reincidencia' ? b.incidentesCount - a.incidentesCount
        : (b.mttrAvg ?? 0) - (a.mttrAvg ?? 0)
      )
    : []

  const PANEL_TITLE = metrica === 'sla' ? 'SLA por proveedor'
    : metrica === 'mttr' ? 'MTTR por proveedor'
    : 'Reincidencia por proveedor'

  return (
    <>
      {open && (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.22)' }} />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, maxWidth: '95vw',
        background: 'var(--card)', borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 28px rgba(0,0,0,0.13)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.26s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--muted)', flexShrink: 0 }}>
          {selectedProv && (
            <button onClick={() => { setSelectedProv(null); setExpandedTienda(null) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#185FA5', fontSize: 13, padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
              ← Volver
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedProv ?? PANEL_TITLE}
            </div>
            {selData && (
              <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                {metrica === 'reincidencia' && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: sortedTiendas.length > 0 ? '#A32D2D' : '#3B6D11' }}>
                    {sortedTiendas.length} tienda{sortedTiendas.length !== 1 ? 's' : ''} reincidente{sortedTiendas.length !== 1 ? 's' : ''}
                  </span>
                )}
                {metrica !== 'reincidencia' && selData.slaPct != null && <span style={{ fontSize: 11, color: slaColor(selData.slaPct) }}>SLA {selData.slaPct}%</span>}
                {selData.mttrAvg != null && <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>MTTR {fmtMin(selData.mttrAvg)}</span>}
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{selData.incidentesCount} incidente{selData.incidentesCount !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted-foreground)', lineHeight: 1, padding: 4, flexShrink: 0 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>Cargando...</div>
          )}

          {/* L2 — Provider list */}
          {!loading && !selectedProv && (
            <div>
              {sortedProvs.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>Sin datos para el período seleccionado.</div>
              )}
              {sortedProvs.map((prov, i) => {
                const reincCount = prov.tiendas.filter(t => t.incidentesCount >= 2).length
                return (
                  <div
                    key={prov.nombre}
                    onClick={() => setSelectedProv(prov.nombre)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '0.5px solid var(--border)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#e5e7eb', minWidth: 22, textAlign: 'center', lineHeight: 1 }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{prov.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>
                        {metrica === 'reincidencia'
                          ? `${reincCount} tienda${reincCount !== 1 ? 's' : ''} reincidente${reincCount !== 1 ? 's' : ''} · ${prov.incidentesCount} incidente${prov.incidentesCount !== 1 ? 's' : ''}`
                          : `${prov.incidentesCount} incidente${prov.incidentesCount !== 1 ? 's' : ''} · ${prov.tiendas.length} tienda${prov.tiendas.length !== 1 ? 's' : ''}`
                        }
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
                      {metrica === 'reincidencia' ? (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Reinc.</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: reincCount > 0 ? '#A32D2D' : '#3B6D11' }}>{reincCount}</div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>SLA</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: slaColor(prov.slaPct) }}>{prov.slaPct != null ? `${prov.slaPct}%` : '—'}</div>
                        </div>
                      )}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>MTTR</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: mttrClr(prov.mttrAvg) }}>{fmtMin(prov.mttrAvg)}</div>
                      </div>
                      <span style={{ color: 'var(--muted-foreground)', fontSize: 18 }}>›</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* L3 — Store list with timelines */}
          {!loading && selectedProv && selData && (
            <div>
              {sortedTiendas.map((tienda) => {
                const isExpanded   = expandedTienda === tienda.codigo
                const hasFailSLA  = tienda.slaFail > 0
                const agenteCount = tienda.incidentes.filter(i => !i.horaEnvioN1).length
                const abiertoCount = tienda.incidentes.filter(i => !i.horaFin && i.horaEnvioN1).length
                return (
                  <div key={tienda.codigo} style={{ borderBottom: '0.5px solid var(--border)' }}>
                    {/* Store row */}
                    <div
                      onClick={() => setExpandedTienda(isExpanded ? null : tienda.codigo)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', background: isExpanded ? 'var(--muted)' : 'transparent', transition: 'background 0.1s' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{tienda.codigo}</span>
                          {tienda.nombre !== tienda.codigo && (
                            <span style={{ fontSize: 11, color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{tienda.nombre}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>
                          {tienda.incidentesCount} incidente{tienda.incidentesCount !== 1 ? 's' : ''}
                          {tienda.distrito ? ` · ${tienda.distrito}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        {tienda.mttrAvg != null && (
                          <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: mttrClr(tienda.mttrAvg) }}>{fmtMin(tienda.mttrAvg)}</span>
                        )}
                        {abiertoCount > 0 && (
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 700, background: '#FECACA', color: '#B91C1C', whiteSpace: 'nowrap' }}>
                            {abiertoCount} abierto{abiertoCount > 1 ? 's' : ''}
                          </span>
                        )}
                        {(tienda.slaOk + tienda.slaFail) > 0 && (
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 600, whiteSpace: 'nowrap', background: hasFailSLA ? '#FCEBEB' : '#EAF3DE', color: hasFailSLA ? '#A32D2D' : '#3B6D11' }}>
                            {hasFailSLA ? `✗ ${tienda.slaFail} fuera` : '✓ SLA OK'}
                          </span>
                        )}
                        {agenteCount > 0 && (
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#F3F4F6', color: '#6B7280', whiteSpace: 'nowrap' }}>
                            {agenteCount} agente
                          </span>
                        )}
                        <span style={{ color: 'var(--muted-foreground)', fontSize: 14, display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
                      </div>
                    </div>

                    {/* Incident timelines */}
                    {isExpanded && (
                      <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {tienda.incidentes.map((inc) => (
                          <IncidentTimeline
                            key={inc.id}
                            inc={inc}
                            onNavigate={() => { onClose(); router.push(`/incidentes/${inc.id}`) }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
