import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accionesGestion, accionesGestionTiendas } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { getSlaLimitePorTipo } from '@/lib/sla-core'
import { calcImpactoRow } from '@/lib/impacto-calc'

// Calcula métricas de un período para una o varias tiendas
async function calcMetrics(tiendaIds: string[], desde: Date, hasta: Date) {
  const rows = await db.execute(sql`
    SELECT
      i.tipo,
      i.hora_registro,
      i.hora_fin,
      i.mttr_minutos,
      i.proveedor_id,
      i.boleta_manual,
      i.boleta_rendimiento,
      i.boleta_hora_activacion,
      i.cont_activado_por,
      i.cont_hora_activacion,
      i.cont_hora_desactivacion,
      i.cont_rendimiento,
      i.cont_es_externo,
      i.mov_hora_activacion,
      i.mov_hora_desactivacion,
      i.mov_rendimiento,
      t.venta_hora_soles,
      t.venta_hora_fds_soles,
      t.cluster,
      COALESCE(pi.nombre, pt.nombre) AS proveedor_nombre,
      CASE
        WHEN i.hora_fin IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (i.hora_fin - i.hora_registro)) / 60)::int
        ELSE NULL
      END AS duracion_min
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    LEFT JOIN proveedores pi ON i.proveedor_id = pi.id
    LEFT JOIN proveedores pt ON t.proveedor_id = pt.id
    WHERE i.tienda_id = ANY(${tiendaIds}::uuid[])
      AND i.hora_registro >= ${desde.toISOString()}::timestamptz
      AND i.hora_registro <  ${hasta.toISOString()}::timestamptz
      AND i.estado IN ('RESUELTO','CERRADO')
  `) as any[]

  let totalIncidentes    = rows.length
  let slaVencidoCount    = 0
  let mttrSum            = 0
  let mttrCount          = 0
  let ieiSum             = 0
  let penalidadSum       = 0

  for (const r of rows) {
    const slaLimite = getSlaLimitePorTipo(r.tipo)
    const duracion  = Number(r.duracion_min ?? 0)
    const slaVencido = duracion > slaLimite
    if (slaVencido) {
      slaVencidoCount++
      // IEI del incidente para penalidad
      try {
        // calcImpactoRow imported statically at top
        const iei = calcImpactoRow({
          hora_registro:           r.hora_registro,
          hora_fin:                r.hora_fin,
          estado:                  'RESUELTO',
          tipo:                    r.tipo,
          venta_hora_soles:        r.venta_hora_soles,
          venta_hora_fds_soles:    r.venta_hora_fds_soles,
          cluster:                 r.cluster,
          cont_hora_activacion:    r.cont_activado_por ? r.cont_hora_activacion : null,
          cont_hora_desactivacion: r.cont_hora_desactivacion,
          cont_rendimiento:        r.cont_rendimiento,
          cont_es_externo:         r.cont_es_externo,
          mov_hora_activacion:     r.mov_hora_activacion,
          mov_hora_desactivacion:  r.mov_hora_desactivacion,
          mov_rendimiento:         r.mov_rendimiento,
          boleta_manual:            r.boleta_manual,
          boleta_rendimiento:       r.boleta_rendimiento,
          boleta_hora_activacion:   r.boleta_hora_activacion,
        }).impactoEstimado
        penalidadSum += iei
      } catch { /* skip */ }
    }
    if (r.mttr_minutos != null) { mttrSum += Number(r.mttr_minutos); mttrCount++ }

    // IEI total del período
    try {
      const { calcImpactoRow } = await import('@/lib/impacto-calc')
      ieiSum += calcImpactoRow({
        hora_registro:           r.hora_registro,
        hora_fin:                r.hora_fin,
        estado:                  'RESUELTO',
        tipo:                    r.tipo,
        venta_hora_soles:        r.venta_hora_soles,
        venta_hora_fds_soles:    r.venta_hora_fds_soles,
        cluster:                 r.cluster,
        cont_hora_activacion:    r.cont_activado_por ? r.cont_hora_activacion : null,
        cont_hora_desactivacion: r.cont_hora_desactivacion,
        cont_rendimiento:        r.cont_rendimiento,
        cont_es_externo:         r.cont_es_externo,
        mov_hora_activacion:     r.mov_hora_activacion,
        mov_hora_desactivacion:  r.mov_hora_desactivacion,
        mov_rendimiento:         r.mov_rendimiento,
        boleta_manual:            r.boleta_manual,
        boleta_rendimiento:       r.boleta_rendimiento,
        boleta_hora_activacion:   r.boleta_hora_activacion,
      }).impactoEstimado
    } catch { /* skip */ }
  }

  const slaCumplidoPct = totalIncidentes > 0
    ? Math.round(((totalIncidentes - slaVencidoCount) / totalIncidentes) * 100)
    : 100
  const mttrPromedio = mttrCount > 0 ? Math.round(mttrSum / mttrCount) : null

  return {
    totalIncidentes,
    incidentesSlaVencido: slaVencidoCount,
    slaRespuestaPct:      slaCumplidoPct,
    mttrMin:              mttrPromedio,
    ieiAcumulado:         Math.round(ieiSum * 100) / 100,
    penalidadEstimada:    Math.round(penalidadSum * 100) / 100,
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

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
  if (!['EJECUTADO', 'EN_EVALUACION'].includes(accion.estado))
    return NextResponse.json({ error: 'La acción debe estar EJECUTADA para evaluarse' }, { status: 409 })
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

  const ejecutadoEn = new Date(accion.ejecutadoEn)
  const hasta       = new Date(ejecutadoEn)
  hasta.setDate(hasta.getDate() + periodo)

  const metrics = await calcMetrics(tiendaIds, ejecutadoEn, hasta)
  const ahora   = new Date()

  const patch: Record<string, any> = {
    estado:        'EN_EVALUACION',
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
    patch.penalidadEstimada = metrics.penalidadEstimada
    // Al completar la evaluación de 90d → pasar a COMPLETADO
    if (accion.eval30Completada) patch.estado = 'COMPLETADO'
  }

  const [updated] = await db.update(accionesGestion)
    .set(patch)
    .where(eq(accionesGestion.id, id))
    .returning()

  return NextResponse.json({ ...updated, metricsCalculadas: metrics })
}
