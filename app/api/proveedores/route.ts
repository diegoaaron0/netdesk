import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { proveedores } from '@/drizzle/schema'
import { auth } from '@/auth'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const data = await db.select({ id: proveedores.id, nombre: proveedores.nombre })
    .from(proveedores)
    .orderBy(proveedores.nombre)

  return NextResponse.json(data)
}
