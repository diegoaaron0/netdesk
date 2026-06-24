'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiMutate } from '@/lib/api-mutate'
import { iStyle } from '@/components/incidentes/helpers'
import { Badge, estadoToVariant } from '@/components/ui/Badge'

const IcoLink = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
const IcoExt  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>

export function GrupoMasivoPanel({ inc, onRefresh }: { inc: any; onRefresh: () => void }) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [mode, setMode]       = useState<'view' | 'create' | 'add'>('view')
  const [razon, setRazon]     = useState('')
  const [motivo, setMotivo]   = useState('')
  const [tiendaQ, setTiendaQ] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const gm = inc.grupoMasivo

  async function handleCreate() {
    if (!razon.trim()) { setError('Ingresa la razón del incidente masivo'); return }
    setSaving(true); setError('')
    const res = await fetch('/api/grupos-masivos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ razon, motivo, incidenteId: inc.id }),
    })
    setSaving(false)
    if (res.ok) { setMode('view'); setRazon(''); setMotivo(''); onRefresh() }
    else setError('Error al crear el grupo')
  }

  async function handleAddTienda() {
    if (!tiendaQ.trim()) return
    setSaving(true); setError('')
    const res = await fetch(`/api/grupos-masivos/${gm.id}/vincular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incidenteCodigo: tiendaQ.trim() }),
    })
    setSaving(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setTiendaQ(''); onRefresh() }
    else setError(data.error ?? 'No se pudo agregar el incidente')
  }

  async function handleDesvincular(incidenteId: string) {
    const { ok } = await apiMutate(`/api/grupos-masivos/${gm.id}/desvincular`, {
      method: 'POST',
      json: { incidenteId },
      errorPrefix: 'No se pudo desvincular el incidente',
    })
    if (!ok) return
    onRefresh()
  }

  async function handleUpdateGrupo() {
    setSaving(true); setError('')
    const res = await fetch(`/api/grupos-masivos/${gm.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ razon, motivo }),
    })
    setSaving(false)
    if (res.ok) { setMode('view'); onRefresh() }
    else setError('Error al actualizar')
  }

  return (
    <div style={{ background: 'var(--card)', border: `1px solid ${gm ? 'rgba(245,158,11,0.5)' : 'var(--border)'}`, borderRadius: '12px', overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', background: gm ? 'rgba(245,158,11,0.07)' : 'var(--muted)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <IcoLink />
          <span style={{ fontSize: '12px', fontWeight: 600, color: gm ? '#92400e' : 'var(--foreground)' }}>
            {gm ? `Incidente masivo · ${gm.codigo}` : 'Vincular incidente masivo'}
          </span>
          {gm && (
            <span style={{ fontSize: '10px', background: 'rgba(245,158,11,0.2)', color: '#92400e', borderRadius: '10px', padding: '1px 7px', fontWeight: 700 }}>
              {gm.incidentes?.length ?? 0} tiendas
            </span>
          )}
        </div>
        <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '14px 16px' }}>
          {!gm && mode === 'view' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                Vincula este incidente a un grupo masivo para relacionarlo con otras tiendas afectadas por la misma falla.
              </p>
              <button onClick={() => setMode('create')}
                style={{ padding: '8px 14px', background: '#92400e', color: '#fef3c7', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                + Crear nuevo grupo masivo
              </button>
            </div>
          )}

          {!gm && mode === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Razón *</label>
                <input value={razon} onChange={e => setRazon(e.target.value)}
                  placeholder="Ej: Falla fibra Movistar zona norte Lima"
                  style={iStyle()} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Motivo (opcional)</label>
                <input value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder="Ej: Corte de cableado en cámara subterránea"
                  style={iStyle()} />
              </div>
              {error && <div style={{ fontSize: '11px', color: '#dc2626' }}>{error}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleCreate} disabled={saving}
                  style={{ flex: 1, padding: '8px', background: '#92400e', color: '#fef3c7', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
                  {saving ? 'Creando...' : 'Crear grupo'}
                </button>
                <button onClick={() => { setMode('view'); setError('') }}
                  style={{ padding: '8px 14px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {gm && (
            <div>
              {mode === 'view' && (
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', marginBottom: '2px' }}>{gm.razon}</div>
                    {gm.motivo && <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{gm.motivo}</div>}
                  </div>

                  {/* Lista de incidentes vinculados */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                    {(gm.incidentes ?? []).map((linked: any) => (
                      <div key={linked.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 9px', background: 'var(--muted)', borderRadius: '7px', borderLeft: linked.id === inc.id ? '3px solid #f59e0b' : '3px solid var(--border)' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: linked.id === inc.id ? '#92400e' : 'var(--foreground)' }}>{linked.tiendaCodigo}</span>
                        <span style={{ fontSize: '11px', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linked.tiendaNombre}</span>
                        <Badge variant={estadoToVariant(linked.estado)} />
                        {linked.id !== inc.id && (
                          <button type="button" onClick={() => router.push(`/incidentes/${linked.id}`)}
                            style={{ fontSize: '10px', color: 'hsl(221,83%,50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>
                            <IcoExt />
                          </button>
                        )}
                        {linked.id !== inc.id && (
                          <button type="button" onClick={() => handleDesvincular(linked.id)}
                            title="Desvincular"
                            style={{ fontSize: '10px', color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Añadir incidente por código */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <input value={tiendaQ} onChange={e => setTiendaQ(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddTienda()}
                      placeholder="Código de incidente (ej: 00099K)"
                      style={{ ...iStyle(), flex: 1, fontSize: '11px' }} />
                    <button onClick={handleAddTienda} disabled={saving || !tiendaQ.trim()}
                      style={{ padding: '6px 12px', background: 'hsl(221,83%,45%)', color: 'white', border: 'none', borderRadius: '7px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      + Añadir
                    </button>
                  </div>
                  {error && <div style={{ fontSize: '11px', color: '#dc2626', marginBottom: '6px' }}>{error}</div>}

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => { setMode('create'); setRazon(gm.razon ?? ''); setMotivo(gm.motivo ?? '') }}
                      style={{ fontSize: '10px', color: 'var(--muted-foreground)', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                      ✎ Editar
                    </button>
                    <button onClick={() => handleDesvincular(inc.id)}
                      style={{ fontSize: '10px', color: '#b91c1c', background: 'none', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                      Salir del grupo
                    </button>
                  </div>
                </>
              )}

              {mode === 'create' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Razón</label>
                    <input value={razon} onChange={e => setRazon(e.target.value)} style={iStyle()} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Motivo</label>
                    <input value={motivo} onChange={e => setMotivo(e.target.value)} style={iStyle()} />
                  </div>
                  {error && <div style={{ fontSize: '11px', color: '#dc2626' }}>{error}</div>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleUpdateGrupo} disabled={saving}
                      style={{ flex: 1, padding: '8px', background: '#92400e', color: '#fef3c7', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
                      {saving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                    <button onClick={() => { setMode('view'); setError('') }}
                      style={{ padding: '8px 14px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
