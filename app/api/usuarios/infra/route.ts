import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { usuarios } from '@/drizzle/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const data = await db.select({
    id:       usuarios.id,
    nombre:   usuarios.nombre,
    apellido: usuarios.apellido,
    email:    usuarios.email,
    celular:  usuarios.celular,
  })
    .from(usuarios)
    .where(and(eq(usuarios.rol, 'INFRAESTRUCTURA'), eq(usuarios.activo, true), isNull(usuarios.eliminadoEn)))

  return NextResponse.json(data)
}
