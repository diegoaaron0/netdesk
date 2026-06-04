'use client'
import { useEffect, useState, useCallback, useRef } from 'react'

const ALMACENES = ['Almacén Vulcano', 'Almacén Jiron']

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
  DISPONIBLE:         { label: 'Disponible',  bg: '#DCFCE7', color: '#166534' },
  EN_TIENDA_ACTIVO:   { label: 'Activo',      bg: '#FEF3C7', color: '#92400E' },
  EN_TIENDA_INACTIVO: { label: 'En tienda',   bg: '#E0E7FF', color: '#3730A3' },
}

// ── Combobox con búsqueda para tiendas ────────────────────────────────────────
function TiendaCombobox({ tiendas, value, onChange, placeholder }: { tiendas: any[]; value: string; onChange: (id: string) => void; placeholder?: string }) {
  const [query, setQuery]     = useState('')
  const [open, setOpen]       = useState(false)
  const ref                   = useRef<HTMLDivElement>(null)

  const selected = tiendas.find(t => t.id === value)
  const filtered = tiendas.filter(t =>
    !query || `${t.codigo} ${t.nombre_cc}`.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', marginBottom: '12px' }}>
      <input
        value={open ? query : (selected ? `${selected.codigo} — ${selected.nombre_cc}` : '')}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('') }}
        onFocus={() => { setOpen(true); setQuery('') }}
        placeholder={placeholder ?? '— Buscar tienda —'}
        style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: `0.5px solid ${value ? 'hsl(221,83%,23%)' : 'var(--border)'}`, borderRadius: '7px', background: 'var(--background)', boxSizing: 'border-box', fontFamily: value && !open ? 'monospace' : 'inherit', fontWeight: value && !open ? 600 : 400 }}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '7px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto', marginTop: '2px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--muted-foreground)' }}>Sin resultados</div>
          ) : filtered.map(t => (
            <div key={t.id}
              onMouseDown={() => { onChange(t.id); setOpen(false); setQuery('') }}
              style={{ padding: '7px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'monospace', fontWeight: t.id === value ? 700 : 400, background: t.id === value ? 'var(--muted)' : 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = t.id === value ? 'var(--muted)' : 'transparent')}>
              <span style={{ fontWeight: 700 }}>{t.codigo}</span>
              <span style={{ fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: '6px', fontSize: '11px' }}>{t.nombre_cc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const ACCION_BADGE: Record<string, { bg: string; color: string }> = {
  'DESPLIEGUE': { bg: '#E0E7FF', color: '#3730A3' },
  'ACTIVACIÓN': { bg: '#FEF3C7', color: '#92400E' },
  'TRASLADO':   { bg: '#F3E8FF', color: '#6B21A8' },
  'RETORNO':    { bg: '#DCFCE7', color: '#166534' },
}

// ── Modal: historial + edición de un router ───────────────────────────────────
function HistorialModal({ router, onClose, onSaved }: { router: any; onClose: () => void; onSaved: () => void }) {
  const [detail, setDetail]     = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState(false)
  const [form, setForm]         = useState<any>({})
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [nuevaFoto, setNuevaFoto] = useState('')

  const fetchDetail = useCallback(() => {
    fetch(`/api/routers-externos/${router.id}`)
      .then(r => r.json())
      .then(d => {
        setDetail(d)
        setForm({ ip: d.ip ?? '', password: d.password ?? '', chip: d.chip ?? '', plan: d.plan ?? '', tipoConexion: d.tipo_conexion ?? '' })
      })
      .finally(() => setLoading(false))
  }, [router.id])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  async function guardar() {
    setSaving(true)
    const res = await fetch(`/api/routers-externos/${router.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) { setSaved(true); setEditing(false); onSaved(); setTimeout(() => setSaved(false), 2000) }
    setSaving(false)
  }

  async function agregarFoto() {
    if (!nuevaFoto.trim()) return
    const fotos = [...(detail.fotos ?? []), nuevaFoto.trim()]
    const res = await fetch(`/api/routers-externos/${router.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fotos }),
    })
    if (res.ok) { setNuevaFoto(''); fetchDetail() }
  }

  async function eliminarFoto(url: string) {
    const fotos = (detail.fotos ?? []).filter((f: string) => f !== url)
    await fetch(`/api/routers-externos/${router.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fotos }),
    })
    fetchDetail()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '6px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--background)', fontFamily: 'monospace', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '24px', width: '680px', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{router.codigo}</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {saved && <span style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>✓ Guardado</span>}
            {!editing
              ? <button onClick={() => setEditing(true)} style={{ padding: '4px 12px', fontSize: '11px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>Editar</button>
              : <>
                  <button onClick={() => setEditing(false)} style={{ padding: '4px 12px', fontSize: '11px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={guardar} disabled={saving} style={{ padding: '4px 12px', fontSize: '11px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>{saving ? 'Guardando…' : 'Guardar'}</button>
                </>
            }
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--muted-foreground)' }}>✕</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Cargando...</div>
        ) : (
          <>
            {/* Campos del router */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px', padding: '12px', background: 'var(--muted)', borderRadius: '8px' }}>
              {([['IP', 'ip'], ['Chip/SIM', 'chip'], ['Plan', 'plan'], ['Tipo conexión', 'tipoConexion'], ['Contraseña', 'password']] as [string, string][]).map(([label, key]) => (
                <div key={key}>
                  <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: editing ? '4px' : '2px' }}>{label}</div>
                  {editing
                    ? <input value={form[key] ?? ''} onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))} style={inp} placeholder={`Ej: ${key === 'ip' ? '192.168.1.1' : '…'}`} />
                    : <div style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'monospace' }}>{(detail[key === 'tipoConexion' ? 'tipo_conexion' : key]) || '—'}</div>
                  }
                </div>
              ))}
            </div>

            {/* Fotos */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fotos del equipo</div>
                <label style={{ padding: '3px 10px', fontSize: '10px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '5px', cursor: 'pointer', fontWeight: 500 }}>
                  + Agregar foto
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => { setNuevaFoto(ev.target?.result as string) }
                    reader.readAsDataURL(file)
                    e.target.value = ''
                  }} />
                </label>
              </div>

              {nuevaFoto && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'flex-end' }}>
                  <img src={nuevaFoto} alt="preview" style={{ width: '60px', height: '46px', objectFit: 'cover', borderRadius: '5px', border: '0.5px solid var(--border)' }} />
                  <button onClick={agregarFoto} style={{ padding: '6px 12px', fontSize: '11px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Guardar</button>
                  <button onClick={() => setNuevaFoto('')} style={{ padding: '6px 10px', fontSize: '11px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}>✕</button>
                </div>
              )}

              {detail.fotos?.length > 0 ? (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {detail.fotos.map((url: string, i: number) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`Foto ${i + 1}`} style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '6px', border: '0.5px solid var(--border)', display: 'block' }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </a>
                      <button
                        onClick={() => eliminarFoto(url)}
                        style={{ position: 'absolute', top: '-4px', right: '-4px', width: '16px', height: '16px', borderRadius: '50%', background: '#B91C1C', color: 'white', border: 'none', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Sin fotos registradas</div>
              )}
            </div>

            {/* Historial tabla */}
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Historial</div>
            {!detail.historial?.length ? (
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Sin historial registrado</div>
            ) : (
              <div style={{ maxHeight: '220px', overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: '7px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
                    <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                      {['Evento', 'Tienda', 'Ingreso', 'Activación', 'Desactivación', 'Duración'].map(h => (
                        <th key={h} style={{ padding: '5px 6px', textAlign: 'left', fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.historial.map((h: any, i: number) => {
                      const badgeStyle = ACCION_BADGE[h.accion] ?? { bg: '#F3F4F6', color: '#374151' }
                      return (
                        <tr key={i} style={{ borderTop: i > 0 ? '0.5px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '5px 6px' }}>
                            <span style={{ padding: '1px 6px', borderRadius: '999px', fontSize: '9px', fontWeight: 600, background: badgeStyle.bg, color: badgeStyle.color }}>
                              {h.accion}
                            </span>
                          </td>
                          <td style={{ padding: '5px 6px', fontWeight: 600 }}>{h.tienda_codigo ?? '—'}</td>
                          <td style={{ padding: '5px 6px', fontSize: '10px' }}>{fmtFecha(h.fecha_ingreso)}</td>
                          <td style={{ padding: '5px 6px', fontSize: '10px' }}>{h.accion === 'ACTIVACIÓN' ? fmtFecha(h.fecha_ingreso) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}</td>
                          <td style={{ padding: '5px 6px', fontSize: '10px' }}>{h.accion === 'ACTIVACIÓN' ? fmtFecha(h.fecha_retorno) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}</td>
                          <td style={{ padding: '5px 6px', fontFamily: 'monospace' }}>{h.tiempo_uso_min ? fmtMin(h.tiempo_uso_min) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Modal: despliegue (DISPONIBLE → tienda) ───────────────────────────────────
function DespliegueModal({ router, onClose, onDone }: { router: any; onClose: () => void; onDone: () => void }) {
  const [tiendas, setTiendas]       = useState<any[]>([])
  const [tiendaId, setTiendaId]     = useState('')
  const [nota, setNota]             = useState('')
  const [saving, setSaving]         = useState(false)
  const [ok, setOk]                 = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    fetch('/api/tiendas')
      .then(r => r.json())
      .then(data => setTiendas(Array.isArray(data) ? data : []))
      .catch(() => setTiendas([]))
  }, [])

  async function confirmar() {
    if (!tiendaId) return
    setSaving(true); setError('')
    const res = await fetch(`/api/routers-externos/${router.id}/despliegue`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiendaId, nota }),
    })
    if (res.ok) { setOk(true); setTimeout(() => { onClose(); onDone() }, 1200) }
    else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Error al desplegar')
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '24px', width: '400px' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Desplegar {router.codigo} a tienda</div>
        {ok ? (
          <div style={{ textAlign: 'center', color: '#3730A3', fontWeight: 600, padding: '16px 0' }}>✓ Router desplegado en tienda</div>
        ) : (
          <>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '12px' }}>
              El router quedará en la tienda como inactivo. Para activarlo deberás crear un incidente y seleccionarlo ahí.
            </div>
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Tienda destino</label>
            <TiendaCombobox tiendas={tiendas} value={tiendaId} onChange={setTiendaId} placeholder="— Buscar tienda —" />
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Nota (opcional)</label>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Motivo del despliegue"
              style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)', boxSizing: 'border-box', marginBottom: '16px' }} />
            {error && <div style={{ fontSize: '11px', color: '#b91c1c', background: '#fee2e2', borderRadius: '6px', padding: '6px 10px', marginBottom: '12px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '7px 16px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmar} disabled={saving || !tiendaId}
                style={{ padding: '7px 16px', fontSize: '12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, opacity: saving || !tiendaId ? 0.6 : 1 }}>
                {saving ? 'Desplegando...' : 'Confirmar despliegue'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Modal: retorno ─────────────────────────────────────────────────────────────
function RetornoModal({ router, onClose, onDone }: { router: any; onClose: () => void; onDone: () => void }) {
  const [almacen, setAlmacen]   = useState('')
  const [nota, setNota]         = useState('')
  const [saving, setSaving]     = useState(false)
  const [ok, setOk]             = useState(false)

  async function confirmar() {
    if (!almacen) return
    setSaving(true)
    const res = await fetch(`/api/routers-externos/${router.id}/retorno`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ almacenDestino: almacen, nota }),
    })
    if (res.ok) { setOk(true); setTimeout(() => { onClose(); onDone() }, 1200) }
    else setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '24px', width: '380px' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Marcar retorno — {router.codigo}</div>
        {ok ? (
          <div style={{ textAlign: 'center', color: '#166534', fontWeight: 600, padding: '16px 0' }}>✓ Router marcado como disponible en {almacen}</div>
        ) : (
          <>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '12px' }}>
              Selecciona el almacén al que regresa el equipo.
            </div>
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>Almacén destino</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
              {ALMACENES.map(a => (
                <button key={a} onClick={() => setAlmacen(a)}
                  style={{ padding: '9px 14px', fontSize: '12px', textAlign: 'left', border: almacen === a ? '2px solid hsl(221,83%,23%)' : '0.5px solid var(--border)', borderRadius: '8px', background: almacen === a ? 'hsl(221,83%,95%)' : 'var(--muted)', cursor: 'pointer', fontWeight: almacen === a ? 700 : 400, color: almacen === a ? 'hsl(221,83%,23%)' : 'var(--foreground)' }}>
                  {a}
                </button>
              ))}
            </div>
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Nota (opcional)</label>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: Proveedor restableció fibra, se retiró equipo"
              style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)', boxSizing: 'border-box', marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '7px 16px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmar} disabled={saving || !almacen}
                style={{ padding: '7px 16px', fontSize: '12px', background: '#166534', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, opacity: saving || !almacen ? 0.6 : 1 }}>
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
  const [tiendas, setTiendas]         = useState<any[]>([])
  const [tiendaId, setTiendaId]       = useState('')
  const [justificacion, setJustificacion] = useState('')
  const [saving, setSaving]           = useState(false)
  const [ok, setOk]                   = useState(false)
  const [error, setError]             = useState('')

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
            <TiendaCombobox tiendas={tiendas} value={tiendaId} onChange={setTiendaId} placeholder="— Buscar tienda —" />
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
  const [routers, setRouters]             = useState<any[]>([])
  const [loading, setLoading]             = useState(true)
  const [historialRouter, setHistorialRouter]   = useState<any | null>(null)
  const [retornoRouter, setRetornoRouter]       = useState<any | null>(null)
  const [trasladoRouter, setTrasladoRouter]     = useState<any | null>(null)
  const [despliegueRouter, setDespliegueRouter] = useState<any | null>(null)
  const [addOpen, setAddOpen]             = useState(false)
  const [newCodigo, setNewCodigo]         = useState('')
  const [saving, setSaving]               = useState(false)
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

  const disponibles = routers.filter(r => r.estado === 'DISPONIBLE')
  const enUso       = routers.filter(r => r.estado !== 'DISPONIBLE')

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
            const badge      = ESTADO_BADGE[r.estado] ?? ESTADO_BADGE.DISPONIBLE
            const tiempoTotal = Number(r.tiempo_total_min ?? 0)
            const fotoUrl    = r.fotos?.[0] ?? null
            return (
              <div key={r.id} style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Foto miniatura */}
                {fotoUrl ? (
                  <img src={fotoUrl} alt={r.codigo} style={{ width: '44px', height: '34px', objectFit: 'cover', borderRadius: '5px', border: '0.5px solid var(--border)', flexShrink: 0 }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                ) : (
                  <div style={{ width: '44px', height: '34px', borderRadius: '5px', border: '0.5px solid var(--border)', background: 'var(--muted)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: 'var(--muted-foreground)' }}>
                    📷
                  </div>
                )}

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
                    <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                      {r.almacen_actual ?? 'En área TI'}
                    </div>
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
                  {r.estado === 'DISPONIBLE' && (
                    <>
                      <button onClick={() => setDespliegueRouter(r)}
                        style={{ padding: '4px 10px', fontSize: '10px', background: '#E0E7FF', border: '0.5px solid #A5B4FC', borderRadius: '5px', cursor: 'pointer', fontWeight: 600, color: '#3730A3' }}>
                        Desplegar
                      </button>
                      <button onClick={() => setDeleteConfirm(r)}
                        style={{ padding: '4px 10px', fontSize: '10px', background: '#FEE2E2', border: '0.5px solid #FCA5A5', borderRadius: '5px', cursor: 'pointer', fontWeight: 500, color: '#B91C1C' }}>
                        Eliminar
                      </button>
                    </>
                  )}
                  {r.estado === 'EN_TIENDA_INACTIVO' && (
                    <>
                      <button onClick={() => setRetornoRouter(r)}
                        style={{ padding: '4px 10px', fontSize: '10px', background: '#DCFCE7', border: '0.5px solid #86EFAC', borderRadius: '5px', cursor: 'pointer', fontWeight: 600, color: '#166534' }}>
                        Retorno
                      </button>
                      <button onClick={() => setTrasladoRouter(r)}
                        style={{ padding: '4px 10px', fontSize: '10px', background: '#F3E8FF', border: '0.5px solid #D8B4FE', borderRadius: '5px', cursor: 'pointer', fontWeight: 600, color: '#6B21A8' }}>
                        Traslado
                      </button>
                    </>
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
              Los demás campos (IP, chip, plan, fotos, etc.) se pueden completar después desde el historial.
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

      {historialRouter  && <HistorialModal  router={historialRouter}  onClose={() => setHistorialRouter(null)}  onSaved={fetchRouters} />}
      {retornoRouter    && <RetornoModal    router={retornoRouter}    onClose={() => setRetornoRouter(null)}    onDone={fetchRouters} />}
      {trasladoRouter   && <TrasladoModal   router={trasladoRouter}   onClose={() => setTrasladoRouter(null)}   onDone={fetchRouters} />}
      {despliegueRouter && <DespliegueModal router={despliegueRouter} onClose={() => setDespliegueRouter(null)} onDone={fetchRouters} />}
    </div>
  )
}
