import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, proveedores, incidentes, contratosProveedor } from '@/drizzle/schema'
import { eq, gte, sql, and, isNotNull, desc, count } from 'drizzle-orm'
import { auth } from '@/auth'
import { DASHBOARD_CONFIG } from '@/lib/dashboard-config'

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
    direccion:         tiendas.direccion,
    distrito:          tiendas.distrito,
    provincia:         tiendas.provincia,
    cidServicio:       tiendas.cidServicio,
    tipoConexion:      tiendas.tipoConexion,
    tipoServicio:      tiendas.tipoServicio,
    costoMensual:      tiendas.costoMensual,
    tieneContingencia: tiendas.tieneContingencia,
    contingenciaActiva: tiendas.contingenciaActiva,
    ventaHoraSoles:    tiendas.ventaHoraSoles,
    cluster:           tiendas.cluster,
    proveedorId:       tiendas.proveedorId,
    proveedorNombre:   proveedores.nombre,
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

  // Métricas históricas
  let historicData = { total: 0, mttrAvg: null as number | null, mttrTotal: 0 }
  try {
    const [r] = await db.select({
      total:     sql<number>`count(*)::int`,
      mttrAvg:   sql<number>`round(avg(${incidentes.mttrMinutos}))::int`,
      mttrTotal: sql<number>`coalesce(sum(${incidentes.mttrMinutos}), 0)::int`,
    }).from(incidentes)
      .where(and(eq(incidentes.tiendaId, tiendaId), eq(incidentes.proveedorId, id)))
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

  // SLA
  let slaTienda: number | null = null
  try {
    const slaRows = await db.execute(sql`
      SELECT
        count(*) filter (where e.estado_cronometro in ('RESPONDIDO','VENCIDO')) as total_closed,
        count(*) filter (where e.estado_cronometro = 'RESPONDIDO')              as respondidos
      FROM escalamientos e
      JOIN incidentes i ON e.incidente_id = i.id
      WHERE i.tienda_id    = ${tiendaId}
        AND i.proveedor_id = ${id}
        AND e.hora_envio_correo >= ${thirtyDaysAgoStr}::timestamptz
    `)
    const slaRow = (slaRows as any[])[0]
    const tc = Number(slaRow?.total_closed ?? 0)
    if (tc > 0) slaTienda = Math.round((Number(slaRow.respondidos) / tc) * 100)
  } catch { /* skip */ }

  // Último incidente + historial
  const incWhere = and(eq(incidentes.tiendaId, tiendaId), eq(incidentes.proveedorId, id))
  const incSel   = {
    id: incidentes.id, codigo: incidentes.codigo, tipo: incidentes.tipo,
    estado: incidentes.estado, horaRegistro: incidentes.horaRegistro, mttrMinutos: incidentes.mttrMinutos,
  }
  const [lastInc]  = await db.select(incSel).from(incidentes).where(incWhere).orderBy(desc(incidentes.horaRegistro)).limit(1).catch(() => [])
  const historial  = await db.select(incSel).from(incidentes).where(incWhere).orderBy(desc(incidentes.horaRegistro)).limit(10).catch(() => [])

  // Impacto estimado
  const ventaHora = Number(tienda.ventaHoraSoles ?? 0)
  const mttrTotal = historicData.mttrTotal
  const impacto   = ventaHora > 0 && mttrTotal > 0
    ? Math.round((mttrTotal / 60) * ventaHora * DASHBOARD_CONFIG.MARGEN_BRUTO * 100) / 100
    : null

  return NextResponse.json({
    tienda,
    contrato,
    metricas: {
      incidentesHistoricos: historicData.total,
      incidentes30d:        inc30d,
      mttrPromedio:         historicData.mttrAvg,
      mttrPromFmt:          fmtMttr(historicData.mttrAvg),
      tiempoCaidoTotal:     mttrTotal,
      tiempoCaidoFmt:       fmtMttr(mttrTotal),
      slaTienda,
      impactoEstimado:      impacto,
    },
    lastIncidente: lastInc ?? null,
    historial,
  })
}
