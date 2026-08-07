'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { TIPO_LABELS, TIPOS_CON_FICHA } from '@/lib/gestion-cambios-config'
const ESTADO_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  BORRADOR:      { label: 'Borrador',      bg: '#F1F5F9', color: '#475569' },
  PROPUESTO:     { label: 'Propuesto',     bg: '#EFF6FF', color: '#1D4ED8' },
  APROBADO:      { label: 'Aprobado',      bg: '#F0FDF4', color: '#15803D' },
  COMPLETADO:    { label: 'Completado',    bg: '#ECFDF5', color: '#065F46' },
  RECHAZADO:     { label: 'Rechazado',     bg: '#FEF2F2', color: '#991B1B' },
  CANCELADO:     { label: 'Cancelado',     bg: '#F8FAFC', color: '#94A3B8' },
}
const FLOW = ['BORRADOR','PROPUESTO','APROBADO','COMPLETADO']

function fmtFecha(d: string | null) {
  if (!d) return '—'
  // Fecha-solo-día (YYYY-MM-DD, ej. fecha planificada): formatear directo, SIN conversión de
  // zona — convertirla a Lima correría el día un día atrás.
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, dd] = d.split('-')
    return `${dd}/${m}/${y}`
  }
  const raw = typeof d === 'string' && !d.includes('Z') && !d.includes('+') ? d + 'Z' : d
  return new Date(raw).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' })
}
function fmtFechaHora(d: string | null) {
  if (!d) return '—'
  const raw = typeof d === 'string' && !d.includes('Z') && !d.includes('+') ? d + 'Z' : d
  const dt = new Date(raw)
  return dt.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' })
    + ' ' + dt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
}
function diasParaEval(fechaStr: string | null) {
  if (!fechaStr) return null
  return Math.ceil((new Date(fechaStr + 'T12:00:00').getTime() - Date.now()) / 86400000)
}

function MetricCard({ label, before, after, unit = '' }: { label: string; before: any; after: any; unit?: string }) {
  const b = before != null ? Number(before) : null
  const a = after  != null ? Number(after)  : null
  const delta = b != null && a != null ? a - b : null
  const mejor = label.includes('SLA') ? delta != null && delta > 0 : delta != null && delta < 0
  const peor  = label.includes('SLA') ? delta != null && delta < 0 : delta != null && delta > 0
  return (
    <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '10px 12px', flex: 1, minWidth: '120px' }}>
      <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{b != null ? `${b}${unit}` : '—'}</span>
        {a != null && <span style={{ fontSize: '14px', fontWeight: 700 }}>→ {a}{unit}</span>}
        {delta != null && (
          <span style={{ fontSize: '10px', fontWeight: 700, color: mejor ? '#15803D' : peor ? '#DC2626' : '#6B7280' }}>
            {delta > 0 ? '+' : ''}{delta}{unit}
          </span>
        )}
      </div>
    </div>
  )
}

export default function AccionDetallePage() {
  const params  = useParams()
  const id      = params.id as string
  const router  = useRouter()
  const { data: session } = useSession()

  const [accion, setAccion]     = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [actBusy, setActBusy]   = useState(false)
  const [rechazaMotivo, setRechazaMotivo] = useState('')
  const [showRechaza, setShowRechaza]     = useState(false)
  const [cancelaMotivo, setCancelaMotivo] = useState('')
  const [showCancela, setShowCancela]     = useState(false)
  const [evalNota30, setEvalNota30] = useState('')
  const [evalNota90, setEvalNota90] = useState('')
  const [notasEjec, setNotasEjec] = useState('')
  const [actionError, setActionError] = useState('')
  const [deleteBusy, setDeleteBusy]   = useState(false)
  const [pendingEval, setPendingEval]   = useState<30 | 90 | null>(null)
  const [pendingReset, setPendingReset] = useState<30 | 90 | null>(null)
  const [fichasDisponibles, setFichasDisponibles] = useState<any[]>([])
  const [selectedFichaId, setSelectedFichaId] = useState<string>('')
  const [fichaActual, setFichaActual] = useState<any>(null)

  const userRol  = (session?.user as any)?.rol ?? ''
  const userId   = (session?.user as any)?.id  ?? ''
  const isGerencia = userRol === 'GERENCIA' || userRol === 'DEMO'
  const isInfra    = ['INFRAESTRUCTURA', 'SUPERVISOR', 'DEMO'].includes(userRol)
  // Quién aprueba: supervisor + gerencia. Quién ejecuta/evalúa: infra + supervisor + gerencia.
  // (El estado APROBADO sigue siendo el guard real para que nada se ejecute sin aprobación.)
  const puedeAprobar  = ['SUPERVISOR', 'GERENCIA', 'DEMO'].includes(userRol)
  const puedeEjecutar = ['INFRAESTRUCTURA', 'SUPERVISOR', 'GERENCIA', 'DEMO'].includes(userRol)

  const fetchAccion = useCallback(() => {
    setLoading(true)
    fetch(`/api/gestion-cambios/${id}`)
      .then(r => r.json())
      .then(d => setAccion(d))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { fetchAccion() }, [fetchAccion])

  useEffect(() => {
    // La ficha se elige al PROPONER (estado BORRADOR), filtrada por el proveedor objetivo.
    if (!accion || !TIPOS_CON_FICHA.includes(accion.tipo)) return
    if (accion.estado !== 'BORRADOR') return
    const proveedorObjetivo = accion.proveedorNuevoId ?? accion.proveedorAnteriorId
    if (!accion.tiendaId || !proveedorObjetivo) return
    // Ficha actual de la tienda (referencia — la que se archivará)
    fetch(`/api/fichas?tiendaId=${accion.tiendaId}&estado=ACTIVA`)
      .then(r => r.json())
      .then(rows => setFichaActual(Array.isArray(rows) && rows[0] ? rows[0] : null))
      .catch(() => setFichaActual(null))
    // Fichas candidatas a activar (BORRADOR del proveedor objetivo). Sin auto-selección: el usuario elige.
    fetch(`/api/fichas?tiendaId=${accion.tiendaId}&proveedorId=${proveedorObjetivo}&estado=BORRADOR`)
      .then(r => r.json())
      .then(rows => setFichasDisponibles(Array.isArray(rows) ? rows : []))
      .catch(() => {})
  }, [accion?.tipo, accion?.tiendaId, accion?.proveedorNuevoId, accion?.proveedorAnteriorId, accion?.estado])

  async function doEliminar() {
    if (!confirm(`¿Eliminar el borrador ${accion?.codigo}? Esta acción no se puede deshacer.`)) return
    setDeleteBusy(true)
    const res = await fetch(`/api/gestion-cambios/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setActionError(data.error ?? `Error ${res.status}`)
      setDeleteBusy(false)
      return
    }
    router.push('/gestion-cambios')
  }

  async function doAction(endpoint: string, body: any = {}) {
    setActBusy(true); setActionError('')
    const res = await fetch(`/api/gestion-cambios/${id}/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setActionError(data.error ?? `Error ${res.status}`); setActBusy(false); return }
    setActBusy(false); fetchAccion()
  }

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Cargando...</div>
  if (!accion || accion.error) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Acción no encontrada.</div>

  const est  = ESTADO_CONFIG[accion.estado] ?? ESTADO_CONFIG.BORRADOR
  const step = FLOW.indexOf(accion.estado)
  const dias30 = diasParaEval(accion.fechaEval30)
  const dias90 = diasParaEval(accion.fechaEval90)

  const btnStyle = (active: boolean, color = 'hsl(221,83%,23%)'): React.CSSProperties => ({
    padding: '8px 16px', fontSize: '12px', fontWeight: 600, borderRadius: '7px', cursor: actBusy || !active ? 'default' : 'pointer',
    border: 'none', background: active ? color : 'var(--muted)', color: active ? 'white' : 'var(--muted-foreground)',
    opacity: actBusy ? 0.6 : 1,
  })

  return (
    <div style={{ padding: '20px 24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '18px' }}>
        <button onClick={() => router.push('/gestion-cambios')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: '18px', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: 'hsl(221,83%,23%)' }}>{accion.codigo}</span>
            <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: 600, background: est.bg, color: est.color }}>{est.label}</span>
            <span style={{ fontSize: '10px', padding: '2px 8px', background: 'var(--muted)', borderRadius: '99px', color: 'var(--muted-foreground)' }}>{TIPO_LABELS[accion.tipo] ?? accion.tipo}</span>
          </div>
          <h1 style={{ fontSize: '16px', fontWeight: 700, margin: '4px 0 0', color: 'var(--foreground)' }}>{accion.titulo}</h1>
        </div>
      </div>

      {/* Timeline de estados */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
        {FLOW.map((s, i) => {
          const done    = i < step
          const current = i === step
          const cfg     = ESTADO_CONFIG[s]
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ textAlign: 'center', padding: '4px 10px', borderRadius: '6px', background: current ? cfg.bg : done ? '#F0FDF4' : 'transparent', border: current ? `1px solid ${cfg.color}` : done ? '1px solid #86EFAC' : '1px solid var(--border)' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: current ? cfg.color : done ? '#15803D' : 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                  {done ? '✓ ' : ''}{cfg.label}
                </div>
              </div>
              {i < FLOW.length - 1 && <div style={{ width: '20px', height: '1px', background: i < step ? '#86EFAC' : 'var(--border)', flexShrink: 0 }} />}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Acciones disponibles */}
        {actionError && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '7px', padding: '8px 12px', fontSize: '12px', color: '#991B1B' }}>{actionError}</div>
        )}

        {accion.estado === 'BORRADOR' && (isInfra || isGerencia || accion.creadoPorId === userId) && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '10px' }}>Acciones disponibles</div>

            {/* Tipos con ficha: se adjunta AHORA (obligatoria para proponer) */}
            {TIPOS_CON_FICHA.includes(accion.tipo) && isInfra && (
              <div style={{ marginBottom: '12px' }}>
                {/* Ficha ACTUAL de la tienda (referencia — se archivará). No seleccionable, sí clickeable para ver. */}
                {fichaActual && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>
                      Ficha actual
                      <span style={{ fontSize: '9px', fontWeight: 400, textTransform: 'none', marginLeft: '4px' }}>(se archivará al ejecutar)</span>
                    </label>
                    <div onClick={() => router.push(`/gestion-cambios/fichas/${fichaActual.id}`)}
                      title="Ver contenido de la ficha"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', cursor: 'pointer' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700 }}>{fichaActual.codigo}</span>
                      <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
                        {fichaActual.proveedorNombre}{fichaActual.tipoConexion ? ` · ${fichaActual.tipoConexion}` : ''}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 600, color: '#7C3AED' }}>ver ↗</span>
                    </div>
                  </div>
                )}

                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>
                  Ficha a activar *
                  <span style={{ fontSize: '9px', fontWeight: 400, textTransform: 'none', marginLeft: '4px' }}>(obligatoria — selecciona una)</span>
                </label>
                {fichasDisponibles.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '7px', fontSize: '11px', color: '#C2410C' }}>
                    <span>⚠</span>
                    <span>No hay fichas en borrador para esta acción. Créala en la sección Fichas y vuelve a seleccionarla.</span>
                    <button
                      onClick={() => router.push('/gestion-cambios/fichas')}
                      style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '5px', background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Ir a Fichas →
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {fichasDisponibles.map(f => (
                      <label key={f.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 10px', border: `1px solid ${selectedFichaId === f.id ? '#7C3AED' : 'var(--border)'}`, borderRadius: '7px', cursor: 'pointer', background: selectedFichaId === f.id ? '#F5F3FF' : 'var(--background)' }}>
                        <input type="radio" name="fichaSeleccionada" value={f.id} checked={selectedFichaId === f.id} onChange={() => setSelectedFichaId(f.id)}
                          style={{ marginTop: '1px', accentColor: '#7C3AED' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: '#7C3AED' }}>{f.codigo}</span>
                            {f.tipoConexion && <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{f.tipoConexion}</span>}
                            {f.velocidad && <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>· {f.velocidad}</span>}
                            <button type="button" title="Ver contenido de la ficha"
                              onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(`/gestion-cambios/fichas/${f.id}`) }}
                              style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 600, color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                              ver ↗
                            </button>
                          </div>
                          {f.descripcionServicio && (
                            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{f.descripcionServicio}</div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {isInfra && (() => {
                const faltaFicha = TIPOS_CON_FICHA.includes(accion.tipo) && !selectedFichaId
                return (
                  <>
                    <button
                      onClick={() => doAction('proponer', { fichaNuevaId: selectedFichaId || null })}
                      disabled={actBusy || faltaFicha}
                      title={faltaFicha ? 'Adjunta la ficha del nuevo proveedor para poder proponer' : ''}
                      style={btnStyle(!faltaFicha)}>Enviar a aprobación</button>
                    <button onClick={() => router.push(`/gestion-cambios/nueva?id=${accion.id}`)} disabled={actBusy}
                      style={{ ...btnStyle(false), background: 'var(--muted)', color: 'var(--foreground)', border: '0.5px solid var(--border)' }}>
                      Editar
                    </button>
                  </>
                )
              })()}
              {(accion.creadoPorId === userId || isGerencia || ['SUPERVISOR'].includes(userRol)) && (
                <button onClick={doEliminar} disabled={deleteBusy || actBusy}
                  style={{ ...btnStyle(true, '#991B1B'), marginLeft: 'auto', opacity: deleteBusy ? 0.6 : 1 }}>
                  {deleteBusy ? 'Eliminando…' : 'Eliminar borrador'}
                </button>
              )}
            </div>
          </div>
        )}

        {accion.estado === 'PROPUESTO' && puedeAprobar && (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#1D4ED8', marginBottom: '10px' }}>Pendiente de tu aprobación</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <button onClick={() => doAction('aprobar')} disabled={actBusy} style={btnStyle(true, '#15803D')}>Aprobar</button>
              <button onClick={() => setShowRechaza(v => !v)} disabled={actBusy} style={btnStyle(true, '#991B1B')}>Rechazar</button>
            </div>
            {showRechaza && (
              <div style={{ marginTop: '10px' }}>
                <textarea value={rechazaMotivo} onChange={e => setRechazaMotivo(e.target.value)}
                  placeholder="Motivo del rechazo…" rows={2}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                <button onClick={() => doAction('rechazar', { rechazadoMotivo: rechazaMotivo })} disabled={actBusy || !rechazaMotivo.trim()}
                  style={{ ...btnStyle(!!rechazaMotivo.trim(), '#991B1B'), marginTop: '6px' }}>Confirmar rechazo</button>
              </div>
            )}
          </div>
        )}

        {accion.estado === 'APROBADO' && puedeEjecutar && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>Listo para ejecutar</div>

            {TIPOS_CON_FICHA.includes(accion.tipo) && (
              <div style={{ marginBottom: '12px', padding: '8px 10px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '7px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>
                  Ficha que se activará
                </div>
                <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 700, color: '#7C3AED' }}>{accion.fichaNuevaCodigo ?? '—'}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Adjuntada al proponer la acción.</div>
              </div>
            )}

            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Notas de ejecución (opcional)</label>
              <textarea value={notasEjec} onChange={e => setNotasEjec(e.target.value)} rows={2} placeholder="Coordinaciones con proveedor, hora exacta, incidencias…"
                style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <button
              onClick={() => doAction('ejecutar', { notasEjecucion: notasEjec })}
              disabled={actBusy}
              style={btnStyle(true, '#7E22CE')}>
              Ejecutar y completar
            </button>
            {TIPOS_CON_FICHA.includes(accion.tipo) && (
              <div style={{ fontSize: '10px', color: '#7E22CE', marginTop: '6px' }}>
                {accion.tipo === 'CAMBIO_CONTRATO' && accion.proveedorAnteriorId && accion.proveedorNuevoId && accion.proveedorAnteriorId !== accion.proveedorNuevoId
                  ? `Actualizará el proveedor de la tienda y activará la ficha ${accion.fichaNuevaCodigo ?? ''}.`
                  : `Activará la ficha ${accion.fichaNuevaCodigo ?? ''} en la tienda.`}
              </div>
            )}
            {accion.tipo === 'BAJA_CONTRATO' && (
              <div style={{ fontSize: '10px', color: '#7E22CE', marginTop: '6px' }}>
                Dará de baja el contrato: la ficha activa quedará archivada (Dada de Baja) y la tienda quedará sin proveedor ni ficha activa.
              </div>
            )}
          </div>
        )}

        {['PROPUESTO', 'APROBADO'].includes(accion.estado) && (isInfra || isGerencia || accion.creadoPorId === userId) && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
            {!showCancela ? (
              <button onClick={() => setShowCancela(true)} disabled={actBusy}
                style={{ ...btnStyle(true, '#64748B'), background: 'transparent', color: '#64748B', border: '0.5px solid #CBD5E1' }}>
                Cancelar acción
              </button>
            ) : (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Cancelar esta acción (no se ejecutará)</div>
                <textarea value={cancelaMotivo} onChange={e => setCancelaMotivo(e.target.value)}
                  placeholder="Motivo de la cancelación…" rows={2}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button onClick={() => doAction('cancelar', { motivo: cancelaMotivo })} disabled={actBusy || !cancelaMotivo.trim()}
                    style={btnStyle(!!cancelaMotivo.trim(), '#991B1B')}>Confirmar cancelación</button>
                  <button onClick={() => { setShowCancela(false); setCancelaMotivo('') }} disabled={actBusy}
                    style={{ ...btnStyle(false), background: 'var(--muted)', color: 'var(--foreground)', border: '0.5px solid var(--border)' }}>No, volver</button>
                </div>
              </div>
            )}
          </div>
        )}

        {accion.estado === 'COMPLETADO' && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400E', marginBottom: '10px' }}>Evaluación de resultados <span style={{ fontWeight: 400, fontSize: '10px', color: '#A16207' }}>(opcional — no afecta el estado)</span></div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {!accion.eval30Completada && (
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, marginBottom: '6px', color: dias30 !== null && dias30 <= 0 ? '#DC2626' : '#92400E' }}>
                    Evaluación 30 días {dias30 !== null ? (dias30 <= 0 ? '(disponible)' : `(en ${dias30}d)`) : ''}
                  </div>
                  <textarea value={evalNota30} onChange={e => setEvalNota30(e.target.value)} rows={2}
                    placeholder="Nota sobre los resultados observados…"
                    style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid #FCD34D', borderRadius: '7px', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit', marginBottom: '6px' }} />
                  {pendingEval === 30 ? (
                    <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '7px', padding: '10px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600, marginBottom: '8px', color: '#92400E' }}>¿Calcular evaluación 30d? Esto registrará los resultados definitivos del período.</div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => { setPendingEval(null); doAction('evaluar', { periodo: 30, nota: evalNota30 }) }} disabled={actBusy} style={btnStyle(true, '#D97706')}>Confirmar</button>
                        <button onClick={() => setPendingEval(null)} disabled={actBusy} style={{ ...btnStyle(false), background: 'var(--muted)', color: 'var(--foreground)', border: '0.5px solid var(--border)' }}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setPendingEval(30)} disabled={actBusy} style={btnStyle(true, '#D97706')}>
                      Calcular evaluación 30d
                    </button>
                  )}
                </div>
              )}
              {accion.eval30Completada && !accion.eval90Completada && (
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, marginBottom: '6px', color: dias90 !== null && dias90 <= 0 ? '#DC2626' : '#92400E' }}>
                    Evaluación 90 días {dias90 !== null ? (dias90 <= 0 ? '(disponible)' : `(en ${dias90}d)`) : ''}
                  </div>
                  <textarea value={evalNota90} onChange={e => setEvalNota90(e.target.value)} rows={2}
                    placeholder="Nota trimestral sobre los resultados…"
                    style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid #FCD34D', borderRadius: '7px', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit', marginBottom: '6px' }} />
                  {pendingEval === 90 ? (
                    <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '7px', padding: '10px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600, marginBottom: '8px', color: '#92400E' }}>¿Calcular evaluación 90d? Esto registrará los resultados definitivos del período.</div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => { setPendingEval(null); doAction('evaluar', { periodo: 90, nota: evalNota90 }) }} disabled={actBusy} style={btnStyle(true, '#D97706')}>Confirmar</button>
                        <button onClick={() => setPendingEval(null)} disabled={actBusy} style={{ ...btnStyle(false), background: 'var(--muted)', color: 'var(--foreground)', border: '0.5px solid var(--border)' }}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setPendingEval(90)} disabled={actBusy} style={btnStyle(true, '#D97706')}>
                      Calcular evaluación 90d
                    </button>
                  )}
                </div>
              )}
              {accion.eval30Completada && accion.eval90Completada && (
                <div style={{ fontSize: '12px', color: '#065F46', fontWeight: 600 }}>✓ Ambas evaluaciones completadas</div>
              )}
            </div>
          </div>
        )}

        {/* Datos básicos */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '12px', color: 'var(--foreground)' }}>Información general</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
            <div><span style={{ color: 'var(--muted-foreground)' }}>Registrado por</span><br /><strong>{accion.creadoPorNombre}</strong> <span style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>({accion.creadoPorRol})</span></div>
            <div><span style={{ color: 'var(--muted-foreground)' }}>Creado</span><br /><strong>{fmtFechaHora(accion.creadoEn)}</strong></div>
            <div><span style={{ color: 'var(--muted-foreground)' }}>Ejecución planificada</span><br /><strong>{accion.fechaEjecucionPlanificada ? fmtFecha(accion.fechaEjecucionPlanificada) : '—'}</strong></div>
            {accion.aprobadoPorNombre && <div><span style={{ color: 'var(--muted-foreground)' }}>Aprobado por</span><br /><strong>{accion.aprobadoPorNombre}</strong> · {fmtFechaHora(accion.aprobadoEn)}</div>}
            {accion.ejecutadoPorNombre && <div><span style={{ color: 'var(--muted-foreground)' }}>Ejecutado por</span><br /><strong>{accion.ejecutadoPorNombre}</strong> · {fmtFechaHora(accion.ejecutadoEn)}</div>}
            {accion.rechazadoMotivo && <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#991B1B' }}>Motivo de rechazo:</span><br /><strong style={{ color: '#991B1B' }}>{accion.rechazadoMotivo}</strong></div>}
          </div>
          {accion.motivo && <div style={{ marginTop: '12px', fontSize: '12px' }}><span style={{ color: 'var(--muted-foreground)' }}>Motivo:</span><br />{accion.motivo}</div>}
          {accion.descripcion && <div style={{ marginTop: '8px', fontSize: '12px' }}><span style={{ color: 'var(--muted-foreground)' }}>Descripción:</span><br />{accion.descripcion}</div>}
          {accion.notasAprobacion && <div style={{ marginTop: '8px', fontSize: '12px', color: '#15803D' }}><span>Nota de aprobación:</span> {accion.notasAprobacion}</div>}
          {accion.notasEjecucion  && <div style={{ marginTop: '8px', fontSize: '12px', color: '#7E22CE' }}><span>Notas de ejecución:</span> {accion.notasEjecucion}</div>}
        </div>

        {/* Alcance */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '12px' }}>Alcance</div>
          {accion.alcance === 'TIENDA' && accion.tiendaCodigo ? (
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', flexWrap: 'wrap' }}>
              <div><span style={{ color: 'var(--muted-foreground)' }}>Tienda</span><br /><strong style={{ fontFamily: 'monospace' }}>{accion.tiendaCodigo}</strong> — {accion.tiendaNombre}</div>
              {accion.tiendaDistrito && <div><span style={{ color: 'var(--muted-foreground)' }}>Distrito</span><br /><strong>{accion.tiendaDistrito}</strong></div>}
              {accion.tiendaCluster && <div><span style={{ color: 'var(--muted-foreground)' }}>Cluster</span><br /><strong>{accion.tiendaCluster}</strong></div>}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Zona: {accion.zonaDescripcion ?? '—'}</div>
              {accion.tiendasScope?.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {accion.tiendasScope.map((t: any) => (
                    <span key={t.id} style={{ padding: '3px 8px', background: 'var(--muted)', borderRadius: '5px', fontSize: '11px', fontFamily: 'monospace', fontWeight: 600 }}>
                      {t.tiendaCodigo} <span style={{ fontFamily: 'inherit', fontWeight: 400, color: 'var(--muted-foreground)' }}>{t.tiendaNombre}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {(accion.proveedorAnteriorNombre || accion.proveedorNuevoNombre) && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px' }}>
              {accion.proveedorAnteriorNombre && <span style={{ padding: '4px 12px', background: '#FEE2E2', color: '#991B1B', borderRadius: '6px', fontWeight: 700 }}>{accion.proveedorAnteriorNombre}</span>}
              {accion.proveedorNuevoNombre && <>
                <span style={{ color: 'var(--muted-foreground)', fontSize: '18px' }}>→</span>
                <span style={{ padding: '4px 12px', background: '#DCFCE7', color: '#15803D', borderRadius: '6px', fontWeight: 700 }}>{accion.proveedorNuevoNombre}</span>
              </>}
            </div>
          )}
        </div>

        {/* Snapshot ANTES */}
        {accion.snapNincidentes != null && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '10px' }}>
              Métricas antes del cambio
              {accion.snapPeriodoDias && <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: '8px' }}>Últimos {accion.snapPeriodoDias} días previos</span>}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { label: 'SLA cumplido',  value: accion.snapSlaPct != null    ? `${accion.snapSlaPct}%`                        : '—' },
                { label: 'MTTR prom.',    value: accion.snapMttrMin != null   ? `${accion.snapMttrMin} min`                    : '—' },
                { label: 'IEI acumulado', value: accion.snapIei != null && Number(accion.snapIei) > 0 ? `S/ ${Number(accion.snapIei).toLocaleString('es-PE')}` : '—' },
                { label: 'Incidentes',    value: accion.snapNincidentes ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ flex: '1 1 120px', background: 'var(--muted)', borderRadius: '7px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comparación evaluaciones */}
        {(accion.eval30Completada || accion.eval90Completada) && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '12px' }}>Comparación antes / después</div>

            {accion.eval30Completada && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Evaluación 30 días — {fmtFechaHora(accion.eval30Fecha)}
                  </div>
                  {puedeEjecutar && (pendingReset === 30 ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11px' }}>
                      <span style={{ color: '#92400E' }}>¿Borrar y recalcular?</span>
                      <button onClick={() => { setPendingReset(null); doAction('resetear-eval', { periodo: 30 }) }} disabled={actBusy}
                        style={{ fontSize: '10px', background: '#D97706', color: 'white', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}>Sí</button>
                      <button onClick={() => setPendingReset(null)} disabled={actBusy}
                        style={{ fontSize: '10px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}>No</button>
                    </div>
                  ) : (
                    <button onClick={() => setPendingReset(30)} disabled={actBusy}
                      style={{ fontSize: '10px', background: 'none', border: '0.5px solid var(--border)', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                      Recalcular
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <MetricCard label="SLA cumplido" before={accion.snapSlaPct}   after={accion.eval30SlaPct}   unit="%" />
                  <MetricCard label="MTTR prom."   before={accion.snapMttrMin}  after={accion.eval30MttrMin}  unit=" min" />
                  <MetricCard label="Incidentes"   before={accion.snapNincidentes} after={accion.eval30Nincidentes} />
                  <MetricCard label="IEI acum."    before={accion.snapIei}      after={accion.eval30Iei}      unit=" S/" />
                </div>
                {accion.penalidadEstimada && Number(accion.penalidadEstimada) > 0 && (
                  <div style={{ marginTop: '8px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: '#92400E' }}>
                    Penalidad estimada (base nota de crédito): <strong>S/ {Number(accion.penalidadEstimada).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</strong>
                  </div>
                )}
                {accion.eval30Nota && <div style={{ marginTop: '8px', fontSize: '12px', fontStyle: 'italic', color: 'var(--muted-foreground)' }}>{accion.eval30Nota}</div>}
              </div>
            )}

            {accion.eval90Completada && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Evaluación 90 días — {fmtFechaHora(accion.eval90Fecha)}
                  </div>
                  {puedeEjecutar && (pendingReset === 90 ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11px' }}>
                      <span style={{ color: '#065F46' }}>¿Borrar y recalcular?</span>
                      <button onClick={() => { setPendingReset(null); doAction('resetear-eval', { periodo: 90 }) }} disabled={actBusy}
                        style={{ fontSize: '10px', background: '#059669', color: 'white', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}>Sí</button>
                      <button onClick={() => setPendingReset(null)} disabled={actBusy}
                        style={{ fontSize: '10px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}>No</button>
                    </div>
                  ) : (
                    <button onClick={() => setPendingReset(90)} disabled={actBusy}
                      style={{ fontSize: '10px', background: 'none', border: '0.5px solid var(--border)', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                      Recalcular
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <MetricCard label="SLA cumplido" before={accion.snapSlaPct}      after={accion.eval90SlaPct}   unit="%" />
                  <MetricCard label="MTTR prom."   before={accion.snapMttrMin}     after={accion.eval90MttrMin}  unit=" min" />
                  <MetricCard label="Incidentes"   before={accion.snapNincidentes} after={accion.eval90Nincidentes} />
                  <MetricCard label="IEI acum."    before={accion.snapIei}         after={accion.eval90Iei}      unit=" S/" />
                </div>
                {accion.eval90Nota && <div style={{ marginTop: '8px', fontSize: '12px', fontStyle: 'italic', color: 'var(--muted-foreground)' }}>{accion.eval90Nota}</div>}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
