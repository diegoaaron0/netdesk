'use client'
import { useEffect, useState, use, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { fmtSLA } from '@/lib/sla-display'

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

function calcEstado(fechaFin: string | null | undefined): 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' {
  if (!fechaFin) return 'VIGENTE'
  const fin = new Date(fechaFin), hoy = new Date()
  const en7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  if (fin < hoy) return 'VENCIDO'
  if (fin <= en7) return 'POR_VENCER'
  return 'VIGENTE'
}

function diasRestantes(fechaFin: string | null | undefined): number | null {
  if (!fechaFin) return null
  return Math.ceil((new Date(fechaFin).getTime() - Date.now()) / 86400000)
}

function slaColor(v: number | null) {
  if (v == null) return '#9ca3af'
  if (v >= 80) return '#16a34a'
  if (v >= 60) return '#d97706'
  return '#dc2626'
}

function estadoBadge(est: string) {
  const m: Record<string, { bg: string; color: string }> = {
    VIGENTE:    { bg: '#d1fae5', color: '#065f46' },
    POR_VENCER: { bg: '#fef3c7', color: '#92400e' },
    VENCIDO:    { bg: '#fee2e2', color: '#b91c1c' },
  }
  return m[est] ?? { bg: '#f3f4f6', color: '#6b7280' }
}

function canalBadge(c: string | null) {
  const m: Record<string, { bg: string; color: string }> = {
    correo:   { bg: '#dbeafe', color: '#1e40af' },
    llamada:  { bg: '#d1fae5', color: '#065f46' },
    whatsapp: { bg: '#dcfce7', color: '#15803d' },
    portal:   { bg: '#ede9fe', color: '#7c3aed' },
  }
  return m[c ?? ''] ?? { bg: '#f3f4f6', color: '#6b7280' }
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

  // Edit proveedor modal
  const [editProv, setEditProv]     = useState(false)
  const [editForm, setEditForm]     = useState<any>({})
  const [savingP, setSavingP]       = useState(false)

  // Edit nivel modal
  const [editNivel, setEditNivel]   = useState<any>(null)
  const [nivelForm, setNivelForm]   = useState<any>({})
  const [savingN, setSavingN]       = useState(false)
  const [addNivel, setAddNivel]     = useState(false)

  // Edit contrato modal
  const [editContrato, setEditContrato]           = useState<any>(null)
  const [contratoForm, setContratoForm]           = useState<any>({})
  const [savingC, setSavingC]                     = useState(false)
  const [addContrato, setAddContrato]             = useState(false)
  const [contratoAplicacion, setContratoAplicacion] = useState<'marco' | 'especifica'>('marco')
  const [tiendaBusqModal, setTiendaBusqModal]     = useState('')

  // Contrato por tienda (panel lateral)
  const [contratoTiendaId, setContratoTiendaId]     = useState<string | null>(null)
  const [contratoTiendaForm, setContratoTiendaForm] = useState<any>({})
  const [savingContratoT, setSavingContratoT]       = useState(false)

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
    await fetch(`/api/proveedores/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setSavingP(false)
    setEditProv(false)
    loadData()
  }

  // ── Save nivel ──────────────────────────────────────────────────────────────
  async function saveNivel(isNew: boolean) {
    setSavingN(true)
    const url    = isNew ? `/api/proveedores/${id}/niveles` : `/api/niveles/${editNivel?.id}`
    const method = isNew ? 'POST' : 'PUT'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nivelForm) })
    setSavingN(false)
    setEditNivel(null)
    setAddNivel(false)
    loadData()
  }

  async function deleteNivel(nid: string) {
    if (!confirm('¿Eliminar este nivel?')) return
    await fetch(`/api/niveles/${nid}`, { method: 'DELETE' })
    loadData()
  }

  // ── Save contrato ───────────────────────────────────────────────────────────
  async function saveContrato(isNew: boolean) {
    setSavingC(true)
    const url    = isNew ? `/api/proveedores/${id}/contratos` : `/api/contratos/${editContrato?.id}`
    const method = isNew ? 'POST' : 'PUT'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...contratoForm, tiendaId: null }) })
    setSavingC(false)
    setEditContrato(null)
    setAddContrato(false)
    loadData()
  }

  async function saveContratoTienda() {
    if (!contratoTiendaId) return
    setSavingContratoT(true)
    const tienda = tiendas.find((t: any) => t.id === contratoTiendaId)
    const existing = tienda?.contratoEspecifico
    if (existing?.id) {
      await fetch(`/api/contratos/${existing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contratoTiendaForm),
      })
    } else {
      await fetch(`/api/proveedores/${id}/contratos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...contratoTiendaForm, tiendaId: contratoTiendaId }),
      })
    }
    setSavingContratoT(false)
    setContratoTiendaId(null)
    await Promise.all([loadData(), loadTiendas()])
  }

  async function deleteContrato(cid: string) {
    if (!confirm('¿Eliminar este contrato?')) return
    await fetch(`/api/contratos/${cid}`, { method: 'DELETE' })
    loadData()
  }

  if (!data) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '48px', color: 'var(--muted-foreground)', fontSize: '13px' }}>Cargando...</div>
  }

  const { metricas, niveles = [], contratos = [] } = data
  const tiendasFiltradas = tiendas.filter(t => {
    if (!buscarT) return true
    const q = buscarT.toLowerCase()
    return t.codigo?.toLowerCase().includes(q) || t.nombreCc?.toLowerCase().includes(q)
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px' }}>
          {/* Left */}
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <SectionTitle>Información general</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <div><Label>Nombre</Label><Val v={data.nombre} /></div>
              <div><Label>Tipo de servicio</Label><Val v={data.tipoServicio} /></div>
              <div><Label>Plan principal</Label><Val v={data.planPrincipal} /></div>
              <div><Label>Canal de atención</Label><Val v={data.canalAtencion} /></div>
              <div><Label>Correo soporte</Label><Val v={data.correoSoporte} /></div>
              <div><Label>Teléfono</Label><Val v={data.telefonoSoporte} /></div>
              {nivelContacto && <>
                <div><Label>Contacto N1</Label><Val v={nivelContacto.nombreContacto} /></div>
                <div><Label>WhatsApp N1</Label><Val v={nivelContacto.whatsapp} /></div>
              </>}
            </div>
            {data.observaciones && (
              <>
                <Label>Observaciones</Label>
                <div style={{ fontSize: '12px', color: 'var(--foreground)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{data.observaciones}</div>
              </>
            )}
            {data.instruccionGeneral && (
              <>
                <div style={{ marginTop: '10px' }}><Label>Instrucción general</Label></div>
                <div style={{ fontSize: '12px', color: 'var(--foreground)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{data.instruccionGeneral}</div>
              </>
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
      )}

      {/* ── Tab: Tiendas asignadas ────────────────────────────────────────────── */}
      {tab === 'tiendas' && (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <input placeholder="Buscar por código o nombre..." value={buscarT}
              onChange={e => setBuscarT(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', minWidth: '240px' }} />
          </div>
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--muted)' }}>
                  {['Tienda', 'Distrito', 'CID', 'Conexión', 'Cluster', 'Costo', 'Contingencia', 'Estado', 'Inc. 30d', 'Contrato SLA', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingT && <tr><td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)' }}>Cargando...</td></tr>}
                {!loadingT && tiendasFiltradas.length === 0 && <tr><td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)' }}>Sin tiendas</td></tr>}
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

      {/* ── Modal: Nivel (agregar / editar) ──────────────────────────────────── */}
      {(editNivel || addNivel) && (
        <ModalWrap title={addNivel ? 'Agregar nivel' : `Editar Nivel ${editNivel?.nivel}`} onClose={() => { setEditNivel(null); setAddNivel(false) }}>
          <FormGrid>
            <FormField label="Nivel *">
              <input type="number" min={1} max={4} value={nivelForm.nivel ?? ''} onChange={e => setNivelForm((f: any) => ({ ...f, nivel: Number(e.target.value) }))} style={INP} />
            </FormField>
            <FormField label="Nombre / Área *">
              <input value={nivelForm.nombreContacto ?? ''} onChange={e => setNivelForm((f: any) => ({ ...f, nombreContacto: e.target.value }))} style={INP} />
            </FormField>
            <FormField label="Correo">
              <input value={nivelForm.email ?? ''} onChange={e => setNivelForm((f: any) => ({ ...f, email: e.target.value }))} style={INP} />
            </FormField>
            <FormField label="Celular">
              <input value={nivelForm.celular ?? ''} onChange={e => setNivelForm((f: any) => ({ ...f, celular: e.target.value }))} style={INP} />
            </FormField>
            <FormField label="WhatsApp">
              <input value={nivelForm.whatsapp ?? ''} onChange={e => setNivelForm((f: any) => ({ ...f, whatsapp: e.target.value }))} style={INP} />
            </FormField>
            <FormField label="Canal">
              <select value={nivelForm.canal ?? 'correo'} onChange={e => setNivelForm((f: any) => ({ ...f, canal: e.target.value }))} style={INP}>
                {['correo', 'llamada', 'whatsapp', 'portal'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
            <FormField label="Horario atención">
              <input value={nivelForm.horarioAtencion ?? ''} onChange={e => setNivelForm((f: any) => ({ ...f, horarioAtencion: e.target.value }))} style={INP} />
            </FormField>
            <FormField label="T. respuesta Sev1">
              <input value={nivelForm.tiempoRespSev1 ?? ''} onChange={e => setNivelForm((f: any) => ({ ...f, tiempoRespSev1: e.target.value }))} style={INP} placeholder="ej: 1h" />
            </FormField>
            <FormField label="T. respuesta Sev2">
              <input value={nivelForm.tiempoRespSev2 ?? ''} onChange={e => setNivelForm((f: any) => ({ ...f, tiempoRespSev2: e.target.value }))} style={INP} placeholder="ej: 2h" />
            </FormField>
            <FormField label="T. respuesta Sev3">
              <input value={nivelForm.tiempoRespSev3 ?? ''} onChange={e => setNivelForm((f: any) => ({ ...f, tiempoRespSev3: e.target.value }))} style={INP} placeholder="ej: 4h" />
            </FormField>
            <FormField label="T. solución (h)">
              <input type="number" value={nivelForm.tiempoEsperadoSolucion ?? ''} onChange={e => setNivelForm((f: any) => ({ ...f, tiempoEsperadoSolucion: Number(e.target.value) || null }))} style={INP} />
            </FormField>
            <FormField label="Correos en copia (separados por coma)" span>
              <input value={(nivelForm.correosCopia ?? []).join(', ')}
                onChange={e => setNivelForm((f: any) => ({ ...f, correosCopia: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) }))}
                style={INP} placeholder="email1@..., email2@..." />
            </FormField>
            <FormField label="Instrucción" span>
              <textarea value={nivelForm.instruccion ?? ''} onChange={e => setNivelForm((f: any) => ({ ...f, instruccion: e.target.value }))} style={{ ...INP, minHeight: '72px', resize: 'vertical' }} />
            </FormField>
            <FormField label="Estado">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!nivelForm.activo} onChange={e => setNivelForm((f: any) => ({ ...f, activo: e.target.checked }))} />
                  Activo
                </label>
              </div>
            </FormField>
          </FormGrid>
          <ModalFooter onCancel={() => { setEditNivel(null); setAddNivel(false) }} onSave={() => saveNivel(addNivel)} saving={savingN} />
        </ModalWrap>
      )}

      {/* ── Modal: Contrato (agregar / editar) ───────────────────────────────── */}
      {(editContrato || addContrato) && (
        <ModalWrap title={addContrato ? 'Agregar contrato' : 'Editar contrato'} onClose={() => { setEditContrato(null); setAddContrato(false) }}>

          {/* Sección 1 — Datos comerciales */}
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', paddingBottom: '6px', borderBottom: '0.5px solid var(--border)' }}>
            Datos comerciales
          </div>
          <FormGrid>
            <FormField label="Código contrato">
              <input value={contratoForm.codigoContrato ?? ''} onChange={e => setContratoForm((f: any) => ({ ...f, codigoContrato: e.target.value }))} style={INP} />
            </FormField>
            <FormField label="Plan">
              <input value={contratoForm.plan ?? ''} onChange={e => setContratoForm((f: any) => ({ ...f, plan: e.target.value }))} style={INP} />
            </FormField>
            <FormField label="Tipo de servicio">
              <input value={contratoForm.tipoServicio ?? ''} onChange={e => setContratoForm((f: any) => ({ ...f, tipoServicio: e.target.value }))} style={INP} />
            </FormField>
            <FormField label="Velocidad / Capacidad">
              <input value={contratoForm.velocidadCapacidad ?? ''} onChange={e => setContratoForm((f: any) => ({ ...f, velocidadCapacidad: e.target.value }))} style={INP} />
            </FormField>
            <FormField label="Costo mensual (S/.)">
              <input type="number" value={contratoForm.costoMensual ?? ''} onChange={e => setContratoForm((f: any) => ({ ...f, costoMensual: e.target.value || null }))} style={INP} />
            </FormField>
            <FormField label="Fecha inicio">
              <input type="date" value={contratoForm.fechaInicio ?? ''} onChange={e => setContratoForm((f: any) => ({ ...f, fechaInicio: e.target.value || null }))} style={INP} />
            </FormField>
            <FormField label="Fecha fin">
              <input type="date" value={contratoForm.fechaFin ?? ''} onChange={e => setContratoForm((f: any) => ({ ...f, fechaFin: e.target.value || null }))} style={INP} />
            </FormField>
            <FormField label="Renovación automática">
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', paddingTop: '4px' }}>
                <input type="checkbox" checked={!!contratoForm.renovacionAutomatica} onChange={e => setContratoForm((f: any) => ({ ...f, renovacionAutomatica: e.target.checked }))} />
                Sí
              </label>
            </FormField>
            <FormField label="Penalidad" span>
              <textarea value={contratoForm.penalidad ?? ''} onChange={e => setContratoForm((f: any) => ({ ...f, penalidad: e.target.value }))} style={{ ...INP, minHeight: '52px', resize: 'vertical' }} />
            </FormField>
            <FormField label="URL documento" span>
              <input value={contratoForm.documentoUrl ?? ''} onChange={e => setContratoForm((f: any) => ({ ...f, documentoUrl: e.target.value }))} style={INP} placeholder="https://..." />
            </FormField>
          </FormGrid>

          {/* Sección 2 — Compromisos SLA */}
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '14px 16px', marginTop: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
              Compromisos SLA del contrato
            </div>
            <FormGrid>
              <FormField label="Tiempo máximo de respuesta N1 (minutos)">
                <input type="number" min={1} value={contratoForm.tiempoRespuestaSla ?? ''} onChange={e => setContratoForm((f: any) => ({ ...f, tiempoRespuestaSla: Number(e.target.value) || null }))} style={{ ...INP, background: 'white' }} placeholder="60" />
                <div style={{ fontSize: '10px', color: '#6B7280', marginTop: '4px', lineHeight: 1.4 }}>El proveedor debe responder en este tiempo desde que se le escala</div>
              </FormField>
              <FormField label="Tiempo máximo de resolución (minutos)">
                <input type="number" min={1} value={contratoForm.tiempoResolucionSla ?? ''} onChange={e => setContratoForm((f: any) => ({ ...f, tiempoResolucionSla: Number(e.target.value) || null }))} style={{ ...INP, background: 'white' }} placeholder="60" />
                <div style={{ fontSize: '10px', color: '#6B7280', marginTop: '4px', lineHeight: 1.4 }}>Tiempo base — se multiplica x2 para intermitencia y x4 para lentitud</div>
              </FormField>
            </FormGrid>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', padding: '8px 10px', background: 'var(--muted)', borderRadius: '7px', marginBottom: '4px' }}>
            Este contrato aplica a todas las tiendas del proveedor. Para asignar condiciones distintas a una tienda, usa el botón <strong>Contrato</strong> en la pestaña Tiendas asignadas.
          </div>

          <ModalFooter onCancel={() => { setEditContrato(null); setAddContrato(false) }} onSave={() => saveContrato(addContrato)} saving={savingC} />
        </ModalWrap>
      )}

      {/* ── Side panel contrato de tienda ── */}
      {contratoTiendaId && (
        <div onClick={() => setContratoTiendaId(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.22)' }} />
      )}
      {(() => {
        const tiendaSelec = tiendas.find((t: any) => t.id === contratoTiendaId)
        const cEsp = tiendaSelec?.contratoEspecifico ?? null
        const marcoContrato = contratos.find((c: any) => !c.tiendaId && c.estadoCalc === 'VIGENTE')
        const slaRespActual  = cEsp?.tiempo_respuesta_sla  ?? marcoContrato?.tiempoRespuestaSla  ?? 60
        const slaResolActual = cEsp?.tiempo_resolucion_sla ?? marcoContrato?.tiempoResolucionSla ?? 90
        return (
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '95vw',
            background: 'var(--card)', borderLeft: '1px solid var(--border)',
            boxShadow: '-4px 0 28px rgba(0,0,0,0.13)', zIndex: 201,
            display: 'flex', flexDirection: 'column',
            transform: contratoTiendaId ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.26s cubic-bezier(0.4,0,0.2,1)',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--muted)', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Contrato — <span style={{ fontFamily: 'monospace' }}>{tiendaSelec?.codigo}</span></div>
                <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{tiendaSelec?.nombreCc}</div>
              </div>
              <button onClick={() => setContratoTiendaId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
              {/* SLA vigente */}
              <SectionTitle>SLA aplicado actualmente</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                {[['Respuesta', `${slaRespActual} min`], ['Resolución', `${slaResolActual} min`]].map(([l, v]) => (
                  <div key={l} style={{ background: 'var(--muted)', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{l}</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'monospace' }}>{v}</div>
                  </div>
                ))}
              </div>
              {!cEsp && (
                <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '14px', padding: '7px 10px', background: 'var(--muted)', borderRadius: '6px' }}>
                  {marcoContrato ? 'Usando contrato marco del proveedor.' : 'Sin contrato marco — usando valores por defecto (60 min resp / 90 min resol).'}
                </div>
              )}

              {canEdit && (
                <>
                  <SectionTitle>{cEsp ? 'Editar contrato específico' : 'Agregar contrato específico para esta tienda'}</SectionTitle>
                  {/* Tiempos SLA */}
                  <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                      Tiempos SLA — reemplazan al contrato marco
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                      <FormField label="Respuesta máx (min)">
                        <input type="number" min={1} value={contratoTiendaForm.tiempoRespuestaSla ?? ''} onChange={e => setContratoTiendaForm((f: any) => ({ ...f, tiempoRespuestaSla: Number(e.target.value) || null }))} style={{ ...INP, background: 'white' }} placeholder="60" />
                      </FormField>
                      <FormField label="Resolución máx (min)">
                        <input type="number" min={1} value={contratoTiendaForm.tiempoResolucionSla ?? ''} onChange={e => setContratoTiendaForm((f: any) => ({ ...f, tiempoResolucionSla: Number(e.target.value) || null }))} style={{ ...INP, background: 'white' }} placeholder="90" />
                      </FormField>
                    </div>
                  </div>
                  {/* Datos comerciales */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                    <FormField label="Código contrato">
                      <input value={contratoTiendaForm.codigoContrato ?? ''} onChange={e => setContratoTiendaForm((f: any) => ({ ...f, codigoContrato: e.target.value }))} style={INP} />
                    </FormField>
                    <FormField label="Velocidad / Capacidad">
                      <input value={contratoTiendaForm.velocidadCapacidad ?? ''} onChange={e => setContratoTiendaForm((f: any) => ({ ...f, velocidadCapacidad: e.target.value }))} style={INP} />
                    </FormField>
                    <FormField label="Costo mensual (S/.)">
                      <input type="number" value={contratoTiendaForm.costoMensual ?? ''} onChange={e => setContratoTiendaForm((f: any) => ({ ...f, costoMensual: e.target.value || null }))} style={INP} />
                    </FormField>
                    <FormField label="Estado">
                      <select value={contratoTiendaForm.estado ?? 'VIGENTE'} onChange={e => setContratoTiendaForm((f: any) => ({ ...f, estado: e.target.value }))} style={INP}>
                        {['VIGENTE', 'VENCIDO', 'CANCELADO'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Fecha inicio">
                      <input type="date" value={contratoTiendaForm.fechaInicio ?? ''} onChange={e => setContratoTiendaForm((f: any) => ({ ...f, fechaInicio: e.target.value || null }))} style={INP} />
                    </FormField>
                    <FormField label="Fecha fin">
                      <input type="date" value={contratoTiendaForm.fechaFin ?? ''} onChange={e => setContratoTiendaForm((f: any) => ({ ...f, fechaFin: e.target.value || null }))} style={INP} />
                    </FormField>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    {cEsp && (
                      <button onClick={async () => {
                        if (!confirm('¿Eliminar el contrato específico de esta tienda?')) return
                        await fetch(`/api/contratos/${cEsp.id}`, { method: 'DELETE' })
                        setContratoTiendaId(null)
                        await Promise.all([loadData(), loadTiendas()])
                      }} style={{ flex: 1, padding: '8px', border: '0.5px solid #fca5a5', borderRadius: '8px', background: 'var(--card)', color: '#dc2626', fontSize: '12px', cursor: 'pointer' }}>
                        Eliminar
                      </button>
                    )}
                    <button onClick={saveContratoTienda} disabled={savingContratoT}
                      style={{ flex: 2, padding: '8px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', opacity: savingContratoT ? 0.7 : 1 }}>
                      {savingContratoT ? 'Guardando...' : cEsp ? 'Guardar cambios' : 'Crear contrato'}
                    </button>
                  </div>
                </>
              )}

              {!canEdit && cEsp && (
                <>
                  <SectionTitle>Detalles del contrato</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                    <div><Label>Código</Label><Val v={cEsp.codigo_contrato} /></div>
                    <div><Label>Velocidad</Label><Val v={cEsp.velocidad_capacidad} /></div>
                    <div><Label>Costo mensual</Label><Val v={cEsp.costo_mensual ? fmtSoles(cEsp.costo_mensual) : null} /></div>
                    <div><Label>Fecha fin</Label><Val v={fmtDate(cEsp.fecha_fin)} /></div>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

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
