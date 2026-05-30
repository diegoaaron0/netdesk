import { NextRequest, NextResponse } from 'next/server'
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
    cluster:  usuarios.cluster,
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
  const [user] = await db.insert(usuarios).values({
    nombre:   body.nombre,
    apellido: body.apellido ?? null,
    email:    body.email,
    celular:  body.celular ?? null,
    password: body.password ?? 'S0p0rt3!?@#',
    rol:      body.rol ?? 'AGENTE',
    cluster:  body.cluster ?? null,
    permisos: body.permisos ?? null,
    activo:   body.activo ?? true,
  }).returning()

  return NextResponse.json(user, { status: 201 })
}
