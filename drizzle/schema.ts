import {
  pgTable, pgEnum, uuid, text, boolean,
  timestamp, integer, numeric, date, jsonb,
} from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const rolEnum = pgEnum('rol', ['AGENTE', 'SUPERVISOR', 'GERENCIA', 'INFRAESTRUCTURA', 'DEMO'])
export const nivelImpactoEnum = pgEnum('nivel_impacto', ['ALTO', 'MEDIO', 'BAJO'])
export const tipoIncidenteEnum = pgEnum('tipo_incidente', [
  'CAIDA_TOTAL', 'INTERMITENCIA', 'LENTITUD', 'POS', 'OTROS', 'CORTE_ELECTRICO',
])
export const estadoIncidenteEnum = pgEnum('estado_incidente', [
  'ABIERTO', 'EN_SEGUIMIENTO', 'ESCALADO_N1', 'ESCALADO_N2',
  'ESCALADO_N3', 'RESUELTO', 'CANCELADO', 'CERRADO',
])
export const clusterEnum = pgEnum('cluster_tienda', ['A', 'B', 'C', 'D'])
export const estadoCronometroEnum = pgEnum('estado_cronometro', [
  'CORRIENDO', 'RESPONDIDO', 'VENCIDO',
])
export const alcanceCorteEnum = pgEnum('alcance_corte', [
  'SOLO_TIENDA', 'MALL', 'CUADRA_CALLE', 'ZONA_AMPLIA',
])

export const estadoFichaEnum = pgEnum('estado_ficha', ['BORRADOR', 'ACTIVA', 'HISTORICA'])

export const tipoLocalEnum = pgEnum('tipo_local', ['TIENDA', 'CATALOGO', 'ENLACE', 'ALMACEN', 'RESTAURANTE'])

export const tipoDecisionEnum = pgEnum('tipo_decision', [
  'CAMBIO_PROVEEDOR', 'RENEGOCIACION_CONTRATO', 'ACTIVACION_CONTINGENCIA',
  'REVISION_SLA', 'BAJA_TIENDA', 'CAMBIO_PLAN', 'AUDITORIA_PROVEEDOR', 'OTRO',
])
export const estadoDecisionEnum = pgEnum('estado_decision', [
  'PROPUESTO', 'PENDIENTE', 'EN_EJECUCION', 'EJECUTADA', 'CANCELADA', 'RECHAZADO',
])
// snapDetalle / postDetalle JSON shape (CAMBIO_PROVEEDOR):
// { slaRespuestaPct, slaResolucionPct, mttrMin, totalIncidentes, incidentesSlaVencido, ieiAcumulado, contratoSlaObjetivo }

export const usuarios = pgTable('usuarios', {
  id:       uuid('id').primaryKey().defaultRandom(),
  nombre:   text('nombre').notNull(),
  apellido: text('apellido'),
  email:    text('email').unique().notNull(),
  celular:  text('celular'),
  password: text('password').default('soporte123'),
  rol:      rolEnum('rol').notNull().default('AGENTE'),
  cluster:  clusterEnum('cluster'),
  permisos:         text('permisos').array(),
  modulosVisibles:  text('modulos_visibles').array(),
  activo:      boolean('activo').default(true),
  eliminadoEn: timestamp('eliminado_en'),
  creadoEn:    timestamp('creado_en').defaultNow(),
})

export const proveedores = pgTable('proveedores', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  nombre:             text('nombre').unique().notNull(),
  correoSoporte:      text('correo_soporte'),
  telefonoSoporte:    text('telefono_soporte'),
  instruccionGeneral: text('instruccion_general'),
  tipoServicio:       text('tipo_servicio'),
  planPrincipal:      text('plan_principal'),
  canalAtencion:      text('canal_atencion'),
  observaciones:      text('observaciones'),
  estadoContrato:     text('estado_contrato').default('VIGENTE'),
  creadoEn:           timestamp('creado_en').defaultNow(),
})

export const nivelesEscalamiento = pgTable('niveles_escalamiento', {
  id:                      uuid('id').primaryKey().defaultRandom(),
  proveedorId:             uuid('proveedor_id').references(() => proveedores.id),
  nivel:                   integer('nivel').notNull(),
  nombreContacto:          text('nombre_contacto').notNull(),
  email:                   text('email'),
  celular:                 text('celular'),
  tiempoRespSev1:          text('tiempo_resp_sev1'),
  tiempoRespSev2:          text('tiempo_resp_sev2'),
  tiempoRespSev3:          text('tiempo_resp_sev3'),
  correosCopia:            text('correos_copia').array(),
  whatsapp:                text('whatsapp'),
  canal:                   text('canal').default('correo'),
  horarioAtencion:         text('horario_atencion'),
  tiempoEsperadoSolucion:  integer('tiempo_esperado_solucion'),
  instruccion:             text('instruccion'),
  activo:                  boolean('activo').default(true),
})

export const tiendas = pgTable('tiendas', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  codigo:               text('codigo').unique().notNull(),
  nombreCc:             text('nombre_cc'),
  formato:              text('formato'),
  direccion:            text('direccion'),
  referencia:           text('referencia'),
  distrito:             text('distrito'),
  provincia:            text('provincia'),
  ubicacion:            text('ubicacion'),
  coordenadas:          text('coordenadas'),
  cluster:              clusterEnum('cluster'),
  supervisorNombre:     text('supervisor_nombre'),
  proveedorId:          uuid('proveedor_id').references(() => proveedores.id),
  tipoConexion:         text('tipo_conexion'),
  tipoServicio:         text('tipo_servicio'),
  cidServicio:          text('cid_servicio'),
  tieneContingencia:    boolean('tiene_contingencia').default(false),
  costoMensual:         numeric('costo_mensual'),
  instruccionReporte:   text('instruccion_reporte'),
  contactoSoporte:      text('contacto_soporte'),
  administradorNombre:  text('administrador_nombre'),
  administradorEmail:   text('administrador_email'),
  administradorCelular: text('administrador_celular'),
  perfilSupervisor:              text('perfil_supervisor'),
  ventaHoraSoles:                numeric('venta_hora_soles'),
  ventaHoraFdsSoles:             numeric('venta_hora_fds_soles'),
  ventaMensualSoles:             numeric('venta_mensual_soles'),
  proporcionFds:                 numeric('proporcion_fds'),
  fuenteVentas:                  text('fuente_ventas'),
  contingenciaActiva:            boolean('contingencia_activa').default(false),
  contingenciaActivadaPor:       text('contingencia_activada_por'),
  contingenciaDescripcion:       text('contingencia_descripcion'),
  contingenciaFecha:             timestamp('contingencia_fecha'),
  tipoPersonalizadoHabilitado:   boolean('tipo_personalizado_habilitado').default(false),
  celularTienda:                 text('celular_tienda'),
  supervisorCelular:             text('supervisor_celular'),
  contingenciaChip:              text('contingencia_chip'),
  contingenciaPaquete:           text('contingencia_paquete'),
  extras:                        text('extras'),
  gabinete:                      boolean('gabinete').default(false),
  vigenciaContrato:              text('vigencia_contrato'),
  descripcionServicio:           text('descripcion_servicio'),
  fechaAltaServicio:             date('fecha_alta_servicio'),
  estadoServicio:                text('estado_servicio').default('ACTIVO'),
  velocidad:                     text('velocidad'),
  planAplicado:                  text('plan_aplicado'),
  observacion:                   text('observacion'),
  fichaActivaId:                 uuid('ficha_activa_id').references((): AnyPgColumn => fichas.id, { onDelete: 'set null' }),
  tipoLocal:                     tipoLocalEnum('tipo_local').notNull().default('TIENDA'),
  tiendaPadreId:                 uuid('tienda_padre_id').references((): AnyPgColumn => tiendas.id, { onDelete: 'set null' }),
  creadoEn:                      timestamp('creado_en').defaultNow(),
})

export const contratosProveedor = pgTable('contratos_proveedor', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  proveedorId:          uuid('proveedor_id').references(() => proveedores.id).notNull(),
  tiendaId:             uuid('tienda_id').references(() => tiendas.id),
  codigoContrato:       text('codigo_contrato'),
  plan:                 text('plan'),
  tipoServicio:         text('tipo_servicio'),
  velocidadCapacidad:   text('velocidad_capacidad'),
  costoMensual:         numeric('costo_mensual'),
  fechaInicio:          date('fecha_inicio'),
  fechaFin:             date('fecha_fin'),
  renovacionAutomatica: boolean('renovacion_automatica').default(false),
  penalidad:            text('penalidad'),
  slaComprometido:      text('sla_comprometido'),
  tiempoRespuestaSla:   integer('tiempo_respuesta_sla'),
  tiempoResolucionSla:  integer('tiempo_resolucion_sla'),
  documentoUrl:         text('documento_url'),
  estado:               text('estado').default('VIGENTE'),
  creadoEn:             timestamp('creado_en').defaultNow(),
})

// ── Fichas (contratos por tienda — reemplaza contratosProveedor) ─────────────

export const fichas = pgTable('fichas', {
  id:          uuid('id').primaryKey().defaultRandom(),
  codigo:      text('codigo').unique().notNull(),      // FC-001-T28
  tiendaId:    uuid('tienda_id').references(() => tiendas.id).notNull(),
  proveedorId: uuid('proveedor_id').references(() => proveedores.id).notNull(),
  estado:      estadoFichaEnum('estado').notNull().default('BORRADOR'),

  // Datos del contrato
  codigoContrato:       text('codigo_contrato'),
  plan:                 text('plan'),
  tipoServicio:         text('tipo_servicio'),
  velocidadCapacidad:   text('velocidad_capacidad'),
  costoMensual:         numeric('costo_mensual'),
  fechaInicio:          date('fecha_inicio'),
  fechaFin:             date('fecha_fin'),
  renovacionAutomatica: boolean('renovacion_automatica').default(false),
  penalidad:            text('penalidad'),
  slaComprometido:      text('sla_comprometido'),
  tiempoRespuestaSla:   integer('tiempo_respuesta_sla'),
  tiempoResolucionSla:  integer('tiempo_resolucion_sla'),
  horarioAtencionSla:   text('horario_atencion_sla'),  // ej: "08:00-20:00 LUN-VIE"
  documentoUrl:         text('documento_url'),

  // Datos de conectividad (migrados desde tiendas)
  tipoConexion:         text('tipo_conexion'),
  cidServicio:          text('cid_servicio'),
  velocidad:            text('velocidad'),
  planAplicado:         text('plan_aplicado'),
  vigenciaContrato:     text('vigencia_contrato'),
  estadoServicio:       text('estado_servicio').default('ACTIVO'),
  fechaAltaServicio:    date('fecha_alta_servicio'),
  descripcionServicio:  text('descripcion_servicio'),
  observacion:          text('observacion'),

  // Meta
  creadoPorId: uuid('creado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  activadoEn:  timestamp('activado_en'),
  archivadoEn: timestamp('archivado_en'),
  creadoEn:    timestamp('creado_en').defaultNow().notNull(),
})

export const fichasNiveles = pgTable('fichas_niveles', {
  id:                     uuid('id').primaryKey().defaultRandom(),
  fichaId:                uuid('ficha_id').references(() => fichas.id, { onDelete: 'cascade' }).notNull(),
  nivel:                  integer('nivel').notNull(),
  nombreContacto:         text('nombre_contacto').notNull(),
  email:                  text('email'),
  celular:                text('celular'),
  tiempoRespSev1:         text('tiempo_resp_sev1'),
  tiempoRespSev2:         text('tiempo_resp_sev2'),
  tiempoRespSev3:         text('tiempo_resp_sev3'),
  correosCopia:           text('correos_copia').array(),
  whatsapp:               text('whatsapp'),
  canal:                  text('canal').default('correo'),
  horarioAtencion:        text('horario_atencion'),
  tiempoEsperadoSolucion: integer('tiempo_esperado_solucion'),
  instruccion:            text('instruccion'),
  activo:                 boolean('activo').default(true),
  creadoEn:               timestamp('creado_en').defaultNow(),
})

export const tiendasHistorial = pgTable('tiendas_historial', {
  id:            uuid('id').primaryKey().defaultRandom(),
  tiendaId:      uuid('tienda_id').references(() => tiendas.id),
  usuarioId:     uuid('usuario_id').references(() => usuarios.id),
  campoEditado:  text('campo_editado').notNull(),
  valorAnterior: text('valor_anterior'),
  valorNuevo:    text('valor_nuevo'),
  editadoEn:     timestamp('editado_en').defaultNow(),
})

export const incidentes = pgTable('incidentes', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  codigo:                text('codigo').unique().notNull(),
  tiendaId:              uuid('tienda_id').references(() => tiendas.id).notNull(),
  registradoPorId:       uuid('registrado_por_id').references(() => usuarios.id).notNull(),
  nivelImpacto:          nivelImpactoEnum('nivel_impacto').notNull(),
  usuariosAfectados:     text('usuarios_afectados'),
  descripcionInicial:    text('descripcion_inicial'),
  tipo:                  tipoIncidenteEnum('tipo').notNull(),
  estado:                estadoIncidenteEnum('estado').notNull().default('ABIERTO'),
  ticketInvgate:         text('ticket_invgate'),
  ticketProveedor:       text('ticket_proveedor'),
  descartesRealizados:   text('descartes_realizados'),
  solucionAplicada:      text('solucion_aplicada'),
  horaRegistro:          timestamp('hora_registro').defaultNow().notNull(),
  horaFin:               timestamp('hora_fin'),
  mttrMinutos:           integer('mttr_minutos'),
  observaciones:         text('observaciones'),
  reabiertaInfo:             text('reabrierta_info'),
  motivoReabertura:          text('motivo_reabertura'),        // 'TIENDA_SIN_INTERNET' | 'ERROR_AGENTE'
  justificacionReabertura:   text('justificacion_reabertura'),
  tiempoAcumuladoMin:        integer('tiempo_acumulado_min'),  // MTTR acumulado de aperturas previas
  proveedorId:           uuid('proveedor_id').references(() => proveedores.id),
  tipoPersonalizado:     text('tipo_personalizado'),
  otrosClasificacion:    text('otros_clasificacion'),
  actualizadoEn:         timestamp('actualizado_en').defaultNow(),
  // Operación
  estadoOperacion:       text('estado_operacion'),
  operacionManual:       boolean('operacion_manual').default(false),
  tipoOperacionManual:   text('tipo_operacion_manual'),
  factorOperativo:       numeric('factor_operativo'),
  // Contingencia en gestión
  contActivadoPor:         text('cont_activado_por'),
  contHoraActivacion:      timestamp('cont_hora_activacion'),
  contRendimiento:         text('cont_rendimiento'),
  contObservacion:         text('cont_observacion'),
  contEsExterno:           boolean('cont_es_externo').default(false),
  contHoraDesactivacion:   timestamp('cont_hora_desactivacion'),
  // Datos móviles en gestión
  movActivadoPor:          text('mov_activado_por'),
  movHoraActivacion:       timestamp('mov_hora_activacion'),
  movRendimiento:          text('mov_rendimiento'),
  movObservacion:          text('mov_observacion'),
  movHoraDesactivacion:    timestamp('mov_hora_desactivacion'),
  // Descartes Sí/No
  descEnergia:           boolean('desc_energia'),
  descRouter:            boolean('desc_router'),
  descDns:               boolean('desc_dns'),
  // Checklist
  checkIpconfig:         boolean('check_ipconfig').default(false),
  checkPingGw:           boolean('check_ping_gw').default(false),
  checkPingInternet:     boolean('check_ping_internet').default(false),
  checkTracert:          boolean('check_tracert').default(false),
  checkDns:              boolean('check_dns').default(false),
  checkRenovarIp:        boolean('check_renovar_ip').default(false),
  descartesDetallado:    text('descartes_detallado'),
  // Resolución
  resueltoPor:           text('resuelto_por'),
  atribucionFinal:       text('atribucion_final'),
  evaluableProveedor:    boolean('evaluable_proveedor').default(true),
  // IEI — condiciones de venta durante el incidente
  boletaManual:            boolean('boleta_manual'),
  boletaRendimiento:       text('boleta_rendimiento'),
  boletaHoraActivacion:    timestamp('boleta_hora_activacion'),
  ventaParcial:          boolean('venta_parcial'),
  cajasAfectadas:        integer('cajas_afectadas'),
  cajasTotales:          integer('cajas_totales'),
  // Corte eléctrico
  alcanceCorte:          alcanceCorteEnum('alcance_corte'),
  tuvoUps:               boolean('tuvo_ups'),
  // Incidente masivo
  grupoMasivoId:         uuid('grupo_masivo_id'),
  // Router externo de contingencia TI
  routerExternoId:       uuid('router_externo_id').references(() => routersExternos.id, { onDelete: 'set null' }),
  // Ficha vigente al momento del registro
  fichaId:               uuid('ficha_id').references(() => fichas.id, { onDelete: 'set null' }),
  // Escalamiento a Infraestructura interna
  escaladoInfraId:       uuid('escalado_infra_id').references(() => usuarios.id, { onDelete: 'set null' }),
  horaEscaladoInfra:     timestamp('hora_escalado_infra'),
  notaEscaladoInfra:     text('nota_escalado_infra'),
  // Auditoría de acciones
  canceladoPorId:        uuid('cancelado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  cerradoPorId:          uuid('cerrado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  resueltoPorUsuarioId:  uuid('resuelto_por_usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
})

// ── Routers externos (contingencia TI) ───────────────────────────────────────

export const routersExternos = pgTable('routers_externos', {
  id:             uuid('id').primaryKey().defaultRandom(),
  codigo:         text('codigo').unique().notNull(),
  ip:             text('ip'),
  password:       text('password'),
  chip:           text('chip'),
  plan:           text('plan'),
  tipoConexion:   text('tipo_conexion'),
  estado:         text('estado').notNull().default('DISPONIBLE'),
  tiendaActualId: uuid('tienda_actual_id').references(() => tiendas.id, { onDelete: 'set null' }),
  fotos:          text('fotos').array().notNull().default([]),
  almacenActual:  text('almacen_actual'),
  activo:         boolean('activo').notNull().default(true),
  creadoEn:       timestamp('creado_en').defaultNow().notNull(),
})

export const routerHistorial = pgTable('router_historial', {
  id:               uuid('id').primaryKey().defaultRandom(),
  routerId:         uuid('router_id').notNull().references(() => routersExternos.id, { onDelete: 'cascade' }),
  tiendaId:         uuid('tienda_id').references(() => tiendas.id),
  fechaIngreso:     timestamp('fecha_ingreso').defaultNow().notNull(),
  fechaRetorno:     timestamp('fecha_retorno'),
  accion:           text('accion').notNull(),
  almacenOrigen:    text('almacen_origen'),
  almacenDestino:   text('almacen_destino'),
  nota:             text('nota'),
  registradoPorId:  uuid('registrado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  creadoEn:         timestamp('creado_en').defaultNow().notNull(),
})

export const gruposMasivos = pgTable('grupos_masivos', {
  id:          uuid('id').primaryKey().defaultRandom(),
  codigo:      text('codigo').unique().notNull(),
  razon:       text('razon').notNull(),
  motivo:      text('motivo'),
  creadoPorId: uuid('creado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  creadoEn:    timestamp('creado_en').defaultNow().notNull(),
})

export const escalamientos = pgTable('escalamientos', {
  id:                      uuid('id').primaryKey().defaultRandom(),
  incidenteId:             uuid('incidente_id').references(() => incidentes.id).notNull(),
  nivel:                   integer('nivel').notNull(),
  nivelEscId:              uuid('nivel_esc_id').references(() => nivelesEscalamiento.id),
  fichaNivelId:            uuid('ficha_nivel_id').references(() => fichasNiveles.id, { onDelete: 'set null' }),
  contactoEscalado:        text('contacto_escalado').notNull(),
  emailContacto:           text('email_contacto').notNull(),
  telefonoContacto:        text('telefono_contacto'),
  tiempoEstimadoSolucion:  text('tiempo_estimado_solucion'),
  horaEnvioCorreo:         timestamp('hora_envio_correo'),
  horaRespuesta:           timestamp('hora_respuesta'),
  tiempoRespuestaMin:      integer('tiempo_respuesta_min'),
  estadoCronometro:        estadoCronometroEnum('estado_cronometro').default('CORRIENDO'),
  cuerpoCorreo:            text('cuerpo_correo'),
  respuestaTexto:          text('respuesta_texto'),
  noHuboRespuesta:         boolean('no_hubo_respuesta').default(false),
  creadoPorId:             uuid('creado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
  creadoEn:                timestamp('creado_en').defaultNow(),
})

export const slaAlertas = pgTable('sla_alertas', {
  id:          uuid('id').primaryKey().defaultRandom(),
  incidenteId: uuid('incidente_id').references(() => incidentes.id, { onDelete: 'cascade' }).notNull(),
  tipo:        text('tipo').notNull(), // 'EN_RIESGO' | 'VENCIDO'
  enviadoEn:   timestamp('enviado_en').defaultNow().notNull(),
})

export const atcLlamadas = pgTable('atc_llamadas', {
  id:             uuid('id').primaryKey().defaultRandom(),
  escalamientoId: uuid('escalamiento_id').references(() => escalamientos.id).notNull(),
  inicio:         timestamp('inicio').notNull(),
  fin:            timestamp('fin'),
  duracionMin:    integer('duracion_min'),
  notas:          text('notas'),
  creadoEn:       timestamp('creado_en').defaultNow(),
})

export const adjuntos = pgTable('adjuntos', {
  id:             uuid('id').primaryKey().defaultRandom(),
  url:            text('url').notNull(),
  nombre:         text('nombre').notNull(),
  tipo:           text('tipo'),
  tamanoBytes:    integer('tamano_bytes'),
  incidenteId:      uuid('incidente_id').references(() => incidentes.id),
  escalamientoId:   uuid('escalamiento_id').references(() => escalamientos.id),
  routerExternoId:  uuid('router_externo_id').references(() => routersExternos.id, { onDelete: 'set null' }),
  contexto:         text('contexto'),
  creadoEn:         timestamp('creado_en').defaultNow(),
})

export const decisiones = pgTable('decisiones', {
  id:               uuid('id').primaryKey().defaultRandom(),
  tipo:             tipoDecisionEnum('tipo').notNull(),
  titulo:           text('titulo').notNull(),
  descripcion:      text('descripcion'),
  motivo:           text('motivo').notNull(),
  estado:           estadoDecisionEnum('estado').default('PENDIENTE'),
  tiendaId:         uuid('tienda_id').references(() => tiendas.id),
  proveedorId:         uuid('proveedor_id').references(() => proveedores.id),
  proveedorAnteriorId: uuid('proveedor_anterior_id').references(() => proveedores.id),
  responsableId:    uuid('responsable_id').references(() => usuarios.id).notNull(),
  fechaSeguimiento: date('fecha_seguimiento'),
  snapSlaPct:       numeric('snap_sla_pct'),
  snapMttrMinutos:  integer('snap_mttr_minutos'),
  snapIei:          numeric('snap_iei'),
  snapIncidentes:   integer('snap_incidentes'),
  snapPeriodo:      text('snap_periodo'),
  snapDetalle:      jsonb('snap_detalle'),
  ejecutadaEn:      timestamp('ejecutada_en'),
  resultadoNota:    text('resultado_nota'),
  postSlaPct:       numeric('post_sla_pct'),
  postMttrMinutos:  integer('post_mttr_minutos'),
  postIei:          numeric('post_iei'),
  postIncidentes:   integer('post_incidentes'),
  postDetalle:      jsonb('post_detalle'),
  aprobadoPorId:    uuid('aprobado_por_id').references(() => usuarios.id),
  aprobadoEn:       timestamp('aprobado_en'),
  rechazadoMotivo:  text('rechazado_motivo'),
  creadoEn:         timestamp('creado_en').defaultNow(),
  actualizadoEn:    timestamp('actualizado_en').defaultNow(),
})

export const contingencias = pgTable('contingencias', {
  id:                uuid('id').primaryKey().defaultRandom(),
  tiendaId:          uuid('tienda_id').references(() => tiendas.id).notNull(),
  tipo:              text('tipo').notNull(), // ROUTER_PROPIO | ROUTER_EXTERNO | DATOS_MOVILES
  activadoPor:       text('activado_por').notNull(),
  usuarioId:         uuid('usuario_id').references(() => usuarios.id),
  horaActivacion:    timestamp('hora_activacion', { withTimezone: true }).defaultNow().notNull(),
  horaDesactivacion: timestamp('hora_desactivacion', { withTimezone: true }),
  justificacion:     text('justificacion').notNull(),
  creadoEn:          timestamp('creado_en').defaultNow(),
})

// ── Relations ─────────────────────────────────────────────────────────────────

export const usuariosRelations = relations(usuarios, ({ many }) => ({
  incidentes:       many(incidentes),
  tiendasHistorial: many(tiendasHistorial),
  decisiones:       many(decisiones),
}))

export const proveedoresRelations = relations(proveedores, ({ many }) => ({
  tiendas:    many(tiendas),
  niveles:    many(nivelesEscalamiento),
  contratos:  many(contratosProveedor),
  fichas:     many(fichas),
  decisiones: many(decisiones),
}))

export const nivelesRelations = relations(nivelesEscalamiento, ({ one }) => ({
  proveedor: one(proveedores, { fields: [nivelesEscalamiento.proveedorId], references: [proveedores.id] }),
}))

export const tiendasRelations = relations(tiendas, ({ one, many }) => ({
  proveedor:   one(proveedores, { fields: [tiendas.proveedorId],    references: [proveedores.id] }),
  fichaActiva: one(fichas,      { fields: [tiendas.fichaActivaId],  references: [fichas.id] }),
  tiendaPadre: one(tiendas,     { fields: [tiendas.tiendaPadreId],  references: [tiendas.id], relationName: 'padre_hijo' }),
  hijos:       many(tiendas,    { relationName: 'padre_hijo' }),
  incidentes:  many(incidentes),
  historial:   many(tiendasHistorial),
  contratos:   many(contratosProveedor),
  fichas:      many(fichas),
  decisiones:  many(decisiones),
}))

export const contratosProveedorRelations = relations(contratosProveedor, ({ one }) => ({
  proveedor: one(proveedores, { fields: [contratosProveedor.proveedorId], references: [proveedores.id] }),
  tienda:    one(tiendas,     { fields: [contratosProveedor.tiendaId],    references: [tiendas.id] }),
}))

export const gruposMasivosRelations = relations(gruposMasivos, ({ one, many }) => ({
  creadoPor:  one(usuarios,    { fields: [gruposMasivos.creadoPorId], references: [usuarios.id] }),
  incidentes: many(incidentes),
}))

export const incidentesRelations = relations(incidentes, ({ one, many }) => ({
  tienda:         one(tiendas,          { fields: [incidentes.tiendaId],        references: [tiendas.id] }),
  registradoPor:  one(usuarios,         { fields: [incidentes.registradoPorId],  references: [usuarios.id] }),
  proveedor:      one(proveedores,      { fields: [incidentes.proveedorId],     references: [proveedores.id] }),
  ficha:          one(fichas,           { fields: [incidentes.fichaId],         references: [fichas.id] }),
  grupoMasivo:    one(gruposMasivos,    { fields: [incidentes.grupoMasivoId],   references: [gruposMasivos.id] }),
  routerExterno:  one(routersExternos,  { fields: [incidentes.routerExternoId], references: [routersExternos.id] }),
  escalamientos:  many(escalamientos),
  adjuntos:       many(adjuntos),
}))

export const routersExternosRelations = relations(routersExternos, ({ one, many }) => ({
  tiendaActual: one(tiendas,         { fields: [routersExternos.tiendaActualId], references: [tiendas.id] }),
  historial:    many(routerHistorial),
  fotos:        many(adjuntos),
}))

export const routerHistorialRelations = relations(routerHistorial, ({ one }) => ({
  router:        one(routersExternos, { fields: [routerHistorial.routerId],        references: [routersExternos.id] }),
  tienda:        one(tiendas,         { fields: [routerHistorial.tiendaId],        references: [tiendas.id] }),
  registradoPor: one(usuarios,        { fields: [routerHistorial.registradoPorId], references: [usuarios.id] }),
}))


export const escalamientosRelations = relations(escalamientos, ({ one, many }) => ({
  incidente:   one(incidentes,           { fields: [escalamientos.incidenteId],   references: [incidentes.id] }),
  nivelEsc:    one(nivelesEscalamiento,  { fields: [escalamientos.nivelEscId],    references: [nivelesEscalamiento.id] }),
  fichaNivel:  one(fichasNiveles,        { fields: [escalamientos.fichaNivelId],  references: [fichasNiveles.id] }),
  adjuntos:    many(adjuntos),
}))

export const adjuntosRelations = relations(adjuntos, ({ one }) => ({
  incidente:     one(incidentes,       { fields: [adjuntos.incidenteId],     references: [incidentes.id] }),
  escalamiento:  one(escalamientos,    { fields: [adjuntos.escalamientoId],  references: [escalamientos.id] }),
  routerExterno: one(routersExternos,  { fields: [adjuntos.routerExternoId], references: [routersExternos.id] }),
}))

export const tiendasHistorialRelations = relations(tiendasHistorial, ({ one }) => ({
  tienda:  one(tiendas,  { fields: [tiendasHistorial.tiendaId],  references: [tiendas.id] }),
  usuario: one(usuarios, { fields: [tiendasHistorial.usuarioId], references: [usuarios.id] }),
}))

export const decisionesRelations = relations(decisiones, ({ one }) => ({
  tienda:              one(tiendas,     { fields: [decisiones.tiendaId],              references: [tiendas.id] }),
  proveedor:           one(proveedores, { fields: [decisiones.proveedorId],           references: [proveedores.id] }),
  proveedorAnterior:   one(proveedores, { fields: [decisiones.proveedorAnteriorId],   references: [proveedores.id] }),
  responsable:         one(usuarios,    { fields: [decisiones.responsableId],         references: [usuarios.id] }),
  aprobadoPor:         one(usuarios,    { fields: [decisiones.aprobadoPorId],         references: [usuarios.id] }),
}))

// ── Gestión de Cambios ────────────────────────────────────────────────────────

export const tipoAccionEnum = pgEnum('tipo_accion', [
  'CAMBIO_PROVEEDOR', 'RENEGOCIACION_CONTRATO', 'ACTUALIZACION_PLAN',
  'AUDITORIA_PROVEEDOR', 'ADQUISICION_EQUIPO', 'PLAN_MEJORA',
])
export const estadoAccionEnum = pgEnum('estado_accion', [
  'BORRADOR', 'PROPUESTO', 'APROBADO', 'EN_EJECUCION',
  'EJECUTADO', 'EN_EVALUACION', 'COMPLETADO', 'RECHAZADO', 'CANCELADO',
])
export const alcanceAccionEnum = pgEnum('alcance_accion', ['TIENDA', 'ZONA'])

// snapDetalle / eval*Detalle JSONB shape:
// { slaRespuestaPct, slaResolucionPct, mttrMin, totalIncidentes, incidentesSlaVencido, ieiAcumulado, penalidadEstimada, porTienda?: [...] }

export const accionesGestion = pgTable('acciones_gestion', {
  id:                       uuid('id').primaryKey().defaultRandom(),
  codigo:                   text('codigo').unique().notNull(),              // AC-001
  tipo:                     tipoAccionEnum('tipo').notNull(),
  estado:                   estadoAccionEnum('estado').notNull().default('BORRADOR'),
  alcance:                  alcanceAccionEnum('alcance').notNull().default('TIENDA'),

  // Descripción
  titulo:                   text('titulo').notNull(),
  descripcion:              text('descripcion'),
  motivo:                   text('motivo').notNull(),
  zonaDescripcion:          text('zona_descripcion'),

  // Scope — tienda única (alcance TIENDA)
  tiendaId:                 uuid('tienda_id').references(() => tiendas.id),

  // Proveedores
  proveedorAnteriorId:      uuid('proveedor_anterior_id').references(() => proveedores.id),
  proveedorNuevoId:         uuid('proveedor_nuevo_id').references(() => proveedores.id),

  // Fichas vinculadas (CAMBIO_PROVEEDOR / RENEGOCIACION_CONTRATO)
  fichaAnteriorId:          uuid('ficha_anterior_id').references(() => fichas.id, { onDelete: 'set null' }),
  fichaNuevaId:             uuid('ficha_nueva_id').references(() => fichas.id, { onDelete: 'set null' }),
  // Contrato previo legacy (RENEGOCIACION_CONTRATO) — se elimina en Phase 6
  contratoAnteriorId:       uuid('contrato_anterior_id').references(() => contratosProveedor.id),

  // Router vinculado (ADQUISICION_EQUIPO)
  routerExternoId:          uuid('router_externo_id').references(() => routersExternos.id, { onDelete: 'set null' }),

  // Personas
  creadoPorId:              uuid('creado_por_id').references(() => usuarios.id).notNull(),
  aprobadoPorId:            uuid('aprobado_por_id').references(() => usuarios.id),
  ejecutadoPorId:           uuid('ejecutado_por_id').references(() => usuarios.id),

  // Timestamps
  creadoEn:                 timestamp('creado_en').defaultNow().notNull(),
  actualizadoEn:            timestamp('actualizado_en').defaultNow().notNull(),

  // Planificación
  fechaEjecucionPlanificada: date('fecha_ejecucion_planificada'),

  // Aprobación
  aprobadoEn:               timestamp('aprobado_en'),
  notasAprobacion:          text('notas_aprobacion'),
  rechazadoMotivo:          text('rechazado_motivo'),

  // Ejecución
  ejecutadoEn:              timestamp('ejecutado_en'),
  notasEjecucion:           text('notas_ejecucion'),

  // Ventanas de evaluación (se calculan al ejecutar)
  fechaEval30:              date('fecha_eval_30'),
  fechaEval90:              date('fecha_eval_90'),

  // Snapshot ANTES (capturado al proponer / al guardar)
  snapPeriodoDias:          integer('snap_periodo_dias').default(90),
  snapSlaPct:               numeric('snap_sla_pct'),
  snapMttrMin:              integer('snap_mttr_min'),
  snapIei:                  numeric('snap_iei'),
  snapNincidentes:          integer('snap_nincidentes'),
  snapDetalle:              jsonb('snap_detalle'),

  // Evaluación 30 días
  eval30Completada:         boolean('eval30_completada').default(false),
  eval30Fecha:              timestamp('eval30_fecha'),
  eval30SlaPct:             numeric('eval30_sla_pct'),
  eval30MttrMin:            integer('eval30_mttr_min'),
  eval30Iei:                numeric('eval30_iei'),
  eval30Nincidentes:        integer('eval30_nincidentes'),
  eval30Detalle:            jsonb('eval30_detalle'),
  eval30Nota:               text('eval30_nota'),

  // Evaluación 90 días
  eval90Completada:         boolean('eval90_completada').default(false),
  eval90Fecha:              timestamp('eval90_fecha'),
  eval90SlaPct:             numeric('eval90_sla_pct'),
  eval90MttrMin:            integer('eval90_mttr_min'),
  eval90Iei:                numeric('eval90_iei'),
  eval90Nincidentes:        integer('eval90_nincidentes'),
  eval90Detalle:            jsonb('eval90_detalle'),
  eval90Nota:               text('eval90_nota'),

  // Penalidad SLA (base para nota de crédito)
  penalidadEstimada:        numeric('penalidad_estimada'),

  // Input del administrador de tienda (fase futura)
  inputTienda:              text('input_tienda'),
})

// Tiendas en scope para acciones de alcance ZONA (múltiples tiendas)
export const accionesGestionTiendas = pgTable('acciones_gestion_tiendas', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  accionId:             uuid('accion_id').notNull().references(() => accionesGestion.id, { onDelete: 'cascade' }),
  tiendaId:             uuid('tienda_id').notNull().references(() => tiendas.id),
  proveedorAnteriorId:  uuid('proveedor_anterior_id').references(() => proveedores.id),
  proveedorNuevoId:     uuid('proveedor_nuevo_id').references(() => proveedores.id),
  fichaAnteriorId:      uuid('ficha_anterior_id').references(() => fichas.id, { onDelete: 'set null' }),
  fichaNuevaId:         uuid('ficha_nueva_id').references(() => fichas.id, { onDelete: 'set null' }),
  snapDetalle:          jsonb('snap_detalle'),
  eval30Detalle:        jsonb('eval30_detalle'),
  eval90Detalle:        jsonb('eval90_detalle'),
  ejecutada:            boolean('ejecutada').default(false),
  creadoEn:             timestamp('creado_en').defaultNow().notNull(),
})

export const fichasRelations = relations(fichas, ({ one, many }) => ({
  tienda:   one(tiendas,     { fields: [fichas.tiendaId],    references: [tiendas.id] }),
  proveedor: one(proveedores, { fields: [fichas.proveedorId], references: [proveedores.id] }),
  creadoPor: one(usuarios,   { fields: [fichas.creadoPorId], references: [usuarios.id] }),
  niveles:   many(fichasNiveles),
}))

export const fichasNivelesRelations = relations(fichasNiveles, ({ one }) => ({
  ficha: one(fichas, { fields: [fichasNiveles.fichaId], references: [fichas.id] }),
}))

export const accionesGestionRelations = relations(accionesGestion, ({ one, many }) => ({
  tienda:            one(tiendas,            { fields: [accionesGestion.tiendaId],            references: [tiendas.id] }),
  proveedorAnterior: one(proveedores,        { fields: [accionesGestion.proveedorAnteriorId], references: [proveedores.id] }),
  proveedorNuevo:    one(proveedores,        { fields: [accionesGestion.proveedorNuevoId],    references: [proveedores.id] }),
  fichaAnterior:     one(fichas,             { fields: [accionesGestion.fichaAnteriorId],     references: [fichas.id] }),
  fichaNueva:        one(fichas,             { fields: [accionesGestion.fichaNuevaId],        references: [fichas.id] }),
  contratoAnterior:  one(contratosProveedor, { fields: [accionesGestion.contratoAnteriorId],  references: [contratosProveedor.id] }),
  routerExterno:     one(routersExternos,    { fields: [accionesGestion.routerExternoId],     references: [routersExternos.id] }),
  creadoPor:         one(usuarios,           { fields: [accionesGestion.creadoPorId],         references: [usuarios.id] }),
  aprobadoPor:       one(usuarios,           { fields: [accionesGestion.aprobadoPorId],       references: [usuarios.id] }),
  ejecutadoPor:      one(usuarios,           { fields: [accionesGestion.ejecutadoPorId],      references: [usuarios.id] }),
  tiendas:           many(accionesGestionTiendas),
}))

export const accionesGestionTiendasRelations = relations(accionesGestionTiendas, ({ one }) => ({
  accion:            one(accionesGestion, { fields: [accionesGestionTiendas.accionId],            references: [accionesGestion.id] }),
  tienda:            one(tiendas,         { fields: [accionesGestionTiendas.tiendaId],            references: [tiendas.id] }),
  proveedorAnterior: one(proveedores,     { fields: [accionesGestionTiendas.proveedorAnteriorId], references: [proveedores.id] }),
  proveedorNuevo:    one(proveedores,     { fields: [accionesGestionTiendas.proveedorNuevoId],    references: [proveedores.id] }),
  fichaAnterior:     one(fichas,          { fields: [accionesGestionTiendas.fichaAnteriorId],     references: [fichas.id] }),
  fichaNueva:        one(fichas,          { fields: [accionesGestionTiendas.fichaNuevaId],        references: [fichas.id] }),
}))
