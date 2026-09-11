type BadgeVariant = 'alto'|'medio'|'bajo'|'escalado_n1'|'escalado_n2'|'escalado_n3'|'abierto'|'en_seguimiento'|'resuelto'|'cerrado'|'cancelado'

/** Familia semántica de cada variante. El chip se arma con el tríptico
 *  fondo translúcido + borde del mismo tono + texto vivo, que es lo que hace
 *  legible un badge de color sobre navy. */
type Familia = 'danger' | 'warn' | 'info' | 'ok' | 'purple' | 'neutro'

const FAMILIA: Record<BadgeVariant, Familia> = {
  alto:           'danger',
  medio:          'warn',
  bajo:           'info',
  escalado_n1:    'warn',
  escalado_n2:    'warn',
  escalado_n3:    'danger',
  abierto:        'info',
  en_seguimiento: 'purple',
  resuelto:       'ok',
  cerrado:        'neutro',
  cancelado:      'neutro',
}

function estilo(f: Familia): React.CSSProperties {
  if (f === 'neutro') {
    return {
      background: 'var(--surface-3)',
      border: '1px solid var(--border)',
      color: 'var(--muted-foreground)',
    }
  }
  return {
    background: `var(--${f}-bg)`,
    border: `1px solid var(--${f}-border)`,
    color: `var(--${f})`,
  }
}

const LABELS: Record<BadgeVariant, string> = {
  alto: 'Alto', medio: 'Medio', bajo: 'Bajo',
  escalado_n1: 'Escalado N1', escalado_n2: 'Escalado N2', escalado_n3: 'Escalado N3',
  abierto: 'Abierto', en_seguimiento: 'En seguimiento',
  resuelto: 'Resuelto', cerrado: 'Cerrado', cancelado: 'Cancelado',
}

export function estadoToVariant(estado: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    ABIERTO: 'abierto', EN_SEGUIMIENTO: 'en_seguimiento',
    ESCALADO_N1: 'escalado_n1', ESCALADO_N2: 'escalado_n2', ESCALADO_N3: 'escalado_n3',
    RESUELTO: 'resuelto', CERRADO: 'cerrado', CANCELADO: 'cancelado',
  }
  return map[estado] ?? 'abierto'
}

export function impactoToVariant(impacto: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = { ALTO: 'alto', MEDIO: 'medio', BAJO: 'bajo' }
  return map[impacto] ?? 'bajo'
}

export function Badge({ variant }: { variant: BadgeVariant }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '999px',
      fontSize: '10px', fontWeight: 600, letterSpacing: '0.01em',
      whiteSpace: 'nowrap', lineHeight: 1.6,
      ...estilo(FAMILIA[variant]),
    }}>
      {LABELS[variant]}
    </span>
  )
}
