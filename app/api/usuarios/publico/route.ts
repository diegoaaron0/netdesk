import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { eq, isNull, and } from 'drizzle-orm'

export async function GET() {
  // `rol` es necesario para el filtro de agentes de la lista de incidentes, que
  // solo ofrece a quienes registran o atienden incidentes (deja fuera GERENCIA y
  // DEMO). Sin este campo el filtro del front no matcheaba a nadie y el desplegable
  // salía vacío.
  const data = await db.select({
    id:     usuarios.id,
    nombre: usuarios.nombre,
    email:  usuarios.email,
    rol:    usuarios.rol,
  }).from(usuarios).where(and(eq(usuarios.activo, true), isNull(usuarios.eliminadoEn))).orderBy(usuarios.nombre)

  return NextResponse.json(data)
}
