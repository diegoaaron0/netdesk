// Helpers de estilo y formato compartidos por el detalle de incidente y sus
// sub-paneles (GrupoMasivoPanel, EscalamientoCard, InfraEscalamientoPanel).
import type { CSSProperties } from 'react'

export function iStyle(dis?: boolean): CSSProperties {
  return { width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: dis ? 'var(--muted)' : 'var(--card)', color: dis ? 'var(--muted-foreground)' : 'var(--foreground)', outline: 'none' }
}
export function taStyle(dis?: boolean): CSSProperties {
  return { ...iStyle(dis), minHeight: '72px', resize: 'vertical' as const, fontFamily: 'inherit' }
}

export function toDatetimeLocal(iso: string | null | undefined) {
  if (!iso) return ''
  const lima = new Date(new Date(iso).getTime() - 5 * 3600000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${lima.getUTCFullYear()}-${p(lima.getUTCMonth()+1)}-${p(lima.getUTCDate())}T${p(lima.getUTCHours())}:${p(lima.getUTCMinutes())}`
}
export function fromDatetimeLocal(val: string) {
  if (!val) return null
  return new Date(val + ':00-05:00').toISOString()
}
export function minToHM(min: number | null) {
  if (!min) return '—'
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
