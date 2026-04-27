import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, usuarios, proveedores } from '@/drizzle/schema'
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const estado = searchParams.get('estado')
  const agenteId = searchParams.get('agente')
  const fecha = searchParams.get('fecha')

  const userRol = (session.user as any)?.rol
  const userId = (session.user as any)?.id

  const conditions = []

  if (userRol === 'AGENTE' && userId) {
    const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, session.user!.email!))
    if (u) conditions.push(eq(incidentes.registradoPorId, u.id))
  }

  if (estado) conditions.push(eq(incidentes.estado, estado as any))
  if (agenteId) conditions.push(eq(incidentes.registradoPorId, agenteId))
  if (fecha) {
    const day = new Date(fecha)
    const next = new Date(day); next.setDate(next.getDate() + 1)
    conditions.push(gte(incidentes.horaRegistro, day), lte(incidentes.horaRegistro, next))
  }

  const data = await db.select({
    id: incidentes.id,
    codigo: incidentes.codigo,
    tipo: incidentes.tipo,
    estado: incidentes.estado,
    nivelImpacto: incidentes.nivelImpacto,
    horaRegistro: incidentes.horaRegistro,
    horaFin: incidentes.horaFin,
    mttrMinutos: incidentes.mttrMinutos,
    tiendaCodigo: tiendas.codigo,
    tiendaNombre: tiendas.nombreCc,
    tiendaDistrito: tiendas.distrito,
    tiendaCluster: tiendas.cluster,
    proveedorNombre: proveedores.nombre,
    agenteName: usuarios.nombre,
    agenteId: usuarios.id,
  })
    .from(incidentes)
    .leftJoin(tiendas, eq(incidentes.tiendaId, tiendas.id))
    .leftJoin(proveedores, eq(tiendas.proveedorId, proveedores.id))
    .leftJoin(usuarios, eq(incidentes.registradoPorId, usuarios.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(incidentes.horaRegistro))

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()

  const [user] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, session.user!.email!))
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(incidentes)
  const seq = String(Number(count) + 1).padStart(5, '0')
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let codigo = ''
  for (let i = 0; i < 10; i++) {
    const letter = letters[Math.floor(Math.random() * 26)]
    const candidate = `${seq}${letter}`
    const [existing] = await db.select({ id: incidentes.id }).from(incidentes).where(eq(incidentes.codigo, candidate))
    if (!existing) { codigo = candidate; break }
  }
  if (!codigo) return NextResponse.json({ error: 'No se pudo generar código único' }, { status: 500 })

  const [inc] = await db.insert(incidentes).values({
    codigo,
    tiendaId: body.tiendaId,
    registradoPorId: user.id,
    nivelImpacto: body.nivelImpacto,
    usuariosAfectados: body.usuariosAfectados ?? null,
    descripcionInicial: body.descripcionInicial ?? null,
    tipo: body.tipo,
    estado: body.estado ?? 'ABIERTO',
    ticketProveedor: body.ticketProveedor ?? null,
    descartesRealizados: body.descartesRealizados ?? null,
    solucionAplicada: body.solucionAplicada ?? null,
    horaInicioSeguimiento: body.horaInicioSeguimiento ? new Date(body.horaInicioSeguimiento) : null,
    observaciones: body.observaciones ?? null,
  }).returning()

  return NextResponse.json(inc, { status: 201 })
}
