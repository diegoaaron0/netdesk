import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fichas, tiendas, proveedores } from '@/drizzle/schema'
import { eq, and, ilike, inArray, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.ver')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const tiendaId    = searchParams.get('tiendaId')    ?? null
  const proveedorId = searchParams.get('proveedorId') ?? null
  const estado      = searchParams.get('estado')      ?? null
  const buscar      = searchParams.get('buscar')      ?? null

  const conditions = []
  if (tiendaId)    conditions.push(eq(fichas.tiendaId, tiendaId))
  if (proveedorId) conditions.push(eq(fichas.proveedorId, proveedorId))
  if (estado)      conditions.push(eq(fichas.estado, estado as 'BORRADOR' | 'ACTIVA' | 'HISTORICA'))
  if (buscar)      conditions.push(ilike(fichas.codigo, `%${buscar}%`))

  const rows = await db
    .select({
      id:                fichas.id,
      codigo:            fichas.codigo,
      tiendaId:          fichas.tiendaId,
      tiendaCodigo:      tiendas.codigo,
      tiendaNombreCc:    tiendas.nombreCc,
      proveedorId:       fichas.proveedorId,
      proveedorNombre:   proveedores.nombre,
      estado:            fichas.estado,
      plan:              fichas.plan,
      tipoServicio:      fichas.tipoServicio,
      costoMensual:      fichas.costoMensual,
      fechaInicio:       fichas.fechaInicio,
      fechaFin:          fichas.fechaFin,
      slaComprometido:   fichas.slaComprometido,
      tipoConexion:      fichas.tipoConexion,
      cidServicio:       fichas.cidServicio,
      velocidad:         fichas.velocidad,
      estadoServicio:    fichas.estadoServicio,
      activadoEn:        fichas.activadoEn,
      archivadoEn:       fichas.archivadoEn,
      creadoEn:          fichas.creadoEn,
      totalNiveles:      sql<number>`(SELECT count(*)::int FROM fichas_niveles fn WHERE fn.ficha_id = ${fichas.id})`,
    })
    .from(fichas)
    .innerJoin(tiendas, eq(fichas.tiendaId, tiendas.id))
    .innerJoin(proveedores, eq(fichas.proveedorId, proveedores.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(fichas.creadoEn)

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { tiendaId, proveedorId } = body

  if (!tiendaId || !proveedorId) {
    return NextResponse.json({ error: 'tiendaId y proveedorId son obligatorios' }, { status: 400 })
  }

  // Generar código: FC-NNN-{codigoTienda}
  const tienda = await db.select({ codigo: tiendas.codigo }).from(tiendas).where(eq(tiendas.id, tiendaId)).limit(1)
  if (!tienda.length) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fichas)
    .where(eq(fichas.tiendaId, tiendaId))
  const n = (countResult[0]?.count ?? 0) + 1
  const codigo = `FC-${String(n).padStart(3, '0')}-${tienda[0].codigo}`

  const [nueva] = await db.insert(fichas).values({
    codigo,
    tiendaId,
    proveedorId,
    estado: 'BORRADOR',
    codigoContrato:       body.codigoContrato       ?? null,
    plan:                 body.plan                 ?? null,
    tipoServicio:         body.tipoServicio         ?? null,
    velocidadCapacidad:   body.velocidadCapacidad   ?? null,
    costoMensual:         body.costoMensual         ?? null,
    fechaInicio:          body.fechaInicio          ?? null,
    fechaFin:             body.fechaFin             ?? null,
    renovacionAutomatica: body.renovacionAutomatica ?? false,
    penalidad:            body.penalidad            ?? null,
    slaComprometido:      body.slaComprometido      ?? null,
    tiempoRespuestaSla:   body.tiempoRespuestaSla   ?? null,
    tiempoResolucionSla:  body.tiempoResolucionSla  ?? null,
    horarioAtencionSla:   body.horarioAtencionSla   ?? null,
    documentoUrl:         body.documentoUrl         ?? null,
    tipoConexion:         body.tipoConexion         ?? null,
    cidServicio:          body.cidServicio          ?? null,
    velocidad:            body.velocidad            ?? null,
    planAplicado:         body.planAplicado         ?? null,
    vigenciaContrato:     body.vigenciaContrato     ?? null,
    estadoServicio:       body.estadoServicio       ?? 'ACTIVO',
    fechaAltaServicio:    body.fechaAltaServicio    ?? null,
    descripcionServicio:  body.descripcionServicio  ?? null,
    observacion:          body.observacion          ?? null,
    creadoPorId:          (session.user as any).id  ?? null,
  }).returning()

  return NextResponse.json(nueva, { status: 201 })
}
