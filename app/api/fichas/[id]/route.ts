import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fichas, fichasNiveles, tiendas, proveedores, usuarios } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.ver')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [row] = await db
    .select({
      id:                   fichas.id,
      codigo:               fichas.codigo,
      tiendaId:             fichas.tiendaId,
      tiendaCodigo:         tiendas.codigo,
      tiendaNombreCc:       tiendas.nombreCc,
      proveedorId:          fichas.proveedorId,
      proveedorNombre:      proveedores.nombre,
      estado:               fichas.estado,
      codigoContrato:       fichas.codigoContrato,
      plan:                 fichas.plan,
      tipoServicio:         fichas.tipoServicio,
      velocidadCapacidad:   fichas.velocidadCapacidad,
      costoMensual:         fichas.costoMensual,
      fechaInicio:          fichas.fechaInicio,
      fechaFin:             fichas.fechaFin,
      renovacionAutomatica: fichas.renovacionAutomatica,
      penalidad:            fichas.penalidad,
      slaComprometido:      fichas.slaComprometido,
      tiempoRespuestaSla:   fichas.tiempoRespuestaSla,
      tiempoResolucionSla:  fichas.tiempoResolucionSla,
      horarioAtencionSla:   fichas.horarioAtencionSla,
      documentoUrl:         fichas.documentoUrl,
      tipoConexion:         fichas.tipoConexion,
      cidServicio:          fichas.cidServicio,
      velocidad:            fichas.velocidad,
      planAplicado:         fichas.planAplicado,
      vigenciaContrato:     fichas.vigenciaContrato,
      estadoServicio:       fichas.estadoServicio,
      fechaAltaServicio:    fichas.fechaAltaServicio,
      descripcionServicio:  fichas.descripcionServicio,
      observacion:          fichas.observacion,
      creadoPorId:          fichas.creadoPorId,
      creadoPorNombre:      usuarios.nombre,
      activadoEn:           fichas.activadoEn,
      archivadoEn:          fichas.archivadoEn,
      creadoEn:             fichas.creadoEn,
    })
    .from(fichas)
    .innerJoin(tiendas, eq(fichas.tiendaId, tiendas.id))
    .innerJoin(proveedores, eq(fichas.proveedorId, proveedores.id))
    .leftJoin(usuarios, eq(fichas.creadoPorId, usuarios.id))
    .where(eq(fichas.id, id))
    .limit(1)

  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const niveles = await db
    .select()
    .from(fichasNiveles)
    .where(eq(fichasNiveles.fichaId, id))
    .orderBy(fichasNiveles.nivel)

  return NextResponse.json({ ...row, niveles })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'gestion-cambios.crear')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [existing] = await db.select({ id: fichas.id, estado: fichas.estado }).from(fichas).where(eq(fichas.id, id)).limit(1)
  if (!existing) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const body = await req.json()

  // No se puede editar estado directamente con PUT — usar PATCH /estado
  const { estado: _estado, ...rest } = body

  const allowed: Record<string, unknown> = {}
  const fields = [
    'codigoContrato', 'plan', 'tipoServicio', 'velocidadCapacidad', 'costoMensual',
    'fechaInicio', 'fechaFin', 'renovacionAutomatica', 'penalidad', 'slaComprometido',
    'tiempoRespuestaSla', 'tiempoResolucionSla', 'horarioAtencionSla', 'documentoUrl',
    'tipoConexion', 'cidServicio', 'velocidad', 'planAplicado', 'vigenciaContrato',
    'estadoServicio', 'fechaAltaServicio', 'descripcionServicio', 'observacion',
    'proveedorId',
  ] as const

  for (const f of fields) {
    if (f in rest) allowed[f] = rest[f]
  }

  // Coercionar campos integer: string vacío → null, string numérico → Number
  for (const intField of ['costoMensual', 'tiempoRespuestaSla', 'tiempoResolucionSla'] as const) {
    if (intField in allowed) {
      const v = allowed[intField]
      allowed[intField] = (v === '' || v == null) ? null : Number(v)
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const [updated] = await db.update(fichas).set(allowed as any).where(eq(fichas.id, id)).returning()
  return NextResponse.json(updated)
}
