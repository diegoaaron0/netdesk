import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, incidentes } from '@/drizzle/schema'
import { eq, gte, sql, and, count } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Base columns (original — always safe)
  const rows = await db.select({
    id:                tiendas.id,
    codigo:            tiendas.codigo,
    nombreCc:          tiendas.nombreCc,
    distrito:          tiendas.distrito,
    provincia:         tiendas.provincia,
    cidServicio:       tiendas.cidServicio,
    tipoConexion:      tiendas.tipoConexion,
    tipoServicio:      tiendas.tipoServicio,
    cluster:           tiendas.cluster,
    costoMensual:      tiendas.costoMensual,
    tieneContingencia: tiendas.tieneContingencia,
    contingenciaActiva: tiendas.contingenciaActiva,
  }).from(tiendas)
    .where(eq(tiendas.proveedorId, id))
    .orderBy(tiendas.codigo)

  // New columns (may not exist in Railway yet)
  let extMap: Record<string, any> = {}
  try {
    const extRows = await db.select({
      id:                tiendas.id,
      estadoServicio:    tiendas.estadoServicio,
      planAplicado:      tiendas.planAplicado,
      velocidad:         tiendas.velocidad,
      fechaAltaServicio: tiendas.fechaAltaServicio,
    }).from(tiendas).where(eq(tiendas.proveedorId, id))
    for (const r of extRows) extMap[r.id] = r
  } catch { /* columns not migrated yet */ }

  // Incidentes 30d
  let incMap: Record<string, number> = {}
  try {
    const incCounts = await db.select({ tiendaId: incidentes.tiendaId, total: count() })
      .from(incidentes)
      .where(and(eq(incidentes.proveedorId, id), gte(incidentes.horaRegistro, thirtyDaysAgo)))
      .groupBy(incidentes.tiendaId)
    for (const c of incCounts) if (c.tiendaId) incMap[c.tiendaId] = c.total
  } catch { /* skip */ }

  return NextResponse.json(rows.map(t => ({
    ...t,
    ...(extMap[t.id] ?? { estadoServicio: 'ACTIVO', planAplicado: null, velocidad: null, fechaAltaServicio: null }),
    incidentes30d: incMap[t.id] ?? 0,
  })))
}
