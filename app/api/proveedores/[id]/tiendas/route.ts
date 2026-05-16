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

  const [rows, incCounts] = await Promise.all([
    db.select({
      id:               tiendas.id,
      codigo:           tiendas.codigo,
      nombreCc:         tiendas.nombreCc,
      distrito:         tiendas.distrito,
      provincia:        tiendas.provincia,
      cidServicio:      tiendas.cidServicio,
      tipoConexion:     tiendas.tipoConexion,
      tipoServicio:     tiendas.tipoServicio,
      cluster:          tiendas.cluster,
      costoMensual:     tiendas.costoMensual,
      tieneContingencia: tiendas.tieneContingencia,
      contingenciaActiva: tiendas.contingenciaActiva,
      estadoServicio:   tiendas.estadoServicio,
      planAplicado:     tiendas.planAplicado,
      velocidad:        tiendas.velocidad,
      fechaAltaServicio: tiendas.fechaAltaServicio,
    }).from(tiendas)
      .where(eq(tiendas.proveedorId, id))
      .orderBy(tiendas.codigo),

    db.select({ tiendaId: incidentes.tiendaId, total: count() })
      .from(incidentes)
      .where(and(
        eq(incidentes.proveedorId, id),
        gte(incidentes.horaRegistro, thirtyDaysAgo),
      ))
      .groupBy(incidentes.tiendaId),
  ])

  const incMap: Record<string, number> = {}
  for (const c of incCounts) if (c.tiendaId) incMap[c.tiendaId] = c.total

  return NextResponse.json(rows.map(t => ({ ...t, incidentes30d: incMap[t.id] ?? 0 })))
}
