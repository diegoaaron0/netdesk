import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { proveedores, tiendas, incidentes, contratosProveedor, nivelesEscalamiento } from '@/drizzle/schema'
import { eq, gte, sql, and, asc, desc, isNotNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/auth'

function calcEstado(fechaFin: string | null | undefined): 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' {
  if (!fechaFin) return 'VIGENTE'
  const fin = new Date(fechaFin), hoy = new Date()
  const en7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  if (fin < hoy) return 'VENCIDO'
  if (fin <= en7) return 'POR_VENCER'
  return 'VIGENTE'
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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

  // New columns
  let ext: any = { tipoServicio: null, planPrincipal: null, canalAtencion: null, observaciones: null, estadoContrato: null }
  try {
    const [r] = await db.select({
      tipoServicio:   proveedores.tipoServicio,
      planPrincipal:  proveedores.planPrincipal,
      canalAtencion:  proveedores.canalAtencion,
      observaciones:  proveedores.observaciones,
      estadoContrato: proveedores.estadoContrato,
    }).from(proveedores).where(eq(proveedores.id, id))
    if (r) ext = r
  } catch { /* columns not migrated yet */ }

  const thirtyDaysAgo    = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

  // Niveles de escalamiento
  let niveles: any[] = []
  try {
    niveles = await db.select().from(nivelesEscalamiento)
      .where(eq(nivelesEscalamiento.proveedorId, id))
      .orderBy(asc(nivelesEscalamiento.nivel))
  } catch { /* skip */ }

  // Contratos
  let contratos: any[] = []
  try {
    const rows = await db.select().from(contratosProveedor)
      .where(eq(contratosProveedor.proveedorId, id))
      .orderBy(desc(contratosProveedor.creadoEn))
    contratos = rows.map(c => ({ ...c, estadoCalc: calcEstado(c.fechaFin) }))
  } catch { /* table not migrated yet */ }

  // Tiendas count + costo
  let tiendasData = { count: 0, costoTotal: '0' }
  try {
    const [r] = await db.select({
      count:      sql<number>`count(*)::int`,
      costoTotal: sql<string>`coalesce(sum(costo_mensual::numeric), 0)::text`,
    }).from(tiendas).where(eq(tiendas.proveedorId, id))
    if (r) tiendasData = { count: r.count, costoTotal: r.costoTotal }
  } catch { /* skip */ }

  // Incidentes 30d por tienda
  let incPerTienda: { tiendaId: string; count: number }[] = []
  try {
    incPerTienda = await db.select({
      tiendaId: incidentes.tiendaId,
      count:    sql<number>`count(*)::int`,
    }).from(incidentes)
      .where(and(eq(incidentes.proveedorId, id), gte(incidentes.horaRegistro, thirtyDaysAgo)))
      .groupBy(incidentes.tiendaId) as any
  } catch { /* skip */ }

  const totalInc30d     = incPerTienda.reduce((s, r) => s + r.count, 0)
  const tiendasCriticas = incPerTienda.filter(r => r.count >= 2).length

  // MTTR
  let mttrData = { avg: null as number | null, total: 0 }
  try {
    const [r] = await db.select({
      mttrAvg:   sql<number>`round(avg(${incidentes.mttrMinutos}))::int`,
      mttrTotal: sql<number>`coalesce(sum(${incidentes.mttrMinutos}), 0)::int`,
    }).from(incidentes).where(and(
      eq(incidentes.proveedorId, id),
      gte(incidentes.horaRegistro, thirtyDaysAgo),
      isNotNull(incidentes.mttrMinutos),
    ))
    if (r) mttrData = { avg: r.mttrAvg, total: r.mttrTotal }
  } catch { /* skip */ }

  // SLA
  let slaPromedio: number | null = null
  try {
    const { getSlaContrato } = await import('@/lib/sla-contrato')
    const slaContrato = await getSlaContrato(id)

    const slaRows = await db.execute(sql`
      SELECT
        i.tipo,
        i.mttr_minutos,
        i.evaluable_proveedor,
        i.resuelto_por,
        MIN(e.hora_envio_correo) AS hora_correo_n1,
        MIN(e.hora_respuesta)   AS hora_respuesta_n1
      FROM incidentes i
      LEFT JOIN escalamientos e ON e.incidente_id = i.id AND e.nivel = 1
      WHERE i.proveedor_id = ${id}
        AND i.hora_registro >= ${thirtyDaysAgoStr}::timestamptz
        AND i.estado = 'RESUELTO'
        AND i.evaluable_proveedor IS NOT FALSE
      GROUP BY i.id
    `)

    const { calcSLARow } = await import('@/lib/sla-core')
    let ok = 0, total = 0
    for (const row of slaRows as any[]) {
      if (!row.hora_correo_n1) continue
      total++
      const res = calcSLARow({
        tipo: row.tipo,
        hora_registro: new Date(),
        hora_fin: null,
        mttr_minutos: row.mttr_minutos,
        hora_correo_n1: row.hora_correo_n1,
        hora_primera_resp: row.hora_respuesta_n1,
        max_nivel: 1,
        evaluable_proveedor: true,
        slaRespuestaOverride: slaContrato.respuestaMin,
        slaResolucionOverride: slaContrato.resolucionPorTipo[row.tipo] ?? slaContrato.respuestaMin,
      })
      if (res.slaGeneral) ok++
    }
    if (total > 0) slaPromedio = Math.round((ok / total) * 100)
  } catch { /* skip */ }

  const contratoVigente = contratos.find(c => c.estadoCalc === 'VIGENTE' && !c.tiendaId)

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
  } catch { /* skip */ }

  return NextResponse.json({
    ...base,
    ...ext,
    niveles,
    contratos,
    metricas: {
      totalTiendas:    tiendasData.count,
      costoTotal:      tiendasData.costoTotal,
      slaPromedio,
      mttrPromedio:    mttrData.avg,
      mttrTotal:       mttrData.total,
      incidentes30d:   totalInc30d,
      tiendasCriticas,
      slaComprometido: contratoVigente?.slaComprometido ?? null,
    },
    tiendasHistoricas,
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['SUPERVISOR', 'INFRAESTRUCTURA'].includes((session.user as any)?.rol)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const baseSet: any = {}
  if ('nombre'             in body) baseSet.nombre             = body.nombre
  if ('correoSoporte'      in body) baseSet.correoSoporte      = body.correoSoporte      ?? null
  if ('telefonoSoporte'    in body) baseSet.telefonoSoporte    = body.telefonoSoporte    ?? null
  if ('instruccionGeneral' in body) baseSet.instruccionGeneral = body.instruccionGeneral ?? null

  let p: any
  try {
    const fullSet = { ...baseSet }
    if ('tipoServicio'   in body) fullSet.tipoServicio   = body.tipoServicio   ?? null
    if ('planPrincipal'  in body) fullSet.planPrincipal  = body.planPrincipal  ?? null
    if ('canalAtencion'  in body) fullSet.canalAtencion  = body.canalAtencion  ?? null
    if ('observaciones'  in body) fullSet.observaciones  = body.observaciones  ?? null
    if ('estadoContrato' in body) fullSet.estadoContrato = body.estadoContrato ?? null
    const [r] = await db.update(proveedores).set(fullSet).where(eq(proveedores.id, id)).returning()
    p = r
  } catch {
    const [r] = await db.update(proveedores).set(baseSet).where(eq(proveedores.id, id)).returning()
    p = r
  }
  return NextResponse.json(p)
}
