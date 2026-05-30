import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { contingencias, tiendas } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'contingencias.gestionar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const { tiendaId, tipo, activadoPor, justificacion } = body
  if (!tiendaId || !tipo || !activadoPor || !justificacion) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const userId = (session.user as any)?.id ?? null

  const [created] = await db.insert(contingencias).values({
    tiendaId,
    tipo,
    activadoPor,
    usuarioId: userId,
    justificacion,
  }).returning()

  // Solo los tipos router activan el flag de tienda (datos móviles no usa este flag)
  if (tipo !== 'DATOS_MOVILES') {
    await db.update(tiendas)
      .set({ contingenciaActiva: true, contingenciaActivadaPor: activadoPor })
      .where(eq(tiendas.id, tiendaId))
  }

  return NextResponse.json(created)
}
