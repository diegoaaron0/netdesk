'use client'
import { useState } from 'react'

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10) }
function firstOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }
function lastOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) }
function prevMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return { desde: firstOfMonth(d), hasta: lastOfMonth(d) }
}

const PROVEEDORES = ['Todos', 'BITEL', 'CLARO', 'ENTEL', 'CONVERGIA', 'MOVISTAR']

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function ReportesPage() {
  const [desde,     setDesde]     = useState(firstOfMonth())
  const [hasta,     setHasta]     = useState(todayStr())
  const [proveedor, setProveedor] = useState('Todos')
  const [loading,   setLoading]   = useState<Record<string, boolean>>({})
  const [errors,    setErrors]    = useState<Record<string, string>>({})

  function setQuick(d: string, h: string) { setDesde(d); setHasta(h) }

  async function download(id: string, path: string) {
    setLoading(l => ({ ...l, [id]: true }))
    setErrors(e => ({ ...e, [id]: '' }))
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (proveedor !== 'Todos') params.set('proveedor', proveedor)
      const res = await fetch(`${path}?${params}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : `reporte_${id}.csv`
      triggerBlobDownload(blob, filename)
    } catch {
      setErrors(e => ({ ...e, [id]: 'Error al generar el reporte' }))
    } finally {
      setLoading(l => ({ ...l, [id]: false }))
    }
  }

  // ── Estilos ──────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    border: '0.5px solid #d1d5db', borderRadius: '6px', padding: '7px 10px',
    fontSize: '13px', color: '#0f172a', background: 'white', outline: 'none',
  }
  const btnQuick: React.CSSProperties = {
    padding: '6px 12px', borderRadius: '6px', border: '0.5px solid #d1d5db',
    fontSize: '12px', cursor: 'pointer', background: 'white', color: '#374151',
  }

  // ── Cards de las 3 plantillas principales ────────────────────────────────────

  const CARDS = [
    {
      id: 'gerencial',
      titulo: 'Reporte Gerencial',
      icono: '🏢',
      color: '#185FA5', bg: '#E6F1FB',
      desc: 'Resumen ejecutivo para presentar a directivos',
      incluye: 'KPIs ejecutivos · SLA por proveedor · Top 15 tiendas · Distribución por tipo',
      path: '/api/reportes/export/gerencial',
    },
    {
      id: 'proveedores',
      titulo: 'Seguimiento Proveedores',
      icono: '📋',
      color: '#1D9E75', bg: '#EAF3DE',
      desc: 'Evaluación completa por proveedor para reuniones con BITEL, CLARO, etc.',
      incluye: 'SLA% · MTTR · Escalamientos · Detalle por tienda · IEI',
      path: '/api/reportes/export/proveedores',
    },
    {
      id: 'operativos',
      titulo: 'Incidentes Operativos',
      icono: '📁',
      color: '#854F0B', bg: '#FAEEDA',
      desc: 'Historial completo de incidentes con todos los campos',
      incluye: 'Fecha · Tienda · Proveedor · Tipo · MTTR · SLA · IEI · N1/N2/N3 · Resuelto por',
      path: '/api/reportes/export',
    },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* 1. Encabezado */}
      <div>
        <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a' }}>Reportes</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
          Descarga reportes del período seleccionado en formato CSV
        </p>
      </div>

      {/* 2. Selector de período */}
      <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280' }}>Fecha inicio</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280' }}>Fecha fin</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280' }}>Proveedor</label>
            <select value={proveedor} onChange={e => setProveedor(e.target.value)} style={{ ...inputStyle, paddingRight: '24px' }}>
              {PROVEEDORES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={btnQuick} onClick={() => setQuick(firstOfMonth(), todayStr())}>Este mes</button>
          <button style={btnQuick} onClick={() => { const p = prevMonth(); setQuick(p.desde, p.hasta) }}>Mes anterior</button>
          <button style={btnQuick} onClick={() => setQuick(daysAgo(30), todayStr())}>Últimos 30 días</button>
          <button style={btnQuick} onClick={() => setQuick(daysAgo(90), todayStr())}>Últimos 3 meses</button>
        </div>
      </div>

      {/* 3. Cards principales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {CARDS.map(card => (
          <div key={card.id} style={{ background: 'white', border: `1px solid ${card.color}22`, borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                {card.icono}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: card.color }}>{card.titulo}</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>{card.desc}</div>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Incluye: </span>{card.incluye}
            </div>
            {errors[card.id] && (
              <div style={{ fontSize: '11px', color: '#A32D2D' }}>{errors[card.id]}</div>
            )}
            <button
              disabled={loading[card.id]}
              onClick={() => download(card.id, card.path)}
              style={{
                marginTop: 'auto', padding: '9px 0', borderRadius: '8px', border: 'none',
                background: loading[card.id] ? '#e5e7eb' : card.color,
                color: loading[card.id] ? '#9ca3af' : 'white',
                fontSize: '13px', fontWeight: 600, cursor: loading[card.id] ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {loading[card.id]
                ? <><span style={{ width: '12px', height: '12px', border: '2px solid #9ca3af', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} /> Generando...</>
                : '⬇ Descargar CSV'}
            </button>
          </div>
        ))}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
