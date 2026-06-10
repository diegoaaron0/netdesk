import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { passwordActual, passwordNueva } = await req.json().catch(() => ({}))
  if (!passwordActual || !passwordNueva) return NextResponse.json({ error: 'Campos requeridos' }, { status: 400 })
  if (passwordNueva.length < 6) return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' }, { status: 400 })

  const email = session.user?.email
  if (!email) return NextResponse.json({ error: 'Sin email en sesión' }, { status: 400 })

  const [user] = await db.select({ id: usuarios.id, password: usuarios.password })
    .from(usuarios).where(eq(usuarios.email, email))
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const ok = await bcrypt.compare(passwordActual, user.password ?? '')
  if (!ok) return NextResponse.json({ error: 'Contraseña actual incorrecta' }, { status: 400 })

  const hash = await bcrypt.hash(passwordNueva, 12)
  await db.update(usuarios).set({ password: hash }).where(eq(usuarios.id, user.id))

  return NextResponse.json({ ok: true })
}
