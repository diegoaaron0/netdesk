type BadgeVariant = 'alto'|'medio'|'bajo'|'escalado_n1'|'escalado_n2'|'escalado_n3'|'abierto'|'en_seguimiento'|'resuelto'|'cerrado'|'cancelado'

const STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  alto:           { bg: '#FCEBEB', color: '#A32D2D' },
  medio:          { bg: '#FAEEDA', color: '#854F0B' },
  bajo:           { bg: '#E6F1FB', color: '#185FA5' },
  escalado_n1:    { bg: '#FAEEDA', color: '#633806' },
  escalado_n2:    { bg: '#FAEEDA', color: '#633806' },
  escalado_n3:    { bg: '#FAEEDA', color: '#633806' },
  abierto:        { bg: '#E6F1FB', color: '#0C447C' },
  en_seguimiento: { bg: '#E6F1FB', color: '#0C447C' },
  resuelto:       { bg: '#EAF3DE', color: '#27500A' },
  cerrado:        { bg: '#F1EFE8', color: '#444441' },
  cancelado:      { bg: '#F1EFE8', color: '#444441' },
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
  const s = STYLES[variant]
  return (
    <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 500, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {LABELS[variant]}
    </span>
  )
}
