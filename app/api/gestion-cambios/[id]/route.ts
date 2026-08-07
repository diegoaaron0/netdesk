import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  accionesGestion, accionesGestionTiendas,
  tiendas, proveedores, usuarios, routersExternos, fichas,
} from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

const provAnterior = alias(proveedores, 'prov_anterior')
const provNuevo    = alias(proveedores, 'prov_nuevo')
const fichaNueva   = alias(fichas,      'ficha_nueva')
const creadoPor    = alias(usuarios,    'creado_por')
const aprobadoPor  = alias(usuarios,    'aprobado_por')
const ejecutadoPor = alias(usuarios,    'ejecutado_por')

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [accion] = await db.select({
    id:                       accionesGestion.id,
    codigo:                   accionesGestion.codigo,
    tipo:                     accionesGestion.tipo,
    estado:                   accionesGestion.estado,
    alcance:                  accionesGestion.alcance,
    titulo:                   accionesGestion.titulo,
    descripcion:              accionesGestion.descripcion,
    motivo:                   accionesGestion.motivo,
    zonaDescripcion:          accionesGestion.zonaDescripcion,
    fechaEjecucionPlanificada: accionesGestion.fechaEjecucionPlanificada,
    aprobadoEn:               accionesGestion.aprobadoEn,
    notasAprobacion:          accionesGestion.notasAprobacion,
    rechazadoMotivo:          accionesGestion.rechazadoMotivo,
    ejecutadoEn:              accionesGestion.ejecutadoEn,
    notasEjecucion:           accionesGestion.notasEjecucion,
    fechaEval30:              accionesGestion.fechaEval30,
    fechaEval90:              accionesGestion.fechaEval90,
    eval30Completada:         accionesGestion.eval30Completada,
    eval30Fecha:              accionesGestion.eval30Fecha,
    eval30SlaPct:             accionesGestion.eval30SlaPct,
    eval30MttrMin:            accionesGestion.eval30MttrMin,
    eval30Iei:                accionesGestion.eval30Iei,
    eval30Nincidentes:        accionesGestion.eval30Nincidentes,
    eval30Detalle:            accionesGestion.eval30Detalle,
    eval30Nota:               accionesGestion.eval30Nota,
    eval90Completada:         accionesGestion.eval90Completada,
    eval90Fecha:              accionesGestion.eval90Fecha,
    eval90SlaPct:             accionesGestion.eval90SlaPct,
    eval90MttrMin:            accionesGestion.eval90MttrMin,
    eval90Iei:                accionesGestion.eval90Iei,
    eval90Nincidentes:        accionesGestion.eval90Nincidentes,
    eval90Detalle:            accionesGestion.eval90Detalle,
    eval90Nota:               accionesGestion.eval90Nota,
    snapPeriodoDias:          accionesGestion.snapPeriodoDias,
    snapSlaPct:               accionesGestion.snapSlaPct,
    snapMttrMin:              accionesGestion.snapMttrMin,
    snapIei:                  accionesGestion.snapIei,
    snapNincidentes:          accionesGestion.snapNincidentes,
    snapDetalle:              accionesGestion.snapDetalle,
    penalidadEstimada:        accionesGestion.penalidadEstimada,
    inputTienda:              accionesGestion.inputTienda,
    creadoEn:                 accionesGestion.creadoEn,
    actualizadoEn:            accionesGestion.actualizadoEn,
    // Tienda
    tiendaId:                 accionesGestion.tiendaId,
    tiendaCodigo:             tiendas.codigo,
    tiendaNombre:             tiendas.nombreCc,
    tiendaDistrito:           tiendas.distrito,
    tiendaCluster:            tiendas.cluster,
    tiendaVentaHoraSoles:     tiendas.ventaHoraSoles,
    tiendaVentaHoraFdsSoles:  tiendas.ventaHoraFdsSoles,
    tiendaTieneContingencia:  tiendas.tieneContingencia,
    // Proveedores
    proveedorAnteriorId:      accionesGestion.proveedorAnteriorId,
    proveedorAnteriorNombre:  provAnterior.nombre,
    proveedorNuevoId:         accionesGestion.proveedorNuevoId,
    proveedorNuevoNombre:     provNuevo.nombre,
    // Ficha adjunta (se elige al proponer, se activa al ejecutar)
    fichaNuevaId:             accionesGestion.fichaNuevaId,
    fichaNuevaCodigo:         fichaNueva.codigo,
    // Router
    routerExternoId:          accionesGestion.routerExternoId,
    routerCodigo:             routersExternos.codigo,
    routerEstado:             routersExternos.estado,
    // Personas
    creadoPorId:              accionesGestion.creadoPorId,
    creadoPorNombre:          creadoPor.nombre,
    creadoPorRol:             creadoPor.rol,
    aprobadoPorId:            accionesGestion.aprobadoPorId,
    aprobadoPorNombre:        aprobadoPor.nombre,
    ejecutadoPorId:           accionesGestion.ejecutadoPorId,
    ejecutadoPorNombre:       ejecutadoPor.nombre,
  })
    .from(accionesGestion)
    .leftJoin(tiendas,         eq(accionesGestion.tiendaId,            tiendas.id))
    .leftJoin(provAnterior,    eq(accionesGestion.proveedorAnteriorId, provAnterior.id))
    .leftJoin(provNuevo,       eq(accionesGestion.proveedorNuevoId,    provNuevo.id))
    .leftJoin(fichaNueva,      eq(accionesGestion.fichaNuevaId,        fichaNueva.id))
    .leftJoin(routersExternos, eq(accionesGestion.routerExternoId,     routersExternos.id))
    .leftJoin(creadoPor,       eq(accionesGestion.creadoPorId,         creadoPor.id))
    .leftJoin(aprobadoPor,     eq(accionesGestion.aprobadoPorId,       aprobadoPor.id))
    .leftJoin(ejecutadoPor,    eq(accionesGestion.ejecutadoPorId,      ejecutadoPor.id))
    .where(eq(accionesGestion.id, id))

  if (!accion) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Tiendas del scope (alcance ZONA)
  const tiendasScope = await db.select({
    id:                   accionesGestionTiendas.id,
    tiendaId:             accionesGestionTiendas.tiendaId,
    tiendaCodigo:         tiendas.codigo,
    tiendaNombre:         tiendas.nombreCc,
    tiendaDistrito:       tiendas.distrito,
    tiendaCluster:        tiendas.cluster,
    proveedorAnteriorId:  accionesGestionTiendas.proveedorAnteriorId,
    proveedorNuevoId:     accionesGestionTiendas.proveedorNuevoId,
    snapDetalle:          accionesGestionTiendas.snapDetalle,
    eval30Detalle:        accionesGestionTiendas.eval30Detalle,
    eval90Detalle:        accionesGestionTiendas.eval90Detalle,
    ejecutada:            accionesGestionTiendas.ejecutada,
  })
    .from(accionesGestionTiendas)
    .leftJoin(tiendas, eq(accionesGestionTiendas.tiendaId, tiendas.id))
    .where(eq(accionesGestionTiendas.accionId, id))

  return NextResponse.json({ ...accion, tiendasScope })
}

const EDITABLE = new Set([
  'tipo', 'alcance',
  'titulo', 'descripcion', 'motivo', 'zonaDescripcion',
  'tiendaId', 'proveedorAnteriorId', 'proveedorNuevoId',
  'fechaEjecucionPlanificada', 'notasEjecucion',
  'snapPeriodoDias', 'snapSlaPct', 'snapMttrMin', 'snapIei', 'snapNincidentes', 'snapDetalle',
  'inputTienda', 'routerExternoId',
])

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()

  // Solo editable en BORRADOR
  const [current] = await db.select({ estado: accionesGestion.estado })
    .from(accionesGestion).where(eq(accionesGestion.id, id))
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (current.estado !== 'BORRADOR')
    return NextResponse.json({ error: 'Solo se puede editar en estado BORRADOR' }, { status: 409 })

  // Mismo bloqueo temporal que POST /api/gestion-cambios: no depende solo de
  // que el botón esté oculto — PUT también podría usarse para cambiar el
  // alcance de un borrador existente a ZONA.
  if (body.alcance === 'ZONA')
    return NextResponse.json({ error: 'Alcance por zona no disponible temporalmente.' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (EDITABLE.has(key)) patch[key] = body[key] ?? null
  }
  patch.actualizadoEn = new Date()

  const [updated] = await db.update(accionesGestion)
    .set(patch as any)
    .where(eq(accionesGestion.id, id))
    .returning()

  // Re-sincronizar tiendas de scope (alcance ZONA): se reemplazan por completo
  if (Array.isArray(body.tiendaIds)) {
    await db.delete(accionesGestionTiendas).where(eq(accionesGestionTiendas.accionId, id))
    if (body.alcance === 'ZONA' && body.tiendaIds.length > 0) {
      await db.insert(accionesGestionTiendas).values(
        (body.tiendaIds as string[]).map(tid => ({
          accionId:            id,
          tiendaId:            tid,
          proveedorAnteriorId: body.proveedorAnteriorId || null,
          proveedorNuevoId:    body.proveedorNuevoId    || null,
        }))
      )
    }
  }

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [current] = await db.select({ estado: accionesGestion.estado, creadoPorId: accionesGestion.creadoPorId })
    .from(accionesGestion).where(eq(accionesGestion.id, id))
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (current.estado !== 'BORRADOR')
    return NextResponse.json({ error: 'Solo se pueden eliminar borradores' }, { status: 409 })

  const userId  = (session.user as any)?.id
  const userRol = (session.user as any)?.rol ?? ''
  const esSupervisorOGerencia = ['SUPERVISOR', 'GERENCIA', 'DEMO'].includes(userRol)
  const esCreador = current.creadoPorId === userId

  if (!esCreador && !esSupervisorOGerencia)
    return NextResponse.json({ error: 'Sin permiso para eliminar este borrador' }, { status: 403 })

  await db.delete(accionesGestionTiendas).where(eq(accionesGestionTiendas.accionId, id))
  await db.delete(accionesGestion).where(eq(accionesGestion.id, id))

  return NextResponse.json({ ok: true })
}
