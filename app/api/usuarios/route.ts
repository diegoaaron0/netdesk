import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const data = await db.select({
    id: usuarios.id,
    nombre: usuarios.nombre,
    email: usuarios.email,
    rol: usuarios.rol,
  }).from(usuarios).where(eq(usuarios.activo, true))

  return NextResponse.json(data)
}
