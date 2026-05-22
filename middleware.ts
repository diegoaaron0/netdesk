import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import authConfig from '@/auth.config'
import { PERMISOS_POR_ROL } from '@/lib/permisos-config'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const session = req.auth
  const path    = req.nextUrl.pathname

  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const rol      = (session.user as any)?.rol      ?? 'AGENTE'
  const permisos: string[] = (session.user as any)?.permisos ?? PERMISOS_POR_ROL[rol] ?? []

  function canDo(permiso: string) {
    return permisos.includes(permiso)
  }

  const rutas: { path: string; permiso: string }[] = [
    { path: '/incidentes',    permiso: 'incidentes.ver' },
    { path: '/dashboard',     permiso: 'dashboard.ver' },
    { path: '/reportes',      permiso: 'reportes.ver' },
    { path: '/usuarios',      permiso: 'usuarios.ver' },
    { path: '/proveedores',   permiso: 'proveedores.ver' },
    { path: '/mantenimiento', permiso: 'mantenimiento.ver' },
    { path: '/tiendas',       permiso: 'mantenimiento.ver' },
  ]

  for (const ruta of rutas) {
    if (path.startsWith(ruta.path) && !canDo(ruta.permiso)) {
      if (ruta.path !== '/incidentes' && canDo('incidentes.ver'))
        return NextResponse.redirect(new URL('/incidentes', req.url))
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/incidentes/:path*',
    '/dashboard/:path*',
    '/reportes/:path*',
    '/usuarios/:path*',
    '/tiendas/:path*',
    '/proveedores/:path*',
    '/mantenimiento/:path*',
  ],
}
