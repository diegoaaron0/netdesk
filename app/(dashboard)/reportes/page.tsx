'use client'
import { useState } from 'react'

function todayStr()                   { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number)           { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10) }
function firstOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }
function lastOfMonth(d = new Date())  { return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) }
function prevMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return { desde: firstOfMonth(d), hasta: lastOfMonth(d) }
}
function triggerBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const EXPORT_CARDS = [
  {
    id: 'gerencial',
    titulo: 'Reporte Gerencial',
    icono: '🏢',
    color: '#185FA5',
    bg: '#E6F1FB',
    desc: 'Resumen ejecutivo con variación vs período anterior · SLA y MTTR por proveedor · T. respuesta N1 · Escalados N2+ · Top 15 tiendas · Distribución por tipo · Tiendas reincidentes · Por zona · Tendencia SLA 6 meses',
    path: '/api/reportes/export/gerencial',
    full: true,
  },
  {
    id: 'proveedores',
    titulo: 'Seguimiento Proveedores',
    icono: '📋',
    color: '#1D9E75',
    bg: '#EAF3DE',
    desc: 'SLA % · MTTR prom · T. respuesta N1 · Escalados N2+ · Tiendas afectadas · IEI estimado · Detalle por tienda con tipo más frecuente y SLA individual',
    path: '/api/reportes/export/proveedores',
    full: false,
  },
  {
    id: 'fuera-sla',
    titulo: 'Incumplimientos SLA',
    icono: '⚠️',
    color: '#B91C1C',
    bg: '#FEE2E2',
    desc: 'Todos los incidentes fuera de SLA · MTTR real vs límite por tipo · Exceso en minutos · Motivo de incumplimiento: sin respuesta N1 / respuesta tardía / resolución tardía',
    path: '/api/reportes/export/fuera-sla',
    full: false,
  },
  {
    id: 'tiendas-criticas',
    titulo: 'Tiendas Críticas',
    icono: '🏪',
    color: '#854F0B',
    bg: '#FAEEDA',
    desc: 'Tiendas con 2+ incidentes en el período · Tipo más frecuente · MTTR prom · Días promedio entre caídas · IEI acumulado (S/) · Contingencia disponible',
    path: '/api/reportes/export/tiendas-criticas',
    full: false,
  },
  {
    id: 'operativos',
    titulo: 'Incidentes Operativos',
    icono: '📁',
    color: '#374151',
    bg: '#F1F5F9',
    desc: 'Historial completo · Ticket InvGate y proveedor · N1/N2/N3 envío y respuesta · Atribución · SLA resolución y respuesta · IEI por incidente · Contingencia y efectividad · Factor operativo',
    path: '/api/reportes/export',
    full: false,
  },
]

export default function ReportesPage() {
  const [desde, setDesde] = useState(firstOfMonth())
  const [hasta, setHasta] = useState(todayStr())
  const [dlLoading, setDlLoading] = useState<Record<string, boolean>>({})
  const [dlErrors,  setDlErrors]  = useState<Record<string, string>>({})

  function setQuick(d: string, h: string) { setDesde(d); setHasta(h) }

  async function download(id: string, path: string) {
    setDlLoading(l => ({ ...l, [id]: true }))
    setDlErrors(e => ({ ...e, [id]: '' }))
    try {
      const res = await fetch(`${path}?desde=${desde}&hasta=${hasta}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      triggerBlob(blob, match ? match[1] : `reporte_${id}.csv`)
    } catch {
      setDlErrors(e => ({ ...e, [id]: 'Error al generar el reporte' }))
    } finally {
      setDlLoading(l => ({ ...l, [id]: false }))
    }
  }

  const [main, ...rest] = EXPORT_CARDS

  return (
    <div style={{ maxWidth: '860px' }}>

      {/* Period selector */}
      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '24px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
          Período de descarga
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              style={{ padding: '6px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
            <span style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>—</span>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              style={{ padding: '6px 9px', fontSize: '12px', border: '0.5px solid var(--border)', borderRadius: '7px', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {([
              ['Este mes', () => setQuick(firstOfMonth(), todayStr())],
              ['Mes ant.', () => { const p = prevMonth(); setQuick(p.desde, p.hasta) }],
              ['30 días',  () => setQuick(daysAgo(30),  todayStr())],
              ['90 días',  () => setQuick(daysAgo(90),  todayStr())],
              ['6 meses',  () => setQuick(daysAgo(180), todayStr())],
            ] as [string, () => void][]).map(([label, fn]) => (
              <button key={label} onClick={fn}
                style={{ padding: '5px 10px', fontSize: '11px', border: '0.5px solid var(--border)', borderRadius: '6px', background: 'var(--muted)', color: 'var(--foreground)', cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 500 }}>
            {desde} → {hasta}
          </span>
        </div>
      </div>

      {/* Section label */}
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
        Reportes disponibles · CSV compatible Excel
      </div>

      {/* Gerencial — full width, prominent */}
      <div style={{ background: 'var(--card)', border: `1px solid ${main.color}33`, borderRadius: '12px', padding: '20px', marginBottom: '12px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: main.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
          {main.icono}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: main.color }}>{main.titulo}</span>
            <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', background: 'var(--muted)', padding: '2px 7px', borderRadius: '999px' }}>Informe completo</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.6, marginBottom: '12px' }}>{main.desc}</div>
          {dlErrors[main.id] && <div style={{ fontSize: '11px', color: '#ef4444', marginBottom: '8px' }}>{dlErrors[main.id]}</div>}
          <button
            disabled={dlLoading[main.id]}
            onClick={() => download(main.id, main.path)}
            style={{ padding: '9px 24px', borderRadius: '7px', border: 'none', background: dlLoading[main.id] ? 'var(--muted)' : main.color, color: dlLoading[main.id] ? 'var(--muted-foreground)' : 'white', fontSize: '12px', fontWeight: 600, cursor: dlLoading[main.id] ? 'not-allowed' : 'pointer' }}>
            {dlLoading[main.id] ? 'Generando...' : '↓ Descargar CSV'}
          </button>
        </div>
      </div>

      {/* Other 4 cards — 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {rest.map(card => (
          <div key={card.id} style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                {card.icono}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: card.color }}>{card.titulo}</div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.6, flex: 1 }}>{card.desc}</div>
            {dlErrors[card.id] && <div style={{ fontSize: '11px', color: '#ef4444' }}>{dlErrors[card.id]}</div>}
            <button
              disabled={dlLoading[card.id]}
              onClick={() => download(card.id, card.path)}
              style={{ padding: '9px 0', borderRadius: '7px', border: 'none', background: dlLoading[card.id] ? 'var(--muted)' : card.color, color: dlLoading[card.id] ? 'var(--muted-foreground)' : 'white', fontSize: '12px', fontWeight: 600, cursor: dlLoading[card.id] ? 'not-allowed' : 'pointer' }}>
              {dlLoading[card.id] ? 'Generando...' : '↓ Descargar CSV'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
