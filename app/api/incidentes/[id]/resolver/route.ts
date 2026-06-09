import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, routersExternos } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const resueltoPor        = body.resueltoPor        ?? null
  const atribucionFinal    = body.atribucionFinal    ?? null
  const evaluableProveedor = body.evaluableProveedor ?? true

  const [inc] = await db.select({
    horaRegistro:          incidentes.horaRegistro,
    tiendaId:              incidentes.tiendaId,
    contActivadoPor:       incidentes.contActivadoPor,
    contHoraDesactivacion: incidentes.contHoraDesactivacion,
    contEsExterno:         incidentes.contEsExterno,
    movActivadoPor:        incidentes.movActivadoPor,
    movHoraDesactivacion:  incidentes.movHoraDesactivacion,
    tiempoAcumuladoMin:    incidentes.tiempoAcumuladoMin,
    routerExternoId:       incidentes.routerExternoId,
  }).from(incidentes).where(eq(incidentes.id, id))
  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const horaFin = new Date()
  const mttrDesdeUltimaApertura = Math.round((horaFin.getTime() - new Date(inc.horaRegistro).getTime()) / 60000)
  const mttrMinutos = mttrDesdeUltimaApertura + (inc.tiempoAcumuladoMin ?? 0)

  // Sellar contingencias del incidente que aún no fueron desactivadas manualmente
  const sealFields: Record<string, any> = {}
  if (inc.contActivadoPor && !inc.contHoraDesactivacion) {
    sealFields.contHoraDesactivacion = horaFin
  }
  if (inc.movActivadoPor && !inc.movHoraDesactivacion) {
    sealFields.movHoraDesactivacion = horaFin
  }

  const resueltoPorUsuarioId = (session.user as any)?.id ?? null
  const [updated] = await db.update(incidentes)
    .set({ estado: 'RESUELTO', horaFin, mttrMinutos, tiempoAcumuladoMin: null, actualizadoEn: new Date(), resueltoPor, atribucionFinal, evaluableProveedor, resueltoPorUsuarioId, ...sealFields })
    .where(eq(incidentes.id, id))
    .returning()

  // Limpiar contingencia_activa si no quedan otras fuentes activas (aplica a todos los tipos)
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

  // Router externo: al resolver → EN_TIENDA_INACTIVO (físicamente sigue en tienda)
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
