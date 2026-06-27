import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { proveedores, tiendas, incidentes, escalamientos, fichas } from '@/drizzle/schema'
import { eq, gte, sql, and, isNotNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { logUnlessSchemaMissing } from '@/lib/db-errors'
import { SLA_RESPUESTA_MIN, SLA_RESOLUCION_DEFAULT_MIN } from '@/lib/sla-core'

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
  const SLA_RESP_SEG  = SLA_RESPUESTA_MIN * 60
  const SLA_RESOL_SEG = SLA_RESOLUCION_DEFAULT_MIN * 60
  let slaMap: Record<string, { respuesta: number | null; resolucion: number | null }> = {}
  try {
    const slaRows = await db.execute(sql`
      SELECT
        i.proveedor_id,
        count(*) filter (
          where n1.hora_correo_n1 IS NOT NULL
        ) AS total_escalados,
        count(*) filter (
          where n1.hora_correo_n1 IS NOT NULL
            AND resp.hora_primera_resp IS NOT NULL
            AND EXTRACT(epoch FROM (resp.hora_primera_resp - n1.hora_correo_n1)) <= ${SLA_RESP_SEG}
        ) AS resp_ok,
        count(*) filter (
          where n1.hora_correo_n1 IS NOT NULL
            AND resp.hora_primera_resp IS NOT NULL
            AND i.hora_fin IS NOT NULL
        ) AS total_resolvibles,
        count(*) filter (
          where n1.hora_correo_n1 IS NOT NULL
            AND resp.hora_primera_resp IS NOT NULL
            AND i.hora_fin IS NOT NULL
            AND EXTRACT(epoch FROM (i.hora_fin - resp.hora_primera_resp)) <= ${SLA_RESOL_SEG}
        ) AS resol_ok
      FROM incidentes i
      LEFT JOIN LATERAL (
        SELECT MIN(hora_envio_correo) AS hora_correo_n1
        FROM   escalamientos
        WHERE  incidente_id = i.id AND hora_envio_correo IS NOT NULL
      ) n1 ON true
      LEFT JOIN LATERAL (
        SELECT hora_respuesta AS hora_primera_resp
        FROM   escalamientos
        WHERE  incidente_id = i.id AND hora_respuesta IS NOT NULL AND no_hubo_respuesta IS NOT TRUE
        ORDER  BY hora_respuesta LIMIT 1
      ) resp ON true
      WHERE i.hora_registro >= ${thirtyDaysAgoStr}::timestamptz
        AND i.estado = 'RESUELTO'
        AND i.proveedor_id IS NOT NULL
        AND i.evaluable_proveedor IS NOT FALSE
      GROUP BY i.proveedor_id
    `)
    for (const r of slaRows as any[]) {
      if (!r.proveedor_id) continue
      const te = Number(r.total_escalados), ro = Number(r.resp_ok)
      const tr = Number(r.total_resolvibles), resOk = Number(r.resol_ok)
      slaMap[r.proveedor_id] = {
        respuesta:  te > 0 ? Math.round((ro   / te) * 100) : null,
        resolucion: tr > 0 ? Math.round((resOk / tr) * 100) : null,
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
