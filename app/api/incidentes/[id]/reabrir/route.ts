import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, routersExternos, incidenteMitigacionTramos } from '@/drizzle/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { calcIeTramo, factorBaseSinMitigacion } from '@/lib/mitigacion-tramos'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.reabrir')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const motivo: 'TIENDA_SIN_INTERNET' | 'ERROR_AGENTE' = body.motivo ?? 'ERROR_AGENTE'
  const justificacion: string = body.justificacion?.trim() ?? ''

  // Leer el incidente para acumular MTTR e IEI antes de reiniciar el reloj
  const [inc] = await db.select({
    mttrMinutos:           incidentes.mttrMinutos,
    tiempoAcumuladoMin:    incidentes.tiempoAcumuladoMin,
    ieiAcumulado:          incidentes.ieiAcumulado,
    horaRegistro:          incidentes.horaRegistro,
    horaFin:               incidentes.horaFin,
    horaRegistroOriginal:  incidentes.horaRegistroOriginal,
    tiendaId:              incidentes.tiendaId,
    tipo:                  incidentes.tipo,
    contActivadoPor:       incidentes.contActivadoPor,
    contHoraActivacion:    incidentes.contHoraActivacion,
    contHoraDesactivacion: incidentes.contHoraDesactivacion,
    contRendimiento:       incidentes.contRendimiento,
    contObservacion:       incidentes.contObservacion,
    contEsExterno:         incidentes.contEsExterno,
    routerExternoId:       incidentes.routerExternoId,
    movActivadoPor:        incidentes.movActivadoPor,
    movHoraActivacion:     incidentes.movHoraActivacion,
    movHoraDesactivacion:  incidentes.movHoraDesactivacion,
    movRendimiento:        incidentes.movRendimiento,
    movObservacion:        incidentes.movObservacion,
    mitigacionesPrevias:   incidentes.mitigacionesPrevias,
    boletaManual:          incidentes.boletaManual,
    boletaRendimiento:     incidentes.boletaRendimiento,
    boletaHoraActivacion:  incidentes.boletaHoraActivacion,
  }).from(incidentes).where(eq(incidentes.id, id))

  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Tiempo acumulado = lo que ya estaba acumulado + MTTR de esta última resolución incorrecta
  // El tiempo que estuvo "cerrado" entre resolución y reapertura NO se suma (no es responsabilidad del proveedor)
  const tiempoAcumuladoMin = (inc.tiempoAcumuladoMin ?? 0) + (inc.mttrMinutos ?? 0)

  // IEI acumulado: calcular IEI del período que se está cerrando (horaRegistro → horaFin) y sumar al acumulado.
  // Cada período se calcula de forma independiente sobre sus propios timestamps de contingencia,
  // que se clipean automáticamente al rango del período por calcImpactoRow.
  let ieiAcumulado = Number(inc.ieiAcumulado ?? 0)
  try {
    const [tienda] = await db.select({
      ventaHoraSoles:    tiendas.ventaHoraSoles,
      ventaHoraFdsSoles: tiendas.ventaHoraFdsSoles,
      cluster:           tiendas.cluster,
    }).from(tiendas).where(eq(tiendas.id, inc.tiendaId!))

    const { calcImpactoRow } = await import('@/lib/impacto-calc')
    const ieiPeriodo = calcImpactoRow({
      hora_registro:           inc.horaRegistro,
      hora_fin:                inc.horaFin,
      estado:                  'RESUELTO',
      tipo:                    inc.tipo,
      venta_hora_soles:        tienda?.ventaHoraSoles,
      venta_hora_fds_soles:    tienda?.ventaHoraFdsSoles,
      cluster:                 tienda?.cluster,
      cont_hora_activacion:    inc.contActivadoPor ? inc.contHoraActivacion : null,
      cont_hora_desactivacion: inc.contHoraDesactivacion,
      cont_rendimiento:        inc.contRendimiento,
      cont_es_externo:         inc.contEsExterno,
      // Mismo gate que cont — bug real confirmado en producción: un timestamp
      // fantasma en mov_hora_activacion (sin mov_activado_por) se contaba como
      // datos móviles activo, quedando congelado para siempre en iei_acumulado.
      mov_hora_activacion:     inc.movActivadoPor ? inc.movHoraActivacion : null,
      mov_hora_desactivacion:  inc.movHoraDesactivacion,
      mov_rendimiento:         inc.movRendimiento,
      boleta_manual:           inc.boletaManual,
      boleta_rendimiento:      inc.boletaRendimiento,
      boleta_hora_activacion:  inc.boletaHoraActivacion,
    })
    ieiAcumulado += ieiPeriodo.impactoEconomicoEstimado ?? 0
  } catch { /* si falla el cálculo, se acumula 0 para este período */ }

  // Preservar hora de inicio original (solo en la primera reapertura; en subsiguientes ya está guardada)
  const horaRegistroOriginal = inc.horaRegistroOriginal ?? inc.horaRegistro
  // Preservar el horaFin del cierre anterior para mostrarlo en el detalle
  const horaFinAnterior = inc.horaFin

  // ── Archivar la mitigación viva antes de liberar el slot ──────────────────
  // Al reabrir, el slot cont_*/mov_* se limpia para poder activar una mitigación
  // nueva (decisión de producto). El periodo que se autoselló al cerrar se conserva
  // en mitigaciones_previas: así no se pierde el detalle ni los minutos que ya
  // suman en las estadísticas de la tienda. El impacto económico de este periodo
  // ya quedó sumado en ieiAcumulado arriba.
  const mitigacionesPrevias: any[] = Array.isArray(inc.mitigacionesPrevias) ? [...inc.mitigacionesPrevias] : []
  if (inc.contActivadoPor) {
    // Si fue router externo, guardar también CUÁL router se usó (id + código)
    // para no perder esa identidad al liberar el slot.
    let routerExternoCodigo: string | null = null
    if (inc.contEsExterno && inc.routerExternoId) {
      const [r] = await db.select({ codigo: routersExternos.codigo })
        .from(routersExternos).where(eq(routersExternos.id, inc.routerExternoId))
      routerExternoCodigo = r?.codigo ?? null
    }
    mitigacionesPrevias.push({
      clase:               inc.contEsExterno ? 'ROUTER_EXTERNO' : 'ROUTER_PROPIO',
      activadoPor:         inc.contActivadoPor,
      horaActivacion:      inc.contHoraActivacion,
      horaDesactivacion:   inc.contHoraDesactivacion ?? horaFinAnterior,
      rendimiento:         inc.contRendimiento ?? null,
      observacion:         inc.contObservacion ?? null,
      routerExternoId:     inc.contEsExterno ? inc.routerExternoId ?? null : null,
      routerExternoCodigo: routerExternoCodigo,
      cerradoEn:           horaFinAnterior,
    })
  }
  if (inc.movActivadoPor) {
    mitigacionesPrevias.push({
      clase:             'DATOS_MOVILES',
      activadoPor:       inc.movActivadoPor,
      horaActivacion:    inc.movHoraActivacion,
      horaDesactivacion: inc.movHoraDesactivacion ?? horaFinAnterior,
      rendimiento:       inc.movRendimiento ?? null,
      observacion:       inc.movObservacion ?? null,
      cerradoEn:         horaFinAnterior,
    })
  }

  const horaLima = new Date().toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const motivoLabel = motivo === 'TIENDA_SIN_INTERNET'
    ? 'Tienda nuevamente sin internet'
    : 'Error de gestión de agente'

  const reabiertaInfo = justificacion
    ? `Reabierto el ${horaLima} · ${motivoLabel} — ${justificacion}`
    : `Reabierto el ${horaLima} · ${motivoLabel}`

  // Fase 2 (Paso 4) — modelo nuevo de tramos, en paralelo a todo lo de arriba
  // (modelo viejo: horaRegistro, tiempoAcumuladoMin, ieiAcumulado, mitigacionesPrevias
  // y el slot cont_*/mov_*, todos sin tocar — el PUT viejo los sigue necesitando).
  const ahoraTramos = new Date()
  const [tramoAbierto] = await db.select().from(incidenteMitigacionTramos)
    .where(and(eq(incidenteMitigacionTramos.incidenteId, id), isNull(incidenteMitigacionTramos.hasta)))
  let tiendaVenta: { ventaHoraSoles: string | null; ventaHoraFdsSoles: string | null } | undefined
  if (tramoAbierto) {
    [tiendaVenta] = await db.select({ ventaHoraSoles: tiendas.ventaHoraSoles, ventaHoraFdsSoles: tiendas.ventaHoraFdsSoles })
      .from(tiendas).where(eq(tiendas.id, inc.tiendaId!))
  }

  const updated = await db.transaction(async (tx) => {
    const [upd] = await tx.update(incidentes)
      .set({
        estado: 'ABIERTO',
        horaFin: null,
        mttrMinutos: null,
        horaRegistro: new Date(),        // reinicia el cronómetro desde ahora (base para MTTR parcial)
        tiempoAcumuladoMin,              // preserva el tiempo activo anterior (se sumará al resolver)
        ieiAcumulado: String(ieiAcumulado), // IEI acumulado de todos los períodos cerrados anteriores
        motivoReabertura: motivo,
        justificacionReabertura: justificacion || null,
        reabiertaInfo,
        horaRegistroOriginal,            // hora de inicio real del incidente (nunca se pisa)
        horaFinAnterior,                 // hora de cierre anterior (para mostrar en detalle)
        // Archivar el periodo de mitigación anterior y liberar el slot vivo para
        // que se pueda activar cualquier mitigación nuevamente tras reabrir.
        mitigacionesPrevias: mitigacionesPrevias.length ? mitigacionesPrevias : null,
        estadoOperacion:       null,
        operacionManual:       false,
        tipoOperacionManual:   null,
        factorOperativo:       null,
        // Corte final: cont_*, mov_* y boleta_* ya no se resetean. Nadie los
        // escribe, así que no hay slot vivo que liberar; los valores del período
        // anterior quedan como dato histórico y ya fueron archivados arriba en
        // mitigacionesPrevias. El slot que sí importa liberar es el tramo, y de
        // eso se ocupa el bloque de tramos de abajo.
        routerExternoId:       null,
        actualizadoEn: new Date(),
      })
      .where(eq(incidentes.id, id))
      .returning()

    // Defensivo: no debería haber un tramo abierto (resolver/cancelar ya lo
    // sellaron), pero si lo hay, se sella acá antes de abrir el nuevo.
    if (tramoAbierto) {
      const ieTramo = calcIeTramo(
        { tipo: tramoAbierto.tipo as any, factor: tramoAbierto.factor, desde: tramoAbierto.desde, hasta: ahoraTramos, tipoIncidente: inc.tipo },
        tiendaVenta!, ahoraTramos,
      )
      await tx.update(incidenteMitigacionTramos)
        .set({ hasta: ahoraTramos, ieTramo: String(ieTramo), actualizadoEn: ahoraTramos })
        .where(eq(incidenteMitigacionTramos.id, tramoAbierto.id))
    }

    // Reemplaza por completo a mitigacionesPrevias para el modelo nuevo: el
    // tramo viejo (el que se acaba de sellar arriba, si había uno) simplemente
    // sigue existiendo en la tabla — no se copia a ningún jsonb. El hueco entre
    // el cierre anterior y este "desde" queda sin cubrir a propósito.
    await tx.insert(incidenteMitigacionTramos).values({
      incidenteId: id,
      tipo: 'SIN_MITIGACION',
      factor: String(factorBaseSinMitigacion(inc.tipo)),
      desde: ahoraTramos,
      hasta: null,
    })

    return upd
  })

  if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(updated)
}
