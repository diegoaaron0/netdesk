import type { Session } from 'next-auth'
import { PERMISOS_POR_ROL } from './permisos-config'

export { PERMISOS_POR_ROL }

/**
 * Permisos efectivos = permisos base del rol ∪ permisos personalizados.
 *
 * Los permisos personalizados AÑADEN sobre la base del rol; nunca la quitan.
 * Antes reemplazaban por completo, lo que "congelaba" al usuario en un snapshot:
 * si después se agregaba un permiso al rol —o se empezaba a exigir un permiso que
 * antes no se validaba—, los usuarios con permisos personalizados quedaban
 * bloqueados en operaciones que su rol sí debería permitir.
 *
 * Como la base se lee del código vivo (PERMISOS_POR_ROL), un usuario afectado
 * recupera los permisos de su rol de inmediato, sin necesidad de volver a iniciar
 * sesión (su JWT solo necesita aportar el rol).
 */
export function resolvePermisos(rol: string | null | undefined, custom: unknown): string[] {
  const base = PERMISOS_POR_ROL[rol ?? 'AGENTE'] ?? []
  if (Array.isArray(custom) && custom.length > 0) {
    return Array.from(new Set([...base, ...(custom as string[])]))
  }
  return base
}

export function getPermisos(session: Session | null | undefined): string[] {
  return resolvePermisos(session?.user?.rol, session?.user?.permisos)
}

export const sessionPermisos = getPermisos

export function can(session: Session | null | undefined, permiso: string): boolean {
  return getPermisos(session).includes(permiso)
}
