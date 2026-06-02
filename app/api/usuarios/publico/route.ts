import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq, isNull, and } from 'drizzle-orm'

export async function GET() {
  const data = await db.select({
    id:     usuarios.id,
    nombre: usuarios.nombre,
    email:  usuarios.email,
  }).from(usuarios).where(and(eq(usuarios.activo, true), isNull(usuarios.eliminadoEn))).orderBy(usuarios.nombre)

  return NextResponse.json(data)
}
