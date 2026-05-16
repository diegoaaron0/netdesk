'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

// ── Helpers ────────────────────────────────────────────────────────────────────
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

function estadoBadge(estado: string) {
  const map: Record<string, { bg: string; color: string }> = {
    VIGENTE:    { bg: '#d1fae5', color: '#065f46' },
    POR_VENCER: { bg: '#fef3c7', color: '#92400e' },
    VENCIDO:    { bg: '#fee2e2', color: '#b91c1c' },
  }
  return map[estado] ?? { bg: '#f3f4f6', color: '#6b7280' }
}

const SORT_OPTIONS = [
  { value: 'a-z',            label: 'A → Z' },
  { value: 'z-a',            label: 'Z → A' },
  { value: 'mayor-costo',    label: 'Mayor costo' },
  { value: 'menor-costo',    label: 'Menor costo' },
  { value: 'mas-tiendas',    label: 'Más tiendas' },
  { value: 'mas-incidentes', label: 'Más incidentes' },
]

export default function ProveedoresPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const canEdit = ['SUPERVISOR', 'INFRAESTRUCTURA'].includes((session?.user as any)?.rol ?? '')

  const [lista, setLista]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ buscar: '', tipoServicio: '', estadoContrato: '', plan: '', ordenar: '' })
  const [tiposServicio, setTiposServicio] = useState<string[]>([])
  const [planes, setPlanes] = useState<string[]>([])

  // Modal nuevo proveedor
  const [modal, setModal] = useState(false)
  const [form, setForm]   = useState<any>({})
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filtros.buscar)        p.set('buscar',         filtros.buscar)
    if (filtros.tipoServicio)  p.set('tipoServicio',   filtros.tipoServicio)
    if (filtros.estadoContrato) p.set('estadoContrato', filtros.estadoContrato)
    if (filtros.plan)          p.set('plan',           filtros.plan)
    if (filtros.ordenar)       p.set('ordenar',        filtros.ordenar)
    const res = await fetch(`/api/proveedores?${p}`)
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setLista(data)
    // Collect unique values for selects
    const ts = Array.from(new Set(data.map((d: any) => d.tipoServicio).filter(Boolean))) as string[]
    const pl = Array.from(new Set(data.map((d: any) => d.planContrato ?? d.planPrincipal).filter(Boolean))) as string[]
    setTiposServicio(ts)
    setPlanes(pl)
    setLoading(false)
  }, [filtros])

  useEffect(() => { fetchData() }, [fetchData])

  // Derived cards
  const totalProveedores   = lista.length
  const totalTiendasAsoc   = lista.reduce((s, p) => s + (p.totalTiendas ?? 0), 0)
  const costoTotal         = lista.reduce((s, p) => s + Number(p.costoTotal ?? 0), 0)
  const slaValidos         = lista.filter(p => p.slaPromedio != null)
  const slaPromGlobal      = slaValidos.length > 0 ? Math.round(slaValidos.reduce((s, p) => s + p.slaPromedio, 0) / slaValidos.length) : null
  const contratosVencer    = lista.filter(p => p.estadoContratoCalc === 'POR_VENCER' || p.estadoContratoCalc === 'VENCIDO').length

  function setF(k: string, v: any) { setFiltros(f => ({ ...f, [k]: v })) }

  async function handleCreate() {
    if (!form.nombre?.trim()) return
    setSaving(true)
    await fetch('/api/proveedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setModal(false)
    setForm({})
    fetchData()
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '6px 9px', fontSize: '12px',
    border: '0.5px solid var(--border)', borderRadius: '7px',
    background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
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

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Total proveedores',   value: totalProveedores, color: '#3b82f6', fmt: String },
          { label: 'Tiendas asociadas',   value: totalTiendasAsoc, color: '#10b981', fmt: String },
          { label: 'Costo mensual total', value: costoTotal, color: '#8b5cf6', fmt: (v: number) => fmtSoles(v) },
          { label: 'SLA promedio (30d)',  value: slaPromGlobal, color: slaColor(slaPromGlobal), fmt: (v: number | null) => v != null ? `${v}%` : '—' },
          { label: 'Contratos por vencer', value: contratosVencer, color: contratosVencer > 0 ? '#ef4444' : '#6b7280', fmt: String },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: c.color }}>{(c.fmt as any)(c.value)}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Buscar proveedor..." value={filtros.buscar}
          onChange={e => setF('buscar', e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', minWidth: '200px' }} />

        <select value={filtros.tipoServicio} onChange={e => setF('tipoServicio', e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Tipo de servicio</option>
          {tiposServicio.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={filtros.estadoContrato} onChange={e => setF('estadoContrato', e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Estado contrato</option>
          <option value="VIGENTE">VIGENTE</option>
          <option value="POR_VENCER">POR VENCER</option>
          <option value="VENCIDO">VENCIDO</option>
        </select>

        <select value={filtros.plan} onChange={e => setF('plan', e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Plan</option>
          {planes.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={filtros.ordenar} onChange={e => setF('ordenar', e.target.value)}
          style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}>
          <option value="">Ordenar</option>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {(filtros.buscar || filtros.tipoServicio || filtros.estadoContrato || filtros.plan || filtros.ordenar) && (
          <button onClick={() => setFiltros({ buscar: '', tipoServicio: '', estadoContrato: '', plan: '', ordenar: '' })}
            style={{ padding: '6px 12px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--muted)' }}>
              {['Proveedor', 'Tiendas', 'Plan', 'Costo total', 'SLA (30d)', 'Estado', ''].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Cargando...</td></tr>
            )}
            {!loading && lista.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Sin resultados</td></tr>
            )}
            {!loading && lista.map((p, i) => {
              const est   = estadoBadge(p.estadoContratoCalc)
              const sColor = slaColor(p.slaPromedio)
              return (
                <tr key={p.id}
                  onClick={() => router.push(`/proveedores/${p.id}`)}
                  style={{ borderBottom: i < lista.length - 1 ? '0.5px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>{p.nombre}</div>
                    {p.tipoServicio && (
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--muted)', color: 'var(--muted-foreground)', marginTop: '2px', display: 'inline-block' }}>
                        {p.tipoServicio}
                      </span>
                    )}
                  </td>

                  <td style={{ padding: '10px 12px', color: 'var(--foreground)', fontWeight: 500 }}>
                    {p.totalTiendas}
                  </td>

                  <td style={{ padding: '10px 12px', color: 'var(--muted-foreground)' }}>
                    {p.planContrato ?? p.planPrincipal ?? '—'}
                  </td>

                  <td style={{ padding: '10px 12px', color: 'var(--foreground)', fontFamily: 'monospace', fontSize: '11px' }}>
                    {fmtSoles(p.costoTotal)}
                  </td>

                  <td style={{ padding: '10px 12px' }}>
                    {p.slaPromedio != null ? (
                      <span style={{ fontWeight: 700, color: sColor }}>{p.slaPromedio}%</span>
                    ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                  </td>

                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', background: est.bg, color: est.color }}>
                      {p.estadoContratoCalc}
                    </span>
                  </td>

                  <td style={{ padding: '10px 12px' }}>
                    <button
                      onClick={e => { e.stopPropagation(); router.push(`/proveedores/${p.id}`) }}
                      style={{ padding: '5px 10px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Ver detalle
                    </button>
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
                ['nombre',             'Nombre *'],
                ['tipoServicio',       'Tipo de servicio'],
                ['planPrincipal',      'Plan principal'],
                ['canalAtencion',      'Canal de atención'],
                ['correoSoporte',      'Correo soporte'],
                ['telefonoSoporte',    'Teléfono soporte'],
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
                  style={{ padding: '8px 16px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
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
