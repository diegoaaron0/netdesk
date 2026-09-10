import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, tiendasHistorial, routersExternos, incidenteMitigacionTramos } from '@/drizzle/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import {
  calcIeTramo, estaActivo, validarActivacionMitigacion, normFactorMitigacion, factorBaseSinMitigacion,
  type TipoMitigacionTramo,
} from '@/lib/mitigacion-tramos'

const TIPOS_VALIDOS: TipoMitigacionTramo[] = ['SIN_MITIGACION', 'ROUTER_PROPIO', 'ROUTER_EXTERNO', 'DATOS_MOVILES', 'BOLETA_MANUAL']
const TIPOS_ROUTER: TipoMitigacionTramo[] = ['ROUTER_PROPIO', 'ROUTER_EXTERNO']

/**
 * Fase 2 (Paso 3) — endpoint nuevo y separado del PUT viejo de incidentes.
 * El PUT actual (cont_, mov_ y boleta_ sueltos) sigue funcionando sin cambios;
 * este endpoint todavía no está conectado a ningún frontend (llega en Fase 4).
 * Usa las funciones de lib/mitigacion-tramos.ts — no reimplementa nada de eso.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [inc] = await db.select({
    id: incidentes.id, tipo: incidentes.tipo, estado: incidentes.estado, tiendaId: incidentes.tiendaId,
  }).from(incidentes).where(eq(incidentes.id, id))
  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  if (['RESUELTO', 'CANCELADO', 'CERRADO'].includes(inc.estado)) {
    return NextResponse.json({ error: 'No se puede cambiar la mitigación de un incidente cerrado' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const tipo: TipoMitigacionTramo = body.tipo
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: `tipo inválido: "${body.tipo}"` }, { status: 400 })
  }

  try {
    validarActivacionMitigacion(inc.tipo, tipo)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409 })
  }

  const [tienda] = await db.select({
    id: tiendas.id, tieneContingencia: tiendas.tieneContingencia,
    ventaHoraSoles: tiendas.ventaHoraSoles, ventaHoraFdsSoles: tiendas.ventaHoraFdsSoles,
  }).from(tiendas).where(eq(tiendas.id, inc.tiendaId!))

  // Router propio: bloquea la tienda sin contingencia propia, salvo que ya estuviera
  // activo antes (misma excepción "solo nuevas activaciones" del PUT viejo).
  if (tipo === 'ROUTER_PROPIO') {
    const yaActivo = await estaActivo(id, 'ROUTER_PROPIO')
    if (!yaActivo && !tienda?.tieneContingencia) {
      return NextResponse.json({ error: 'Esta tienda no tiene contingencia propia registrada. Solo puede usar Router externo.' }, { status: 409 })
    }
  }

  // Router externo: requiere elegir CUÁL — antes se aceptaba sin routerExternoId
  // y quedaba un tramo ROUTER_EXTERNO sin router asignado (bug real: el frontend
  // nunca mandaba este dato, así que el chequeo de "no duplicado en otra tienda"
  // de abajo nunca se disparaba en la práctica).
  const routerExternoId: string | null = tipo === 'ROUTER_EXTERNO' ? (body.routerExternoId ?? null) : null
  if (tipo === 'ROUTER_EXTERNO' && !routerExternoId) {
    return NextResponse.json({ error: 'Debe seleccionar cuál router externo usar' }, { status: 400 })
  }
  if (tipo === 'ROUTER_EXTERNO' && routerExternoId) {
    const [router] = await db.select({ estado: routersExternos.estado, tiendaActualId: routersExternos.tiendaActualId })
      .from(routersExternos).where(eq(routersExternos.id, routerExternoId))
    if (router?.estado === 'EN_TIENDA_ACTIVO' && router.tiendaActualId !== inc.tiendaId) {
      return NextResponse.json({ error: 'Este router ya está activo en otro incidente. Debe desactivarse primero.' }, { status: 409 })
    }
  }

  // Resolver el factor: SIN_MITIGACION usa FACTOR_BASE_SIN_MITIGACION; el resto
  // usa el factor ya resuelto del body, o lo resuelve desde rendimiento categórico.
  const factor = tipo === 'SIN_MITIGACION'
    ? factorBaseSinMitigacion(inc.tipo)
    : (body.factor != null ? Number(body.factor) : normFactorMitigacion(body.rendimiento))

  const [tramoActual] = await db.select().from(incidenteMitigacionTramos)
    .where(and(eq(incidenteMitigacionTramos.incidenteId, id), isNull(incidenteMitigacionTramos.hasta)))

  // No-op: guardado redundante (mismo tipo+factor+router) no crea un tramo de duración cero.
  if (
    tramoActual
    && tramoActual.tipo === tipo
    && Number(tramoActual.factor) === factor
    && (tramoActual.routerExternoId ?? null) === routerExternoId
  ) {
    return NextResponse.json(tramoActual)
  }

  const ahora = new Date()
  const nuevoTramo = await db.transaction(async (tx) => {
    if (tramoActual) {
      const ieTramo = calcIeTramo(
        { tipo: tramoActual.tipo as TipoMitigacionTramo, factor: tramoActual.factor, desde: tramoActual.desde, hasta: ahora, tipoIncidente: inc.tipo },
        tienda!, ahora,
      )
      await tx.update(incidenteMitigacionTramos)
        .set({ hasta: ahora, ieTramo: String(ieTramo), actualizadoEn: ahora })
        .where(eq(incidenteMitigacionTramos.id, tramoActual.id))
    }

    const [creado] = await tx.insert(incidenteMitigacionTramos).values({
      incidenteId: id, tipo, factor: String(factor),
      activadoPor: body.activadoPor ?? null,
      observacion: body.observacion ?? null,
      routerExternoId,
      desde: ahora, hasta: null,
    }).returning()
    return creado
  })

  // ── Efectos secundarios (reubicados tal cual desde el PUT viejo) ──────────
  if (tipo === 'ROUTER_EXTERNO' && routerExternoId) {
    await db.update(routersExternos)
      .set({ estado: 'EN_TIENDA_ACTIVO', tiendaActualId: inc.tiendaId })
      .where(eq(routersExternos.id, routerExternoId))
  }
  if (tramoActual?.tipo === 'ROUTER_EXTERNO' && tramoActual.routerExternoId) {
    const [routerViejo] = await db.select({ estado: routersExternos.estado })
      .from(routersExternos).where(eq(routersExternos.id, tramoActual.routerExternoId))
    if (routerViejo?.estado === 'EN_TIENDA_ACTIVO') {
      await db.update(routersExternos)
        .set({ estado: 'EN_TIENDA_INACTIVO' })
        .where(eq(routersExternos.id, tramoActual.routerExternoId))
    }
  }

  // Sync tiendas.contingencia_activa — solo router propio/externo la mueven
  // (datos móviles y boleta manual NO activan el flag de tienda, igual que hoy).
  if (inc.tiendaId) {
    const userId = (session.user as any)?.id ?? null
    if (TIPOS_ROUTER.includes(tipo)) {
      await db.update(tiendas)
        .set({ contingenciaActiva: true, contingenciaActivadaPor: body.activadoPor ?? null })
        .where(eq(tiendas.id, inc.tiendaId))
      await db.insert(tiendasHistorial).values({
        tiendaId: inc.tiendaId, usuarioId: userId, campoEditado: 'contingenciaActiva',
        valorAnterior: 'false', valorNuevo: `true — vía incidente ${id} (tramo ${tipo})`,
      })
    } else if (tramoActual && TIPOS_ROUTER.includes(tramoActual.tipo as TipoMitigacionTramo)) {
      // El tramo nuevo (recién creado) no es router — basta ver si queda algún
      // OTRO tramo abierto de tipo router en cualquier incidente de esta tienda.
      const abiertosTienda = await db.select({ tipo: incidenteMitigacionTramos.tipo })
        .from(incidenteMitigacionTramos)
        .innerJoin(incidentes, eq(incidenteMitigacionTramos.incidenteId, incidentes.id))
        .where(and(
          eq(incidentes.tiendaId, inc.tiendaId),
          isNull(incidenteMitigacionTramos.hasta),
        ))
      const quedaRouterAbierto = abiertosTienda.some(r => TIPOS_ROUTER.includes(r.tipo as TipoMitigacionTramo))
      if (!quedaRouterAbierto) {
        await db.update(tiendas)
          .set({ contingenciaActiva: false, contingenciaActivadaPor: null })
          .where(eq(tiendas.id, inc.tiendaId))
        await db.insert(tiendasHistorial).values({
          tiendaId: inc.tiendaId, usuarioId: userId, campoEditado: 'contingenciaActiva',
          valorAnterior: 'true', valorNuevo: `false — vía incidente ${id} (tramo ahora ${tipo})`,
        })
      }
    }
  }

  return NextResponse.json(nuevoTramo)
}
