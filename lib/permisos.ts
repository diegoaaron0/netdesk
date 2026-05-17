import { PERMISOS_POR_ROL } from './permisos-config'

export { PERMISOS_POR_ROL }

export function getPermisos(session: any): string[] {
  const rol    = (session?.user as any)?.rol ?? 'AGENTE'
  const custom = (session?.user as any)?.permisos
  if (custom && Array.isArray(custom) && custom.length > 0) return custom
  return PERMISOS_POR_ROL[rol] ?? []
}

export const sessionPermisos = getPermisos

export function can(session: any, permiso: string): boolean {
  return getPermisos(session).includes(permiso)
}
