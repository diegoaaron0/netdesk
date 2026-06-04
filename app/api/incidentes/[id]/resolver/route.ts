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
    horaRegistro:       incidentes.horaRegistro,
    tiendaId:           incidentes.tiendaId,
    contActivadoPor:    incidentes.contActivadoPor,
    contEsExterno:      incidentes.contEsExterno,
    tiempoAcumuladoMin: incidentes.tiempoAcumuladoMin,
    routerExternoId:    incidentes.routerExternoId,
  }).from(incidentes).where(eq(incidentes.id, id))
  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const horaFin = new Date()
  // MTTR = tiempo desde la última apertura/reapertura + tiempos acumulados de aperturas anteriores
  // No cuenta el tiempo que estuvo "cerrado" entre una resolución incorrecta y la reapertura
  const mttrDesdeUltimaApertura = Math.round((horaFin.getTime() - new Date(inc.horaRegistro).getTime()) / 60000)
  const mttrMinutos = mttrDesdeUltimaApertura + (inc.tiempoAcumuladoMin ?? 0)

  const resueltoPorUsuarioId = (session.user as any)?.id ?? null
  const [updated] = await db.update(incidentes)
    .set({ estado: 'RESUELTO', horaFin, mttrMinutos, tiempoAcumuladoMin: null, actualizadoEn: new Date(), resueltoPor, atribucionFinal, evaluableProveedor, resueltoPorUsuarioId })
    .where(eq(incidentes.id, id))
    .returning()

  // Limpiar flag de contingencia_activa:
  // - Siempre si el incidente no usó contingencia
  // - También para ROUTER_EXTERNO: al resolver el incidente la tienda ya no necesita el flag
  // - NO limpiar para ROUTER_PROPIO: el router físico sigue instalado hasta que TI lo retire manualmente
  if (inc.tiendaId && (!inc.contActivadoPor || inc.contEsExterno)) {
    const rows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM incidentes
      WHERE tienda_id = ${inc.tiendaId}
        AND cont_activado_por IS NOT NULL
        AND cont_hora_desactivacion IS NULL
        AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
    `)
    if (Number((rows[0] as any)?.cnt ?? 0) === 0) {
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

  return NextResponse.json({ ...updated, contingenciaMantieneActiva: !!inc.contActivadoPor && !inc.contEsExterno })
}
