export const PERMISOS_POR_ROL: Record<string, string[]> = {
  AGENTE: [
    'incidentes.ver', 'incidentes.crear', 'incidentes.reabrir',
    'escalamientos.crear', 'escalamientos.envio', 'escalamientos.respuesta',
    'mantenimiento.ver',
    'proveedores.ver',
  ],
  INFRAESTRUCTURA: [
    'incidentes.ver', 'incidentes.crear', 'incidentes.reabrir',
    'escalamientos.crear', 'escalamientos.envio', 'escalamientos.respuesta',
    'mantenimiento.ver', 'mantenimiento.editar', 'mantenimiento.agregar',
    'dashboard.ver',
    'proveedores.ver', 'proveedores.editar',
  ],
  SUPERVISOR: [
    'incidentes.ver', 'incidentes.crear', 'incidentes.reabrir',
    'incidentes.editar', 'incidentes.eliminar',
    'escalamientos.crear', 'escalamientos.envio', 'escalamientos.respuesta',
    'mantenimiento.ver', 'mantenimiento.editar', 'mantenimiento.agregar',
    'dashboard.ver', 'reportes.ver', 'reportes.exportar',
    'usuarios.ver', 'usuarios.editar', 'usuarios.crear',
    'proveedores.ver', 'proveedores.editar',
  ],
  GERENCIA: [
    'dashboard.ver', 'reportes.ver', 'reportes.exportar',
    'mantenimiento.ver',
    'proveedores.ver',
  ],
}

export function getPermisos(session: any): string[] {
  const rol = (session?.user as any)?.rol ?? 'AGENTE'
  const custom = (session?.user as any)?.permisos
  if (custom && Array.isArray(custom) && custom.length > 0) return custom
  return PERMISOS_POR_ROL[rol] ?? []
}

// Alias for backwards compatibility during migration
export const sessionPermisos = getPermisos

export function can(session: any, permiso: string): boolean {
  return getPermisos(session).includes(permiso)
}
