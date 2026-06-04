import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routersExternos, routerHistorial, tiendas } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const tiendaDestinoId: string = body.tiendaId ?? ''
  const justificacion:   string = body.justificacion ?? ''

  if (!tiendaDestinoId) return NextResponse.json({ error: 'tiendaId requerido' }, { status: 400 })

  const [router] = await db.select({
    estado:         routersExternos.estado,
    tiendaActualId: routersExternos.tiendaActualId,
  }).from(routersExternos).where(eq(routersExternos.id, id))

  if (!router) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (router.estado === 'DISPONIBLE') {
    return NextResponse.json({ error: 'El router está en TI. Para activarlo, crea un incidente.' }, { status: 409 })
  }
  if (router.tiendaActualId === tiendaDestinoId) {
    return NextResponse.json({ error: 'El router ya está en esa tienda' }, { status: 409 })
  }

  const [tiendaDest] = await db.select({ id: tiendas.id }).from(tiendas).where(eq(tiendas.id, tiendaDestinoId))
  if (!tiendaDest) return NextResponse.json({ error: 'Tienda destino no encontrada' }, { status: 404 })

  const ahora  = new Date()
  const userId = (session.user as any)?.id ?? null

  // Registrar traslado en historial (movimiento físico sin incidente)
  await db.insert(routerHistorial).values({
    routerId:        id,
    tiendaId:        tiendaDestinoId,
    fechaIngreso:    ahora,
    accion:          'TRASLADO',
    nota:            justificacion || null,
    registradoPorId: userId,
  })

  // Actualizar router: EN_TIENDA_INACTIVO en nueva tienda
  const [updated] = await db.update(routersExternos)
    .set({ estado: 'EN_TIENDA_INACTIVO', tiendaActualId: tiendaDestinoId })
    .where(eq(routersExternos.id, id))
    .returning()

  return NextResponse.json(updated)
}
