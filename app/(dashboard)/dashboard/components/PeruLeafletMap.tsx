'use client'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
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

export default function PeruLeafletMap({ tiendas }: Props) {
  console.log('tiendas con coords:', tiendas.filter((t) => t.coordenadas).length)

  const maxImpacto = tiendas.reduce((mx, t) => Math.max(mx, t.impacto), 1)

  const puntos = tiendas.flatMap((t) => {
    if (!t.coordenadas) return []
    const [lat, lng] = t.coordenadas.split(',').map(Number)
    if (isNaN(lat) || isNaN(lng)) return []
    return [{ t, lat, lng }]
  })

  return (
    <MapContainer
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
  )
}
