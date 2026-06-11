'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'

const ESTADO_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  BORRADOR:  { label: 'Borrador',  bg: '#F1F5F9', color: '#475569' },
  ACTIVA:    { label: 'Activa',    bg: '#ECFDF5', color: '#065F46' },
  HISTORICA: { label: 'Desactivada', bg: '#F8FAFC', color: '#94A3B8' },
}

function Field({ label, value, editing, name, onChange, type = 'text', textarea = false, defaultValue }: {
  label: string; value: any; editing: boolean; name: string
  onChange: (n: string, v: any) => void; type?: string; textarea?: boolean; defaultValue?: number
}) {
  const isEmpty = value == null || value === ''
  const display = isEmpty ? (defaultValue != null ? String(defaultValue) : '—') : type === 'checkbox' ? (value ? 'Sí' : 'No') : String(value)
  const isDefault = isEmpty && defaultValue != null
  if (!editing) return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: display === '—' ? 'var(--muted-foreground)' : 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {display}
        {isDefault && <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>(por defecto)</span>}
      </div>
    </div>
  )
  if (type === 'checkbox') return (
    <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input type="checkbox" checked={!!value} onChange={e => onChange(name, e.target.checked)} id={name} />
      <label htmlFor={name} style={{ fontSize: '12px', cursor: 'pointer' }}>{label}</label>
    </div>
  )
  if (textarea) return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</label>
      <textarea value={value ?? ''} onChange={e => onChange(name, e.target.value)} rows={3}
        style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--background)', resize: 'vertical', boxSizing: 'border-box' }} />
    </div>
  )
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</label>
      <input type={type} value={value ?? ''} onChange={e => onChange(name, e.target.value)}
        style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--background)', boxSizing: 'border-box' }} />
    </div>
  )
}

export default function FichaDetallePage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState<'contrato' | 'conectividad' | 'niveles'>('contrato')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState<any>(null)
  const [saving, setSaving]   = useState(false)
  const [nivelForm, setNivelForm] = useState<any>(null)
  const [savingNivel, setSavingNivel] = useState(false)

  const loadFicha = useCallback(() => {
    setLoading(true)
    fetch(`/api/fichas/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => { loadFicha() }, [loadFicha])

  function startEdit() {
    setDraft({
      ...data,
      tiempoRespuestaSla:  data.tiempoRespuestaSla  ?? 60,
      tiempoResolucionSla: data.tiempoResolucionSla ?? 90,
    })
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft(null)
  }

  function fieldChange(name: string, value: any) {
    setDraft((prev: any) => ({ ...prev, [name]: value }))
  }

  async function saveEdit() {
    setSaving(true)
    const res = await fetch(`/api/fichas/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
    })
    if (res.ok) { loadFicha(); setEditing(false); setDraft(null) }
    setSaving(false)
  }

  async function cambiarEstado(estado: string) {
    if (!confirm(`¿Cambiar ficha a estado "${ESTADO_CONFIG[estado]?.label ?? estado}"?`)) return
    const res = await fetch(`/api/fichas/${id}/estado`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }),
    })
    if (res.ok) loadFicha()
  }

  async function saveNivel(e: React.FormEvent) {
    e.preventDefault()
    setSavingNivel(true)
    const isEdit = !!nivelForm?.id
    const url = isEdit ? `/api/fichas/${id}/niveles/${nivelForm.id}` : `/api/fichas/${id}/niveles`
    const method = isEdit ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nivelForm),
    })
    if (res.ok) { loadFicha(); setNivelForm(null) }
    setSavingNivel(false)
  }

  async function deleteNivel(nivelId: string) {
    if (!confirm('¿Eliminar este nivel de escalamiento?')) return
    await fetch(`/api/fichas/${id}/niveles/${nivelId}`, { method: 'DELETE' })
    loadFicha()
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)' }}>Cargando...</div>
  if (!data)   return <div style={{ padding: '40px', textAlign: 'center', fontSize: '12px', color: '#DC2626' }}>Ficha no encontrada.</div>

  const est = ESTADO_CONFIG[data.estado] ?? ESTADO_CONFIG.BORRADOR
  const src = editing ? draft : data

  return (
    <div>
      {/* Volver */}
      <button onClick={() => router.push('/gestion-cambios/fichas')}
        style={{ marginBottom: '12px', padding: '5px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
        ← Volver
      </button>

      {/* Breadcrumb */}
      <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={{ cursor: 'pointer', color: 'hsl(221,83%,23%)' }} onClick={() => router.push('/gestion-cambios/fichas')}>Fichas</span>
        <span>/</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{data.codigo}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, fontFamily: 'monospace' }}>{data.codigo}</h1>
            <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, background: est.bg, color: est.color }}>{est.label}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
            <strong style={{ color: 'var(--foreground)' }}>{data.tiendaCodigo}</strong>
            {data.tiendaNombreCc && <span style={{ marginLeft: '6px' }}>{data.tiendaNombreCc}</span>}
            <span style={{ margin: '0 8px', color: 'var(--border)' }}>·</span>
            {data.proveedorNombre}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {data.estado === 'BORRADOR' && (
            <button onClick={() => cambiarEstado('ACTIVA')}
              style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, background: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
              Activar ficha
            </button>
          )}
          {data.estado === 'ACTIVA' && (
            <button onClick={() => cambiarEstado('HISTORICA')}
              style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, background: 'var(--muted)', color: 'var(--muted-foreground)', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer' }}>
              Archivar
            </button>
          )}
          {!editing ? (
            <button onClick={startEdit}
              style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
              Editar
            </button>
          ) : (
            <>
              <button onClick={cancelEdit} disabled={saving}
                style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, background: 'var(--muted)', color: 'var(--muted-foreground)', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={saveEdit} disabled={saving}
                style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, background: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', borderBottom: '0.5px solid var(--border)', marginBottom: '20px' }}>
        {(['contrato', 'conectividad', 'niveles'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); if (t !== tab) { setEditing(false); setDraft(null) } }}
            style={{ padding: '8px 16px', fontSize: '12px', fontWeight: tab === t ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? 'var(--foreground)' : 'var(--muted-foreground)', borderBottom: tab === t ? '2px solid hsl(221,83%,23%)' : '2px solid transparent', transition: 'color 0.15s', textTransform: 'capitalize' }}>
            {t === 'contrato' ? 'Contrato' : t === 'conectividad' ? 'Conectividad' : `Escalamiento (${data.niveles?.length ?? 0})`}
          </button>
        ))}
      </div>

      {/* ── Tab: Contrato ── */}
      {tab === 'contrato' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* KPIs — solo en modo vista */}
          {!editing && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {[
                {
                  label: 'Costo mensual',
                  value: src.costoMensual ? `S/ ${Number(src.costoMensual).toLocaleString('es-PE')}` : '—',
                  color: src.costoMensual ? 'var(--foreground)' : 'var(--muted-foreground)',
                },
                {
                  label: 'SLA Respuesta',
                  value: src.tiempoRespuestaSla ?? 60,
                  suffix: 'min',
                  color: 'hsl(221,83%,23%)',
                  note: !src.tiempoRespuestaSla ? 'por defecto' : undefined,
                },
                {
                  label: 'SLA Resolución',
                  value: src.tiempoResolucionSla ?? 90,
                  suffix: 'min',
                  color: 'hsl(221,83%,23%)',
                  note: !src.tiempoResolucionSla ? 'por defecto' : undefined,
                },
              ].map(k => (
                <div key={k.label} style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{k.label}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                    <span style={{ fontSize: '22px', fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</span>
                    {(k as any).suffix && <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{(k as any).suffix}</span>}
                  </div>
                  {(k as any).note && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontStyle: 'italic', marginTop: '3px' }}>{(k as any).note}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Fila principal: Información + Vigencia */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', paddingBottom: '8px', borderBottom: '0.5px solid var(--border)' }}>Información del contrato</div>
              <Field label="Código de contrato"   value={src.codigoContrato}     editing={editing} name="codigoContrato"     onChange={fieldChange} />
              <Field label="Plan"                 value={src.plan}               editing={editing} name="plan"               onChange={fieldChange} />
              <Field label="Tipo de servicio"     value={src.tipoServicio}       editing={editing} name="tipoServicio"       onChange={fieldChange} />
              <Field label="Velocidad / Capacidad" value={src.velocidadCapacidad} editing={editing} name="velocidadCapacidad" onChange={fieldChange} />
              <Field label="Costo mensual (S/)"   value={src.costoMensual}       editing={editing} name="costoMensual"       onChange={fieldChange} type="number" />
            </div>
            <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', paddingBottom: '8px', borderBottom: '0.5px solid var(--border)' }}>Vigencia</div>
              <Field label="Fecha inicio"          value={src.fechaInicio}          editing={editing} name="fechaInicio"          onChange={fieldChange} type="date" />
              <Field label="Fecha fin"             value={src.fechaFin}             editing={editing} name="fechaFin"             onChange={fieldChange} type="date" />
              <Field label="Renovación automática" value={src.renovacionAutomatica} editing={editing} name="renovacionAutomatica" onChange={fieldChange} type="checkbox" />
            </div>
          </div>

          {/* SLA */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', paddingBottom: '8px', borderBottom: '0.5px solid var(--border)' }}>SLA</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <Field label="SLA comprometido"           value={src.slaComprometido}    editing={editing} name="slaComprometido"    onChange={fieldChange} />
              <Field label="Tiempo respuesta SLA (min)" value={src.tiempoRespuestaSla} editing={editing} name="tiempoRespuestaSla" onChange={fieldChange} type="number" defaultValue={60} />
              <Field label="Tiempo resolución SLA (min)" value={src.tiempoResolucionSla} editing={editing} name="tiempoResolucionSla" onChange={fieldChange} type="number" defaultValue={90} />
              <Field label="Horario atención SLA"       value={src.horarioAtencionSla} editing={editing} name="horarioAtencionSla" onChange={fieldChange} />
            </div>
          </div>

          {/* Documentos */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', paddingBottom: '8px', borderBottom: '0.5px solid var(--border)' }}>Documentos y penalidades</div>
            <Field label="URL documento" value={src.documentoUrl} editing={editing} name="documentoUrl" onChange={fieldChange} />
            <Field label="Penalidad"     value={src.penalidad}    editing={editing} name="penalidad"    onChange={fieldChange} textarea />
          </div>
        </div>
      )}

      {/* ── Tab: Conectividad ── */}
      {tab === 'conectividad' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Fila: Datos técnicos + Estado */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', paddingBottom: '8px', borderBottom: '0.5px solid var(--border)' }}>Datos técnicos</div>
              <Field label="Tipo de conexión"      value={src.tipoConexion}  editing={editing} name="tipoConexion"  onChange={fieldChange} />
              <Field label="CID / Nro. de servicio" value={src.cidServicio}  editing={editing} name="cidServicio"   onChange={fieldChange} />
              <Field label="Velocidad"             value={src.velocidad}     editing={editing} name="velocidad"     onChange={fieldChange} />
              <Field label="Plan aplicado"         value={src.planAplicado}  editing={editing} name="planAplicado"  onChange={fieldChange} />
            </div>
            <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', paddingBottom: '8px', borderBottom: '0.5px solid var(--border)' }}>Estado del servicio</div>
              <Field label="Estado del servicio"   value={src.estadoServicio}    editing={editing} name="estadoServicio"    onChange={fieldChange} />
              <Field label="Fecha alta servicio"   value={src.fechaAltaServicio} editing={editing} name="fechaAltaServicio" onChange={fieldChange} type="date" />
              <Field label="Vigencia del contrato" value={src.vigenciaContrato}  editing={editing} name="vigenciaContrato"  onChange={fieldChange} />
            </div>
          </div>

          {/* Notas */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', paddingBottom: '8px', borderBottom: '0.5px solid var(--border)' }}>Notas</div>
            <Field label="Descripción del servicio" value={src.descripcionServicio} editing={editing} name="descripcionServicio" onChange={fieldChange} textarea />
            <Field label="Observación"              value={src.observacion}         editing={editing} name="observacion"         onChange={fieldChange} textarea />
          </div>
        </div>
      )}

      {/* ── Tab: Niveles de escalamiento ── */}
      {tab === 'niveles' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button onClick={() => setNivelForm({ nivel: (data.niveles?.length ?? 0) + 1, nombreContacto: '', canal: 'correo', activo: true })}
              style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
              + Agregar nivel
            </button>
          </div>

          {/* Modal formulario nivel */}
          {nivelForm && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={e => { if (e.target === e.currentTarget) setNivelForm(null) }}>
              <form onSubmit={saveNivel}
                style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '480px', maxWidth: '95vw', maxHeight: '80vh', overflowY: 'auto' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 16px' }}>{nivelForm.id ? 'Editar nivel' : 'Nuevo nivel'}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '3px' }}>Nivel *</label>
                    <input type="number" required min={1} max={5} value={nivelForm.nivel ?? ''} onChange={e => setNivelForm((p: any) => ({ ...p, nivel: Number(e.target.value) }))}
                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--background)', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '3px' }}>Canal</label>
                    <select value={nivelForm.canal ?? 'correo'} onChange={e => setNivelForm((p: any) => ({ ...p, canal: e.target.value }))}
                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--background)' }}>
                      <option value="correo">Correo</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="telefono">Teléfono</option>
                      <option value="ticket">Ticket</option>
                    </select>
                  </div>
                </div>
                {[
                  { key: 'nombreContacto', label: 'Nombre contacto *', required: true },
                  { key: 'email', label: 'Email' },
                  { key: 'celular', label: 'Celular' },
                  { key: 'whatsapp', label: 'WhatsApp' },
                  { key: 'horarioAtencion', label: 'Horario atención' },
                  { key: 'tiempoRespSev1', label: 'Tiempo resp. SEV1' },
                ].map(f => (
                  <div key={f.key} style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '3px' }}>{f.label}</label>
                    <input type="text" required={f.required} value={(nivelForm[f.key] ?? '')} onChange={e => setNivelForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--background)', boxSizing: 'border-box' }} />
                  </div>
                ))}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '3px' }}>Instrucción</label>
                  <textarea rows={3} value={nivelForm.instruccion ?? ''} onChange={e => setNivelForm((p: any) => ({ ...p, instruccion: e.target.value }))}
                    style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--background)', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <button type="button" onClick={() => setNivelForm(null)}
                    style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, background: 'var(--muted)', color: 'var(--muted-foreground)', border: '0.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={savingNivel}
                    style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 600, background: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                    {savingNivel ? 'Guardando...' : nivelForm.id ? 'Guardar' : 'Agregar'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Lista de niveles */}
          {!data.niveles?.length ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px', border: '1px dashed var(--border)', borderRadius: '10px' }}>
              Sin niveles de escalamiento. Agrega el primero con el botón de arriba.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.niveles.map((n: any) => (
                <div key={n.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ background: 'hsl(221,83%,23%)', color: 'white', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                        N{n.nivel}
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13px' }}>{n.nombreContacto}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                          {[n.email, n.celular, n.whatsapp].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setNivelForm({ ...n })}
                        style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 500, background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}>
                        Editar
                      </button>
                      <button onClick={() => deleteNivel(n.id)}
                        style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 500, background: '#FEF2F2', color: '#991B1B', border: '0.5px solid #FCA5A5', borderRadius: '6px', cursor: 'pointer' }}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                  {(n.canal || n.horarioAtencion || n.tiempoRespSev1) && (
                    <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '11px', color: 'var(--muted-foreground)', flexWrap: 'wrap' }}>
                      {n.canal && <span>Canal: <strong style={{ color: 'var(--foreground)' }}>{n.canal}</strong></span>}
                      {n.horarioAtencion && <span>Horario: <strong style={{ color: 'var(--foreground)' }}>{n.horarioAtencion}</strong></span>}
                      {n.tiempoRespSev1 && <span>SEV1: <strong style={{ color: 'var(--foreground)' }}>{n.tiempoRespSev1}</strong></span>}
                    </div>
                  )}
                  {n.instruccion && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--muted-foreground)', fontStyle: 'italic', borderTop: '0.5px solid var(--border)', paddingTop: '8px' }}>
                      {n.instruccion}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
