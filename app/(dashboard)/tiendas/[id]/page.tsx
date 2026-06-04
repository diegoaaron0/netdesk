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

function todayStr() { return new Date().toISOString().slice(0, 10) }
function firstOfMonthStr() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
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

function fmtTs(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function estadoBadge(est: string | null | undefined): { bg: string; color: string } {
  const m: Record<string, { bg: string; color: string }> = {
    ABIERTO:         { bg: '#fee2e2', color: '#991b1b' },
    EN_SEGUIMIENTO:  { bg: '#fef9c3', color: '#92400e' },
    ESCALADO_N1:     { bg: '#ffedd5', color: '#9a3412' },
    ESCALADO_N2:     { bg: '#fed7aa', color: '#7c2d12' },
    ESCALADO_N3:     { bg: '#fecaca', color: '#7f1d1d' },
    RESUELTO:        { bg: '#dcfce7', color: '#166534' },
    CERRADO:         { bg: '#f3f4f6', color: '#374151' },
    CANCELADO:       { bg: '#f3f4f6', color: '#6b7280' },
  }
  return m[est ?? ''] ?? { bg: '#f3f4f6', color: '#6b7280' }
}

function tipoLabel(t: string | null | undefined) {
  const m: Record<string, string> = {
    CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
    LENTITUD: 'Lentitud', POS: 'POS', CORTE_ELECTRICO: 'Corte eléctrico', OTROS: 'Otros',
  }
  return m[t ?? ''] ?? t ?? '—'
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
  const [routersTienda, setRoutersTienda] = useState<any[]>([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [showContForm, setShowContForm] = useState(false)
  const [contForm, setContForm] = useState({ tipo: '', activadoPor: '', justificacion: '' })
  const [contFormSaving, setContFormSaving] = useState(false)
  const [desactivandoContId, setDesactivandoContId] = useState<string | null>(null)
  const [incRecientes, setIncRecientes] = useState<any[]>([])
  const [iei30d, setIei30d] = useState<number | null>(null)
  const [iei30dBreakdown, setIei30dBreakdown] = useState<any[]>([])
  const [ieiPanelOpen, setIeiPanelOpen] = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)
  const [ventasExpanded, setVentasExpanded] = useState(false)
  const [editingVentas, setEditingVentas] = useState(false)
  const [ventaMensualInput, setVentaMensualInput] = useState('')
  const [savingVenta, setSavingVenta] = useState(false)
  const [confirmVenta, setConfirmVenta] = useState<{ nuevaMensual: number; nuevaLJ: number; nuevaVD: number } | null>(null)
  const [pendingCluster, setPendingCluster] = useState<string | null>(null)
  const [filtroDesde, setFiltroDesde] = useState(firstOfMonthStr)
  const [filtroHasta, setFiltroHasta] = useState(todayStr)

  const loadPeriodData = useCallback((desde: string, hasta: string) => {
    if (!id) return
    fetch(`/api/tiendas/${id}/incidentes-recientes?desde=${desde}&hasta=${hasta}`)
      .then(r => r.json())
      .then(d => {
        setIncRecientes(Array.isArray(d?.incidentes) ? d.incidentes : [])
        setIei30d(typeof d?.iei30d === 'number' ? d.iei30d : null)
        setIei30dBreakdown(Array.isArray(d?.iei30dBreakdown) ? d.iei30dBreakdown : [])
      })
    fetch(`/api/tiendas/${id}/contingencia-stats?desde=${desde}&hasta=${hasta}`)
      .then(r => r.json()).then(d => setContStats(d))
    fetch(`/api/tiendas/${id}/contingencias?desde=${desde}&hasta=${hasta}`)
      .then(r => r.json()).then(d => setContList(Array.isArray(d) ? d : []))
  }, [id])

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
    fetch('/api/routers-externos')
      .then(r => r.json())
      .then((data: any) => {
        const rows = Array.isArray(data) ? data : []
        setRoutersTienda(rows.filter((r: any) => r.tienda_actual_id === id))
      })
      .catch(() => setRoutersTienda([]))
  }, [id])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { loadPeriodData(filtroDesde, filtroHasta) }, [filtroDesde, filtroHasta, loadPeriodData])

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
        loadPeriodData(filtroDesde, filtroHasta)
      }
    } finally {
      setContFormSaving(false)
    }
  }

  async function handleDesactivarCont(contId: string) {
    setDesactivandoContId(contId)
    try {
      const res = await fetch(`/api/contingencias/${contId}`, { method: 'PATCH' })
      if (res.ok) { loadData(); loadPeriodData(filtroDesde, filtroHasta) }
    } finally {
      setDesactivandoContId(null)
    }
  }

  function handleClusterChange(newVal: string) {
    if ((newVal || null) === (form.cluster ?? null)) return
    setPendingCluster(newVal)
  }

  function confirmClusterChange() {
    setF('cluster', pendingCluster || null)
    setPendingCluster(null)
  }

  function previewVentaUpdate() {
    const mensual = parseFloat(ventaMensualInput.replace(',', '.'))
    if (isNaN(mensual) || mensual <= 0) return
    const prop = parseFloat(tienda.proporcionFds ?? '0.5')
    const semanal = mensual * 7 / 30.44
    const nuevaLJ = (semanal * (1 - prop)) / 48
    const nuevaVD = (semanal * prop) / 36
    setConfirmVenta({ nuevaMensual: mensual, nuevaLJ, nuevaVD })
  }

  async function handleConfirmVenta() {
    if (!confirmVenta) return
    setSavingVenta(true)
    try {
      const res = await fetch(`/api/tiendas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ventaMensualSoles: confirmVenta.nuevaMensual.toFixed(2) }),
      })
      const updated = await res.json()
      if (updated.id) {
        setTienda((prev: any) => ({ ...prev, ...updated }))
        setForm((prev: any) => ({ ...prev, ...updated }))
        fetch(`/api/tiendas/historial?tiendaId=${id}`).then(r => r.json()).then(d => {
          setHistorial(Array.isArray(d) ? d : [])
        })
      }
    } finally {
      setSavingVenta(false)
      setConfirmVenta(null)
      setEditingVentas(false)
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
  // contingencia_activa puede ser de ROUTER_EXTERNO — en ese caso no se muestra como propia de la tienda
  const hayRouterExternoActivo = routersTienda.some((r: any) => r.estado === 'EN_TIENDA_ACTIVO')
  const contStatus = contingenciaStatus({ ...tienda, contingenciaActiva: tienda.contingenciaActiva && !hayRouterExternoActivo })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* ── Filtro de período global ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 500, flexShrink: 0 }}>Período</span>
        <input
          type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
          style={{ padding: '5px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', colorScheme: 'dark' }}
        />
        <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>—</span>
        <input
          type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
          style={{ padding: '5px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', colorScheme: 'dark' }}
        />
      </div>

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
          {tienda.contingenciaActiva && !hayRouterExternoActivo && (
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', background: '#fef3c7', color: '#92400e', border: '0.5px solid #f59e0b' }}>
              Contingencia activa
            </span>
          )}
          {hayRouterExternoActivo && (
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', background: '#FFF7ED', color: '#C2410C', border: '0.5px solid #FDBA74' }}>
              Router externo activo
            </span>
          )}
        </div>

        {/* KPI mini inline */}
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
          {tienda.costoMensual && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: '13px' }}>S/ {Number(tienda.costoMensual).toLocaleString('es-PE')}</div>
              <div style={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>/mes costo</div>
            </div>
          )}
          {(tienda.ventaHoraSoles || tienda.ventaHoraFdsSoles || tienda.ventaMensualSoles) && (
            <button
              onClick={() => setVentasExpanded(v => !v)}
              style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 8px', border: '0.5px solid var(--border)', borderRadius: '7px', background: ventasExpanded ? 'var(--muted)' : 'var(--card)', cursor: 'pointer' }}>
              {tienda.ventaHoraSoles && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#15803d', fontSize: '12px' }}>S/ {Number(tienda.ventaHoraSoles).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                  <div style={{ fontSize: '8px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>L-J /h</div>
                </div>
              )}
              {tienda.ventaHoraFdsSoles && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '12px' }}>S/ {Number(tienda.ventaHoraFdsSoles).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                  <div style={{ fontSize: '8px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>V-D /h</div>
                </div>
              )}
              {tienda.ventaMensualSoles && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: '12px' }}>S/ {Number(tienda.ventaMensualSoles).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                  <div style={{ fontSize: '8px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>/mes venta</div>
                </div>
              )}
              <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>{ventasExpanded ? '▲' : '▼'}</span>
            </button>
          )}
          {iei30d !== null && (
            <button onClick={() => setIeiPanelOpen(true)}
              style={{ textAlign: 'right', background: 'none', border: '0.5px solid var(--border)', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer' }}>
              <div style={{ fontWeight: 700, color: iei30d > 0 ? '#b91c1c' : '#16a34a', fontSize: '12px' }}>
                {iei30d > 0 ? `S/ ${iei30d.toLocaleString('es-PE')}` : 'S/ 0'}
              </div>
              <div style={{ fontSize: '8px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>IEI período ↗</div>
            </button>
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

      {/* ── Panel expandible de ventas ── */}
      {ventasExpanded && (tienda.ventaHoraSoles || tienda.ventaHoraFdsSoles || tienda.ventaMensualSoles) && (() => {
        const lj  = parseFloat(tienda.ventaHoraSoles     ?? '0')
        const vd  = parseFloat(tienda.ventaHoraFdsSoles  ?? '0')
        const mes = parseFloat(tienda.ventaMensualSoles   ?? '0')
        const semLJ = lj * 48
        const semVD = vd * 36
        const fmt = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        const fmt2 = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        return (
          <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 16px' }}>
            {/* Badge fuente de datos */}
            {tienda.fuenteVentas === 'ESTIMADO' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 9px', marginBottom: '10px', borderRadius: '5px', background: '#fef9c3', border: '0.5px solid #ca8a04', fontSize: '10px', fontWeight: 600, color: '#713f12' }}>
                Estimado — datos limitados (muestra reducida)
              </div>
            )}
            {tienda.fuenteVentas === 'REFERENCIA' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 9px', marginBottom: '10px', borderRadius: '5px', background: '#ffedd5', border: '0.5px solid #f97316', fontSize: '10px', fontWeight: 600, color: '#9a3412' }}>
                Referencia cluster {tienda.cluster ?? '?'} — sin data propia
              </div>
            )}

            {/* Tabla de valores */}
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: editingVentas ? '12px' : '0' }}>
              {[
                { label: 'Venta sem. L-J', value: `S/ ${fmt(semLJ)}` },
                { label: 'Venta sem. V-D', value: `S/ ${fmt(semVD)}` },
                { label: 'Venta semanal total', value: `S/ ${fmt(semLJ + semVD)}` },
                { label: 'Venta mensual', value: `S/ ${fmt(mes)}` },
                { label: 'Venta/hora L-J', value: `S/ ${fmt2(lj)}` },
                { label: 'Venta/hora V-D', value: `S/ ${fmt2(vd)}` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', fontFamily: 'monospace' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Edit venta mensual */}
            {canEdit && !editingVentas && (
              <button
                onClick={() => { setVentaMensualInput(mes > 0 ? mes.toFixed(2) : ''); setEditingVentas(true) }}
                style={{ marginTop: '10px', padding: '4px 10px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--muted)', color: 'var(--foreground)', cursor: 'pointer' }}>
                Actualizar venta mensual
              </button>
            )}
            {editingVentas && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Nueva venta mensual (S/.)</div>
                <input
                  type="number"
                  value={ventaMensualInput}
                  onChange={e => setVentaMensualInput(e.target.value)}
                  placeholder="Ej: 175000"
                  style={{ padding: '4px 8px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', width: '140px' }}
                />
                <button
                  onClick={previewVentaUpdate}
                  disabled={!ventaMensualInput || isNaN(parseFloat(ventaMensualInput))}
                  style={{ padding: '4px 12px', fontSize: '11px', border: 'none', borderRadius: '6px', background: 'hsl(221,83%,23%)', color: 'white', cursor: 'pointer', opacity: (!ventaMensualInput || isNaN(parseFloat(ventaMensualInput))) ? 0.5 : 1 }}>
                  Guardar
                </button>
                <button
                  onClick={() => setEditingVentas(false)}
                  style={{ padding: '4px 10px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--muted)', color: 'var(--foreground)', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )
      })()}

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
                  <select value={form.cluster ?? ''} onChange={e => handleClusterChange(e.target.value)}
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

          {/* Card D: Contingencia propia + Extras (no se muestra activada si la única activa es ROUTER_EXTERNO) */}
          <div style={{ background: (tienda.contingenciaActiva && !hayRouterExternoActivo) ? '#fffbeb' : 'var(--card)', border: `0.5px solid ${(tienda.contingenciaActiva && !hayRouterExternoActivo) ? '#f59e0b' : 'var(--border)'}`, borderRadius: '10px', padding: '12px 14px' }}>
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
              {/* Estado — solo muestra Activada si es contingencia propia (ROUTER_PROPIO) */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Estado</div>
                {(tienda.contingenciaActiva && !hayRouterExternoActivo)
                  ? <span style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 7px', borderRadius: '4px' }}>Activada</span>
                  : <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Desactivada</span>}
              </div>
              <Field label="Chip"    value={form.contingenciaChip    ?? ''} editing={editing} onChange={v => setF('contingenciaChip', v)} />
              <Field label="Paquete" value={form.contingenciaPaquete ?? ''} editing={editing} onChange={v => setF('contingenciaPaquete', v)} />
            </div>

            {(tienda.contingenciaActiva && !hayRouterExternoActivo) && (
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
              {(() => {
                const yaHayActiva = contList.some((c: any) => !c.horaDesactivacion)
                if (yaHayActiva && !showContForm) {
                  return (
                    <div style={{ padding: '8px 10px', background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.4)', borderRadius: '7px', fontSize: '11px', color: '#92400e', textAlign: 'center' }}>
                      Ya hay una contingencia activa
                    </div>
                  )
                }
                if (!showContForm) {
                  return (
                    <button onClick={() => setShowContForm(true)}
                      style={{ padding: '9px 12px', background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.5)', borderRadius: '7px', fontSize: '12px', fontWeight: 500, color: '#92400e', cursor: 'pointer', textAlign: 'center' }}>
                      Activar contingencia
                    </button>
                  )
                }
                return null
              })()}
              {showContForm && (() => {
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
          {/* Routers externos en esta tienda */}
          {routersTienda.length > 0 && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '10px', padding: '12px 14px' }}>
              <SectionTitle>Router{routersTienda.length > 1 ? 's' : ''} externo{routersTienda.length > 1 ? 's' : ''} en tienda</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {routersTienda.map((r: any) => {
                  const activo = r.estado === 'EN_TIENDA_ACTIVO'
                  return (
                    <div key={r.id} style={{ padding: '8px 10px', background: 'white', borderRadius: '7px', border: `0.5px solid ${activo ? '#F59E0B' : '#E5E7EB'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '14px', color: '#92400E' }}>{r.codigo}</span>
                        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px', background: activo ? '#FEF3C7' : '#E0E7FF', color: activo ? '#92400E' : '#3730A3' }}>
                          {activo ? 'ACTIVO' : 'inactivo'}
                        </span>
                        {r.fecha_ingreso_actual && (
                          <span style={{ fontSize: '10px', color: '#92400E', opacity: 0.75 }}>
                            Desde {new Date(r.fecha_ingreso_actual).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', timeZone: 'America/Lima' })}
                          </span>
                        )}
                        {!activo && (
                          <span style={{ fontSize: '9px', color: '#6B7280', flex: 1, textAlign: 'right', fontStyle: 'italic' }}>
                            Inactivo · actívalo desde el incidente
                          </span>
                        )}
                      </div>
                      {activo && r.cont_observacion_actual && (
                        <div style={{ marginTop: '5px', fontSize: '10px', color: '#78350F', background: '#FEF3C7', borderRadius: '5px', padding: '4px 7px', lineHeight: 1.4 }}>
                          {r.cont_observacion_actual}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {contList.filter((c: any) => !c.horaDesactivacion && c.tipo !== 'ROUTER_EXTERNO').length > 0 && (() => {
            const activas = contList.filter((c: any) => !c.horaDesactivacion && c.tipo !== 'ROUTER_EXTERNO')
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

          {/* SLA (30d) */}
          {tienda && (
            <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
              <SectionTitle>SLA proveedor (30d){tienda.slaTienda?.totalEvaluables > 0 ? ` — ${tienda.slaTienda.totalEvaluables} inc. eval.` : ''}</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { label: 'SLA Respuesta',      value: tienda.slaTienda?.scoreRespuestaPromedio  != null ? `${tienda.slaTienda.scoreRespuestaPromedio}%`  : '—', score: tienda.slaTienda?.scoreRespuestaPromedio  ?? null },
                  { label: 'T. resp. promedio',  value: tienda.slaTienda?.tRespuestaPromedio      != null ? `${tienda.slaTienda.tRespuestaPromedio} min`    : '—', score: null },
                  { label: 'SLA Resolución',     value: tienda.slaTienda?.scoreResolucionPromedio != null ? `${tienda.slaTienda.scoreResolucionPromedio}%` : '—', score: tienda.slaTienda?.scoreResolucionPromedio ?? null },
                  { label: 'T. resol. promedio', value: tienda.slaTienda?.tResolucionPromedio     != null ? `${tienda.slaTienda.tResolucionPromedio} min`   : '—', score: null },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '0.5px solid var(--border)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{r.label}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: r.score != null ? (r.score >= 80 ? '#16a34a' : r.score >= 60 ? '#d97706' : '#dc2626') : 'var(--muted-foreground)' }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
            const totalContMin = (contStats.min_router_propio ?? 0) + (contStats.min_router_externo ?? 0) + (contStats.min_datos_moviles ?? 0)
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
                  {rows.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderTop: '0.5px solid var(--border)', marginTop: '2px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--foreground)' }}>Total contingencia</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', fontFamily: 'monospace' }}>{mhm(totalContMin)}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Historial — botón que abre panel lateral */}
          <button
            onClick={() => setHistorialOpen(true)}
            style={{ width: '100%', background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Historial de cambios</span>
            <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{historial.length > 0 ? `${historial.length} cambios` : 'Sin cambios'} →</span>
          </button>
        </div>
      </div>

      {/* ── Side panel IEI 30d ── */}
      {ieiPanelOpen && (
        <div onClick={() => setIeiPanelOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.22)' }} />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '95vw',
        background: 'var(--card)', borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 28px rgba(0,0,0,0.13)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        transform: ieiPanelOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.26s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--muted)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>IEI del período — {tienda?.codigo}</div>
            <div style={{ fontSize: '11px', color: iei30d && iei30d > 0 ? '#b91c1c' : 'var(--muted-foreground)', fontWeight: 600 }}>
              Total: {iei30d != null ? (iei30d > 0 ? `S/ ${iei30d.toLocaleString('es-PE')}` : 'S/ 0') : '—'}
            </div>
          </div>
          <button onClick={() => setIeiPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {iei30dBreakdown.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px', padding: '32px 0' }}>
              Sin incidentes con IEI en el período
            </div>
          ) : (() => {
            const TIPO_LABEL: Record<string, string> = {
              CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
              LENTITUD: 'Lentitud', CORTE_ELECTRICO: 'Corte eléctrico', OTROS: 'Otros', POS: 'POS',
            }
            return iei30dBreakdown.map((inc: any) => {
              const esCorte = inc.tipo === 'CORTE_ELECTRICO'
              return (
                <div key={inc.id}
                  style={{ background: esCorte ? '#fffbeb' : 'var(--background)', borderRadius: '8px', padding: '10px 12px', border: `0.5px solid ${esCorte ? '#f59e0b' : 'var(--border)'}`, cursor: 'pointer' }}
                  onClick={() => router.push(`/incidentes/${inc.id}`)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600 }}>{inc.codigo}</span>
                      {esCorte && (
                        <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: '#fef3c7', color: '#92400e', border: '0.5px solid #f59e0b' }}>
                          ⚡ Corte de energía
                        </span>
                      )}
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: esCorte ? '#92400e' : '#b91c1c' }}>S/ {inc.iei.toLocaleString('es-PE')}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '10px', color: esCorte ? '#78350f' : 'var(--muted-foreground)' }}>
                    <span>{TIPO_LABEL[inc.tipo] ?? inc.tipo}</span>
                    {inc.mttrMinutos && <span>{inc.mttrMinutos >= 60 ? `${Math.floor(inc.mttrMinutos/60)}h ${inc.mttrMinutos%60}m` : `${inc.mttrMinutos}m`}</span>}
                    <span style={{ flex: 1, textAlign: 'right', textTransform: 'capitalize' }}>{inc.motivo}</span>
                  </div>
                </div>
              )
            })
          })()}
        </div>
      </div>

      {/* Side panel — Historial de cambios */}
      {historialOpen && (
        <div onClick={() => setHistorialOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.22)' }} />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '95vw',
        background: 'var(--card)', borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 28px rgba(0,0,0,0.13)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        transform: historialOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.26s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--muted)', flexShrink: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>Historial de cambios — {tienda?.codigo}</div>
          <button onClick={() => setHistorialOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted-foreground)', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {historial.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px', padding: '32px 0' }}>Sin cambios registrados</div>
          ) : historial.map((h: any) => {
            const fechaExacta = h.editadoEn
              ? new Date(h.editadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '—'
            return (
              <div key={h.id} style={{ background: 'var(--background)', borderRadius: '8px', padding: '10px 12px', border: '0.5px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>{CAMPO_LABELS[h.campoEditado] ?? h.campoEditado}</span>
                  <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap', marginLeft: '8px' }}>{relTime(h.editadoEn)}</span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>{fechaExacta}</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', fontSize: '11px', alignItems: 'center' }}>
                  {h.valorAnterior && <span style={{ textDecoration: 'line-through', color: 'var(--muted-foreground)' }}>{h.valorAnterior}</span>}
                  {h.valorAnterior && h.valorNuevo && <span style={{ color: 'var(--muted-foreground)' }}>→</span>}
                  {h.valorNuevo && <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>{h.valorNuevo}</span>}
                  {!h.valorAnterior && !h.valorNuevo && <span style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>sin valor</span>}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '4px' }}>por <strong>{h.usuarioNombre ?? 'Sistema'}</strong></div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Modal: confirmar cambio de cluster ── */}
      {pendingCluster !== null && (
        <div onClick={() => setPendingCluster(null)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '22px 24px', width: '340px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>Cambiar cluster</div>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '18px', lineHeight: 1.5 }}>
              ¿Confirmas cambiar el cluster de{' '}
              <strong>{form.cluster ? `Cluster ${form.cluster}` : 'Sin cluster'}</strong>
              {' '}a{' '}
              <strong>{pendingCluster ? `Cluster ${pendingCluster}` : 'Sin cluster'}</strong>?
              <br />Este cambio afecta el cálculo del IEI si la tienda no tiene data propia de ventas.
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingCluster(null)}
                style={{ padding: '6px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', color: 'var(--foreground)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={confirmClusterChange}
                style={{ padding: '6px 14px', fontSize: '12px', border: 'none', borderRadius: '7px', background: 'hsl(221,83%,23%)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                Confirmar cambio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: confirmar actualización de venta mensual ── */}
      {confirmVenta && (
        <div onClick={() => setConfirmVenta(null)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '22px 24px', width: '380px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>Actualizar venta mensual</div>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '14px' }}>
              Se recalcularán los valores de venta por hora automáticamente:
            </div>
            <div style={{ background: 'var(--muted)', borderRadius: '8px', padding: '12px', marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { label: 'Nueva venta mensual', value: `S/ ${confirmVenta.nuevaMensual.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
                { label: 'Nueva venta/hora L-J', value: `S/ ${confirmVenta.nuevaLJ.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                { label: 'Nueva venta/hora V-D', value: `S/ ${confirmVenta.nuevaVD.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>{label}</span>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmVenta(null)} disabled={savingVenta}
                style={{ padding: '6px 14px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--muted)', color: 'var(--foreground)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleConfirmVenta} disabled={savingVenta}
                style={{ padding: '6px 14px', fontSize: '12px', border: 'none', borderRadius: '7px', background: 'hsl(221,83%,23%)', color: 'white', fontWeight: 600, cursor: 'pointer', opacity: savingVenta ? 0.7 : 1 }}>
                {savingVenta ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incidentes del período */}
      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginTop: '16px' }}>
        <div style={{ padding: '12px 18px', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)' }}>Incidentes del período</div>
        </div>
        {incRecientes.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '12px' }}>Sin incidentes registrados</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--muted)' }}>
                {['Código', 'Fecha', 'Tipo', 'MTTR', 'IEI est.', 'Estado'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incRecientes.map((inc: any) => {
                const eb = estadoBadge(inc.estado)
                return (
                  <tr key={inc.id}
                    style={{ borderTop: '0.5px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => router.push(`/incidentes/${inc.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600, fontSize: '11px' }}>{inc.codigo}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)', fontSize: '11px' }}>{fmtTs(inc.hora_registro)}</td>
                    <td style={{ padding: '8px 10px', fontSize: '11px' }}>{tipoLabel(inc.tipo)}</td>
                    <td style={{ padding: '8px 10px', fontSize: '11px' }}>{inc.mttr_minutos ? `${inc.mttr_minutos}m` : '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: '11px', fontFamily: 'monospace' }}>
                      {inc.iei != null
                        ? <span style={{ color: inc.iei > 0 ? '#b91c1c' : '#16a34a', fontWeight: 600 }}>
                            {inc.iei > 0 ? `S/ ${inc.iei.toLocaleString('es-PE')}` : 'S/ 0'}
                          </span>
                        : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                    </td>
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
  )
}
