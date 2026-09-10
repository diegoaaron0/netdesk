import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { incidentes, tiendas, proveedores, usuarios, escalamientos, fichasNiveles, adjuntos, atcLlamadas, tiendasHistorial, gruposMasivos, routersExternos, incidenteMitigacionTramos } from '@/drizzle/schema'
import { eq, and, isNull, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/auth'
import { can } from '@/lib/permisos'
import { cerrarMitigacionAlCerrarIncidente } from '@/lib/cierre-mitigacion'

const infraUser = alias(usuarios, 'infra_user')
const provInc   = alias(proveedores, 'pi')   // proveedor histórico del incidente
const provTda   = alias(proveedores, 'pt')   // proveedor actual de la tienda (fallback)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!can(session, 'incidentes.ver')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

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
    ieiAcumulado:            incidentes.ieiAcumulado,
    horaRegistroOriginal:    incidentes.horaRegistroOriginal,
    horaFinAnterior:         incidentes.horaFinAnterior,
    tipoPersonalizado:  incidentes.tipoPersonalizado,
    otrosClasificacion: incidentes.otrosClasificacion,
    actualizadoEn:      incidentes.actualizadoEn,
    // Tienda → siempre el estado actual (dirección, CID, instrucción pueden cambiar y está bien)
    tiendaId:                tiendas.id,
    tiendaCodigo:            tiendas.codigo,
    tiendaNombre:            tiendas.nombreCc,
    tiendaDireccion:         tiendas.direccion,
    tiendaDistrito:          tiendas.distrito,
    tiendaCid:          sql<string>`(SELECT cid_servicio FROM fichas WHERE id = COALESCE(${incidentes.fichaId}, ${tiendas.fichaActivaId}) LIMIT 1)`,
    tiendaTipoConexion: sql<string>`(SELECT tipo_conexion FROM fichas WHERE id = COALESCE(${incidentes.fichaId}, ${tiendas.fichaActivaId}) LIMIT 1)`,
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
    mitigacionesPrevias:    incidentes.mitigacionesPrevias,
    descEnergia:         incidentes.descEnergia,
    descRouter:          incidentes.descRouter,
    descCableado:        incidentes.descCableado,
    descReinicioEquipo:  incidentes.descReinicioEquipo,
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
    // Proveedor → primero el proveedor histórico del incidente; si no hay
    // (incidentes antiguos pre-módulo, o casos donde quedó vacío), cae al
    // proveedor actual de la tienda. Mismo patrón que la lista, el dashboard
    // operativo y los reportes (COALESCE histórico → actual).
    proveedorId:          sql<string | null>`COALESCE(${incidentes.proveedorId}, ${tiendas.proveedorId})`,
    proveedorNombre:      sql<string>`COALESCE(pi.nombre, pt.nombre)`,
    proveedorInstruccion: sql<string>`COALESCE(pi.instruccion_general, pt.instruccion_general)`,
    proveedorTelefono:    sql<string>`COALESCE(pi.telefono_soporte, pt.telefono_soporte)`,
    agenteNombre: usuarios.nombre,
    agenteEmail:  usuarios.email,
  })
    .from(incidentes)
    .leftJoin(tiendas,     eq(incidentes.tiendaId,       tiendas.id))
    .leftJoin(provInc,     eq(incidentes.proveedorId,    provInc.id))
    .leftJoin(provTda,     eq(tiendas.proveedorId,       provTda.id))
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

  // Niveles de escalamiento: se obtienen de la ficha vinculada al incidente.
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

  // Métricas SLA del incidente — % de cumplimiento (cumple/no cumple), no
  // score de proximidad. Fragmentos canónicos de lib/sla-sql.ts, ficha vía
  // COALESCE(i.ficha_id, t.ficha_activa_id) — igual criterio que Proveedores
  // y tiendas/[id]. A diferencia de esas rutas (agregados de N incidentes
  // RESUELTOS), acá es un solo incidente que puede seguir abierto: Respuesta
  // se evalúa en cuanto hay primera respuesta (no exige RESUELTO, igual que
  // antes); Resolución exige hora_fin — si el incidente sigue abierto queda
  // en null ("en curso"), nunca se fuerza a 0%.
  let slaMetrics: Record<string, any> | null = null
  try {
    const { calcSLARow } = await import('@/lib/sla-core')
    const { slaProveedorJoins, slaRespuestaCumpleExpr, slaResolucionCumpleExpr } = await import('@/lib/sla-sql')

    const horaCorreoN1  = escs.reduce((min: Date | null, e: any) => {
      if (!e.horaEnvioCorreo) return min
      return min == null || new Date(e.horaEnvioCorreo) < new Date(min) ? e.horaEnvioCorreo : min
    }, null)
    const horaPrimeraResp = escs.filter((e: any) => e.horaRespuesta && !e.noHuboRespuesta).reduce((min: Date | null, e: any) => {
      return min == null || new Date(e.horaRespuesta) < new Date(min) ? e.horaRespuesta : min
    }, null)
    const maxNivel = escs.reduce((max: number, e: any) => Math.max(max, e.nivel ?? 0), 0)

    const [cr] = await db.execute(sql`
      SELECT
        cp.tiempo_respuesta_sla  AS sla_resp_override,
        cp.tiempo_resolucion_sla AS sla_resol_override,
        ${sql.raw(slaRespuestaCumpleExpr())}  AS cumple_respuesta,
        ${sql.raw(slaResolucionCumpleExpr())} AS cumple_resolucion
      FROM incidentes i
      JOIN tiendas t ON i.tienda_id = t.id
      ${sql.raw(slaProveedorJoins())}
      WHERE i.id = ${id}::uuid
    `) as any[]

    const res = calcSLARow({
      tipo: inc.tipo,
      hora_correo_n1:    horaCorreoN1,
      hora_primera_resp: horaPrimeraResp,
      hora_fin:          inc.horaFin,
      hora_registro:     inc.horaRegistro,
      max_nivel:         maxNivel,
      slaRespuestaOverride:  cr?.sla_resp_override  ?? undefined,
      slaResolucionOverride: cr?.sla_resol_override ?? undefined,
    })

    const slaRespuestaPct  = horaPrimeraResp == null ? 0 : (cr?.cumple_respuesta ? 100 : 0)
    const slaResolucionPct = horaPrimeraResp == null ? 0 : (inc.horaFin == null ? null : (cr?.cumple_resolucion ? 100 : 0))

    slaMetrics = {
      evaluable:            res.evaluable,
      slaRespuestaPct,
      tPrimeraRespuestaMin: res.tPrimeraRespuestaMin,
      slaResolucionPct,
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
      // contHoraActivacion solo cuenta como activación de router si contActivadoPor
      // está seteado (evita arrastrar un timestamp viejo tras una desactivación).
      // Mismo gate para movHoraActivacion/movActivadoPor — bug real confirmado en
      // producción: sin este chequeo, un timestamp fantasma en mov_hora_activacion
      // (sin mov_activado_por) se contaba como datos móviles activo.
      // Boleta manual tiene su propio campo, boletaHoraActivacion — no comparte esta columna.
      cont_hora_activacion:    inc.contActivadoPor ? inc.contHoraActivacion : null,
      cont_hora_desactivacion: inc.contHoraDesactivacion,
      cont_rendimiento:        inc.contRendimiento,
      cont_es_externo:         inc.contEsExterno,
      mov_hora_activacion:     inc.movActivadoPor ? inc.movHoraActivacion : null,
      mov_hora_desactivacion:  inc.movHoraDesactivacion,
      mov_rendimiento:         inc.movRendimiento,
      boleta_manual:            inc.boletaManual,
      boleta_rendimiento:       inc.boletaRendimiento,
      boleta_hora_activacion:   inc.boletaHoraActivacion,
    })
    const ieiAcum = Number((inc as any).ieiAcumulado ?? 0)
    const tieneAcum = ieiAcum > 0
    ieiCalc = {
      impactoEstimado:       (res.impactoEstimado ?? 0) + ieiAcum,
      // Bruto y venta esperada solo son válidos para el período actual.
      // Con acumulado, mostrar null (→ "—") para evitar que parezca que IEI > bruto.
      impactoEconomicoBruto: tieneAcum ? null : res.impactoEconomicoBruto,
      ventaHora:             res.ventaHora,
      ventaEsperadaAfectada: tieneAcum ? null : res.ventaEsperadaAfectada,
      factorAplicado:        res.factorAplicado,
      motivoFactor:          res.motivoFactor,
      margenUsado:           res.margenUsado,
      faltaInformacion:      res.faltaInformacion && !tieneAcum,
      segmentos:             res.segmentos,
      ieiAcumulado:          ieiAcum,
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
  if (!['SUPERVISOR', 'DEMO', 'INFRAESTRUCTURA'].includes(userRol)) {
    const [currentInc] = await db.select({ estado: incidentes.estado })
      .from(incidentes).where(eq(incidentes.id, id))
    if (currentInc && ['RESUELTO', 'CANCELADO', 'CERRADO'].includes(currentInc.estado)) {
      return NextResponse.json({ error: 'Solo supervisores o infraestructura pueden editar incidentes cerrados' }, { status: 403 })
    }
  }

  const allowedFields: Record<string, any> = {}
  const editable = [
    'estado','nivelImpacto','usuariosAfectados','tipo','tipoPersonalizado','otrosClasificacion',
    'registradoPorId',
    'descripcionInicial','ticketInvgate','ticketProveedor','descartesRealizados','solucionAplicada',
    'observaciones','horaRegistro','horaRegistroOriginal','horaFin','mttrMinutos',
    'estadoOperacion','operacionManual','tipoOperacionManual','factorOperativo',
    'routerExternoId',
    // Corte final: cont_*, mov_* y boleta_* YA NO SE ESCRIBEN. La mitigación
    // vive en incidente_mitigacion_tramos y se opera por POST /mitigacion.
    // Si el body los trae (el formulario de detalle manda {...editForm} entero)
    // se ignoran en silencio, sin 400, para no romper el frontend. Los datos
    // históricos siguen en la tabla y los lectores de fallback los siguen
    // leyendo cuando el incidente no tiene ningún tramo.
    // descDns sigue aceptándose para no romper un guardado de un incidente
    // histórico que lo traiga; el formulario nuevo ya no lo ofrece.
    'descEnergia','descRouter','descCableado','descReinicioEquipo','descDns',
    'checkIpconfig','checkPingGw','checkPingInternet','checkTracert','checkDns','checkRenovarIp',
    'descartesDetallado','resueltoPor','atribucionFinal','evaluableProveedor',
    'ventaParcial','cajasAfectadas','cajasTotales',
    'alcanceCorte','tuvoUps',
    'escaladoInfraId','horaEscaladoInfra','notaEscaladoInfra',
  ]
  const dateFields = new Set(['horaRegistro','horaRegistroOriginal','horaFin','horaEscaladoInfra'])
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

  // Validaciones de consistencia temporal
  const af = allowedFields
  if (af.horaRegistro && af.horaFin && af.horaFin < af.horaRegistro)
    return NextResponse.json({ error: 'hora_fin no puede ser anterior a hora_registro' }, { status: 400 })

  // Auditoría: cuando se cierra, guardar quién cerró y auto-sellar hora_fin
  if (body.estado === 'CERRADO') {
    allowedFields.cerradoPorId = (session.user as any)?.id ?? null
    if (!('horaFin' in allowedFields)) allowedFields.horaFin = new Date()
  }

  // Al editar hora_fin o hora_registro en un incidente ya resuelto/cerrado se
  // recalcula mttr_minutos. Antes también se re-sincronizaban
  // cont/mov_hora_desactivacion con la nueva hora_fin; eso murió con el corte
  // final: esos campos ya no se escriben y el IEI sale de los tramos.
  if ('horaFin' in allowedFields || 'horaRegistro' in allowedFields) {
    const [prevSnap] = await db.select({
      estado:             incidentes.estado,
      horaFin:            incidentes.horaFin,
      horaRegistro:       incidentes.horaRegistro,
      tiempoAcumuladoMin: incidentes.tiempoAcumuladoMin,
    }).from(incidentes).where(eq(incidentes.id, id))

    if (prevSnap && ['RESUELTO', 'CERRADO'].includes(prevSnap.estado ?? '')) {
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
    }
  }

  const [updated] = await db.update(incidentes)
    .set({ ...allowedFields, actualizadoEn: new Date() })
    .where(eq(incidentes.id, id))
    .returning()

  // ── Desactivar la mitigación desde el dashboard operativo ─────────────────
  // El botón "desactivar contingencia" del operativo manda un PUT con
  // cont_hora_desactivacion / mov_hora_desactivacion / boletaManual:false y
  // nada más. Esos campos ya no se escriben, pero se siguen leyendo DEL BODY
  // como señal de intención: es lo único que distingue "apagá la mitigación"
  // de cualquier otro guardado. El efecto real es cerrar el tramo, delegando
  // en POST /mitigacion con SIN_MITIGACION — la misma lógica que usa el
  // control del detalle, no una copia.
  const pidioCerrarRouter  = body.contHoraDesactivacion != null || body.contActivadoPor === null || body.contActivadoPor === ''
  const pidioCerrarMoviles = body.movHoraDesactivacion != null || body.movActivadoPor === null || body.movActivadoPor === ''
  const pidioCerrarBoleta  = body.boletaManual === false || body.boletaManual === null

  if ((pidioCerrarRouter || pidioCerrarMoviles || pidioCerrarBoleta)
      && !['RESUELTO', 'CANCELADO', 'CERRADO'].includes(updated.estado ?? '')) {
    const [tramoAbierto] = await db.select({ tipo: incidenteMitigacionTramos.tipo })
      .from(incidenteMitigacionTramos)
      .where(and(eq(incidenteMitigacionTramos.incidenteId, id), isNull(incidenteMitigacionTramos.hasta)))

    // Solo si el tramo abierto es del tipo que se pidió desactivar: apagar el
    // router no debe cerrar un tramo de datos móviles que sigue corriendo.
    const tipoAbierto = tramoAbierto?.tipo ?? null
    const coincide =
      (pidioCerrarRouter  && (tipoAbierto === 'ROUTER_PROPIO' || tipoAbierto === 'ROUTER_EXTERNO')) ||
      (pidioCerrarMoviles && tipoAbierto === 'DATOS_MOVILES') ||
      (pidioCerrarBoleta  && tipoAbierto === 'BOLETA_MANUAL')

    if (coincide) {
      const { POST: postMitigacion } = await import('./mitigacion/route')
      const res = await postMitigacion(
        { json: async () => ({ tipo: 'SIN_MITIGACION' }) } as any,
        { params: Promise.resolve({ id }) },
      )
      if (!res.ok) {
        console.error('[incidentes/PUT] no se pudo cerrar el tramo abierto', id, res.status, await res.text().catch(() => ''))
      }
    }
  }

  if (body.estado === 'RESUELTO' || body.horaFin) {
    // Escalamientos enviados sin respuesta al cerrar → "sin respuesta" (detiene
    // el cronómetro sin inventar una hora_respuesta, que inflaría el tiempo de
    // respuesta del proveedor). Mismo criterio que /resolver.
    await db.execute(sql`
      UPDATE escalamientos
      SET no_hubo_respuesta = true,
          estado_cronometro = 'VENCIDO'
      WHERE incidente_id = ${id}
        AND hora_envio_correo IS NOT NULL
        AND hora_respuesta IS NULL
        AND no_hubo_respuesta IS NOT TRUE
    `)
  }

  // Al cerrar el incidente por PUT (estado CERRADO/RESUELTO/CANCELADO desde el
  // formulario de detalle): sellar el tramo abierto, limpiar
  // tiendas.contingencia_activa y bajar el router. Mismo helper que usan
  // resolver/ y cancelar/, con la misma regla — decide por tramos y cae al gate
  // viejo sólo si el incidente no tiene ninguno. Antes esto eran cuatro bloques
  // separados gateados por cont_activado_por, que con el corte final quedaban
  // muertos y dejaban la tienda marcada y el router colgado.
  const estadoCierra = ['RESUELTO', 'CANCELADO', 'CERRADO'].includes(body.estado ?? '')
  if (estadoCierra) {
    await cerrarMitigacionAlCerrarIncidente(db, {
      incidenteId:     id,
      tiendaId:        updated.tiendaId,
      tipoIncidente:   updated.tipo,
      contActivadoPor: updated.contActivadoPor,
      routerExternoId: updated.routerExternoId,
      horaFin:         (updated.horaFin as Date | null) ?? new Date(),
    })
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

  // Se leen antes del delete: la FK en cascada se los lleva con el incidente.
  const tramosRouterAbiertos = (await db.select({ tipo: incidenteMitigacionTramos.tipo })
    .from(incidenteMitigacionTramos)
    .where(and(eq(incidenteMitigacionTramos.incidenteId, id), isNull(incidenteMitigacionTramos.hasta))))
    .filter(t => t.tipo === 'ROUTER_PROPIO' || t.tipo === 'ROUTER_EXTERNO').length

  await db.delete(adjuntos).where(eq(adjuntos.incidenteId, id))
  const escs = await db.select({ id: escalamientos.id }).from(escalamientos).where(eq(escalamientos.incidenteId, id))
  for (const esc of escs) {
    await db.delete(adjuntos).where(eq(adjuntos.escalamientoId, esc.id))
  }
  await db.delete(escalamientos).where(eq(escalamientos.incidenteId, id))
  await db.delete(incidentes).where(eq(incidentes.id, id))

  // Si el incidente tenía contingencia de router, limpiar el flag de tienda si
  // no quedan otras fuentes vivas. La condición mira las dos: un tramo de router
  // abierto (modelo nuevo) o el campo viejo sin sellar (incidentes históricos).
  // Sólo con el campo viejo, borrar un incidente creado por el flujo de tramos
  // dejaba la tienda marcada con contingencia para siempre.
  const teniaRouter = !!(inc?.contActivadoPor && !inc.contHoraDesactivacion) || tramosRouterAbiertos > 0
  if (inc?.tiendaId && teniaRouter) {
    const [incRow] = await db.execute<{ cnt: number }>(sql`
      SELECT COUNT(DISTINCT i.id)::int AS cnt
      FROM incidentes i
      LEFT JOIN incidente_mitigacion_tramos tr
        ON tr.incidente_id = i.id AND tr.hasta IS NULL
       AND tr.tipo IN ('ROUTER_PROPIO','ROUTER_EXTERNO')
      WHERE i.tienda_id = ${inc.tiendaId}
        AND i.estado NOT IN ('RESUELTO','CANCELADO','CERRADO')
        AND (
          tr.id IS NOT NULL
          OR (
            i.cont_activado_por IS NOT NULL
            AND i.cont_hora_desactivacion IS NULL
            AND NOT EXISTS (SELECT 1 FROM incidente_mitigacion_tramos t2 WHERE t2.incidente_id = i.id)
          )
        )
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
