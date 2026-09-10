import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, usuarios, proveedores, gruposMasivos, tipoIncidenteEnum } from '@/drizzle/schema'
import { eq, desc, and, gte, lt, sql, inArray, ilike, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { getTramosPorIncidentes, normalizarMitigaciones, type IncidenteMitigacionInput } from '@/lib/mitigacion-tramos'

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
  contHoraActivacion:     incidentes.contHoraActivacion,
  contHoraDesactivacion:  incidentes.contHoraDesactivacion,
  contRendimiento:        incidentes.contRendimiento,
  contEsExterno:          incidentes.contEsExterno,
  tipoPersonalizado: incidentes.tipoPersonalizado,
  alcanceCorte:      incidentes.alcanceCorte,
  tuvoUps:           incidentes.tuvoUps,
  grupoMasivoId:     incidentes.grupoMasivoId,
  grupoMasivoCodigo: gruposMasivos.codigo,
  grupoMasivoRazon:  gruposMasivos.razon,
  escaladoInfraId:   incidentes.escaladoInfraId,
  infraNombre:       infraUser.nombre,
  infraApellido:     infraUser.apellido,
  movActivadoPor:       incidentes.movActivadoPor,
  movHoraActivacion:    incidentes.movHoraActivacion,
  movHoraDesactivacion: incidentes.movHoraDesactivacion,
  movRendimiento:       incidentes.movRendimiento,
  boletaManual:         incidentes.boletaManual,
  motivoReabertura:     incidentes.motivoReabertura,
  mitigacionesPrevias:  incidentes.mitigacionesPrevias,
}

// Fase 5, Paso 2.2 — qué mitigación real (router/datos móviles) está activa
// AHORA para un lote de incidentes, con tramos y fallback legacy en un solo
// bloque (evita N+1: una sola query de tramos para toda la página). La badge
// de Boleta sigue leyendo boletaManual directo — no se toca en este paso.
async function conMitigacionesActivas<T extends IncidenteMitigacionInput & { id: string }>(rows: T[]): Promise<(T & { mitigacionesActivas: string[] })[]> {
  const tramosPorIncidente = await getTramosPorIncidentes(rows.map(r => r.id))
  return rows.map(r => {
    const segmentos = normalizarMitigaciones(r, tramosPorIncidente.get(r.id) ?? [])
    const activas = segmentos
      .filter(s => s.hasta === null && (s.tipo === 'ROUTER_PROPIO' || s.tipo === 'ROUTER_EXTERNO' || s.tipo === 'DATOS_MOVILES'))
      .map(s => s.tipo)
    return { ...r, mitigacionesActivas: activas }
  })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

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
    const conMitigacion = await conMitigacionesActivas(results as any[])
    return NextResponse.json(conMitigacion.map((i: any) => ({ ...i, isOverdue: false })))
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

  const [regularConMitigacion, overdueConMitigacion] = await Promise.all([
    conMitigacionesActivas(regular as any[]),
    conMitigacionesActivas(overdue as any[]),
  ])

  return NextResponse.json([
    ...overdueConMitigacion.map((i: any) => ({ ...i, isOverdue: true })),
    ...regularConMitigacion.map((i: any) => ({ ...i, isOverdue: false })),
  ])
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.crear')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()

  if (!tipoIncidenteEnum.enumValues.includes(body.tipo)) {
    return NextResponse.json({ error: `Tipo de incidente inválido: "${body.tipo}"` }, { status: 400 })
  }

  const [user] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, session.user!.email!))
  if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const [tiendaRow] = await db.select({ proveedorId: tiendas.proveedorId, fichaActivaId: tiendas.fichaActivaId, estado: tiendas.estado })
    .from(tiendas).where(eq(tiendas.id, body.tiendaId))

  if (tiendaRow?.estado === 'ARCHIVADA')
    return NextResponse.json({ error: 'La tienda está archivada (dada de baja). No se pueden registrar incidentes nuevos.' }, { status: 409 })

  const values = {
    tiendaId:              body.tiendaId,
    registradoPorId:       user.id,
    nivelImpacto:          body.nivelImpacto,
    usuariosAfectados:     body.usuariosAfectados ?? null,
    descripcionInicial:    body.descripcionInicial ?? null,
    tipo:                  body.tipo,
    tipoPersonalizado:     body.tipoPersonalizado  ?? null,
    otrosClasificacion:    body.tipo === 'OTROS' ? (body.otrosClasificacion ?? null) : null,
    // proveedorId y fichaId quedan CONGELADOS al momento de crear el incidente
    // (snapshot del proveedor/ficha vigente de la tienda en este instante).
    // Es intencional, no un bug: si la tienda cambia de proveedor mientras este
    // incidente sigue abierto, el incidente se mantiene asociado al proveedor
    // con el que fue abierto (ver COALESCE histórico en incidentes/[id]/route.ts
    // y en la lista/dashboard/reportes). Y como fichaId también queda congelado,
    // los contactos de escalamiento que se muestran (nivelesProveedor, derivados
    // de fichaId) son los vigentes al abrir el caso — si el proveedor cambia sus
    // contactos mientras el incidente sigue abierto, este NO se entera; preserva
    // a quién se le escaló realmente en su momento.
    proveedorId:           body.tipo === 'CORTE_ELECTRICO' ? null : (tiendaRow?.proveedorId ?? null),
    fichaId:               body.tipo === 'CORTE_ELECTRICO' ? null : (tiendaRow?.fichaActivaId ?? null),
    // Corte eléctrico NUNCA es evaluable para el proveedor de internet, sin
    // excepción — decisión de negocio fija, aunque el corte hubiera coincidido
    // con una falla real de conectividad. La causa raíz no es la red.
    evaluableProveedor:    body.tipo === 'CORTE_ELECTRICO' ? false : true,
    alcanceCorte:          body.tipo === 'CORTE_ELECTRICO' ? (body.alcanceCorte ?? 'SOLO_TIENDA') : null,
    tuvoUps:               body.tipo === 'CORTE_ELECTRICO' ? (body.tuvoUps ?? false) : null,
    estado:                body.estado ?? 'ABIERTO',
    ticketProveedor:       body.ticketProveedor ?? null,
    descartesRealizados:   body.descartesRealizados ?? null,
    solucionAplicada:      body.solucionAplicada ?? null,
    observaciones:         body.observaciones ?? null,
  }

  // Retry hasta 5 veces si hay colisión de código único (secuencia desfasada)
  let inc: any
  for (let attempt = 0; attempt < 5; attempt++) {
    const [{ codigo }] = await db.execute<{ codigo: string }>(sql`
      SELECT lpad(nextval('netdesk_inc_seq')::text, 5, '0')
          || chr(65 + floor(random()*26)::int) AS codigo
    `)
    try {
      ;[inc] = await db.insert(incidentes).values({ codigo, ...values }).returning()
      break
    } catch (e: any) {
      if (e?.code === '23505' && attempt < 4) continue
      return NextResponse.json({ error: 'Error al generar código de incidente' }, { status: 500 })
    }
  }

  return NextResponse.json(inc, { status: 201 })
}
