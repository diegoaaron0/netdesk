import {
  pgTable, pgEnum, uuid, text, boolean,
  timestamp, integer, numeric, date,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const rolEnum = pgEnum('rol', ['AGENTE', 'SUPERVISOR', 'GERENCIA', 'INFRAESTRUCTURA'])
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

export const tipoDecisionEnum = pgEnum('tipo_decision', [
  'CAMBIO_PROVEEDOR', 'RENEGOCIACION_CONTRATO', 'ACTIVACION_CONTINGENCIA',
  'REVISION_SLA', 'BAJA_TIENDA', 'CAMBIO_PLAN', 'AUDITORIA_PROVEEDOR', 'OTRO',
])
export const estadoDecisionEnum = pgEnum('estado_decision', [
  'PROPUESTO', 'PENDIENTE', 'EN_EJECUCION', 'EJECUTADA', 'CANCELADA', 'RECHAZADO',
])

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
  fechaAltaServicio:             date('fecha_alta_servicio'),
  estadoServicio:                text('estado_servicio').default('ACTIVO'),
  velocidad:                     text('velocidad'),
  planAplicado:                  text('plan_aplicado'),
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
  horaInicioSeguimiento: timestamp('hora_inicio_seguimiento'),
  horaFin:               timestamp('hora_fin'),
  mttrMinutos:           integer('mttr_minutos'),
  observaciones:         text('observaciones'),
  reabiertaInfo:         text('reabrierta_info'),
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
  boletaManual:          boolean('boleta_manual'),
  ventaParcial:          boolean('venta_parcial'),
  cajasAfectadas:        integer('cajas_afectadas'),
  cajasTotales:          integer('cajas_totales'),
  // Corte eléctrico
  alcanceCorte:          alcanceCorteEnum('alcance_corte'),
  tuvoUps:               boolean('tuvo_ups'),
  // Incidente masivo
  grupoMasivoId:         uuid('grupo_masivo_id'),
  // Escalamiento a Infraestructura interna
  escaladoInfraId:       uuid('escalado_infra_id').references(() => usuarios.id, { onDelete: 'set null' }),
  horaEscaladoInfra:     timestamp('hora_escalado_infra'),
  notaEscaladoInfra:     text('nota_escalado_infra'),
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
  incidenteId:    uuid('incidente_id').references(() => incidentes.id),
  escalamientoId: uuid('escalamiento_id').references(() => escalamientos.id),
  contexto:       text('contexto'),
  creadoEn:       timestamp('creado_en').defaultNow(),
})

export const decisiones = pgTable('decisiones', {
  id:               uuid('id').primaryKey().defaultRandom(),
  tipo:             tipoDecisionEnum('tipo').notNull(),
  titulo:           text('titulo').notNull(),
  descripcion:      text('descripcion'),
  motivo:           text('motivo').notNull(),
  estado:           estadoDecisionEnum('estado').default('PENDIENTE'),
  tiendaId:         uuid('tienda_id').references(() => tiendas.id),
  proveedorId:      uuid('proveedor_id').references(() => proveedores.id),
  responsableId:    uuid('responsable_id').references(() => usuarios.id).notNull(),
  fechaSeguimiento: date('fecha_seguimiento'),
  snapSlaPct:       numeric('snap_sla_pct'),
  snapMttrMinutos:  integer('snap_mttr_minutos'),
  snapIei:          numeric('snap_iei'),
  snapIncidentes:   integer('snap_incidentes'),
  snapPeriodo:      text('snap_periodo'),
  ejecutadaEn:      timestamp('ejecutada_en'),
  resultadoNota:    text('resultado_nota'),
  postSlaPct:       numeric('post_sla_pct'),
  postMttrMinutos:  integer('post_mttr_minutos'),
  postIei:          numeric('post_iei'),
  postIncidentes:   integer('post_incidentes'),
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
  decisiones: many(decisiones),
}))

export const nivelesRelations = relations(nivelesEscalamiento, ({ one }) => ({
  proveedor: one(proveedores, { fields: [nivelesEscalamiento.proveedorId], references: [proveedores.id] }),
}))

export const tiendasRelations = relations(tiendas, ({ one, many }) => ({
  proveedor:  one(proveedores, { fields: [tiendas.proveedorId], references: [proveedores.id] }),
  incidentes: many(incidentes),
  historial:  many(tiendasHistorial),
  contratos:  many(contratosProveedor),
  decisiones: many(decisiones),
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
  tienda:        one(tiendas,       { fields: [incidentes.tiendaId],       references: [tiendas.id] }),
  registradoPor: one(usuarios,      { fields: [incidentes.registradoPorId], references: [usuarios.id] }),
  proveedor:     one(proveedores,   { fields: [incidentes.proveedorId],    references: [proveedores.id] }),
  grupoMasivo:   one(gruposMasivos, { fields: [incidentes.grupoMasivoId],  references: [gruposMasivos.id] }),
  escalamientos: many(escalamientos),
  adjuntos:      many(adjuntos),
}))

export const escalamientosRelations = relations(escalamientos, ({ one, many }) => ({
  incidente: one(incidentes,        { fields: [escalamientos.incidenteId], references: [incidentes.id] }),
  nivelEsc:  one(nivelesEscalamiento, { fields: [escalamientos.nivelEscId],  references: [nivelesEscalamiento.id] }),
  adjuntos:  many(adjuntos),
}))

export const adjuntosRelations = relations(adjuntos, ({ one }) => ({
  incidente:    one(incidentes,    { fields: [adjuntos.incidenteId],    references: [incidentes.id] }),
  escalamiento: one(escalamientos, { fields: [adjuntos.escalamientoId], references: [escalamientos.id] }),
}))

export const tiendasHistorialRelations = relations(tiendasHistorial, ({ one }) => ({
  tienda:  one(tiendas,  { fields: [tiendasHistorial.tiendaId],  references: [tiendas.id] }),
  usuario: one(usuarios, { fields: [tiendasHistorial.usuarioId], references: [usuarios.id] }),
}))

export const decisionesRelations = relations(decisiones, ({ one }) => ({
  tienda:      one(tiendas,     { fields: [decisiones.tiendaId],      references: [tiendas.id] }),
  proveedor:   one(proveedores, { fields: [decisiones.proveedorId],   references: [proveedores.id] }),
  responsable: one(usuarios,    { fields: [decisiones.responsableId], references: [usuarios.id] }),
}))
