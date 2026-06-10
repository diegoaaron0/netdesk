import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, fichas } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const thirtyDaysAgo    = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

  // Base columns (original — always safe)
  const rows = await db.select({
    id:                tiendas.id,
    codigo:            tiendas.codigo,
    nombreCc:          tiendas.nombreCc,
    referencia:        tiendas.referencia,
    distrito:          tiendas.distrito,
    provincia:         tiendas.provincia,
    cidServicio:       tiendas.cidServicio,
    tipoConexion:      tiendas.tipoConexion,
    tipoServicio:      tiendas.tipoServicio,
    cluster:           tiendas.cluster,
    costoMensual:      tiendas.costoMensual,
    tieneContingencia: tiendas.tieneContingencia,
    contingenciaActiva: tiendas.contingenciaActiva,
    descripcionServicio: tiendas.descripcionServicio,
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

  // Incidentes 30d — COALESCE para incluir incidentes post-cambio de proveedor
  let incMap: Record<string, number> = {}
  try {
    const incCounts = await db.execute(sql`
      SELECT i.tienda_id, count(*)::int AS total
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      WHERE COALESCE(i.proveedor_id, t.proveedor_id) = ${id}::uuid
        AND i.hora_registro >= ${thirtyDaysAgoStr}::timestamptz
      GROUP BY i.tienda_id
    `)
    for (const c of incCounts as any[]) if (c.tienda_id) incMap[c.tienda_id] = c.total
  } catch { /* skip */ }

  // Contratos específicos por tienda (override SLA)
  let contratoMap: Record<string, any> = {}
  try {
    const contratos = await db.execute(sql`
      SELECT id, tienda_id, codigo_contrato, tiempo_respuesta_sla, tiempo_resolucion_sla,
             costo_mensual::text, velocidad_capacidad, fecha_inicio::text, fecha_fin::text
      FROM contratos_proveedor
      WHERE proveedor_id = ${id} AND tienda_id IS NOT NULL AND estado = 'VIGENTE'
    `)
    for (const c of contratos as any[]) if (c.tienda_id) contratoMap[c.tienda_id] = c
  } catch { /* table not migrated yet */ }

  // Ficha activa por tienda
  let fichaMap: Record<string, { id: string; codigo: string; totalNiveles: number }> = {}
  try {
    const fichaRows = await db.execute(sql`
      SELECT f.id, f.codigo, f.tienda_id,
             (SELECT count(*)::int FROM fichas_niveles fn WHERE fn.ficha_id = f.id) AS total_niveles
      FROM fichas f
      JOIN tiendas t ON t.ficha_activa_id = f.id
      WHERE t.proveedor_id = ${id}::uuid AND f.estado = 'ACTIVA'
    `)
    for (const r of fichaRows as any[]) if (r.tienda_id) fichaMap[r.tienda_id] = { id: r.id, codigo: r.codigo, totalNiveles: r.total_niveles }
  } catch { /* fichas table not migrated yet */ }

  return NextResponse.json(rows.map(t => ({
    ...t,
    ...(extMap[t.id] ?? { estadoServicio: 'ACTIVO', planAplicado: null, velocidad: null, fechaAltaServicio: null }),
    incidentes30d:      incMap[t.id]      ?? 0,
    contratoEspecifico: contratoMap[t.id] ?? null,
    fichaActiva:        fichaMap[t.id]    ?? null,
  })))
}
