import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { usuarios, passwordCambios } from '@/drizzle/schema'
import { eq, and, gt, count } from 'drizzle-orm'
import { auth } from '@/auth'

const MAX_CAMBIOS_24H = 3

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

  // Rate limit: máximo 3 cambios exitosos por ventana deslizante de 24h
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [{ n }] = await db.select({ n: count() })
    .from(passwordCambios)
    .where(and(eq(passwordCambios.usuarioId, user.id), gt(passwordCambios.creadoEn, desde)))
  if (n >= MAX_CAMBIOS_24H) {
    return NextResponse.json(
      { error: `Alcanzaste el límite de ${MAX_CAMBIOS_24H} cambios de contraseña en 24 horas. Intenta de nuevo más tarde.` },
      { status: 429 },
    )
  }

  const hash = await bcrypt.hash(passwordNueva, 12)
  await db.update(usuarios).set({ password: hash }).where(eq(usuarios.id, user.id))
  await db.insert(passwordCambios).values({ usuarioId: user.id })

  return NextResponse.json({ ok: true })
}
