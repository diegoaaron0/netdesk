import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { contingencias, tiendas, routersExternos } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'contingencias.gestionar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const { tiendaId, tipo, activadoPor, justificacion, routerExternoId } = body
  if (!tiendaId || !tipo || !activadoPor || !justificacion) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  // ROUTER_EXTERNO requiere seleccionar un router
  if (tipo === 'ROUTER_EXTERNO' && !routerExternoId) {
    return NextResponse.json({ error: 'Debes seleccionar un router externo disponible.' }, { status: 400 })
  }

  const userId = (session.user as any)?.id ?? null

  // Validar que no haya otra contingencia standalone activa para esta tienda
  const [activa] = await db.execute<{ cnt: number }>(sql`
    SELECT COUNT(*)::int AS cnt FROM contingencias
    WHERE tienda_id = ${tiendaId} AND hora_desactivacion IS NULL
  `)
  if (Number((activa as any).cnt ?? 0) > 0) {
    return NextResponse.json({ error: 'Ya hay una contingencia activa para esta tienda. Desactívala primero.' }, { status: 409 })
  }

  // ROUTER_EXTERNO: validar que el router esté disponible
  if (tipo === 'ROUTER_EXTERNO' && routerExternoId) {
    const [router] = await db.select({ estado: routersExternos.estado })
      .from(routersExternos).where(eq(routersExternos.id, routerExternoId))
    if (!router || !['EN_DEPOSITO', 'DISPONIBLE'].includes(router.estado)) {
      return NextResponse.json({ error: 'El router seleccionado no está disponible.' }, { status: 409 })
    }
  }

  const [created] = await db.insert(contingencias).values({
    tiendaId,
    tipo,
    activadoPor,
    usuarioId: userId,
    justificacion,
  }).returning()

  // Routers activan el flag de tienda (datos móviles no usa este flag)
  if (tipo !== 'DATOS_MOVILES') {
    await db.update(tiendas)
      .set({ contingenciaActiva: true, contingenciaActivadaPor: activadoPor })
      .where(eq(tiendas.id, tiendaId))
  }

  // ROUTER_EXTERNO: marcar el router como activo en la tienda
  if (tipo === 'ROUTER_EXTERNO' && routerExternoId) {
    await db.update(routersExternos)
      .set({ estado: 'EN_TIENDA_ACTIVO', tiendaActualId: tiendaId })
      .where(eq(routersExternos.id, routerExternoId))
  }

  return NextResponse.json(created)
}
