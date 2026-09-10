import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, incidenteMitigacionTramos, incidenteMitigacionTramosHistorial } from '@/drizzle/schema'
import { eq, asc, and, ne } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { calcIeTramo, factorBaseSinMitigacion } from '@/lib/mitigacion-tramos'

type TramoRow = typeof incidenteMitigacionTramos.$inferSelect

function snapshot(t: TramoRow) {
  return {
    id: t.id, incidenteId: t.incidenteId, tipo: t.tipo, factor: t.factor,
    activadoPor: t.activadoPor, observacion: t.observacion, routerExternoId: t.routerExternoId,
    desde: new Date(t.desde).toISOString(), hasta: t.hasta ? new Date(t.hasta).toISOString() : null,
    ieTramo: t.ieTramo, origen: t.origen,
  }
}

/**
 * Fase 2 (Paso 5) — editar un tramo ya sellado (regularizar tickets viejos).
 * Endpoint enteramente nuevo, sin conexión al flujo viejo ni a ningún frontend.
 *
 * Decisiones no explícitas en el pedido, tomadas aquí y documentadas para que
 * se puedan revisar:
 *  - El tramo ABIERTO nunca se toca ni como objetivo ni como vecino. Si el
 *    "siguiente" cronológico del objetivo es el tramo abierto, se usa su
 *    `desde` como techo duro: un hueco antes de él SÍ se rellena (mismo
 *    criterio que con cualquier otro vecino), pero superponerse con él
 *    (invadir su rango ya transcurrido) se rechaza con 400 — eso es tarea
 *    del endpoint de cambiar mitigación, no de este.
 *  - "Nunca más allá de los 2 vecinos inmediatos" (regla 4) se interpreta
 *    como límite duro: si el nuevo rango necesitaría tragarse un vecino Y
 *    seguir más allá de su propio límite lejano, se rechaza con 400 en vez
 *    de intentar un efecto en cadena sobre un tercer tramo.
 *  - Un vecino con origen RELLENO_AUTOMATICO que queda con duración cero se
 *    borra con la MISMA compuerta de historial que cualquier otro vecino
 *    (regla 6b/6c) — la auditoría lo registra como RELLENO_ELIMINADO en vez
 *    de VECINO_ELIMINADO para distinguirlo.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tramoId: string }> },
) {
  const { id, tramoId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.editar-tramos')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [inc] = await db.select({
    id: incidentes.id, tipo: incidentes.tipo, tiendaId: incidentes.tiendaId,
    horaRegistro: incidentes.horaRegistro, horaFin: incidentes.horaFin,
  }).from(incidentes).where(eq(incidentes.id, id))
  if (!inc) return NextResponse.json({ error: 'Incidente no encontrado' }, { status: 404 })

  const [objetivo] = await db.select().from(incidenteMitigacionTramos)
    .where(eq(incidenteMitigacionTramos.id, tramoId))
  if (!objetivo || objetivo.incidenteId !== id) {
    return NextResponse.json({ error: 'Tramo no encontrado' }, { status: 404 })
  }

  // Regla 1: el tramo actualmente abierto nunca se edita acá.
  if (objetivo.hasta === null) {
    return NextResponse.json(
      { error: 'No se puede editar el tramo actualmente activo — usa el endpoint de cambiar mitigación para el tramo activo' },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const ahora = new Date()
  const nuevoDesde = body.desde !== undefined ? new Date(body.desde) : new Date(objetivo.desde)
  const nuevoHasta = body.hasta !== undefined ? (body.hasta === null ? null : new Date(body.hasta)) : new Date(objetivo.hasta!)

  // Regla 2: nada en el futuro. Regla adicional: un tramo ya sellado no puede
  // "reabrirse" (hasta=null) desde este endpoint — eso tampoco es su trabajo.
  if (nuevoHasta === null) {
    return NextResponse.json({ error: 'No se puede quitar la hora de cierre de un tramo ya sellado' }, { status: 400 })
  }
  if (nuevoDesde.getTime() > ahora.getTime() || nuevoHasta.getTime() > ahora.getTime()) {
    return NextResponse.json({ error: 'No se puede poner una fecha en el futuro' }, { status: 400 })
  }
  if (nuevoHasta.getTime() <= nuevoDesde.getTime()) {
    return NextResponse.json({ error: '"hasta" no puede ser anterior o igual a "desde"' }, { status: 400 })
  }

  // Regla 3: dentro de los límites del incidente.
  const limiteInferior = new Date(inc.horaRegistro).getTime()
  const limiteSuperior = inc.horaFin ? new Date(inc.horaFin).getTime() : ahora.getTime()
  if (nuevoDesde.getTime() < limiteInferior || nuevoHasta.getTime() > limiteSuperior) {
    return NextResponse.json({ error: 'El rango debe estar dentro de la duración del incidente' }, { status: 400 })
  }

  // No-op: nada cambió, no hace falta tocar la BD.
  if (nuevoDesde.getTime() === new Date(objetivo.desde).getTime() && nuevoHasta.getTime() === new Date(objetivo.hasta!).getTime()) {
    return NextResponse.json({ editado: objetivo, relleno: null, vecinoAnterior: null, vecinoSiguiente: null })
  }

  // Regla 4: cargar vecino anterior y siguiente inmediatos (por orden de `desde`).
  const todos = await db.select().from(incidenteMitigacionTramos)
    .where(eq(incidenteMitigacionTramos.incidenteId, id))
    .orderBy(asc(incidenteMitigacionTramos.desde))
  const idx = todos.findIndex(t => t.id === objetivo.id)
  const anterior = idx > 0 ? todos[idx - 1] : null
  const siguienteRaw = idx < todos.length - 1 ? todos[idx + 1] : null
  const siguienteEsAbierto = !!siguienteRaw && siguienteRaw.hasta === null
  const siguiente = siguienteEsAbierto ? null : siguienteRaw

  const [tienda] = await db.select({ ventaHoraSoles: tiendas.ventaHoraSoles, ventaHoraFdsSoles: tiendas.ventaHoraFdsSoles })
    .from(tiendas).where(eq(tiendas.id, inc.tiendaId!))

  // ── Planificar efectos sobre el vecino anterior ───────────────────────────
  type Efecto =
    | { tipo: 'ninguno' }
    | { tipo: 'hueco'; desde: Date; hasta: Date }
    | { tipo: 'recorte'; nuevoDesde?: Date; nuevoHasta?: Date }
    | { tipo: 'tapado' }

  let efectoAnterior: Efecto = { tipo: 'ninguno' }
  if (anterior) {
    if (nuevoDesde.getTime() < new Date(anterior.desde).getTime()) {
      return NextResponse.json({ error: 'El rango se extiende más allá del vecino inmediato anterior' }, { status: 400 })
    } else if (nuevoDesde.getTime() > new Date(anterior.hasta!).getTime()) {
      efectoAnterior = { tipo: 'hueco', desde: new Date(anterior.hasta!), hasta: nuevoDesde }
    } else if (nuevoDesde.getTime() === new Date(anterior.desde).getTime()) {
      efectoAnterior = { tipo: 'tapado' }
    } else if (nuevoDesde.getTime() < new Date(anterior.hasta!).getTime()) {
      efectoAnterior = { tipo: 'recorte', nuevoHasta: nuevoDesde }
    }
  } else if (nuevoDesde.getTime() > limiteInferior) {
    // Sin vecino anterior real (el objetivo es el primer tramo del incidente):
    // el límite virtual es horaRegistro. Un hueco ahí igual se rellena, para
    // no romper la cobertura continua desde el inicio del incidente.
    efectoAnterior = { tipo: 'hueco', desde: new Date(limiteInferior), hasta: nuevoDesde }
  }

  // ── Planificar efectos sobre el vecino siguiente ──────────────────────────
  let efectoSiguiente: Efecto = { tipo: 'ninguno' }
  if (siguienteEsAbierto && siguienteRaw) {
    if (nuevoHasta.getTime() > new Date(siguienteRaw.desde).getTime()) {
      return NextResponse.json({ error: 'No se puede superponer con el tramo actualmente activo' }, { status: 400 })
    } else if (nuevoHasta.getTime() < new Date(siguienteRaw.desde).getTime()) {
      efectoSiguiente = { tipo: 'hueco', desde: nuevoHasta, hasta: new Date(siguienteRaw.desde) }
    }
  } else if (siguiente) {
    if (nuevoHasta.getTime() > new Date(siguiente.hasta!).getTime()) {
      return NextResponse.json({ error: 'El rango se extiende más allá del vecino inmediato siguiente' }, { status: 400 })
    } else if (nuevoHasta.getTime() < new Date(siguiente.desde).getTime()) {
      efectoSiguiente = { tipo: 'hueco', desde: nuevoHasta, hasta: new Date(siguiente.desde) }
    } else if (nuevoHasta.getTime() === new Date(siguiente.hasta!).getTime()) {
      efectoSiguiente = { tipo: 'tapado' }
    } else if (nuevoHasta.getTime() > new Date(siguiente.desde).getTime()) {
      efectoSiguiente = { tipo: 'recorte', nuevoDesde: nuevoHasta }
    }
  } else if (!siguienteRaw && nuevoHasta.getTime() < limiteSuperior) {
    // Sin vecino siguiente real (el objetivo es el último tramo del incidente,
    // que además está cerrado — no hay tramo abierto): el límite virtual es
    // horaFin. Mismo criterio que con el límite inferior — se rellena el hueco.
    efectoSiguiente = { tipo: 'hueco', desde: nuevoHasta, hasta: new Date(limiteSuperior) }
  }

  // Regla 6c: si CUALQUIER lado requiere un tapado completo y ese vecino ya
  // tiene historial, se bloquea TODA la edición — nada se ejecuta.
  // RELLENO_INSERTADO es el registro de "nacimiento" del propio relleno — no
  // cuenta como historial previo para esta compuerta, si no ningún relleno
  // automático podría autolimpiarse nunca (regla 7), porque su propia creación
  // ya le habría dejado una fila.
  async function tieneHistorial(tid: string): Promise<boolean> {
    const filas = await db.select({ id: incidenteMitigacionTramosHistorial.id })
      .from(incidenteMitigacionTramosHistorial)
      .where(and(
        eq(incidenteMitigacionTramosHistorial.tramoId, tid),
        ne(incidenteMitigacionTramosHistorial.accion, 'RELLENO_INSERTADO'),
      ))
    return filas.length > 0
  }
  if (efectoAnterior.tipo === 'tapado' && anterior && await tieneHistorial(anterior.id)) {
    return NextResponse.json(
      { error: 'El tramo vecino ya tiene historial previo, no se puede eliminar automáticamente — ajústalo aparte primero' },
      { status: 409 },
    )
  }
  if (efectoSiguiente.tipo === 'tapado' && siguiente && await tieneHistorial(siguiente.id)) {
    return NextResponse.json(
      { error: 'El tramo vecino ya tiene historial previo, no se puede eliminar automáticamente — ajústalo aparte primero' },
      { status: 409 },
    )
  }

  const eventoId = crypto.randomUUID()
  const usuarioId = (session.user as any)?.id ?? null

  const resultado = await db.transaction(async (tx) => {
    const objetivoAntes = snapshot(objetivo)

    // Vecino anterior
    let vecinoAnteriorResultado: TramoRow | null = null
    let rellenoAnterior: TramoRow | null = null
    if (anterior && efectoAnterior.tipo === 'recorte') {
      const ieTramo = calcIeTramo({ tipo: anterior.tipo as any, factor: anterior.factor, desde: anterior.desde, hasta: efectoAnterior.nuevoHasta! }, tienda!)
      const antes = snapshot(anterior)
      const [upd] = await tx.update(incidenteMitigacionTramos)
        .set({ hasta: efectoAnterior.nuevoHasta!, ieTramo: String(ieTramo), actualizadoEn: ahora })
        .where(eq(incidenteMitigacionTramos.id, anterior.id)).returning()
      vecinoAnteriorResultado = upd
      await tx.insert(incidenteMitigacionTramosHistorial).values({
        eventoId, tramoId: anterior.id, incidenteId: id, usuarioId,
        accion: 'VECINO_RECORTADO', valorAnterior: antes, valorNuevo: snapshot(upd),
      })
    } else if (anterior && efectoAnterior.tipo === 'tapado') {
      const antes = snapshot(anterior)
      // El historial se inserta ANTES del DELETE: tramo_id es nullable con
      // ON DELETE SET NULL — el DELETE de abajo anula esta misma fila recién
      // insertada, pero insertar primero cumple la FK (el tramo todavía existe).
      await tx.insert(incidenteMitigacionTramosHistorial).values({
        eventoId, tramoId: anterior.id, incidenteId: id, usuarioId,
        accion: anterior.origen === 'RELLENO_AUTOMATICO' ? 'RELLENO_ELIMINADO' : 'VECINO_ELIMINADO',
        valorAnterior: antes, valorNuevo: null,
      })
      await tx.delete(incidenteMitigacionTramos).where(eq(incidenteMitigacionTramos.id, anterior.id))
    } else if (anterior && efectoAnterior.tipo === 'hueco') {
      const ieTramo = calcIeTramo({ tipo: 'SIN_MITIGACION', tipoIncidente: inc.tipo, desde: efectoAnterior.desde, hasta: efectoAnterior.hasta }, tienda!)
      const [creado] = await tx.insert(incidenteMitigacionTramos).values({
        incidenteId: id, tipo: 'SIN_MITIGACION', factor: String(factorBaseSinMitigacion(inc.tipo)),
        desde: efectoAnterior.desde, hasta: efectoAnterior.hasta, ieTramo: String(ieTramo), origen: 'RELLENO_AUTOMATICO',
      }).returning()
      rellenoAnterior = creado
      await tx.insert(incidenteMitigacionTramosHistorial).values({
        eventoId, tramoId: creado.id, incidenteId: id, usuarioId,
        accion: 'RELLENO_INSERTADO', valorAnterior: null, valorNuevo: snapshot(creado),
      })
    }

    // Vecino siguiente
    let vecinoSiguienteResultado: TramoRow | null = null
    let rellenoSiguiente: TramoRow | null = null
    if (siguiente && efectoSiguiente.tipo === 'recorte') {
      const ieTramo = calcIeTramo({ tipo: siguiente.tipo as any, factor: siguiente.factor, desde: efectoSiguiente.nuevoDesde!, hasta: siguiente.hasta! }, tienda!)
      const antes = snapshot(siguiente)
      const [upd] = await tx.update(incidenteMitigacionTramos)
        .set({ desde: efectoSiguiente.nuevoDesde!, ieTramo: String(ieTramo), actualizadoEn: ahora })
        .where(eq(incidenteMitigacionTramos.id, siguiente.id)).returning()
      vecinoSiguienteResultado = upd
      await tx.insert(incidenteMitigacionTramosHistorial).values({
        eventoId, tramoId: siguiente.id, incidenteId: id, usuarioId,
        accion: 'VECINO_RECORTADO', valorAnterior: antes, valorNuevo: snapshot(upd),
      })
    } else if (siguiente && efectoSiguiente.tipo === 'tapado') {
      const antes = snapshot(siguiente)
      await tx.insert(incidenteMitigacionTramosHistorial).values({
        eventoId, tramoId: siguiente.id, incidenteId: id, usuarioId,
        accion: siguiente.origen === 'RELLENO_AUTOMATICO' ? 'RELLENO_ELIMINADO' : 'VECINO_ELIMINADO',
        valorAnterior: antes, valorNuevo: null,
      })
      await tx.delete(incidenteMitigacionTramos).where(eq(incidenteMitigacionTramos.id, siguiente.id))
    } else if (efectoSiguiente.tipo === 'hueco') {
      const ieTramo = calcIeTramo({ tipo: 'SIN_MITIGACION', tipoIncidente: inc.tipo, desde: efectoSiguiente.desde, hasta: efectoSiguiente.hasta }, tienda!)
      const [creado] = await tx.insert(incidenteMitigacionTramos).values({
        incidenteId: id, tipo: 'SIN_MITIGACION', factor: String(factorBaseSinMitigacion(inc.tipo)),
        desde: efectoSiguiente.desde, hasta: efectoSiguiente.hasta, ieTramo: String(ieTramo), origen: 'RELLENO_AUTOMATICO',
      }).returning()
      rellenoSiguiente = creado
      await tx.insert(incidenteMitigacionTramosHistorial).values({
        eventoId, tramoId: creado.id, incidenteId: id, usuarioId,
        accion: 'RELLENO_INSERTADO', valorAnterior: null, valorNuevo: snapshot(creado),
      })
    }

    // El tramo objetivo — al final, con los timestamps ya definitivos.
    const ieObjetivo = calcIeTramo({ tipo: objetivo.tipo as any, factor: objetivo.factor, desde: nuevoDesde, hasta: nuevoHasta }, tienda!)
    const [objetivoActualizado] = await tx.update(incidenteMitigacionTramos)
      .set({ desde: nuevoDesde, hasta: nuevoHasta, ieTramo: String(ieObjetivo), actualizadoEn: ahora })
      .where(eq(incidenteMitigacionTramos.id, objetivo.id)).returning()
    await tx.insert(incidenteMitigacionTramosHistorial).values({
      eventoId, tramoId: objetivo.id, incidenteId: id, usuarioId,
      accion: 'EDITAR', valorAnterior: objetivoAntes, valorNuevo: snapshot(objetivoActualizado),
    })

    return {
      editado: objetivoActualizado,
      relleno: rellenoAnterior ?? rellenoSiguiente ?? null,
      vecinoAnterior: vecinoAnteriorResultado,
      vecinoSiguiente: vecinoSiguienteResultado,
    }
  })

  return NextResponse.json(resultado)
}
