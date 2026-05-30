import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, proveedores, incidentes, contratosProveedor } from '@/drizzle/schema'
import { eq, gte, sql, and, isNotNull, desc, count } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/auth'

function fmtMttr(mins: number | null): string {
  if (!mins) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; tiendaId: string }> }) {
  const { id, tiendaId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Base tienda info (original columns — safe)
  const [tiendaBase] = await db.select({
    id:                tiendas.id,
    codigo:            tiendas.codigo,
    nombreCc:          tiendas.nombreCc,
    referencia:        tiendas.referencia,
    formato:           tiendas.formato,
    direccion:         tiendas.direccion,
    distrito:          tiendas.distrito,
    provincia:         tiendas.provincia,
    cidServicio:       tiendas.cidServicio,
    tipoConexion:      tiendas.tipoConexion,
    tipoServicio:      tiendas.tipoServicio,
    descripcionServicio: tiendas.descripcionServicio,
    costoMensual:      tiendas.costoMensual,
    tieneContingencia: tiendas.tieneContingencia,
    contingenciaActiva: tiendas.contingenciaActiva,
    ventaHoraSoles:    tiendas.ventaHoraSoles,
    cluster:           tiendas.cluster,
    proveedorId:       tiendas.proveedorId,
    proveedorNombre:   proveedores.nombre,
    supervisorNombre:  tiendas.supervisorNombre,
    supervisorCelular: tiendas.supervisorCelular,
    contactoSoporte:   tiendas.contactoSoporte,
    vigenciaContrato:  tiendas.vigenciaContrato,
    gabinete:          tiendas.gabinete,
    observacion:       tiendas.observacion,
  }).from(tiendas)
    .leftJoin(proveedores, eq(tiendas.proveedorId, proveedores.id))
    .where(eq(tiendas.id, tiendaId))

  if (!tiendaBase) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // New tienda columns (may not exist yet)
  let tiendaExt: any = { planAplicado: null, velocidad: null, fechaAltaServicio: null, estadoServicio: 'ACTIVO' }
  try {
    const [r] = await db.select({
      planAplicado:      tiendas.planAplicado,
      velocidad:         tiendas.velocidad,
      fechaAltaServicio: tiendas.fechaAltaServicio,
      estadoServicio:    tiendas.estadoServicio,
    }).from(tiendas).where(eq(tiendas.id, tiendaId))
    if (r) tiendaExt = r
  } catch { /* columns not migrated yet */ }

  const tienda = { ...tiendaBase, ...tiendaExt }

  const thirtyDaysAgo    = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

  // Contrato específico de esta tienda
  let contrato: any = null
  try {
    const [c] = await db.select().from(contratosProveedor)
      .where(and(eq(contratosProveedor.proveedorId, id), eq(contratosProveedor.tiendaId, tiendaId)))
      .orderBy(desc(contratosProveedor.creadoEn))
      .limit(1)
    contrato = c ?? null
  } catch { /* table not migrated yet */ }

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
  } catch { /* skip */ }

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
  } catch { /* skip */ }

  // SLA Respuesta + Resolución para esta tienda con este proveedor (últimos 30d)
  let slaTienda:          number | null = null
  let slaRespuestaTienda:  number | null = null
  let slaResolucionTienda: number | null = null
  try {
    const slaRows = await db.execute(sql`
      SELECT
        count(*) filter (where n1.hora_correo_n1 IS NOT NULL) AS total_escalados,
        count(*) filter (
          where n1.hora_correo_n1 IS NOT NULL AND resp.hora_primera_resp IS NOT NULL
            AND EXTRACT(epoch FROM (resp.hora_primera_resp - n1.hora_correo_n1)) <= 3600
        ) AS resp_ok,
        count(*) filter (
          where n1.hora_correo_n1 IS NOT NULL AND resp.hora_primera_resp IS NOT NULL AND i.hora_fin IS NOT NULL
        ) AS total_resolvibles,
        count(*) filter (
          where n1.hora_correo_n1 IS NOT NULL AND resp.hora_primera_resp IS NOT NULL AND i.hora_fin IS NOT NULL
            AND EXTRACT(epoch FROM (i.hora_fin - resp.hora_primera_resp)) <= 3600
        ) AS resol_ok
      FROM incidentes i
      LEFT JOIN LATERAL (
        SELECT hora_envio_correo AS hora_correo_n1
        FROM   escalamientos
        WHERE  incidente_id = i.id AND nivel = 1 AND hora_envio_correo IS NOT NULL
        ORDER  BY creado_en LIMIT 1
      ) n1 ON true
      LEFT JOIN LATERAL (
        SELECT hora_respuesta AS hora_primera_resp
        FROM   escalamientos
        WHERE  incidente_id = i.id AND hora_respuesta IS NOT NULL
        ORDER  BY hora_respuesta LIMIT 1
      ) resp ON true
      WHERE i.tienda_id    = ${tiendaId}
        AND i.proveedor_id = ${id}
        AND i.hora_registro >= ${thirtyDaysAgoStr}::timestamptz
        AND i.estado = 'RESUELTO'
    `)
    const sr = (slaRows as any[])[0]
    const te = Number(sr?.total_escalados ?? 0)
    const tr = Number(sr?.total_resolvibles ?? 0)
    if (te > 0) {
      slaRespuestaTienda = Math.round((Number(sr.resp_ok)  / te) * 100)
      slaTienda          = slaRespuestaTienda
    }
    if (tr > 0) slaResolucionTienda = Math.round((Number(sr.resol_ok) / tr) * 100)
  } catch { /* skip */ }

  // Último incidente + historial
  const incWhere = incStrictWhere
  const incSel   = {
    id: incidentes.id, codigo: incidentes.codigo, tipo: incidentes.tipo,
    estado: incidentes.estado, horaRegistro: incidentes.horaRegistro, mttrMinutos: incidentes.mttrMinutos,
  }
  const [lastInc]  = await db.select(incSel).from(incidentes).where(incWhere).orderBy(desc(incidentes.horaRegistro)).limit(1).catch(() => [])
  const historial  = await db.select(incSel).from(incidentes).where(incWhere).orderBy(desc(incidentes.horaRegistro)).limit(10).catch(() => [])

  // Impacto estimado — suma calcImpactoRow por cada incidente resuelto
  let impacto: number | null = null
  try {
    const { calcImpactoRow } = await import('@/lib/impacto-calc')
    const impRows = await db.select({
      horaRegistro:         incidentes.horaRegistro,
      horaFin:              incidentes.horaFin,
      estado:               incidentes.estado,
      tipo:                 incidentes.tipo,
      contActivadoPor:      incidentes.contActivadoPor,
      contHoraDesactivacion: incidentes.contHoraDesactivacion,
      contRendimiento:      incidentes.contRendimiento,
      movActivadoPor:       incidentes.movActivadoPor,
      movRendimiento:       incidentes.movRendimiento,
      boletaManual:         incidentes.boletaManual,
      ventaParcial:         incidentes.ventaParcial,
      cajasAfectadas:       incidentes.cajasAfectadas,
      cajasTotales:         incidentes.cajasTotales,
      otrosClasificacion:   incidentes.otrosClasificacion,
    }).from(incidentes)
      .where(and(
        eq(incidentes.tiendaId, tiendaId),
        eq(incidentes.proveedorId, id),
        sql`${incidentes.estado} = 'RESUELTO'`,
        isNotNull(incidentes.horaFin),
      ))

    const ventaHoraSoles = tienda.ventaHoraSoles ? Number(tienda.ventaHoraSoles) : null
    const cluster = tienda.cluster ?? null
    let suma = 0, tieneAlguno = false
    for (const inc of impRows) {
      const r = calcImpactoRow({
        hora_registro:       inc.horaRegistro,
        hora_fin:            inc.horaFin,
        estado:              inc.estado,
        tipo:                inc.tipo,
        venta_hora_soles:    ventaHoraSoles,
        cluster,
        contingencia_activa: !!inc.contActivadoPor,
        hubo_movil:          !!inc.movActivadoPor,
        cont_rendimiento:    inc.contRendimiento ?? inc.movRendimiento,
        boleta_manual:       inc.boletaManual ?? false,
        venta_parcial:       inc.ventaParcial ?? false,
        cajas_afectadas:     inc.cajasAfectadas,
        cajas_totales:       inc.cajasTotales,
        otros_clasificacion: inc.otrosClasificacion,
      })
      if (r.impactoEconomicoEstimado != null) {
        suma += r.impactoEconomicoEstimado
        tieneAlguno = true
      }
    }
    if (tieneAlguno) impacto = suma
  } catch { /* skip */ }

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

    // SLA por proveedor anterior (misma lógica que slaTienda)
    const slaRows = await db.execute(sql`
      SELECT
        i.proveedor_id,
        count(*) filter (where e.estado_cronometro in ('RESPONDIDO','VENCIDO')) as total_closed,
        count(*) filter (where e.estado_cronometro = 'RESPONDIDO')              as respondidos
      FROM escalamientos e
      JOIN incidentes i ON e.incidente_id = i.id
      WHERE i.tienda_id    = ${tiendaId}
        AND i.proveedor_id IS NOT NULL
        AND i.proveedor_id != ${id}::uuid
      GROUP BY i.proveedor_id
    `)
    const slaMap: Record<string, number | null> = {}
    for (const r of slaRows as any[]) {
      const tc = Number(r.total_closed ?? 0)
      slaMap[r.proveedor_id] = tc > 0 ? Math.round((Number(r.respondidos) / tc) * 100) : null
    }

    proveedoresAnteriores = rows.map((r: any) => ({
      ...r,
      slaPromedio: slaMap[r.proveedorId] ?? null,
    }))
  } catch { /* skip */ }

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
