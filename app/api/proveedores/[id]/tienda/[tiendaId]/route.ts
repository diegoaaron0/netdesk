import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, proveedores, incidentes, contratosProveedor } from '@/drizzle/schema'
import { eq, gte, sql, and, isNotNull, desc, count } from 'drizzle-orm'
import { auth } from '@/auth'
import { DASHBOARD_CONFIG } from '@/lib/dashboard-config'

function fmtMttr(mins: number | null): string {
  if (!mins) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; tiendaId: string }> }) {
  const { id, tiendaId } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [tienda] = await db.select({
    id:                tiendas.id,
    codigo:            tiendas.codigo,
    nombreCc:          tiendas.nombreCc,
    direccion:         tiendas.direccion,
    distrito:          tiendas.distrito,
    provincia:         tiendas.provincia,
    cidServicio:       tiendas.cidServicio,
    tipoConexion:      tiendas.tipoConexion,
    tipoServicio:      tiendas.tipoServicio,
    planAplicado:      tiendas.planAplicado,
    velocidad:         tiendas.velocidad,
    costoMensual:      tiendas.costoMensual,
    estadoServicio:    tiendas.estadoServicio,
    fechaAltaServicio: tiendas.fechaAltaServicio,
    tieneContingencia: tiendas.tieneContingencia,
    contingenciaActiva: tiendas.contingenciaActiva,
    ventaHoraSoles:    tiendas.ventaHoraSoles,
    cluster:           tiendas.cluster,
    proveedorId:       tiendas.proveedorId,
    proveedorNombre:   proveedores.nombre,
  }).from(tiendas)
    .leftJoin(proveedores, eq(tiendas.proveedorId, proveedores.id))
    .where(eq(tiendas.id, tiendaId))

  if (!tienda) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Contrato específico de esta tienda con este proveedor
  const [contrato] = await db.select().from(contratosProveedor)
    .where(and(
      eq(contratosProveedor.proveedorId, id),
      eq(contratosProveedor.tiendaId, tiendaId),
    ))
    .orderBy(desc(contratosProveedor.creadoEn))
    .limit(1)

  // Métricas históricas
  const [historicRow] = await db.select({
    total:     sql<number>`count(*)::int`,
    mttrAvg:   sql<number>`round(avg(${incidentes.mttrMinutos}))::int`,
    mttrTotal: sql<number>`coalesce(sum(${incidentes.mttrMinutos}), 0)::int`,
  }).from(incidentes)
    .where(and(eq(incidentes.tiendaId, tiendaId), eq(incidentes.proveedorId, id)))

  // Métricas 30d
  const [mes30Row] = await db.select({
    total: sql<number>`count(*)::int`,
  }).from(incidentes)
    .where(and(
      eq(incidentes.tiendaId, tiendaId),
      eq(incidentes.proveedorId, id),
      gte(incidentes.horaRegistro, thirtyDaysAgo),
    ))

  // SLA (escalamientos cerrados de incidentes de esta tienda con este proveedor)
  const slaRows = await db.execute(sql`
    SELECT
      count(*) filter (where e.estado_cronometro in ('RESPONDIDO','VENCIDO')) as total_closed,
      count(*) filter (where e.estado_cronometro = 'RESPONDIDO')              as respondidos
    FROM escalamientos e
    JOIN incidentes i ON e.incidente_id = i.id
    WHERE i.tienda_id   = ${tiendaId}
      AND i.proveedor_id = ${id}
      AND e.hora_envio_correo >= ${thirtyDaysAgo}
  `)
  const slaRow   = (slaRows as any[])[0]
  const tc       = Number(slaRow?.total_closed ?? 0)
  const slaTienda = tc > 0 ? Math.round((Number(slaRow.respondidos) / tc) * 100) : null

  // Último incidente
  const [lastInc] = await db.select({
    id:           incidentes.id,
    codigo:       incidentes.codigo,
    tipo:         incidentes.tipo,
    estado:       incidentes.estado,
    horaRegistro: incidentes.horaRegistro,
    mttrMinutos:  incidentes.mttrMinutos,
  }).from(incidentes)
    .where(and(eq(incidentes.tiendaId, tiendaId), eq(incidentes.proveedorId, id)))
    .orderBy(desc(incidentes.horaRegistro))
    .limit(1)

  // Historial últimos 10
  const historial = await db.select({
    id:           incidentes.id,
    codigo:       incidentes.codigo,
    tipo:         incidentes.tipo,
    estado:       incidentes.estado,
    horaRegistro: incidentes.horaRegistro,
    mttrMinutos:  incidentes.mttrMinutos,
  }).from(incidentes)
    .where(and(eq(incidentes.tiendaId, tiendaId), eq(incidentes.proveedorId, id)))
    .orderBy(desc(incidentes.horaRegistro))
    .limit(10)

  // Impacto estimado
  const ventaHora   = Number(tienda.ventaHoraSoles ?? 0)
  const mttrTotal   = historicRow?.mttrTotal ?? 0
  const impacto     = ventaHora > 0 && mttrTotal > 0
    ? Math.round((mttrTotal / 60) * ventaHora * DASHBOARD_CONFIG.MARGEN_BRUTO * 100) / 100
    : null

  return NextResponse.json({
    tienda,
    contrato: contrato ?? null,
    metricas: {
      incidentesHistoricos: historicRow?.total   ?? 0,
      incidentes30d:        mes30Row?.total       ?? 0,
      mttrPromedio:         historicRow?.mttrAvg  ?? null,
      mttrPromFmt:          fmtMttr(historicRow?.mttrAvg ?? null),
      tiempoCaidoTotal:     mttrTotal,
      tiempoCaidoFmt:       fmtMttr(mttrTotal),
      slaTienda,
      impactoEstimado:      impacto,
    },
    lastIncidente: lastInc ?? null,
    historial,
  })
}
