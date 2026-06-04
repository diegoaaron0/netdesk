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

// ── Inline SVG icons ────────────────────────────────────────────────────────────
function IconGerencial({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
      <path d="M7 15h2M7 18h4" />
      <path d="M14 12l2 2 3-3" />
    </svg>
  )
}
function IconProveedores({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  )
}
function IconFueraSLA({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <circle cx="12" cy="16" r="0.5" fill={color} />
    </svg>
  )
}
function IconTiendas({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  )
}
function IconOperativos({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  )
}

// ── Card metadata ───────────────────────────────────────────────────────────────
const EXPORT_CARDS = [
  {
    id: 'gerencial',
    titulo: 'Reporte Gerencial',
    badge: 'Informe completo',
    color: '#185FA5',
    bg: '#E6F1FB',
    Icon: IconGerencial,
    contenido: [
      { label: 'Resumen ejecutivo', detail: 'Total incidentes · MTTR prom · SLA% · Tiendas afectadas · IEI — cada métrica con variación vs período anterior' },
      { label: 'Métricas por proveedor', detail: 'Proveedor · Evaluables SLA · SLA resp% · SLA resol% · SLA global% · MTTR prom · T. respuesta · T. resolución · Escalados N2+ · IEI' },
      { label: 'Top 15 tiendas', detail: '# · Código · Nombre CC · Proveedor · Incidentes · MTTR prom · IEI estimado' },
      { label: 'Distribución por tipo', detail: 'Tipo · Total · % · Resueltos · Dentro SLA · SLA% · MTTR prom' },
      { label: 'Reincidentes', detail: 'Código · Proveedor · Incidentes · MTTR · Días entre caídas · Tipo frecuente · Tendencia (NUEVO / ESTABLE / EMPEORA)' },
      { label: 'Por zona geográfica', detail: 'Zona · Incidentes · % del total · Tiendas afectadas · MTTR prom' },
      { label: 'Reaperturas', detail: 'Tasa global · por proveedor: Reaperturas · Tasa% · Motivo proveedor · Motivo agente' },
      { label: 'Proveedor crítico', detail: 'Proveedor · Score riesgo (0-100) · ranking completo: Incidentes · SLA% · MTTR prom · IEI' },
      { label: 'Supervisores', detail: 'Supervisor · Incidentes · Tiendas afectadas · MTTR prom · IEI total estimado' },
      { label: 'Clusters', detail: 'Cluster · Incidentes · % del total · Tiendas afectadas · MTTR prom · IEI total estimado' },
    ],
    path: '/api/reportes/export/gerencial',
    full: true,
  },
  {
    id: 'proveedores',
    titulo: 'Seguimiento Proveedores',
    badge: null,
    color: '#1D9E75',
    bg: '#EAF3DE',
    Icon: IconProveedores,
    contenido: [
      { label: 'Resumen por proveedor', detail: 'Proveedor · Total · Evaluables SLA · SLA% · MTTR prom · T. respuesta · T. resolución · Escalados N2+ · Reaperturas · Tasa · Motivo frecuente · IEI' },
      { label: 'Detalle por tienda', detail: 'Proveedor · Código tienda · Nombre CC · Distrito · Incidentes · Tipo frecuente · MTTR prom · SLA% · Reaperturas · IEI' },
    ],
    path: '/api/reportes/export/proveedores',
    full: false,
  },
  {
    id: 'fuera-sla',
    titulo: 'Incumplimientos SLA',
    badge: null,
    color: '#B91C1C',
    bg: '#FEE2E2',
    Icon: IconFueraSLA,
    contenido: [
      { label: 'Una fila por incidente fuera de SLA', detail: 'Código · Tienda · Proveedor · Tipo · Estado · MTTR real · Límite SLA · Exceso resolución · T. respuesta N1 · Exceso respuesta' },
      { label: 'Diagnóstico de la falla', detail: 'SLA Respuesta · SLA Resolución · Tipo de falla · Reabierto (Sí/No) · Motivo reabertura · MTTR acumulado' },
    ],
    path: '/api/reportes/export/fuera-sla',
    full: false,
  },
  {
    id: 'tiendas-criticas',
    titulo: 'Tiendas Críticas',
    badge: null,
    color: '#854F0B',
    bg: '#FAEEDA',
    Icon: IconTiendas,
    contenido: [
      { label: 'Una fila por tienda reincidente', detail: '# · Código · Nombre CC · Distrito · Proveedor · Incidentes · Tipo más frecuente · MTTR prom · Días entre caídas' },
      { label: 'Impacto acumulado', detail: 'IEI acumulado (S/) · Contingencia disponible (Sí / No)' },
    ],
    path: '/api/reportes/export/tiendas-criticas',
    full: false,
  },
  {
    id: 'operativos',
    titulo: 'Incidentes Operativos',
    badge: null,
    color: '#374151',
    bg: '#F1F5F9',
    Icon: IconOperativos,
    contenido: [
      { label: 'Una fila por incidente', detail: 'Código · Tickets · Tienda · Proveedor · CID · Tipo · Impacto · Escalado · Contingencia · Fecha · Hora inicio · MTTR · N1/N2/N3 envío y respuesta' },
      { label: 'Evaluación y cierre', detail: 'SLA respuesta · SLA resolución · SLA cumplido · IEI (S/) · Efectividad contingencia · Resuelto por · Atribución' },
    ],
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
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(`Error ${res.status}${body?.error ? ': ' + body.error : ''}`)
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      triggerBlob(blob, match ? match[1] : `reporte_${id}.csv`)
    } catch (err: any) {
      setDlErrors(e => ({ ...e, [id]: err?.message ?? 'Error al generar el reporte' }))
    } finally {
      setDlLoading(l => ({ ...l, [id]: false }))
    }
  }

  const [main, ...rest] = EXPORT_CARDS

  return (
    <div>
      {/* ── Período de descarga ───────────────────────────────────────────────── */}
      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
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

      {/* ── Label ────────────────────────────────────────────────────────────── */}
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
        Reportes disponibles · CSV compatible Excel
      </div>

      {/* ── Grid de cards ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

        {/* Gerencial — ancho completo */}
        <div style={{
          gridColumn: '1/-1',
          background: 'var(--card)',
          border: `1px solid ${main.color}30`,
          borderRadius: '12px',
          padding: '20px 24px',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: '24px',
          alignItems: 'start',
        }}>
          {/* left: icono + título + contenido */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: main.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <main.Icon color={main.color} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: main.color }}>{main.titulo}</span>
                  <span style={{ fontSize: '10px', color: main.color, background: main.bg, padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>{main.badge}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                  Incluye {main.contenido.length} secciones · período seleccionado
                </div>
              </div>
            </div>
            {/* secciones en grid 2 cols */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
              {main.contenido.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ width: '3px', borderRadius: '2px', background: main.color, flexShrink: 0, marginTop: '4px', alignSelf: 'stretch', minHeight: '12px' }} />
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)' }}>{c.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* right: botón */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            {dlErrors[main.id] && <div style={{ fontSize: '11px', color: '#ef4444' }}>{dlErrors[main.id]}</div>}
            <button
              disabled={dlLoading[main.id]}
              onClick={() => download(main.id, main.path)}
              style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: dlLoading[main.id] ? 'var(--muted)' : main.color, color: dlLoading[main.id] ? 'var(--muted-foreground)' : 'white', fontSize: '12px', fontWeight: 600, cursor: dlLoading[main.id] ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
              {dlLoading[main.id] ? 'Generando...' : '↓ Descargar CSV'}
            </button>
          </div>
        </div>

        {/* 4 cards restantes */}
        {rest.map(card => (
          <div key={card.id} style={{
            background: 'var(--card)',
            border: '0.5px solid var(--border)',
            borderRadius: '12px',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <card.Icon color={card.color} />
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: card.color }}>{card.titulo}</div>
            </div>

            {/* Contenido */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              {card.contenido.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ width: '3px', borderRadius: '2px', background: card.color, opacity: 0.5, flexShrink: 0, marginTop: '4px', alignSelf: 'stretch', minHeight: '12px' }} />
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)' }}>{c.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '1px' }}>{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>

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
