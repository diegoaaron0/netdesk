import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routersExternos, routerHistorial, tiendas } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'mantenimiento.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const tiendaDestinoId: string = body.tiendaId ?? ''
  const nota:            string = body.nota ?? ''

  if (!tiendaDestinoId) return NextResponse.json({ error: 'tiendaId requerido' }, { status: 400 })

  const [router] = await db.select({
    estado:        routersExternos.estado,
    almacenActual: routersExternos.almacenActual,
  }).from(routersExternos).where(eq(routersExternos.id, id))

  if (!router) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (router.estado !== 'DISPONIBLE') {
    return NextResponse.json({ error: 'Solo se puede desplegar un router DISPONIBLE' }, { status: 409 })
  }

  const [tiendaDest] = await db.select({ id: tiendas.id }).from(tiendas).where(eq(tiendas.id, tiendaDestinoId))
  if (!tiendaDest) return NextResponse.json({ error: 'Tienda destino no encontrada' }, { status: 404 })

  const ahora  = new Date()
  const userId = (session.user as any)?.id ?? null

  const updated = await db.transaction(async (tx) => {
    await tx.insert(routerHistorial).values({
      routerId:        id,
      tiendaId:        tiendaDestinoId,
      fechaIngreso:    ahora,
      accion:          'DESPLIEGUE',
      almacenOrigen:   router.almacenActual ?? null,
      nota:            nota || null,
      registradoPorId: userId,
    })
    const [u] = await tx.update(routersExternos)
      .set({ estado: 'EN_TIENDA_INACTIVO', tiendaActualId: tiendaDestinoId, almacenActual: null })
      .where(eq(routersExternos.id, id))
      .returning()
    return u
  })

  return NextResponse.json(updated)
}
