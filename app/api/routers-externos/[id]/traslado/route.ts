import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routersExternos, routerHistorial, tiendas } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
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

  // Sellar entrada abierta en historial de tienda origen
  const rows = await db.execute(sql`
    SELECT id, fecha_ingreso FROM router_historial
    WHERE router_id = ${id} AND fecha_retorno IS NULL
    ORDER BY fecha_ingreso DESC LIMIT 1
  `)
  const entrada = (rows as any[])[0]
  if (entrada) {
    const tiempoUsoMin = Math.round((ahora.getTime() - new Date(entrada.fecha_ingreso).getTime()) / 60000)
    await db.execute(sql`
      UPDATE router_historial
      SET fecha_retorno = ${ahora.toISOString()}::timestamptz, tiempo_uso_min = ${tiempoUsoMin}
      WHERE id = ${entrada.id}
    `)
  }

  // Crear nueva entrada para la tienda destino
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
