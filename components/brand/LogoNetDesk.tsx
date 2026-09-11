import Image from 'next/image'

/**
 * Marca NetDesk. El isotipo es el asset real (public/logo-netdesk.webp), con
 * transparencia — el JPEG original traía el damero de "transparencia" pixelado
 * dentro de la imagen y hubo que recortarlo por saturación.
 *
 * `id` ya no hace falta (antes distinguía gradientes SVG), pero se acepta para
 * no romper las llamadas existentes.
 */
const RATIO = 224 / 320   // alto/ancho del asset

export function IsotipoNetDesk({ size = 40 }: { size?: number; id?: string }) {
  return (
    <Image
      src="/logo-netdesk.webp"
      alt="NetDesk"
      width={320}
      height={224}
      priority
      style={{
        width: size, height: Math.round(size * RATIO),
        objectFit: 'contain', display: 'block', flexShrink: 0,
      }}
    />
  )
}

/** Isotipo + wordmark. `sub` es la bajada opcional. */
/**
 * Isotipo + wordmark. El isotipo va INLINE con la palabra, como si fuera su
 * primera letra: alineado por el centro de la línea de texto, no por el centro
 * del bloque entero (si se centra contra el bloque, la bajada `sub` lo empuja
 * hacia abajo y la N queda descolgada respecto de "NetDesk").
 * La bajada cuelga debajo de todo, alineada con el arranque del isotipo.
 */
export function LogoNetDesk({
  size = 40,
  wordSize = 30,
  sub,
}: {
  size?: number
  wordSize?: number
  sub?: string
  id?: string
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: `${Math.round(wordSize * 0.22)}px` }}>
        <IsotipoNetDesk size={size} />
        <div
          style={{
            fontSize: `${wordSize}px`,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            color: 'var(--foreground)',
            whiteSpace: 'nowrap',
          }}
        >
          Net<span className="nd-gradient-text">Desk</span>
        </div>
      </div>
      {sub && (
        <div
          style={{
            fontSize: `${Math.max(9, Math.round(wordSize * 0.2))}px`,
            color: 'var(--faint-foreground)',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            marginTop: `${Math.round(wordSize * 0.26)}px`,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}
