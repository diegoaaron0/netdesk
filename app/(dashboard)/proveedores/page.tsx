'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiMutate } from '@/lib/api-mutate'

function fmtSoles(v: string | number | null | undefined) {
  if (v == null || v === '' || Number(v) === 0) return '—'
  return `S/ ${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 0 })}`
}

function slaColor(v: number | null) {
  if (v == null) return '#9ca3af'
  if (v >= 80) return '#16a34a'
  if (v >= 60) return '#d97706'
  return '#dc2626'
}

function slaBg(v: number | null) {
  if (v == null) return 'transparent'
  if (v >= 80) return '#f0fdf4'
  if (v >= 60) return '#fffbeb'
  return '#fef2f2'
}

const SORT_OPTIONS = [
  { value: 'a-z',            label: 'A → Z' },
  { value: 'z-a',            label: 'Z → A' },
  { value: 'mayor-costo',    label: 'Mayor costo' },
  { value: 'menor-costo',    label: 'Menor costo' },
  { value: 'mas-tiendas',    label: 'Más tiendas' },
  { value: 'mas-incidentes', label: 'Más incidentes' },
]

const thStyle: React.CSSProperties = {
  padding: '9px 12px', fontSize: '10px', fontWeight: 700,
  color: 'var(--muted-foreground)', textTransform: 'uppercase',
  letterSpacing: '0.06em', textAlign: 'left',
  borderBottom: '0.5px solid var(--border)',
  background: 'var(--muted)', whiteSpace: 'nowrap',
}

export default function ProveedoresPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const canEdit = ['SUPERVISOR', 'INFRAESTRUCTURA'].includes((session?.user as any)?.rol ?? '')

  const [lista, setLista]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ buscar: '', tipoServicio: '', plan: '', ordenar: '' })
  const [tiposServicio, setTiposServicio] = useState<string[]>([])
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  const [modal, setModal] = useState(false)
  const [form, setForm]   = useState<any>({})
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filtros.buscar)         p.set('buscar',         filtros.buscar)
    if (filtros.tipoServicio)   p.set('tipoServicio',   filtros.tipoServicio)
    if (filtros.plan)           p.set('plan',           filtros.plan)
    if (filtros.ordenar)        p.set('ordenar',        filtros.ordenar)
    const res = await fetch(`/api/proveedores?${p}`)
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setLista(data)
    const ts = Array.from(new Set(data.map((d: any) => d.tipoServicio).filter(Boolean))) as string[]
    setTiposServicio(ts)
    setLoading(false)
  }, [filtros])

  useEffect(() => { fetchData() }, [fetchData])

  const totalProveedores = lista.length
  const totalTiendas     = lista.reduce((s, p) => s + (p.totalTiendas ?? 0), 0)
  const costoTotal       = lista.reduce((s, p) => s + Number(p.costoTotal ?? 0), 0)
  const totalInc30d      = lista.reduce((s, p) => s + (p.incidentes30d ?? 0), 0)
  const slaRespValidos   = lista.filter(p => p.slaRespuesta  != null)
  const slaResolValidos  = lista.filter(p => p.slaResolucion != null)
  const slaRespGlobal    = slaRespValidos.length  > 0 ? Math.round(slaRespValidos.reduce((s, p)  => s + p.slaRespuesta,  0) / slaRespValidos.length)  : null
  const slaResolGlobal   = slaResolValidos.length > 0 ? Math.round(slaResolValidos.reduce((s, p) => s + p.slaResolucion, 0) / slaResolValidos.length) : null
  const peorProveedor    = slaRespValidos.length > 0
    ? slaRespValidos.reduce((prev, cur) => (cur.slaRespuesta ?? 100) < (prev.slaRespuesta ?? 100) ? cur : prev)
    : null

  function setF(k: string, v: any) { setFiltros(f => ({ ...f, [k]: v })) }
  const hayFiltros = filtros.buscar || filtros.tipoServicio || filtros.plan || filtros.ordenar

  async function handleCreate() {
    if (!form.nombre?.trim()) return
    setSaving(true)
    const { ok } = await apiMutate('/api/proveedores', {
      method: 'POST', json: form, errorPrefix: 'No se pudo crear el proveedor',
    })
    setSaving(false)
    if (!ok) return
    setModal(false); setForm({}); fetchData()
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '6px 9px', fontSize: '12px',
    border: '0.5px solid var(--border)', borderRadius: '7px',
    background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Proveedores</h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{lista.length} proveedores</div>
        </div>
        {canEdit && (
          <button onClick={() => { setForm({}); setModal(true) }}
            style={{ padding: '7px 14px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
            + Nuevo proveedor
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '10px' }}>
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#3b82f6' }}>{totalProveedores}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Proveedores</div>
        </div>
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#10b981' }}>{totalTiendas}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Tiendas cubiertas</div>
        </div>
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#8b5cf6', letterSpacing: '-0.02em' }}>{fmtSoles(costoTotal)}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Costo mensual total</div>
        </div>
        <div style={{ background: slaRespGlobal != null ? slaBg(slaRespGlobal) : 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: slaColor(slaRespGlobal) }}>{slaRespGlobal != null ? `${slaRespGlobal}%` : '—'}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>SLA Respuesta 30d</div>
          {peorProveedor && slaRespGlobal != null && slaRespGlobal < 80 && (
            <div style={{ fontSize: '9px', color: '#dc2626', marginTop: '3px' }}>Peor: {peorProveedor.nombre} ({peorProveedor.slaRespuesta}%)</div>
          )}
        </div>
        <div style={{ background: slaResolGlobal != null ? slaBg(slaResolGlobal) : 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: slaColor(slaResolGlobal) }}>{slaResolGlobal != null ? `${slaResolGlobal}%` : '—'}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>SLA Resolución 30d</div>
        </div>
        <div style={{ background: totalInc30d > 0 ? '#fef2f2' : 'var(--card)', border: `0.5px solid ${totalInc30d > 0 ? '#fecaca' : 'var(--border)'}`, borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: totalInc30d > 0 ? '#dc2626' : 'var(--muted-foreground)' }}>{totalInc30d}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Incidentes 30d</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Buscar proveedor..." value={filtros.buscar}
          onChange={e => setF('buscar', e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', minWidth: '200px' }} />
        <select value={filtros.tipoServicio} onChange={e => setF('tipoServicio', e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Tipo de servicio</option>
          {tiposServicio.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filtros.ordenar} onChange={e => setF('ordenar', e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Ordenar: A→Z</option>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {hayFiltros && (
          <button onClick={() => setFiltros({ buscar: '', tipoServicio: '', plan: '', ordenar: '' })}
            style={{ padding: '6px 12px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
            Limpiar
          </button>
        )}
        <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginLeft: 'auto' }}>
          {lista.length} {lista.length === 1 ? 'proveedor' : 'proveedores'}
        </span>
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              <th style={thStyle}>Proveedor</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Tiendas</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Inc. 30d</th>
              <th style={thStyle}>Costo/mes</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>SLA Resp. 30d</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>SLA Resol. 30d</th>
              <th style={thStyle}>Soporte</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ padding: '28px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Cargando...</td></tr>
            )}
            {!loading && lista.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '28px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Sin resultados</td></tr>
            )}
            {!loading && lista.map((p, i) => {
              const sColor = slaColor(p.slaRespuesta)
              const sBg    = slaBg(p.slaRespuesta)
              const sColorR = slaColor(p.slaResolucion)
              const sBgR    = slaBg(p.slaResolucion)
              const isHov  = hoveredRow === p.id
              const incAlta = (p.incidentes30d ?? 0) > 10
              const incMedia = (p.incidentes30d ?? 0) > 3
              return (
                <tr key={p.id}
                  onClick={() => router.push(`/proveedores/${p.id}`)}
                  onMouseEnter={() => setHoveredRow(p.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    borderBottom: i < lista.length - 1 ? '0.5px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    background: isHov ? 'var(--muted)' : 'transparent',
                  }}>

                  {/* Proveedor */}
                  <td style={{ padding: '10px 12px', minWidth: '160px' }}>
                    <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--foreground)' }}>{p.nombre}</div>
                    <div style={{ display: 'flex', gap: '5px', marginTop: '3px', flexWrap: 'wrap' }}>
                      {p.tipoServicio && (
                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'var(--muted)', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {p.tipoServicio}
                        </span>
                      )}
                      {(p.planContrato ?? p.planPrincipal) && (
                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: '#EEF4FF', color: '#185FA5', fontWeight: 600 }}>
                          {p.planContrato ?? p.planPrincipal}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Tiendas */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{ fontWeight: 600, color: p.totalTiendas > 0 ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                      {p.totalTiendas}
                    </span>
                  </td>

                  {/* Incidentes 30d */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {(p.incidentes30d ?? 0) > 0 ? (
                      <span style={{
                        fontWeight: 700, fontSize: '12px',
                        color: incAlta ? '#dc2626' : incMedia ? '#d97706' : '#374151',
                        background: incAlta ? '#fef2f2' : incMedia ? '#fffbeb' : 'transparent',
                        padding: incAlta || incMedia ? '1px 6px' : '0',
                        borderRadius: '4px',
                      }}>
                        {p.incidentes30d}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--muted-foreground)' }}>0</span>
                    )}
                  </td>

                  {/* Costo/mes */}
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--foreground)' }}>
                    <div>{fmtSoles(p.costoTotal)}</div>
                    {p.totalTiendas > 1 && Number(p.costoTotal) > 0 && (
                      <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginTop: '1px' }}>
                        {fmtSoles(Math.round(Number(p.costoTotal) / p.totalTiendas))}/tienda
                      </div>
                    )}
                  </td>

                  {/* SLA Respuesta */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {p.slaRespuesta != null ? (
                      <span style={{ fontWeight: 700, fontSize: '12px', color: sColor, background: sBg, padding: '2px 7px', borderRadius: '5px' }}>
                        {p.slaRespuesta}%
                      </span>
                    ) : (
                      <span style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>—</span>
                    )}
                  </td>

                  {/* SLA Resolución */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {p.slaResolucion != null ? (
                      <span style={{ fontWeight: 700, fontSize: '12px', color: sColorR, background: sBgR, padding: '2px 7px', borderRadius: '5px' }}>
                        {p.slaResolucion}%
                      </span>
                    ) : (
                      <span style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>—</span>
                    )}
                  </td>

                  {/* Soporte */}
                  <td style={{ padding: '10px 12px', fontSize: '11px' }}>
                    {p.telefonoSoporte ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span style={{ color: 'var(--foreground)', fontFamily: 'monospace', fontSize: '10px' }}>{p.telefonoSoporte}</span>
                        {p.correoSoporte && (
                          <span style={{ color: 'var(--muted-foreground)', fontSize: '10px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.correoSoporte}</span>
                        )}
                      </div>
                    ) : p.correoSoporte ? (
                      <span style={{ color: 'var(--muted-foreground)', fontSize: '10px' }}>{p.correoSoporte}</span>
                    ) : (
                      <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal nuevo proveedor */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '14px 18px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Nuevo proveedor</div>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {([
                ['nombre',          'Nombre *'],
                ['tipoServicio',    'Tipo de servicio'],
                ['planPrincipal',   'Plan principal'],
                ['canalAtencion',   'Canal de atención'],
                ['correoSoporte',   'Correo soporte'],
                ['telefonoSoporte', 'Teléfono soporte'],
              ] as [string, string][]).map(([key, label]) => (
                <div key={key}>
                  <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>{label}</label>
                  <input value={form[key] ?? ''} onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))} style={inp} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Observaciones</label>
                <textarea value={form.observaciones ?? ''} onChange={e => setForm((f: any) => ({ ...f, observaciones: e.target.value }))}
                  style={{ ...inp, minHeight: '60px', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button onClick={() => setModal(false)}
                  style={{ padding: '8px 16px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button onClick={handleCreate} disabled={saving || !form.nombre?.trim()}
                  style={{ padding: '8px 16px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', opacity: saving || !form.nombre?.trim() ? 0.6 : 1 }}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
