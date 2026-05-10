import {
  pgTable, pgEnum, uuid, text, boolean,
  timestamp, integer, numeric,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const rolEnum = pgEnum('rol', ['AGENTE', 'SUPERVISOR', 'GERENCIA', 'INFRAESTRUCTURA'])
export const nivelImpactoEnum = pgEnum('nivel_impacto', ['ALTO', 'MEDIO', 'BAJO'])
export const tipoIncidenteEnum = pgEnum('tipo_incidente', [
  'CAIDA_TOTAL', 'INTERMITENCIA', 'LENTITUD', 'POS', 'OTROS',
])
export const estadoIncidenteEnum = pgEnum('estado_incidente', [
  'ABIERTO', 'EN_SEGUIMIENTO', 'ESCALADO_N1', 'ESCALADO_N2',
  'ESCALADO_N3', 'RESUELTO', 'CANCELADO', 'CERRADO',
])
export const clusterEnum = pgEnum('cluster_tienda', ['A', 'B', 'C', 'D'])
export const estadoCronometroEnum = pgEnum('estado_cronometro', [
  'CORRIENDO', 'RESPONDIDO', 'VENCIDO',
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
  permisos: text('permisos').array(),
  activo:   boolean('activo').default(true),
  creadoEn: timestamp('creado_en').defaultNow(),
})

export const proveedores = pgTable('proveedores', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  nombre:             text('nombre').unique().notNull(),
  correoSoporte:      text('correo_soporte'),
  telefonoSoporte:    text('telefono_soporte'),
  instruccionGeneral: text('instruccion_general'),
  creadoEn:           timestamp('creado_en').defaultNow(),
})

export const nivelesEscalamiento = pgTable('niveles_escalamiento', {
  id:             uuid('id').primaryKey().defaultRandom(),
  proveedorId:    uuid('proveedor_id').references(() => proveedores.id),
  nivel:          integer('nivel').notNull(),
  nombreContacto: text('nombre_contacto').notNull(),
  email:          text('email'),
  celular:        text('celular'),
  tiempoRespSev1: text('tiempo_resp_sev1'),
  tiempoRespSev2: text('tiempo_resp_sev2'),
  tiempoRespSev3: text('tiempo_resp_sev3'),
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
  creadoEn:                      timestamp('creado_en').defaultNow(),
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
  creadoEn:                timestamp('creado_en').defaultNow(),
})

export const adjuntos = pgTable('adjuntos', {
  id:             uuid('id').primaryKey().defaultRandom(),
  url:            text('url').notNull(),
  nombre:         text('nombre').notNull(),
  tipo:           text('tipo'),
  tamanoBytes:    integer('tamano_bytes'),
  incidenteId:    uuid('incidente_id').references(() => incidentes.id),
  escalamientoId: uuid('escalamiento_id').references(() => escalamientos.id),
  creadoEn:       timestamp('creado_en').defaultNow(),
})

export const usuariosRelations = relations(usuarios, ({ many }) => ({
  incidentes:        many(incidentes),
  tiendasHistorial:  many(tiendasHistorial),
}))
export const proveedoresRelations = relations(proveedores, ({ many }) => ({
  tiendas: many(tiendas),
  niveles: many(nivelesEscalamiento),
}))
export const nivelesRelations = relations(nivelesEscalamiento, ({ one }) => ({
  proveedor: one(proveedores, { fields: [nivelesEscalamiento.proveedorId], references: [proveedores.id] }),
}))
export const tiendasRelations = relations(tiendas, ({ one, many }) => ({
  proveedor:  one(proveedores, { fields: [tiendas.proveedorId], references: [proveedores.id] }),
  incidentes: many(incidentes),
  historial:  many(tiendasHistorial),
}))
export const incidentesRelations = relations(incidentes, ({ one, many }) => ({
  tienda:        one(tiendas,     { fields: [incidentes.tiendaId],      references: [tiendas.id] }),
  registradoPor: one(usuarios,    { fields: [incidentes.registradoPorId], references: [usuarios.id] }),
  proveedor:     one(proveedores, { fields: [incidentes.proveedorId],   references: [proveedores.id] }),
  escalamientos: many(escalamientos),
  adjuntos:      many(adjuntos),
}))
export const escalamientosRelations = relations(escalamientos, ({ one, many }) => ({
  incidente: one(incidentes, { fields: [escalamientos.incidenteId], references: [incidentes.id] }),
  nivelEsc:  one(nivelesEscalamiento, { fields: [escalamientos.nivelEscId], references: [nivelesEscalamiento.id] }),
  adjuntos:  many(adjuntos),
}))
export const adjuntosRelations = relations(adjuntos, ({ one }) => ({
  incidente:    one(incidentes,    { fields: [adjuntos.incidenteId],    references: [incidentes.id] }),
  escalamiento: one(escalamientos, { fields: [adjuntos.escalamientoId], references: [escalamientos.id] }),
}))
export const tiendasHistorialRelations = relations(tiendasHistorial, ({ one }) => ({
  tienda:  one(tiendas,   { fields: [tiendasHistorial.tiendaId],  references: [tiendas.id] }),
  usuario: one(usuarios,  { fields: [tiendasHistorial.usuarioId], references: [usuarios.id] }),
}))
