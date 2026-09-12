'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiMutate } from '@/lib/api-mutate'
import { can } from '@/lib/permisos'

function fmtSoles(v: string | number | null | undefined) {
  if (v == null || v === '' || Number(v) === 0) return '—'
  return `S/ ${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 0 })}`
}

function slaColor(v: number | null) {
  if (v == null) return 'var(--muted-foreground)'
  if (v >= 80) return 'var(--ok)'
  if (v >= 60) return 'var(--warn)'
  return 'var(--danger)'
}

/** Fondo del badge. Translúcido, NUNCA el color vivo: con el vivo de fondo y
 *  slaColor() de texto, el badge quedaba salmón sobre salmón — ilegible. */
function slaBg(v: number | null) {
  if (v == null) return 'transparent'
  if (v >= 80) return 'var(--ok-bg)'
  if (v >= 60) return 'var(--warn-bg)'
  return 'var(--danger-bg)'
}

function slaBorde(v: number | null) {
  if (v == null) return 'transparent'
  if (v >= 80) return 'var(--ok-border)'
  if (v >= 60) return 'var(--warn-border)'
  return 'var(--danger-border)'
}

/** Mismo patrón que las KPI del dashboard analítico: la tarjeta siempre va sobre
 *  var(--card) y el acento aparece solo en la caja del ícono, el velo de esquina
 *  y la barra de subrayado. El número queda en blanco, legible sobre el navy. */
function KpiProv({ label, value, acento, icono, sub, valorChico }: {
  label: string; value: string; acento: string; icono: string
  sub?: React.ReactNode; valorChico?: boolean
}) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)', padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: '8px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div aria-hidden style={{
        position: 'absolute', top: '-40px', right: '-40px', width: '110px', height: '110px',
        borderRadius: '50%', background: acento, opacity: 0.10, pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 'var(--radius-sm)',
          background: `color-mix(in srgb, ${acento} 14%, transparent)`,
          border: `1px solid color-mix(in srgb, ${acento} 32%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', flexShrink: 0,
        }}>{icono}</div>
        <div style={{ fontSize: '9.5px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1.25 }}>
          {label}
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: valorChico ? '17px' : '22px', fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.1, letterSpacing: '-0.02em', wordBreak: 'break-word' }}>
          {value}
        </div>
        <div style={{ width: '30px', height: '3px', borderRadius: '99px', background: acento, marginTop: '8px', opacity: 0.9 }} />
      </div>

      {sub && <div style={{ fontSize: '9px', color: 'var(--faint-foreground)', position: 'relative' }}>{sub}</div>}
    </div>
  )
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
  borderBottom: '1px solid var(--border)',
  background: 'var(--muted)', whiteSpace: 'nowrap',
}

export default function ProveedoresPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const canEdit = can(session, 'proveedores.editar')

  const [lista, setLista]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ buscar: '', ordenar: '' })
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  const [modal, setModal] = useState(false)
  const [form, setForm]   = useState<any>({})
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filtros.buscar)         p.set('buscar',         filtros.buscar)
    if (filtros.ordenar)        p.set('ordenar',        filtros.ordenar)
    const res = await fetch(`/api/proveedores?${p}`)
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setLista(data)
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
  // Denominador global: sobre cuantos incidentes medibles se calculo.
  const mediblesTotal    = lista.reduce((s, p) => s + (p.slaMedibles ?? 0), 0)
  const peorProveedor    = slaRespValidos.length > 0
    ? slaRespValidos.reduce((prev, cur) => (cur.slaRespuesta ?? 100) < (prev.slaRespuesta ?? 100) ? cur : prev)
    : null

  function setF(k: string, v: any) { setFiltros(f => ({ ...f, [k]: v })) }
  const hayFiltros = filtros.buscar || filtros.ordenar

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
    border: '1px solid var(--border)', borderRadius: '7px',
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
            style={{ padding: '7px 14px', background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
            + Nuevo proveedor
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '10px' }}>
        <KpiProv label="Proveedores"         value={String(totalProveedores)} acento="var(--info)"   icono="🏢" />
        <KpiProv label="Tiendas cubiertas"   value={String(totalTiendas)}     acento="var(--ok)"     icono="🏪" />
        <KpiProv label="Costo mensual total" value={fmtSoles(costoTotal)}     acento="var(--purple)" icono="S/" valorChico />
        <KpiProv
          label="SLA Respuesta 30d"
          value={slaRespGlobal != null ? `${slaRespGlobal}% (${mediblesTotal})` : '—'}
          acento={slaColor(slaRespGlobal)}
          icono="⚡"
          sub={peorProveedor && slaRespGlobal != null && slaRespGlobal < 80
            ? <span style={{ color: 'var(--danger)' }}>Peor: {peorProveedor.nombre} ({peorProveedor.slaRespuesta}%)</span>
            : undefined}
        />
        <KpiProv
          label="SLA Resolución 30d"
          value={slaResolGlobal != null ? `${slaResolGlobal}% (${mediblesTotal})` : '—'}
          acento={slaColor(slaResolGlobal)}
          icono="✓"
        />
        <KpiProv
          label="Incidentes 30d"
          value={String(totalInc30d)}
          acento={totalInc30d > 0 ? 'var(--danger)' : 'var(--muted-foreground)'}
          icono="⚠"
        />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Buscar proveedor..." value={filtros.buscar}
          onChange={e => setF('buscar', e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', minWidth: '200px' }} />
        <select value={filtros.ordenar} onChange={e => setF('ordenar', e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Ordenar: A→Z</option>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {hayFiltros && (
          <button onClick={() => setFiltros({ buscar: '', ordenar: '' })}
            style={{ padding: '6px 12px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
            Limpiar
          </button>
        )}
        <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginLeft: 'auto' }}>
          {lista.length} {lista.length === 1 ? 'proveedor' : 'proveedores'}
        </span>
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '960px', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              <th style={thStyle}>Proveedor</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Tiendas</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Inc. 30d</th>
              <th style={thStyle}>Costo/mes</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>SLA Resp. 30d</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>SLA Resol. 30d</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Tasa resp.</th>
              <th style={thStyle}>Soporte</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ padding: '28px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Cargando...</td></tr>
            )}
            {!loading && lista.length === 0 && (
              <tr><td colSpan={8} style={{ padding: '28px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Sin resultados</td></tr>
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
                    borderBottom: i < lista.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    background: isHov ? 'var(--muted)' : 'transparent',
                  }}>

                  {/* Proveedor */}
                  <td style={{ padding: '10px 12px', minWidth: '160px' }}>
                    <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--foreground)' }}>{p.nombre}</div>
                    <div style={{ display: 'flex', gap: '5px', marginTop: '3px', flexWrap: 'wrap' }}>
                      {(p.planContrato ?? p.planPrincipal) && (
                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'var(--info-bg)', color: 'var(--info)', fontWeight: 600 }}>
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
                        color: incAlta ? 'var(--danger)' : incMedia ? 'var(--warn)' : 'var(--muted-foreground)',
                        background: incAlta ? 'var(--danger-bg)' : incMedia ? 'var(--warn-bg)' : 'transparent',
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
                      <span style={{ fontWeight: 700, fontSize: '12px', color: sColor, background: sBg, border: `1px solid ${slaBorde(p.slaRespuesta)}`, padding: '2px 7px', borderRadius: '999px' }}>
                        {p.slaRespuesta}% <span style={{ fontWeight: 500, opacity: 0.75 }}>({p.slaMedibles})</span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>—</span>
                    )}
                  </td>

                  {/* SLA Resolución */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {p.slaResolucion != null ? (
                      <span style={{ fontWeight: 700, fontSize: '12px', color: sColorR, background: sBgR, border: `1px solid ${slaBorde(p.slaResolucion)}`, padding: '2px 7px', borderRadius: '999px' }}>
                        {p.slaResolucion}% <span style={{ fontWeight: 500, opacity: 0.75 }}>({p.slaMedibles})</span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}>—</span>
                    )}
                  </td>

                  {/* Tasa de respuesta — respondidos / escalamientos evaluables.
                      Es lo que delata al proveedor que nunca contesta: su SLA
                      queda en "—" por no tener nada medible, pero "0/1" si lo dice. */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {p.slaEscalados > 0 ? (
                      <span style={{
                        fontSize: '11px', fontFamily: 'monospace', fontWeight: 600,
                        color: p.slaRespondidos === p.slaEscalados ? 'var(--ok)'
                             : p.slaRespondidos === 0              ? 'var(--danger)'
                             : 'var(--warn)',
                      }}>
                        {p.slaRespondidos}/{p.slaEscalados}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,7,20,0.72)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Nuevo proveedor</div>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {([
                ['nombre',          'Nombre *'],
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
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Instrucción general</label>
                <textarea value={form.instruccionGeneral ?? ''} onChange={e => setForm((f: any) => ({ ...f, instruccionGeneral: e.target.value }))}
                  placeholder="Guía de escalamiento que verá el agente en el '?' al registrar un incidente"
                  style={{ ...inp, minHeight: '60px', resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Observaciones</label>
                <textarea value={form.observaciones ?? ''} onChange={e => setForm((f: any) => ({ ...f, observaciones: e.target.value }))}
                  style={{ ...inp, minHeight: '60px', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button onClick={() => setModal(false)}
                  style={{ padding: '8px 16px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button onClick={handleCreate} disabled={saving || !form.nombre?.trim()}
                  style={{ padding: '8px 16px', background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', opacity: saving || !form.nombre?.trim() ? 0.6 : 1 }}>
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
