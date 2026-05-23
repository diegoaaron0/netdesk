import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, proveedores, usuarios, escalamientos, nivelesEscalamiento, adjuntos, atcLlamadas } from '@/drizzle/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'

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
    contActivadoPor:     incidentes.contActivadoPor,
    contHoraActivacion:  incidentes.contHoraActivacion,
    contRendimiento:     incidentes.contRendimiento,
    contObservacion:     incidentes.contObservacion,
    movActivadoPor:      incidentes.movActivadoPor,
    movHoraActivacion:   incidentes.movHoraActivacion,
    movRendimiento:      incidentes.movRendimiento,
    movObservacion:      incidentes.movObservacion,
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
    .leftJoin(tiendas,    eq(incidentes.tiendaId,    tiendas.id))
    .leftJoin(proveedores, eq(incidentes.proveedorId, proveedores.id))  // → histórico del incidente
    .leftJoin(usuarios,   eq(incidentes.registradoPorId, usuarios.id))
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

  return NextResponse.json({
    ...inc,
    escalamientos: escs.map((e: any) => ({ ...e, atcLlamadas: atcMap[e.id] ?? [] })),
    nivelesProveedor,
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
    'contActivadoPor','contHoraActivacion','contRendimiento','contObservacion',
    'movActivadoPor','movHoraActivacion','movRendimiento','movObservacion',
    'descEnergia','descRouter','descDns',
    'checkIpconfig','checkPingGw','checkPingInternet','checkTracert','checkDns','checkRenovarIp',
    'descartesDetallado','resueltoPor','atribucionFinal','evaluableProveedor',
    'boletaManual','ventaParcial','cajasAfectadas','cajasTotales',
  ]
  const dateFields = new Set(['horaRegistro','horaFin','horaInicioSeguimiento','contHoraActivacion','movHoraActivacion'])
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

  const [updated] = await db.update(incidentes)
    .set({ ...allowedFields, actualizadoEn: new Date() })
    .where(eq(incidentes.id, id))
    .returning()

  if (body.estado === 'RESUELTO' || body.horaFin) {
    await db.execute(sql`
      UPDATE escalamientos
      SET hora_respuesta = COALESCE(hora_respuesta, ${new Date().toISOString()}::timestamptz),
          estado_cronometro = CASE
            WHEN estado_cronometro = 'ESPERANDO' THEN 'RESUELTO_SIN_RESPUESTA'
            ELSE estado_cronometro
          END
      WHERE incidente_id = ${id}
        AND hora_respuesta IS NULL
    `)
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
