import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET() {
  try {
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
    }).from(usuarios).orderBy(usuarios.nombre)
    return NextResponse.json(data)
  } catch {
    // Fallback si la columna permisos aún no existe en la BD
    const data = await db.select({
      id:       usuarios.id,
      nombre:   usuarios.nombre,
      apellido: usuarios.apellido,
      email:    usuarios.email,
      celular:  usuarios.celular,
      rol:      usuarios.rol,
      cluster:  usuarios.cluster,
      activo:   usuarios.activo,
    }).from(usuarios).orderBy(usuarios.nombre)
    return NextResponse.json(data)
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rol = (session.user as any)?.rol
  if (rol !== 'SUPERVISOR') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const values: any = {
    nombre:   body.nombre,
    apellido: body.apellido ?? null,
    email:    body.email,
    celular:  body.celular ?? null,
    password: body.password ?? 'soporte123',
    rol:      body.rol ?? 'AGENTE',
    cluster:  body.cluster ?? null,
    activo:   body.activo ?? true,
  }
  if ('permisos' in body) values.permisos = body.permisos ?? null
  const [user] = await db.insert(usuarios).values(values).returning()

  return NextResponse.json(user, { status: 201 })
}
