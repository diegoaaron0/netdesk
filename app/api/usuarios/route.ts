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
    cluster:  usuarios.cluster,
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
  if (!body.email?.trim()) return NextResponse.json({ error: 'El correo es obligatorio' }, { status: 400 })
  // Contraseña inicial: la que envíe el admin, o el default del sistema (env var).
  // El literal queda solo como último recurso si la env no está configurada.
  const rawPassword = (typeof body.password === 'string' && body.password.trim())
    ? body.password
    : (process.env.DEFAULT_USER_PASSWORD ?? 'S0p0rt3!?@#')
  const hashedPassword = await bcrypt.hash(rawPassword, 12)

  const [user] = await db.insert(usuarios).values({
    nombre:   body.nombre,
    apellido: body.apellido ?? null,
    email:    body.email,
    celular:  body.celular ?? null,
    password: hashedPassword,
    rol:      body.rol ?? 'AGENTE',
    cluster:  body.cluster ?? null,
    permisos: body.permisos ?? null,
    activo:   body.activo ?? true,
  }).returning()

  return NextResponse.json(user, { status: 201 })
}
