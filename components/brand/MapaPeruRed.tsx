import Image from 'next/image'

/**
 * Mapa del Perú con nodos de red — elemento visual insignia de NetDesk.
 *
 * Es el asset de marca (public/mapa-peru.webp), con transparencia real. Se
 * recortó al contenido usando un umbral de alpha: el PNG original traía neblina
 * casi invisible repartida por todo el lienzo, y un recorte por bbox simple
 * dejaba el doble de ancho del que ocupa el país.
 *
 * Para que no se vea "pegado encima" se combina: un halo radial detrás que
 * difumina el límite del asset contra el fondo, y un drop-shadow azul que
 * derrama luz fuera de la silueta. Sin eso el mapa se lee como un recorte.
 *
 * `intensidad` regula qué tan presente está: 'plena' para el login, 'fondo'
 * para usarlo detrás de contenido sin competir con él.
 */
type Props = {
  ancho?: number
  intensidad?: 'plena' | 'fondo'
  className?: string
}

const RATIO = 1246 / 900   // alto/ancho del asset — vertical

export default function MapaPeruRed({ ancho = 520, intensidad = 'plena', className }: Props) {
  const fondo = intensidad === 'fondo'
  const alto = Math.round(ancho * RATIO)

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{ position: 'relative', width: ancho, height: alto, maxWidth: '100%', pointerEvents: 'none' }}
    >
      {/* Halo detrás: difumina el borde del asset contra el fondo */}
      <div style={{
        position: 'absolute', inset: '-18%',
        background: fondo
          ? 'radial-gradient(ellipse at 50% 50%, rgba(59,130,246,0.10) 0%, transparent 62%)'
          : 'radial-gradient(ellipse at 48% 48%, rgba(59,130,246,0.22) 0%, rgba(37,99,235,0.08) 38%, transparent 68%)',
      }} />

      <Image
        src="/mapa-peru.webp"
        alt=""
        width={900}
        height={1246}
        priority={!fondo}
        style={{
          position: 'relative',
          width: '100%', height: '100%', objectFit: 'contain',
          opacity: fondo ? 0.5 : 0.96,
          filter: fondo
            ? 'saturate(0.85)'
            : 'drop-shadow(0 0 42px rgba(59,130,246,0.42)) drop-shadow(0 0 14px rgba(125,211,252,0.25))',
        }}
      />
    </div>
  )
}
