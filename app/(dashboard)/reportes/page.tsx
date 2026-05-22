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

function triggerDownload(url: string) {
  const a = Object.assign(document.createElement('a'), { href: url })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function ReportesPage() {
  const [desde,     setDesde]     = useState(firstOfMonth())
  const [hasta,     setHasta]     = useState(todayStr())
  const [proveedor, setProveedor] = useState('Todos')
  const [loading,   setLoading]   = useState<Record<string, boolean>>({})
  const [errors,    setErrors]    = useState<Record<string, string>>({})
  const [open,      setOpen]      = useState(false)

  function setQuick(d: string, h: string) { setDesde(d); setHasta(h) }

  async function download(id: string, path: string) {
    setLoading(l => ({ ...l, [id]: true }))
    setErrors(e => ({ ...e, [id]: '' }))
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (proveedor !== 'Todos') params.set('proveedor', proveedor)
      triggerDownload(`${path}?${params}`)
      await new Promise(r => setTimeout(r, 1500))
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

  // ── Cards de las 4 plantillas principales ────────────────────────────────────

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
      desc: 'Historial completo de incidentes con SLA y escalamientos',
      incluye: 'Fecha · Código tienda · Proveedor · Tipo · MTTR · SLA · IEI · N1/N2/N3',
      path: '/api/reportes/export',
    },
    {
      id: 'tiendas-criticas',
      titulo: 'Tiendas Críticas',
      icono: '🚨',
      color: '#A32D2D', bg: '#FCEBEB',
      desc: 'Ranking de tiendas con reincidencia e impacto acumulado',
      incluye: 'Código · Tipo frecuente · Días entre caídas · IEI acumulado · Contingencia',
      path: '/api/reportes/export/tiendas-criticas',
    },
  ]

  // ── Reportes adicionales ─────────────────────────────────────────────────────

  const ADICIONALES = [
    {
      id: 'fuera-sla',
      label: 'Fuera de SLA',
      desc: 'Fecha · Código tienda · Proveedor · Tipo · MTTR · Límite · Exceso · Motivo',
      disponible: true,
      path: '/api/reportes/export/fuera-sla',
    },
    {
      id: 'maestro',
      label: 'Maestro de tiendas',
      desc: 'Código · Nombre CC · Distrito · Proveedor · CID · Tipo conexión · Contingencia',
      disponible: true,
      path: '/api/tiendas/export',
    },
    { id: 'escalamientos', label: 'Escalamientos',      desc: 'Próximamente', disponible: false, path: '' },
    { id: 'invgate',       label: 'Tickets InvGate',    desc: 'Próximamente', disponible: false, path: '' },
    { id: 'historial',     label: 'Historial de cambios', desc: 'Próximamente', disponible: false, path: '' },
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

      {/* 3. Cards principales 2×2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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

      {/* 4. Reportes adicionales (colapsable) */}
      <div style={{ background: 'white', border: '0.5px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#374151' }}
        >
          Reportes adicionales
          <span style={{ fontSize: '11px', color: '#9ca3af', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>
        {open && (
          <div style={{ borderTop: '0.5px solid #e5e7eb' }}>
            {ADICIONALES.map((r, idx) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: idx < ADICIONALES.length - 1 ? '0.5px solid #f3f4f6' : 'none' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>{r.label}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{r.desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, marginLeft: '12px' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
                    background: r.disponible ? '#EAF3DE' : '#f3f4f6',
                    color: r.disponible ? '#1D9E75' : '#9ca3af',
                  }}>
                    {r.disponible ? 'Disponible' : 'Próximamente'}
                  </span>
                  {r.disponible && (
                    <button
                      disabled={loading[r.id]}
                      onClick={() => download(r.id, r.path)}
                      style={{ padding: '5px 12px', borderRadius: '6px', border: '0.5px solid #d1d5db', background: 'white', fontSize: '12px', cursor: loading[r.id] ? 'not-allowed' : 'pointer', color: '#374151' }}
                    >
                      {loading[r.id] ? 'Generando...' : '↓ CSV'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
