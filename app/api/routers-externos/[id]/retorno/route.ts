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

  // Registrar acción de retorno en historial (movimiento físico sin incidente)
  await db.insert(routerHistorial).values({
    routerId:        id,
    tiendaId:        router.tiendaActualId!,
    fechaIngreso:    ahora,
    fechaRetorno:    ahora,
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
