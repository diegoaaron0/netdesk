import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { proveedores, tiendas, incidentes, fichas } from '@/drizzle/schema'
import { eq, sql, and, desc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { logUnlessSchemaMissing } from '@/lib/db-errors'
import { slaProveedorJoins, slaRespuestaPctExpr, slaResolucionPctExpr } from '@/lib/sla-sql'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'proveedores.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  // Base query — original columns only (safe)
  const [base] = await db.select({
    id:                 proveedores.id,
    nombre:             proveedores.nombre,
    correoSoporte:      proveedores.correoSoporte,
    telefonoSoporte:    proveedores.telefonoSoporte,
    instruccionGeneral: proveedores.instruccionGeneral,
    creadoEn:           proveedores.creadoEn,
  }).from(proveedores).where(eq(proveedores.id, id))
  if (!base) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Campos adicionales del proveedor
  let ext: any = { planPrincipal: null, canalAtencion: null, observaciones: null }
  try {
    const [r] = await db.select({
      planPrincipal: proveedores.planPrincipal,
      canalAtencion: proveedores.canalAtencion,
      observaciones: proveedores.observaciones,
    }).from(proveedores).where(eq(proveedores.id, id))
    if (r) ext = r
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]', e) }

  const thirtyDaysAgo    = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

  // Tiendas count + costo
  let tiendasData = { count: 0, costoTotal: '0' }
  try {
    const [r] = await db.select({
      count:      sql<number>`count(*)::int`,
      costoTotal: sql<string>`coalesce(sum(${fichas.costoMensual}::numeric), 0)::text`,
    }).from(tiendas)
      .leftJoin(fichas, eq(fichas.id, tiendas.fichaActivaId))
      .where(eq(tiendas.proveedorId, id))
    if (r) tiendasData = { count: r.count, costoTotal: r.costoTotal }
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]', e) }

  // Incidentes 30d por tienda
  let incPerTienda: { tiendaId: string; count: number }[] = []
  try {
    incPerTienda = await db.execute(sql`
      SELECT i.tienda_id, count(*)::int AS count
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      WHERE COALESCE(i.proveedor_id, t.proveedor_id) = ${id}::uuid
        AND i.hora_registro >= ${thirtyDaysAgoStr}::timestamptz
      GROUP BY i.tienda_id
    `) as any
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]', e) }

  const totalInc30d     = incPerTienda.reduce((s, r) => s + r.count, 0)
  const tiendasCriticas = incPerTienda.filter(r => r.count >= 2).length

  // MTTR
  let mttrData = { avg: null as number | null, total: 0 }
  try {
    const rows = await db.execute(sql`
      SELECT
        round(avg(i.mttr_minutos))::int AS mttr_avg,
        coalesce(sum(i.mttr_minutos), 0)::int AS mttr_total
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      WHERE COALESCE(i.proveedor_id, t.proveedor_id) = ${id}::uuid
        AND i.hora_registro >= ${thirtyDaysAgoStr}::timestamptz
        AND i.mttr_minutos IS NOT NULL
    `)
    const r = (rows as any[])[0]
    if (r) mttrData = { avg: r.mttr_avg, total: r.mttr_total }
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]', e) }

  // SLA
  let scoreRespuestaPromedio: number | null = null
  let scoreResolucionPromedio: number | null = null
  let tRespuestaPromedio:     number | null = null
  let tResolucionPromedio:    number | null = null
  let slaBreakdown: any[] = []
  try {
    const slaRows = await db.execute(sql`
      SELECT
        i.id, i.codigo, i.tipo, i.evaluable_proveedor,
        (i.hora_registro AT TIME ZONE 'UTC') AS hora_registro,
        (i.hora_fin       AT TIME ZONE 'UTC') AS hora_fin,
        i.mttr_minutos,
        t.codigo AS tienda_codigo, t.nombre_cc AS tienda_nombre,
        (n1.hora_correo_n1      AT TIME ZONE 'UTC') AS hora_correo_n1,
        (resp.hora_primera_resp AT TIME ZONE 'UTC') AS hora_primera_resp,
        max_n.max_nivel,
        cp.tiempo_respuesta_sla  AS sla_resp_override,
        cp.tiempo_resolucion_sla AS sla_resol_override
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN LATERAL (
        SELECT MIN(hora_envio_correo) AS hora_correo_n1
        FROM   escalamientos
        WHERE  incidente_id = i.id AND hora_envio_correo IS NOT NULL
      ) n1 ON true
      LEFT JOIN LATERAL (
        SELECT hora_respuesta AS hora_primera_resp
        FROM   escalamientos
        WHERE  incidente_id = i.id AND hora_respuesta IS NOT NULL AND no_hubo_respuesta IS NOT TRUE
        ORDER  BY hora_respuesta LIMIT 1
      ) resp ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(MAX(nivel), 0) AS max_nivel
        FROM   escalamientos
        WHERE  incidente_id = i.id
      ) max_n ON true
      LEFT JOIN LATERAL (
        SELECT tiempo_respuesta_sla, tiempo_resolucion_sla
        FROM   fichas
        WHERE  id = COALESCE(i.ficha_id, t.ficha_activa_id)
        LIMIT  1
      ) cp ON true
      WHERE COALESCE(i.proveedor_id, t.proveedor_id) = ${id}::uuid
        AND i.hora_registro >= ${thirtyDaysAgoStr}::timestamptz
        AND i.estado = 'RESUELTO'
        AND i.evaluable_proveedor IS NOT FALSE
    `)

    const { calcSLARow } = await import('@/lib/sla-core')
    let totalEsc = 0
    let scoreRespSum = 0
    let scoreResolSum = 0, scoreResolCount = 0
    let tRespSum = 0, tRespCount = 0
    let tResolSum = 0, tResolCount = 0
    const incidentesSla: any[] = []
    for (const row of slaRows as any[]) {
      if (!row.hora_correo_n1) continue
      const res = calcSLARow({
        tipo: row.tipo,
        hora_correo_n1: row.hora_correo_n1,
        hora_primera_resp: row.hora_primera_resp,
        hora_fin: row.hora_fin ?? null,
        hora_registro: row.hora_registro ?? null,
        max_nivel: row.max_nivel ?? 1,
        slaRespuestaOverride:  row.sla_resp_override  ?? undefined,
        slaResolucionOverride: row.sla_resol_override ?? undefined,
      })
      if (!res.evaluable) continue
      totalEsc++
      scoreRespSum += res.scoreRespuesta ?? 0
      if (res.scoreResolucion != null) { scoreResolSum += res.scoreResolucion; scoreResolCount++ }
      if (res.tPrimeraRespuestaMin != null) { tRespSum += res.tPrimeraRespuestaMin; tRespCount++ }
      if (res.tResolucionMin != null) { tResolSum += res.tResolucionMin; tResolCount++ }
      incidentesSla.push({
        id:              row.id,
        codigo:          row.codigo,
        tipo:            row.tipo,
        tiendaCodigo:    row.tienda_codigo,
        tiendaNombre:    row.tienda_nombre,
        horaRegistro:    row.hora_registro,
        mttrMinutos:     row.mttr_minutos,
        tRespuestaMin:   res.tPrimeraRespuestaMin,
        scoreRespuesta:  res.scoreRespuesta,
        tResolucionMin:  res.tResolucionMin,
        scoreResolucion: res.scoreResolucion,
        slaRespObj:      res.slaRespuestaObj,
        slaResolObj:     res.slaResolucionObj,
      })
    }
    if (totalEsc      > 0) scoreRespuestaPromedio  = Math.round(scoreRespSum  / totalEsc)
    if (scoreResolCount > 0) scoreResolucionPromedio = Math.round(scoreResolSum / scoreResolCount)
    if (tRespCount    > 0) tRespuestaPromedio      = Math.round(tRespSum  / tRespCount)
    if (tResolCount   > 0) tResolucionPromedio     = Math.round(tResolSum / tResolCount)
    slaBreakdown = incidentesSla
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]', e) }

  // % cumplimiento SLA Respuesta + Resolución (ficha-aware, vía lib/sla-sql.ts —
  // mismo criterio que Lista y Detalle proveedor↔tienda). Distinto de
  // scoreRespuestaPromedio/scoreResolucionPromedio arriba, que son un score de
  // proximidad 0-100 (no un % de incidentes que cumplieron el SLA).
  let slaRespuestaPct:  number | null = null
  let slaResolucionPct: number | null = null
  try {
    const pctRows = await db.execute(sql`
      SELECT
        ${sql.raw(slaRespuestaPctExpr())}  AS sla_respuesta_pct,
        ${sql.raw(slaResolucionPctExpr())} AS sla_resolucion_pct
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      ${sql.raw(slaProveedorJoins())}
      WHERE COALESCE(i.proveedor_id, t.proveedor_id) = ${id}::uuid
        AND i.hora_registro >= ${thirtyDaysAgoStr}::timestamptz
    `)
    const pr = (pctRows as any[])[0]
    slaRespuestaPct  = pr?.sla_respuesta_pct  != null ? Number(pr.sla_respuesta_pct)  : null
    slaResolucionPct = pr?.sla_resolucion_pct != null ? Number(pr.sla_resolucion_pct) : null
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]', e) }

  // IEI acumulado 30d de todas las tiendas del proveedor — Fase 5, Paso 3:
  // calcIeiIncidente (tramos + fallback legacy segmentado) en vez de
  // calcImpactoRow directo. De paso, cont_hora_activacion/mov_hora_activacion
  // pasan a necesitar su activado_por (mismo gate que ya usa el resto del
  // sistema) — antes esta query los pasaba sin gatear.
  let iei30d = 0
  let iei30dBreakdown: any[] = []
  try {
    const { getTramosPorIncidentes, calcIeiIncidente } = await import('@/lib/mitigacion-tramos')
    type IncidenteMitigacionInput = import('@/lib/mitigacion-tramos').IncidenteMitigacionInput
    const ieiRows = await db.execute(sql`
      SELECT
        i.id, i.codigo,
        (i.hora_registro AT TIME ZONE 'UTC') AS hora_registro,
        (i.hora_fin       AT TIME ZONE 'UTC') AS hora_fin,
        i.estado, i.tipo, i.mttr_minutos,
        i.cont_activado_por,
        (i.cont_hora_activacion    AT TIME ZONE 'UTC') AS cont_hora_activacion,
        (i.cont_hora_desactivacion AT TIME ZONE 'UTC') AS cont_hora_desactivacion,
        i.cont_rendimiento, i.cont_es_externo,
        i.mov_activado_por,
        (i.mov_hora_activacion    AT TIME ZONE 'UTC') AS mov_hora_activacion,
        (i.mov_hora_desactivacion AT TIME ZONE 'UTC') AS mov_hora_desactivacion,
        i.mov_rendimiento,
        i.boleta_manual, i.boleta_rendimiento,
        (i.boleta_hora_activacion AT TIME ZONE 'UTC') AS boleta_hora_activacion,
        i.mitigaciones_previas, i.iei_acumulado,
        t.venta_hora_soles, t.venta_hora_fds_soles, t.cluster,
        t.codigo AS tienda_codigo, t.nombre_cc AS tienda_nombre, t.id AS tienda_id
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      WHERE COALESCE(i.proveedor_id, t.proveedor_id) = ${id}::uuid
        AND i.estado = 'RESUELTO'
        AND i.tipo != 'CORTE_ELECTRICO'
        AND i.hora_registro >= ${thirtyDaysAgoStr}::timestamptz
    `) as unknown as any[]

    const tramosPorIncidente = await getTramosPorIncidentes(ieiRows.map((r: any) => r.id))
    const tiendaMap: Record<string, { tiendaId: string; tiendaCodigo: string; tiendaNombre: string | null; incidentes: any[]; ieiTotal: number }> = {}
    for (const r of ieiRows) {
      const incidenteMitigacion: IncidenteMitigacionInput = {
        tipo: r.tipo, estado: r.estado, horaRegistro: r.hora_registro, horaFin: r.hora_fin,
        ieiAcumulado: r.iei_acumulado,
        contActivadoPor: r.cont_activado_por, contHoraActivacion: r.cont_hora_activacion,
        contHoraDesactivacion: r.cont_hora_desactivacion, contRendimiento: r.cont_rendimiento, contEsExterno: r.cont_es_externo,
        movActivadoPor: r.mov_activado_por, movHoraActivacion: r.mov_hora_activacion,
        movHoraDesactivacion: r.mov_hora_desactivacion, movRendimiento: r.mov_rendimiento,
        boletaManual: r.boleta_manual, boletaRendimiento: r.boleta_rendimiento, boletaHoraActivacion: r.boleta_hora_activacion,
        mitigacionesPrevias: r.mitigaciones_previas,
      }
      const { iei, segmentos } = calcIeiIncidente(incidenteMitigacion, tramosPorIncidente.get(r.id) ?? [], {
        ventaHoraSoles: r.venta_hora_soles, ventaHoraFdsSoles: r.venta_hora_fds_soles, cluster: r.cluster,
      })
      iei30d += iei
      const key = r.tienda_id
      if (!tiendaMap[key]) tiendaMap[key] = { tiendaId: r.tienda_id, tiendaCodigo: r.tienda_codigo, tiendaNombre: r.tienda_nombre, incidentes: [], ieiTotal: 0 }
      tiendaMap[key].ieiTotal += iei
      const tiposReales = [...new Set(segmentos.filter(s => s.tipo !== 'SIN_MITIGACION').map(s => s.tipo))]
      const motivo = tiposReales.length > 0 ? tiposReales.join(' + ') : 'sin mitigación'
      tiendaMap[key].incidentes.push({ id: r.id, codigo: r.codigo, tipo: r.tipo, mttrMinutos: r.mttr_minutos, horaRegistro: r.hora_registro, iei, motivo })
    }
    iei30dBreakdown = Object.values(tiendaMap).sort((a, b) => b.ieiTotal - a.ieiTotal)
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]', e) }

  // Costos por tienda para el panel de desglose
  let costoBreakdown: any[] = []
  try {
    const rows = await db.execute(sql`
      SELECT t.codigo, t.nombre_cc, f.costo_mensual::numeric AS costo
      FROM tiendas t
      LEFT JOIN fichas f ON f.id = t.ficha_activa_id
      WHERE t.proveedor_id = ${id} AND f.costo_mensual IS NOT NULL
      ORDER BY f.costo_mensual::numeric DESC
    `)
    costoBreakdown = (rows as any[]).map(r => ({
      codigo: r.codigo, nombre: r.nombre_cc, costo: Number(r.costo),
    }))
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]', e) }

  // Tiendas históricas: tienen incidentes con este proveedor pero ya no lo tienen asignado
  let tiendasHistoricas: any[] = []
  try {
    const provActual = alias(proveedores, 'prov_actual')
    tiendasHistoricas = await db.select({
      tiendaId:        tiendas.id,
      codigo:          tiendas.codigo,
      nombreCc:        tiendas.nombreCc,
      distrito:        tiendas.distrito,
      totalIncidentes: sql<number>`count(${incidentes.id})::int`,
      mttrPromedio:    sql<number>`round(avg(${incidentes.mttrMinutos}))::int`,
      ultimoIncidente: sql<string>`max(${incidentes.horaRegistro})`,
      proveedorActual: provActual.nombre,
    })
      .from(incidentes)
      .innerJoin(tiendas, eq(incidentes.tiendaId, tiendas.id))
      .leftJoin(provActual, eq(tiendas.proveedorId, provActual.id))
      .where(and(
        eq(incidentes.proveedorId, id),
        sql`${tiendas.proveedorId} IS DISTINCT FROM ${id}::uuid`,
      ))
      .groupBy(tiendas.id, tiendas.codigo, tiendas.nombreCc, tiendas.distrito, provActual.nombre)
      .orderBy(desc(sql`count(${incidentes.id})`)) as any[]
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]', e) }

  // Fecha en que cada tienda histórica fue reasignada fuera de este proveedor
  let cambioFechas: Record<string, string> = {}
  try {
    const cambios = await db.execute(sql`
      SELECT tienda_id, MAX(editado_en) AS fecha_cambio
      FROM tiendas_historial
      WHERE campo_editado = 'proveedorId'
        AND valor_anterior = ${id}
      GROUP BY tienda_id
    `)
    for (const c of cambios as any[]) {
      if (c.tienda_id) cambioFechas[c.tienda_id] = c.fecha_cambio
    }
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]', e) }

  tiendasHistoricas = tiendasHistoricas.map(t => ({
    ...t,
    fechaCambioProveedor: cambioFechas[t.tiendaId] ?? null,
  }))

  return NextResponse.json({
    ...base,
    ...ext,
    metricas: {
      totalTiendas:            tiendasData.count,
      costoTotal:              tiendasData.costoTotal,
      scoreRespuestaPromedio,
      tRespuestaPromedio,
      scoreResolucionPromedio,
      tResolucionPromedio,
      slaRespuestaPct,
      slaResolucionPct,
      mttrPromedio:            mttrData.avg,
      mttrTotal:               mttrData.total,
      incidentes30d:           totalInc30d,
      tiendasCriticas,
      iei30d:                  Math.round(iei30d),
      iei30dBreakdown,
      slaBreakdown,
      costoBreakdown,
    },
    tiendasHistoricas,
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'proveedores.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const body = await req.json()
  const baseSet: any = {}
  if ('nombre'             in body) baseSet.nombre             = body.nombre
  if ('correoSoporte'      in body) baseSet.correoSoporte      = body.correoSoporte      ?? null
  if ('telefonoSoporte'    in body) baseSet.telefonoSoporte    = body.telefonoSoporte    ?? null
  if ('instruccionGeneral' in body) baseSet.instruccionGeneral = body.instruccionGeneral ?? null

  if ('planPrincipal' in body) baseSet.planPrincipal = body.planPrincipal ?? null
  if ('canalAtencion' in body) baseSet.canalAtencion = body.canalAtencion ?? null
  if ('observaciones' in body) baseSet.observaciones = body.observaciones ?? null
  const [p] = await db.update(proveedores).set(baseSet).where(eq(proveedores.id, id)).returning()
  return NextResponse.json(p)
}
