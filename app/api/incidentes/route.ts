import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, usuarios, proveedores, gruposMasivos } from '@/drizzle/schema'
import { eq, desc, and, gte, lt, sql, inArray, ilike, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

// ─── Aliases ─────────────────────────────────────────────────────────────────
const provInc   = alias(proveedores, 'pi')   // proveedor histórico del incidente
const provTda   = alias(proveedores, 'pt')   // proveedor actual de la tienda (fallback)
const infraUser = alias(usuarios,    'iu')   // agente de infraestructura asignado

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
  tiendaId:       tiendas.id,
  tiendaCodigo:   tiendas.codigo,
  tiendaNombre:   tiendas.nombreCc,
  tiendaDistrito: tiendas.distrito,
  tiendaCluster:  tiendas.cluster,
  // COALESCE: primero el proveedor grabado en el incidente (histórico),
  // si es null usa el proveedor actual de la tienda (incidentes muy antiguos pre-módulo)
  proveedorNombre: sql<string>`COALESCE(pi.nombre, pt.nombre)`,
  agenteName:     usuarios.nombre,
  agenteId:       usuarios.id,
  resueltoPor:       incidentes.resueltoPor,
  contActivadoPor:        incidentes.contActivadoPor,
  contHoraDesactivacion:  incidentes.contHoraDesactivacion,
  tipoPersonalizado: incidentes.tipoPersonalizado,
  alcanceCorte:      incidentes.alcanceCorte,
  tuvoUps:           incidentes.tuvoUps,
  grupoMasivoId:     incidentes.grupoMasivoId,
  grupoMasivoCodigo: gruposMasivos.codigo,
  grupoMasivoRazon:  gruposMasivos.razon,
  escaladoInfraId:   incidentes.escaladoInfraId,
  infraNombre:       infraUser.nombre,
  infraApellido:     infraUser.apellido,
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const estado    = searchParams.get('estado')
  const agenteId  = searchParams.get('agente')
  const tiendaId  = searchParams.get('tiendaId')
  const q         = searchParams.get('q')
  const fechaDesde = searchParams.get('fechaDesde') ?? todayLima()
  const fechaHasta = searchParams.get('fechaHasta') ?? fechaDesde

  // Join con dos aliases de proveedores para el COALESCE histórico
  const joins = (q: any) => q
    .leftJoin(tiendas,        eq(incidentes.tiendaId,        tiendas.id))
    .leftJoin(provInc,        eq(incidentes.proveedorId,     provInc.id))
    .leftJoin(provTda,        eq(tiendas.proveedorId,        provTda.id))
    .leftJoin(usuarios,       eq(incidentes.registradoPorId, usuarios.id))
    .leftJoin(infraUser,      eq(incidentes.escaladoInfraId, infraUser.id))
    .leftJoin(gruposMasivos,  eq(incidentes.grupoMasivoId,   gruposMasivos.id))

  // Búsqueda por texto: ignora fechas, busca en toda la BD
  if (q) {
    const sq = `%${q.replace(/#/g, '').trim()}%`
    const results = await joins(db.select(COLS).from(incidentes))
      .where(or(
        ilike(incidentes.codigo, sq),
        ilike(incidentes.ticketInvgate, sq),
        ilike(tiendas.codigo, sq),
        ilike(tiendas.nombreCc, sq),
      ))
      .orderBy(desc(incidentes.horaRegistro))
      .limit(300)
    return NextResponse.json(results.map((i: any) => ({ ...i, isOverdue: false })))
  }

  const { start } = limaDateRange(fechaDesde)
  const { end }   = limaDateRange(fechaHasta)

  // Condiciones para incidentes del rango de fechas
  const rangeConds: any[] = [gte(incidentes.horaRegistro, start), lt(incidentes.horaRegistro, end)]
  if (estado)   rangeConds.push(eq(incidentes.estado, estado as any))
  if (agenteId) rangeConds.push(or(eq(incidentes.registradoPorId, agenteId), eq(incidentes.escaladoInfraId, agenteId)) as any)
  if (tiendaId) rangeConds.push(eq(incidentes.tiendaId, tiendaId))

  // Condiciones para incidentes vencidos (abiertos de días anteriores)
  const overdueConds: any[] = [
    lt(incidentes.horaRegistro, start),
    inArray(incidentes.estado, OPEN_ESTADOS as any),
  ]
  if (agenteId) overdueConds.push(or(eq(incidentes.registradoPorId, agenteId), eq(incidentes.escaladoInfraId, agenteId)) as any)
  if (tiendaId) overdueConds.push(eq(incidentes.tiendaId, tiendaId))

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

  const [tiendaRow] = await db.select({ proveedorId: tiendas.proveedorId })
    .from(tiendas).where(eq(tiendas.id, body.tiendaId))

  const [{ codigo }] = await db.execute<{ codigo: string }>(sql`
    SELECT lpad(nextval('netdesk_inc_seq')::text, 5, '0')
        || chr(65 + floor(random()*26)::int) AS codigo
  `)

  const [inc] = await db.insert(incidentes).values({
    codigo,
    tiendaId:              body.tiendaId,
    registradoPorId:       user.id,
    nivelImpacto:          body.nivelImpacto,
    usuariosAfectados:     body.usuariosAfectados ?? null,
    descripcionInicial:    body.descripcionInicial ?? null,
    tipo:                  body.tipo,
    tipoPersonalizado:     body.tipoPersonalizado  ?? null,
    otrosClasificacion:    body.tipo === 'OTROS' ? (body.otrosClasificacion ?? null) : null,
    proveedorId:           body.tipo === 'CORTE_ELECTRICO' ? null : (tiendaRow?.proveedorId ?? null),
    evaluableProveedor:    body.tipo === 'CORTE_ELECTRICO' ? false : true,
    alcanceCorte:          body.tipo === 'CORTE_ELECTRICO' ? (body.alcanceCorte ?? 'SOLO_TIENDA') : null,
    tuvoUps:               body.tipo === 'CORTE_ELECTRICO' ? (body.tuvoUps ?? false) : null,
    estado:                body.estado ?? 'ABIERTO',
    ticketProveedor:       body.ticketProveedor ?? null,
    descartesRealizados:   body.descartesRealizados ?? null,
    solucionAplicada:      body.solucionAplicada ?? null,
    horaInicioSeguimiento: body.horaInicioSeguimiento ? new Date(body.horaInicioSeguimiento) : null,
    observaciones:         body.observaciones ?? null,
  }).returning()

  return NextResponse.json(inc, { status: 201 })
}
