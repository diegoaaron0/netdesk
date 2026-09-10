import { tiendas, routersExternos, incidenteMitigacionTramos } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { calcIeTramo, type TipoMitigacionTramo } from '@/lib/mitigacion-tramos'

/** Los únicos tipos de mitigación que mueven `tiendas.contingencia_activa`.
 *  Datos móviles y boleta manual NO la activan — mismo criterio que
 *  POST /mitigacion y que el flujo viejo. */
export const TIPOS_ROUTER: TipoMitigacionTramo[] = ['ROUTER_PROPIO', 'ROUTER_EXTERNO']

/** Transacción de drizzle. Se tipa laxo a propósito: este helper corre dentro
 *  de la transacción que abre cada endpoint, no abre la suya. */
type Tx = any

export interface CierreMitigacionOpts {
  incidenteId: string
  tiendaId: string | null
  /** Tipo del incidente (CAIDA_TOTAL, etc.) — lo necesita calcIeTramo. */
  tipoIncidente: string
  /** Campos viejos, sólo para el fallback de los incidentes sin tramos. */
  contActivadoPor: string | null
  routerExternoId: string | null
  horaFin: Date
}

/**
 * Cierra la mitigación de un incidente que se está resolviendo o cancelando:
 * sella el tramo abierto, limpia `tiendas.contingencia_activa` si ya no queda
 * ninguna fuente viva, y baja el router externo a EN_TIENDA_INACTIVO.
 *
 * Vive acá y no duplicado en resolver/ y cancelar/ porque tenían exactamente la
 * misma lógica copiada: mantener dos copias de la decisión de cierre es lo que
 * produjo la divergencia entre tramos y los campos viejos que arregló 34704ca.
 *
 * DE DÓNDE SALE LA DECISIÓN
 *   Fuente de verdad: `incidente_mitigacion_tramos`. Si el incidente tiene al
 *   menos un tramo, todo se decide con tramos. Si no tiene ninguno (los
 *   históricos que no migraron), se cae al gate viejo `cont_activado_por`.
 *
 * QUÉ NO HACE
 *   No escribe los campos viejos (cont, mov y boleta). El sellado de esos
 *   campos sigue donde estaba, en cada endpoint, y sigue gateado por los campos
 *   viejos a propósito: sólo se puede sellar lo que se abrió en el mismo
 *   modelo. Un incidente creado por POST /mitigacion no tiene
 *   cont_activado_por, y escribirle cont_hora_desactivacion dejaría un
 *   timestamp huérfano — el mismo bug ya documentado con mov_hora_activacion
 *   sin mov_activado_por.
 */
export async function cerrarMitigacionAlCerrarIncidente(tx: Tx, opts: CierreMitigacionOpts): Promise<void> {
  const { incidenteId, tiendaId, tipoIncidente, contActivadoPor, routerExternoId, horaFin } = opts

  const tramos = await tx.select().from(incidenteMitigacionTramos)
    .where(eq(incidenteMitigacionTramos.incidenteId, incidenteId))

  const tieneTramos   = tramos.length > 0
  const tramoAbierto  = tramos.find((t: any) => t.hasta == null) ?? null

  // 1 ── Sellar el tramo abierto. No se abre ninguno nuevo: el incidente cierra.
  if (tramoAbierto) {
    const [tienda] = await tx.select({
      ventaHoraSoles: tiendas.ventaHoraSoles, ventaHoraFdsSoles: tiendas.ventaHoraFdsSoles,
    }).from(tiendas).where(eq(tiendas.id, tiendaId!))

    const ieTramo = calcIeTramo(
      {
        tipo: tramoAbierto.tipo as TipoMitigacionTramo, factor: tramoAbierto.factor,
        desde: tramoAbierto.desde, hasta: horaFin, tipoIncidente,
      },
      tienda!, horaFin,
    )
    await tx.update(incidenteMitigacionTramos)
      .set({ hasta: horaFin, ieTramo: String(ieTramo), actualizadoEn: horaFin })
      .where(eq(incidenteMitigacionTramos.id, tramoAbierto.id))
  }

  // 2 ── ¿Este incidente tuvo alguna mitigación de tipo router?
  // Con tramos: cualquiera de tipo router, abierto o ya cerrado — si se
  // desactivó antes de resolver, la limpieza igual tiene que recalcularse.
  // Sin tramos: el gate viejo, intacto.
  const tuvoRouter = tieneTramos
    ? tramos.some((t: any) => TIPOS_ROUTER.includes(t.tipo))
    : !!contActivadoPor

  if (tiendaId && tuvoRouter) {
    // El conteo es de la TIENDA, no de este incidente, y cubre las dos fuentes:
    // tramos de router abiertos, e incidentes viejos sin tramos que todavía
    // tengan cont_activado_por vivo. Si sólo mirara tramos, un incidente
    // histórico con contingencia corriendo dejaría de contar y la tienda
    // quedaría marcada como sin contingencia teniéndola.
    // Corre DESPUÉS de sellar el tramo de arriba, así este incidente ya no se
    // cuenta a sí mismo.
    const rows = await tx.execute(sql`
      SELECT COUNT(DISTINCT i.id)::int AS cnt
      FROM incidentes i
      LEFT JOIN incidente_mitigacion_tramos tr
        ON tr.incidente_id = i.id AND tr.hasta IS NULL
       AND tr.tipo IN ('ROUTER_PROPIO','ROUTER_EXTERNO')
      WHERE i.tienda_id = ${tiendaId}
        AND i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
        AND (
          tr.id IS NOT NULL
          OR (
            i.cont_activado_por IS NOT NULL
            AND i.cont_hora_desactivacion IS NULL
            AND NOT EXISTS (SELECT 1 FROM incidente_mitigacion_tramos t2 WHERE t2.incidente_id = i.id)
          )
        )
    `)
    const standaloneRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM contingencias
      WHERE tienda_id = ${tiendaId} AND hora_desactivacion IS NULL
    `)
    const siguenActivas = Number((rows[0] as any)?.cnt ?? 0) + Number((standaloneRows[0] as any)?.cnt ?? 0)

    if (siguenActivas === 0) {
      await tx.update(tiendas)
        .set({ contingenciaActiva: false, contingenciaActivadaPor: null })
        .where(eq(tiendas.id, tiendaId))
    }
  }

  // 3 ── Router externo → EN_TIENDA_INACTIVO (físicamente sigue en la tienda).
  // Candidatos: el router de los tramos de tipo router y, además, el del campo
  // viejo del incidente. Se miran los dos porque la operación es idempotente
  // (sólo actúa sobre EN_TIENDA_ACTIVO) y omitir el viejo dejaría equipos
  // colgados en incidentes que mezclan ambos modelos.
  const candidatos = new Set<string>()
  for (const t of tramos) {
    if (TIPOS_ROUTER.includes(t.tipo) && t.routerExternoId) candidatos.add(t.routerExternoId)
  }
  if (routerExternoId) candidatos.add(routerExternoId)

  for (const rid of candidatos) {
    const [router] = await tx.select({ estado: routersExternos.estado })
      .from(routersExternos).where(eq(routersExternos.id, rid))
    if (router?.estado === 'EN_TIENDA_ACTIVO') {
      await tx.update(routersExternos)
        .set({ estado: 'EN_TIENDA_INACTIVO' })
        .where(eq(routersExternos.id, rid))
    }
  }
}
