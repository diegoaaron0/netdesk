import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

// JWT sessions cannot be invalidated server-side. This endpoint exists as a
// hook point for future server-side session support. For now it returns a
// message instructing the affected user to re-login.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'usuarios.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  return NextResponse.json({
    ok: true,
    message: 'Los cambios de permisos se aplicarán en el próximo inicio de sesión del usuario.',
  })
}
