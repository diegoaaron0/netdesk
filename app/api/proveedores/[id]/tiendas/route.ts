import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, fichas } from '@/drizzle/schema'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { logUnlessSchemaMissing } from '@/lib/db-errors'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'proveedores.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const thirtyDaysAgo    = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

  // Base columns
  const rows = await db.select({
    id:                tiendas.id,
    codigo:            tiendas.codigo,
    nombreCc:          tiendas.nombreCc,
    referencia:        tiendas.referencia,
    distrito:          tiendas.distrito,
    provincia:         tiendas.provincia,
    cluster:           tiendas.cluster,
    tieneContingencia: tiendas.tieneContingencia,
    contingenciaActiva: tiendas.contingenciaActiva,
  }).from(tiendas)
    .where(eq(tiendas.proveedorId, id))
    .orderBy(tiendas.codigo)

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
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]/tiendas', e) }

  // Ficha activa por tienda (incluye campos de conectividad)
  let fichaMap: Record<string, any> = {}
  try {
    const fichaRows = await db.execute(sql`
      SELECT f.id, f.codigo, f.tienda_id,
             f.cid_servicio, f.tipo_conexion, f.tipo_servicio, f.costo_mensual,
             f.velocidad, f.plan_aplicado, f.descripcion_servicio,
             f.vigencia_contrato, f.fecha_alta_servicio, f.estado_servicio,
             f.tiempo_respuesta_sla, f.tiempo_resolucion_sla,
             (SELECT count(*)::int FROM fichas_niveles fn WHERE fn.ficha_id = f.id) AS total_niveles
      FROM fichas f
      JOIN tiendas t ON t.ficha_activa_id = f.id
      WHERE t.proveedor_id = ${id}::uuid AND f.estado = 'ACTIVA'
    `)
    for (const r of fichaRows as any[]) if (r.tienda_id) fichaMap[r.tienda_id] = r
  } catch (e) { logUnlessSchemaMissing('proveedores/[id]/tiendas', e) }

  return NextResponse.json(rows.map(t => ({
    ...t,
    cidServicio:         fichaMap[t.id]?.cid_servicio         ?? null,
    tipoConexion:        fichaMap[t.id]?.tipo_conexion         ?? null,
    tipoServicio:        fichaMap[t.id]?.tipo_servicio         ?? null,
    costoMensual:        fichaMap[t.id]?.costo_mensual         ?? null,
    velocidad:           fichaMap[t.id]?.velocidad             ?? null,
    planAplicado:        fichaMap[t.id]?.plan_aplicado         ?? null,
    descripcionServicio: fichaMap[t.id]?.descripcion_servicio  ?? null,
    vigenciaContrato:    fichaMap[t.id]?.vigencia_contrato     ?? null,
    fechaAltaServicio:   fichaMap[t.id]?.fecha_alta_servicio   ?? null,
    estadoServicio:      fichaMap[t.id]?.estado_servicio       ?? null,
    incidentes30d:       incMap[t.id] ?? 0,
    fichaActiva:         fichaMap[t.id]
      ? { id: fichaMap[t.id].id, codigo: fichaMap[t.id].codigo, totalNiveles: fichaMap[t.id].total_niveles }
      : null,
    contratoEspecifico:  (fichaMap[t.id]?.tiempo_respuesta_sla != null || fichaMap[t.id]?.tiempo_resolucion_sla != null)
      ? { tiempo_respuesta_sla: fichaMap[t.id].tiempo_respuesta_sla, tiempo_resolucion_sla: fichaMap[t.id].tiempo_resolucion_sla }
      : null,
  })))
}
