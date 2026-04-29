import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, usuarios, proveedores } from '@/drizzle/schema'
import { eq, desc, and, gte, lt, sql, inArray } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

const OPEN_ESTADOS = ['ABIERTO', 'EN_SEGUIMIENTO', 'ESCALADO_N1', 'ESCALADO_N2', 'ESCALADO_N3']

function todayLima(): string {
  return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)
}

function limaDateRange(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return {
    start: new Date(Date.UTC(y, m - 1, d,     5, 0, 0, 0)),
    end:   new Date(Date.UTC(y, m - 1, d + 1, 5, 0, 0, 0)),
  }
}

const COLS = {
  id:             incidentes.id,
  codigo:         incidentes.codigo,
  tipo:           incidentes.tipo,
  estado:         incidentes.estado,
  nivelImpacto:   incidentes.nivelImpacto,
  ticketInvgate:  incidentes.ticketInvgate,
  horaRegistro:   incidentes.horaRegistro,
  horaFin:        incidentes.horaFin,
  mttrMinutos:    incidentes.mttrMinutos,
  tiendaCodigo:   tiendas.codigo,
  tiendaNombre:   tiendas.nombreCc,
  tiendaDistrito: tiendas.distrito,
  tiendaCluster:  tiendas.cluster,
  proveedorNombre:proveedores.nombre,
  agenteName:     usuarios.nombre,
  agenteId:       usuarios.id,
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const estado   = searchParams.get('estado')
  const agenteId = searchParams.get('agente')
  const fechaDesde = searchParams.get('fechaDesde') ?? todayLima()
  const fechaHasta = searchParams.get('fechaHasta') ?? fechaDesde

  const { start } = limaDateRange(fechaDesde)
  const { end }   = limaDateRange(fechaHasta)

  const rangeConds: any[] = [gte(incidentes.horaRegistro, start), lt(incidentes.horaRegistro, end)]
  if (estado)   rangeConds.push(eq(incidentes.estado, estado as any))
  if (agenteId) rangeConds.push(eq(incidentes.registradoPorId, agenteId))

  const overdueConds: any[] = [
    lt(incidentes.horaRegistro, start),
    inArray(incidentes.estado, OPEN_ESTADOS as any),
  ]

  const joins = (q: any) => q
    .leftJoin(tiendas,     eq(incidentes.tiendaId,         tiendas.id))
    .leftJoin(proveedores, eq(tiendas.proveedorId,         proveedores.id))
    .leftJoin(usuarios,    eq(incidentes.registradoPorId,  usuarios.id))

  const [regular, overdue] = await Promise.all([
    joins(db.select(COLS).from(incidentes)).where(and(...rangeConds)).orderBy(desc(incidentes.horaRegistro)),
    joins(db.select(COLS).from(incidentes)).where(and(...overdueConds)).orderBy(desc(incidentes.horaRegistro)),
  ])

  return NextResponse.json([
    ...overdue.map((i: any) => ({ ...i, isOverdue: true })),
    ...regular.map((i: any) => ({ ...i, isOverdue: false })),
  ])
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.crear')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

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
    tiendaId:              body.tiendaId,
    registradoPorId:       user.id,
    nivelImpacto:          body.nivelImpacto,
    usuariosAfectados:     body.usuariosAfectados ?? null,
    descripcionInicial:    body.descripcionInicial ?? null,
    tipo:                  body.tipo,
    estado:                body.estado ?? 'ABIERTO',
    ticketProveedor:       body.ticketProveedor ?? null,
    descartesRealizados:   body.descartesRealizados ?? null,
    solucionAplicada:      body.solucionAplicada ?? null,
    horaInicioSeguimiento: body.horaInicioSeguimiento ? new Date(body.horaInicioSeguimiento) : null,
    observaciones:         body.observaciones ?? null,
  }).returning()

  return NextResponse.json(inc, { status: 201 })
}
