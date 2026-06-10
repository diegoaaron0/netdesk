'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function NuevaFichaPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [tiendas,    setTiendas]    = useState<any[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [saving, setSaving]  = useState(false)
  const [error,  setError]   = useState('')
  const [buscarTienda, setBuscarTienda] = useState('')

  const [form, setForm] = useState({
    tiendaId:            searchParams.get('tiendaId')    ?? '',
    proveedorId:         searchParams.get('proveedorId') ?? '',
    codigoContrato:      '',
    plan:                '',
    tipoServicio:        '',
    velocidadCapacidad:  '',
    costoMensual:        '',
    fechaInicio:         '',
    fechaFin:            '',
    renovacionAutomatica: false,
    slaComprometido:     '',
    tiempoRespuestaSla:  '',
    tiempoResolucionSla: '',
    horarioAtencionSla:  '',
    tipoConexion:        '',
    cidServicio:         '',
    velocidad:           '',
    planAplicado:        '',
    estadoServicio:      'ACTIVO',
    observacion:         '',
  })

  useEffect(() => {
    fetch('/api/tiendas').then(r => r.json()).then(d => setTiendas(Array.isArray(d) ? d : []))
    fetch('/api/proveedores').then(r => r.json()).then(d => setProveedores(Array.isArray(d) ? d : []))
  }, [])

  // Auto-fill proveedor cuando se selecciona tienda
  useEffect(() => {
    if (!form.tiendaId) return
    const t = tiendas.find((t: any) => t.id === form.tiendaId)
    if (t?.proveedorId) setForm(p => ({ ...p, proveedorId: t.proveedorId }))
  }, [form.tiendaId, tiendas])

  function set(k: string, v: any) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.tiendaId || !form.proveedorId) { setError('Selecciona tienda y proveedor.'); return }
    setSaving(true); setError('')
    const body: any = { ...form }
    if (body.costoMensual)        body.costoMensual        = Number(body.costoMensual)
    if (body.tiempoRespuestaSla)  body.tiempoRespuestaSla  = Number(body.tiempoRespuestaSla)
    if (body.tiempoResolucionSla) body.tiempoResolucionSla = Number(body.tiempoResolucionSla)
    const res = await fetch('/api/fichas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) {
      const data = await res.json()
      router.push(`/gestion-cambios/fichas/${data.id}`)
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Error al crear la ficha.')
      setSaving(false)
    }
  }

  const tiendaFiltradas = tiendas.filter((t: any) =>
    !buscarTienda ||
    t.codigo.toLowerCase().includes(buscarTienda.toLowerCase()) ||
    (t.nombreCc ?? '').toLowerCase().includes(buscarTienda.toLowerCase())
  )

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--background)', boxSizing: 'border-box' }

  return (
    <div style={{ padding: '20px 24px', maxWidth: '720px', margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={{ cursor: 'pointer', color: 'hsl(221,83%,23%)' }} onClick={() => router.push('/gestion-cambios/fichas')}>Fichas</span>
        <span>/</span>
        <span>Nueva</span>
      </div>

      <h1 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 20px', color: 'var(--foreground)' }}>Nueva ficha de servicio</h1>

      <form onSubmit={handleSubmit}>
        {/* ── Tienda y Proveedor ── */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Tienda y Proveedor</div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>Buscar tienda</label>
            <input type="text" placeholder="Código o nombre CC..." value={buscarTienda} onChange={e => setBuscarTienda(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Tienda *</label>
              <select required value={form.tiendaId} onChange={e => set('tiendaId', e.target.value)} style={inputStyle}>
                <option value="">Seleccionar...</option>
                {tiendaFiltradas.slice(0, 50).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.codigo} — {t.nombreCc}</option>
                ))}
              </select>
              {tiendaFiltradas.length > 50 && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '3px' }}>Mostrando 50 de {tiendaFiltradas.length}. Usa el buscador.</div>}
            </div>
            <div>
              <label style={labelStyle}>Proveedor *</label>
              <select required value={form.proveedorId} onChange={e => set('proveedorId', e.target.value)} style={inputStyle}>
                <option value="">Seleccionar...</option>
                {proveedores.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Datos del contrato ── */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Datos del contrato</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {([
              { k: 'codigoContrato', l: 'Código de contrato' },
              { k: 'plan', l: 'Plan' },
              { k: 'tipoServicio', l: 'Tipo de servicio' },
              { k: 'velocidadCapacidad', l: 'Velocidad / Capacidad' },
              { k: 'costoMensual', l: 'Costo mensual (S/)', type: 'number' },
              { k: 'slaComprometido', l: 'SLA comprometido' },
              { k: 'tiempoRespuestaSla', l: 'T. respuesta SLA (min)', type: 'number' },
              { k: 'tiempoResolucionSla', l: 'T. resolución SLA (min)', type: 'number' },
              { k: 'fechaInicio', l: 'Fecha inicio', type: 'date' },
              { k: 'fechaFin', l: 'Fecha fin', type: 'date' },
              { k: 'horarioAtencionSla', l: 'Horario atención SLA' },
            ] as const).map(f => (
              <div key={f.k}>
                <label style={labelStyle}>{f.l}</label>
                <input type={(f as any).type ?? 'text'} value={(form as any)[f.k] ?? ''} onChange={e => set(f.k, e.target.value)} style={inputStyle} />
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '20px' }}>
              <input type="checkbox" id="renAuto" checked={form.renovacionAutomatica} onChange={e => set('renovacionAutomatica', e.target.checked)} />
              <label htmlFor="renAuto" style={{ fontSize: '12px', cursor: 'pointer' }}>Renovación automática</label>
            </div>
          </div>
        </div>

        {/* ── Datos de conectividad ── */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Conectividad</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {([
              { k: 'tipoConexion', l: 'Tipo de conexión' },
              { k: 'cidServicio', l: 'CID / Nro. de servicio' },
              { k: 'velocidad', l: 'Velocidad' },
              { k: 'planAplicado', l: 'Plan aplicado' },
              { k: 'estadoServicio', l: 'Estado del servicio' },
            ] as const).map(f => (
              <div key={f.k}>
                <label style={labelStyle}>{f.l}</label>
                <input type="text" value={(form as any)[f.k] ?? ''} onChange={e => set(f.k, e.target.value)} style={inputStyle} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: '10px' }}>
            <label style={labelStyle}>Observación</label>
            <textarea rows={3} value={form.observacion} onChange={e => set('observacion', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#991B1B', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => router.push('/gestion-cambios/fichas')}
            style={{ padding: '8px 18px', fontSize: '12px', fontWeight: 600, background: 'var(--muted)', color: 'var(--muted-foreground)', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            style={{ padding: '8px 18px', fontSize: '12px', fontWeight: 600, background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            {saving ? 'Creando...' : 'Crear ficha (Borrador)'}
          </button>
        </div>
      </form>
    </div>
  )
}
