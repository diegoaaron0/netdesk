import type { Session } from 'next-auth'
import { PERMISOS_POR_ROL } from './permisos-config'

export { PERMISOS_POR_ROL }

export function getPermisos(session: Session | null | undefined): string[] {
  const rol    = session?.user?.rol ?? 'AGENTE'
  const custom = session?.user?.permisos
  if (custom && Array.isArray(custom) && custom.length > 0) return custom
  return PERMISOS_POR_ROL[rol] ?? []
}

export const sessionPermisos = getPermisos

export function can(session: Session | null | undefined, permiso: string): boolean {
  return getPermisos(session).includes(permiso)
}
