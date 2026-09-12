import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, proveedores, incidentes, fichas } from '@/drizzle/schema'
import { eq, gte, sql, and, isNotNull, desc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { logUnlessSchemaMissing } from '@/lib/db-errors'
import { slaProveedorJoins, slaRespuestaPctExpr, slaResolucionPctExpr } from '@/lib/sla-sql'

function fmtMttr(mins: number | null): string {
  if (!mins) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; tiendaId: string }> }) {
  const { id, tiendaId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'proveedores.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  // Base tienda info
  const [tiendaBase] = await db.select({
    id:                tiendas.id,
    codigo:            tiendas.codigo,
    nombreCc:          tiendas.nombreCc,
    referencia:        tiendas.referencia,
    formato:           tiendas.formato,
    direccion:         tiendas.direccion,
    distrito:          tiendas.distrito,
    provincia:         tiendas.provincia,
    tieneContingencia: tiendas.tieneContingencia,
    contingenciaActiva: tiendas.contingenciaActiva,
    ventaHoraSoles:    tiendas.ventaHoraSoles,
    cluster:           tiendas.cluster,
    proveedorId:       tiendas.proveedorId,
    proveedorNombre:   proveedores.nombre,
    supervisorNombre:  tiendas.supervisorNombre,
    supervisorCelular: tiendas.supervisorCelular,
    contactoSoporte:   tiendas.contactoSoporte,
    gabinete:          tiendas.gabinete,
    observacion:       tiendas.observacion,
  }).from(tiendas)
    .leftJoin(proveedores, eq(tiendas.proveedorId, proveedores.id))
    .where(eq(tiendas.id, tiendaId))

  if (!tiendaBase) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const tienda = { ...tiendaBase }

  const thirtyDaysAgo    = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

  // Ficha activa de esta tienda con este proveedor
  let contrato: any = null
  try {
    const [c] = await db.select().from(fichas)
      .where(and(eq(fichas.proveedorId, id), eq(fichas.tiendaId, tiendaId), eq(fichas.estado, 'ACTIVA')))
      .orderBy(desc(fichas.activadoEn))
      .limit(1)
    contrato = c ?? null
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]/tienda/[tiendaId]', e) }

  // Métricas históricas — solo incidentes explícitamente atribuidos a este proveedor
  const incStrictWhere = and(eq(incidentes.tiendaId, tiendaId), eq(incidentes.proveedorId, id))
  let historicData = { total: 0, mttrAvg: null as number | null, mttrTotal: 0 }
  try {
    const [r] = await db.select({
      total:     sql<number>`count(*)::int`,
      mttrAvg:   sql<number>`round(avg(${incidentes.mttrMinutos}))::int`,
      mttrTotal: sql<number>`coalesce(sum(${incidentes.mttrMinutos}), 0)::int`,
    }).from(incidentes).where(incStrictWhere)
    if (r) historicData = { total: r.total, mttrAvg: r.mttrAvg, mttrTotal: r.mttrTotal }
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]/tienda/[tiendaId]', e) }

  // Incidentes 30d
  let inc30d = 0
  try {
    const [r] = await db.select({ total: sql<number>`count(*)::int` })
      .from(incidentes)
      .where(and(
        eq(incidentes.tiendaId, tiendaId),
        eq(incidentes.proveedorId, id),
        gte(incidentes.horaRegistro, thirtyDaysAgo),
      ))
    if (r) inc30d = r.total
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]/tienda/[tiendaId]', e) }

  // SLA Respuesta + Resolución para esta tienda con este proveedor (últimos 30d)
  // Ficha-aware vía lib/sla-sql.ts — mismo criterio que Lista y Detalle.
  let slaTienda:          number | null = null
  let slaRespuestaTienda:  number | null = null
  let slaResolucionTienda: number | null = null
  try {
    const slaRows = await db.execute(sql`
      SELECT
        ${sql.raw(slaRespuestaPctExpr())}  AS sla_respuesta_pct,
        ${sql.raw(slaResolucionPctExpr())} AS sla_resolucion_pct
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      ${sql.raw(slaProveedorJoins())}
      WHERE i.tienda_id    = ${tiendaId}
        AND i.proveedor_id = ${id}
        AND i.hora_registro >= ${thirtyDaysAgoStr}::timestamptz
    `)
    const sr = (slaRows as any[])[0]
    slaRespuestaTienda  = sr?.sla_respuesta_pct  != null ? Number(sr.sla_respuesta_pct)  : null
    slaResolucionTienda = sr?.sla_resolucion_pct != null ? Number(sr.sla_resolucion_pct) : null
    slaTienda           = slaRespuestaTienda
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]/tienda/[tiendaId]', e) }

  // Último incidente + historial
  const incWhere = incStrictWhere
  const incSel   = {
    id: incidentes.id, codigo: incidentes.codigo, tipo: incidentes.tipo,
    estado: incidentes.estado, horaRegistro: incidentes.horaRegistro, mttrMinutos: incidentes.mttrMinutos,
  }
  const [lastInc]  = await db.select(incSel).from(incidentes).where(incWhere).orderBy(desc(incidentes.horaRegistro)).limit(1).catch(() => [])
  const historial  = await db.select(incSel).from(incidentes).where(incWhere).orderBy(desc(incidentes.horaRegistro)).limit(10).catch(() => [])

  // Impacto estimado — Fase 5, Paso 3: calcIeiIncidente (tramos + fallback
  // legacy segmentado) en vez de ieiSum, que aplicaba un solo factor a todo
  // el mttr_minutos sin mirar cobertura real de la mitigación.
  let impacto: number | null = null
  try {
    const { getTramosPorIncidentes, calcIeiIncidente } = await import('@/lib/mitigacion-tramos')
    type IncidenteMitigacionInput = import('@/lib/mitigacion-tramos').IncidenteMitigacionInput
    const rows = await db.execute(sql`
      SELECT
        i.id, i.tipo, i.estado,
        i.hora_registro AS hora_registro_raw, i.hora_fin AS hora_fin_raw,
        i.iei_acumulado AS iei_acumulado_raw,
        i.cont_activado_por, i.cont_hora_activacion, i.cont_hora_desactivacion, i.cont_rendimiento, i.cont_es_externo,
        i.mov_activado_por, i.mov_hora_activacion, i.mov_hora_desactivacion, i.mov_rendimiento,
        i.boleta_manual, i.boleta_rendimiento, i.boleta_hora_activacion,
        i.mitigaciones_previas AS mitigaciones_previas_raw,
        t.venta_hora_soles, t.venta_hora_fds_soles
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      WHERE i.tienda_id = ${tiendaId}
        AND i.proveedor_id = ${id}
        AND i.estado = 'RESUELTO'
    `) as unknown as any[]

    const tramosPorIncidente = await getTramosPorIncidentes(rows.map((r: any) => r.id))
    let suma = 0
    for (const r of rows) {
      const incidenteMitigacion: IncidenteMitigacionInput = {
        tipo: r.tipo, estado: r.estado,
        horaRegistro: r.hora_registro_raw, horaFin: r.hora_fin_raw, ieiAcumulado: r.iei_acumulado_raw,
        contActivadoPor: r.cont_activado_por, contHoraActivacion: r.cont_hora_activacion,
        contHoraDesactivacion: r.cont_hora_desactivacion, contRendimiento: r.cont_rendimiento, contEsExterno: r.cont_es_externo,
        movActivadoPor: r.mov_activado_por, movHoraActivacion: r.mov_hora_activacion,
        movHoraDesactivacion: r.mov_hora_desactivacion, movRendimiento: r.mov_rendimiento,
        boletaManual: r.boleta_manual, boletaRendimiento: r.boleta_rendimiento, boletaHoraActivacion: r.boleta_hora_activacion,
        mitigacionesPrevias: r.mitigaciones_previas_raw,
      }
      const { iei } = calcIeiIncidente(incidenteMitigacion, tramosPorIncidente.get(r.id) ?? [], {
        ventaHoraSoles: r.venta_hora_soles, ventaHoraFdsSoles: r.venta_hora_fds_soles,
      })
      suma += iei
    }
    impacto = rows.length > 0 ? Math.round(suma) : null
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]/tienda/[tiendaId]', e) }

  // Proveedores anteriores: distintos a id que tienen incidentes en esta tienda
  let proveedoresAnteriores: any[] = []
  try {
    const provAnterior = alias(proveedores, 'pa')
    const rows = await db.select({
      proveedorId:     incidentes.proveedorId,
      proveedorNombre: provAnterior.nombre,
      totalIncidentes: sql<number>`count(${incidentes.id})::int`,
      mttrPromedio:    sql<number>`round(avg(${incidentes.mttrMinutos}))::int`,
      ultimoIncidente: sql<string>`max(${incidentes.horaRegistro})`,
    }).from(incidentes)
      .leftJoin(provAnterior, eq(incidentes.proveedorId, provAnterior.id))
      .where(and(
        eq(incidentes.tiendaId, tiendaId),
        isNotNull(incidentes.proveedorId),
        sql`${incidentes.proveedorId} IS DISTINCT FROM ${id}::uuid`,
      ))
      .groupBy(incidentes.proveedorId, provAnterior.nombre)
      .orderBy(desc(sql`count(${incidentes.id})`)) as any[]

    // SLA por proveedor anterior (mismo criterio ficha-aware que slaTienda —
    // % de cumplimiento de respuesta, no el conteo de estado_cronometro)
    const slaRows = await db.execute(sql`
      SELECT
        i.proveedor_id,
        ${sql.raw(slaRespuestaPctExpr())} AS sla_respuesta_pct
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      ${sql.raw(slaProveedorJoins())}
      WHERE i.tienda_id    = ${tiendaId}
        AND i.proveedor_id IS NOT NULL
        AND i.proveedor_id != ${id}::uuid
      GROUP BY i.proveedor_id
    `)
    const slaMap: Record<string, number | null> = {}
    for (const r of slaRows as any[]) {
      slaMap[r.proveedor_id] = r.sla_respuesta_pct != null ? Number(r.sla_respuesta_pct) : null
    }

    proveedoresAnteriores = rows.map((r: any) => ({
      ...r,
      slaPromedio: slaMap[r.proveedorId] ?? null,
    }))
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]/tienda/[tiendaId]', e) }

  return NextResponse.json({
    tienda,
    contrato,
    metricas: {
      incidentesHistoricos:  historicData.total,
      incidentes30d:         inc30d,
      mttrPromedio:          historicData.mttrAvg,
      mttrPromFmt:           fmtMttr(historicData.mttrAvg),
      tiempoCaidoTotal:      historicData.mttrTotal,
      tiempoCaidoFmt:        fmtMttr(historicData.mttrTotal),
      slaTienda,
      slaRespuestaTienda,
      slaResolucionTienda,
      impactoEstimado:       impacto,
    },
    lastIncidente: lastInc ?? null,
    historial,
    proveedoresAnteriores,
  })
}
