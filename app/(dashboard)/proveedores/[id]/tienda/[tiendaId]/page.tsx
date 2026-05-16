'use client'
import { useEffect, useState, use } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtSoles(v: string | number | null | undefined) {
  if (v == null || v === '' || Number(v) === 0) return '—'
  return `S/ ${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 0 })}`
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtTs(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function estadoBadge(est: string | null | undefined) {
  const m: Record<string, { bg: string; color: string }> = {
    ACTIVO:      { bg: '#d1fae5', color: '#065f46' },
    SUSPENDIDO:  { bg: '#fee2e2', color: '#b91c1c' },
    EN_REVISION: { bg: '#fef3c7', color: '#92400e' },
    ABIERTO:     { bg: '#dbeafe', color: '#1e40af' },
    EN_SEGUIMIENTO: { bg: '#ede9fe', color: '#7c3aed' },
    RESUELTO:    { bg: '#d1fae5', color: '#065f46' },
    CERRADO:     { bg: '#f3f4f6', color: '#6b7280' },
    CANCELADO:   { bg: '#f3f4f6', color: '#9ca3af' },
  }
  return m[est ?? ''] ?? { bg: '#f3f4f6', color: '#6b7280' }
}

function tipoLabel(t: string | null | undefined) {
  const m: Record<string, string> = {
    CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
    LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
  }
  return m[t ?? ''] ?? t ?? '—'
}

function slaColor(v: number | null) {
  if (v == null) return '#9ca3af'
  if (v >= 80) return '#16a34a'
  if (v >= 60) return '#d97706'
  return '#dc2626'
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{children}</div>
}

function Val({ v, mono }: { v: string | null | undefined; mono?: boolean }) {
  return <div style={{ fontSize: '12px', color: v ? 'var(--foreground)' : 'var(--muted-foreground)', fontFamily: mono ? 'monospace' : undefined, marginBottom: '10px' }}>{v || '—'}</div>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', paddingBottom: '6px', borderBottom: '0.5px solid var(--border)' }}>{children}</div>
}

const INP: React.CSSProperties = {
  width: '100%', padding: '6px 9px', fontSize: '12px',
  border: '0.5px solid var(--border)', borderRadius: '7px',
  background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box',
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function ServicioTiendaPage({ params }: { params: Promise<{ id: string; tiendaId: string }> }) {
  const { id, tiendaId } = use(params)
  const router = useRouter()
  const { data: session } = useSession()
  const canEdit = ['SUPERVISOR', 'INFRAESTRUCTURA'].includes((session?.user as any)?.rol ?? '')

  const [data, setData]   = useState<any>(null)
  const [editModal, setEditModal] = useState(false)
  const [editForm, setEditForm]   = useState<any>({})
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    fetch(`/api/proveedores/${id}/tienda/${tiendaId}`)
      .then(r => r.json())
      .then(d => { if (d.tienda) setData(d) })
  }, [id, tiendaId])

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/tiendas/${tiendaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setSaving(false)
    setEditModal(false)
    fetch(`/api/proveedores/${id}/tienda/${tiendaId}`).then(r => r.json()).then(d => { if (d.tienda) setData(d) })
  }

  if (!data) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '48px', color: 'var(--muted-foreground)', fontSize: '13px' }}>Cargando...</div>
  }

  const { tienda, contrato, metricas, lastIncidente, historial = [] } = data
  const reincBadge = metricas?.incidentes30d >= 3 ? { bg: '#fee2e2', color: '#b91c1c' }
    : metricas?.incidentes30d === 2 ? { bg: '#fef3c7', color: '#92400e' }
    : { bg: '#d1fae5', color: '#065f46' }

  return (
    <div>
      {/* Breadcrumb + header */}
      <div style={{ marginBottom: '4px', fontSize: '11px', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ cursor: 'pointer' }} onClick={() => router.push('/proveedores')}>Proveedores</span>
        <span>›</span>
        <span style={{ cursor: 'pointer' }} onClick={() => router.push(`/proveedores/${id}`)}>{tienda.proveedorNombre ?? '…'}</span>
        <span>›</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--foreground)' }}>{tienda.codigo}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
        <button onClick={() => router.push(`/proveedores/${id}`)}
          style={{ padding: '6px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer', whiteSpace: 'nowrap', marginTop: '2px' }}>
          ← Volver
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>
            {tienda.proveedorNombre} en <span style={{ fontFamily: 'monospace' }}>{tienda.codigo}</span>
            {tienda.nombreCc ? ` — ${tienda.nombreCc}` : ''}
          </h1>
        </div>
        {canEdit && (
          <button onClick={() => { setEditForm({ ...tienda }); setEditModal(true) }}
            style={{ padding: '7px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer', whiteSpace: 'nowrap', marginTop: '2px' }}>
            Editar servicio
          </button>
        )}
      </div>

      {/* Main layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>

        {/* Left: datos del servicio */}
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <SectionTitle>Datos del servicio</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <div><Label>Tienda</Label><Val v={`${tienda.codigo} — ${tienda.nombreCc ?? ''}`} mono /></div>
            <div><Label>Proveedor</Label><Val v={tienda.proveedorNombre} /></div>
            <div><Label>CID / Servicio</Label><Val v={tienda.cidServicio} mono /></div>
            <div><Label>Tipo conexión</Label><Val v={tienda.tipoConexion} /></div>
            <div><Label>Tipo servicio</Label><Val v={tienda.tipoServicio} /></div>
            <div><Label>Plan aplicado</Label><Val v={tienda.planAplicado} /></div>
            <div><Label>Velocidad</Label><Val v={tienda.velocidad} /></div>
            <div><Label>Costo mensual</Label><Val v={fmtSoles(tienda.costoMensual)} /></div>
            <div><Label>SLA comprometido</Label><Val v={contrato?.slaComprometido ?? '—'} /></div>
            <div><Label>Fecha alta servicio</Label><Val v={fmtDate(tienda.fechaAltaServicio)} /></div>
            <div>
              <Label>Estado servicio</Label>
              <div style={{ marginBottom: '10px' }}>
                {(() => { const b = estadoBadge(tienda.estadoServicio ?? 'ACTIVO'); return <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px', background: b.bg, color: b.color }}>{tienda.estadoServicio ?? 'ACTIVO'}</span> })()}
              </div>
            </div>
          </div>
          {tienda.direccion && (
            <div>
              <Label>Dirección</Label>
              <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '10px' }}>{tienda.direccion}{tienda.distrito ? `, ${tienda.distrito}` : ''}</div>
            </div>
          )}
        </div>

        {/* Right: rendimiento */}
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <SectionTitle>Rendimiento del proveedor en esta tienda</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[
              { label: 'Incidentes históricos',   value: String(metricas?.incidentesHistoricos ?? 0) },
              { label: 'Incidentes últimos 30d',  value: String(metricas?.incidentes30d ?? 0) },
              { label: 'MTTR promedio',            value: metricas?.mttrPromFmt ?? '—' },
              { label: 'SLA cumplimiento (30d)',   value: metricas?.slaTienda != null ? `${metricas.slaTienda}%` : '—', color: slaColor(metricas?.slaTienda) },
              { label: 'Tiempo caído acumulado',  value: metricas?.tiempoCaidoFmt ?? '—' },
              { label: 'Impacto estimado',         value: metricas?.impactoEstimado != null ? fmtSoles(metricas.impactoEstimado) : '—' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid var(--border)' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{r.label}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: (r as any).color ?? 'var(--foreground)' }}>{r.value}</span>
              </div>
            ))}
            {/* Reincidencia */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid var(--border)' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Reincidencia (30d)</span>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', background: reincBadge.bg, color: reincBadge.color }}>
                {metricas?.incidentes30d ?? 0} incidentes
              </span>
            </div>
            {/* Último incidente */}
            {lastIncidente && (
              <div style={{ marginTop: '8px', padding: '8px', background: 'var(--muted)', borderRadius: '8px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Último incidente</div>
                <div style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'monospace' }}>{lastIncidente.codigo}</div>
                <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{tipoLabel(lastIncidente.tipo)} · {fmtTs(lastIncidente.horaRegistro)}</div>
                <div style={{ marginTop: '3px' }}>
                  {(() => { const b = estadoBadge(lastIncidente.estado); return <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: b.bg, color: b.color }}>{lastIncidente.estado}</span> })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Acciones + Historial */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '14px', alignItems: 'start' }}>

        {/* Acciones */}
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
          <SectionTitle>Acciones</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <a href={`/incidentes/nuevo?tiendaId=${tienda.id}`}
              style={{ display: 'block', padding: '9px 12px', background: 'hsl(221,83%,23%)', color: 'white', borderRadius: '8px', fontSize: '12px', fontWeight: 500, textDecoration: 'none', textAlign: 'center' }}>
              + Crear incidente
            </a>
            <a href={`/incidentes?tiendaId=${tienda.id}&proveedorId=${tienda.proveedorId}`}
              style={{ display: 'block', padding: '9px 12px', background: 'var(--muted)', border: '0.5px solid var(--border)', color: 'var(--foreground)', borderRadius: '8px', fontSize: '12px', textDecoration: 'none', textAlign: 'center' }}>
              Ver incidentes
            </a>
            <button onClick={() => router.push(`/proveedores/${id}?tab=contrato`)}
              style={{ padding: '9px 12px', background: 'var(--muted)', border: '0.5px solid var(--border)', color: 'var(--foreground)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', textAlign: 'center' }}>
              Ver contrato
            </button>
          </div>
        </div>

        {/* Historial */}
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)' }}>
            <SectionTitle>Últimos incidentes con este proveedor</SectionTitle>
          </div>
          {historial.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Sin incidentes registrados</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--muted)' }}>
                  {['Código', 'Fecha', 'Tipo', 'MTTR', 'Estado'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historial.map((inc: any, i: number) => {
                  const eb = estadoBadge(inc.estado)
                  return (
                    <tr key={inc.id}
                      style={{ borderTop: '0.5px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => router.push(`/incidentes/${inc.id}`)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600, fontSize: '11px' }}>{inc.codigo}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)', fontSize: '11px' }}>{fmtTs(inc.horaRegistro)}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px' }}>{tipoLabel(inc.tipo)}</td>
                      <td style={{ padding: '8px 10px', fontSize: '11px' }}>{inc.mttrMinutos ? `${inc.mttrMinutos}m` : '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: eb.bg, color: eb.color }}>{inc.estado}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal editar servicio */}
      {editModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '14px 18px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Editar servicio — {tienda.codigo}</div>
              <button onClick={() => setEditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
            </div>
            <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              {([
                ['cidServicio',   'CID / Servicio'],
                ['tipoConexion',  'Tipo conexión'],
                ['tipoServicio',  'Tipo servicio'],
                ['planAplicado',  'Plan aplicado'],
                ['velocidad',     'Velocidad'],
                ['costoMensual',  'Costo mensual (S/.)'],
              ] as [string, string][]).map(([k, l]) => (
                <div key={k} style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>{l}</label>
                  <input value={editForm[k] ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, [k]: e.target.value }))} style={INP} />
                </div>
              ))}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Fecha alta servicio</label>
                <input type="date" value={editForm.fechaAltaServicio ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, fechaAltaServicio: e.target.value || null }))} style={INP} />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>Estado servicio</label>
                <select value={editForm.estadoServicio ?? 'ACTIVO'} onChange={e => setEditForm((f: any) => ({ ...f, estadoServicio: e.target.value }))} style={INP}>
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="SUSPENDIDO">SUSPENDIDO</option>
                  <option value="EN_REVISION">EN REVISIÓN</option>
                </select>
              </div>
            </div>
            <div style={{ padding: '0 18px 16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditModal(false)}
                style={{ padding: '8px 16px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '8px 16px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
