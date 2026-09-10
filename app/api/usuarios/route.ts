import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq, isNull, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function GET() {
  const session = await auth()
  if (!session || !can(session, 'usuarios.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const data = await db.select({
    id:       usuarios.id,
    nombre:   usuarios.nombre,
    apellido: usuarios.apellido,
    email:    usuarios.email,
    celular:  usuarios.celular,
    rol:      usuarios.rol,
    permisos: usuarios.permisos,
    activo:   usuarios.activo,
    // Nunca exponer el hash; solo si el usuario tiene o no contraseña, para que
    // el admin pueda detectar cuentas que quedaron sin acceso (password NULL).
    sinPassword: sql<boolean>`${usuarios.password} IS NULL`,
  }).from(usuarios).where(isNull(usuarios.eliminadoEn)).orderBy(usuarios.nombre)

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'usuarios.crear')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  if (!body.nombre?.trim()) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  const email: string = body.email?.trim() ?? ''
  if (!email) return NextResponse.json({ error: 'El correo es obligatorio' }, { status: 400 })

  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email))
  if (existente) return NextResponse.json({ error: 'Ese correo ya está registrado' }, { status: 400 })

  // La contraseña la elige siempre quien crea el usuario: ya no hay caída a una
  // contraseña por defecto del sistema (era la misma para todas las altas).
  const rawPassword = typeof body.password === 'string' ? body.password.trim() : ''
  if (!rawPassword) return NextResponse.json({ error: 'La contraseña es obligatoria' }, { status: 400 })
  const hashedPassword = await bcrypt.hash(rawPassword, 12)

  const [user] = await db.insert(usuarios).values({
    nombre:   body.nombre,
    apellido: body.apellido ?? null,
    email,
    celular:  body.celular ?? null,
    password: hashedPassword,
    rol:      body.rol ?? 'AGENTE',
    permisos: body.permisos ?? null,
    activo:   body.activo ?? true,
    // Siempre true: la contraseña del alta la eligió el admin, así que la conoce
    // alguien más que el propio usuario. Este la cambia en su primer login y
    // queda siendo la única que la sabe.
    debeCambiarPassword: true,
  }).returning()

  return NextResponse.json(user, { status: 201 })
}
