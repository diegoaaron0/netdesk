import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth(function proxy(req) {
  const session = req.auth
  if (!session) return NextResponse.redirect(new URL('/login', req.url))

  const rol = (session.user as any)?.rol
  const path = req.nextUrl.pathname

  const elevated = ['SUPERVISOR', 'GERENCIA', 'INFRAESTRUCTURA']
  if (path.startsWith('/dashboard') && !elevated.includes(rol)) {
    return NextResponse.redirect(new URL('/incidentes', req.url))
  }
  if (path.startsWith('/reportes') && rol === 'AGENTE') {
    return NextResponse.redirect(new URL('/incidentes', req.url))
  }
  if (path.startsWith('/usuarios') && rol !== 'SUPERVISOR') {
    return NextResponse.redirect(new URL('/incidentes', req.url))
  }
  return NextResponse.next()
})

export const config = {
  matcher: [
    '/incidentes/:path*',
    '/dashboard/:path*',
    '/reportes/:path*',
    '/mantenimiento/:path*',
    '/usuarios/:path*',
  ],
}
