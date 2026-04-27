'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { TiendaAutocomplete, Tienda } from '@/components/incidentes/TiendaAutocomplete'
import { GuiaEscalamiento } from '@/components/incidentes/GuiaEscalamiento'
import { Badge, estadoToVariant } from '@/components/ui/Badge'

const TIPO_LABELS: Record<string, string> = {
  CAIDA_TOTAL: 'Caída total', INTERMITENCIA: 'Intermitencia',
  LENTITUD: 'Lentitud', POS: 'POS', OTROS: 'Otros',
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'start', gap: '8px', marginBottom: '10px' }}>
      <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--muted-foreground)', paddingTop: '7px' }}>{label}</label>
      <div>{children}</div>
    </div>
  )
}

function ReadonlyField({ value, mono }: { value: string; mono?: boolean }) {
  return (
    <div style={{ padding: '7px 10px', fontSize: '12px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', color: 'var(--muted-foreground)', fontFamily: mono ? 'monospace' : undefined }}>
      {value}
    </div>
  )
}

function inputStyle() {
  return { width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }
}

function selectStyle() {
  return { width: '100%', padding: '7px 10px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '8px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }
}

export default function NuevoIncidentePage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [tienda, setTienda] = useState<Tienda | null>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nivelImpacto: 'ALTO',
    tipo: 'CAIDA_TOTAL',
    usuariosAfectados: '',
    descripcionInicial: '',
    estado: 'ABIERTO',
  })

  const userName = session?.user?.name ?? ''
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tienda) return alert('Selecciona una tienda')
    setSaving(true)
    const res = await fetch('/api/incidentes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, tiendaId: tienda.id }),
    })
    if (res.ok) {
      const inc = await res.json()
      router.push(`/incidentes/${inc.id}`)
    } else {
      setSaving(false)
      alert('Error al registrar el incidente')
    }
  }

  return (
    <div style={{ maxWidth: '700px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Nuevo incidente</h1>
        <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>Solo rellena lo que sabes ahora — puedes completar el resto después</div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ background: 'var(--card)', borderRadius: '10px', border: '0.5px solid var(--border)', marginBottom: '14px' }}>
          <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--border)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600 }}>A — Identificación</div>
          </div>
          <div style={{ padding: '16px' }}>
            <FieldRow label="Registrado por"><ReadonlyField value={userName} /></FieldRow>

            <FieldRow label="Tienda">
              <TiendaAutocomplete onSelect={(t, h) => { setTienda(t); setHistorial(h) }} />
            </FieldRow>

            {tienda?.proveedor?.instruccionGeneral && (
              <div style={{ marginBottom: '10px' }}>
                <GuiaEscalamiento proveedor={tienda.proveedor.nombre} instruccion={tienda.proveedor.instruccionGeneral} />
              </div>
            )}

            {tienda && (
              <>
                <FieldRow label="Proveedor"><ReadonlyField value={tienda.proveedor?.nombre ?? '—'} /></FieldRow>
                <FieldRow label="Tipo conexión"><ReadonlyField value={tienda.tipoConexion ?? '—'} /></FieldRow>
                <FieldRow label="CID / Servicio"><ReadonlyField value={tienda.cidServicio ?? '—'} mono /></FieldRow>
              </>
            )}

            <FieldRow label="Nivel de impacto">
              <select style={selectStyle()} value={form.nivelImpacto} onChange={e => set('nivelImpacto', e.target.value)}>
                <option value="ALTO">Alto</option>
                <option value="MEDIO">Medio</option>
                <option value="BAJO">Bajo</option>
              </select>
            </FieldRow>

            <FieldRow label="Tipo de incidente">
              <select style={selectStyle()} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                {Object.entries(TIPO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FieldRow>

            <FieldRow label="Usuarios afectados">
              <input style={inputStyle()} value={form.usuariosAfectados} onChange={e => set('usuariosAfectados', e.target.value)} placeholder="Ej: Todo el personal de caja" />
            </FieldRow>

            <FieldRow label="Descripción inicial">
              <input style={inputStyle()} value={form.descripcionInicial} onChange={e => set('descripcionInicial', e.target.value)} placeholder="Ej: info que escuchaste" />
            </FieldRow>

            <FieldRow label="Estado inicial">
              <select style={selectStyle()} value={form.estado} onChange={e => set('estado', e.target.value)}>
                {['ABIERTO','EN_SEGUIMIENTO','ESCALADO_N1','ESCALADO_N2','ESCALADO_N3'].map(e => (
                  <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </FieldRow>

            {historial.length > 0 && (
              <div style={{ marginTop: '4px', padding: '12px', background: 'var(--muted)', borderRadius: '8px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                  Historial de la tienda
                </div>
                {historial.map(h => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', fontSize: '11px' }}>
                    <Badge variant={estadoToVariant(h.estado)} />
                    <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{h.codigo}</span>
                    <span style={{ color: 'var(--muted-foreground)' }}>{TIPO_LABELS[h.tipo] ?? h.tipo}</span>
                    <span style={{ color: 'var(--muted-foreground)', marginLeft: 'auto' }}>
                      {new Date(h.horaRegistro).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => router.back()}
            style={{ padding: '9px 20px', background: 'var(--muted)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            style={{ padding: '9px 20px', background: 'hsl(221,83%,23%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Registrando...' : 'Registrar incidente'}
          </button>
        </div>
      </form>
    </div>
  )
}
