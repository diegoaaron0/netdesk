'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { TiendaAutocomplete, Tienda } from '@/components/incidentes/TiendaAutocomplete'
import { GuiaEscalamiento } from '@/components/incidentes/GuiaEscalamiento'
import { Badge, estadoToVariant, impactoToVariant } from '@/components/ui/Badge'

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
}

function mttrDisplay(minutos: number | null): string {
  if (!minutos) return ''
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fieldLabel(text: string, required?: boolean) {
  return (
    <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' }}>
      {text}{required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
    </label>
  )
}

const iSel: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: '13px',
  border: '1px solid var(--border)', borderRadius: '8px',
  background: 'var(--card)', color: 'var(--foreground)', outline: 'none',
}
const iReadonly: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: '12px',
  border: '1px solid var(--border)', borderRadius: '8px',
  background: 'var(--muted)', color: 'var(--muted-foreground)',
  fontFamily: 'monospace',
}

function ResumenRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: '24px', flexShrink: 0, color: 'var(--muted-foreground)' }}>{icon}</div>
      <div style={{ width: '130px', flexShrink: 0, fontSize: '11px', color: 'var(--muted-foreground)' }}>{label}</div>
      <div style={{ flex: 1, fontSize: '12px', fontWeight: 500, color: 'var(--foreground)' }}>{children}</div>
    </div>
  )
}

// Icons
const IcoInfo    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
const IcoClip   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
const IcoStore  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
const IcoWifi   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
const IcoCid    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
const IcoConn   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
const IcoClust  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
const IcoImpact = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
const IcoType   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
const IcoUsers  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
const IcoStatus = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
const IcoPhone  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
const IcoWA     = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
const IcoUser   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const IcoDoc    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
const IcoArrow  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
const IcoExt    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
const IcoShield = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>

export default function NuevoIncidentePage() {
  const router = useRouter()
  const { data: session } = useSession()
  const userName = (session?.user as any)?.name ?? '—'

  const [tienda, setTienda]     = useState<Tienda | null>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [saving, setSaving]     = useState(false)
  const [showGuia, setShowGuia] = useState(false)
  const [form, setForm] = useState({
    nivelImpacto:        'ALTO',
    tipo:                'CAIDA_TOTAL',
    tipoPersonalizado:   '',
    otrosClasificacion:  '',
    usuariosAfectados:   '',
    descripcionInicial:  '',
    estado:              'ABIERTO',
  })

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tienda) return alert('Selecciona una tienda')
    setSaving(true)
    const res = await fetch('/api/incidentes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        tiendaId: tienda.id,
        tipoPersonalizado:  form.tipo === 'OTROS' ? form.tipoPersonalizado  : null,
        otrosClasificacion: form.tipo === 'OTROS' ? form.otrosClasificacion : null,
      }),
    })
    if (res.ok) {
      const inc = await res.json()
      router.push(`/incidentes/${inc.id}`)
    } else {
      setSaving(false)
      alert('Error al registrar el incidente')
    }
  }

  const tipoLabel = form.tipo === 'OTROS' && form.tipoPersonalizado
    ? form.tipoPersonalizado
    : (TIPO_LABELS[form.tipo] ?? form.tipo)

  return (
    <form onSubmit={handleSubmit}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button type="button" onClick={() => router.push('/incidentes')}
          style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)', cursor: 'pointer', color: 'var(--foreground)', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--foreground)', lineHeight: 1.2 }}>Nuevo incidente</h1>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Registra la información inicial del incidente</div>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px', alignItems: 'start' }}>

        {/* ── LEFT COLUMN ── */}
        <div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            {/* Section header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'var(--muted-foreground)' }}><IcoInfo /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>A. Identificación</div>
                <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '1px' }}>Completa la información principal para registrar el incidente.</div>
              </div>
              {/* Tooltip guía de escalamiento */}
              <div style={{ position: 'relative', flexShrink: 0 }}
                onMouseEnter={() => setShowGuia(true)}
                onMouseLeave={() => setShowGuia(false)}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1.5px solid var(--border)', background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', userSelect: 'none' }}>?</div>
                {tienda?.proveedor?.instruccionGeneral && (
                  <div style={{ position: 'absolute', top: '26px', right: 0, zIndex: 200, minWidth: '300px', opacity: showGuia ? 1 : 0, pointerEvents: showGuia ? 'auto' : 'none', transition: 'opacity 0.2s ease', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', borderRadius: '10px', overflow: 'hidden' }}>
                    <GuiaEscalamiento proveedor={tienda.proveedor.nombre} instruccion={tienda.proveedor.instruccionGeneral} />
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* TIENDA */}
              <div>
                {fieldLabel('Tienda', true)}
                <TiendaAutocomplete onSelect={(t, h) => { setTienda(t); setHistorial(h) }} />
                {tienda?.administradorCelular && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    <IcoPhone />
                    <span>Contacto tienda: <strong style={{ color: 'var(--foreground)' }}>{tienda.administradorCelular}</strong></span>
                  </div>
                )}
              </div>

              {/* Readonly row: CID | Proveedor | Tipo conexión | Cluster + Contingencia */}
              {tienda && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                    {[
                      { label: 'CID / Servicio', value: tienda.cidServicio ?? '—' },
                      { label: 'Proveedor',       value: tienda.proveedor?.nombre ?? '—' },
                      { label: 'Tipo de conexión',value: tienda.tipoConexion ?? '—' },
                      { label: 'Cluster',          value: tienda.cluster ?? '—' },
                    ].map(f => (
                      <div key={f.label}>
                        {fieldLabel(f.label)}
                        <div style={iReadonly}>{f.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Contingencia:</span>
                    <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: tienda.tieneContingencia ? '#dcfce7' : 'var(--muted)', color: tienda.tieneContingencia ? '#15803d' : 'var(--muted-foreground)', border: `1px solid ${tienda.tieneContingencia ? '#86efac' : 'var(--border)'}` }}>
                      {tienda.tieneContingencia ? 'Sí' : 'No'}
                    </span>
                  </div>
                </div>
              )}

              {/* Editable row: Nivel impacto | Tipo incidente | Usuarios afectados */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  {fieldLabel('Nivel de impacto', true)}
                  <select style={iSel} value={form.nivelImpacto} onChange={e => set('nivelImpacto', e.target.value)}>
                    <option value="ALTO">● Alto</option>
                    <option value="MEDIO">● Medio</option>
                    <option value="BAJO">● Bajo</option>
                  </select>
                </div>
                <div>
                  {fieldLabel('Tipo de incidente', true)}
                  <select style={iSel} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                    <option value="CAIDA_TOTAL">Caída total</option>
                    <option value="INTERMITENCIA">Intermitencia</option>
                    <option value="LENTITUD">Lentitud</option>
                    <option value="POS">POS</option>
                    <option value="OTROS">Otro...</option>
                  </select>
                  {form.tipo === 'OTROS' && (
                    <>
                      <input
                        style={{ ...iSel, marginTop: '6px' }}
                        placeholder="Describe brevemente el problema"
                        required
                        value={form.tipoPersonalizado}
                        onChange={e => set('tipoPersonalizado', e.target.value)}
                      />
                      <select
                        style={{ ...iSel, marginTop: '6px' }}
                        value={form.otrosClasificacion}
                        onChange={e => set('otrosClasificacion', e.target.value)}
                      >
                        <option value="">Clasificación (opcional)</option>
                        <option value="Energía">Energía (corte eléctrico, UPS, generador)</option>
                        <option value="Router / Equipo">Router / Equipo (apagado, reinicio, falla hardware)</option>
                        <option value="Sistema / Software">Sistema / Software (configuración, firmware)</option>
                        <option value="Cableado">Cableado (fibra cortada, conector)</option>
                        <option value="Usuario">Usuario (error operativo)</option>
                        <option value="No clasificado">No clasificado</option>
                      </select>
                    </>
                  )}
                </div>
                <div>
                  {fieldLabel('Usuarios afectados', true)}
                  <input style={iSel} type="number" min="0" placeholder="Ej: 4"
                    value={form.usuariosAfectados} onChange={e => set('usuariosAfectados', e.target.value)} />
                </div>
              </div>

              {/* Estado inicial */}
              <div style={{ maxWidth: '220px' }}>
                {fieldLabel('Estado inicial', true)}
                <select style={iSel} value={form.estado} onChange={e => set('estado', e.target.value)}>
                  <option value="ABIERTO">ABIERTO</option>
                </select>
              </div>

            </div>
          </div>

          {/* Bottom buttons */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button type="submit" disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 24px', background: saving ? 'hsl(221,83%,35%)' : 'hsl(221,83%,45%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer', boxShadow: '0 1px 3px rgba(59,130,246,0.3)' }}>
                <IcoDoc />
                {saving ? 'Registrando...' : 'Registrar incidente'}
              </button>
              <button type="button" onClick={() => router.push('/incidentes')}
                style={{ padding: '11px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--foreground)' }}>
                Cancelar
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
              <IcoInfo />
              Solo rellena lo que sabes ahora — puedes completar el resto después.
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Resumen del incidente */}
          <div style={{ background: 'var(--card)', border: '2px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--muted)' }}>
              <span style={{ color: 'var(--muted-foreground)' }}><IcoClip /></span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>Resumen del incidente</div>
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>Información clave del incidente que se está registrando.</div>
              </div>
            </div>

            <div style={{ padding: '14px 16px' }}>
              {/* Registrado por + Contacto Tienda */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '3px' }}><IcoUser /> Registrado por</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>{userName}</div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '3px' }}><IcoWA /> Contacto Tienda</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>{tienda?.administradorCelular ?? '—'}</div>
                </div>
              </div>

              {/* Rows */}
              <ResumenRow icon={<IcoStore />} label="Tienda">
                {tienda ? `${tienda.codigo} — ${tienda.nombreCc}` : '—'}
              </ResumenRow>
              <ResumenRow icon={<IcoWifi />} label="Proveedor">
                {tienda?.proveedor?.nombre ?? '—'}
              </ResumenRow>
              <ResumenRow icon={<IcoCid />} label="CID / Servicio">
                <span style={{ fontFamily: 'monospace' }}>{tienda?.cidServicio ?? '—'}</span>
              </ResumenRow>
              <ResumenRow icon={<IcoConn />} label="Tipo de conexión">
                {tienda?.tipoConexion ?? '—'}
              </ResumenRow>
              <ResumenRow icon={<IcoClust />} label="Cluster">
                {tienda?.cluster ?? '—'}
              </ResumenRow>
              <ResumenRow icon={<IcoShield />} label="Contingencia">
                {tienda ? (tienda.tieneContingencia ? 'Sí' : 'No') : '—'}
              </ResumenRow>
              <ResumenRow icon={<IcoImpact />} label="Nivel de impacto">
                <Badge variant={impactoToVariant(form.nivelImpacto)} />
              </ResumenRow>
              <ResumenRow icon={<IcoType />} label="Tipo de incidente">
                {tipoLabel}
              </ResumenRow>
              <ResumenRow icon={<IcoUsers />} label="Usuarios afectados">
                {form.usuariosAfectados || '—'}
              </ResumenRow>
              <ResumenRow icon={<IcoStatus />} label="Estado inicial">
                <Badge variant={estadoToVariant(form.estado)} />
              </ResumenRow>
            </div>
          </div>

          {/* Historial reciente */}
          {tienda && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>Historial reciente de la tienda</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>Últimos incidentes registrados en esta tienda.</div>
                </div>
                <a
                  href={`/tiendas/${tienda.id}`}
                  onClick={e => { e.preventDefault(); router.push(`/tiendas/${tienda.id}`) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'hsl(221,83%,50%)', textDecoration: 'none', whiteSpace: 'nowrap', marginTop: '2px' }}>
                  Ver historial completo <IcoExt />
                </a>
              </div>

              <div style={{ padding: '0 16px' }}>
                {historial.length === 0 ? (
                  <div style={{ padding: '16px 0', fontSize: '11px', color: 'var(--muted-foreground)', textAlign: 'center' }}>
                    Sin incidentes previos
                  </div>
                ) : historial.map((h, idx) => {
                  const mttr = h.mttrMinutos
                    ? mttrDisplay(h.mttrMinutos)
                    : (h.horaFin ? mttrDisplay(Math.round((new Date(h.horaFin).getTime() - new Date(h.horaRegistro).getTime()) / 60000)) : null)
                  return (
                    <div key={h.id}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', borderBottom: idx < historial.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
                      onClick={() => router.push(`/incidentes/${h.id}`)}>
                      <div style={{ flexShrink: 0 }}><Badge variant={estadoToVariant(h.estado)} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, color: 'var(--foreground)' }}>{h.codigo}</div>
                        <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>
                          {new Date(h.horaRegistro).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' })}
                          {' · '}
                          {new Date(h.horaRegistro).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', textAlign: 'right', flexShrink: 0 }}>
                        <div>{TIPO_LABELS[h.tipo] ?? h.tipo}</div>
                        {mttr && <div style={{ color: 'var(--foreground)', fontWeight: 500 }}>{mttr}</div>}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', flexShrink: 0, maxWidth: '80px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.agenteName ?? '—'}
                      </div>
                      <div style={{ color: 'var(--muted-foreground)', flexShrink: 0 }}><IcoArrow /></div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  )
}
