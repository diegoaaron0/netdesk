import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routersExternos, routerHistorial } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const nota: string = body.nota ?? ''

  const [router] = await db.select({
    estado:         routersExternos.estado,
    tiendaActualId: routersExternos.tiendaActualId,
  }).from(routersExternos).where(eq(routersExternos.id, id))

  if (!router) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (router.estado === 'DISPONIBLE') return NextResponse.json({ error: 'El router ya está disponible en TI' }, { status: 409 })

  const ahora = new Date()
  const userId = (session.user as any)?.id ?? null

  // Sellar entrada abierta en historial
  const rows = await db.execute(sql`
    SELECT id, fecha_ingreso FROM router_historial
    WHERE router_id = ${id} AND fecha_retorno IS NULL
    ORDER BY fecha_ingreso DESC
    LIMIT 1
  `)
  const entrada = (rows as any[])[0]
  if (entrada) {
    const tiempoUsoMin = Math.round((ahora.getTime() - new Date(entrada.fecha_ingreso).getTime()) / 60000)
    await db.execute(sql`
      UPDATE router_historial
      SET fecha_retorno = ${ahora.toISOString()}::timestamptz,
          tiempo_uso_min = ${tiempoUsoMin}
      WHERE id = ${entrada.id}
    `)
  }

  // Registrar acción de retorno
  await db.insert(routerHistorial).values({
    routerId:        id,
    tiendaId:        router.tiendaActualId!,
    fechaIngreso:    ahora,
    fechaRetorno:    ahora,
    tiempoUsoMin:    0,
    accion:          'RETORNO',
    nota:            nota || null,
    registradoPorId: userId,
  })

  // Cambiar estado a DISPONIBLE
  const [updated] = await db.update(routersExternos)
    .set({ estado: 'DISPONIBLE', tiendaActualId: null })
    .where(eq(routersExternos.id, id))
    .returning()

  return NextResponse.json(updated)
}
