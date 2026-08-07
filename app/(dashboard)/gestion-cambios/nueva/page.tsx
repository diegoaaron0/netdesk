'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TIPO_LABELS, TIPOS_CON_PROVEEDOR } from '@/lib/gestion-cambios-config'

const inp: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: '12px',
  border: '0.5px solid var(--border)', borderRadius: '7px',
  background: 'var(--background)', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '10px', fontWeight: 600,
  color: 'var(--muted-foreground)', textTransform: 'uppercase',
  letterSpacing: '0.07em', marginBottom: '4px',
}

function NuevaAccionForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')          // si viene, estamos EDITANDO un borrador
  const isEdit = !!editId

  const [tipo,      setTipo]      = useState('CAMBIO_CONTRATO')
  const [alcance,   setAlcance]   = useState<'TIENDA'|'ZONA'>('TIENDA')
  const [titulo,    setTitulo]    = useState('')
  const [motivo,    setMotivo]    = useState('')
  const [desc,      setDesc]      = useState('')
  const [tiendaId,  setTiendaId]  = useState('')
  const [tiendaIds, setTiendaIds] = useState<string[]>([])
  const [zonaDesc,  setZonaDesc]  = useState('')
  const [provAntId, setProvAntId] = useState('')
  const [provNvoId, setProvNvoId] = useState('')
  const [fechaPlan, setFechaPlan] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  const [tiendas,    setTiendas]    = useState<any[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [snap,       setSnap]       = useState<any>(null)
  const [snapLoading, setSnapLoading] = useState(false)

  useEffect(() => {
    fetch('/api/tiendas').then(r => r.json()).then(d => setTiendas(Array.isArray(d) ? d : []))
    fetch('/api/proveedores').then(r => r.json()).then(d => setProveedores(Array.isArray(d) ? d : []))
  }, [])

  // Modo edición: cargar el borrador y precargar todos los campos
  useEffect(() => {
    if (!editId) return
    fetch(`/api/gestion-cambios/${editId}`)
      .then(r => r.json())
      .then(d => {
        if (!d?.id) return
        if (d.estado !== 'BORRADOR') { setError('Solo se pueden editar acciones en estado Borrador'); return }
        setTipo(d.tipo ?? 'CAMBIO_CONTRATO')
        setAlcance(d.alcance === 'ZONA' ? 'ZONA' : 'TIENDA')
        setTitulo(d.titulo ?? '')
        setMotivo(d.motivo ?? '')
        setDesc(d.descripcion ?? '')
        setTiendaId(d.tiendaId ?? '')
        setZonaDesc(d.zonaDescripcion ?? '')
        setProvAntId(d.proveedorAnteriorId ?? '')
        setProvNvoId(d.proveedorNuevoId ?? '')
        setFechaPlan(d.fechaEjecucionPlanificada ?? '')
        if (Array.isArray(d.tiendasScope)) setTiendaIds(d.tiendasScope.map((t: any) => t.tiendaId))
      })
      .catch(() => setError('No se pudo cargar la acción a editar'))
  }, [editId])

  // Auto-cargar snapshot cuando se selecciona tienda y auto-rellenar proveedor anterior
  useEffect(() => {
    if (!tiendaId || alcance !== 'TIENDA') { setSnap(null); return }
    setSnapLoading(true)
    fetch(`/api/gestion-cambios/snap?tiendaId=${tiendaId}&dias=90`)
      .then(r => r.json())
      .then(d => {
        setSnap(d)
        // Auto-rellenar proveedor anterior si aplica
        if (d.proveedorId && TIPOS_CON_PROVEEDOR.has(tipo) && !provAntId) {
          setProvAntId(d.proveedorId)
        }
      })
      .catch(() => setSnap(null))
      .finally(() => setSnapLoading(false))
  }, [tiendaId, alcance])

  function toggleTiendaZona(id: string) {
    setTiendaIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Todos los campos son obligatorios (la descripción adicional es lo único opcional)
    if (!titulo.trim() || !motivo.trim()) { setError('Completa título y motivo'); return }
    if (alcance === 'TIENDA' && !tiendaId) { setError('Selecciona una tienda'); return }
    if (alcance === 'ZONA' && (tiendaIds.length === 0 || !zonaDesc.trim())) { setError('Indica el nombre de la zona y al menos una tienda'); return }
    if (TIPOS_CON_PROVEEDOR.has(tipo) && (!provAntId || !provNvoId)) { setError('Indica el proveedor anterior y el nuevo'); return }
    if (!fechaPlan) { setError('Indica la fecha de ejecución planificada'); return }

    setSaving(true); setError('')
    const body: any = {
      tipo, titulo: titulo.trim(), motivo: motivo.trim(),
      descripcion: desc.trim() || null,
      alcance,
      fechaEjecucionPlanificada: fechaPlan || null,
      proveedorAnteriorId: provAntId || null,
      proveedorNuevoId:    provNvoId || null,
      tiendaId:        alcance === 'TIENDA' ? tiendaId : null,
      tiendaIds:       alcance === 'ZONA'   ? tiendaIds : [],
      zonaDescripcion: alcance === 'ZONA'   ? (zonaDesc.trim() || null) : null,
    }
    if (alcance === 'TIENDA' && snap) {
      body.snapPeriodoDias  = 90
      body.snapSlaPct       = snap.slaRespuestaPct
      body.snapMttrMin      = snap.mttrMin
      body.snapIei          = snap.ieiAcumulado
      body.snapNincidentes  = snap.totalIncidentes
      body.snapDetalle      = snap
    }

    const res = await fetch(isEdit ? `/api/gestion-cambios/${editId}` : '/api/gestion-cambios', {
      method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? `Error ${res.status}`); setSaving(false); return }
    router.push(`/gestion-cambios/${isEdit ? editId : data.id}`)
  }

  const tiendaSeleccionada = tiendas.find(t => t.id === tiendaId)

  return (
    <div style={{ padding: '20px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: '18px', lineHeight: 1 }}>←</button>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{isEdit ? 'Editar acción de gestión' : 'Nueva acción de gestión'}</h1>
          <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '2px 0 0' }}>{isEdit ? 'Editando un borrador' : 'Se guardará como Borrador'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Tipo */}
          <div>
            <label style={lbl}>Tipo de acción</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={inp} required>
              {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {/* Título */}
          <div>
            <label style={lbl}>Título</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Migración T40 de BITEL a CLARO por cobertura" style={inp} required />
          </div>

          {/* Motivo */}
          <div>
            <label style={lbl}>Motivo / justificación</label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Describe el motivo técnico u operativo de esta acción…"
              rows={3} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} required />
          </div>

          {/* Descripción adicional */}
          <div>
            <label style={lbl}>Descripción adicional (opcional)</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Detalles adicionales, contexto, adjuntos referenciados…"
              rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          {/* Alcance */}
          <div>
            <label style={lbl}>Alcance</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['TIENDA', 'ZONA'] as const).map(a => (
                <button key={a} type="button" onClick={() => setAlcance(a)}
                  style={{ padding: '7px 18px', fontSize: '12px', borderRadius: '7px', fontWeight: alcance === a ? 700 : 400, border: `1px solid ${alcance === a ? 'hsl(221,83%,23%)' : 'var(--border)'}`, background: alcance === a ? 'hsl(221,83%,23%)' : 'var(--card)', color: alcance === a ? 'white' : 'var(--foreground)', cursor: 'pointer' }}>
                  {a === 'TIENDA' ? 'Tienda individual' : 'Zona geográfica'}
                </button>
              ))}
            </div>
          </div>

          {/* Selección de tienda(s) */}
          {alcance === 'TIENDA' ? (
            <div>
              <label style={lbl}>Tienda</label>
              <select value={tiendaId} onChange={e => setTiendaId(e.target.value)} style={inp} required>
                <option value="">— Seleccionar tienda —</option>
                {tiendas.map(t => <option key={t.id} value={t.id}>{t.codigo} — {t.nombre_cc} ({t.distrito})</option>)}
              </select>
              {snapLoading && <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '6px' }}>Cargando métricas de la tienda…</div>}
              {snap && !snapLoading && (
                <div style={{ marginTop: '10px', background: 'var(--muted)', borderRadius: '8px', padding: '12px', fontSize: '11px' }}>
                  {/* Proveedor actual y contrato */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
                    <div>
                      <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Proveedor actual</span>
                      <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '1px' }}>{snap.proveedorNombre ?? '—'}</div>
                      {snap.contratoPlan && <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{snap.contratoPlan}</div>}
                    </div>
                    {(snap.contratoSlaRespuestaMin || snap.contratoSlaResolucionMin) && (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>SLA contractual</span>
                        <div style={{ fontSize: '11px', fontWeight: 600, marginTop: '1px' }}>
                          {snap.contratoSlaRespuestaMin && <span>Respuesta: {snap.contratoSlaRespuestaMin} min</span>}
                          {snap.contratoSlaResolucionMin && <span style={{ marginLeft: '8px' }}>Resolución: {snap.contratoSlaResolucionMin} min</span>}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Métricas del período */}
                  <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
                    Desempeño — {snap.periodoEvaluado}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                    {[
                      { label: 'SLA cumplido',  value: `${snap.slaRespuestaPct}%`,     alert: snap.slaRespuestaPct < 80 },
                      { label: 'MTTR prom.',     value: snap.mttrMin != null ? `${snap.mttrMin} min` : '—', alert: snap.mttrMin != null && snap.mttrMin > 90 },
                      { label: 'IEI acumulado',  value: snap.ieiAcumulado > 0 ? `S/ ${Number(snap.ieiAcumulado).toLocaleString('es-PE', { maximumFractionDigits: 0 })}` : '—', alert: false },
                      { label: 'Incidentes',     value: snap.totalIncidentes, alert: false },
                    ].map(({ label, value, alert }) => (
                      <div key={label} style={{ background: 'var(--card)', borderRadius: '6px', padding: '8px 10px', border: alert ? '1px solid #FCA5A5' : 'none' }}>
                        <div style={{ fontSize: '9px', color: alert ? '#991B1B' : 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>{label}</div>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: alert ? '#991B1B' : 'var(--foreground)' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {snap.penalidadEstimada > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#B45309', background: '#FFFBEB', borderRadius: '6px', padding: '6px 10px' }}>
                      Penalidad por SLA vencido (base nota de crédito): <strong>S/ {Number(snap.penalidadEstimada).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: '8px' }}>
                <label style={lbl}>Nombre de la zona</label>
                <input value={zonaDesc} onChange={e => setZonaDesc(e.target.value)} placeholder="Ej: Lima Norte, Zona Selva, Cluster A" style={inp} />
              </div>
              <label style={lbl}>Tiendas de la zona ({tiendaIds.length} seleccionadas)</label>
              <div style={{ border: '0.5px solid var(--border)', borderRadius: '7px', maxHeight: '200px', overflowY: 'auto', background: 'var(--background)' }}>
                {tiendas.map(t => (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: 'pointer', borderBottom: '0.5px solid var(--border)', fontSize: '12px' }}>
                    <input type="checkbox" checked={tiendaIds.includes(t.id)} onChange={() => toggleTiendaZona(t.id)} />
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{t.codigo}</span>
                    <span style={{ color: 'var(--muted-foreground)' }}>{t.nombre_cc} · {t.distrito}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Proveedores (para tipos relevantes) */}
          {TIPOS_CON_PROVEEDOR.has(tipo) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={lbl}>Proveedor anterior</label>
                <select value={provAntId} onChange={e => setProvAntId(e.target.value)} style={inp}>
                  <option value="">— Sin especificar —</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Proveedor nuevo</label>
                <select value={provNvoId} onChange={e => setProvNvoId(e.target.value)} style={inp}>
                  <option value="">— Sin especificar —</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Fecha planificada */}
          <div>
            <label style={lbl}>Fecha de ejecución planificada</label>
            <input type="date" value={fechaPlan} onChange={e => setFechaPlan(e.target.value)} style={{ ...inp, width: 'auto' }} />
          </div>

          {error && (
            <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '7px', padding: '8px 12px', fontSize: '12px', color: '#991B1B' }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button type="button" onClick={() => router.back()}
              style={{ padding: '8px 18px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: '8px 20px', fontSize: '12px', fontWeight: 600, background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '7px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar borrador'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default function NuevaAccionPage() {
  return (
    <Suspense fallback={null}>
      <NuevaAccionForm />
    </Suspense>
  )
}
