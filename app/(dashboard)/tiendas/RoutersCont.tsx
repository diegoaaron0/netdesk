'use client'
import { useEffect, useState, useCallback } from 'react'

function fmtMin(min: number): string {
  if (!min || min < 0) return '0m'
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function fmtFecha(d: string | null): string {
  if (!d) return '—'
  const raw = typeof d === 'string' && !d.includes('Z') && !d.includes('+') ? d + 'Z' : d
  return new Date(raw).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
}

const ESTADO_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  DISPONIBLE:         { label: 'Disponible',     bg: '#DCFCE7', color: '#166534' },
  EN_TIENDA_ACTIVO:   { label: 'Activo',         bg: '#FEF3C7', color: '#92400E' },
  EN_TIENDA_INACTIVO: { label: 'En tienda',      bg: '#E0E7FF', color: '#3730A3' },
}

// ── Modal: historial de un router ─────────────────────────────────────────────
function HistorialModal({ router, onClose }: { router: any; onClose: () => void }) {
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/routers-externos/${router.id}`)
      .then(r => r.json()).then(setDetail).finally(() => setLoading(false))
  }, [router.id])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '24px', width: '640px', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{router.codigo} — Historial</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--muted-foreground)' }}>✕</button>
        </div>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Cargando...</div>
        ) : (
          <>
            {/* Campos del router */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px', padding: '12px', background: 'var(--muted)', borderRadius: '8px' }}>
              {[['IP', detail.ip], ['Chip/SIM', detail.chip], ['Plan', detail.plan], ['Tipo conexión', detail.tipo_conexion], ['Contraseña', detail.password]].map(([label, val]) => (
                <div key={label as string}>
                  <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, fontFamily: label === 'Contraseña' || label === 'IP' ? 'monospace' : undefined }}>{val || '—'}</div>
                </div>
              ))}
            </div>

            {/* Fotos */}
            {detail.fotos?.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Fotos del equipo</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {detail.fotos.map((f: any) => (
                    <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '6px 10px', background: 'var(--muted)', borderRadius: '6px', border: '0.5px solid var(--border)', textDecoration: 'none', color: 'var(--foreground)' }}>
                      <span style={{ fontSize: '18px' }}>🖼</span>
                      <span style={{ fontSize: '9px' }}>{f.descripcion || 'Foto'}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Historial tabla */}
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Historial de despliegues</div>
            {!detail.historial?.length ? (
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Sin historial registrado</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                    {['Acción', 'Tienda', 'Ingreso', 'Retorno', 'Duración', 'Nota'].map(h => (
                      <th key={h} style={{ padding: '5px 6px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.historial.map((h: any, i: number) => (
                    <tr key={h.id} style={{ borderTop: i > 0 ? '0.5px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '5px 6px' }}>
                        <span style={{ padding: '1px 6px', borderRadius: '999px', fontSize: '9px', fontWeight: 600,
                          background: h.accion === 'DESPLIEGUE' ? '#FEF3C7' : h.accion === 'RETORNO' ? '#DCFCE7' : '#E0E7FF',
                          color: h.accion === 'DESPLIEGUE' ? '#92400E' : h.accion === 'RETORNO' ? '#166534' : '#3730A3' }}>
                          {h.accion}
                        </span>
                      </td>
                      <td style={{ padding: '5px 6px', fontWeight: 600 }}>{h.tienda_codigo}</td>
                      <td style={{ padding: '5px 6px', fontSize: '10px' }}>{fmtFecha(h.fecha_ingreso)}</td>
                      <td style={{ padding: '5px 6px', fontSize: '10px' }}>{h.fecha_retorno ? fmtFecha(h.fecha_retorno) : <span style={{ color: 'var(--muted-foreground)' }}>activo</span>}</td>
                      <td style={{ padding: '5px 6px', fontFamily: 'monospace' }}>{h.tiempo_uso_min ? fmtMin(h.tiempo_uso_min) : '—'}</td>
                      <td style={{ padding: '5px 6px', fontSize: '10px', color: 'var(--muted-foreground)' }}>{h.nota || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Modal: retorno ─────────────────────────────────────────────────────────────
function RetornoModal({ router, onClose, onDone }: { router: any; onClose: () => void; onDone: () => void }) {
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState(false)

  async function confirmar() {
    setSaving(true)
    const res = await fetch(`/api/routers-externos/${router.id}/retorno`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nota }),
    })
    if (res.ok) { setOk(true); setTimeout(() => { onClose(); onDone() }, 1200) }
    else setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '24px', width: '380px' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Marcar retorno — {router.codigo}</div>
        {ok ? (
          <div style={{ textAlign: 'center', color: '#166534', fontWeight: 600, padding: '16px 0' }}>✓ Router marcado como disponible en TI</div>
        ) : (
          <>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '12px' }}>
              El router volverá a estar disponible. Se sellará el tiempo de uso en {router.tienda_codigo || 'la tienda'}.
            </div>
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Nota (opcional)</label>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: Proveedor restableció fibra, se retiró equipo"
              style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)', boxSizing: 'border-box', marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '7px 16px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmar} disabled={saving}
                style={{ padding: '7px 16px', fontSize: '12px', background: '#166534', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Guardando...' : 'Confirmar retorno'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Modal: traslado ────────────────────────────────────────────────────────────
function TrasladoModal({ router, onClose, onDone }: { router: any; onClose: () => void; onDone: () => void }) {
  const [tiendas, setTiendas] = useState<any[]>([])
  const [tiendaId, setTiendaId] = useState('')
  const [justificacion, setJustificacion] = useState('')
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/tiendas')
      .then(r => r.json())
      .then(data => setTiendas(Array.isArray(data) ? data : []))
      .catch(() => setTiendas([]))
  }, [])

  async function confirmar() {
    if (!tiendaId) return
    setSaving(true); setError('')
    const res = await fetch(`/api/routers-externos/${router.id}/traslado`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiendaId, justificacion }),
    })
    if (res.ok) { setOk(true); setTimeout(() => { onClose(); onDone() }, 1200) }
    else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Error al trasladar')
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '24px', width: '400px' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Trasladar {router.codigo}</div>
        {ok ? (
          <div style={{ textAlign: 'center', color: '#3730A3', fontWeight: 600, padding: '16px 0' }}>✓ Router trasladado</div>
        ) : (
          <>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '12px' }}>
              Para activar el router en la tienda destino, deberás crear un incidente y seleccionarlo ahí.
            </div>
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Tienda destino</label>
            <select value={tiendaId} onChange={e => setTiendaId(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)', marginBottom: '12px', boxSizing: 'border-box' }}>
              <option value="">— Seleccionar —</option>
              {tiendas.map((t: any) => <option key={t.id} value={t.id}>{t.codigo} — {t.nombre_cc}</option>)}
            </select>
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Justificación</label>
            <input value={justificacion} onChange={e => setJustificacion(e.target.value)} placeholder="Motivo del traslado"
              style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)', boxSizing: 'border-box', marginBottom: '16px' }} />
            {error && <div style={{ fontSize: '11px', color: '#b91c1c', background: '#fee2e2', borderRadius: '6px', padding: '6px 10px', marginBottom: '12px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '7px 16px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmar} disabled={saving || !tiendaId}
                style={{ padding: '7px 16px', fontSize: '12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, opacity: saving || !tiendaId ? 0.6 : 1 }}>
                {saving ? 'Guardando...' : 'Confirmar traslado'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function RoutersContingenciaTI() {
  const [routers, setRouters]         = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [historialRouter, setHistorialRouter] = useState<any | null>(null)
  const [retornoRouter, setRetornoRouter]     = useState<any | null>(null)
  const [trasladoRouter, setTrasladoRouter]   = useState<any | null>(null)
  const [addOpen, setAddOpen]         = useState(false)
  const [newCodigo, setNewCodigo]     = useState('')
  const [saving, setSaving]           = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<any | null>(null)

  const fetchRouters = useCallback(() => {
    setLoading(true)
    fetch('/api/routers-externos')
      .then(r => r.json())
      .then(data => setRouters(Array.isArray(data) ? data : []))
      .catch(() => setRouters([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchRouters() }, [fetchRouters])

  async function crearRouter() {
    if (!newCodigo.trim()) return
    setSaving(true)
    const res = await fetch('/api/routers-externos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: newCodigo.trim() }),
    })
    if (res.ok) { setAddOpen(false); setNewCodigo(''); fetchRouters() }
    setSaving(false)
  }

  async function eliminarRouter(id: string) {
    const res = await fetch(`/api/routers-externos/${id}`, { method: 'DELETE' })
    if (res.ok) { setDeleteConfirm(null); fetchRouters() }
    else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'No se pudo eliminar')
    }
  }

  const disponibles  = routers.filter(r => r.estado === 'DISPONIBLE')
  const enUso        = routers.filter(r => r.estado !== 'DISPONIBLE')

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Routers Contingencia TI</h2>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
            {disponibles.length} disponibles · {enUso.length} en campo
          </div>
        </div>
        <button onClick={() => setAddOpen(true)}
          style={{ padding: '7px 14px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
          + Agregar router
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Cargando...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {routers.length === 0 && (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>No hay routers registrados</div>
          )}
          {routers.map(r => {
            const badge = ESTADO_BADGE[r.estado] ?? ESTADO_BADGE.DISPONIBLE
            const tiempoTotal = Number(r.tiempo_total_min ?? 0)
            return (
              <div key={r.id} style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Código + estado */}
                <div style={{ minWidth: '80px' }}>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '14px' }}>{r.codigo}</div>
                  <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', background: badge.bg, color: badge.color }}>
                    {badge.label}
                  </span>
                </div>

                {/* Ubicación */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {r.estado !== 'DISPONIBLE' ? (
                    <>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>{r.tienda_codigo} — {r.tienda_nombre}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
                        {r.tienda_distrito} · Desde {r.fecha_ingreso_actual ? new Date(r.fecha_ingreso_actual).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', timeZone: 'America/Lima' }) : '—'}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>En área TI</div>
                  )}
                </div>

                {/* Tiempo total acumulado */}
                <div style={{ textAlign: 'center', minWidth: '80px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: tiempoTotal > 0 ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                    {fmtMin(tiempoTotal)}
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tiempo acum.</div>
                </div>

                {/* Acciones */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button onClick={() => setHistorialRouter(r)}
                    style={{ padding: '4px 10px', fontSize: '10px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '5px', cursor: 'pointer', fontWeight: 500 }}>
                    Historial
                  </button>
                  {r.estado !== 'DISPONIBLE' && (
                    <>
                      <button onClick={() => setRetornoRouter(r)}
                        style={{ padding: '4px 10px', fontSize: '10px', background: '#DCFCE7', border: '0.5px solid #86EFAC', borderRadius: '5px', cursor: 'pointer', fontWeight: 600, color: '#166534' }}>
                        Retorno
                      </button>
                      <button onClick={() => setTrasladoRouter(r)}
                        style={{ padding: '4px 10px', fontSize: '10px', background: '#E0E7FF', border: '0.5px solid #A5B4FC', borderRadius: '5px', cursor: 'pointer', fontWeight: 600, color: '#3730A3' }}>
                        Traslado
                      </button>
                    </>
                  )}
                  {r.estado === 'DISPONIBLE' && (
                    <button onClick={() => setDeleteConfirm(r)}
                      style={{ padding: '4px 10px', fontSize: '10px', background: '#FEE2E2', border: '0.5px solid #FCA5A5', borderRadius: '5px', cursor: 'pointer', fontWeight: 500, color: '#B91C1C' }}>
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal agregar */}
      {addOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={() => setAddOpen(false)}>
          <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '24px', width: '340px' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>Agregar router externo</div>
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Código *</label>
            <input value={newCodigo} onChange={e => setNewCodigo(e.target.value.toUpperCase())}
              placeholder="RE-003" autoFocus
              style={{ width: '100%', padding: '8px 10px', fontSize: '13px', fontFamily: 'monospace', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)', boxSizing: 'border-box', marginBottom: '6px' }} />
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '16px' }}>
              Los demás campos (IP, chip, plan, etc.) se pueden completar después desde el historial.
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setAddOpen(false)} style={{ padding: '7px 16px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={crearRouter} disabled={saving || !newCodigo.trim()}
                style={{ padding: '7px 16px', fontSize: '12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, opacity: saving || !newCodigo.trim() ? 0.6 : 1 }}>
                {saving ? 'Creando...' : 'Crear router'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminación */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '24px', width: '340px' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Eliminar {deleteConfirm.codigo}</div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '16px' }}>¿Confirmas que deseas eliminar este router? Esta acción no se puede deshacer.</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: '7px 16px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => eliminarRouter(deleteConfirm.id)}
                style={{ padding: '7px 16px', fontSize: '12px', background: '#B91C1C', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600 }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {historialRouter && <HistorialModal router={historialRouter} onClose={() => setHistorialRouter(null)} />}
      {retornoRouter   && <RetornoModal   router={retornoRouter}   onClose={() => setRetornoRouter(null)}   onDone={fetchRouters} />}
      {trasladoRouter  && <TrasladoModal  router={trasladoRouter}  onClose={() => setTrasladoRouter(null)}  onDone={fetchRouters} />}
    </div>
  )
}
