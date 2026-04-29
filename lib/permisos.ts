export const PERMISOS_POR_ROL: Record<string, string[]> = {
  AGENTE: [
    'incidentes.ver', 'incidentes.crear', 'incidentes.editar',
    'escalamientos.ver', 'escalamientos.crear',
    'mantenimiento.ver',
  ],
  SUPERVISOR: [
    'incidentes.ver', 'incidentes.crear', 'incidentes.editar', 'incidentes.eliminar',
    'admin',
    'escalamientos.ver', 'escalamientos.crear', 'escalamientos.editar',
    'mantenimiento.ver', 'mantenimiento.editar',
    'usuarios.ver', 'usuarios.editar',
    'dashboard.ver', 'reportes.ver',
  ],
  GERENCIA: [
    'incidentes.ver',
    'escalamientos.ver',
    'mantenimiento.ver',
    'dashboard.ver', 'reportes.ver',
  ],
  INFRAESTRUCTURA: [
    'incidentes.ver', 'incidentes.crear', 'incidentes.editar',
    'escalamientos.ver', 'escalamientos.crear', 'escalamientos.editar',
    'mantenimiento.ver', 'mantenimiento.editar',
    'dashboard.ver', 'reportes.ver',
  ],
}

export function sessionPermisos(session: any): string[] {
  const fromToken = (session?.user as any)?.permisos
  if (fromToken && Array.isArray(fromToken) && fromToken.length > 0) return fromToken
  const rol = (session?.user as any)?.rol ?? 'AGENTE'
  return PERMISOS_POR_ROL[rol] ?? []
}

export function can(session: any, permiso: string): boolean {
  return sessionPermisos(session).includes(permiso)
}
