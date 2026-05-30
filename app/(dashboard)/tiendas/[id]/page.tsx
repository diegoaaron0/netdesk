'use client'
import { useEffect, useState, use, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { can } from '@/lib/permisos'

const PROVEEDOR_COLORS: Record<string, { bg: string; color: string }> = {
  BITEL:             { bg: '#dbeafe', color: '#1e40af' },
  CLARO:             { bg: '#fee2e2', color: '#b91c1c' },
  CONVERGIA:         { bg: '#ede9fe', color: '#7c3aed' },
  ENTEL:             { bg: '#dcfce7', color: '#15803d' },
  MOVISTAR:          { bg: '#1e3a8a', color: '#bfdbfe' },
  GTD:               { bg: '#ffedd5', color: '#c2410c' },
  'GTD PERU':        { bg: '#ffedd5', color: '#c2410c' },
  FIBERLUX:          { bg: '#fef9c3', color: '#854d0e' },
  FIBERTEL:          { bg: '#fef3c7', color: '#713f12' },
  'FIBRA AMAZÓNICA': { bg: '#d1fae5', color: '#065f46' },
  DITSAC:            { bg: '#fce7f3', color: '#9d174d' },
  'DIT SAC':         { bg: '#fce7f3', color: '#9d174d' },
  TELCONET:          { bg: '#e0f2fe', color: '#075985' },
  GONET:             { bg: '#d1fae5', color: '#064e3b' },
  AMERICATEL:        { bg: '#e0e7ff', color: '#3730a3' },
  WIN:               { bg: '#ecfdf5', color: '#047857' },
}
function provColor(n: string | null) {
  if (!n) return { bg: '#f3f4f6', color: '#6b7280' }
  return PROVEEDOR_COLORS[n.toUpperCase()] ?? { bg: '#f3f4f6', color: '#6b7280' }
}

const CAMPO_LABELS: Record<string, string> = {
  celularTienda: 'Celular tienda',
  nombreCc: 'Referencia', referencia: 'Grupo', direccion: 'Dirección', distrito: 'Distrito',
  provincia: 'Provincia', ubicacion: 'Ubicación', cluster: 'Cluster',
  supervisorNombre: 'Supervisor', supervisorCelular: 'Celular supervisor',
  perfilSupervisor: 'Clasificación',
  tipoConexion: 'Tipo conexión', tipoServicio: 'Tipo servicio',
  cidServicio: 'CID', tieneContingencia: 'Tiene contingencia', contingenciaActiva: 'Contingencia activa',
  contingenciaDescripcion: 'Desc. contingencia', contingenciaChip: 'Chip contingencia',
  contingenciaPaquete: 'Paquete contingencia', costoMensual: 'Costo mensual',
  instruccionReporte: 'I.E.', contactoSoporte: 'Contacto soporte',
  administradorNombre: 'Admin nombre', administradorEmail: 'Email',
  administradorCelular: 'Admin celular', proveedorId: 'Proveedor',
  ventaHoraSoles: 'Venta/hora S/.', formato: 'Formato', extras: 'Extras',
  observacion: 'Observación', velocidad: 'Velocidad',
  planAplicado: 'Plan aplicado', fechaAltaServicio: 'Fecha alta servicio',
  estadoServicio: 'Estado servicio',
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
    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', paddingBottom: '5px', borderBottom: '0.5px solid var(--border)' }}>
      {children}
    </div>
  )
}

function Field({ label, value, editing, onChange, type = 'text' }: {
  label: string; value: string; editing: boolean; onChange: (v: string) => void; type?: string
}) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>{label}</div>
      {editing ? (
        type === 'textarea'
          ? <textarea value={value ?? ''} onChange={e => onChange(e.target.value)}
              style={{ width: '100%', padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box', minHeight: '54px', resize: 'vertical' }} />
          : <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
              style={{ width: '100%', padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }} />
      ) : (
        <div style={{ fontSize: '11px', color: value ? 'var(--foreground)' : 'var(--muted-foreground)', minHeight: '18px' }}>
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

  const canEdit = can(session, 'mantenimiento.editar')

  const [tienda, setTienda] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([])
  const [contStats, setContStats] = useState<any>(null)
  const [contList, setContList] = useState<any[]>([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [showContForm, setShowContForm] = useState(false)
  const [contForm, setContForm] = useState({ tipo: '', activadoPor: '', justificacion: '' })
  const [contFormSaving, setContFormSaving] = useState(false)
  const [desactivandoContId, setDesactivandoContId] = useState<string | null>(null)

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
    fetch(`/api/tiendas/${id}/contingencia-stats`).then(r => r.json()).then(d => {
      setContStats(d)
    })
    fetch(`/api/tiendas/${id}/contingencias`).then(r => r.json()).then(d => {
      setContList(Array.isArray(d) ? d : [])
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

  async function handleActivarCont() {
    if (!contForm.tipo || !contForm.activadoPor || !contForm.justificacion.trim()) return
    setContFormSaving(true)
    try {
      const res = await fetch('/api/contingencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiendaId: id, ...contForm }),
      })
      if (res.ok) {
        setShowContForm(false)
        setContForm({ tipo: '', activadoPor: '', justificacion: '' })
        loadData()
      }
    } finally {
      setContFormSaving(false)
    }
  }

  async function handleDesactivarCont(contId: string) {
    setDesactivandoContId(contId)
    try {
      const res = await fetch(`/api/contingencias/${contId}`, { method: 'PATCH' })
      if (res.ok) loadData()
    } finally {
      setDesactivandoContId(null)
    }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* ── Header strip ── */}
      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button onClick={() => router.push('/tiendas')}
          style={{ padding: '5px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', color: 'var(--foreground)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          ← Volver
        </button>

        {/* Identity tags */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '17px', fontWeight: 700 }}>{tienda.codigo}</span>
          {(tienda.nombreCc || tienda.distrito) && <span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>—</span>}
          {(tienda.nombreCc || tienda.distrito) && <span style={{ fontSize: '13px', fontWeight: 500 }}>{tienda.nombreCc || tienda.distrito}</span>}
          {tienda.proveedorNombre && (
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '4px', background: prov.bg, color: prov.color }}>{tienda.proveedorNombre}</span>
          )}
          {tienda.cluster && (
            <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', background: 'var(--muted)', padding: '1px 6px', borderRadius: '4px' }}>Cluster {tienda.cluster}</span>
          )}
          {tienda.cidServicio && (
            <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>CID {tienda.cidServicio}</span>
          )}
          {tienda.contingenciaActiva && (
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', background: '#fef3c7', color: '#92400e', border: '0.5px solid #f59e0b' }}>
              Contingencia activa
            </span>
          )}
        </div>

        {/* KPI mini inline */}
        <div style={{ display: 'flex', gap: '14px', flexShrink: 0 }}>
          {tienda.costoMensual && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: '13px' }}>S/ {Number(tienda.costoMensual).toLocaleString('es-PE')}</div>
              <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>/mes</div>
            </div>
          )}
          {tienda.ventaHoraSoles && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: '13px' }}>S/ {Number(tienda.ventaHoraSoles).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div>
              <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>/hora</div>
            </div>
          )}
          <div style={{ padding: '3px 9px', borderRadius: '6px', background: contStatus.bg, textAlign: 'right' }}>
            <div style={{ fontWeight: 700, color: contStatus.color, fontSize: '12px' }}>{contStatus.label}</div>
            <div style={{ fontSize: '9px', color: contStatus.color, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>contingencia</div>
          </div>
        </div>

        {/* Edit controls */}
        {canEdit && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); setForm(tienda) }}
                  style={{ padding: '5px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', color: 'var(--foreground)', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '5px 12px', fontSize: '12px', border: 'none', borderRadius: '7px', background: 'hsl(221,83%,23%)', color: 'white', fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)}
                style={{ padding: '5px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer' }}>
                Editar
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Main grid: left 2×2 | right sidebar ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 252px', gap: '10px', alignItems: 'start' }}>

        {/* Left: 2×2 cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>

          {/* Card A: Tienda / contacto */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
            <SectionTitle>Tienda</SectionTitle>

            {/* Celular destacado */}
            <div style={{ padding: '7px 10px', background: form.celularTienda ? '#EFF6FF' : 'var(--muted)', border: `0.5px solid ${form.celularTienda ? '#BFDBFE' : 'var(--border)'}`, borderRadius: '7px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '2px' }}>Celular de tienda</div>
                {editing ? (
                  <input value={form.celularTienda ?? ''} onChange={e => setF('celularTienda', e.target.value)} placeholder="Ej: 987 654 321"
                    style={{ width: '100%', padding: '3px 6px', fontSize: '12px', fontWeight: 600, border: '0.5px solid #93C5FD', borderRadius: '5px', background: 'white', color: '#1D4ED8', outline: 'none', boxSizing: 'border-box' }} />
                ) : (
                  <div style={{ fontSize: '13px', fontWeight: 700, color: form.celularTienda ? '#1D4ED8' : 'var(--muted-foreground)', fontFamily: form.celularTienda ? 'monospace' : 'inherit' }}>
                    {form.celularTienda || 'Sin registrar'}
                  </div>
                )}
              </div>
              {!editing && form.celularTienda && (
                <a href={`tel:${form.celularTienda.replace(/\s/g, '')}`}
                  style={{ padding: '4px 8px', background: '#1D4ED8', color: 'white', borderRadius: '5px', fontSize: '10px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Llamar
                </a>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
              <Field label="Referencia" value={form.nombreCc  ?? ''} editing={editing} onChange={v => setF('nombreCc', v)} />
              <Field label="Formato"    value={form.formato   ?? ''} editing={editing} onChange={v => setF('formato', v)} />
              <Field label="Dirección"  value={form.direccion ?? ''} editing={editing} onChange={v => setF('direccion', v)} />
              <Field label="Distrito"   value={form.distrito  ?? ''} editing={editing} onChange={v => setF('distrito', v)} />
              <Field label="Provincia"  value={form.provincia  ?? ''} editing={editing} onChange={v => setF('provincia', v)} />
              <Field label="Grupo"      value={form.referencia ?? ''} editing={editing} onChange={v => setF('referencia', v)} />
              <Field label="Ubicación"  value={form.ubicacion  ?? ''} editing={editing} onChange={v => setF('ubicacion', v)} />
            </div>

            <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: '8px', marginTop: '2px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
              <Field label="Admin. nombre"  value={form.administradorNombre  ?? ''} editing={editing} onChange={v => setF('administradorNombre', v)} />
              <Field label="Admin. celular" value={form.administradorCelular ?? ''} editing={editing} onChange={v => setF('administradorCelular', v)} />
              <Field label="Email"          value={form.administradorEmail   ?? ''} editing={editing} onChange={v => setF('administradorEmail', v)} />
            </div>
          </div>

          {/* Card B: Conectividad */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
            <SectionTitle>Conectividad</SectionTitle>

            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Proveedor</div>
              {editing ? (
                <select value={form.proveedorId ?? ''} onChange={e => setF('proveedorId', e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              ) : tienda.proveedorNombre ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: prov.bg, color: prov.color }}>{tienda.proveedorNombre}</span>
                  {tienda.proveedorTelefono && <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{tienda.proveedorTelefono}</span>}
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>—</div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
              <Field label="Tipo conexión"     value={form.tipoConexion  ?? ''} editing={editing} onChange={v => setF('tipoConexion', v)} />
              <Field label="CID / Servicio"    value={form.cidServicio   ?? ''} editing={editing} onChange={v => setF('cidServicio', v)} />
              <Field label="Tipo servicio"     value={form.tipoServicio  ?? ''} editing={editing} onChange={v => setF('tipoServicio', v)} />
              <Field label="Velocidad"         value={form.velocidad     ?? ''} editing={editing} onChange={v => setF('velocidad', v)} />
              <Field label="Costo mensual (S/.)" value={form.costoMensual ?? ''} editing={editing} onChange={v => setF('costoMensual', v)} />
              <Field label="Venta / hora (S/.)" value={form.ventaHoraSoles ?? ''} editing={editing} onChange={v => setF('ventaHoraSoles', v)} />
            </div>
            <Field label="Descripción servicio" value={form.descripcionServicio ?? ''} editing={editing} onChange={v => setF('descripcionServicio', v)} type="textarea" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
              <Field label="Vigencia contrato" value={form.vigenciaContrato ?? ''} editing={editing} onChange={v => setF('vigenciaContrato', v)} />
              {/* Gabinete */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Gabinete</div>
                {editing ? (
                  <div style={{ display: 'flex', gap: '5px' }}>
                    {[{ v: true, l: 'Sí' }, { v: false, l: 'No' }].map(({ v, l }) => (
                      <button key={l} type="button" onClick={() => setF('gabinete', v)}
                        style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '5px', cursor: 'pointer', border: form.gabinete === v ? '1.5px solid hsl(221,83%,23%)' : '0.5px solid var(--border)', background: form.gabinete === v ? 'hsl(221,83%,23%)' : 'var(--muted)', color: form.gabinete === v ? 'white' : 'var(--foreground)', outline: 'none' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: 'var(--foreground)' }}>{form.gabinete ? 'Sí' : 'No'}</div>
                )}
              </div>
            </div>
            <Field label="Observación" value={form.observacion ?? ''} editing={editing} onChange={v => setF('observacion', v)} type="textarea" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
              <Field label="Plan aplicado"       value={form.planAplicado      ?? ''} editing={editing} onChange={v => setF('planAplicado', v)} />
              <Field label="Fecha alta servicio" value={form.fechaAltaServicio ?? ''} editing={editing} onChange={v => setF('fechaAltaServicio', v)} type="date" />
              {/* Estado servicio */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Estado servicio</div>
                {editing ? (
                  <select value={form.estadoServicio ?? 'ACTIVO'} onChange={e => setF('estadoServicio', e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
                    <option value="ACTIVO">Activo</option>
                    <option value="INACTIVO">Inactivo</option>
                    <option value="SUSPENDIDO">Suspendido</option>
                    <option value="BAJA">Baja</option>
                  </select>
                ) : (
                  <div style={{ fontSize: '11px', color: form.estadoServicio && form.estadoServicio !== 'ACTIVO' ? '#b91c1c' : 'var(--foreground)' }}>
                    {form.estadoServicio || 'ACTIVO'}
                  </div>
                )}
              </div>
            </div>
            <Field label="Contacto soporte" value={form.contactoSoporte ?? ''} editing={editing} onChange={v => setF('contactoSoporte', v)} />
            <Field label="Coordenadas"      value={form.coordenadas     ?? ''} editing={editing} onChange={v => setF('coordenadas', v)} />
          </div>

          {/* Card C: Supervisor */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
            <SectionTitle>Supervisor</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
              <Field label="Nombre" value={form.supervisorNombre  ?? ''} editing={editing} onChange={v => setF('supervisorNombre', v)} />
              <Field label="Celular" value={form.supervisorCelular ?? ''} editing={editing} onChange={v => setF('supervisorCelular', v)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px', marginBottom: '4px' }}>
              {/* Clasificación */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Clasificación</div>
                {editing ? (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button type="button" onClick={() => setF('perfilSupervisor', null)}
                      style={{ width: '20px', height: '20px', borderRadius: '3px', border: `1.5px solid ${!form.perfilSupervisor ? 'hsl(221,83%,23%)' : 'var(--border)'}`, background: 'transparent', cursor: 'pointer', outline: 'none' }} />
                    {(['verde', 'amarillo', 'rojo'] as const).map(color => (
                      <button key={color} type="button" onClick={() => setF('perfilSupervisor', color)}
                        style={{ width: '20px', height: '20px', borderRadius: '3px', background: CLASIFICACION_COLORS[color], border: 'none', cursor: 'pointer', outline: form.perfilSupervisor === color ? `2px solid hsl(221,83%,23%)` : 'none', outlineOffset: '2px' }} />
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: tienda.perfilSupervisor ? CLASIFICACION_COLORS[tienda.perfilSupervisor] ?? 'var(--muted)' : 'var(--muted)', border: '0.5px solid var(--border)' }} />
                    {tienda.perfilSupervisor && <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>{tienda.perfilSupervisor}</span>}
                  </div>
                )}
              </div>
              {/* Cluster */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Cluster</div>
                {editing ? (
                  <select value={form.cluster ?? ''} onChange={e => setF('cluster', e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
                    <option value="">Sin cluster</option>
                    {['A','B','C','D'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <div style={{ fontSize: '11px', color: tienda.cluster ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                    {tienda.cluster ? `Cluster ${tienda.cluster}` : '—'}
                  </div>
                )}
              </div>
            </div>

            <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: '8px' }}>
              <Field label="Instrucción específica (I.E.)" value={form.instruccionReporte ?? ''} editing={editing} onChange={v => setF('instruccionReporte', v)} type="textarea" />
            </div>
          </div>

          {/* Card D: Contingencia + Extras */}
          <div style={{ background: tienda.contingenciaActiva ? '#fffbeb' : 'var(--card)', border: `0.5px solid ${tienda.contingenciaActiva ? '#f59e0b' : 'var(--border)'}`, borderRadius: '10px', padding: '12px 14px' }}>
            <SectionTitle>Contingencia</SectionTitle>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
              {/* Tiene */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Tiene</div>
                {editing ? (
                  <div style={{ display: 'flex', gap: '5px' }}>
                    {[{ v: true, l: 'Sí' }, { v: false, l: 'No' }].map(({ v, l }) => (
                      <button key={l} type="button" onClick={() => setF('tieneContingencia', v)}
                        style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '5px', cursor: 'pointer', border: form.tieneContingencia === v ? '1.5px solid hsl(221,83%,23%)' : '0.5px solid var(--border)', background: form.tieneContingencia === v ? 'hsl(221,83%,23%)' : 'var(--muted)', color: form.tieneContingencia === v ? 'white' : 'var(--foreground)', outline: 'none' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', fontWeight: 600, color: tienda.tieneContingencia ? '#059669' : 'var(--muted-foreground)' }}>
                    {tienda.tieneContingencia ? 'Sí' : 'No'}
                  </div>
                )}
              </div>
              {/* Estado */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Estado</div>
                {tienda.contingenciaActiva
                  ? <span style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 7px', borderRadius: '4px' }}>Activada</span>
                  : <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Desactivada</span>}
              </div>
              <Field label="Chip"    value={form.contingenciaChip    ?? ''} editing={editing} onChange={v => setF('contingenciaChip', v)} />
              <Field label="Paquete" value={form.contingenciaPaquete ?? ''} editing={editing} onChange={v => setF('contingenciaPaquete', v)} />
            </div>

            {tienda.contingenciaActiva && (
              <div style={{ marginBottom: '8px' }}>
                {tienda.contingenciaDescripcion && (
                  <div style={{ fontSize: '11px', color: '#78350f', lineHeight: 1.5, background: '#fef3c7', padding: '6px 8px', borderRadius: '6px', marginBottom: '4px' }}>
                    {tienda.contingenciaDescripcion}
                  </div>
                )}
                <div style={{ fontSize: '10px', color: '#92400e', display: 'flex', gap: '12px' }}>
                  {tienda.contingenciaActivadaPor && <span>Por: {tienda.contingenciaActivadaPor}</span>}
                  {tienda.contingenciaFecha && (
                    <span>{new Date(tienda.contingenciaFecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                </div>
              </div>
            )}

            <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: '8px', marginTop: '2px' }}>
              <Field label="Extras / notas" value={form.extras ?? ''} editing={editing} onChange={v => setF('extras', v)} type="textarea" />
            </div>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* Acciones */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
            <SectionTitle>Acciones</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <a href={`/incidentes/nuevo?tiendaId=${tienda.id}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px 12px', background: 'hsl(221,83%,23%)', color: 'white', borderRadius: '7px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', textDecoration: 'none' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Crear incidente
              </a>
              {!showContForm ? (
                <button onClick={() => setShowContForm(true)}
                  style={{ padding: '9px 12px', background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.5)', borderRadius: '7px', fontSize: '12px', fontWeight: 500, color: '#92400e', cursor: 'pointer', textAlign: 'center' }}>
                  Activar contingencia
                </button>
              ) : (() => {
                const tipos = tienda.tieneContingencia
                  ? [{ v: 'ROUTER_PROPIO', l: '📶 Router propio' }, { v: 'DATOS_MOVILES', l: 'Datos móviles' }, { v: 'ROUTER_EXTERNO', l: '📦 Router externo' }]
                  : [{ v: 'ROUTER_EXTERNO', l: '📦 Router externo' }]
                return (
                  <div style={{ background: '#fffbeb', border: '0.5px solid #f59e0b', borderRadius: '8px', padding: '10px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#92400e', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activar contingencia</div>
                    <div style={{ marginBottom: '6px' }}>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: '#92400e', marginBottom: '4px', textTransform: 'uppercase' }}>Tipo</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {tipos.map(t => (
                          <button key={t.v} type="button" onClick={() => setContForm(f => ({ ...f, tipo: t.v }))}
                            style={{ padding: '4px 8px', fontSize: '11px', textAlign: 'left', borderRadius: '5px', cursor: 'pointer', border: contForm.tipo === t.v ? '1.5px solid #b45309' : '0.5px solid #fcd34d', background: contForm.tipo === t.v ? '#b45309' : '#fef3c7', color: contForm.tipo === t.v ? 'white' : '#78350f', outline: 'none' }}>
                            {t.l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginBottom: '6px' }}>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: '#92400e', marginBottom: '3px', textTransform: 'uppercase' }}>Activado por</div>
                      <input value={contForm.activadoPor} onChange={e => setContForm(f => ({ ...f, activadoPor: e.target.value }))} placeholder="Nombre o cargo"
                        style={{ width: '100%', padding: '5px 8px', fontSize: '11px', border: '0.5px solid #fcd34d', borderRadius: '5px', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: '#92400e', marginBottom: '3px', textTransform: 'uppercase' }}>Justificación <span style={{ color: '#dc2626' }}>*</span></div>
                      <textarea value={contForm.justificacion} onChange={e => setContForm(f => ({ ...f, justificacion: e.target.value }))} placeholder="Motivo de la activación…"
                        style={{ width: '100%', padding: '5px 8px', fontSize: '11px', border: '0.5px solid #fcd34d', borderRadius: '5px', background: 'white', outline: 'none', boxSizing: 'border-box', minHeight: '54px', resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button onClick={handleActivarCont} disabled={contFormSaving || !contForm.tipo || !contForm.activadoPor || !contForm.justificacion.trim()}
                        style={{ flex: 1, padding: '6px', fontSize: '11px', fontWeight: 600, border: 'none', borderRadius: '5px', background: '#b45309', color: 'white', cursor: 'pointer', opacity: (contFormSaving || !contForm.tipo || !contForm.activadoPor || !contForm.justificacion.trim()) ? 0.5 : 1 }}>
                        {contFormSaving ? 'Activando…' : 'Activar'}
                      </button>
                      <button onClick={() => { setShowContForm(false); setContForm({ tipo: '', activadoPor: '', justificacion: '' }) }}
                        style={{ padding: '6px 10px', fontSize: '11px', border: '0.5px solid #fcd34d', borderRadius: '5px', background: '#fef3c7', color: '#78350f', cursor: 'pointer' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )
              })()}
              <a href={`/incidentes?tiendaId=${tienda.id}`}
                style={{ display: 'block', padding: '9px 12px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '7px', fontSize: '12px', color: 'var(--foreground)', textDecoration: 'none', textAlign: 'center' }}>
                Ver incidentes
              </a>
              {tienda.proveedorId && (
                <a href={`/proveedores/${tienda.proveedorId}`}
                  style={{ display: 'block', padding: '9px 12px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '7px', fontSize: '12px', color: 'var(--foreground)', textDecoration: 'none', textAlign: 'center' }}>
                  Ver proveedor →
                </a>
              )}
            </div>
          </div>

          {/* Contingencias autónomas activas */}
          {contList.filter((c: any) => !c.horaDesactivacion).length > 0 && (() => {
            const activas = contList.filter((c: any) => !c.horaDesactivacion)
            const TIPO_LABEL: Record<string, string> = { ROUTER_PROPIO: '📶 Router propio', ROUTER_EXTERNO: '📦 Router externo', DATOS_MOVILES: 'Datos móviles' }
            return (
              <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '10px', padding: '12px 14px' }}>
                <SectionTitle>Contingencias activas</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {activas.map((c: any) => {
                    const mins = Math.round((Date.now() - new Date(c.horaActivacion).getTime()) / 60000)
                    const dur = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`
                    const deactivating = desactivandoContId === c.id
                    return (
                      <div key={c.id} style={{ background: 'white', border: '0.5px solid #fcd34d', borderRadius: '7px', padding: '7px 9px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#92400e' }}>{TIPO_LABEL[c.tipo] ?? c.tipo}</span>
                          <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, color: '#d97706' }}>{dur} ⏱</span>
                        </div>
                        <div style={{ fontSize: '9px', color: '#78350f', marginBottom: '5px', lineHeight: 1.4 }}>{c.justificacion}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '9px', color: '#92400e', opacity: 0.7 }}>Por: {c.activadoPor}</span>
                          <button onClick={() => handleDesactivarCont(c.id)} disabled={deactivating}
                            style={{ padding: '2px 8px', fontSize: '9px', fontWeight: 600, border: '0.5px solid #f59e0b', borderRadius: '4px', background: '#fef3c7', color: '#78350f', cursor: 'pointer', opacity: deactivating ? 0.5 : 1 }}>
                            {deactivating ? '…' : 'Desactivar'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Uso de contingencia */}
          {contStats && (contStats.cnt_router_propio > 0 || contStats.cnt_router_externo > 0 || contStats.cnt_datos_moviles > 0) && (() => {
            function mhm(m: number) {
              if (!m) return '0m'
              if (m < 60) return `${m}m`
              return `${Math.floor(m / 60)}h ${m % 60}m`
            }
            const rows = [
              { label: 'Router propio', min: contStats.min_router_propio, cnt: contStats.cnt_router_propio, active: !!contStats.activo_propio, color: '#d97706', bg: '#fffbeb' },
              { label: 'Router externo', min: contStats.min_router_externo, cnt: contStats.cnt_router_externo, active: !!contStats.activo_externo, color: '#ea580c', bg: '#fff7ed' },
              { label: 'Datos móviles', min: contStats.min_datos_moviles, cnt: contStats.cnt_datos_moviles, active: !!contStats.activo_mov, color: '#2563eb', bg: '#eff6ff' },
            ].filter(r => r.cnt > 0)
            return (
              <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
                <SectionTitle>Uso de contingencia</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {rows.map(r => (
                    <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: r.bg, borderRadius: '7px', border: `0.5px solid ${r.color}33` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: r.color, display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {r.label}
                          {r.active && <span style={{ fontSize: '8px', background: r.color, color: 'white', padding: '0 4px', borderRadius: '3px', fontWeight: 700 }}>ACTIVO</span>}
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginTop: '1px' }}>{r.cnt} {r.cnt === 1 ? 'incidente' : 'incidentes'}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: r.color, fontFamily: 'monospace' }}>{mhm(r.min)}</div>
                        <div style={{ fontSize: '8px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>total</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Historial */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
            <SectionTitle>Historial de cambios</SectionTitle>
            {historial.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '12px 0' }}>Sin cambios registrados</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '340px', overflowY: 'auto' }}>
                {historial.map(h => (
                  <div key={h.id} style={{ borderBottom: '0.5px solid var(--border)', paddingBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
                      <span style={{ fontWeight: 500, color: 'var(--foreground)', fontSize: '10px' }}>{CAMPO_LABELS[h.campoEditado] ?? h.campoEditado}</span>
                      <span style={{ color: 'var(--muted-foreground)', fontSize: '10px' }}>{relTime(h.editadoEn)}</span>
                    </div>
                    <div style={{ color: 'var(--muted-foreground)', display: 'flex', gap: '4px', flexWrap: 'wrap', fontSize: '10px' }}>
                      {h.valorAnterior && <span style={{ textDecoration: 'line-through' }}>{h.valorAnterior}</span>}
                      {h.valorAnterior && h.valorNuevo && <span>→</span>}
                      {h.valorNuevo && <span style={{ color: 'var(--foreground)' }}>{h.valorNuevo}</span>}
                    </div>
                    {h.usuarioNombre && <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginTop: '1px' }}>por {h.usuarioNombre}</div>}
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
