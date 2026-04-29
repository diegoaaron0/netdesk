import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { can } from '@/lib/permisos'

export default auth((req) => {
  const session = req.auth
  const path = req.nextUrl.pathname

  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const rutas: { path: string; permiso: string }[] = [
    { path: '/dashboard',    permiso: 'dashboard.ver' },
    { path: '/reportes',     permiso: 'reportes.ver' },
    { path: '/usuarios',     permiso: 'usuarios.ver' },
  ]

  for (const ruta of rutas) {
    if (path.startsWith(ruta.path) && !can(session, ruta.permiso)) {
      if (can(session, 'incidentes.ver'))
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
    '/mantenimiento/:path*',
  ],
}
