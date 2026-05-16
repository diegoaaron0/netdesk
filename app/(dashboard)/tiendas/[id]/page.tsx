'use client'
import { useEffect, useState, use, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const PROVEEDOR_COLORS: Record<string, { bg: string; color: string }> = {
  BITEL:              { bg: '#dbeafe', color: '#1e40af' },
  CLARO:              { bg: '#fee2e2', color: '#b91c1c' },
  CONVERGIA:          { bg: '#ede9fe', color: '#7c3aed' },
  ENTEL:              { bg: '#dcfce7', color: '#15803d' },
  MOVISTAR:           { bg: '#1e3a8a', color: '#bfdbfe' },
  GTD:                { bg: '#ffedd5', color: '#c2410c' },
  FIBERLUX:           { bg: '#fef9c3', color: '#854d0e' },
  'FIBRA AMAZÓNICA':  { bg: '#d1fae5', color: '#065f46' },
  DITSAC:             { bg: '#fce7f3', color: '#9d174d' },
  TELCONET:           { bg: '#e0f2fe', color: '#075985' },
  GONET:              { bg: '#f0fdf4', color: '#166534' },
}
function provColor(n: string | null) {
  if (!n) return { bg: '#f3f4f6', color: '#6b7280' }
  return PROVEEDOR_COLORS[n.toUpperCase()] ?? { bg: '#f3f4f6', color: '#6b7280' }
}

const CAMPO_LABELS: Record<string, string> = {
  nombreCc: 'Nombre CC', direccion: 'Dirección', distrito: 'Distrito',
  provincia: 'Provincia', cluster: 'Cluster', supervisorNombre: 'Supervisor',
  supervisorCelular: 'Celular supervisor', perfilSupervisor: 'Clasificación',
  tipoConexion: 'Tipo conexión', tipoServicio: 'Tipo servicio',
  cidServicio: 'CID', tieneContingencia: 'Tiene contingencia', contingenciaActiva: 'Contingencia activa',
  contingenciaDescripcion: 'Desc. contingencia', contingenciaChip: 'Chip contingencia',
  contingenciaPaquete: 'Paquete contingencia', costoMensual: 'Costo mensual',
  instruccionReporte: 'I.E.', contactoSoporte: 'Contacto soporte',
  administradorNombre: 'Admin nombre', administradorEmail: 'Email',
  administradorCelular: 'Admin celular', proveedorId: 'Proveedor',
  ventaHoraSoles: 'Venta/hora S/.', formato: 'Formato', extras: 'Extras',
}

const CLASIFICACION_COLORS: Record<string, string> = {
  verde: '#22c55e',
  amarillo: '#eab308',
  rojo: '#ef4444',
}

function relTime(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', paddingBottom: '6px', borderBottom: '0.5px solid var(--border)' }}>
      {children}
    </div>
  )
}

function Field({ label, value, editing, onChange, type = 'text' }: {
  label: string; value: string; editing: boolean; onChange: (v: string) => void; type?: string
}) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{label}</div>
      {editing ? (
        type === 'textarea'
          ? <textarea value={value ?? ''} onChange={e => onChange(e.target.value)}
              style={{ width: '100%', padding: '6px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box', minHeight: '64px', resize: 'vertical' }} />
          : <input value={value ?? ''} onChange={e => onChange(e.target.value)}
              style={{ width: '100%', padding: '6px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }} />
      ) : (
        <div style={{ fontSize: '12px', color: value ? 'var(--foreground)' : 'var(--muted-foreground)', minHeight: '20px' }}>
          {value || '—'}
        </div>
      )}
    </div>
  )
}

function contingenciaStatus(tienda: any): { label: string; color: string; bg: string } {
  if (tienda.contingenciaActiva) return { label: 'ACTIVADA', color: '#92400e', bg: '#fef3c7' }
  if (tienda.datosMovilesActivos) return { label: 'DATOS', color: '#1e40af', bg: '#dbeafe' }
  if (tienda.tieneContingencia) return { label: 'Sí', color: '#065f46', bg: '#d1fae5' }
  return { label: 'No', color: '#6b7280', bg: '#f3f4f6' }
}

export default function TiendaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: session } = useSession()

  const userRol = (session?.user as any)?.rol ?? 'AGENTE'
  const canEdit = ['SUPERVISOR', 'INFRAESTRUCTURA'].includes(userRol)

  const [tienda, setTienda] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [contingenciaMsg, setContingenciaMsg] = useState(false)

  const loadData = useCallback(() => {
    if (!id) return
    fetch(`/api/tiendas/${id}`).then(r => r.json()).then(d => {
      if (d.id) { setTienda(d); setForm(d) }
    })
    fetch(`/api/tiendas/historial?tiendaId=${id}`).then(r => r.json()).then(d => {
      setHistorial(Array.isArray(d) ? d : [])
    })
    fetch('/api/proveedores').then(r => r.json()).then(d => {
      setProveedores(Array.isArray(d) ? d : [])
    })
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  function setF(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    const body = {
      ...form,
      cluster: form.cluster || null,
      proveedorId: form.proveedorId || null,
      costoMensual: form.costoMensual || null,
      ventaHoraSoles: form.ventaHoraSoles || null,
      tieneContingencia: !!form.tieneContingencia,
      contingenciaActiva: !!form.contingenciaActiva,
    }
    const res = await fetch(`/api/tiendas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const updated = await res.json()
    if (updated.id) {
      setTienda((prev: any) => ({ ...prev, ...updated }))
      setForm((prev: any) => ({ ...prev, ...updated }))
      fetch(`/api/tiendas/historial?tiendaId=${id}`).then(r => r.json()).then(d => {
        setHistorial(Array.isArray(d) ? d : [])
      })
    }
    setSaving(false)
    setEditing(false)
  }

  function showContingenciaWarning() {
    setContingenciaMsg(true)
    setTimeout(() => setContingenciaMsg(false), 4000)
  }

  if (!tienda) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px', color: 'var(--muted-foreground)', fontSize: '13px' }}>
        Cargando...
      </div>
    )
  }

  const prov = provColor(tienda.proveedorNombre)
  const contStatus = contingenciaStatus(tienda)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
        <button onClick={() => router.push('/tiendas')}
          style={{ padding: '6px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer', marginTop: '2px', whiteSpace: 'nowrap' }}>
          ← Volver
        </button>

        <div style={{ flex: 1 }}>
          {/* Línea 1: código - distrito */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>{tienda.codigo}</span>
            {tienda.distrito && (
              <>
                <span style={{ fontSize: '16px', color: 'var(--muted-foreground)' }}>—</span>
                <span style={{ fontSize: '15px', fontWeight: 500 }}>{tienda.distrito}</span>
              </>
            )}
            {tienda.contingenciaActiva && (
              <span style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>
                ⚠ Contingencia activa
              </span>
            )}
          </div>

          {/* Línea 2: proveedor · teléfono */}
          {(tienda.proveedorNombre || tienda.proveedorTelefono) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
              {tienda.proveedorNombre && (
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 7px', borderRadius: '4px', background: prov.bg, color: prov.color }}>
                  {tienda.proveedorNombre}
                </span>
              )}
              {tienda.proveedorTelefono && (
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>· {tienda.proveedorTelefono}</span>
              )}
            </div>
          )}

          {/* Línea 3: cluster · CID */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '3px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
            {tienda.cluster && <span>Cluster: <strong style={{ color: 'var(--foreground)' }}>{tienda.cluster}</strong></span>}
            {tienda.cidServicio && <span>CID: <strong style={{ color: 'var(--foreground)', fontFamily: 'monospace' }}>{tienda.cidServicio}</strong></span>}
          </div>
        </div>

        {canEdit && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); setForm(tienda) }}
                  style={{ padding: '7px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--muted)', color: 'var(--foreground)', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '7px 14px', fontSize: '12px', border: 'none', borderRadius: '8px', background: 'hsl(221,83%,23%)', color: 'white', fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)}
                style={{ padding: '7px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Editar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mini cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '16px' }}>
        {[
          { label: 'CID / Servicio', value: tienda.cidServicio || '—', mono: true },
          { label: 'Costo mensual', value: tienda.costoMensual ? `S/ ${Number(tienda.costoMensual).toLocaleString('es-PE')}` : '—', mono: false },
          { label: 'Venta / hora', value: tienda.ventaHoraSoles ? `S/ ${Number(tienda.ventaHoraSoles).toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : '—', mono: false },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '9px', padding: '10px 12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', fontFamily: c.mono ? 'monospace' : 'inherit' }}>{c.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{c.label}</div>
          </div>
        ))}
        {/* Contingencia mini card */}
        <div style={{ background: contStatus.bg, border: `0.5px solid ${contStatus.color}22`, borderRadius: '9px', padding: '10px 12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: contStatus.color }}>{contStatus.label}</div>
          <div style={{ fontSize: '10px', color: contStatus.color, opacity: 0.7, marginTop: '2px' }}>Contingencia</div>
        </div>
      </div>

      {/* Main layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '14px', alignItems: 'start' }}>
        {/* Left: sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Información general */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <SectionTitle>Información general</SectionTitle>
            <Field label="Dirección" value={form.direccion ?? ''} editing={editing} onChange={v => setF('direccion', v)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field label="Provincia" value={form.provincia ?? ''} editing={editing} onChange={v => setF('provincia', v)} />
              <Field label="Distrito"  value={form.distrito  ?? ''} editing={editing} onChange={v => setF('distrito', v)} />
            </div>
            <Field label="Referencia"   value={form.referencia   ?? ''} editing={editing} onChange={v => setF('referencia', v)} />
            <Field label="Coordenadas"  value={form.coordenadas  ?? ''} editing={editing} onChange={v => setF('coordenadas', v)} />
            <Field label="Email"        value={form.administradorEmail ?? ''} editing={editing} onChange={v => setF('administradorEmail', v)} />
            {editing ? (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Cluster</div>
                <select value={form.cluster ?? ''} onChange={e => setF('cluster', e.target.value)}
                  style={{ width: '100%', padding: '6px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">Sin cluster</option>
                  {['A','B','C','D'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Cluster</div>
                <div style={{ fontSize: '12px', color: tienda.cluster ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{tienda.cluster ? `Cluster ${tienda.cluster}` : '—'}</div>
              </div>
            )}
          </div>

          {/* Conectividad */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <SectionTitle>Conectividad</SectionTitle>
            {editing ? (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Proveedor</div>
                <select value={form.proveedorId ?? ''} onChange={e => setF('proveedorId', e.target.value)}
                  style={{ width: '100%', padding: '6px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Proveedor</div>
                {tienda.proveedorNombre ? (
                  <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: prov.bg, color: prov.color }}>{tienda.proveedorNombre}</span>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>—</div>
                )}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field label="Tipo conexión" value={form.tipoConexion ?? ''} editing={editing} onChange={v => setF('tipoConexion', v)} />
              <Field label="CID / Servicio" value={form.cidServicio ?? ''} editing={editing} onChange={v => setF('cidServicio', v)} />
              <Field label="Costo mensual (S/.)" value={form.costoMensual ?? ''} editing={editing} onChange={v => setF('costoMensual', v)} />
            </div>

            {/* Contingencia sub-section */}
            <div style={{ marginTop: '6px', paddingTop: '10px', borderTop: '0.5px solid var(--border)' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Contingencia</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                {/* Tiene contingencia */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Tiene</div>
                  {editing ? (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[{ v: true, l: 'Sí' }, { v: false, l: 'No' }].map(({ v, l }) => (
                        <button key={l} type="button" onClick={() => setF('tieneContingencia', v)}
                          style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', border: form.tieneContingencia === v ? '1.5px solid hsl(221,83%,23%)' : '0.5px solid var(--border)', background: form.tieneContingencia === v ? 'hsl(221,83%,23%)' : 'var(--muted)', color: form.tieneContingencia === v ? 'white' : 'var(--foreground)', outline: 'none' }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', fontWeight: 600, color: tienda.tieneContingencia ? '#059669' : 'var(--muted-foreground)' }}>
                      {tienda.tieneContingencia ? 'Sí' : 'No'}
                    </div>
                  )}
                </div>

                {/* Activado/desactivado */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Estado</div>
                  <div style={{ fontSize: '12px' }}>
                    {tienda.contingenciaActiva
                      ? <span style={{ color: '#92400e', fontWeight: 600 }}>Activada</span>
                      : <span style={{ color: 'var(--muted-foreground)' }}>Desactivada</span>}
                  </div>
                </div>

                <Field label="Chip" value={form.contingenciaChip ?? ''} editing={editing} onChange={v => setF('contingenciaChip', v)} />
                <Field label="Paquete" value={form.contingenciaPaquete ?? ''} editing={editing} onChange={v => setF('contingenciaPaquete', v)} />
              </div>
            </div>
          </div>

          {/* Supervisor */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <SectionTitle>Supervisor</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field label="Nombre" value={form.supervisorNombre ?? ''} editing={editing} onChange={v => setF('supervisorNombre', v)} />
              <Field label="Celular" value={form.supervisorCelular ?? ''} editing={editing} onChange={v => setF('supervisorCelular', v)} />
            </div>

            {/* Clasificación */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Clasificación</div>
              {editing ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {/* Sin color */}
                  <button type="button" onClick={() => setF('perfilSupervisor', null)}
                    style={{ width: '22px', height: '22px', borderRadius: '4px', border: `1.5px solid ${!form.perfilSupervisor ? 'hsl(221,83%,23%)' : 'var(--border)'}`, background: 'transparent', cursor: 'pointer', outline: 'none', boxShadow: !form.perfilSupervisor ? '0 0 0 2px hsl(221,83%,23%)' : 'none' }} />
                  {(['verde', 'amarillo', 'rojo'] as const).map(color => (
                    <button key={color} type="button" onClick={() => setF('perfilSupervisor', color)}
                      style={{ width: '22px', height: '22px', borderRadius: '4px', background: CLASIFICACION_COLORS[color], border: 'none', cursor: 'pointer', outline: form.perfilSupervisor === color ? `2px solid hsl(221,83%,23%)` : 'none', outlineOffset: '2px' }} />
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '16px', height: '16px', borderRadius: '3px',
                    background: tienda.perfilSupervisor ? CLASIFICACION_COLORS[tienda.perfilSupervisor] ?? 'transparent' : 'transparent',
                    border: tienda.perfilSupervisor && CLASIFICACION_COLORS[tienda.perfilSupervisor] ? 'none' : '1.5px solid var(--border)',
                  }} />
                </div>
              )}
            </div>
          </div>

          {/* Datos */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <SectionTitle>Datos</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field label="Venta / hora (S/.)" value={form.ventaHoraSoles ?? ''} editing={editing} onChange={v => setF('ventaHoraSoles', v)} />
              <Field label="I.E." value={form.instruccionReporte ?? ''} editing={editing} onChange={v => setF('instruccionReporte', v)} />
            </div>
            <Field label="Extras" value={form.extras ?? ''} editing={editing} onChange={v => setF('extras', v)} type="textarea" />
          </div>
        </div>

        {/* Right: actions + contingencia info + historial */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Actions */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
            <SectionTitle>Acciones</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <a href={`/incidentes/nuevo?tiendaId=${tienda.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', textDecoration: 'none' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Crear incidente
              </a>

              <button onClick={showContingenciaWarning}
                style={{ padding: '9px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '8px', fontSize: '12px', fontWeight: 500, color: '#92400e', cursor: 'pointer', textAlign: 'left' }}>
                Activar contingencia
              </button>

              {contingenciaMsg && (
                <div style={{ padding: '8px 10px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '7px', fontSize: '11px', color: '#92400e', lineHeight: 1.4 }}>
                  Para proceder tienes que justificar con un incidente
                </div>
              )}

              <a href={`/incidentes?tienda=${tienda.codigo}`}
                style={{ display: 'block', padding: '9px 12px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--foreground)', cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
                Ver incidentes
              </a>

              {tienda.proveedorId && (
                <a href={`/proveedores/${tienda.proveedorId}`}
                  style={{ display: 'block', padding: '9px 12px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--foreground)', cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
                  Ver proveedor →
                </a>
              )}
            </div>
          </div>

          {/* Contingencia activa info */}
          {tienda.contingenciaActiva && (
            <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '12px', padding: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Contingencia activa</div>
              {tienda.contingenciaDescripcion && (
                <div style={{ fontSize: '11px', color: '#78350f', marginBottom: '6px', lineHeight: 1.5 }}>{tienda.contingenciaDescripcion}</div>
              )}
              {tienda.contingenciaActivadaPor && (
                <div style={{ fontSize: '10px', color: '#92400e' }}>Por: {tienda.contingenciaActivadaPor}</div>
              )}
              {tienda.contingenciaFecha && (
                <div style={{ fontSize: '10px', color: '#92400e', marginTop: '2px' }}>
                  {new Date(tienda.contingenciaFecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          )}

          {/* Historial */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
            <SectionTitle>Historial de cambios</SectionTitle>
            {historial.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '12px 0' }}>Sin cambios registrados</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {historial.slice(0, 10).map(h => (
                  <div key={h.id} style={{ fontSize: '11px', borderBottom: '0.5px solid var(--border)', paddingBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 500, color: 'var(--foreground)' }}>{CAMPO_LABELS[h.campoEditado] ?? h.campoEditado}</span>
                      <span style={{ color: 'var(--muted-foreground)', fontSize: '10px' }}>{relTime(h.editadoEn)}</span>
                    </div>
                    <div style={{ color: 'var(--muted-foreground)', display: 'flex', gap: '4px', flexWrap: 'wrap', fontSize: '10px' }}>
                      {h.valorAnterior && <span style={{ textDecoration: 'line-through' }}>{h.valorAnterior}</span>}
                      {h.valorAnterior && h.valorNuevo && <span>→</span>}
                      {h.valorNuevo && <span style={{ color: 'var(--foreground)' }}>{h.valorNuevo}</span>}
                    </div>
                    {h.usuarioNombre && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>por {h.usuarioNombre}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
