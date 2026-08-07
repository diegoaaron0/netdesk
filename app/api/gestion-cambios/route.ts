import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accionesGestion, accionesGestionTiendas, tiendas, proveedores, usuarios } from '@/drizzle/schema'
import { eq, desc, and, count, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

const provAnterior = alias(proveedores, 'prov_anterior')
const provNuevo    = alias(proveedores, 'prov_nuevo')
const creadoPor    = alias(usuarios,    'creado_por')

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const tipo        = searchParams.get('tipo')
  const estado      = searchParams.get('estado')
  const tiendaId    = searchParams.get('tiendaId')
  const proveedorId = searchParams.get('proveedorId')

  const conds: any[] = []
  if (tipo)        conds.push(eq(accionesGestion.tipo,   tipo as any))
  if (estado)      conds.push(eq(accionesGestion.estado, estado as any))
  if (tiendaId)    conds.push(eq(accionesGestion.tiendaId, tiendaId))
  if (proveedorId) conds.push(eq(accionesGestion.proveedorNuevoId, proveedorId))

  const rows = await db.select({
    id:                       accionesGestion.id,
    codigo:                   accionesGestion.codigo,
    tipo:                     accionesGestion.tipo,
    estado:                   accionesGestion.estado,
    alcance:                  accionesGestion.alcance,
    titulo:                   accionesGestion.titulo,
    motivo:                   accionesGestion.motivo,
    zonaDescripcion:          accionesGestion.zonaDescripcion,
    fechaEjecucionPlanificada: accionesGestion.fechaEjecucionPlanificada,
    ejecutadoEn:              accionesGestion.ejecutadoEn,
    fechaEval30:              accionesGestion.fechaEval30,
    fechaEval90:              accionesGestion.fechaEval90,
    eval30Completada:         accionesGestion.eval30Completada,
    eval90Completada:         accionesGestion.eval90Completada,
    snapSlaPct:               accionesGestion.snapSlaPct,
    snapMttrMin:              accionesGestion.snapMttrMin,
    eval30SlaPct:             accionesGestion.eval30SlaPct,
    eval30MttrMin:            accionesGestion.eval30MttrMin,
    eval90SlaPct:             accionesGestion.eval90SlaPct,
    eval90MttrMin:            accionesGestion.eval90MttrMin,
    penalidadEstimada:        accionesGestion.penalidadEstimada,
    creadoEn:                 accionesGestion.creadoEn,
    actualizadoEn:            accionesGestion.actualizadoEn,
    tiendaId:                 accionesGestion.tiendaId,
    tiendaCodigo:             tiendas.codigo,
    tiendaNombre:             tiendas.nombreCc,
    tiendaDistrito:           tiendas.distrito,
    proveedorAnteriorNombre:  provAnterior.nombre,
    proveedorNuevoNombre:     provNuevo.nombre,
    creadoPorId:              accionesGestion.creadoPorId,
    creadoPorNombre:          creadoPor.nombre,
    creadoPorRol:             creadoPor.rol,
  })
    .from(accionesGestion)
    .leftJoin(tiendas,      eq(accionesGestion.tiendaId,            tiendas.id))
    .leftJoin(provAnterior, eq(accionesGestion.proveedorAnteriorId, provAnterior.id))
    .leftJoin(provNuevo,    eq(accionesGestion.proveedorNuevoId,    provNuevo.id))
    .leftJoin(creadoPor,    eq(accionesGestion.creadoPorId,         creadoPor.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(accionesGestion.creadoEn))

  // Para acciones de ZONA, adjuntar conteo de tiendas. Nota: antes esto usaba
  // SQL crudo con `= ANY(${ids}::uuid[])`, que el driver postgres-js no
  // serializa como literal de array de Postgres (falla con "literal de array
  // mal formado" en cuanto existe al menos una acción ZONA) — bug preexistente,
  // nunca antes ejercitado porque netdesk_test no tenía filas ZONA. inArray()
  // de drizzle-orm arma el parámetro correctamente.
  const ids = rows.filter(r => r.alcance === 'ZONA').map(r => r.id)
  let zonaCounts: Record<string, number> = {}
  if (ids.length) {
    const counts = await db.select({ accionId: accionesGestionTiendas.accionId, total: count() })
      .from(accionesGestionTiendas)
      .where(inArray(accionesGestionTiendas.accionId, ids))
      .groupBy(accionesGestionTiendas.accionId)
    for (const row of counts) {
      zonaCounts[row.accionId] = row.total
    }
  }

  return NextResponse.json(rows.map(r => ({
    ...r,
    nTiendas: r.alcance === 'ZONA' ? (zonaCounts[r.id] ?? 0) : 1,
  })))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const {
    tipo, titulo, descripcion, motivo, alcance,
    tiendaId, zonaDescripcion, tiendaIds,
    proveedorAnteriorId, proveedorNuevoId,
    routerExternoId,
    fechaEjecucionPlanificada,
    snapPeriodoDias, snapSlaPct, snapMttrMin, snapIei, snapNincidentes, snapDetalle,
  } = body

  if (!tipo || !titulo?.trim() || !motivo?.trim())
    return NextResponse.json({ error: 'tipo, titulo y motivo son requeridos' }, { status: 400 })
  if (alcance === 'ZONA' && (!tiendaIds?.length))
    return NextResponse.json({ error: 'Zona requiere al menos una tienda en tiendaIds' }, { status: 400 })
  if (alcance !== 'ZONA' && !tiendaId)
    return NextResponse.json({ error: 'tiendaId requerido para alcance TIENDA' }, { status: 400 })

  const creadoPorId = (session.user as any)?.id ?? (session.user as any)?.sub ?? null
  if (!creadoPorId) return NextResponse.json({ error: 'No se pudo identificar al usuario de la sesión' }, { status: 401 })

  try {
  // Valores base (el código se asigna en el loop con reintento)
  const baseValues = {
    tipo:                     tipo as any,
    estado:                   'BORRADOR' as const,
    alcance:                  (alcance ?? 'TIENDA') as any,
    titulo:                   titulo.trim(),
    descripcion:              descripcion?.trim() ?? null,
    motivo:                   motivo.trim(),
    zonaDescripcion:          zonaDescripcion?.trim() ?? null,
    tiendaId:                 alcance === 'ZONA' ? null : (tiendaId || null),
    proveedorAnteriorId:      proveedorAnteriorId || null,
    proveedorNuevoId:         proveedorNuevoId    || null,
    routerExternoId:          routerExternoId     || null,
    creadoPorId,
    fechaEjecucionPlanificada: fechaEjecucionPlanificada || null,
    snapPeriodoDias:          snapPeriodoDias  ?? 90,
    snapSlaPct:               snapSlaPct       ?? null,
    snapMttrMin:              snapMttrMin      ?? null,
    snapIei:                  snapIei          ?? null,
    snapNincidentes:          snapNincidentes  ?? null,
    snapDetalle:              snapDetalle      ?? null,
  }

  // Código robusto: MAX(número)+1 (no COUNT, que colisiona si hay borrados/huecos),
  // con reintento ante colisión del único (carreras o gaps).
  let accion: typeof accionesGestion.$inferSelect | undefined
  for (let attempt = 0; attempt < 5; attempt++) {
    const maxRows = await db.execute(sql`
      SELECT COALESCE(MAX(NULLIF(regexp_replace(codigo, '[^0-9]', '', 'g'), '')::int), 0) AS maxn
      FROM acciones_gestion
    `) as any[]
    const maxn = Number(maxRows[0]?.maxn ?? 0)
    const codigo = `AC-${String(maxn + 1 + attempt).padStart(3, '0')}`
    try {
      ;[accion] = await db.insert(accionesGestion).values({ codigo, ...baseValues }).returning()
      break
    } catch (e: any) {
      if (e?.code === '23505' && attempt < 4) continue // codigo duplicado → reintentar con el siguiente
      throw e
    }
  }
  if (!accion) return NextResponse.json({ error: 'No se pudo generar el código de la acción' }, { status: 500 })

  // Insertar tiendas para alcance ZONA
  if (alcance === 'ZONA' && tiendaIds?.length) {
    await db.insert(accionesGestionTiendas).values(
      (tiendaIds as string[]).map(tid => ({
        accionId:             accion.id,
        tiendaId:             tid,
        proveedorAnteriorId:  proveedorAnteriorId || null,
        proveedorNuevoId:     proveedorNuevoId    || null,
      }))
    )
  }

  return NextResponse.json(accion, { status: 201 })
  } catch (err: any) {
    console.error('[gestion-cambios POST]', err)
    return NextResponse.json({ error: err?.message ?? 'Error interno al crear la acción' }, { status: 500 })
  }
}
