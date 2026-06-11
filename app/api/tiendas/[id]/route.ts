import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tiendas, proveedores, incidentes, tiendasHistorial, fichas } from '@/drizzle/schema'
import { eq, count, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

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
    tieneContingencia: tiendas.tieneContingencia,
    contingenciaActiva: tiendas.contingenciaActiva,
    contingenciaActivadaPor: tiendas.contingenciaActivadaPor,
    contingenciaDescripcion: tiendas.contingenciaDescripcion,
    contingenciaFecha: tiendas.contingenciaFecha,
    instruccionReporte: tiendas.instruccionReporte,
    contactoSoporte: tiendas.contactoSoporte,
    administradorNombre: tiendas.administradorNombre,
    administradorEmail: tiendas.administradorEmail,
    administradorCelular: tiendas.administradorCelular,
    ventaHoraSoles: tiendas.ventaHoraSoles,
    ventaHoraFdsSoles: tiendas.ventaHoraFdsSoles,
    ventaMensualSoles: tiendas.ventaMensualSoles,
    proporcionFds: tiendas.proporcionFds,
    fuenteVentas: tiendas.fuenteVentas,
    tipoPersonalizadoHabilitado: tiendas.tipoPersonalizadoHabilitado,
    creadoEn: tiendas.creadoEn,
    fichaActivaId: tiendas.fichaActivaId,
  })
    .from(tiendas)
    .leftJoin(proveedores, eq(tiendas.proveedorId, proveedores.id))
    .where(eq(tiendas.id, id))

  if (!tienda) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Ficha activa (incluye campos de conectividad — ya no viven en tiendas)
  let fichaActiva: {
    id: string; codigo: string; totalNiveles: number
    cidServicio: string | null; tipoConexion: string | null; tipoServicio: string | null
    costoMensual: string | null; velocidad: string | null; planAplicado: string | null
    vigenciaContrato: string | null; estadoServicio: string | null
    fechaAltaServicio: string | null; descripcionServicio: string | null
  } | null = null
  if (tienda.fichaActivaId) {
    try {
      const [f] = await db.select({
        id:     fichas.id,
        codigo: fichas.codigo,
        totalNiveles:        sql<number>`(SELECT count(*)::int FROM fichas_niveles fn WHERE fn.ficha_id = ${fichas.id})`,
        cidServicio:         fichas.cidServicio,
        tipoConexion:        fichas.tipoConexion,
        tipoServicio:        fichas.tipoServicio,
        costoMensual:        fichas.costoMensual,
        velocidad:           fichas.velocidad,
        planAplicado:        fichas.planAplicado,
        vigenciaContrato:    fichas.vigenciaContrato,
        estadoServicio:      fichas.estadoServicio,
        fechaAltaServicio:   fichas.fechaAltaServicio,
        descripcionServicio: fichas.descripcionServicio,
      }).from(fichas).where(eq(fichas.id, tienda.fichaActivaId)).limit(1)
      if (f) fichaActiva = f
    } catch { /* fichas not migrated yet */ }
  }

  const [{ total }] = await db.select({ total: count() })
    .from(incidentes)
    .where(eq(incidentes.tiendaId, id))

  const movActiveRows = await db.execute<{ cnt: string }>(sql`
    SELECT COUNT(*)::int AS cnt FROM incidentes
    WHERE tienda_id = ${id}
      AND mov_activado_por IS NOT NULL
      AND mov_hora_desactivacion IS NULL
      AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
  `)
  const movCount = Number((movActiveRows[0] as any)?.cnt ?? 0)

  // Columnas nuevas (pueden no existir en producción hasta aplicar migración)
  let extended: Record<string, any> = {
    celularTienda: null, supervisorCelular: null,
    contingenciaChip: null, contingenciaPaquete: null,
    extras: null, gabinete: false, observacion: null,
    ventaHoraFdsSoles: null, ventaMensualSoles: null,
    proporcionFds: null, fuenteVentas: null,
  }
  try {
    const [ext] = await db.select({
      celularTienda:       tiendas.celularTienda,
      supervisorCelular:   tiendas.supervisorCelular,
      contingenciaChip:    tiendas.contingenciaChip,
      contingenciaPaquete: tiendas.contingenciaPaquete,
      extras:              tiendas.extras,
      gabinete:            tiendas.gabinete,
      observacion:         tiendas.observacion,
      ventaHoraFdsSoles:   tiendas.ventaHoraFdsSoles,
      ventaMensualSoles:   tiendas.ventaMensualSoles,
      proporcionFds:       tiendas.proporcionFds,
      fuenteVentas:        tiendas.fuenteVentas,
    }).from(tiendas).where(eq(tiendas.id, id))
    if (ext) extended = ext as any
  } catch {
    // columnas no migradas aún — se retornan null
  }

  // Métricas SLA (30d)
  let slaTienda: Record<string, any> = {
    scoreRespuestaPromedio: null, tRespuestaPromedio: null,
    scoreResolucionPromedio: null, tResolucionPromedio: null,
    totalEvaluables: 0,
  }
  try {
    const { calcSLARow } = await import('@/lib/sla-core')
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

    const slaRows = await db.execute(sql`
      SELECT i.tipo, i.hora_registro, i.hora_fin,
        n1.hora_correo_n1, resp.hora_primera_resp, max_n.max_nivel,
        contrato.sla_resp_override, contrato.sla_resol_override
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      LEFT JOIN LATERAL (
        SELECT MIN(hora_envio_correo) AS hora_correo_n1
        FROM escalamientos WHERE incidente_id = i.id AND hora_envio_correo IS NOT NULL
      ) n1 ON true
      LEFT JOIN LATERAL (
        SELECT hora_respuesta AS hora_primera_resp
        FROM escalamientos WHERE incidente_id = i.id AND hora_respuesta IS NOT NULL AND no_hubo_respuesta IS NOT TRUE
        ORDER BY hora_respuesta LIMIT 1
      ) resp ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(MAX(nivel), 0) AS max_nivel
        FROM escalamientos WHERE incidente_id = i.id
      ) max_n ON true
      LEFT JOIN LATERAL (
        SELECT tiempo_respuesta_sla  AS sla_resp_override,
               tiempo_resolucion_sla AS sla_resol_override
        FROM fichas
        WHERE id = COALESCE(i.ficha_id, t.ficha_activa_id)
        LIMIT 1
      ) contrato ON true
      WHERE i.tienda_id = ${id}
        AND i.hora_registro >= ${thirtyDaysAgoStr}::timestamptz
        AND i.estado = 'RESUELTO'
        AND i.evaluable_proveedor IS NOT FALSE
    `)

    let totalEsc = 0
    let scoreRespSum = 0
    let scoreResolSum = 0, scoreResolCount = 0
    let tRespSum = 0, tRespCount = 0
    let tResolSum = 0, tResolCount = 0
    for (const row of slaRows as any[]) {
      if (!row.hora_correo_n1) continue
      const res = calcSLARow({
        tipo: row.tipo,
        hora_correo_n1: row.hora_correo_n1,
        hora_primera_resp: row.hora_primera_resp,
        hora_fin: row.hora_fin ?? null,
        hora_registro: row.hora_registro ?? null,
        max_nivel: row.max_nivel ?? 1,
        slaRespuestaOverride: row.sla_resp_override ?? undefined,
        slaResolucionOverride: row.sla_resol_override ?? undefined,
      })
      if (!res.evaluable) continue
      totalEsc++
      scoreRespSum += res.scoreRespuesta ?? 0
      if (res.scoreResolucion != null) { scoreResolSum += res.scoreResolucion; scoreResolCount++ }
      if (res.tPrimeraRespuestaMin != null) { tRespSum += res.tPrimeraRespuestaMin; tRespCount++ }
      if (res.tResolucionMin != null) { tResolSum += res.tResolucionMin; tResolCount++ }
    }
    slaTienda = {
      scoreRespuestaPromedio:  totalEsc      > 0 ? Math.round(scoreRespSum  / totalEsc)       : null,
      tRespuestaPromedio:      tRespCount    > 0 ? Math.round(tRespSum      / tRespCount)      : null,
      scoreResolucionPromedio: scoreResolCount > 0 ? Math.round(scoreResolSum / scoreResolCount) : null,
      tResolucionPromedio:     tResolCount   > 0 ? Math.round(tResolSum     / tResolCount)     : null,
      totalEvaluables: totalEsc,
    }
  } catch { /* skip */ }

  return NextResponse.json({ ...tienda, ...extended, totalIncidentes: total, datosMovilesActivos: movCount > 0, slaTienda, fichaActiva })
}

// Campos que cambian solo al activar una ficha — no se trackean aquí
const TRACKED_FIELDS = [
  'celularTienda',
  'nombreCc', 'formato', 'direccion', 'referencia', 'distrito', 'provincia',
  'ubicacion', 'cluster', 'supervisorNombre', 'supervisorCelular', 'perfilSupervisor',
  'tieneContingencia', 'contingenciaActiva', 'contingenciaDescripcion',
  'contingenciaChip', 'contingenciaPaquete',
  'instruccionReporte', 'contactoSoporte', 'administradorNombre',
  'administradorEmail', 'administradorCelular', 'ventaHoraSoles', 'extras',
  'gabinete', 'observacion', 'ventaMensualSoles', 'ventaHoraFdsSoles',
] as const

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'mantenimiento.editar')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [current] = await db.select({
    id: tiendas.id, codigo: tiendas.codigo, nombreCc: tiendas.nombreCc,
    formato: tiendas.formato, direccion: tiendas.direccion, referencia: tiendas.referencia,
    distrito: tiendas.distrito, provincia: tiendas.provincia, ubicacion: tiendas.ubicacion,
    coordenadas: tiendas.coordenadas, cluster: tiendas.cluster,
    supervisorNombre: tiendas.supervisorNombre, perfilSupervisor: tiendas.perfilSupervisor,
    proveedorId: tiendas.proveedorId,
    tieneContingencia: tiendas.tieneContingencia, contingenciaActiva: tiendas.contingenciaActiva,
    contingenciaActivadaPor: tiendas.contingenciaActivadaPor,
    contingenciaDescripcion: tiendas.contingenciaDescripcion,
    contingenciaFecha: tiendas.contingenciaFecha,
    instruccionReporte: tiendas.instruccionReporte,
    contactoSoporte: tiendas.contactoSoporte, administradorNombre: tiendas.administradorNombre,
    administradorEmail: tiendas.administradorEmail, administradorCelular: tiendas.administradorCelular,
    ventaHoraSoles:      tiendas.ventaHoraSoles,
    ventaHoraFdsSoles:   tiendas.ventaHoraFdsSoles,
    ventaMensualSoles:   tiendas.ventaMensualSoles,
    proporcionFds:       tiendas.proporcionFds,
    fuenteVentas:        tiendas.fuenteVentas,
    celularTienda:       tiendas.celularTienda,
    supervisorCelular:   tiendas.supervisorCelular,
    contingenciaChip:    tiendas.contingenciaChip,
    contingenciaPaquete: tiendas.contingenciaPaquete,
    extras:              tiendas.extras,
    gabinete:            tiendas.gabinete,
    observacion:         tiendas.observacion,
  }).from(tiendas).where(eq(tiendas.id, id))
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const body = await req.json()

  // Recálculo automático cuando se edita venta mensual
  if ('ventaMensualSoles' in body && body.ventaMensualSoles != null) {
    const prop = parseFloat(current.proporcionFds ?? '0.5')
    const mensual = parseFloat(body.ventaMensualSoles)
    if (!isNaN(mensual) && mensual > 0) {
      const semanal = mensual * 7 / 30.44
      const horaLJ = (semanal * (1 - prop)) / 48
      const horaVD = (semanal * prop) / 36
      body.ventaHoraSoles    = horaLJ.toFixed(2)
      body.ventaHoraFdsSoles = horaVD.toFixed(2)
    }
  }

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
    tieneContingencia:    'tieneContingencia'    in body ? !!body.tieneContingencia               : current.tieneContingencia,
    contingenciaActiva:   'contingenciaActiva'   in body ? !!body.contingenciaActiva              : current.contingenciaActiva,
    contingenciaActivadaPor: 'contingenciaActivadaPor' in body ? (body.contingenciaActivadaPor ?? null) : current.contingenciaActivadaPor,
    contingenciaDescripcion: 'contingenciaDescripcion' in body ? (body.contingenciaDescripcion ?? null) : current.contingenciaDescripcion,
    contingenciaFecha:    'contingenciaFecha'    in body ? (body.contingenciaFecha ? new Date(body.contingenciaFecha) : null) : current.contingenciaFecha,
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
      celularTienda:       'celularTienda'       in body ? (body.celularTienda       ?? null) : current.celularTienda,
      supervisorCelular:   'supervisorCelular'   in body ? (body.supervisorCelular   ?? null) : current.supervisorCelular,
      contingenciaChip:    'contingenciaChip'    in body ? (body.contingenciaChip    ?? null) : current.contingenciaChip,
      contingenciaPaquete: 'contingenciaPaquete' in body ? (body.contingenciaPaquete ?? null) : current.contingenciaPaquete,
      extras:              'extras'              in body ? (body.extras              ?? null) : current.extras,
      gabinete:            'gabinete'            in body ? !!body.gabinete                    : current.gabinete,
      observacion:         'observacion'         in body ? (body.observacion         ?? null) : current.observacion,
      ventaHoraFdsSoles:   'ventaHoraFdsSoles'  in body ? (body.ventaHoraFdsSoles   ?? null) : current.ventaHoraFdsSoles,
      ventaMensualSoles:   'ventaMensualSoles'   in body ? (body.ventaMensualSoles   ?? null) : current.ventaMensualSoles,
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

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rol = (session.user as any)?.rol
  if (!['SUPERVISOR', 'INFRAESTRUCTURA'].includes(rol)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [{ total }] = await db.select({ total: count() })
    .from(incidentes)
    .where(eq(incidentes.tiendaId, id))

  if (total > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: la tienda tiene ${total} incidente(s) registrado(s).` },
      { status: 409 },
    )
  }

  await db.delete(tiendas).where(eq(tiendas.id, id))
  return NextResponse.json({ ok: true })
}
