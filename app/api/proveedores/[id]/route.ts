import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { proveedores, tiendas, incidentes, escalamientos, contratosProveedor, nivelesEscalamiento } from '@/drizzle/schema'
import { eq, gte, sql, and, asc, desc, isNotNull } from 'drizzle-orm'
import { auth } from '@/auth'

function calcEstado(fechaFin: string | null): 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' {
  if (!fechaFin) return 'VIGENTE'
  const fin = new Date(fechaFin)
  const hoy = new Date()
  const en7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  if (fin < hoy) return 'VENCIDO'
  if (fin <= en7) return 'POR_VENCER'
  return 'VIGENTE'
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [proveedor] = await db.select().from(proveedores).where(eq(proveedores.id, id))
  if (!proveedor) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [niveles, contratos, tiendasRow, incPerTienda, mttrRow, slaRows] = await Promise.all([
    db.select().from(nivelesEscalamiento)
      .where(eq(nivelesEscalamiento.proveedorId, id))
      .orderBy(asc(nivelesEscalamiento.nivel)),

    db.select().from(contratosProveedor)
      .where(eq(contratosProveedor.proveedorId, id))
      .orderBy(desc(contratosProveedor.creadoEn)),

    db.select({
      count:      sql<number>`count(*)::int`,
      costoTotal: sql<string>`coalesce(sum(${tiendas.costoMensual}::numeric), 0)::text`,
    }).from(tiendas).where(eq(tiendas.proveedorId, id)),

    db.select({
      tiendaId: incidentes.tiendaId,
      count:    sql<number>`count(*)::int`,
    }).from(incidentes)
      .where(and(eq(incidentes.proveedorId, id), gte(incidentes.horaRegistro, thirtyDaysAgo)))
      .groupBy(incidentes.tiendaId),

    db.select({
      mttrAvg:   sql<number>`round(avg(${incidentes.mttrMinutos}))::int`,
      mttrTotal: sql<number>`coalesce(sum(${incidentes.mttrMinutos}), 0)::int`,
    }).from(incidentes)
      .where(and(
        eq(incidentes.proveedorId, id),
        gte(incidentes.horaRegistro, thirtyDaysAgo),
        isNotNull(incidentes.mttrMinutos),
      )),

    db.execute(sql`
      SELECT
        count(*) filter (where e.estado_cronometro in ('RESPONDIDO','VENCIDO')) as total_closed,
        count(*) filter (where e.estado_cronometro = 'RESPONDIDO')              as respondidos
      FROM escalamientos e
      JOIN incidentes i ON e.incidente_id = i.id
      WHERE i.proveedor_id = ${id}
        AND e.hora_envio_correo >= ${thirtyDaysAgo}
    `),
  ])

  const totalInc30d     = incPerTienda.reduce((s, r) => s + r.count, 0)
  const tiendasCriticas = incPerTienda.filter(r => r.count >= 2).length
  const slaRow          = (slaRows as any[])[0]
  const totalClosed     = Number(slaRow?.total_closed ?? 0)
  const slaPromedio     = totalClosed > 0 ? Math.round((Number(slaRow.respondidos) / totalClosed) * 100) : null

  // SLA comprometido from vigente contract (general, no tiendaId)
  const contratoVigente = contratos.find(c => calcEstado(c.fechaFin) === 'VIGENTE' && !c.tiendaId)

  const contratosConEstado = contratos.map(c => ({
    ...c,
    estadoCalc: calcEstado(c.fechaFin),
  }))

  return NextResponse.json({
    ...proveedor,
    niveles,
    contratos: contratosConEstado,
    metricas: {
      totalTiendas:    tiendasRow[0]?.count     ?? 0,
      costoTotal:      tiendasRow[0]?.costoTotal ?? '0',
      slaPromedio,
      mttrPromedio:    mttrRow[0]?.mttrAvg       ?? null,
      mttrTotal:       mttrRow[0]?.mttrTotal     ?? 0,
      incidentes30d:   totalInc30d,
      tiendasCriticas,
      slaComprometido: contratoVigente?.slaComprometido ?? null,
    },
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
  const [p] = await db.update(proveedores).set({
    nombre:             body.nombre             ?? undefined,
    correoSoporte:      'correoSoporte'      in body ? (body.correoSoporte      ?? null) : undefined,
    telefonoSoporte:    'telefonoSoporte'    in body ? (body.telefonoSoporte    ?? null) : undefined,
    instruccionGeneral: 'instruccionGeneral' in body ? (body.instruccionGeneral ?? null) : undefined,
    tipoServicio:       'tipoServicio'       in body ? (body.tipoServicio       ?? null) : undefined,
    planPrincipal:      'planPrincipal'      in body ? (body.planPrincipal      ?? null) : undefined,
    canalAtencion:      'canalAtencion'      in body ? (body.canalAtencion      ?? null) : undefined,
    observaciones:      'observaciones'      in body ? (body.observaciones      ?? null) : undefined,
    estadoContrato:     'estadoContrato'     in body ? (body.estadoContrato     ?? null) : undefined,
  }).where(eq(proveedores.id, id)).returning()
  return NextResponse.json(p)
}
