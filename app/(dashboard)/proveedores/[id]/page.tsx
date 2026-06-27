'use client'
import { useEffect, useState, use, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { apiMutate } from '@/lib/api-mutate'
import { categoriaContrato, metaEstadoContrato, diasParaVencer, type CategoriaContrato } from '@/lib/contrato-estado'
// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtSoles(v: string | number | null | undefined) {
  if (v == null || v === '' || Number(v) === 0) return '—'
  return `S/ ${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 0 })}`
}

function fmtMttr(mins: number | null | undefined): string {
  if (!mins) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function slaColor(v: number | null) {
  if (v == null) return '#9ca3af'
  if (v >= 80) return '#16a34a'
  if (v >= 60) return '#d97706'
  return '#dc2626'
}

const INP: React.CSSProperties = {
  width: '100%', padding: '6px 9px', fontSize: '12px',
  border: '0.5px solid var(--border)', borderRadius: '7px',
  background: 'var(--card)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box',
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>
      {children}
    </div>
  )
}

function Val({ v, mono }: { v: string | null | undefined; mono?: boolean }) {
  return (
    <div style={{ fontSize: '12px', color: v ? 'var(--foreground)' : 'var(--muted-foreground)', fontFamily: mono ? 'monospace' : undefined, marginBottom: '10px' }}>
      {v || '—'}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', paddingBottom: '6px', borderBottom: '0.5px solid var(--border)' }}>
      {children}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function ProveedorDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: session } = useSession()
  const canEdit = ['SUPERVISOR', 'INFRAESTRUCTURA'].includes((session?.user as any)?.rol ?? '')

  const [data, setData]   = useState<any>(null)
  const [tab, setTab]     = useState<'resumen' | 'tiendas' | 'historicas'>('resumen')
  const [ieiPanelOpen, setIeiPanelOpen] = useState(false)
  const [panelMetrica, setPanelMetrica] = useState<string | null>(null)
  const [buscarT, setBuscarT] = useState('')
  const [filtroVenc, setFiltroVenc] = useState<'TODAS' | CategoriaContrato>('TODAS')
  const [ordenVenc, setOrdenVenc]   = useState(false) // true = próximas a vencer primero

  // Edit proveedor modal
  const [editProv, setEditProv]     = useState(false)
  const [editForm, setEditForm]     = useState<any>({})
  const [savingP, setSavingP]       = useState(false)

  // Tiendas
  const [tiendas, setTiendas]     = useState<any[]>([])
  const [loadingT, setLoadingT]   = useState(false)

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/proveedores/${id}`)
    if (!res.ok) return
    const d = await res.json()
    setData(d)
  }, [id])

  const loadTiendas = useCallback(async () => {
    setLoadingT(true)
    const res = await fetch(`/api/proveedores/${id}/tiendas`)
    if (res.ok) setTiendas(await res.json())
    setLoadingT(false)
  }, [id])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { if (tab === 'tiendas') loadTiendas() }, [tab, loadTiendas])

  // ── Save proveedor ──────────────────────────────────────────────────────────
  async function saveProv() {
    setSavingP(true)
    const { ok } = await apiMutate(`/api/proveedores/${id}`, {
      method: 'PUT',
      json: editForm,
      errorPrefix: 'No se pudo guardar el proveedor',
    })
    setSavingP(false)
    if (!ok) return
    setEditProv(false)
    loadData()
  }

  if (!data) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '48px', color: 'var(--muted-foreground)', fontSize: '13px' }}>Cargando...</div>
  }

  const { metricas, niveles = [] } = data
  const tiendasFiltradas = tiendas
    .filter(t => {
      if (buscarT) {
        const q = buscarT.toLowerCase()
        if (!(t.codigo?.toLowerCase().includes(q) || t.nombreCc?.toLowerCase().includes(q))) return false
      }
      if (filtroVenc !== 'TODAS' && categoriaContrato(t.estadoContrato) !== filtroVenc) return false
      return true
    })
    .sort((a, b) => {
      if (!ordenVenc) return 0
      const da = diasParaVencer(a.vencimientoFicha)
      const db = diasParaVencer(b.vencimientoFicha)
      if (da === null && db === null) return 0
      if (da === null) return 1   // sin fecha al final
      if (db === null) return -1
      return da - db              // menos días (vencida / más cerca) primero
    })

  const nivelContacto = niveles.find((n: any) => n.nivel === 1)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
        <button onClick={() => router.push('/proveedores')}
          style={{ padding: '6px 12px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer', whiteSpace: 'nowrap', marginTop: '2px' }}>
          ← Volver
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '20px', fontWeight: 700 }}>{data.nombre}</span>
            {data.tipoServicio && (
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '5px', background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{data.tipoServicio}</span>
            )}
          </div>
          {data.correoSoporte && <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{data.correoSoporte}{data.telefonoSoporte ? ` · ${data.telefonoSoporte}` : ''}</div>}
        </div>
        {canEdit && (
          <button onClick={() => { setEditForm({ ...data }); setEditProv(true) }}
            style={{ padding: '7px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer', whiteSpace: 'nowrap', marginTop: '2px' }}>
            Editar proveedor
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', borderBottom: '0.5px solid var(--border)', marginBottom: '16px' }}>
        {([
          { id: 'resumen',    label: 'Resumen' },
          { id: 'tiendas',    label: 'Tiendas asignadas' },
          { id: 'historicas', label: 'Históricas' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            style={{ padding: '8px 16px', fontSize: '12px', fontWeight: tab === t.id ? 600 : 400, background: 'none', border: 'none', cursor: 'pointer', color: tab === t.id ? 'var(--foreground)' : 'var(--muted-foreground)', borderBottom: tab === t.id ? '2px solid hsl(221,83%,23%)' : '2px solid transparent', transition: 'color 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Resumen ─────────────────────────────────────────────────────── */}
      {tab === 'resumen' && (
        <>
          {/* KPI chips */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
            {[
              { label: 'Tiendas asignadas', value: String(metricas?.totalTiendas ?? 0), color: 'hsl(221,83%,23%)' },
              { label: 'SLA Respuesta 30d', value: metricas?.scoreRespuestaPromedio  != null ? `${metricas.scoreRespuestaPromedio}%`  : '—', color: slaColor(metricas?.scoreRespuestaPromedio  ?? null) },
              { label: 'SLA Resolución 30d', value: metricas?.scoreResolucionPromedio != null ? `${metricas.scoreResolucionPromedio}%` : '—', color: slaColor(metricas?.scoreResolucionPromedio ?? null) },
              { label: 'Incidentes 30d', value: String(metricas?.incidentes30d ?? 0), color: (metricas?.incidentes30d ?? 0) > 0 ? '#b45309' : '#6b7280' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{k.label}</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px' }}>
          {/* Left */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <SectionTitle>Información general</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <div><Label>Nombre</Label><Val v={data.nombre} /></div>
              <div><Label>Tipo de servicio</Label><Val v={data.tipoServicio} /></div>
              <div><Label>Plan principal</Label><Val v={data.planPrincipal} /></div>
              <div><Label>Canal de atención</Label><Val v={data.canalAtencion} /></div>
            </div>
            {(data.correoSoporte || data.telefonoSoporte || nivelContacto) && (
              <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: '10px', marginTop: '2px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                {data.correoSoporte  && <div><Label>Correo soporte</Label><Val v={data.correoSoporte} /></div>}
                {data.telefonoSoporte && <div><Label>Teléfono</Label><Val v={data.telefonoSoporte} /></div>}
                {nivelContacto && <>
                  <div><Label>Contacto N1</Label><Val v={nivelContacto.nombreContacto} /></div>
                  <div><Label>WhatsApp N1</Label><Val v={nivelContacto.whatsapp} /></div>
                </>}
              </div>
            )}
            {data.observaciones && (
              <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: '10px', marginTop: '2px' }}>
                <Label>Observaciones</Label>
                <div style={{ fontSize: '12px', color: 'var(--foreground)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{data.observaciones}</div>
              </div>
            )}
            {data.instruccionGeneral && (
              <div style={{ marginTop: '10px' }}>
                <Label>Instrucción general</Label>
                <div style={{ fontSize: '12px', color: 'var(--foreground)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{data.instruccionGeneral}</div>
              </div>
            )}
          </div>

          {/* Right: métricas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
              <SectionTitle>Métricas (30 días)</SectionTitle>
              {[
                { label: 'Costo mensual total ↗',       value: fmtSoles(metricas?.costoTotal), onClick: () => setPanelMetrica('costo') },
                { label: 'SLA Respuesta (30d) ↗',      value: metricas?.scoreRespuestaPromedio  != null ? `${metricas.scoreRespuestaPromedio}%`  : '—', color: slaColor(metricas?.scoreRespuestaPromedio  ?? null), onClick: () => setPanelMetrica('slaResp') },
                { label: 'T. respuesta promedio ↗',    value: metricas?.tRespuestaPromedio != null ? `${metricas.tRespuestaPromedio} min` : '—', onClick: () => setPanelMetrica('tResp') },
                { label: 'SLA Resolución (30d) ↗',     value: metricas?.scoreResolucionPromedio != null ? `${metricas.scoreResolucionPromedio}%` : '—', color: slaColor(metricas?.scoreResolucionPromedio ?? null), onClick: () => setPanelMetrica('slaResol') },
                { label: 'T. resolución promedio ↗',   value: metricas?.tResolucionPromedio != null ? `${metricas.tResolucionPromedio} min` : '—', onClick: () => setPanelMetrica('tResol') },
                { label: 'MTTR promedio ↗',            value: fmtMttr(metricas?.mttrPromedio), onClick: () => setPanelMetrica('mttr') },
                { label: 'Incidentes (30d)',            value: String(metricas?.incidentes30d ?? 0) },
                { label: 'Tiendas críticas',            value: String(metricas?.tiendasCriticas ?? 0), color: metricas?.tiendasCriticas > 0 ? '#ef4444' : undefined },
                { label: 'Tiempo caído total ↗',       value: fmtMttr(metricas?.mttrTotal), onClick: () => setPanelMetrica('tiempoCaido') },
                { label: 'Tiendas asociadas',           value: String(metricas?.totalTiendas ?? 0) },
                { label: 'IEI acumulado (30d) ↗',      value: metricas?.iei30d != null && metricas.iei30d > 0 ? `S/ ${metricas.iei30d.toLocaleString('es-PE')}` : '—', color: metricas?.iei30d > 0 ? '#b91c1c' : undefined, onClick: () => setIeiPanelOpen(true) },
              ].map(r => (
                <div key={r.label}
                  onClick={(r as any).onClick}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '0.5px solid var(--border)', cursor: (r as any).onClick ? 'pointer' : 'default' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{r.label}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: (r as any).color ?? 'var(--foreground)' }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        </>
      )}

      {/* ── Tab: Tiendas asignadas ────────────────────────────────────────────── */}
      {tab === 'tiendas' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <input placeholder="Buscar por código o nombre..." value={buscarT}
              onChange={e => setBuscarT(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', minWidth: '220px' }} />

            {/* Chips de vencimiento */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {([['TODAS', 'Todas'], ['ACTIVA', 'Activas'], ['POR_VENCER', 'Por vencer'], ['VENCIDA', 'Vencidas']] as const).map(([val, label]) => {
                const activo = filtroVenc === val
                return (
                  <button key={val} onClick={() => setFiltroVenc(val)}
                    style={{ padding: '5px 10px', fontSize: '11px', fontWeight: activo ? 600 : 400, borderRadius: '7px', cursor: 'pointer', whiteSpace: 'nowrap', border: `0.5px solid ${activo ? 'hsl(221,83%,33%)' : 'var(--border)'}`, background: activo ? 'hsl(221,83%,23%)' : 'var(--card)', color: activo ? '#fff' : 'var(--muted-foreground)' }}>
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Orden por vencimiento */}
            <button onClick={() => setOrdenVenc(v => !v)}
              title="Ordenar por fecha de vencimiento (más cercana primero)"
              style={{ padding: '5px 10px', fontSize: '11px', fontWeight: ordenVenc ? 600 : 400, borderRadius: '7px', cursor: 'pointer', whiteSpace: 'nowrap', border: `0.5px solid ${ordenVenc ? 'hsl(221,83%,33%)' : 'var(--border)'}`, background: ordenVenc ? '#eef4ff' : 'var(--card)', color: ordenVenc ? 'hsl(221,83%,23%)' : 'var(--muted-foreground)' }}>
              ↑ Próximas a vencer
            </button>

            {!loadingT && (
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
                {tiendasFiltradas.length} tienda{tiendasFiltradas.length !== 1 ? 's' : ''}
                {tiendasFiltradas.filter((t: any) => !t.fichaActiva).length > 0 && (
                  <span style={{ color: '#d97706', marginLeft: '6px' }}>· {tiendasFiltradas.filter((t: any) => !t.fichaActiva).length} sin ficha</span>
                )}
              </span>
            )}
          </div>
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--muted)' }}>
                  {['Tienda', 'Distrito', 'CID', 'Conexión', 'Cluster', 'Costo', 'Contingencia', 'Estado', 'Inc. 30d', 'Vencimiento', 'Contrato SLA', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingT && <tr><td colSpan={12} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)' }}>Cargando...</td></tr>}
                {!loadingT && tiendasFiltradas.length === 0 && <tr><td colSpan={12} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)' }}>Sin tiendas</td></tr>}
                {!loadingT && tiendasFiltradas.map((t, i) => (
                  <tr key={t.id}
                    style={{ borderBottom: i < tiendasFiltradas.length - 1 ? '0.5px solid var(--border)' : 'none', cursor: 'pointer' }}
                    onClick={() => router.push(`/proveedores/${id}/tienda/${t.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11px' }}>{t.codigo}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{t.nombreCc}</div>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)', fontSize: '11px' }}>{t.distrito ?? '—'}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '11px' }}>{t.cidServicio ?? '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--muted-foreground)' }}>{t.tipoConexion ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {t.cluster ? <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: 'var(--muted)', color: 'var(--foreground)' }}>{t.cluster}</span> : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '11px' }}>{fmtSoles(t.costoMensual)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: t.tieneContingencia ? '#059669' : '#9ca3af' }}>{t.tieneContingencia ? 'Sí' : 'No'}</span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: t.estadoServicio === 'ACTIVO' ? '#d1fae5' : '#fee2e2', color: t.estadoServicio === 'ACTIVO' ? '#065f46' : '#b91c1c' }}>
                        {t.estadoServicio ?? 'ACTIVO'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {t.incidentes30d > 0 ? <span style={{ fontWeight: 700, color: '#dc2626' }}>{t.incidentes30d}</span> : <span style={{ color: 'var(--muted-foreground)' }}>0</span>}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {(() => {
                        const meta = metaEstadoContrato(t.estadoContrato)
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: meta.bg, color: meta.color, whiteSpace: 'nowrap', width: 'fit-content' }}>
                              {meta.label}
                            </span>
                            {t.vencimientoFicha && (
                              <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{fmtDate(t.vencimientoFicha)}</span>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {t.contratoEspecifico ? (
                        <div>
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px', background: '#dbeafe', color: '#1e40af' }}>Específico</span>
                          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px', fontFamily: 'monospace' }}>
                            {t.contratoEspecifico.tiempo_respuesta_sla ?? '—'}m / {t.contratoEspecifico.tiempo_resolucion_sla ?? '—'}m
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>General</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <button onClick={e => { e.stopPropagation(); router.push(`/proveedores/${id}/tienda/${t.id}`) }}
                          style={{ padding: '4px 10px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          Ver servicio
                        </button>
                        {t.fichaActiva ? (
                          <button onClick={e => { e.stopPropagation(); router.push(`/gestion-cambios/fichas/${t.fichaActiva.id}`) }}
                            style={{ padding: '4px 10px', fontSize: '11px', border: '0.5px solid #86efac', borderRadius: '6px', background: '#f0fdf4', color: '#166534', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            {t.fichaActiva.codigo}
                          </button>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); router.push(`/gestion-cambios/fichas/nueva?tiendaId=${t.id}&proveedorId=${id}`) }}
                            style={{ padding: '4px 10px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--muted-foreground)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            + Ficha
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}



      {/* ── Tab: Históricas ──────────────────────────────────────────────────── */}
      {tab === 'historicas' && (
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--muted)' }}>
                {['Tienda', 'Distrito', 'Incidentes', 'MTTR prom', 'Último incidente', 'Salida del proveedor', 'Proveedor actual'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.tiendasHistoricas ?? []).length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)' }}>Sin tiendas históricas</td></tr>
              ) : (data.tiendasHistoricas ?? []).map((t: any, i: number) => (
                <tr key={t.tiendaId}
                  style={{ borderBottom: i < (data.tiendasHistoricas.length - 1) ? '0.5px solid var(--border)' : 'none', cursor: 'pointer' }}
                  onClick={() => router.push(`/proveedores/${id}/tienda/${t.tiendaId}`)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11px' }}>{t.codigo}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{t.nombreCc}</div>
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)', fontSize: '11px' }}>{t.distrito ?? '—'}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{t.totalIncidentes}</td>
                  <td style={{ padding: '8px 10px', fontSize: '11px' }}>{fmtMttr(t.mttrPromedio)}</td>
                  <td style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--muted-foreground)' }}>{fmtDate(t.ultimoIncidente)}</td>
                  <td style={{ padding: '8px 10px', fontSize: '11px', color: t.fechaCambioProveedor ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{fmtDate(t.fechaCambioProveedor)}</td>
                  <td style={{ padding: '8px 10px', fontSize: '11px' }}>{t.proveedorActual ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal: Editar proveedor ───────────────────────────────────────────── */}
      {editProv && (
        <ModalWrap title="Editar proveedor" onClose={() => setEditProv(false)}>
          <FormGrid>
            {([
              ['nombre',             'Nombre *'],
              ['tipoServicio',       'Tipo de servicio'],
              ['planPrincipal',      'Plan principal'],
              ['canalAtencion',      'Canal de atención'],
              ['correoSoporte',      'Correo soporte'],
              ['telefonoSoporte',    'Teléfono soporte'],
            ] as [string, string][]).map(([k, l]) => (
              <FormField key={k} label={l}>
                <input value={editForm[k] ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, [k]: e.target.value }))} style={INP} />
              </FormField>
            ))}
            <FormField label="Instrucción general" span>
              <textarea value={editForm.instruccionGeneral ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, instruccionGeneral: e.target.value }))} style={{ ...INP, minHeight: '64px', resize: 'vertical' }} />
            </FormField>
            <FormField label="Observaciones" span>
              <textarea value={editForm.observaciones ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, observaciones: e.target.value }))} style={{ ...INP, minHeight: '64px', resize: 'vertical' }} />
            </FormField>
          </FormGrid>
          <ModalFooter onCancel={() => setEditProv(false)} onSave={saveProv} saving={savingP} />
        </ModalWrap>
      )}

      {/* ── Side panel genérico de métricas ── */}
      {panelMetrica && (
        <div onClick={() => setPanelMetrica(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.22)' }} />
      )}
      {(() => {
        const slaRows: any[] = data?.metricas?.slaBreakdown ?? []
        const costoRows: any[] = data?.metricas?.costoBreakdown ?? []
        const fmtMttrLocal = (m: number | null | undefined) => {
          if (!m) return '—'
          const h = Math.floor(m / 60), min = m % 60
          return h > 0 ? `${h}h ${min}m` : `${min}m`
        }
        const slaCol = (v: number | null | undefined) => v == null ? '#9ca3af' : v >= 80 ? '#16a34a' : v >= 60 ? '#d97706' : '#dc2626'
        const TIPO: Record<string, string> = { CAIDA_TOTAL: 'Caída', INTERMITENCIA: 'Intermitencia', LENTITUD: 'Lentitud', CORTE_ELECTRICO: 'Corte elét.' }

        const config: Record<string, { title: string; cols: string[]; rows: () => any[]; render: (r: any) => React.ReactNode[] }> = {
          costo: {
            title: 'Costo mensual por tienda',
            cols: ['Tienda', 'Costo mensual'],
            rows: () => costoRows,
            render: (r) => [
              <span key="c" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.codigo}</span>,
              <span key="v" style={{ fontFamily: 'monospace', fontWeight: 700 }}>S/ {Number(r.costo).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>,
            ],
          },
          mttr: {
            title: 'MTTR por incidente (30d)',
            cols: ['Incidente', 'Tienda', 'Tipo', 'MTTR'],
            rows: () => [...slaRows].sort((a, b) => (b.mttrMinutos ?? 0) - (a.mttrMinutos ?? 0)),
            render: (r) => [
              <span key="c" style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600 }}>{r.codigo}</span>,
              <span key="t">{r.tiendaCodigo}</span>,
              <span key="ty" style={{ color: 'var(--muted-foreground)' }}>{TIPO[r.tipo] ?? r.tipo}</span>,
              <span key="m" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmtMttrLocal(r.mttrMinutos)}</span>,
            ],
          },
          tiempoCaido: {
            title: 'Tiempo caído por incidente (30d)',
            cols: ['Incidente', 'Tienda', 'Tipo', 'MTTR'],
            rows: () => [...slaRows].sort((a, b) => (b.mttrMinutos ?? 0) - (a.mttrMinutos ?? 0)),
            render: (r) => [
              <span key="c" style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600 }}>{r.codigo}</span>,
              <span key="t">{r.tiendaCodigo}</span>,
              <span key="ty" style={{ color: 'var(--muted-foreground)' }}>{TIPO[r.tipo] ?? r.tipo}</span>,
              <span key="m" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmtMttrLocal(r.mttrMinutos)}</span>,
            ],
          },
          slaResp: {
            title: 'SLA Respuesta por incidente (30d)',
            cols: ['Incidente', 'Tienda', 'T. Resp', 'Límite', 'Score'],
            rows: () => [...slaRows].sort((a, b) => (a.scoreRespuesta ?? 100) - (b.scoreRespuesta ?? 100)),
            render: (r) => [
              <span key="c" style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600 }}>{r.codigo}</span>,
              <span key="t">{r.tiendaCodigo}</span>,
              <span key="tr" style={{ fontFamily: 'monospace' }}>{r.tRespuestaMin != null ? `${r.tRespuestaMin}m` : '—'}</span>,
              <span key="l" style={{ color: 'var(--muted-foreground)' }}>{r.slaRespObj}m</span>,
              <span key="s" style={{ fontWeight: 700, color: slaCol(r.scoreRespuesta) }}>{r.scoreRespuesta != null ? `${r.scoreRespuesta}%` : '—'}</span>,
            ],
          },
          tResp: {
            title: 'Tiempo de primera respuesta (30d)',
            cols: ['Incidente', 'Tienda', 'T. Resp', 'Límite', 'Score'],
            rows: () => [...slaRows].sort((a, b) => (b.tRespuestaMin ?? 0) - (a.tRespuestaMin ?? 0)),
            render: (r) => [
              <span key="c" style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600 }}>{r.codigo}</span>,
              <span key="t">{r.tiendaCodigo}</span>,
              <span key="tr" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.tRespuestaMin != null ? `${r.tRespuestaMin}m` : '—'}</span>,
              <span key="l" style={{ color: 'var(--muted-foreground)' }}>{r.slaRespObj}m</span>,
              <span key="s" style={{ color: slaCol(r.scoreRespuesta) }}>{r.scoreRespuesta != null ? `${r.scoreRespuesta}%` : '—'}</span>,
            ],
          },
          slaResol: {
            title: 'SLA Resolución por incidente (30d)',
            cols: ['Incidente', 'Tienda', 'T. Resol.', 'Límite', 'Score'],
            rows: () => [...slaRows].sort((a, b) => (a.scoreResolucion ?? 100) - (b.scoreResolucion ?? 100)),
            render: (r) => [
              <span key="c" style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600 }}>{r.codigo}</span>,
              <span key="t">{r.tiendaCodigo}</span>,
              <span key="tr" style={{ fontFamily: 'monospace' }}>{r.tResolucionMin != null ? `${r.tResolucionMin}m` : '—'}</span>,
              <span key="l" style={{ color: 'var(--muted-foreground)' }}>{r.slaResolObj}m</span>,
              <span key="s" style={{ fontWeight: 700, color: slaCol(r.scoreResolucion) }}>{r.scoreResolucion != null ? `${r.scoreResolucion}%` : '—'}</span>,
            ],
          },
          tResol: {
            title: 'Tiempo de resolución por incidente (30d)',
            cols: ['Incidente', 'Tienda', 'T. Resol.', 'Límite', 'Score'],
            rows: () => [...slaRows].sort((a, b) => (b.tResolucionMin ?? 0) - (a.tResolucionMin ?? 0)),
            render: (r) => [
              <span key="c" style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600 }}>{r.codigo}</span>,
              <span key="t">{r.tiendaCodigo}</span>,
              <span key="tr" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.tResolucionMin != null ? `${r.tResolucionMin}m` : '—'}</span>,
              <span key="l" style={{ color: 'var(--muted-foreground)' }}>{r.slaResolObj}m</span>,
              <span key="s" style={{ color: slaCol(r.scoreResolucion) }}>{r.scoreResolucion != null ? `${r.scoreResolucion}%` : '—'}</span>,
            ],
          },
        }

        const cfg = panelMetrica ? config[panelMetrica] : null
        const rows = cfg?.rows() ?? []

        return (
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 540, maxWidth: '95vw',
            background: 'var(--card)', borderLeft: '1px solid var(--border)',
            boxShadow: '-4px 0 28px rgba(0,0,0,0.13)',
            zIndex: 201, display: 'flex', flexDirection: 'column',
            transform: panelMetrica ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.26s cubic-bezier(0.4,0,0.2,1)',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--muted)', flexShrink: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{cfg?.title ?? ''}</div>
              <button onClick={() => setPanelMetrica(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {rows.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px', padding: '32px 0' }}>Sin datos</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--muted)', zIndex: 1 }}>
                    <tr>
                      {cfg?.cols.map(h => (
                        <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '0.5px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any, i: number) => {
                      const cells = cfg?.render(r) ?? []
                      const isInc = !!r.id
                      return (
                        <tr key={i}
                          style={{ borderBottom: '0.5px solid var(--border)', cursor: isInc ? 'pointer' : 'default' }}
                          onClick={isInc ? () => router.push(`/incidentes/${r.id}`) : undefined}
                          onMouseEnter={isInc ? e => (e.currentTarget.style.background = 'var(--muted)') : undefined}
                          onMouseLeave={isInc ? e => (e.currentTarget.style.background = 'transparent') : undefined}>
                          {cells.map((cell, j) => (
                            <td key={j} style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>{cell}</td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Side panel IEI 30d por tienda ── */}
      {ieiPanelOpen && (
        <div onClick={() => setIeiPanelOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.22)' }} />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, maxWidth: '95vw',
        background: 'var(--card)', borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 28px rgba(0,0,0,0.13)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        transform: ieiPanelOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.26s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--muted)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>IEI acumulado 30 días — {data?.nombre}</div>
            <div style={{ fontSize: '11px', color: data?.metricas?.iei30d > 0 ? '#b91c1c' : 'var(--muted-foreground)', fontWeight: 600 }}>
              Total: {data?.metricas?.iei30d > 0 ? `S/ ${Math.round(data.metricas.iei30d).toLocaleString('es-PE')}` : 'S/ 0'}
            </div>
          </div>
          <button onClick={() => setIeiPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(data?.metricas?.iei30dBreakdown ?? []).length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px', padding: '32px 0' }}>Sin incidentes con IEI en los últimos 30 días</div>
          ) : (data?.metricas?.iei30dBreakdown ?? []).map((t: any) => (
            <div key={t.tiendaId} style={{ background: 'var(--background)', borderRadius: '8px', border: '0.5px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--muted)', borderBottom: '0.5px solid var(--border)' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700 }}>{t.tiendaCodigo}</span>
                  {t.tiendaNombre && <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginLeft: '6px' }}>{t.tiendaNombre}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{t.incidentes.length} inc.</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#b91c1c' }}>S/ {t.ieiTotal.toLocaleString('es-PE')}</span>
                </div>
              </div>
              {t.incidentes.sort((a: any, b: any) => b.iei - a.iei).map((inc: any) => {
                const TIPO_LABEL: Record<string, string> = { CAIDA_TOTAL: 'Caída', INTERMITENCIA: 'Intermitencia', LENTITUD: 'Lentitud', CORTE_ELECTRICO: 'Corte elét.' }
                return (
                  <div key={inc.id}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderBottom: '0.5px solid var(--border)', cursor: 'pointer', fontSize: '11px' }}
                    onClick={() => router.push(`/incidentes/${inc.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inc.codigo}</span>
                      <span style={{ color: 'var(--muted-foreground)' }}>{TIPO_LABEL[inc.tipo] ?? inc.tipo}</span>
                      {inc.mttrMinutos && <span style={{ color: 'var(--muted-foreground)' }}>{inc.mttrMinutos >= 60 ? `${Math.floor(inc.mttrMinutos/60)}h ${inc.mttrMinutos%60}m` : `${inc.mttrMinutos}m`}</span>}
                    </div>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#b91c1c', flexShrink: 0 }}>S/ {inc.iei.toLocaleString('es-PE')}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── UI Sub-components ──────────────────────────────────────────────────────────
function ModalWrap({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ padding: '14px 18px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
        </div>
        <div style={{ padding: '16px 18px' }}>{children}</div>
      </div>
    </div>
  )
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>{children}</div>
}

function FormField({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div style={{ marginBottom: '10px', gridColumn: span ? '1/-1' : undefined }}>
      <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '3px' }}>{label}</label>
      {children}
    </div>
  )
}

function ModalFooter({ onCancel, onSave, saving }: { onCancel: () => void; onSave: () => void; saving: boolean }) {
  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
      <button onClick={onCancel}
        style={{ padding: '8px 16px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
        Cancelar
      </button>
      <button onClick={onSave} disabled={saving}
        style={{ padding: '8px 16px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Guardando...' : 'Guardar'}
      </button>
    </div>
  )
}
