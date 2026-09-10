import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, routersExternos, incidenteMitigacionTramos } from '@/drizzle/schema'
import { eq, sql, and, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { calcIeTramo } from '@/lib/mitigacion-tramos'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.cancelar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [inc] = await db.select({
    tiendaId:              incidentes.tiendaId,
    tipo:                  incidentes.tipo,
    contActivadoPor:       incidentes.contActivadoPor,
    contHoraDesactivacion: incidentes.contHoraDesactivacion,
    movActivadoPor:        incidentes.movActivadoPor,
    movHoraDesactivacion:  incidentes.movHoraDesactivacion,
    routerExternoId:       incidentes.routerExternoId,
  }).from(incidentes).where(eq(incidentes.id, id))
  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Fase 2 (Paso 4) — sellar el tramo abierto (modelo nuevo), en paralelo al
  // sellado de cont_*/mov_* de abajo (modelo viejo, sin tocar). Sin tramos
  // (flujo viejo hoy en producción), no hay nada que sellar — no rompe.
  const [tramoAbierto] = await db.select().from(incidenteMitigacionTramos)
    .where(and(eq(incidenteMitigacionTramos.incidenteId, id), isNull(incidenteMitigacionTramos.hasta)))
  let tienda: { ventaHoraSoles: string | null; ventaHoraFdsSoles: string | null } | undefined
  if (tramoAbierto) {
    [tienda] = await db.select({ ventaHoraSoles: tiendas.ventaHoraSoles, ventaHoraFdsSoles: tiendas.ventaHoraFdsSoles })
      .from(tiendas).where(eq(tiendas.id, inc.tiendaId!))
  }

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

  // Writes relacionados en una transacción: evita dejar el incidente CANCELADO con la
  // contingencia de tienda o el router en estado inconsistente si algún paso falla.
  const updated = await db.transaction(async (tx) => {
    const [upd] = await tx.update(incidentes)
      .set({ estado: 'CANCELADO', horaFin, actualizadoEn: horaFin, canceladoPorId, ...sealFields })
      .where(eq(incidentes.id, id))
      .returning()

    // Limpiar contingencia_activa si no quedan otras fuentes activas
    if (inc.tiendaId && inc.contActivadoPor) {
      const rows = await tx.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM incidentes
        WHERE tienda_id = ${inc.tiendaId}
          AND cont_activado_por IS NOT NULL
          AND cont_hora_desactivacion IS NULL
          AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
      `)
      const standaloneRows = await tx.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM contingencias
        WHERE tienda_id = ${inc.tiendaId}
          AND hora_desactivacion IS NULL
      `)
      const stillActive = Number((rows[0] as any)?.cnt ?? 0) + Number((standaloneRows[0] as any)?.cnt ?? 0)
      if (stillActive === 0) {
        await tx.update(tiendas)
          .set({ contingenciaActiva: false, contingenciaActivadaPor: null })
          .where(eq(tiendas.id, inc.tiendaId))
      }
    }

    // Router externo: al cancelar → EN_TIENDA_INACTIVO (el router sigue físicamente en tienda)
    if (inc.routerExternoId) {
      const [router] = await tx.select({ estado: routersExternos.estado })
        .from(routersExternos).where(eq(routersExternos.id, inc.routerExternoId))
      if (router?.estado === 'EN_TIENDA_ACTIVO') {
        await tx.update(routersExternos)
          .set({ estado: 'EN_TIENDA_INACTIVO' })
          .where(eq(routersExternos.id, inc.routerExternoId))
      }
    }

    // Fase 2 (Paso 4) — sellar el tramo abierto, si lo hay. No se abre ninguno nuevo.
    if (tramoAbierto) {
      const ieTramo = calcIeTramo(
        { tipo: tramoAbierto.tipo as any, factor: tramoAbierto.factor, desde: tramoAbierto.desde, hasta: horaFin, tipoIncidente: inc.tipo },
        tienda!, horaFin,
      )
      await tx.update(incidenteMitigacionTramos)
        .set({ hasta: horaFin, ieTramo: String(ieTramo), actualizadoEn: horaFin })
        .where(eq(incidenteMitigacionTramos.id, tramoAbierto.id))
    }

    return upd
  })

  return NextResponse.json(updated)
}
