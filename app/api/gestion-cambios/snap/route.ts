import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, proveedores, fichas } from '@/drizzle/schema'
import { and, eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { SLA_RESOLUCION_DEFAULT_MIN } from '@/lib/sla-core'
import { getTramosPorIncidentes, calcIeiIncidente, type IncidenteMitigacionInput } from '@/lib/mitigacion-tramos'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const tiendaId = searchParams.get('tiendaId')
  const dias     = Math.max(7, Math.min(365, parseInt(searchParams.get('dias') ?? '90')))

  if (!tiendaId) return NextResponse.json({ error: 'tiendaId requerido' }, { status: 400 })

  try {
    const hasta = new Date()
    const desde = new Date(hasta); desde.setDate(desde.getDate() - dias)

    // Datos de la tienda y su proveedor actual
    const [tiendaData] = await db.select({
      codigo:          tiendas.codigo,
      nombreCc:        tiendas.nombreCc,
      distrito:        tiendas.distrito,
      cluster:         tiendas.cluster,
      estado:          tiendas.estado,
      proveedorId:     tiendas.proveedorId,
      proveedorNombre: proveedores.nombre,
      ventaHoraSoles:    tiendas.ventaHoraSoles,
      ventaHoraFdsSoles: tiendas.ventaHoraFdsSoles,
    })
      .from(tiendas)
      .leftJoin(proveedores, eq(tiendas.proveedorId, proveedores.id))
      .where(eq(tiendas.id, tiendaId))

    if (!tiendaData) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

    // Una tienda dada de baja ya no se evalúa: el snapshot alimenta decisiones
    // sobre su proveedor (renovar, cambiar, dar de baja el contrato) y ninguna
    // de esas corresponde sobre una tienda que ya no opera.
    if (tiendaData.estado === 'ARCHIVADA')
      return NextResponse.json({ error: 'La tienda está archivada, no corresponde evaluarla.' }, { status: 409 })

    // SLA de la ficha activa de la tienda
    let contratoSlaRespuestaMin: number | null = null
    let contratoSlaResolucionMin: number | null = null
    let contratoPlan: string | null = null
    const [fichaActiva] = await db.select({
      tiempoRespuestaSla:  fichas.tiempoRespuestaSla,
      tiempoResolucionSla: fichas.tiempoResolucionSla,
      plan:                fichas.plan,
    })
      .from(fichas)
      .where(and(eq(fichas.tiendaId, tiendaId), eq(fichas.estado, 'ACTIVA')))
      .limit(1)
    contratoSlaRespuestaMin  = fichaActiva?.tiempoRespuestaSla  ?? null
    contratoSlaResolucionMin = fichaActiva?.tiempoResolucionSla ?? null
    contratoPlan             = fichaActiva?.plan                ?? null

    // Incidentes del período
    const rows = await db.execute(sql`
      SELECT
        i.id,
        i.tipo,
        i.hora_registro,
        i.hora_fin,
        i.mttr_minutos,
        i.estado,
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
        FROM   fichas
        WHERE  id = COALESCE(i.ficha_id, t.ficha_activa_id)
        LIMIT  1
      ) cp ON true
      WHERE i.tienda_id = ${tiendaId}
        AND i.hora_registro >= ${desde.toISOString()}::timestamptz
        AND i.hora_registro <  ${hasta.toISOString()}::timestamptz
        AND i.estado IN ('RESUELTO','CERRADO')
    `) as any[]

    const tramosPorIncidente = await getTramosPorIncidentes((rows as any[]).map(r => r.id))

    let totalIncidentes   = rows.length
    let slaVencidoCount   = 0
    let mttrSum           = 0
    let mttrCount         = 0
    let ieiSum            = 0
    let penalidadSum      = 0
    let conTramos         = 0
    let sinTramos         = 0

    for (const r of rows) {
      const slaResolucion = Number(r.sla_resol_override ?? SLA_RESOLUCION_DEFAULT_MIN)
      const duracion      = Number(r.duracion_min ?? 0)
      const slaVencido    = duracion > slaResolucion
      if (slaVencido) slaVencidoCount++
      if (r.mttr_minutos != null) { mttrSum += Number(r.mttr_minutos); mttrCount++ }

      const tramos = tramosPorIncidente.get(r.id) ?? []
      if (tramos.length > 0) conTramos++; else sinTramos++

      // estado: 'RESUELTO' fijo (fix autorizado) — antes este archivo pasaba
      // r.estado real, así que un incidente CERRADO (incluido en el WHERE)
      // daba 0 en silencio con calcImpactoRow. Con calcIeiIncidente eso
      // hubiera sido peor (usaría "ahora" como límite en vez de hora_fin) si
      // no se corrige acá — mismo hardcodeo que ya usa evaluar/route.ts.
      try {
        const incidenteMitigacion: IncidenteMitigacionInput = {
          tipo: r.tipo, estado: 'RESUELTO', horaRegistro: r.hora_registro, horaFin: r.hora_fin,
          contActivadoPor: r.cont_activado_por, contHoraActivacion: r.cont_hora_activacion,
          contHoraDesactivacion: r.cont_hora_desactivacion, contRendimiento: r.cont_rendimiento, contEsExterno: r.cont_es_externo,
          movActivadoPor: r.mov_activado_por, movHoraActivacion: r.mov_hora_activacion,
          movHoraDesactivacion: r.mov_hora_desactivacion, movRendimiento: r.mov_rendimiento,
          boletaManual: r.boleta_manual, boletaRendimiento: r.boleta_rendimiento, boletaHoraActivacion: r.boleta_hora_activacion,
        }
        const { iei } = calcIeiIncidente(incidenteMitigacion, tramos, {
          ventaHoraSoles: r.venta_hora_soles, ventaHoraFdsSoles: r.venta_hora_fds_soles, cluster: r.cluster,
        })
        ieiSum += iei
        if (slaVencido) penalidadSum += iei
      } catch { /* skip si no hay datos suficientes */ }
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

    return NextResponse.json({
      // Contexto de la tienda y proveedor
      tiendaCodigo:             tiendaData.codigo,
      tiendaNombre:             tiendaData.nombreCc,
      tiendaDistrito:           tiendaData.distrito,
      proveedorId:              tiendaData.proveedorId,
      proveedorNombre:          tiendaData.proveedorNombre,
      contratoPlan,
      contratoSlaRespuestaMin,
      contratoSlaResolucionMin,
      // Período evaluado
      periodoEvaluado:          `Últimos ${dias} días`,
      fechaDesde:               desde.toISOString().slice(0, 10),
      fechaHasta:               hasta.toISOString().slice(0, 10),
      // Métricas del período
      totalIncidentes,
      incidentesSlaVencido:     slaVencidoCount,
      slaRespuestaPct:          slaCumplidoPct,
      mttrMin:                  mttrPromedio,
      ieiAcumulado:             Math.round(ieiSum * 100) / 100,
      penalidadEstimada:        Math.round(penalidadSum * 100) / 100,
      metodo,
    })
  } catch (err: any) {
    console.error('[gestion-cambios/snap]', err)
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 })
  }
}
