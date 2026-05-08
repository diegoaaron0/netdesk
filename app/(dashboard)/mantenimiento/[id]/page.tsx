'use client'
import { useEffect, useState, use } from 'react'
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
  perfilSupervisor: 'Perfil sup.', tipoConexion: 'Tipo conexión', tipoServicio: 'Tipo servicio',
  cidServicio: 'CID', tieneContingencia: 'Tiene contingencia', contingenciaActiva: 'Contingencia activa',
  contingenciaDescripcion: 'Desc. contingencia', costoMensual: 'Costo mensual',
  instruccionReporte: 'Instrucción reporte', contactoSoporte: 'Contacto soporte',
  administradorNombre: 'Admin nombre', administradorEmail: 'Admin email',
  administradorCelular: 'Admin celular', proveedorId: 'Proveedor',
  ventaHoraSoles: 'Venta/hora S/.', formato: 'Formato', referencia: 'Referencia',
  ubicacion: 'Ubicación',
}

const PERFILES_SUPERVISOR = [
  { emoji: '',   label: 'Sin definir' },
  { emoji: '😡', label: 'Crítico' },
  { emoji: '😤', label: 'Exigente' },
  { emoji: '😐', label: 'Neutral' },
  { emoji: '🙂', label: 'Colaborativo' },
]

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

function Field({ label, value, editing, onChange, type = 'text' }: { label: string; value: string; editing: boolean; onChange: (v: string) => void; type?: string }) {
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

export default function TiendaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: session } = useSession()

  const userRol = (session?.user as any)?.rol ?? 'AGENTE'
  const userName = (session?.user as any)?.nombre ?? (session?.user as any)?.name ?? ''
  const canEdit = ['SUPERVISOR', 'INFRAESTRUCTURA'].includes(userRol)

  const [tienda, setTienda] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [contingenciaModal, setContingenciaModal] = useState<{ open: boolean; desc: string }>({ open: false, desc: '' })

  useEffect(() => {
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
      setTienda(updated)
      setForm(updated)
      // Refresh historial
      fetch(`/api/tiendas/historial?tiendaId=${id}`).then(r => r.json()).then(d => {
        setHistorial(Array.isArray(d) ? d : [])
      })
    }
    setSaving(false)
    setEditing(false)
  }

  async function handleContingencia(activate: boolean) {
    if (activate && !contingenciaModal.open) {
      setContingenciaModal({ open: true, desc: '' })
      return
    }
    const body: any = { contingenciaActiva: activate }
    if (activate) {
      body.contingenciaDescripcion = contingenciaModal.desc
      body.contingenciaActivadaPor = userName
      body.contingenciaFecha = new Date().toISOString()
    } else {
      body.contingenciaDescripcion = null
      body.contingenciaActivadaPor = null
      body.contingenciaFecha = null
    }
    const res = await fetch(`/api/tiendas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const updated = await res.json()
    if (updated.id) { setTienda(updated); setForm(updated) }
    setContingenciaModal({ open: false, desc: '' })
    fetch(`/api/tiendas/historial?tiendaId=${id}`).then(r => r.json()).then(d => {
      setHistorial(Array.isArray(d) ? d : [])
    })
  }

  if (!tienda) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px', color: 'var(--muted-foreground)', fontSize: '13px' }}>
        Cargando...
      </div>
    )
  }

  const prov = provColor(tienda.proveedorNombre)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
        <button onClick={() => router.push('/mantenimiento')}
          style={{ padding: '6px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer', marginTop: '2px', whiteSpace: 'nowrap' }}>
          ← Volver
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em' }}>{tienda.codigo}</span>
            <span style={{ fontSize: '15px', fontWeight: 500 }}>{tienda.nombreCc || '—'}</span>
            {tienda.contingenciaActiva && (
              <span style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '2px 9px', fontSize: '10px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>
                ⚠ Contingencia activa
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {tienda.proveedorNombre && (
              <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: prov.bg, color: prov.color }}>
                {tienda.proveedorNombre}
              </span>
            )}
            {tienda.cluster && (
              <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: 'var(--muted)', color: 'var(--foreground)' }}>
                Cluster {tienda.cluster}
              </span>
            )}
            {tienda.tipoConexion && (
              <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{tienda.tipoConexion}</span>
            )}
            {tienda.cidServicio && (
              <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>CID: {tienda.cidServicio}</span>
            )}
            {tienda.totalIncidentes > 0 && (
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
                {tienda.totalIncidentes} incidentes totales
              </span>
            )}
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

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px', alignItems: 'start' }}>
        {/* Left: data panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Identificación */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <SectionTitle>Identificación</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field label="Nombre CC" value={form.nombreCc ?? ''} editing={editing} onChange={v => setF('nombreCc', v)} />
              <Field label="Formato" value={form.formato ?? ''} editing={editing} onChange={v => setF('formato', v)} />
              <Field label="Dirección" value={form.direccion ?? ''} editing={editing} onChange={v => setF('direccion', v)} />
              <Field label="Referencia" value={form.referencia ?? ''} editing={editing} onChange={v => setF('referencia', v)} />
              <Field label="Distrito" value={form.distrito ?? ''} editing={editing} onChange={v => setF('distrito', v)} />
              <Field label="Provincia" value={form.provincia ?? ''} editing={editing} onChange={v => setF('provincia', v)} />
              <Field label="Ubicación" value={form.ubicacion ?? ''} editing={editing} onChange={v => setF('ubicacion', v)} />
              <Field label="Coordenadas" value={form.coordenadas ?? ''} editing={editing} onChange={v => setF('coordenadas', v)} />
            </div>
            {editing && (
              <div style={{ marginTop: '4px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Cluster</div>
                <select value={form.cluster ?? ''} onChange={e => setF('cluster', e.target.value)}
                  style={{ width: '100%', padding: '6px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">Sin cluster</option>
                  {['A','B','C','D'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            {!editing && tienda.cluster && (
              <div style={{ marginTop: '4px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Cluster</div>
                <div style={{ fontSize: '12px' }}>Cluster {tienda.cluster}</div>
              </div>
            )}
          </div>

          {/* Conectividad */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <SectionTitle>Conectividad</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field label="Tipo conexión" value={form.tipoConexion ?? ''} editing={editing} onChange={v => setF('tipoConexion', v)} />
              <Field label="Tipo servicio" value={form.tipoServicio ?? ''} editing={editing} onChange={v => setF('tipoServicio', v)} />
              <Field label="CID / Servicio" value={form.cidServicio ?? ''} editing={editing} onChange={v => setF('cidServicio', v)} />
              <Field label="Costo mensual (S/.)" value={form.costoMensual ?? ''} editing={editing} onChange={v => setF('costoMensual', v)} />
              <Field label="Venta/hora (S/.)" value={form.ventaHoraSoles ?? ''} editing={editing} onChange={v => setF('ventaHoraSoles', v)} />
            </div>
            {editing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input type="checkbox" id="tieneContingencia" checked={!!form.tieneContingencia} onChange={e => setF('tieneContingencia', e.target.checked)} />
                <label htmlFor="tieneContingencia" style={{ fontSize: '12px', cursor: 'pointer' }}>Tiene plan de contingencia</label>
              </div>
            )}
            {!editing && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--muted-foreground)' }}>
                Plan de contingencia: <span style={{ color: tienda.tieneContingencia ? '#059669' : 'var(--muted-foreground)', fontWeight: tienda.tieneContingencia ? 600 : 400 }}>{tienda.tieneContingencia ? 'Sí' : 'No'}</span>
              </div>
            )}
            {editing && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Proveedor</div>
                <select value={form.proveedorId ?? ''} onChange={e => setF('proveedorId', e.target.value)}
                  style={{ width: '100%', padding: '6px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Supervisor */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <SectionTitle>Supervisor</SectionTitle>
            <Field label="Nombre del supervisor" value={form.supervisorNombre ?? ''} editing={editing} onChange={v => setF('supervisorNombre', v)} />
            {editing ? (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Perfil del supervisor</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {PERFILES_SUPERVISOR.map(({ emoji, label }) => {
                    const selected = form.perfilSupervisor === emoji
                    return (
                      <button key={emoji || 'none'} type="button" onClick={() => setF('perfilSupervisor', emoji)}
                        style={{ padding: '5px 10px', fontSize: '12px', borderRadius: '7px', cursor: 'pointer', border: selected ? '1.5px solid hsl(221,83%,23%)' : '0.5px solid var(--border)', background: selected ? 'hsl(221,83%,23%)' : 'var(--muted)', color: selected ? 'white' : 'var(--foreground)', outline: 'none' }}>
                        {emoji ? `${emoji} ${label}` : label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              tienda.perfilSupervisor && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Perfil</div>
                  <div style={{ fontSize: '12px' }}>{tienda.perfilSupervisor}</div>
                </div>
              )
            )}
            <Field label="Instrucción de reporte" value={form.instruccionReporte ?? ''} editing={editing} onChange={v => setF('instruccionReporte', v)} type="textarea" />
          </div>

          {/* Contacto */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <SectionTitle>Contacto</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field label="Admin nombre" value={form.administradorNombre ?? ''} editing={editing} onChange={v => setF('administradorNombre', v)} />
              <Field label="Admin celular" value={form.administradorCelular ?? ''} editing={editing} onChange={v => setF('administradorCelular', v)} />
              <Field label="Admin email" value={form.administradorEmail ?? ''} editing={editing} onChange={v => setF('administradorEmail', v)} />
              <Field label="Contacto soporte" value={form.contactoSoporte ?? ''} editing={editing} onChange={v => setF('contactoSoporte', v)} />
            </div>
          </div>
        </div>

        {/* Right: actions + historial */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Actions */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
            <SectionTitle>Acciones</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <a href={`/incidentes/nuevo?tiendaId=${tienda.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', textDecoration: 'none' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Crear incidente
              </a>
              {canEdit && (
                tienda.contingenciaActiva ? (
                  <button onClick={() => handleContingencia(false)}
                    style={{ padding: '9px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', fontSize: '12px', fontWeight: 500, color: '#dc2626', cursor: 'pointer' }}>
                    Desactivar contingencia
                  </button>
                ) : (
                  <button onClick={() => handleContingencia(true)}
                    style={{ padding: '9px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '8px', fontSize: '12px', fontWeight: 500, color: '#92400e', cursor: 'pointer' }}>
                    Activar contingencia
                  </button>
                )
              )}
              <a href={`/incidentes?tienda=${tienda.codigo}`}
                style={{ display: 'block', padding: '9px 12px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--foreground)', cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
                Ver incidentes
              </a>
            </div>
          </div>

          {/* Contingencia info */}
          {tienda.contingenciaActiva && (
            <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '12px', padding: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Contingencia activa</div>
              {tienda.contingenciaDescripcion && (
                <div style={{ fontSize: '11px', color: '#78350f', marginBottom: '6px', lineHeight: 1.5 }}>{tienda.contingenciaDescripcion}</div>
              )}
              {tienda.contingenciaActivadaPor && (
                <div style={{ fontSize: '10px', color: '#92400e' }}>Activado por: {tienda.contingenciaActivadaPor}</div>
              )}
              {tienda.contingenciaFecha && (
                <div style={{ fontSize: '10px', color: '#92400e' }}>
                  {new Date(tienda.contingenciaFecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          )}

          {/* Historial reciente */}
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

      {/* Contingencia modal */}
      {contingenciaModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '420px', padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Activar contingencia</div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Descripción / motivo</label>
              <textarea value={contingenciaModal.desc}
                onChange={e => setContingenciaModal(m => ({ ...m, desc: e.target.value }))}
                placeholder="Ej: Fibra óptica cortada en zona norte..."
                style={{ width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box', minHeight: '72px', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setContingenciaModal({ open: false, desc: '' })}
                style={{ padding: '8px 16px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => handleContingencia(true)}
                style={{ padding: '8px 16px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
