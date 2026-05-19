'use client'
import { useState, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import type { TiendaMapPoint } from '@/types/geographic-impact'

interface Props {
  tiendas: TiendaMapPoint[]
}

function markerColor(slaPct: number | null): string {
  if (slaPct == null) return '#1D9E75'
  if (slaPct < 70) return '#A32D2D'
  if (slaPct < 90) return '#BA7517'
  return '#1D9E75'
}

function fmtMin(min: number | null) {
  if (min == null) return '—'
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtCosto(n: number) {
  return `S/ ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
}

// ─── Buscador de tiendas ──────────────────────────────────────────────────────

function TiendaSearch({ tiendas, mapRef }: { tiendas: TiendaMapPoint[]; mapRef: React.RefObject<LeafletMap | null> }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const resultados = query.length >= 2
    ? tiendas
        .filter((t) => t.coordenadas && (
          t.codigo.toLowerCase().includes(query.toLowerCase()) ||
          (t.nombreCc ?? '').toLowerCase().includes(query.toLowerCase())
        ))
        .slice(0, 5)
    : []

  function seleccionar(t: TiendaMapPoint) {
    if (!t.coordenadas) return
    const [lat, lng] = t.coordenadas.split(',').map(Number)
    if (isNaN(lat) || isNaN(lng)) return
    mapRef.current?.setView([lat, lng], 14)
    setQuery(`${t.codigo}${t.nombreCc ? ` — ${t.nombreCc}` : ''}`)
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative', marginBottom: '8px' }}>
      <input
        placeholder="Buscar tienda..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '7px 12px', fontSize: '12px',
          border: '0.5px solid #CBD5E1', borderRadius: '8px',
          outline: 'none', background: 'white',
        }}
      />
      {open && resultados.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          zIndex: 1000, background: 'white',
          border: '0.5px solid #e5e7eb', borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
        }}>
          {resultados.map((t) => (
            <div
              key={t.tiendaId}
              onMouseDown={() => seleccionar(t)}
              style={{
                padding: '8px 12px', fontSize: '12px', cursor: 'pointer',
                borderBottom: '0.5px solid #f1f5f9',
                display: 'flex', gap: '6px', alignItems: 'baseline',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
            >
              <span style={{ fontWeight: 600, fontFamily: 'monospace', flexShrink: 0 }}>{t.codigo}</span>
              {t.nombreCc && <span style={{ color: '#374151' }}>{t.nombreCc}</span>}
              {t.distrito && <span style={{ color: '#94A3B8', fontSize: '11px' }}>· {t.distrito}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Mapa ─────────────────────────────────────────────────────────────────────

export default function PeruLeafletMap({ tiendas }: Props) {
  const mapRef = useRef<LeafletMap | null>(null)
  const maxImpacto = tiendas.reduce((mx, t) => Math.max(mx, t.impacto), 1)

  const puntos = tiendas.flatMap((t) => {
    if (!t.coordenadas) return []
    const [lat, lng] = t.coordenadas.split(',').map(Number)
    if (isNaN(lat) || isNaN(lng)) return []
    return [{ t, lat, lng }]
  })

  return (
    <div>
      <TiendaSearch tiendas={tiendas} mapRef={mapRef} />
      <MapContainer
        ref={mapRef}
        center={[-9.19, -75.0]}
        zoom={5}
        style={{ width: '100%', height: '400px', borderRadius: '8px', zIndex: 0 }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {puntos.map(({ t, lat, lng }) => {
          const radius = 6 + Math.round((t.impacto / maxImpacto) * 14)
          const color = markerColor(t.slaPct)
          return (
            <CircleMarker
              key={t.tiendaId}
              center={[lat, lng]}
              radius={radius}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.75, weight: 1.5 }}
            >
              <Popup>
                <div style={{ fontSize: '12px', lineHeight: 1.6, minWidth: '160px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>{t.codigo}</div>
                  {t.nombreCc && <div>{t.nombreCc}</div>}
                  {t.distrito && <div style={{ color: '#64748B' }}>{t.distrito}</div>}
                  {t.proveedor && <div style={{ color: '#185FA5' }}>{t.proveedor}</div>}
                  <div style={{ marginTop: '4px', borderTop: '0.5px solid #e5e7eb', paddingTop: '4px' }}>
                    <span style={{ color: '#64748B' }}>MTTR: </span>{fmtMin(t.mttrMin)}<br />
                    <span style={{ color: '#64748B' }}>SLA: </span>
                    <span style={{ fontWeight: 600, color: markerColor(t.slaPct) }}>
                      {t.slaPct != null ? `${t.slaPct}%` : '—'}
                    </span><br />
                    <span style={{ color: '#64748B' }}>Impacto: </span>{t.impacto > 0 ? fmtCosto(t.impacto) : '—'}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
