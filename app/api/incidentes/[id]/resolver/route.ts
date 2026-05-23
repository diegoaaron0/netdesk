import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const resueltoPor        = body.resueltoPor        ?? null
  const atribucionFinal    = body.atribucionFinal    ?? null
  const evaluableProveedor = body.evaluableProveedor ?? true

  const [inc] = await db.select({
    horaRegistro: incidentes.horaRegistro,
    tiendaId:     incidentes.tiendaId,
  }).from(incidentes).where(eq(incidentes.id, id))
  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const horaFin = new Date()
  const mttrMinutos = Math.round((horaFin.getTime() - new Date(inc.horaRegistro).getTime()) / 60000)

  const [updated] = await db.update(incidentes)
    .set({ estado: 'RESUELTO', horaFin, mttrMinutos, actualizadoEn: new Date(), resueltoPor, atribucionFinal, evaluableProveedor })
    .where(eq(incidentes.id, id))
    .returning()

  // Al resolver, limpiar contingenciaActiva de la tienda si no quedan otros
  // incidentes abiertos con contingencia activa para esa misma tienda.
  if (inc.tiendaId) {
    const rows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM incidentes
      WHERE tienda_id = ${inc.tiendaId}
        AND cont_activado_por IS NOT NULL
        AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
    `)
    if (Number((rows[0] as any)?.cnt ?? 0) === 0) {
      await db.update(tiendas)
        .set({ contingenciaActiva: false, contingenciaActivadaPor: null })
        .where(eq(tiendas.id, inc.tiendaId))
    }
  }

  return NextResponse.json(updated)
}
