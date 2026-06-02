import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decisiones, tiendas, proveedores, usuarios, tiendasHistorial } from '@/drizzle/schema'
import { eq, desc, and } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

const COLS = {
  id:               decisiones.id,
  tipo:             decisiones.tipo,
  titulo:           decisiones.titulo,
  descripcion:      decisiones.descripcion,
  motivo:           decisiones.motivo,
  estado:           decisiones.estado,
  tiendaId:         decisiones.tiendaId,
  proveedorId:      decisiones.proveedorId,
  responsableId:    decisiones.responsableId,
  fechaSeguimiento: decisiones.fechaSeguimiento,
  snapSlaPct:       decisiones.snapSlaPct,
  snapMttrMinutos:  decisiones.snapMttrMinutos,
  snapIei:          decisiones.snapIei,
  snapIncidentes:   decisiones.snapIncidentes,
  snapPeriodo:      decisiones.snapPeriodo,
  creadoEn:         decisiones.creadoEn,
  actualizadoEn:    decisiones.actualizadoEn,
  tiendaCodigo:     tiendas.codigo,
  tiendaNombre:     tiendas.nombreCc,
  proveedorNombre:  proveedores.nombre,
  responsableNombre: usuarios.nombre,
  responsableRol:   usuarios.rol,
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'decisiones.ver'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const estado      = searchParams.get('estado')
  const tipo        = searchParams.get('tipo')
  const proveedorId = searchParams.get('proveedorId')
  const tiendaId    = searchParams.get('tiendaId')

  const conds = []
  if (estado)      conds.push(eq(decisiones.estado,      estado      as any))
  if (tipo)        conds.push(eq(decisiones.tipo,        tipo        as any))
  if (proveedorId) conds.push(eq(decisiones.proveedorId, proveedorId))
  if (tiendaId)    conds.push(eq(decisiones.tiendaId,    tiendaId))

  const rows = await db.select(COLS)
    .from(decisiones)
    .leftJoin(tiendas,     eq(decisiones.tiendaId,      tiendas.id))
    .leftJoin(proveedores, eq(decisiones.proveedorId,   proveedores.id))
    .leftJoin(usuarios,    eq(decisiones.responsableId, usuarios.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(decisiones.creadoEn))

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'decisiones.crear'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const {
    tipo, titulo, descripcion, motivo,
    tiendaId, proveedorId, proveedorAnteriorId, fechaSeguimiento,
    snapSlaPct, snapMttrMinutos, snapIei, snapIncidentes, snapPeriodo, snapDetalle,
  } = body

  if (!tipo || !titulo || !motivo)
    return NextResponse.json({ error: 'tipo, titulo y motivo son requeridos' }, { status: 400 })

  const responsableId = (session.user as any).id
  const userRol       = (session.user as any).rol
  // SUPERVISOR y GERENCIA no necesitan aprobación externa
  const estadoInicial = (userRol === 'GERENCIA' || userRol === 'SUPERVISOR') ? 'PENDIENTE' : 'PROPUESTO'

  try {
    const [dec] = await db.insert(decisiones).values({
      tipo,
      titulo,
      descripcion:         descripcion         ?? null,
      motivo,
      estado:              estadoInicial        as any,
      tiendaId:            tiendaId            || null,
      proveedorId:         proveedorId         || null,
      proveedorAnteriorId: proveedorAnteriorId || null,
      responsableId,
      fechaSeguimiento:    fechaSeguimiento    || null,
      snapSlaPct:          snapSlaPct          ?? null,
      snapMttrMinutos:     snapMttrMinutos     ?? null,
      snapIei:             snapIei             ?? null,
      snapIncidentes:      snapIncidentes      ?? null,
      snapPeriodo:         snapPeriodo         ?? null,
      snapDetalle:         snapDetalle         ?? null,
    }).returning()

    if (tiendaId) {
      await db.insert(tiendasHistorial).values({
        tiendaId,
        usuarioId:     responsableId,
        campoEditado:  'Decisión estratégica',
        valorAnterior: null,
        valorNuevo:    `[${estadoInicial}] ${tipo}: ${titulo}`,
      })
    }

    return NextResponse.json(dec, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/decisiones]', err)
    return NextResponse.json({ error: err?.message ?? 'Error interno al crear la decisión' }, { status: 500 })
  }
}
