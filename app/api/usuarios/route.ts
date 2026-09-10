import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq, isNull } from 'drizzle-orm'
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

  // Contraseña inicial: la que envíe el admin, o el default del sistema (env var).
  // El literal queda solo como último recurso si la env no está configurada.
  const tienePasswordExplicito = typeof body.password === 'string' && body.password.trim().length > 0
  const rawPassword = tienePasswordExplicito
    ? body.password
    : (process.env.DEFAULT_USER_PASSWORD ?? 'S0p0rt3!?@#')
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
    // Contraseña por defecto → debe cambiarla en el primer login. Si el admin
    // eligió una contraseña explícita, no se fuerza el cambio.
    debeCambiarPassword: !tienePasswordExplicito,
  }).returning()

  return NextResponse.json(user, { status: 201 })
}
