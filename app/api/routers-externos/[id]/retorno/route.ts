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
  const nota:            string = body.nota ?? ''
  const almacenDestino:  string = body.almacenDestino ?? ''

  if (!almacenDestino) return NextResponse.json({ error: 'almacenDestino requerido' }, { status: 400 })

  const [router] = await db.select({
    estado:         routersExternos.estado,
    tiendaActualId: routersExternos.tiendaActualId,
  }).from(routersExternos).where(eq(routersExternos.id, id))

  if (!router) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (router.estado === 'DISPONIBLE') return NextResponse.json({ error: 'El router ya está disponible en TI' }, { status: 409 })

  const ahora  = new Date()
  const userId = (session.user as any)?.id ?? null

  await db.insert(routerHistorial).values({
    routerId:        id,
    tiendaId:        router.tiendaActualId ?? null,
    fechaIngreso:    ahora,
    fechaRetorno:    ahora,
    accion:          'RETORNO',
    almacenDestino:  almacenDestino,
    nota:            nota || null,
    registradoPorId: userId,
  })

  const [updated] = await db.update(routersExternos)
    .set({ estado: 'DISPONIBLE', tiendaActualId: null, almacenActual: almacenDestino })
    .where(eq(routersExternos.id, id))
    .returning()

  // Limpiar contingencia_activa de la tienda origen si ya no quedan contingencias activas
  if (router.tiendaActualId) {
    const [incRows] = await db.execute<{ cnt: number }>(sql`
      SELECT COUNT(*)::int AS cnt FROM incidentes
      WHERE tienda_id = ${router.tiendaActualId}
        AND cont_activado_por IS NOT NULL
        AND cont_hora_desactivacion IS NULL
        AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
    `)
    const [contRows] = await db.execute<{ cnt: number }>(sql`
      SELECT COUNT(*)::int AS cnt FROM contingencias
      WHERE tienda_id = ${router.tiendaActualId}
        AND hora_desactivacion IS NULL
    `)
    if (Number((incRows as any).cnt ?? 0) + Number((contRows as any).cnt ?? 0) === 0) {
      await db.update(tiendas)
        .set({ contingenciaActiva: false, contingenciaActivadaPor: null })
        .where(eq(tiendas.id, router.tiendaActualId))
    }
  }

  return NextResponse.json(updated)
}
