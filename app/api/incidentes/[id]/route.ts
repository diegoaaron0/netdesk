import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, proveedores, usuarios, escalamientos, nivelesEscalamiento, fichasNiveles, adjuntos, atcLlamadas, tiendasHistorial, gruposMasivos, routersExternos } from '@/drizzle/schema'
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
    horaFin: incidentes.horaFin,
    mttrMinutos: incidentes.mttrMinutos,
    observaciones: incidentes.observaciones,
    reabiertaInfo:           incidentes.reabiertaInfo,
    motivoReabertura:        incidentes.motivoReabertura,
    justificacionReabertura: incidentes.justificacionReabertura,
    tiempoAcumuladoMin:      incidentes.tiempoAcumuladoMin,
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
    tiendaVentaHoraSoles:    tiendas.ventaHoraSoles,
    tiendaVentaHoraFdsSoles: tiendas.ventaHoraFdsSoles,
    tiendaClusterFuente:     tiendas.fuenteVentas,
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
    boletaManual:          incidentes.boletaManual,
    boletaRendimiento:     incidentes.boletaRendimiento,
    boletaHoraActivacion:  incidentes.boletaHoraActivacion,
    ventaParcial:        incidentes.ventaParcial,
    cajasAfectadas:      incidentes.cajasAfectadas,
    cajasTotales:        incidentes.cajasTotales,
    alcanceCorte:        incidentes.alcanceCorte,
    tuvoUps:             incidentes.tuvoUps,
    fichaId:             incidentes.fichaId,
    grupoMasivoId:       incidentes.grupoMasivoId,
    routerExternoId:     incidentes.routerExternoId,
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

  // Niveles de escalamiento: usar los de la ficha del incidente (fichasNiveles).
  // Fallback a nivelesEscalamiento del proveedor para incidentes sin fichaId.
  let nivelesProveedor: any[] = []
  if (inc.fichaId) {
    nivelesProveedor = await db.select({
      id:              fichasNiveles.id,
      nivel:           fichasNiveles.nivel,
      nombreContacto:  fichasNiveles.nombreContacto,
      email:           fichasNiveles.email,
      celular:         fichasNiveles.celular,
      tiempoRespSev1:  fichasNiveles.tiempoRespSev1,
    }).from(fichasNiveles)
      .where(eq(fichasNiveles.fichaId, inc.fichaId))
      .orderBy(fichasNiveles.nivel)
  } else if (inc.proveedorId) {
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

  // Métricas SLA del incidente
  let slaMetrics: Record<string, any> | null = null
  try {
    const { calcSLARow } = await import('@/lib/sla-core')
    const { getSlaContrato } = await import('@/lib/sla-contrato')

    const horaCorreoN1  = escs.reduce((min: Date | null, e: any) => {
      if (!e.horaEnvioCorreo) return min
      return min == null || new Date(e.horaEnvioCorreo) < new Date(min) ? e.horaEnvioCorreo : min
    }, null)
    const horaPrimeraResp = escs.filter((e: any) => e.horaRespuesta && !e.noHuboRespuesta).reduce((min: Date | null, e: any) => {
      return min == null || new Date(e.horaRespuesta) < new Date(min) ? e.horaRespuesta : min
    }, null)
    const maxNivel = escs.reduce((max: number, e: any) => Math.max(max, e.nivel ?? 0), 0)

    const slaContrato = inc.proveedorId ? await getSlaContrato(inc.proveedorId, inc.tiendaId) : null
    const res = calcSLARow({
      tipo: inc.tipo,
      hora_correo_n1:    horaCorreoN1,
      hora_primera_resp: horaPrimeraResp,
      hora_fin:          inc.horaFin,
      hora_registro:     inc.horaRegistro,
      max_nivel:         maxNivel,
      slaRespuestaOverride:  slaContrato?.respuestaMin,
      slaResolucionOverride: slaContrato?.resolucionMin,
    })
    slaMetrics = {
      evaluable:            res.evaluable,
      scoreRespuesta:       res.scoreRespuesta,
      tPrimeraRespuestaMin: res.tPrimeraRespuestaMin,
      scoreResolucion:      res.scoreResolucion,
      tResolucionMin:       res.tResolucionMin,
      tPrimerEnvioMin:      res.tPrimerEnvioMin,
      nivelFinal:           res.nivelFinal,
      slaRespuestaObj:      res.slaRespuestaObj,
      slaResolucionObj:     res.slaResolucionObj,
    }
  } catch { /* skip */ }

  // Calcular IEI
  let ieiCalc: any = null
  try {
    const { calcImpactoRow } = await import('@/lib/impacto-calc')
    const res = calcImpactoRow({
      hora_registro:           inc.horaRegistro,
      hora_fin:                inc.horaFin,
      estado:                  inc.estado,
      tipo:                    inc.tipo,
      venta_hora_soles:        inc.tiendaVentaHoraSoles,
      venta_hora_fds_soles:    inc.tiendaVentaHoraFdsSoles,
      cluster:                 inc.tiendaCluster,
      // contHoraActivacion es compartido con BOLETA_MANUAL — solo pasar como router si contActivadoPor está seteado
      cont_hora_activacion:    inc.contActivadoPor ? inc.contHoraActivacion : null,
      cont_hora_desactivacion: inc.contHoraDesactivacion,
      cont_rendimiento:        inc.contRendimiento,
      cont_es_externo:         inc.contEsExterno,
      mov_hora_activacion:     inc.movHoraActivacion,
      mov_hora_desactivacion:  inc.movHoraDesactivacion,
      mov_rendimiento:         inc.movRendimiento,
      boleta_manual:            inc.boletaManual,
      boleta_rendimiento:       inc.boletaRendimiento,
      boleta_hora_activacion:   inc.boletaHoraActivacion,
    })
    ieiCalc = {
      impactoEstimado:       res.impactoEstimado,
      impactoEconomicoBruto: res.impactoEconomicoBruto,
      ventaHora:             res.ventaHora,
      ventaEsperadaAfectada: res.ventaEsperadaAfectada,
      factorAplicado:        res.factorAplicado,
      motivoFactor:          res.motivoFactor,
      margenUsado:           res.margenUsado,
      faltaInformacion:      res.faltaInformacion,
      segmentos:             res.segmentos,
    }
  } catch { /* skip */ }

  return NextResponse.json({
    ...inc,
    escalamientos: escs.map((e: any) => ({ ...e, atcLlamadas: atcMap[e.id] ?? [] })),
    nivelesProveedor,
    grupoMasivo,
    slaMetrics,
    ieiCalc,
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.editar')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const userRol = (session.user as any)?.rol ?? ''
  if (!['SUPERVISOR', 'DEMO'].includes(userRol)) {
    const [currentInc] = await db.select({ estado: incidentes.estado })
      .from(incidentes).where(eq(incidentes.id, id))
    if (currentInc && ['RESUELTO', 'CANCELADO', 'CERRADO'].includes(currentInc.estado)) {
      return NextResponse.json({ error: 'Solo supervisores pueden editar incidentes cerrados' }, { status: 403 })
    }
  }

  const allowedFields: Record<string, any> = {}
  const editable = [
    'estado','nivelImpacto','usuariosAfectados','tipo','tipoPersonalizado','otrosClasificacion',
    'registradoPorId',
    'descripcionInicial','ticketInvgate','ticketProveedor','descartesRealizados','solucionAplicada',
    'observaciones','horaRegistro','horaFin','mttrMinutos',
    'estadoOperacion','operacionManual','tipoOperacionManual','factorOperativo',
    'contActivadoPor','contHoraActivacion','contHoraDesactivacion','contRendimiento','contObservacion','contEsExterno','routerExternoId',
    'movActivadoPor','movHoraActivacion','movHoraDesactivacion','movRendimiento','movObservacion',
    'descEnergia','descRouter','descDns',
    'checkIpconfig','checkPingGw','checkPingInternet','checkTracert','checkDns','checkRenovarIp',
    'descartesDetallado','resueltoPor','atribucionFinal','evaluableProveedor',
    'boletaManual','boletaRendimiento','boletaHoraActivacion','ventaParcial','cajasAfectadas','cajasTotales',
    'alcanceCorte','tuvoUps',
    'escaladoInfraId','horaEscaladoInfra','notaEscaladoInfra',
  ]
  const dateFields = new Set(['horaRegistro','horaFin','contHoraActivacion','contHoraDesactivacion','movHoraActivacion','movHoraDesactivacion','horaEscaladoInfra','boletaHoraActivacion'])
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

  // Normalizar: empty string en campos de activación → null (evita IS NOT NULL falso positivo en queries)
  for (const f of ['contActivadoPor', 'movActivadoPor']) {
    if (f in allowedFields && allowedFields[f] === '') allowedFields[f] = null
  }

  // Validaciones de consistencia temporal
  const af = allowedFields
  if (af.horaRegistro && af.horaFin && af.horaFin < af.horaRegistro)
    return NextResponse.json({ error: 'hora_fin no puede ser anterior a hora_registro' }, { status: 400 })
  if (af.contHoraActivacion && af.contHoraDesactivacion && af.contHoraDesactivacion < af.contHoraActivacion)
    return NextResponse.json({ error: 'cont_hora_desactivacion no puede ser anterior a cont_hora_activacion' }, { status: 400 })
  if (af.movHoraActivacion && af.movHoraDesactivacion && af.movHoraDesactivacion < af.movHoraActivacion)
    return NextResponse.json({ error: 'mov_hora_desactivacion no puede ser anterior a mov_hora_activacion' }, { status: 400 })

  // Auditoría: cuando se cierra, guardar quién cerró y auto-sellar hora_fin
  if (body.estado === 'CERRADO') {
    allowedFields.cerradoPorId = (session.user as any)?.id ?? null
    if (!('horaFin' in allowedFields)) allowedFields.horaFin = new Date()
  }

  // Validar: no se puede activar ROUTER_PROPIO si la tienda no tiene contingencia propia.
  // Solo aplica cuando es una NUEVA activación (contActivadoPor era null en BD antes de este save).
  if (allowedFields.contActivadoPor && !allowedFields.contEsExterno) {
    const [prev] = await db.select({
      contActivadoPor:  incidentes.contActivadoPor,
      tieneContingencia: tiendas.tieneContingencia,
    })
      .from(incidentes)
      .innerJoin(tiendas, eq(incidentes.tiendaId, tiendas.id))
      .where(eq(incidentes.id, id))
    if (!prev?.contActivadoPor && !prev?.tieneContingencia) {
      return NextResponse.json({ error: 'Esta tienda no tiene contingencia propia registrada. Solo puede usar Router externo.' }, { status: 409 })
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

  // Auto-timestamp boleta_hora_activacion cuando boletaManual se activa por primera vez
  if ('boletaManual' in allowedFields) {
    if (allowedFields.boletaManual === true) {
      const [prev] = await db.select({ boletaHoraActivacion: incidentes.boletaHoraActivacion })
        .from(incidentes).where(eq(incidentes.id, id))
      if (!prev?.boletaHoraActivacion && !('boletaHoraActivacion' in allowedFields)) {
        allowedFields.boletaHoraActivacion = new Date()
      }
    } else if (allowedFields.boletaManual === false || allowedFields.boletaManual === null) {
      allowedFields.boletaHoraActivacion = null
    }
  }

  // Prevalidar router externo ANTES de tocar el incidente para evitar inconsistencias
  if (allowedFields.contActivadoPor && allowedFields.contEsExterno) {
    const [prevIncR] = await db.select({ tiendaId: incidentes.tiendaId, routerExternoId: incidentes.routerExternoId })
      .from(incidentes).where(eq(incidentes.id, id))
    const routerIdCheck = allowedFields.routerExternoId ?? prevIncR?.routerExternoId
    if (routerIdCheck) {
      const [rCheck] = await db.select({ estado: routersExternos.estado, tiendaActualId: routersExternos.tiendaActualId })
        .from(routersExternos).where(eq(routersExternos.id, routerIdCheck))
      if (rCheck?.estado === 'EN_TIENDA_ACTIVO' && rCheck.tiendaActualId !== prevIncR?.tiendaId) {
        return NextResponse.json({ error: 'Este router ya está activo en otro incidente. Debe desactivarse primero.' }, { status: 409 })
      }
    }
  }

  // Al editar hora_fin o hora_registro en un incidente ya resuelto/cerrado:
  // 1. Recalcular mttr_minutos automáticamente
  // 2. Sincronizar cont_hora_desactivacion / mov_hora_desactivacion con la nueva hora_fin
  //    siempre que el usuario no haya cambiado esos campos explícitamente
  if ('horaFin' in allowedFields || 'horaRegistro' in allowedFields) {
    const [prevSnap] = await db.select({
      estado:                incidentes.estado,
      horaFin:               incidentes.horaFin,
      horaRegistro:          incidentes.horaRegistro,
      tiempoAcumuladoMin:    incidentes.tiempoAcumuladoMin,
      contActivadoPor:       incidentes.contActivadoPor,
      contHoraDesactivacion: incidentes.contHoraDesactivacion,
      movActivadoPor:        incidentes.movActivadoPor,
      movHoraDesactivacion:  incidentes.movHoraDesactivacion,
    }).from(incidentes).where(eq(incidentes.id, id))

    if (prevSnap && ['RESUELTO', 'CERRADO'].includes(prevSnap.estado ?? '')) {
      // Recalcular MTTR si no fue enviado explícitamente
      if (!('mttrMinutos' in allowedFields)) {
        const fin = (allowedFields.horaFin ?? prevSnap.horaFin) as Date | null
        const ini = (allowedFields.horaRegistro ?? prevSnap.horaRegistro) as Date
        if (fin) {
          const acum = prevSnap.tiempoAcumuladoMin ?? 0
          allowedFields.mttrMinutos = Math.round(
            (new Date(fin).getTime() - new Date(ini).getTime()) / 60000
          ) + acum
        }
      }

      // Sincronizar cont/mov hora_desactivacion con la nueva hora_fin,
      // salvo que el usuario haya cambiado esos campos explícitamente.
      // Tolerancia 60s para la truncación a minutos de datetime-local.
      if ('horaFin' in allowedFields && allowedFields.horaFin) {
        const newHoraFin = allowedFields.horaFin as Date
        const TOL_MS = 60_000

        const contDeactUnchanged = prevSnap.contActivadoPor != null &&
          prevSnap.contHoraDesactivacion != null &&
          (allowedFields.contHoraDesactivacion == null ||
            Math.abs(
              new Date(allowedFields.contHoraDesactivacion as any).getTime() -
              new Date(prevSnap.contHoraDesactivacion).getTime()
            ) < TOL_MS)
        if (contDeactUnchanged) allowedFields.contHoraDesactivacion = newHoraFin

        const movDeactUnchanged = prevSnap.movActivadoPor != null &&
          prevSnap.movHoraDesactivacion != null &&
          (allowedFields.movHoraDesactivacion == null ||
            Math.abs(
              new Date(allowedFields.movHoraDesactivacion as any).getTime() -
              new Date(prevSnap.movHoraDesactivacion).getTime()
            ) < TOL_MS)
        if (movDeactUnchanged) allowedFields.movHoraDesactivacion = newHoraFin
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
        AND cont_hora_desactivacion IS NULL
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

  // Cuando contHoraDesactivacion se sella explícitamente → limpiar flag de tienda si ya no hay contingencias activas
  if ('contHoraDesactivacion' in allowedFields && updated.tiendaId) {
    await db.execute(sql`
      UPDATE tiendas SET contingencia_activa = false, contingencia_activada_por = null
      WHERE id = ${updated.tiendaId}
        AND NOT EXISTS (
          SELECT 1 FROM incidentes
          WHERE tienda_id = ${updated.tiendaId}
            AND cont_activado_por IS NOT NULL
            AND cont_hora_desactivacion IS NULL
            AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
        )
        AND NOT EXISTS (
          SELECT 1 FROM contingencias
          WHERE tienda_id = ${updated.tiendaId} AND hora_desactivacion IS NULL
        )
    `)
  }

  // ── Gestión de estado del router externo ─────────────────────────────────
  // La validación de doble-activación ya se hizo arriba (antes del UPDATE) para evitar inconsistencias.
  if (allowedFields.contActivadoPor && allowedFields.contEsExterno && updated.routerExternoId) {
    await db.update(routersExternos)
      .set({ estado: 'EN_TIENDA_ACTIVO', tiendaActualId: updated.tiendaId })
      .where(eq(routersExternos.id, updated.routerExternoId))
  }

  // Al sellar contHoraDesactivacion manualmente → EN_TIENDA_INACTIVO
  if ('contHoraDesactivacion' in allowedFields && allowedFields.contHoraDesactivacion && updated.routerExternoId) {
    const [router] = await db.select({ estado: routersExternos.estado })
      .from(routersExternos).where(eq(routersExternos.id, updated.routerExternoId))
    if (router?.estado === 'EN_TIENDA_ACTIVO') {
      await db.update(routersExternos)
        .set({ estado: 'EN_TIENDA_INACTIVO' })
        .where(eq(routersExternos.id, updated.routerExternoId))
    }
  }

  // Al cerrar/cancelar/resolver → EN_TIENDA_INACTIVO
  if (estadoCierra && updated.routerExternoId) {
    const [router] = await db.select({ estado: routersExternos.estado })
      .from(routersExternos).where(eq(routersExternos.id, updated.routerExternoId))
    if (router?.estado === 'EN_TIENDA_ACTIVO') {
      await db.update(routersExternos)
        .set({ estado: 'EN_TIENDA_INACTIVO' })
        .where(eq(routersExternos.id, updated.routerExternoId))
    }
  }

  // Auto-sync tiendas.contingencia_activa desde el estado de contingencia del incidente.
  // Cuando contActivadoPor se establece → la tienda pasa a contingencia activa.
  // Cuando se limpia → solo se desactiva si ningún otro incidente abierto de esa tienda tiene contingencia.
  if ('contActivadoPor' in allowedFields && updated.tiendaId) {
    const userId = (session.user as any)?.id ?? null
    if (updated.contActivadoPor && !estadoCierra) {
      await db.update(tiendas)
        .set({
          contingenciaActiva: true,
          contingenciaActivadaPor: String(updated.contActivadoPor),
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
          AND cont_hora_desactivacion IS NULL
          AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
      `)
      const contStdRows = await db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM contingencias
        WHERE tienda_id = ${updated.tiendaId} AND hora_desactivacion IS NULL
      `)
      if (Number((rows[0] as any)?.cnt ?? 0) + Number((contStdRows[0] as any)?.cnt ?? 0) === 0) {
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

  // Obtener tiendaId y si tiene contingencia router activa antes de borrar
  const [inc] = await db.select({
    tiendaId:              incidentes.tiendaId,
    contActivadoPor:       incidentes.contActivadoPor,
    contHoraDesactivacion: incidentes.contHoraDesactivacion,
  }).from(incidentes).where(eq(incidentes.id, id))

  await db.delete(adjuntos).where(eq(adjuntos.incidenteId, id))
  const escs = await db.select({ id: escalamientos.id }).from(escalamientos).where(eq(escalamientos.incidenteId, id))
  for (const esc of escs) {
    await db.delete(adjuntos).where(eq(adjuntos.escalamientoId, esc.id))
  }
  await db.delete(escalamientos).where(eq(escalamientos.incidenteId, id))
  await db.delete(incidentes).where(eq(incidentes.id, id))

  // Si el incidente tenía contingencia router activa, limpiar flag de tienda
  // solo si no quedan otros incidentes abiertos con contingencia activa para esa tienda
  if (inc?.tiendaId && inc.contActivadoPor && !inc.contHoraDesactivacion) {
    const [incRow] = await db.execute<{ cnt: number }>(sql`
      SELECT COUNT(*)::int AS cnt FROM incidentes
      WHERE tienda_id = ${inc.tiendaId}
        AND cont_activado_por IS NOT NULL
        AND cont_hora_desactivacion IS NULL
        AND estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
    `)
    const [stdRow] = await db.execute<{ cnt: number }>(sql`
      SELECT COUNT(*)::int AS cnt FROM contingencias
      WHERE tienda_id = ${inc.tiendaId} AND hora_desactivacion IS NULL
    `)
    if (Number((incRow as any)?.cnt ?? 0) + Number((stdRow as any)?.cnt ?? 0) === 0) {
      await db.update(tiendas)
        .set({ contingenciaActiva: false })
        .where(eq(tiendas.id, inc.tiendaId))
    }
  }

  return NextResponse.json({ ok: true })
}
