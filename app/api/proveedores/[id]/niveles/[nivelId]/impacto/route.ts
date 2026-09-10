import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { proveedoresNiveles, fichasNiveles, fichas } from '@/drizzle/schema'
import { eq, and, count, notInArray } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; nivelId: string }> }) {
  const { id, nivelId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'proveedores.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [nivelMolde] = await db.select().from(proveedoresNiveles)
    .where(and(eq(proveedoresNiveles.id, nivelId), eq(proveedoresNiveles.proveedorId, id))).limit(1)
  if (!nivelMolde) return NextResponse.json({ error: 'Nivel no encontrado' }, { status: 404 })

  // Mismo predicado que la propagación real (PUT .../niveles/[nivelId]): fichas
  // no históricas/dadas de baja, con este nivel sincronizado (no personalizado).
  const [{ total }] = await db.select({ total: count() })
    .from(fichasNiveles)
    .innerJoin(fichas, eq(fichasNiveles.fichaId, fichas.id))
    .where(and(
      eq(fichas.proveedorId, id),
      eq(fichasNiveles.nivel, nivelMolde.nivel),
      eq(fichasNiveles.personalizado, false),
      notInArray(fichas.estado, ['HISTORICA', 'DADA_DE_BAJA']),
    ))

  return NextResponse.json({ count: total })
}
