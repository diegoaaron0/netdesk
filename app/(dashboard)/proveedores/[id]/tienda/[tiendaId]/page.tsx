'use client'
import { useEffect, useState, use } from 'react'
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
    ACTIVO:         { bg: '#d1fae5', color: '#065f46' },
    SUSPENDIDO:     { bg: '#fee2e2', color: '#b91c1c' },
    EN_REVISION:    { bg: '#fef3c7', color: '#92400e' },
    ABIERTO:        { bg: '#dbeafe', color: '#1e40af' },
    EN_SEGUIMIENTO: { bg: '#ede9fe', color: '#7c3aed' },
    RESUELTO:       { bg: '#d1fae5', color: '#065f46' },
    CERRADO:        { bg: '#f3f4f6', color: '#6b7280' },
    CANCELADO:      { bg: '#f3f4f6', color: '#9ca3af' },
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

function fmtMttr(mins: number | null | undefined) {
  if (!mins) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
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

// ── Main ───────────────────────────────────────────────────────────────────────
export default function ServicioTiendaPage({ params }: { params: Promise<{ id: string; tiendaId: string }> }) {
  const { id, tiendaId } = use(params)
  const router = useRouter()

  const [data, setData]               = useState<any>(null)
  const [fichaActiva, setFichaActiva] = useState<any>(null)

  useEffect(() => {
    fetch(`/api/proveedores/${id}/tienda/${tiendaId}`)
      .then(r => r.json())
      .then(d => { if (d.tienda) setData(d) })
  }, [id, tiendaId])

  useEffect(() => {
    fetch(`/api/fichas?tiendaId=${tiendaId}&estado=ACTIVA`)
      .then(r => r.json())
      .then(rows => setFichaActiva(Array.isArray(rows) && rows.length > 0 ? rows[0] : null))
  }, [tiendaId])

  if (!data) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '48px', color: 'var(--muted-foreground)', fontSize: '13px' }}>Cargando...</div>
  }

  const { tienda, contrato, metricas, lastIncidente, historial = [] } = data
  const reincBadge = metricas?.incidentes30d >= 3 ? { bg: '#fee2e2', color: '#b91c1c' }
    : metricas?.incidentes30d === 2 ? { bg: '#fef3c7', color: '#92400e' }
    : { bg: '#d1fae5', color: '#065f46' }

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '4px', fontSize: '11px', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ cursor: 'pointer' }} onClick={() => router.push('/proveedores')}>Proveedores</span>
        <span>›</span>
        <span style={{ cursor: 'pointer' }} onClick={() => router.push(`/proveedores/${id}`)}>{tienda.proveedorNombre ?? '…'}</span>
        <span>›</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--foreground)' }}>{tienda.codigo}</span>
      </div>

      {/* Header */}
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
      </div>

      {/* Main layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>

        {/* Left: datos del servicio */}
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          {/* Header con badge Via Fichas */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '6px', borderBottom: '0.5px solid var(--border)' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Datos del servicio
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: '#EDE9FE', color: '#7C3AED' }}>
                Via Fichas
              </span>
              {fichaActiva
                ? <button onClick={() => router.push(`/gestion-cambios/fichas/${fichaActiva.id}`)}
                    style={{ padding: '2px 8px', fontSize: '10px', fontWeight: 600, border: '0.5px solid #86efac', borderRadius: '4px', background: '#f0fdf4', color: '#166534', cursor: 'pointer' }}>
                    {fichaActiva.codigo}
                  </button>
                : <button onClick={() => router.push(`/gestion-cambios/fichas/nueva?tiendaId=${tiendaId}&proveedorId=${id}`)}
                    style={{ padding: '2px 8px', fontSize: '10px', border: '0.5px solid var(--border)', borderRadius: '4px', background: 'var(--muted)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                    + Nueva ficha
                  </button>
              }
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <div><Label>Tienda</Label><Val v={`${tienda.codigo} — ${tienda.nombreCc ?? ''}`} mono /></div>
            <div><Label>Proveedor</Label><Val v={tienda.proveedorNombre} /></div>
            <div><Label>CID / Servicio</Label><Val v={tienda.cidServicio} mono /></div>
            <div><Label>Tipo conexion</Label><Val v={tienda.tipoConexion} /></div>
            <div><Label>Tipo servicio</Label><Val v={tienda.tipoServicio} /></div>
            <div><Label>Plan aplicado</Label><Val v={tienda.planAplicado} /></div>
            <div><Label>Velocidad</Label><Val v={tienda.velocidad} /></div>
            <div><Label>Vigencia contrato</Label><Val v={tienda.vigenciaContrato} /></div>
            <div><Label>Costo mensual</Label><Val v={fmtSoles(tienda.costoMensual)} /></div>
            <div><Label>SLA comprometido</Label><Val v={contrato?.slaComprometido ?? '—'} /></div>
            <div><Label>Fecha alta servicio</Label><Val v={fmtDate(tienda.fechaAltaServicio)} /></div>
            <div>
              <Label>Estado servicio</Label>
              <div style={{ marginBottom: '10px' }}>
                {(() => {
                  const b = estadoBadge(tienda.estadoServicio ?? 'ACTIVO')
                  return <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px', background: b.bg, color: b.color }}>{tienda.estadoServicio ?? 'ACTIVO'}</span>
                })()}
              </div>
            </div>
            <div><Label>Gabinete</Label><Val v={tienda.gabinete ? 'Si' : tienda.gabinete === false ? 'No' : '—'} /></div>
          </div>
          {tienda.descripcionServicio && (
            <div>
              <Label>Descripcion servicio</Label>
              <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '10px' }}>{tienda.descripcionServicio}</div>
            </div>
          )}
          {tienda.observacion && (
            <div>
              <Label>Observacion</Label>
              <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '10px' }}>{tienda.observacion}</div>
            </div>
          )}
          {tienda.direccion && (
            <div>
              <Label>Direccion</Label>
              <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '10px' }}>
                {tienda.direccion}{tienda.distrito ? `, ${tienda.distrito}` : ''}{tienda.provincia ? ` — ${tienda.provincia}` : ''}
              </div>
            </div>
          )}
          {(tienda.supervisorNombre || tienda.contactoSoporte) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px', borderTop: '0.5px solid var(--border)', paddingTop: '10px', marginTop: '2px' }}>
              {tienda.supervisorNombre && <div><Label>Supervisor</Label><Val v={`${tienda.supervisorNombre}${tienda.supervisorCelular ? ` · ${tienda.supervisorCelular}` : ''}`} /></div>}
              {tienda.contactoSoporte  && <div><Label>Contacto soporte</Label><Val v={tienda.contactoSoporte} /></div>}
            </div>
          )}
        </div>

        {/* Right: rendimiento */}
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <SectionTitle>Rendimiento del proveedor en esta tienda</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[
              { label: 'Incidentes historicos',       value: String(metricas?.incidentesHistoricos ?? 0) },
              { label: 'Incidentes ultimos 30d',      value: String(metricas?.incidentes30d ?? 0) },
              { label: 'MTTR promedio',               value: metricas?.mttrPromFmt ?? '—' },
              { label: 'SLA Respuesta (30d)',         value: metricas?.slaRespuestaTienda  != null ? `${metricas.slaRespuestaTienda}%`  : '—', color: slaColor(metricas?.slaRespuestaTienda  ?? null) },
              { label: 'SLA Resolucion (30d)',        value: metricas?.slaResolucionTienda != null ? `${metricas.slaResolucionTienda}%` : '—', color: slaColor(metricas?.slaResolucionTienda ?? null) },
              { label: 'Tiempo caido total (hist.)',  value: metricas?.tiempoCaidoFmt ?? '—' },
              { label: 'Impacto estimado',            value: metricas?.impactoEstimado != null ? fmtSoles(metricas.impactoEstimado) : '—' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid var(--border)' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{r.label}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: (r as any).color ?? 'var(--foreground)' }}>{r.value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid var(--border)' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Reincidencia (30d)</span>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', background: reincBadge.bg, color: reincBadge.color }}>
                {metricas?.incidentes30d ?? 0} incidentes
              </span>
            </div>
            {lastIncidente && (
              <div style={{ marginTop: '8px', padding: '8px', background: 'var(--muted)', borderRadius: '8px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Ultimo incidente</div>
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

      {/* Comparativa con proveedores anteriores */}
      {(data.proveedoresAnteriores ?? []).length > 0 && (
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '14px' }}>
          <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)' }}>
            <SectionTitle>Comparativa con proveedores anteriores</SectionTitle>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--muted)' }}>
                {['Proveedor', 'Incidentes', 'MTTR prom', 'SLA', 'Ultimo incidente'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: '0.5px solid var(--border)', background: 'color-mix(in srgb, hsl(221,83%,23%) 6%, var(--card))' }}>
                <td style={{ padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>{tienda.proveedorNombre}</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: 'hsl(221,83%,23%)', color: 'white' }}>Actual</span>
                  </div>
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{metricas?.incidentesHistoricos ?? 0}</td>
                <td style={{ padding: '8px 10px' }}>{metricas?.mttrPromFmt ?? '—'}</td>
                <td style={{ padding: '8px 10px', fontWeight: 600, color: slaColor(metricas?.slaTienda ?? null) }}>{metricas?.slaTienda != null ? `${metricas.slaTienda}%` : '—'}</td>
                <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)', fontSize: '11px' }}>{fmtTs(lastIncidente?.horaRegistro)}</td>
              </tr>
              {(data.proveedoresAnteriores ?? []).map((p: any) => (
                <tr key={p.proveedorId} style={{ borderTop: '0.5px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.proveedorNombre ?? '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{p.totalIncidentes}</td>
                  <td style={{ padding: '8px 10px' }}>{fmtMttr(p.mttrPromedio)}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 600, color: slaColor(p.slaPromedio) }}>{p.slaPromedio != null ? `${p.slaPromedio}%` : '—'}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)', fontSize: '11px' }}>{fmtDate(p.ultimoIncidente)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
            <button onClick={() => router.push(`/gestion-cambios/fichas?tiendaId=${tienda.id}`)}
              style={{ padding: '9px 12px', background: 'var(--muted)', border: '0.5px solid var(--border)', color: 'var(--foreground)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', textAlign: 'center' }}>
              Ver fichas
            </button>
          </div>
        </div>

        {/* Historial */}
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)' }}>
            <SectionTitle>Ultimos incidentes con este proveedor</SectionTitle>
          </div>
          {historial.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Sin incidentes registrados</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--muted)' }}>
                  {['Codigo', 'Fecha', 'Tipo', 'MTTR', 'Estado'].map(h => (
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
    </div>
  )
}
