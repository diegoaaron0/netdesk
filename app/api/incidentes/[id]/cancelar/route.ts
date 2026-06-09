import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, contingencias, routersExternos } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.cancelar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [inc] = await db.select({
    tiendaId:              incidentes.tiendaId,
    contActivadoPor:       incidentes.contActivadoPor,
    contHoraDesactivacion: incidentes.contHoraDesactivacion,
    movActivadoPor:        incidentes.movActivadoPor,
    movHoraDesactivacion:  incidentes.movHoraDesactivacion,
    routerExternoId:       incidentes.routerExternoId,
  }).from(incidentes).where(eq(incidentes.id, id))
  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const horaFin = new Date()
  const canceladoPorId = (session.user as any)?.id ?? null

  // Sellar contingencias que aún no fueron desactivadas manualmente
  const sealFields: Record<string, any> = {}
  if (inc.contActivadoPor && !inc.contHoraDesactivacion) {
    sealFields.contHoraDesactivacion = horaFin
  }
  if (inc.movActivadoPor && !inc.movHoraDesactivacion) {
    sealFields.movHoraDesactivacion = horaFin
  }

  const [updated] = await db.update(incidentes)
    .set({ estado: 'CANCELADO', horaFin, actualizadoEn: horaFin, canceladoPorId, ...sealFields })
    .where(eq(incidentes.id, id))
    .returning()

  // Limpiar contingencia_activa si no quedan otras fuentes activas
  if (inc.tiendaId && inc.contActivadoPor) {
    const rows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM incidentes
      WHERE tienda_id = ${inc.tiendaId}
        AND cont_activado_por IS NOT NULL
        AND cont_hora_desactivacion IS NULL
        AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
    `)
    const standaloneRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM contingencias
      WHERE tienda_id = ${inc.tiendaId}
        AND hora_desactivacion IS NULL
    `)
    const stillActive = Number((rows[0] as any)?.cnt ?? 0) + Number((standaloneRows[0] as any)?.cnt ?? 0)
    if (stillActive === 0) {
      await db.update(tiendas)
        .set({ contingenciaActiva: false, contingenciaActivadaPor: null })
        .where(eq(tiendas.id, inc.tiendaId))
    }
  }

  // Router externo: al cancelar → EN_TIENDA_INACTIVO (el router sigue físicamente en tienda)
  if (inc.routerExternoId) {
    const [router] = await db.select({ estado: routersExternos.estado })
      .from(routersExternos).where(eq(routersExternos.id, inc.routerExternoId))
    if (router?.estado === 'EN_TIENDA_ACTIVO') {
      await db.update(routersExternos)
        .set({ estado: 'EN_TIENDA_INACTIVO' })
        .where(eq(routersExternos.id, inc.routerExternoId))
    }
  }

  return NextResponse.json(updated)
}
