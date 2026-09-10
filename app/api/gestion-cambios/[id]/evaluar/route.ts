import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accionesGestion, accionesGestionTiendas, tiendas } from '@/drizzle/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { SLA_RESOLUCION_DEFAULT_MIN } from '@/lib/sla-core'
import { getTramosPorIncidentes, calcIeiIncidente, type IncidenteMitigacionInput } from '@/lib/mitigacion-tramos'

// Calcula métricas de un período para una o varias tiendas
// Exportada solo para poder probarla en test. Fase 5, Paso 4: calcIeiIncidente
// (tramos + fallback legacy) reemplaza a calcImpactoRow — es el consumidor más
// sensible de toda la iniciativa (el resultado se graba PERMANENTE en
// acciones_gestion, nunca se recalcula), así que la mecánica de "foto fija"
// no cambia en absoluto, solo la fuente del número.
//
// `estado: 'RESUELTO'` sigue hardcodeado (no `r.estado`) al armar el input de
// calcIeiIncidente — igual que ya hacía este archivo con calcImpactoRow. El
// WHERE incluye RESUELTO y CERRADO; sin este hardcodeo, calcIeiIncidente
// trataría un CERRADO como "todavía abierto" y usaría el instante actual como
// límite del cálculo en vez de hora_fin — un resultado mucho peor que el 0
// que daba antes en el caso análogo de snap/route.ts (ver ese archivo).
export async function calcMetrics(tiendaIds: string[], desde: Date, hasta: Date) {
  // Build tienda filter without ANY() cast to avoid driver encoding issues
  const tiendaFilter = tiendaIds.length === 1
    ? sql`i.tienda_id = ${tiendaIds[0]}`
    : sql`i.tienda_id::text IN (${sql.join(tiendaIds.map(id => sql`${id}`), sql`, `)})`

  const rows = await db.execute(sql`
    SELECT
      i.id,
      i.tipo,
      i.hora_registro,
      i.hora_fin,
      i.mttr_minutos,
      i.boleta_manual,
      i.boleta_rendimiento,
      i.boleta_hora_activacion,
      i.cont_activado_por,
      i.cont_hora_activacion,
      i.cont_hora_desactivacion,
      i.cont_rendimiento,
      i.cont_es_externo,
      i.mov_activado_por,
      i.mov_hora_activacion,
      i.mov_hora_desactivacion,
      i.mov_rendimiento,
      t.venta_hora_soles,
      t.venta_hora_fds_soles,
      t.cluster,
      cp.sla_resol_override,
      CASE
        WHEN i.hora_fin IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (i.hora_fin - i.hora_registro)) / 60)::int
        ELSE NULL
      END AS duracion_min
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    LEFT JOIN LATERAL (
      SELECT tiempo_resolucion_sla AS sla_resol_override
      FROM fichas
      WHERE id = COALESCE(i.ficha_id, t.ficha_activa_id)
      LIMIT 1
    ) cp ON true
    WHERE ${tiendaFilter}
      AND i.hora_registro >= ${desde.toISOString()}::timestamptz
      AND i.hora_registro <  ${hasta.toISOString()}::timestamptz
      AND i.estado IN ('RESUELTO','CERRADO')
  `) as any[]

  const tramosPorIncidente = await getTramosPorIncidentes(rows.map((r: any) => r.id))

  let totalIncidentes = rows.length
  let slaVencidoCount = 0
  let mttrSum         = 0
  let mttrCount       = 0
  let ieiSum          = 0
  let penalidadSum    = 0
  let conTramos       = 0
  let sinTramos       = 0

  for (const r of rows) {
    const slaResolucion = Number(r.sla_resol_override ?? SLA_RESOLUCION_DEFAULT_MIN)
    const duracion      = Number(r.duracion_min ?? 0)
    const slaVencido    = duracion > slaResolucion

    const tramos = tramosPorIncidente.get(r.id) ?? []
    if (tramos.length > 0) conTramos++; else sinTramos++

    const incidenteMitigacion: IncidenteMitigacionInput = {
      tipo: r.tipo, estado: 'RESUELTO', horaRegistro: r.hora_registro, horaFin: r.hora_fin,
      contActivadoPor: r.cont_activado_por, contHoraActivacion: r.cont_hora_activacion,
      contHoraDesactivacion: r.cont_hora_desactivacion, contRendimiento: r.cont_rendimiento, contEsExterno: r.cont_es_externo,
      movActivadoPor: r.mov_activado_por, movHoraActivacion: r.mov_hora_activacion,
      movHoraDesactivacion: r.mov_hora_desactivacion, movRendimiento: r.mov_rendimiento,
      boletaManual: r.boleta_manual, boletaRendimiento: r.boleta_rendimiento, boletaHoraActivacion: r.boleta_hora_activacion,
    }
    const ventaTienda = { ventaHoraSoles: r.venta_hora_soles, ventaHoraFdsSoles: r.venta_hora_fds_soles, cluster: r.cluster }

    if (slaVencido) {
      slaVencidoCount++
      try {
        penalidadSum += calcIeiIncidente(incidenteMitigacion, tramos, ventaTienda).iei
      } catch { /* skip */ }
    }

    if (r.mttr_minutos != null) { mttrSum += Number(r.mttr_minutos); mttrCount++ }

    try {
      ieiSum += calcIeiIncidente(incidenteMitigacion, tramos, ventaTienda).iei
    } catch { /* skip */ }
  }

  const slaCumplidoPct = totalIncidentes > 0
    ? Math.round(((totalIncidentes - slaVencidoCount) / totalIncidentes) * 100)
    : 100
  const mttrPromedio = mttrCount > 0 ? Math.round(mttrSum / mttrCount) : null
  const metodo: 'TRAMOS' | 'LEGACY' | 'MIXTO' | null =
    totalIncidentes === 0 ? null
    : conTramos > 0 && sinTramos > 0 ? 'MIXTO'
    : conTramos > 0 ? 'TRAMOS'
    : 'LEGACY'

  return {
    totalIncidentes,
    incidentesSlaVencido: slaVencidoCount,
    slaRespuestaPct:      slaCumplidoPct,
    mttrMin:              mttrPromedio,
    ieiAcumulado:         Math.round(ieiSum * 100) / 100,
    penalidadEstimada:    Math.round(penalidadSum * 100) / 100,
    metodo,
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear') && !can(session, 'gestion-cambios.aprobar'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  try {
  const body = await req.json().catch(() => ({}))
  const periodo: 30 | 90 = body.periodo === 90 ? 90 : 30
  const nota: string     = body.nota?.trim() ?? ''

  const [accion] = await db.select({
    id:          accionesGestion.id,
    estado:      accionesGestion.estado,
    alcance:     accionesGestion.alcance,
    tiendaId:    accionesGestion.tiendaId,
    ejecutadoEn: accionesGestion.ejecutadoEn,
    eval30Completada: accionesGestion.eval30Completada,
    eval90Completada: accionesGestion.eval90Completada,
  }).from(accionesGestion).where(eq(accionesGestion.id, id))

  if (!accion) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (accion.estado !== 'COMPLETADO')
    return NextResponse.json({ error: 'La acción debe estar COMPLETADA para evaluarse' }, { status: 409 })
  if (!accion.ejecutadoEn)
    return NextResponse.json({ error: 'Falta fecha de ejecución' }, { status: 400 })
  if (periodo === 30 && accion.eval30Completada)
    return NextResponse.json({ error: 'La evaluación de 30 días ya fue completada' }, { status: 409 })
  if (periodo === 90 && accion.eval90Completada)
    return NextResponse.json({ error: 'La evaluación de 90 días ya fue completada' }, { status: 409 })

  // Tiendas en scope
  let tiendaIds: string[] = []
  if (accion.alcance === 'TIENDA' && accion.tiendaId) {
    tiendaIds = [accion.tiendaId]
  } else {
    const rows = await db.select({ tiendaId: accionesGestionTiendas.tiendaId })
      .from(accionesGestionTiendas).where(eq(accionesGestionTiendas.accionId, id))
    tiendaIds = rows.map(r => r.tiendaId)
  }
  if (!tiendaIds.length)
    return NextResponse.json({ error: 'Sin tiendas en scope' }, { status: 400 })

  // Una tienda puede haberse dado de baja después de ejecutar la acción: evaluar
  // su desempeño a 30/90 días ya no corresponde, los KPIs del período serían de
  // una tienda que dejó de operar en el medio.
  const archivadas = await db.select({ codigo: tiendas.codigo })
    .from(tiendas)
    .where(and(inArray(tiendas.id, tiendaIds), eq(tiendas.estado, 'ARCHIVADA')))
  if (archivadas.length)
    return NextResponse.json(
      { error: `Tienda archivada (${archivadas.map(t => t.codigo).join(', ')}), no corresponde evaluarla.` },
      { status: 409 },
    )

  const ejecutadoEn = new Date(accion.ejecutadoEn)
  const hasta       = new Date(ejecutadoEn)
  hasta.setDate(hasta.getDate() + periodo)

  const metrics = await calcMetrics(tiendaIds, ejecutadoEn, hasta)
  const ahora   = new Date()

  // La evaluación solo guarda métricas; NO cambia el estado (la acción ya está COMPLETADA).
  const patch: Record<string, any> = {
    actualizadoEn: ahora,
  }

  if (periodo === 30) {
    patch.eval30Completada  = true
    patch.eval30Fecha       = ahora
    patch.eval30SlaPct      = metrics.slaRespuestaPct
    patch.eval30MttrMin     = metrics.mttrMin
    patch.eval30Iei         = metrics.ieiAcumulado
    patch.eval30Nincidentes = metrics.totalIncidentes
    patch.eval30Detalle     = metrics
    patch.eval30Nota        = nota || null
    patch.eval30Metodo      = metrics.metodo
    patch.penalidadEstimada = metrics.penalidadEstimada
  } else {
    patch.eval90Completada  = true
    patch.eval90Fecha       = ahora
    patch.eval90SlaPct      = metrics.slaRespuestaPct
    patch.eval90MttrMin     = metrics.mttrMin
    patch.eval90Iei         = metrics.ieiAcumulado
    patch.eval90Nincidentes = metrics.totalIncidentes
    patch.eval90Detalle     = metrics
    patch.eval90Nota        = nota || null
    patch.eval90Metodo      = metrics.metodo
    patch.penalidadEstimada = metrics.penalidadEstimada
  }

  const [updated] = await db.update(accionesGestion)
    .set(patch)
    .where(eq(accionesGestion.id, id))
    .returning()

  return NextResponse.json({ ...updated, metricsCalculadas: metrics })
  } catch (err: any) {
    console.error('[evaluar] error:', err)
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 })
  }
}
