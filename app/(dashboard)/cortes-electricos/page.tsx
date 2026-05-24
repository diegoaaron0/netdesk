'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

const ALCANCE_LABELS: Record<string, string> = {
  SOLO_TIENDA:  'Solo la tienda',
  MALL:         'El mall',
  CUADRA_CALLE: 'Cuadra / calle',
  ZONA_AMPLIA:  'Zona amplia',
}

const ALCANCE_COLORS: Record<string, { bg: string; color: string }> = {
  SOLO_TIENDA:  { bg: '#EFF6FF', color: '#1D4ED8' },
  MALL:         { bg: '#FFF7ED', color: '#C2410C' },
  CUADRA_CALLE: { bg: '#FFFBEB', color: '#B45309' },
  ZONA_AMPLIA:  { bg: '#FEF2F2', color: '#B91C1C' },
}

function limaToday() {
  return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)
}

function durFmt(min: number | null) {
  if (min == null) return '—'
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60}m`
  return `${min}m`
}

function toDatetimeLocal(dt: string | Date | null | undefined): string {
  if (!dt) return ''
  const d = new Date(dt)
  const offset = -5 * 60
  const local = new Date(d.getTime() + (offset - d.getTimezoneOffset()) * 60000)
  return local.toISOString().slice(0, 16)
}

const EMPTY_FORM = {
  tiendaId: '', horaInicio: '', horaFin: '',
  alcance: 'SOLO_TIENDA', tuvoUps: false, afectoRed: false, observaciones: '',
}

export default function CortesElectricosPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const userRol = (session?.user as any)?.rol ?? 'AGENTE'
  const today   = limaToday()

  const [rows, setRows]           = useState<any[]>([])
  const [tiendas, setTiendas]     = useState<any[]>([])
  const [tiendaQ, setTiendaQ]     = useState('')
  const [tiendaOpts, setTiendaOpts] = useState<any[]>([])
  const [showOpts, setShowOpts]   = useState(false)
  const [fechaDesde, setFechaDesde] = useState(today)
  const [fechaHasta, setFechaHasta] = useState(today)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ ...EMPTY_FORM })
  const [saving, setSaving]       = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [editHoraFin, setEditHoraFin] = useState('')

  const fetchRows = useCallback(async () => {
    const params = new URLSearchParams({ fechaDesde, fechaHasta })
    const res = await fetch(`/api/cortes-electricos?${params}`)
    const data = await res.json()
    setRows(Array.isArray(data) ? data : [])
  }, [fechaDesde, fechaHasta])

  useEffect(() => { fetchRows() }, [fetchRows])

  useEffect(() => {
    fetch('/api/tiendas').then(r => r.json()).then((list: any[]) => {
      if (Array.isArray(list)) setTiendas(list)
    })
  }, [])

  useEffect(() => {
    if (tiendaQ.length < 2) { setTiendaOpts([]); return }
    const q = tiendaQ.toLowerCase()
    setTiendaOpts(tiendas.filter(t =>
      t.codigo?.toLowerCase().includes(q) || t.nombreCc?.toLowerCase().includes(q)
    ).slice(0, 8))
  }, [tiendaQ, tiendas])

  function setF(key: string, val: any) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.tiendaId || !form.horaInicio) return
    setSaving(true)
    await fetch('/api/cortes-electricos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        horaInicio: new Date(form.horaInicio + ':00-05:00').toISOString(),
        horaFin:    form.horaFin ? new Date(form.horaFin + ':00-05:00').toISOString() : null,
      }),
    })
    setSaving(false)
    setShowForm(false)
    setForm({ ...EMPTY_FORM })
    setTiendaQ('')
    fetchRows()
  }

  async function handleCerrar(id: string) {
    const fin = editHoraFin
    if (!fin) return
    await fetch(`/api/cortes-electricos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horaFin: new Date(fin + ':00-05:00').toISOString() }),
    })
    setEditId(null)
    setEditHoraFin('')
    fetchRows()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este registro? No se puede deshacer.')) return
    await fetch(`/api/cortes-electricos/${id}`, { method: 'DELETE' })
    fetchRows()
  }

  const totalMes  = rows.length
  const afectaron = rows.filter(r => r.afectoRed).length
  const sinCerrar = rows.filter(r => !r.horaFin).length
  const durProm   = (() => {
    const closed = rows.filter(r => r.duracionMinutos != null)
    if (!closed.length) return null
    return Math.round(closed.reduce((s, r) => s + r.duracionMinutos, 0) / closed.length)
  })()

  const selStyle: React.CSSProperties = {
    padding: '7px 10px', fontSize: '12px', border: '1px solid var(--border)',
    borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>Cortes eléctricos</h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '3px' }}>Registro de cortes de energía por tienda</div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            padding: '10px 22px', background: 'hsl(221,83%,42%)', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px',
            boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(221,83%,38%)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(221,83%,42%)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Registrar corte
        </button>
      </div>

      {/* Métricas inline */}
      <div style={{ background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', overflow: 'hidden' }}>
        {[
          { label: 'Registrados', value: totalMes,             color: '#185FA5', fmt: String(totalMes) },
          { label: 'Afectaron red', value: afectaron,          color: '#854F0B', fmt: String(afectaron) },
          { label: 'Sin cerrar',   value: sinCerrar,           color: sinCerrar > 0 ? '#b91c1c' : '#27500A', fmt: String(sinCerrar) },
          { label: 'Duración prom.', value: durProm ?? 0,      color: '#374151', fmt: durProm != null ? durFmt(durProm) : '—' },
        ].map((m, i) => (
          <div key={m.label} style={{ flex: 1, padding: '14px 20px', borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: m.value > 0 ? m.color : 'var(--muted-foreground)', lineHeight: 1 }}>{m.fmt}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Formulario de registro */}
      {showForm && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 16px', color: 'var(--foreground)' }}>Nuevo corte eléctrico</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Tienda */}
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted-foreground)', marginBottom: '5px' }}>Tienda *</label>
              <input
                value={tiendaQ}
                onChange={e => { setTiendaQ(e.target.value); setF('tiendaId', ''); setShowOpts(true) }}
                onFocus={() => setShowOpts(true)}
                placeholder="Buscar por código o nombre..."
                style={{ ...selStyle, width: '100%', boxSizing: 'border-box' }}
                required={!form.tiendaId}
              />
              {showOpts && tiendaOpts.length > 0 && !form.tiendaId && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '3px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                  {tiendaOpts.map(t => (
                    <button key={t.id} type="button"
                      onClick={() => { setF('tiendaId', t.id); setTiendaQ(`${t.codigo} — ${t.nombreCc}`); setShowOpts(false) }}
                      style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: '12px' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{t.codigo}</span>
                      <span style={{ color: 'var(--muted-foreground)', marginLeft: '8px' }}>{t.nombreCc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Horas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted-foreground)', marginBottom: '5px' }}>Hora inicio *</label>
                <input type="datetime-local" value={form.horaInicio} onChange={e => setF('horaInicio', e.target.value)} required style={{ ...selStyle, width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted-foreground)', marginBottom: '5px' }}>Hora fin <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional si aún está sin luz)</span></label>
                <input type="datetime-local" value={form.horaFin} onChange={e => setF('horaFin', e.target.value)} style={{ ...selStyle, width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Alcance */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted-foreground)', marginBottom: '8px' }}>Alcance del corte</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(['SOLO_TIENDA', 'MALL', 'CUADRA_CALLE', 'ZONA_AMPLIA'] as const).map(v => {
                  const sel = form.alcance === v
                  const { bg, color } = ALCANCE_COLORS[v]
                  return (
                    <button key={v} type="button" onClick={() => setF('alcance', v)}
                      style={{ padding: '5px 14px', fontSize: '12px', borderRadius: '999px', cursor: 'pointer', border: `1px solid ${sel ? color : 'var(--border)'}`, background: sel ? bg : 'var(--card)', color: sel ? color : 'var(--foreground)', fontWeight: sel ? 600 : 400, outline: 'none' }}>
                      {ALCANCE_LABELS[v]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Checks */}
            <div style={{ display: 'flex', gap: '24px' }}>
              {[
                { key: 'tuvoUps', label: '¿La tienda tenía UPS activo?' },
                { key: 'afectoRed', label: '¿Afectó la conectividad de red?' },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
                  <input type="checkbox" checked={(form as any)[key]} onChange={e => setF(key, e.target.checked)}
                    style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
                  {label}
                </label>
              ))}
            </div>

            {/* Observaciones */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted-foreground)', marginBottom: '5px' }}>Observaciones</label>
              <textarea
                value={form.observaciones}
                onChange={e => setF('observaciones', e.target.value)}
                placeholder="Ej: Llamamos a Enel, confirmaron mantenimiento en la Av. Javier Prado. El mall informó que fue por cortocircuito en tablero..."
                rows={3}
                style={{ ...selStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); setTiendaQ('') }}
                style={{ padding: '8px 18px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button type="submit" disabled={saving || !form.tiendaId || !form.horaInicio}
                style={{ padding: '8px 20px', fontSize: '12px', fontWeight: 600, border: 'none', borderRadius: '8px', background: 'hsl(221,83%,42%)', color: 'white', cursor: saving ? 'wait' : 'pointer', opacity: (!form.tiendaId || !form.horaInicio) ? 0.5 : 1 }}>
                {saving ? 'Guardando...' : 'Registrar corte'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={selStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={selStyle} />
        </div>
        <button onClick={() => { setFechaDesde(today); setFechaHasta(today) }}
          style={{ padding: '7px 12px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
          Hoy
        </button>
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--card)', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--muted)', borderBottom: '2px solid hsl(221,83%,45%)' }}>
              {['Fecha / Hora', 'Tienda', 'Alcance', 'Duración', 'Red afectada', 'UPS', 'Observaciones', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '32px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>
                  No hay cortes registrados en este período
                </td>
              </tr>
            )}
            {rows.map((r, idx) => {
              const isOpen = !r.horaFin
              const { bg, color } = ALCANCE_COLORS[r.alcance] ?? { bg: 'var(--muted)', color: 'var(--foreground)' }
              return (
                <tr key={r.id} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none', background: isOpen ? 'rgba(251,191,36,0.06)' : 'transparent' }}>

                  {/* Fecha / Hora */}
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>
                      {new Date(r.horaInicio).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '1px', fontFamily: 'monospace' }}>
                      {new Date(r.horaInicio).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}
                      {r.horaFin && <> → {new Date(r.horaFin).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}</>}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>{r.registradoPorNombre}</div>
                  </td>

                  {/* Tienda */}
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: 'var(--foreground)' }}>{r.tiendaCodigo}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '1px' }}>{r.tiendaNombre}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{r.tiendaDistrito}</div>
                  </td>

                  {/* Alcance */}
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: bg, color }}>
                      {ALCANCE_LABELS[r.alcance]}
                    </span>
                  </td>

                  {/* Duración */}
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--foreground)' }}>
                    {isOpen
                      ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: '#FEF9C3', color: '#92400E', fontWeight: 600, fontFamily: 'inherit' }}>En curso</span>
                      : durFmt(r.duracionMinutos)
                    }
                  </td>

                  {/* Red afectada */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {r.afectoRed
                      ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: '#FEE2E2', color: '#B91C1C', fontWeight: 600 }}>Sí</span>
                      : <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>No</span>
                    }
                  </td>

                  {/* UPS */}
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '11px', color: r.tuvoUps ? '#15803D' : 'var(--muted-foreground)' }}>
                    {r.tuvoUps ? '✓ Sí' : 'No'}
                  </td>

                  {/* Observaciones */}
                  <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--muted-foreground)', maxWidth: '280px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.observaciones ?? ''}>
                      {r.observaciones || <span style={{ fontStyle: 'italic' }}>—</span>}
                    </div>
                  </td>

                  {/* Acciones */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {isOpen && (
                        editId === r.id
                          ? <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <input type="datetime-local" value={editHoraFin} onChange={e => setEditHoraFin(e.target.value)}
                                style={{ fontSize: '11px', padding: '3px 6px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
                              <button onClick={() => handleCerrar(r.id)} disabled={!editHoraFin}
                                style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 600, border: 'none', borderRadius: '6px', background: '#15803D', color: 'white', cursor: 'pointer', opacity: editHoraFin ? 1 : 0.5 }}>✓</button>
                              <button onClick={() => setEditId(null)}
                                style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer' }}>✕</button>
                            </div>
                          : <button onClick={() => { setEditId(r.id); setEditHoraFin(toDatetimeLocal(new Date())) }}
                              style={{ padding: '3px 10px', fontSize: '11px', fontWeight: 600, border: '1px solid #15803D', borderRadius: '6px', background: '#F0FDF4', color: '#15803D', cursor: 'pointer' }}>
                              Cerrar corte
                            </button>
                      )}
                      {userRol === 'SUPERVISOR' && (
                        <button onClick={() => handleDelete(r.id)}
                          style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '6px', background: 'rgba(220,38,38,0.08)', color: '#dc2626', cursor: 'pointer' }}>
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
