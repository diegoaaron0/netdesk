'use client'
import type { ZonaResumen } from '@/types/geographic-impact'

// Approximate zone positions within the 120×148 viewBox (Lima coast region)
const ZONA_POS: Record<string, { x: number; y: number }> = {
  'Lima Norte':  { x: 29, y: 81 },
  'Lima Este':   { x: 42, y: 89 },
  'Lima Sur':    { x: 27, y: 100 },
  'Lima Centro': { x: 24, y: 89 },
  'Callao':      { x: 17, y: 86 },
  'Provincia':   { x: 78, y: 58 },
  'Sin zona':    { x: 60, y: 70 },
}

interface Props {
  zonas: ZonaResumen[]
}

export default function PeruMapPlaceholder({ zonas }: Props) {
  const maxInc = Math.max(...zonas.map((z) => z.incidentes), 1)

  function dotColor(zona: ZonaResumen) {
    if (zona.estado === 'critica') return '#EF4444'
    if (zona.estado === 'revisar') return '#F59E0B'
    return '#3B82F6'
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <svg
        viewBox="0 0 120 148"
        width="120"
        height="148"
        style={{ display: 'block' }}
        aria-label="Mapa referencial del Perú"
      >
        {/* Peru outline — simplified approximation */}
        <path
          d="M44,3 L58,2 L72,4 L85,7 L96,11 L108,22 L116,38 L117,55 L114,70 L108,84 L101,98 L93,112 L84,124 L74,133 L62,138 L50,137 L38,130 L27,119 L17,105 L9,89 L5,72 L5,56 L8,42 L14,29 L23,18 L34,9 Z"
          fill="#F1F5F9"
          stroke="#CBD5E1"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />

        {/* Lima metro region highlight */}
        <ellipse cx="27" cy="91" rx="18" ry="22" fill="#DBEAFE" opacity="0.45" />

        {/* Callao mini highlight */}
        <ellipse cx="17" cy="86" rx="7" ry="6" fill="#BFDBFE" opacity="0.55" />

        {/* Zone dots — sized by incident count, colored by estado */}
        {zonas.map((z) => {
          const pos = ZONA_POS[z.zona]
          if (!pos) return null
          const r = 3.5 + (z.incidentes / maxInc) * 5.5
          return (
            <g key={z.zona}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r + 2}
                fill={dotColor(z)}
                opacity={0.15}
              />
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill={dotColor(z)}
                opacity={0.75}
              />
            </g>
          )
        })}
      </svg>

      {/* Badge */}
      <div style={{
        position: 'absolute', bottom: 2, right: 0,
        fontSize: '8px', color: '#94A3B8',
        background: 'rgba(255,255,255,0.85)',
        padding: '1px 5px', borderRadius: '3px',
        lineHeight: 1.6,
      }}>
        Mapa referencial
      </div>
    </div>
  )
}
