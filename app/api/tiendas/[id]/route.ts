import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, proveedores, incidentes, tiendasHistorial } from '@/drizzle/schema'
import { eq, count, and, isNotNull, sql } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [tienda] = await db.select({
    id: tiendas.id,
    codigo: tiendas.codigo,
    nombreCc: tiendas.nombreCc,
    formato: tiendas.formato,
    direccion: tiendas.direccion,
    referencia: tiendas.referencia,
    distrito: tiendas.distrito,
    provincia: tiendas.provincia,
    ubicacion: tiendas.ubicacion,
    coordenadas: tiendas.coordenadas,
    cluster: tiendas.cluster,
    supervisorNombre: tiendas.supervisorNombre,
    perfilSupervisor: tiendas.perfilSupervisor,
    proveedorId: tiendas.proveedorId,
    proveedorNombre: proveedores.nombre,
    proveedorTelefono: proveedores.telefonoSoporte,
    proveedorCorreo: proveedores.correoSoporte,
    tipoConexion: tiendas.tipoConexion,
    tipoServicio: tiendas.tipoServicio,
    cidServicio: tiendas.cidServicio,
    tieneContingencia: tiendas.tieneContingencia,
    contingenciaActiva: tiendas.contingenciaActiva,
    contingenciaActivadaPor: tiendas.contingenciaActivadaPor,
    contingenciaDescripcion: tiendas.contingenciaDescripcion,
    contingenciaFecha: tiendas.contingenciaFecha,
    costoMensual: tiendas.costoMensual,
    instruccionReporte: tiendas.instruccionReporte,
    contactoSoporte: tiendas.contactoSoporte,
    administradorNombre: tiendas.administradorNombre,
    administradorEmail: tiendas.administradorEmail,
    administradorCelular: tiendas.administradorCelular,
    ventaHoraSoles: tiendas.ventaHoraSoles,
    tipoPersonalizadoHabilitado: tiendas.tipoPersonalizadoHabilitado,
    creadoEn: tiendas.creadoEn,
  })
    .from(tiendas)
    .leftJoin(proveedores, eq(tiendas.proveedorId, proveedores.id))
    .where(eq(tiendas.id, id))

  if (!tienda) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const [{ total }] = await db.select({ total: count() })
    .from(incidentes)
    .where(eq(incidentes.tiendaId, id))

  const [{ movCount }] = await db.select({ movCount: count() })
    .from(incidentes)
    .where(and(
      eq(incidentes.tiendaId, id),
      isNotNull(incidentes.movActivadoPor),
    ))

  // Columnas nuevas (pueden no existir en producción hasta aplicar migración)
  let extended: Record<string, string | null> = {
    celularTienda: null,
    supervisorCelular: null,
    contingenciaChip: null,
    contingenciaPaquete: null,
    extras: null,
  }
  try {
    const [ext] = await db.select({
      celularTienda: tiendas.celularTienda,
      supervisorCelular: tiendas.supervisorCelular,
      contingenciaChip: tiendas.contingenciaChip,
      contingenciaPaquete: tiendas.contingenciaPaquete,
      extras: tiendas.extras,
    }).from(tiendas).where(eq(tiendas.id, id))
    if (ext) extended = ext as any
  } catch {
    // columnas no migradas aún — se retornan null
  }

  return NextResponse.json({ ...tienda, ...extended, totalIncidentes: total, datosMovilesActivos: movCount > 0 })
}

const TRACKED_FIELDS = [
  'celularTienda',
  'nombreCc', 'formato', 'direccion', 'referencia', 'distrito', 'provincia',
  'ubicacion', 'cluster', 'supervisorNombre', 'supervisorCelular', 'perfilSupervisor',
  'tipoConexion', 'tipoServicio', 'cidServicio', 'tieneContingencia',
  'contingenciaActiva', 'contingenciaDescripcion', 'contingenciaChip', 'contingenciaPaquete',
  'costoMensual', 'instruccionReporte', 'contactoSoporte', 'administradorNombre',
  'administradorEmail', 'administradorCelular', 'proveedorId', 'ventaHoraSoles', 'extras',
] as const

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rol = (session.user as any)?.rol
  if (!['SUPERVISOR', 'INFRAESTRUCTURA'].includes(rol)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [current] = await db.select({
    id: tiendas.id, codigo: tiendas.codigo, nombreCc: tiendas.nombreCc,
    formato: tiendas.formato, direccion: tiendas.direccion, referencia: tiendas.referencia,
    distrito: tiendas.distrito, provincia: tiendas.provincia, ubicacion: tiendas.ubicacion,
    coordenadas: tiendas.coordenadas, cluster: tiendas.cluster,
    supervisorNombre: tiendas.supervisorNombre, perfilSupervisor: tiendas.perfilSupervisor,
    proveedorId: tiendas.proveedorId, tipoConexion: tiendas.tipoConexion,
    tipoServicio: tiendas.tipoServicio, cidServicio: tiendas.cidServicio,
    tieneContingencia: tiendas.tieneContingencia, contingenciaActiva: tiendas.contingenciaActiva,
    contingenciaActivadaPor: tiendas.contingenciaActivadaPor,
    contingenciaDescripcion: tiendas.contingenciaDescripcion,
    contingenciaFecha: tiendas.contingenciaFecha,
    costoMensual: tiendas.costoMensual, instruccionReporte: tiendas.instruccionReporte,
    contactoSoporte: tiendas.contactoSoporte, administradorNombre: tiendas.administradorNombre,
    administradorEmail: tiendas.administradorEmail, administradorCelular: tiendas.administradorCelular,
    ventaHoraSoles: tiendas.ventaHoraSoles,
  }).from(tiendas).where(eq(tiendas.id, id))
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const body = await req.json()
  const baseValues = {
    codigo:               body.codigo              ?? current.codigo,
    nombreCc:             'nombreCc'             in body ? (body.nombreCc             ?? null) : current.nombreCc,
    formato:              'formato'              in body ? (body.formato              ?? null) : current.formato,
    direccion:            'direccion'            in body ? (body.direccion            ?? null) : current.direccion,
    referencia:           'referencia'           in body ? (body.referencia           ?? null) : current.referencia,
    distrito:             'distrito'             in body ? (body.distrito             ?? null) : current.distrito,
    provincia:            'provincia'            in body ? (body.provincia            ?? null) : current.provincia,
    ubicacion:            'ubicacion'            in body ? (body.ubicacion            ?? null) : current.ubicacion,
    cluster:              'cluster'              in body ? (body.cluster              ?? null) : current.cluster,
    supervisorNombre:     'supervisorNombre'     in body ? (body.supervisorNombre     ?? null) : current.supervisorNombre,
    perfilSupervisor:     'perfilSupervisor'     in body ? (body.perfilSupervisor     ?? null) : current.perfilSupervisor,
    proveedorId:          'proveedorId'          in body ? (body.proveedorId          ?? null) : current.proveedorId,
    tipoConexion:         'tipoConexion'         in body ? (body.tipoConexion         ?? null) : current.tipoConexion,
    tipoServicio:         'tipoServicio'         in body ? (body.tipoServicio         ?? null) : current.tipoServicio,
    cidServicio:          'cidServicio'          in body ? (body.cidServicio          ?? null) : current.cidServicio,
    tieneContingencia:    'tieneContingencia'    in body ? !!body.tieneContingencia               : current.tieneContingencia,
    contingenciaActiva:   'contingenciaActiva'   in body ? !!body.contingenciaActiva              : current.contingenciaActiva,
    contingenciaActivadaPor: 'contingenciaActivadaPor' in body ? (body.contingenciaActivadaPor ?? null) : current.contingenciaActivadaPor,
    contingenciaDescripcion: 'contingenciaDescripcion' in body ? (body.contingenciaDescripcion ?? null) : current.contingenciaDescripcion,
    contingenciaFecha:    'contingenciaFecha'    in body ? (body.contingenciaFecha ? new Date(body.contingenciaFecha) : null) : current.contingenciaFecha,
    costoMensual:         'costoMensual'         in body ? (body.costoMensual         ?? null) : current.costoMensual,
    instruccionReporte:   'instruccionReporte'   in body ? (body.instruccionReporte   ?? null) : current.instruccionReporte,
    contactoSoporte:      'contactoSoporte'      in body ? (body.contactoSoporte      ?? null) : current.contactoSoporte,
    administradorNombre:  'administradorNombre'  in body ? (body.administradorNombre  ?? null) : current.administradorNombre,
    administradorEmail:   'administradorEmail'   in body ? (body.administradorEmail   ?? null) : current.administradorEmail,
    administradorCelular: 'administradorCelular' in body ? (body.administradorCelular ?? null) : current.administradorCelular,
    ventaHoraSoles:       'ventaHoraSoles'       in body ? (body.ventaHoraSoles       ?? null) : current.ventaHoraSoles,
  }

  let updated: any
  try {
    const fullValues = {
      ...baseValues,
      celularTienda:       'celularTienda'       in body ? (body.celularTienda       ?? null) : null,
      supervisorCelular:   'supervisorCelular'   in body ? (body.supervisorCelular   ?? null) : null,
      contingenciaChip:    'contingenciaChip'    in body ? (body.contingenciaChip    ?? null) : null,
      contingenciaPaquete: 'contingenciaPaquete' in body ? (body.contingenciaPaquete ?? null) : null,
      extras:              'extras'              in body ? (body.extras              ?? null) : null,
    }
    const [r] = await db.update(tiendas).set(fullValues).where(eq(tiendas.id, id)).returning()
    updated = r
  } catch {
    const [r] = await db.update(tiendas).set(baseValues).where(eq(tiendas.id, id)).returning()
    updated = r
  }

  const userId = (session.user as any)?.id
  const histRows: any[] = []
  for (const field of TRACKED_FIELDS) {
    const anterior = String((current as any)[field] ?? '')
    const nuevo = String((updated as any)[field] ?? '')
    if (anterior !== nuevo) {
      histRows.push({
        tiendaId: id,
        usuarioId: userId ?? null,
        campoEditado: field,
        valorAnterior: anterior || null,
        valorNuevo: nuevo || null,
      })
    }
  }
  if (histRows.length > 0) await db.insert(tiendasHistorial).values(histRows)

  // Si contingenciaActiva cambió a false → limpiar campos de contingencia en incidentes abiertos
  const contCambio = histRows.find((h: any) => h.campoEditado === 'contingenciaActiva')
  if (contCambio && updated.contingenciaActiva === false) {
    await db.execute(sql`
      UPDATE incidentes
      SET cont_activado_por    = NULL,
          cont_hora_activacion = NULL,
          cont_rendimiento     = NULL,
          cont_observacion     = NULL,
          actualizado_en       = NOW()
      WHERE tienda_id = ${id}
        AND cont_activado_por IS NOT NULL
        AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
    `)
  }

  return NextResponse.json(updated)
}
