import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, proveedores, usuarios, escalamientos, nivelesEscalamiento, adjuntos, atcLlamadas, tiendasHistorial, gruposMasivos } from '@/drizzle/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

const infraUser = alias(usuarios, 'infra_user')

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [inc] = await db.select({
    id: incidentes.id,
    codigo: incidentes.codigo,
    tipo: incidentes.tipo,
    estado: incidentes.estado,
    nivelImpacto: incidentes.nivelImpacto,
    usuariosAfectados: incidentes.usuariosAfectados,
    descripcionInicial: incidentes.descripcionInicial,
    ticketInvgate: incidentes.ticketInvgate,
    ticketProveedor: incidentes.ticketProveedor,
    descartesRealizados: incidentes.descartesRealizados,
    solucionAplicada: incidentes.solucionAplicada,
    horaRegistro: incidentes.horaRegistro,
    horaInicioSeguimiento: incidentes.horaInicioSeguimiento,
    horaFin: incidentes.horaFin,
    mttrMinutos: incidentes.mttrMinutos,
    observaciones: incidentes.observaciones,
    reabiertaInfo:      incidentes.reabiertaInfo,
    tipoPersonalizado:  incidentes.tipoPersonalizado,
    otrosClasificacion: incidentes.otrosClasificacion,
    actualizadoEn:      incidentes.actualizadoEn,
    // Tienda → siempre el estado actual (dirección, CID, instrucción pueden cambiar y está bien)
    tiendaId:                tiendas.id,
    tiendaCodigo:            tiendas.codigo,
    tiendaNombre:            tiendas.nombreCc,
    tiendaDireccion:         tiendas.direccion,
    tiendaDistrito:          tiendas.distrito,
    tiendaCid:               tiendas.cidServicio,
    tiendaTipoConexion:      tiendas.tipoConexion,
    tiendaCluster:           tiendas.cluster,
    tiendaAdminCelular:      tiendas.administradorCelular,
    tiendaReferencia:        tiendas.referencia,
    tiendaInstruccion:       tiendas.instruccionReporte,
    tiendaTieneContingencia: tiendas.tieneContingencia,
    // Operación / gestión
    estadoOperacion:     incidentes.estadoOperacion,
    operacionManual:     incidentes.operacionManual,
    tipoOperacionManual: incidentes.tipoOperacionManual,
    factorOperativo:     incidentes.factorOperativo,
    contActivadoPor:        incidentes.contActivadoPor,
    contHoraActivacion:     incidentes.contHoraActivacion,
    contRendimiento:        incidentes.contRendimiento,
    contObservacion:        incidentes.contObservacion,
    contEsExterno:          incidentes.contEsExterno,
    contHoraDesactivacion:  incidentes.contHoraDesactivacion,
    movActivadoPor:         incidentes.movActivadoPor,
    movHoraActivacion:      incidentes.movHoraActivacion,
    movRendimiento:         incidentes.movRendimiento,
    movObservacion:         incidentes.movObservacion,
    movHoraDesactivacion:   incidentes.movHoraDesactivacion,
    descEnergia:         incidentes.descEnergia,
    descRouter:          incidentes.descRouter,
    descDns:             incidentes.descDns,
    checkIpconfig:       incidentes.checkIpconfig,
    checkPingGw:         incidentes.checkPingGw,
    checkPingInternet:   incidentes.checkPingInternet,
    checkTracert:        incidentes.checkTracert,
    checkDns:            incidentes.checkDns,
    checkRenovarIp:      incidentes.checkRenovarIp,
    descartesDetallado:  incidentes.descartesDetallado,
    resueltoPor:         incidentes.resueltoPor,
    atribucionFinal:     incidentes.atribucionFinal,
    evaluableProveedor:  incidentes.evaluableProveedor,
    boletaManual:        incidentes.boletaManual,
    ventaParcial:        incidentes.ventaParcial,
    cajasAfectadas:      incidentes.cajasAfectadas,
    cajasTotales:        incidentes.cajasTotales,
    alcanceCorte:        incidentes.alcanceCorte,
    tuvoUps:             incidentes.tuvoUps,
    grupoMasivoId:       incidentes.grupoMasivoId,
    // Escalamiento infra interna
    escaladoInfraId:      incidentes.escaladoInfraId,
    horaEscaladoInfra:    incidentes.horaEscaladoInfra,
    notaEscaladoInfra:    incidentes.notaEscaladoInfra,
    infraNombre:          infraUser.nombre,
    infraApellido:        infraUser.apellido,
    infraEmail:           infraUser.email,
    infraCelular:         infraUser.celular,
    // Proveedor → via incidentes.proveedorId (registro histórico del momento del incidente)
    // Esto garantiza que si la tienda cambia de proveedor en el futuro, el incidente
    // sigue mostrando quién era el proveedor responsable cuando ocurrió.
    proveedorId:          incidentes.proveedorId,
    proveedorNombre:      proveedores.nombre,
    proveedorInstruccion: proveedores.instruccionGeneral,
    proveedorTelefono:    proveedores.telefonoSoporte,
    agenteNombre: usuarios.nombre,
    agenteEmail:  usuarios.email,
  })
    .from(incidentes)
    .leftJoin(tiendas,     eq(incidentes.tiendaId,       tiendas.id))
    .leftJoin(proveedores,  eq(incidentes.proveedorId,    proveedores.id))
    .leftJoin(usuarios,    eq(incidentes.registradoPorId, usuarios.id))
    .leftJoin(infraUser,   eq(incidentes.escaladoInfraId, infraUser.id))
    .where(eq(incidentes.id, id))

  if (!inc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const escs = await db.select().from(escalamientos)
    .where(eq(escalamientos.incidenteId, id))

  let atcMap: Record<string, any[]> = {}
  if (escs.length > 0) {
    const atcs = await db.select().from(atcLlamadas)
      .where(inArray(atcLlamadas.escalamientoId, escs.map((e: any) => e.id)))
    for (const atc of atcs) {
      if (!atcMap[atc.escalamientoId]) atcMap[atc.escalamientoId] = []
      atcMap[atc.escalamientoId].push(atc)
    }
  }

  // Niveles del proveedor registrado en el incidente → los que corresponden al momento del incidente.
  // Si el proveedor cambió sus niveles de escalamiento después, el incidente sigue usando
  // los niveles actuales del proveedor histórico (que son los vigentes para ese proveedor hoy).
  let nivelesProveedor: any[] = []
  if (inc.proveedorId) {
    nivelesProveedor = await db.select({
      id:              nivelesEscalamiento.id,
      nivel:           nivelesEscalamiento.nivel,
      nombreContacto:  nivelesEscalamiento.nombreContacto,
      email:           nivelesEscalamiento.email,
      celular:         nivelesEscalamiento.celular,
      tiempoRespSev1:  nivelesEscalamiento.tiempoRespSev1,
    }).from(nivelesEscalamiento)
      .where(eq(nivelesEscalamiento.proveedorId, inc.proveedorId))
  }

  // Grupo masivo: fetch group info + other linked incidents if present
  let grupoMasivo: any = null
  if (inc.grupoMasivoId) {
    const [gm] = await db.select().from(gruposMasivos).where(eq(gruposMasivos.id, inc.grupoMasivoId))
    if (gm) {
      const linked = await db.select({
        id:           incidentes.id,
        codigo:       incidentes.codigo,
        estado:       incidentes.estado,
        tipo:         incidentes.tipo,
        horaRegistro: incidentes.horaRegistro,
        tiendaCodigo: tiendas.codigo,
        tiendaNombre: tiendas.nombreCc,
      })
        .from(incidentes)
        .leftJoin(tiendas, eq(incidentes.tiendaId, tiendas.id))
        .where(eq(incidentes.grupoMasivoId, inc.grupoMasivoId))
      grupoMasivo = { ...gm, incidentes: linked }
    }
  }

  return NextResponse.json({
    ...inc,
    escalamientos: escs.map((e: any) => ({ ...e, atcLlamadas: atcMap[e.id] ?? [] })),
    nivelesProveedor,
    grupoMasivo,
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const allowedFields: Record<string, any> = {}
  const editable = [
    'estado','nivelImpacto','usuariosAfectados','tipo','tipoPersonalizado','otrosClasificacion',
    'descripcionInicial','ticketInvgate','ticketProveedor','descartesRealizados','solucionAplicada',
    'horaInicioSeguimiento','observaciones','horaRegistro','horaFin','mttrMinutos',
    'estadoOperacion','operacionManual','tipoOperacionManual','factorOperativo',
    'contActivadoPor','contHoraActivacion','contHoraDesactivacion','contRendimiento','contObservacion','contEsExterno',
    'movActivadoPor','movHoraActivacion','movHoraDesactivacion','movRendimiento','movObservacion',
    'descEnergia','descRouter','descDns',
    'checkIpconfig','checkPingGw','checkPingInternet','checkTracert','checkDns','checkRenovarIp',
    'descartesDetallado','resueltoPor','atribucionFinal','evaluableProveedor',
    'boletaManual','ventaParcial','cajasAfectadas','cajasTotales',
    'alcanceCorte','tuvoUps',
    'escaladoInfraId','horaEscaladoInfra','notaEscaladoInfra',
  ]
  const dateFields = new Set(['horaRegistro','horaFin','horaInicioSeguimiento','contHoraActivacion','contHoraDesactivacion','movHoraActivacion','movHoraDesactivacion','horaEscaladoInfra'])
  const intFields  = new Set(['cajasAfectadas','cajasTotales','mttrMinutos'])
  for (const k of editable) {
    if (k in body) {
      if (dateFields.has(k)) {
        allowedFields[k] = body[k] ? new Date(body[k]) : null
      } else if (intFields.has(k)) {
        allowedFields[k] = body[k] === '' || body[k] === undefined ? null : Number(body[k])
      } else {
        allowedFields[k] = body[k]
      }
    }
  }

  // Auto-set contHoraActivacion cuando contActivadoPor se escribe y no se proporcionó hora
  if (allowedFields.contActivadoPor && !allowedFields.contHoraActivacion) {
    const [prev] = await db.select({ contHoraActivacion: incidentes.contHoraActivacion })
      .from(incidentes).where(eq(incidentes.id, id))
    if (!prev?.contHoraActivacion) {
      allowedFields.contHoraActivacion = new Date()
    }
  }

  // Auto-set hora desactivacion cuando se limpia contActivadoPor o movActivadoPor
  if ('contActivadoPor' in allowedFields && !allowedFields.contActivadoPor) {
    const [prev] = await db.select({ contHoraActivacion: incidentes.contHoraActivacion, contHoraDesactivacion: incidentes.contHoraDesactivacion })
      .from(incidentes).where(eq(incidentes.id, id))
    if (prev?.contHoraActivacion && !prev?.contHoraDesactivacion) {
      allowedFields.contHoraDesactivacion = new Date()
    }
  }
  if ('movActivadoPor' in allowedFields && !allowedFields.movActivadoPor) {
    const [prev] = await db.select({ movHoraActivacion: incidentes.movHoraActivacion, movHoraDesactivacion: incidentes.movHoraDesactivacion })
      .from(incidentes).where(eq(incidentes.id, id))
    if (prev?.movHoraActivacion && !prev?.movHoraDesactivacion) {
      allowedFields.movHoraDesactivacion = new Date()
    }
  }

  const [updated] = await db.update(incidentes)
    .set({ ...allowedFields, actualizadoEn: new Date() })
    .where(eq(incidentes.id, id))
    .returning()

  if (body.estado === 'RESUELTO' || body.horaFin) {
    await db.execute(sql`
      UPDATE escalamientos
      SET hora_respuesta = COALESCE(hora_respuesta, ${new Date().toISOString()}::timestamptz),
          estado_cronometro = CASE
            WHEN estado_cronometro = 'CORRIENDO' THEN 'VENCIDO'
            ELSE estado_cronometro
          END
      WHERE incidente_id = ${id}
        AND hora_respuesta IS NULL
    `)
  }

  // Al cerrar/cancelar un incidente con contingencia activa → auto-desactivar timestamps
  const estadoCierra = ['RESUELTO', 'CANCELADO', 'CERRADO'].includes(body.estado ?? '')
  if (estadoCierra && updated.tiendaId) {
    const now = new Date()
    const patch: Record<string, any> = { actualizadoEn: now }
    if (updated.contActivadoPor && !updated.contHoraDesactivacion) patch.contHoraDesactivacion = now
    if (updated.movActivadoPor  && !updated.movHoraDesactivacion)  patch.movHoraDesactivacion  = now
    if (Object.keys(patch).length > 1) {
      await db.update(incidentes).set(patch).where(eq(incidentes.id, id))
    }
  }

  if (estadoCierra && updated.tiendaId && updated.contActivadoPor) {
    const userId = (session.user as any)?.id ?? null
    const rows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM incidentes
      WHERE tienda_id = ${updated.tiendaId}
        AND cont_activado_por IS NOT NULL
        AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
        AND id != ${id}
    `)
    const contStdRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM contingencias
      WHERE tienda_id = ${updated.tiendaId} AND hora_desactivacion IS NULL
    `)
    const stillActive = Number((rows[0] as any)?.cnt ?? 0) + Number((contStdRows[0] as any)?.cnt ?? 0)
    if (stillActive === 0) {
      await db.update(tiendas)
        .set({ contingenciaActiva: false, contingenciaActivadaPor: null })
        .where(eq(tiendas.id, updated.tiendaId))
      await db.insert(tiendasHistorial).values({
        tiendaId:      updated.tiendaId,
        usuarioId:     userId,
        campoEditado:  'contingenciaActiva',
        valorAnterior: 'true',
        valorNuevo:    `false — cierre automático vía ${body.estado} incidente ${updated.codigo ?? id}`,
      })
    }
  }

  // Cuando contHoraDesactivacion se sella explícitamente → verificar si la tienda ya no tiene contingencias activas
  if ('contHoraDesactivacion' in allowedFields && allowedFields.contHoraDesactivacion && updated.tiendaId && updated.contActivadoPor) {
    const [incCheck] = await db.execute<{ cnt: number }>(sql`
      SELECT COUNT(*)::int AS cnt FROM incidentes
      WHERE tienda_id = ${updated.tiendaId}
        AND cont_activado_por IS NOT NULL
        AND cont_hora_desactivacion IS NULL
        AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
    `)
    const [contCheck] = await db.execute<{ cnt: number }>(sql`
      SELECT COUNT(*)::int AS cnt FROM contingencias
      WHERE tienda_id = ${updated.tiendaId} AND hora_desactivacion IS NULL
    `)
    const stillActive = Number((incCheck as any)?.cnt ?? 0) + Number((contCheck as any)?.cnt ?? 0)
    if (stillActive === 0) {
      await db.update(tiendas)
        .set({ contingenciaActiva: false, contingenciaActivadaPor: null })
        .where(eq(tiendas.id, updated.tiendaId))
    }
  }

  // Auto-sync tiendas.contingencia_activa desde el estado de contingencia del incidente.
  // Cuando contActivadoPor se establece → la tienda pasa a contingencia activa.
  // Cuando se limpia → solo se desactiva si ningún otro incidente abierto de esa tienda tiene contingencia.
  if ('contActivadoPor' in allowedFields && updated.tiendaId) {
    const userId = (session.user as any)?.id ?? null
    if (updated.contActivadoPor) {
      await db.update(tiendas)
        .set({
          contingenciaActiva: true,
          contingenciaActivadaPor: String(updated.contActivadoPor),
          contingenciaDescripcion: (updated.contObservacion as string | null) ?? null,
        })
        .where(eq(tiendas.id, updated.tiendaId))
      await db.insert(tiendasHistorial).values({
        tiendaId:      updated.tiendaId,
        usuarioId:     userId,
        campoEditado:  'contingenciaActiva',
        valorAnterior: 'false',
        valorNuevo:    `true — vía incidente ${updated.codigo ?? id}`,
      })
    } else {
      const rows = await db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM incidentes
        WHERE tienda_id = ${updated.tiendaId}
          AND cont_activado_por IS NOT NULL
          AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
      `)
      if (Number((rows[0] as any)?.cnt ?? 0) === 0) {
        await db.update(tiendas)
          .set({ contingenciaActiva: false, contingenciaActivadaPor: null })
          .where(eq(tiendas.id, updated.tiendaId))
        await db.insert(tiendasHistorial).values({
          tiendaId:      updated.tiendaId,
          usuarioId:     userId,
          campoEditado:  'contingenciaActiva',
          valorAnterior: 'true',
          valorNuevo:    `false — vía incidente ${updated.codigo ?? id}`,
        })
      }
    }
  }

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.eliminar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  await db.delete(adjuntos).where(eq(adjuntos.incidenteId, id))
  const escs = await db.select({ id: escalamientos.id }).from(escalamientos).where(eq(escalamientos.incidenteId, id))
  for (const esc of escs) {
    await db.delete(adjuntos).where(eq(adjuntos.escalamientoId, esc.id))
  }
  await db.delete(escalamientos).where(eq(escalamientos.incidenteId, id))
  await db.delete(incidentes).where(eq(incidentes.id, id))

  return NextResponse.json({ ok: true })
}
