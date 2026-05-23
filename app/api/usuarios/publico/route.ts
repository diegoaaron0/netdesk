import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const data = await db.select({
    id:     usuarios.id,
    nombre: usuarios.nombre,
    email:  usuarios.email,
    rol:    usuarios.rol,
  }).from(usuarios).where(eq(usuarios.activo, true)).orderBy(usuarios.nombre)

  return NextResponse.json(data)
}
