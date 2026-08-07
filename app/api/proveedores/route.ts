import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { proveedores, tiendas, incidentes, escalamientos, fichas } from '@/drizzle/schema'
import { eq, gte, sql, and, isNotNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { logUnlessSchemaMissing } from '@/lib/db-errors'
import { slaProveedorJoins, slaRespuestaPctExpr, slaResolucionPctExpr } from '@/lib/sla-sql'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'proveedores.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const buscar     = searchParams.get('buscar')  ?? ''
  const planFiltro = searchParams.get('plan')    ?? ''
  const ordenar    = searchParams.get('ordenar') ?? ''

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

  // ── 1. Base proveedores (original columns only — safe) ──────────────────────
  const provsList = await db.select({
    id:                 proveedores.id,
    nombre:             proveedores.nombre,
    correoSoporte:      proveedores.correoSoporte,
    telefonoSoporte:    proveedores.telefonoSoporte,
    instruccionGeneral: proveedores.instruccionGeneral,
    creadoEn:           proveedores.creadoEn,
  }).from(proveedores).orderBy(proveedores.nombre)

  // ── 2. Extended columns (plan, canal, observaciones) ───────────────────────
  let extMap: Record<string, { planPrincipal: string | null; canalAtencion: string | null; observaciones: string | null }> = {}
  try {
    const extRows = await db.select({
      id:             proveedores.id,
      planPrincipal:  proveedores.planPrincipal,
      canalAtencion:  proveedores.canalAtencion,
      observaciones:  proveedores.observaciones,
    }).from(proveedores)
    for (const r of extRows) extMap[r.id] = r
  } catch (e) { logUnlessSchemaMissing('proveedores', e) }

  // ── 3. Tiendas aggregate per provider ──────────────────────────────────────
  let tMap: Record<string, { total: number; costoTotal: string }> = {}
  try {
    const tAgg = await db.select({
      proveedorId: tiendas.proveedorId,
      total:       sql<number>`count(*)::int`,
      costoTotal:  sql<string>`coalesce(sum(${fichas.costoMensual}::numeric), 0)::text`,
    }).from(tiendas)
      .leftJoin(fichas, eq(fichas.id, tiendas.fichaActivaId))
      .where(isNotNull(tiendas.proveedorId))
      .groupBy(tiendas.proveedorId)
    for (const t of tAgg) if (t.proveedorId) tMap[t.proveedorId] = { total: t.total, costoTotal: t.costoTotal }
  } catch (e) { logUnlessSchemaMissing('proveedores', e) }

  // ── 4. Incidentes 30d per provider ─────────────────────────────────────────
  let iMap: Record<string, number> = {}
  try {
    const iAgg = await db.select({
      proveedorId: incidentes.proveedorId,
      total:       sql<number>`count(*)::int`,
    }).from(incidentes)
      .where(and(gte(incidentes.horaRegistro, thirtyDaysAgo), isNotNull(incidentes.proveedorId)))
      .groupBy(incidentes.proveedorId)
    for (const i of iAgg) if (i.proveedorId) iMap[i.proveedorId] = i.total
  } catch (e) { logUnlessSchemaMissing('proveedores', e) }

  // ── 5. SLA Respuesta + SLA Resolución por proveedor (últimos 30d) ──────────
  // Ficha-aware: usa COALESCE(i.ficha_id, t.ficha_activa_id) vía lib/sla-sql.ts,
  // el mismo fragmento canónico que el detalle y el detalle proveedor↔tienda.
  let slaMap: Record<string, { respuesta: number | null; resolucion: number | null }> = {}
  try {
    const slaRows = await db.execute(sql`
      SELECT
        i.proveedor_id,
        ${sql.raw(slaRespuestaPctExpr())}  AS sla_respuesta_pct,
        ${sql.raw(slaResolucionPctExpr())} AS sla_resolucion_pct
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      ${sql.raw(slaProveedorJoins())}
      WHERE i.hora_registro >= ${thirtyDaysAgoStr}::timestamptz
        AND i.proveedor_id IS NOT NULL
      GROUP BY i.proveedor_id
    `)
    for (const r of slaRows as any[]) {
      if (!r.proveedor_id) continue
      slaMap[r.proveedor_id] = {
        respuesta:  r.sla_respuesta_pct  != null ? Number(r.sla_respuesta_pct)  : null,
        resolucion: r.sla_resolucion_pct != null ? Number(r.sla_resolucion_pct) : null,
      }
    }
  } catch (e) { logUnlessSchemaMissing('proveedores', e) }

  // ── Merge ───────────────────────────────────────────────────────────────────
  let result = provsList.map(p => ({
    ...p,
    ...(extMap[p.id] ?? { planPrincipal: null, canalAtencion: null, observaciones: null }),
    totalTiendas:  tMap[p.id]?.total     ?? 0,
    costoTotal:    tMap[p.id]?.costoTotal ?? '0',
    incidentes30d: iMap[p.id]            ?? 0,
    slaRespuesta:  slaMap[p.id]?.respuesta  ?? null as number | null,
    slaResolucion: slaMap[p.id]?.resolucion ?? null as number | null,
  }))

  // ── Filters ─────────────────────────────────────────────────────────────────
  if (buscar)     result = result.filter(p => p.nombre.toLowerCase().includes(buscar.toLowerCase()))
  if (planFiltro) result = result.filter(p => p.planPrincipal === planFiltro)

  // ── Sort ─────────────────────────────────────────────────────────────────────
  if      (ordenar === 'z-a')            result.sort((a, b) => b.nombre.localeCompare(a.nombre))
  else if (ordenar === 'mayor-costo')    result.sort((a, b) => Number(b.costoTotal) - Number(a.costoTotal))
  else if (ordenar === 'menor-costo')    result.sort((a, b) => Number(a.costoTotal) - Number(b.costoTotal))
  else if (ordenar === 'mas-tiendas')    result.sort((a, b) => b.totalTiendas - a.totalTiendas)
  else if (ordenar === 'mas-incidentes') result.sort((a, b) => b.incidentes30d - a.incidentes30d)
  else result.sort((a, b) => a.nombre.localeCompare(b.nombre))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'proveedores.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const body = await req.json()
  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: 'El nombre del proveedor es obligatorio' }, { status: 400 })
  }
  const baseValues: any = {
    nombre:             body.nombre.trim(),
    correoSoporte:      body.correoSoporte      ?? null,
    telefonoSoporte:    body.telefonoSoporte    ?? null,
    instruccionGeneral: body.instruccionGeneral ?? null,
  }
  try {
    const [p] = await db.insert(proveedores).values({
      ...baseValues,
      planPrincipal: body.planPrincipal ?? null,
      canalAtencion: body.canalAtencion ?? null,
      observaciones: body.observaciones ?? null,
    }).returning()
    return NextResponse.json(p, { status: 201 })
  } catch (e: any) {
    // 23505 = unique_violation (el nombre del proveedor es único)
    if (e?.code === '23505' || /unique|duplicate/i.test(e?.message ?? '')) {
      return NextResponse.json({ error: `Ya existe un proveedor llamado "${body.nombre.trim()}"` }, { status: 409 })
    }
    throw e
  }
}
