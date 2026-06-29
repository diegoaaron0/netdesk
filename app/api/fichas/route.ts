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
      descripcionServicio: fichas.descripcionServicio,
      activadoEn:        fichas.activadoEn,
      archivadoEn:       fichas.archivadoEn,
      creadoEn:          fichas.creadoEn,
      totalNiveles:      sql<number>`(SELECT count(*)::int FROM fichas_niveles fn WHERE fn.ficha_id = ${fichas.id})`,
      nivelesStr:        sql<string | null>`(SELECT string_agg('N' || fn.nivel::text, ' ' ORDER BY fn.nivel) FROM fichas_niveles fn WHERE fn.ficha_id = ${fichas.id})`,
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

  const tienda = await db.select({ codigo: tiendas.codigo }).from(tiendas).where(eq(tiendas.id, tiendaId)).limit(1)
  if (!tienda.length) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  // Normaliza '' (campos vacíos del form) a null. Columnas date/numeric no aceptan ''.
  const nn = (v: any) => (v === '' || v === undefined ? null : v)

  const baseValues = {
    tiendaId,
    proveedorId,
    estado: 'BORRADOR' as const,
    codigoContrato:       nn(body.codigoContrato),
    plan:                 nn(body.plan),
    tipoServicio:         nn(body.tipoServicio),
    velocidadCapacidad:   nn(body.velocidadCapacidad),
    costoMensual:         nn(body.costoMensual),
    fechaInicio:          nn(body.fechaInicio),
    fechaFin:             nn(body.fechaFin),
    renovacionAutomatica: body.renovacionAutomatica ?? false,
    penalidad:            nn(body.penalidad),
    slaComprometido:      nn(body.slaComprometido),
    tiempoRespuestaSla:   nn(body.tiempoRespuestaSla),
    tiempoResolucionSla:  nn(body.tiempoResolucionSla),
    horarioAtencionSla:   nn(body.horarioAtencionSla),
    documentoUrl:         nn(body.documentoUrl),
    tipoConexion:         nn(body.tipoConexion),
    cidServicio:          nn(body.cidServicio),
    velocidad:            nn(body.velocidad),
    planAplicado:         nn(body.planAplicado),
    vigenciaContrato:     nn(body.vigenciaContrato),
    estadoServicio:       nn(body.estadoServicio) ?? 'ACTIVO',
    fechaAltaServicio:    nn(body.fechaAltaServicio),
    descripcionServicio:  nn(body.descripcionServicio),
    observacion:          nn(body.observacion),
    creadoPorId:          (session.user as any).id  ?? null,
  }

  // Código FC-NNN-{tienda}: NNN = MAX global + 1 (no count por tienda, que colisiona),
  // con reintento ante colisión del único.
  let nueva: typeof fichas.$inferSelect | undefined
  for (let attempt = 0; attempt < 5; attempt++) {
    const maxRows = await db.execute(sql`
      SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(codigo, '-', 2), '[^0-9]', '', 'g'), '')::int), 0) AS maxn
      FROM fichas
    `) as any[]
    const maxn = Number(maxRows[0]?.maxn ?? 0)
    const codigo = `FC-${String(maxn + 1 + attempt).padStart(3, '0')}-${tienda[0].codigo}`
    try {
      ;[nueva] = await db.insert(fichas).values({ codigo, ...baseValues }).returning()
      break
    } catch (e: any) {
      if (e?.code === '23505' && attempt < 4) continue
      throw e
    }
  }
  if (!nueva) return NextResponse.json({ error: 'No se pudo generar el código de la ficha' }, { status: 500 })

  return NextResponse.json(nueva, { status: 201 })
}
