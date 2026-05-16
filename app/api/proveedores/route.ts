import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { proveedores, tiendas, incidentes, escalamientos, contratosProveedor } from '@/drizzle/schema'
import { eq, gte, sql, and, isNotNull, desc } from 'drizzle-orm'
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

const RANK: Record<string, number> = { VENCIDO: 2, POR_VENCER: 1, VIGENTE: 0 }

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const buscar       = searchParams.get('buscar')        ?? ''
  const tipoServicio = searchParams.get('tipoServicio')  ?? ''
  const estadoFiltro = searchParams.get('estadoContrato') ?? ''
  const planFiltro   = searchParams.get('plan')          ?? ''
  const ordenar      = searchParams.get('ordenar')       ?? ''

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

  // ── 2. New columns (may not exist yet in Railway) ───────────────────────────
  let extMap: Record<string, { tipoServicio: string | null; planPrincipal: string | null; canalAtencion: string | null; observaciones: string | null; estadoContrato: string | null }> = {}
  try {
    const extRows = await db.select({
      id:             proveedores.id,
      tipoServicio:   proveedores.tipoServicio,
      planPrincipal:  proveedores.planPrincipal,
      canalAtencion:  proveedores.canalAtencion,
      observaciones:  proveedores.observaciones,
      estadoContrato: proveedores.estadoContrato,
    }).from(proveedores)
    for (const r of extRows) extMap[r.id] = r
  } catch { /* columns not migrated yet */ }

  // ── 3. Tiendas aggregate per provider ──────────────────────────────────────
  let tMap: Record<string, { total: number; costoTotal: string }> = {}
  try {
    const tAgg = await db.select({
      proveedorId: tiendas.proveedorId,
      total:       sql<number>`count(*)::int`,
      costoTotal:  sql<string>`coalesce(sum(costo_mensual::numeric), 0)::text`,
    }).from(tiendas)
      .where(isNotNull(tiendas.proveedorId))
      .groupBy(tiendas.proveedorId)
    for (const t of tAgg) if (t.proveedorId) tMap[t.proveedorId] = { total: t.total, costoTotal: t.costoTotal }
  } catch { /* skip */ }

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
  } catch { /* skip */ }

  // ── 5. SLA aggregate per provider ──────────────────────────────────────────
  let slaMap: Record<string, number> = {}
  try {
    const slaRows = await db.execute(sql`
      SELECT i.proveedor_id,
        count(*) filter (where e.estado_cronometro in ('RESPONDIDO','VENCIDO')) as total_closed,
        count(*) filter (where e.estado_cronometro = 'RESPONDIDO')              as respondidos
      FROM escalamientos e
      JOIN incidentes i ON e.incidente_id = i.id
      WHERE e.hora_envio_correo >= ${thirtyDaysAgoStr}::timestamptz
        AND i.proveedor_id IS NOT NULL
      GROUP BY i.proveedor_id
    `)
    for (const r of slaRows as any[]) {
      const tc = Number(r.total_closed), resp = Number(r.respondidos)
      if (tc > 0 && r.proveedor_id) slaMap[r.proveedor_id] = Math.round((resp / tc) * 100)
    }
  } catch { /* skip */ }

  // ── 6. Contratos per provider (may not exist yet) ───────────────────────────
  let cMap: Record<string, { estado: string; plan: string | null }> = {}
  try {
    const contratosRows = await db.select({
      proveedorId: contratosProveedor.proveedorId,
      fechaFin:    contratosProveedor.fechaFin,
      plan:        contratosProveedor.plan,
    }).from(contratosProveedor)
      .orderBy(desc(contratosProveedor.creadoEn))
    for (const c of contratosRows) {
      const est = calcEstado(c.fechaFin)
      const ex  = cMap[c.proveedorId]
      if (!ex || (RANK[est] ?? 0) > (RANK[ex.estado] ?? 0)) {
        cMap[c.proveedorId] = { estado: est, plan: c.plan }
      }
    }
  } catch { /* contratos table not migrated yet */ }

  // ── Merge ───────────────────────────────────────────────────────────────────
  let result = provsList.map(p => ({
    ...p,
    ...(extMap[p.id] ?? { tipoServicio: null, planPrincipal: null, canalAtencion: null, observaciones: null, estadoContrato: null }),
    totalTiendas:       tMap[p.id]?.total     ?? 0,
    costoTotal:         tMap[p.id]?.costoTotal ?? '0',
    incidentes30d:      iMap[p.id]            ?? 0,
    slaPromedio:        slaMap[p.id]          ?? null as number | null,
    estadoContratoCalc: cMap[p.id]?.estado    ?? 'VIGENTE',
    planContrato:       cMap[p.id]?.plan      ?? null as string | null,
  }))

  // ── Filters ─────────────────────────────────────────────────────────────────
  if (buscar)       result = result.filter(p => p.nombre.toLowerCase().includes(buscar.toLowerCase()))
  if (tipoServicio) result = result.filter(p => p.tipoServicio === tipoServicio)
  if (estadoFiltro) result = result.filter(p => p.estadoContratoCalc === estadoFiltro)
  if (planFiltro)   result = result.filter(p => p.planContrato === planFiltro || p.planPrincipal === planFiltro)

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
  if (!['SUPERVISOR', 'INFRAESTRUCTURA'].includes((session.user as any)?.rol)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const baseValues: any = {
    nombre:             body.nombre,
    correoSoporte:      body.correoSoporte      ?? null,
    telefonoSoporte:    body.telefonoSoporte    ?? null,
    instruccionGeneral: body.instruccionGeneral ?? null,
  }
  let p: any
  try {
    const [r] = await db.insert(proveedores).values({
      ...baseValues,
      tipoServicio:   body.tipoServicio   ?? null,
      planPrincipal:  body.planPrincipal  ?? null,
      canalAtencion:  body.canalAtencion  ?? null,
      observaciones:  body.observaciones  ?? null,
      estadoContrato: body.estadoContrato ?? 'VIGENTE',
    }).returning()
    p = r
  } catch {
    const [r] = await db.insert(proveedores).values(baseValues).returning()
    p = r
  }
  return NextResponse.json(p, { status: 201 })
}
