# Inventario técnico — NetDesk

Generado desde el código fuente (`drizzle/schema.ts`, `app/api/`, `package.json`,
`.env.example`), no desde la base de datos. Insumo para el documento de
arquitectura de la entrega.

---

## 1. Modelo de datos — 21 tablas, 392 columnas

Tipos tal como los declara Drizzle. `nullable` = la columna admite NULL
(Drizzle marca lo contrario con `.notNull()`).

#### `usuarios` — 13 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `nombre` | text | no | — | — |
| `apellido` | text | sí | — | — |
| `email` | text | no | — | — |
| `celular` | text | sí | — | — |
| `password` | text | sí | — | — |
| `rol` | rol | no | 'AGENTE' | — |
| `permisos` | text | sí | — | — |
| `modulos_visibles` | text | sí | — | — |
| `debe_cambiar_password` | boolean | no | false | — |
| `activo` | boolean | sí | true | — |
| `eliminado_en` | timestamp | sí | — | — |
| `creado_en` | timestamp | sí | now() | — |

#### `proveedores` — 9 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `nombre` | text | no | — | — |
| `correo_soporte` | text | sí | — | — |
| `telefono_soporte` | text | sí | — | — |
| `instruccion_general` | text | sí | — | — |
| `plan_principal` | text | sí | — | — |
| `canal_atencion` | text | sí | — | — |
| `observaciones` | text | sí | — | — |
| `creado_en` | timestamp | sí | now() | — |

#### `tiendas` — 46 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `codigo` | text | no | — | — |
| `nombre_cc` | text | sí | — | — |
| `formato` | text | sí | — | — |
| `direccion` | text | sí | — | — |
| `referencia` | text | sí | — | — |
| `distrito` | text | sí | — | — |
| `provincia` | text | sí | — | — |
| `ubicacion` | text | sí | — | — |
| `coordenadas` | text | sí | — | — |
| `cluster` | cluster | sí | — | — |
| `supervisor_nombre` | text | sí | — | — |
| `proveedor_id` | uuid | sí | — | proveedores.id |
| `tiene_contingencia` | boolean | sí | false | — |
| `instruccion_reporte` | text | sí | — | — |
| `contacto_soporte` | text | sí | — | — |
| `anydesk_id` | text | sí | — | — |
| `administrador_nombre` | text | sí | — | — |
| `administrador_email` | text | sí | — | — |
| `administrador_celular` | text | sí | — | — |
| `perfil_supervisor` | text | sí | — | — |
| `venta_hora_soles` | numeric | sí | — | — |
| `venta_hora_fds_soles` | numeric | sí | — | — |
| `venta_mensual_soles` | numeric | sí | — | — |
| `proporcion_fds` | numeric | sí | — | — |
| `fuente_ventas` | text | sí | — | — |
| `contingencia_activa` | boolean | sí | false | — |
| `contingencia_activada_por` | text | sí | — | — |
| `contingencia_descripcion` | text | sí | — | — |
| `contingencia_fecha` | timestamp | sí | — | — |
| `tipo_personalizado_habilitado` | boolean | sí | false | — |
| `celular_tienda` | text | sí | — | — |
| `supervisor_celular` | text | sí | — | — |
| `contingencia_chip` | text | sí | — | — |
| `contingencia_paquete` | text | sí | — | — |
| `extras` | text | sí | — | — |
| `gabinete` | boolean | sí | false | — |
| `observacion` | text | sí | — | — |
| `ficha_activa_id` | uuid | sí | — | — |
| `tipo_local` | tipoLocal | no | 'TIENDA' | — |
| `tienda_padre_id` | uuid | sí | — | — |
| `creado_en` | timestamp | sí | now() | — |
| `estado` | estadoTienda | no | 'ACTIVA' | — |
| `archivada_en` | timestamp | sí | — | — |
| `archivada_por_id` | uuid | sí | — | usuarios.id |
| `archivada_motivo` | text | sí | — | — |

#### `fichas` — 32 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `codigo` | text | no | — | — |
| `tienda_id` | uuid | no | — | tiendas.id |
| `proveedor_id` | uuid | no | — | proveedores.id |
| `estado` | estadoFicha | no | 'BORRADOR' | — |
| `codigo_contrato` | text | sí | — | — |
| `plan` | text | sí | — | — |
| `tipo_servicio` | text | sí | — | — |
| `velocidad_capacidad` | text | sí | — | — |
| `costo_mensual` | numeric | sí | — | — |
| `fecha_inicio` | date | sí | — | — |
| `fecha_fin` | date | sí | — | — |
| `renovacion_automatica` | boolean | sí | false | — |
| `penalidad` | text | sí | — | — |
| `sla_comprometido` | text | sí | — | — |
| `tiempo_respuesta_sla` | integer | sí | — | — |
| `tiempo_resolucion_sla` | integer | sí | — | — |
| `horario_atencion_sla` | text | sí | — | — |
| `documento_url` | text | sí | — | — |
| `tipo_conexion` | text | sí | — | — |
| `cid_servicio` | text | sí | — | — |
| `velocidad` | text | sí | — | — |
| `plan_aplicado` | text | sí | — | — |
| `vigencia_contrato` | text | sí | — | — |
| `estado_servicio` | text | sí | 'ACTIVO' | — |
| `fecha_alta_servicio` | date | sí | — | — |
| `descripcion_servicio` | text | sí | — | — |
| `observacion` | text | sí | — | — |
| `creado_por_id` | uuid | sí | — | usuarios.id |
| `activado_en` | timestamp | sí | — | — |
| `archivado_en` | timestamp | sí | — | — |
| `creado_en` | timestamp | no | now() | — |

#### `fichas_niveles` — 18 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `ficha_id` | uuid | no | — | fichas.id |
| `nivel` | integer | no | — | — |
| `nombre_contacto` | text | no | — | — |
| `email` | text | sí | — | — |
| `celular` | text | sí | — | — |
| `tiempo_resp_sev1` | text | sí | — | — |
| `tiempo_resp_sev2` | text | sí | — | — |
| `tiempo_resp_sev3` | text | sí | — | — |
| `correos_copia` | text | sí | — | — |
| `whatsapp` | text | sí | — | — |
| `canal` | text | sí | 'correo' | — |
| `horario_atencion` | text | sí | — | — |
| `tiempo_esperado_solucion` | integer | sí | — | — |
| `instruccion` | text | sí | — | — |
| `activo` | boolean | sí | true | — |
| `personalizado` | boolean | sí | false | — |
| `creado_en` | timestamp | sí | now() | — |

#### `proveedores_niveles` — 17 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `proveedor_id` | uuid | no | — | proveedores.id |
| `nivel` | integer | no | — | — |
| `nombre_contacto` | text | no | — | — |
| `email` | text | sí | — | — |
| `celular` | text | sí | — | — |
| `tiempo_resp_sev1` | text | sí | — | — |
| `tiempo_resp_sev2` | text | sí | — | — |
| `tiempo_resp_sev3` | text | sí | — | — |
| `correos_copia` | text | sí | — | — |
| `whatsapp` | text | sí | — | — |
| `canal` | text | sí | 'correo' | — |
| `horario_atencion` | text | sí | — | — |
| `tiempo_esperado_solucion` | integer | sí | — | — |
| `instruccion` | text | sí | — | — |
| `activo` | boolean | sí | true | — |
| `creado_en` | timestamp | sí | now() | — |

#### `tiendas_historial` — 8 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `tienda_id` | uuid | sí | — | tiendas.id |
| `usuario_id` | uuid | sí | — | usuarios.id |
| `campo_editado` | text | no | — | — |
| `valor_anterior` | text | sí | — | — |
| `valor_nuevo` | text | sí | — | — |
| `editado_en` | timestamp | sí | now() | — |
| `motivo` | text | no | '' | — |

#### `incidentes` — 76 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `codigo` | text | no | — | — |
| `tienda_id` | uuid | no | — | tiendas.id |
| `registrado_por_id` | uuid | no | — | usuarios.id |
| `nivel_impacto` | nivelImpacto | no | — | — |
| `usuarios_afectados` | text | sí | — | — |
| `descripcion_inicial` | text | sí | — | — |
| `tipo` | tipoIncidente | no | — | — |
| `estado` | estadoIncidente | no | 'ABIERTO' | — |
| `ticket_invgate` | text | sí | — | — |
| `ticket_proveedor` | text | sí | — | — |
| `descartes_realizados` | text | sí | — | — |
| `solucion_aplicada` | text | sí | — | — |
| `hora_registro` | timestamp | no | now() | — |
| `hora_fin` | timestamp | sí | — | — |
| `mttr_minutos` | integer | sí | — | — |
| `observaciones` | text | sí | — | — |
| `reabrierta_info` | text | sí | — | — |
| `motivo_reabertura` | text | sí | — | — |
| `justificacion_reabertura` | text | sí | — | — |
| `tiempo_acumulado_min` | integer | sí | — | — |
| `iei_acumulado` | numeric | sí | — | — |
| `hora_registro_original` | timestamp | sí | — | — |
| `hora_fin_anterior` | timestamp | sí | — | — |
| `proveedor_id` | uuid | sí | — | proveedores.id |
| `tipo_personalizado` | text | sí | — | — |
| `otros_clasificacion` | text | sí | — | — |
| `actualizado_en` | timestamp | sí | now() | — |
| `estado_operacion` | text | sí | — | — |
| `operacion_manual` | boolean | sí | false | — |
| `tipo_operacion_manual` | text | sí | — | — |
| `factor_operativo` | numeric | sí | — | — |
| `cont_activado_por` | text | sí | — | — |
| `cont_hora_activacion` | timestamp | sí | — | — |
| `cont_rendimiento` | text | sí | — | — |
| `cont_observacion` | text | sí | — | — |
| `cont_es_externo` | boolean | sí | false | — |
| `cont_hora_desactivacion` | timestamp | sí | — | — |
| `mov_activado_por` | text | sí | — | — |
| `mov_hora_activacion` | timestamp | sí | — | — |
| `mov_rendimiento` | text | sí | — | — |
| `mov_observacion` | text | sí | — | — |
| `mov_hora_desactivacion` | timestamp | sí | — | — |
| `mitigaciones_previas` | jsonb | sí | — | — |
| `desc_energia` | boolean | sí | — | — |
| `desc_router` | boolean | sí | — | — |
| `desc_cableado` | boolean | sí | — | — |
| `desc_reinicio_equipo` | boolean | sí | — | — |
| `desc_dns` | boolean | sí | — | — |
| `check_ipconfig` | boolean | sí | false | — |
| `check_ping_gw` | boolean | sí | false | — |
| `check_ping_internet` | boolean | sí | false | — |
| `check_tracert` | boolean | sí | false | — |
| `check_dns` | boolean | sí | false | — |
| `check_renovar_ip` | boolean | sí | false | — |
| `descartes_detallado` | text | sí | — | — |
| `resuelto_por` | text | sí | — | — |
| `atribucion_final` | text | sí | — | — |
| `evaluable_proveedor` | boolean | sí | true | — |
| `boleta_manual` | boolean | sí | — | — |
| `boleta_rendimiento` | text | sí | — | — |
| `boleta_hora_activacion` | timestamp | sí | — | — |
| `venta_parcial` | boolean | sí | — | — |
| `cajas_afectadas` | integer | sí | — | — |
| `cajas_totales` | integer | sí | — | — |
| `alcance_corte` | alcanceCorte | sí | — | — |
| `tuvo_ups` | boolean | sí | — | — |
| `grupo_masivo_id` | uuid | sí | — | — |
| `router_externo_id` | uuid | sí | — | routersExternos.id |
| `ficha_id` | uuid | sí | — | fichas.id |
| `escalado_infra_id` | uuid | sí | — | usuarios.id |
| `hora_escalado_infra` | timestamp | sí | — | — |
| `nota_escalado_infra` | text | sí | — | — |
| `cancelado_por_id` | uuid | sí | — | usuarios.id |
| `cerrado_por_id` | uuid | sí | — | usuarios.id |
| `resuelto_por_usuario_id` | uuid | sí | — | usuarios.id |

#### `incidente_mitigacion_tramos` — 13 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `incidente_id` | uuid | no | — | incidentes.id |
| `tipo` | tipoMitigacionTramo | no | — | — |
| `factor` | numeric | no | — | — |
| `activado_por` | text | sí | — | — |
| `observacion` | text | sí | — | — |
| `router_externo_id` | uuid | sí | — | routersExternos.id |
| `desde` | timestamp | no | — | — |
| `hasta` | timestamp | sí | — | — |
| `ie_tramo` | numeric | sí | — | — |
| `origen` | text | no | 'SISTEMA' | — |
| `creado_en` | timestamp | no | now() | — |
| `actualizado_en` | timestamp | no | now() | — |

#### `incidente_mitigacion_tramos_historial` — 9 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `evento_id` | uuid | no | — | — |
| `tramo_id` | uuid | sí | — | incidenteMitigacionTramos.id |
| `incidente_id` | uuid | no | — | — |
| `usuario_id` | uuid | no | — | usuarios.id |
| `accion` | text | no | — | — |
| `valor_anterior` | jsonb | sí | — | — |
| `valor_nuevo` | jsonb | sí | — | — |
| `creado_en` | timestamp | no | now() | — |

#### `routers_externos` — 17 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `codigo` | text | no | — | — |
| `marca` | text | sí | — | — |
| `modelo` | text | sí | — | — |
| `serie` | text | sí | — | — |
| `chip` | text | sí | — | — |
| `plan` | text | sí | — | — |
| `observaciones` | text | sí | — | — |
| `ip` | text | sí | — | — |
| `password` | text | sí | — | — |
| `tipo_conexion` | text | sí | — | — |
| `estado` | text | no | 'DISPONIBLE' | — |
| `tienda_actual_id` | uuid | sí | — | tiendas.id |
| `fotos` | text | no | [] | — |
| `almacen_actual` | text | sí | — | — |
| `activo` | boolean | no | true | — |
| `creado_en` | timestamp | no | now() | — |

#### `router_historial` — 12 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `router_id` | uuid | no | — | routersExternos.id |
| `tienda_id` | uuid | sí | — | tiendas.id |
| `fecha_ingreso` | timestamp | no | now() | — |
| `fecha_retorno` | timestamp | sí | — | — |
| `tiempo_uso_min` | integer | sí | — | — |
| `accion` | text | no | — | — |
| `almacen_origen` | text | sí | — | — |
| `almacen_destino` | text | sí | — | — |
| `nota` | text | sí | — | — |
| `registrado_por_id` | uuid | sí | — | usuarios.id |
| `creado_en` | timestamp | no | now() | — |

#### `grupos_masivos` — 6 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `codigo` | text | no | — | — |
| `razon` | text | no | — | — |
| `motivo` | text | sí | — | — |
| `creado_por_id` | uuid | sí | — | usuarios.id |
| `creado_en` | timestamp | no | now() | — |

#### `escalamientos` — 17 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `incidente_id` | uuid | no | — | incidentes.id |
| `nivel` | integer | no | — | — |
| `ficha_nivel_id` | uuid | sí | — | fichasNiveles.id |
| `contacto_escalado` | text | no | — | — |
| `email_contacto` | text | no | — | — |
| `telefono_contacto` | text | sí | — | — |
| `tiempo_estimado_solucion` | text | sí | — | — |
| `hora_envio_correo` | timestamp | sí | — | — |
| `hora_respuesta` | timestamp | sí | — | — |
| `tiempo_respuesta_min` | integer | sí | — | — |
| `estado_cronometro` | estadoCronometro | sí | 'CORRIENDO' | — |
| `cuerpo_correo` | text | sí | — | — |
| `respuesta_texto` | text | sí | — | — |
| `no_hubo_respuesta` | boolean | sí | false | — |
| `creado_por_id` | uuid | sí | — | usuarios.id |
| `creado_en` | timestamp | sí | now() | — |

#### `sla_alertas` — 4 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `incidente_id` | uuid | no | — | incidentes.id |
| `tipo` | text | no | — | — |
| `enviado_en` | timestamp | no | now() | — |

#### `password_cambios` — 3 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `usuario_id` | uuid | no | — | usuarios.id |
| `creado_en` | timestamp | no | now() | — |

#### `atc_llamadas` — 7 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `escalamiento_id` | uuid | no | — | escalamientos.id |
| `inicio` | timestamp | no | — | — |
| `fin` | timestamp | sí | — | — |
| `duracion_min` | integer | sí | — | — |
| `notas` | text | sí | — | — |
| `creado_en` | timestamp | sí | now() | — |

#### `adjuntos` — 10 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `url` | text | no | — | — |
| `nombre` | text | no | — | — |
| `tipo` | text | sí | — | — |
| `tamano_bytes` | integer | sí | — | — |
| `incidente_id` | uuid | sí | — | incidentes.id |
| `escalamiento_id` | uuid | sí | — | escalamientos.id |
| `router_externo_id` | uuid | sí | — | routersExternos.id |
| `contexto` | text | sí | — | — |
| `creado_en` | timestamp | sí | now() | — |

#### `contingencias` — 9 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `tienda_id` | uuid | no | — | tiendas.id |
| `tipo` | text | no | — | — |
| `activado_por` | text | no | — | — |
| `usuario_id` | uuid | sí | — | usuarios.id |
| `hora_activacion` | timestamp | no | now() | — |
| `hora_desactivacion` | timestamp | sí | — | — |
| `justificacion` | text | no | — | — |
| `creado_en` | timestamp | sí | now() | — |

#### `acciones_gestion` — 54 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `codigo` | text | no | — | — |
| `tipo` | tipoAccion | no | — | — |
| `estado` | estadoAccion | no | 'BORRADOR' | — |
| `alcance` | alcanceAccion | no | 'TIENDA' | — |
| `titulo` | text | no | — | — |
| `descripcion` | text | sí | — | — |
| `motivo` | text | no | — | — |
| `zona_descripcion` | text | sí | — | — |
| `tienda_id` | uuid | sí | — | tiendas.id |
| `proveedor_anterior_id` | uuid | sí | — | proveedores.id |
| `proveedor_nuevo_id` | uuid | sí | — | proveedores.id |
| `ficha_anterior_id` | uuid | sí | — | fichas.id |
| `ficha_nueva_id` | uuid | sí | — | fichas.id |
| `router_externo_id` | uuid | sí | — | routersExternos.id |
| `creado_por_id` | uuid | no | — | usuarios.id |
| `aprobado_por_id` | uuid | sí | — | usuarios.id |
| `ejecutado_por_id` | uuid | sí | — | usuarios.id |
| `creado_en` | timestamp | no | now() | — |
| `actualizado_en` | timestamp | no | now() | — |
| `fecha_ejecucion_planificada` | date | sí | — | — |
| `aprobado_en` | timestamp | sí | — | — |
| `notas_aprobacion` | text | sí | — | — |
| `rechazado_motivo` | text | sí | — | — |
| `ejecutado_en` | timestamp | sí | — | — |
| `notas_ejecucion` | text | sí | — | — |
| `fecha_eval_30` | date | sí | — | — |
| `fecha_eval_90` | date | sí | — | — |
| `snap_periodo_dias` | integer | sí | 90 | — |
| `snap_sla_pct` | numeric | sí | — | — |
| `snap_mttr_min` | integer | sí | — | — |
| `snap_iei` | numeric | sí | — | — |
| `snap_nincidentes` | integer | sí | — | — |
| `snap_detalle` | jsonb | sí | — | — |
| `eval30_completada` | boolean | sí | false | — |
| `eval30_fecha` | timestamp | sí | — | — |
| `eval30_sla_pct` | numeric | sí | — | — |
| `eval30_mttr_min` | integer | sí | — | — |
| `eval30_iei` | numeric | sí | — | — |
| `eval30_nincidentes` | integer | sí | — | — |
| `eval30_detalle` | jsonb | sí | — | — |
| `eval30_nota` | text | sí | — | — |
| `eval30_metodo` | text | sí | — | — |
| `eval90_completada` | boolean | sí | false | — |
| `eval90_fecha` | timestamp | sí | — | — |
| `eval90_sla_pct` | numeric | sí | — | — |
| `eval90_mttr_min` | integer | sí | — | — |
| `eval90_iei` | numeric | sí | — | — |
| `eval90_nincidentes` | integer | sí | — | — |
| `eval90_detalle` | jsonb | sí | — | — |
| `eval90_nota` | text | sí | — | — |
| `eval90_metodo` | text | sí | — | — |
| `penalidad_estimada` | numeric | sí | — | — |
| `input_tienda` | text | sí | — | — |

#### `acciones_gestion_tiendas` — 12 columnas

| columna | tipo | nullable | default | FK |
|---|---|---|---|---|
| `id` | uuid | sí | uuid | — |
| `accion_id` | uuid | no | — | accionesGestion.id |
| `tienda_id` | uuid | no | — | tiendas.id |
| `proveedor_anterior_id` | uuid | sí | — | proveedores.id |
| `proveedor_nuevo_id` | uuid | sí | — | proveedores.id |
| `ficha_anterior_id` | uuid | sí | — | fichas.id |
| `ficha_nueva_id` | uuid | sí | — | fichas.id |
| `snap_detalle` | jsonb | sí | — | — |
| `eval30_detalle` | jsonb | sí | — | — |
| `eval90_detalle` | jsonb | sí | — | — |
| `ejecutada` | boolean | sí | false | — |
| `creado_en` | timestamp | no | now() | — |

**21 tablas · 392 columnas**

---

## 2. API — 79 rutas

La columna *protección* indica el permiso exigido con `can()`; `auth` sola
significa que basta la sesión.

### adjuntos

| ruta | métodos | protección |
|---|---|---|
| `/api/adjuntos` | GET · POST | auth + `incidentes.editar`, `incidentes.ver` |
| `/api/adjuntos/[id]` | DELETE | auth + `incidentes.editar` |

### atc

| ruta | métodos | protección |
|---|---|---|
| `/api/atc/[id]` | PUT · DELETE | auth + `escalamientos.crear` |

### auth

| ruta | métodos | protección |
|---|---|---|
| `/api/auth/[...nextauth]` | — | **pública** |

### contingencias

| ruta | métodos | protección |
|---|---|---|
| `/api/contingencias/[id]` | PATCH | auth + `grupos.gestionar` |

### cron

| ruta | métodos | protección |
|---|---|---|
| `/api/cron/sla-alert` | GET | `CRON_SECRET` |

### dashboard

| ruta | métodos | protección |
|---|---|---|
| `/api/dashboard/analitico` | GET | auth + `dashboard.ver` |
| `/api/dashboard/operativo` | GET | auth + `dashboard.ver` |

### escalamientos

| ruta | métodos | protección |
|---|---|---|
| `/api/escalamientos/[id]` | PUT · DELETE | auth + `escalamientos.crear` |
| `/api/escalamientos/[id]/atc` | POST | auth + `escalamientos.crear` |
| `/api/escalamientos/[id]/enviar-correo` | POST | auth + `escalamientos.crear` |
| `/api/escalamientos/[id]/envio` | PUT | auth + `escalamientos.crear` |
| `/api/escalamientos/[id]/respuesta` | PUT | auth + `escalamientos.crear` |
| `/api/escalamientos/[id]/sin-respuesta` | PUT | auth + `escalamientos.crear` |

### fichas

| ruta | métodos | protección |
|---|---|---|
| `/api/fichas` | GET · POST | auth + `gestion-cambios.crear`, `gestion-cambios.ver` |
| `/api/fichas/[id]` | GET · PUT | auth + `gestion-cambios.crear`, `gestion-cambios.ver` |
| `/api/fichas/[id]/estado` | PATCH | auth + `gestion-cambios.crear` |
| `/api/fichas/[id]/niveles` | GET · POST | auth + `gestion-cambios.crear`, `gestion-cambios.ver` |
| `/api/fichas/[id]/niveles/[nivelId]` | PUT · DELETE | auth + `gestion-cambios.crear` |
| `/api/fichas/[id]/niveles/[nivelId]/resincronizar` | POST | auth + `gestion-cambios.crear` |

### gestion-cambios

| ruta | métodos | protección |
|---|---|---|
| `/api/gestion-cambios` | GET · POST | auth + `gestion-cambios.crear`, `gestion-cambios.ver` |
| `/api/gestion-cambios/[id]` | GET · PUT · DELETE | auth + `gestion-cambios.crear`, `gestion-cambios.ver` |
| `/api/gestion-cambios/[id]/aprobar` | POST | auth + `gestion-cambios.aprobar` |
| `/api/gestion-cambios/[id]/cancelar` | POST | auth + `gestion-cambios.aprobar`, `gestion-cambios.crear` |
| `/api/gestion-cambios/[id]/ejecutar` | POST | auth + `gestion-cambios.aprobar`, `gestion-cambios.crear` |
| `/api/gestion-cambios/[id]/evaluar` | POST | auth + `gestion-cambios.aprobar`, `gestion-cambios.crear` |
| `/api/gestion-cambios/[id]/proponer` | POST | auth + `gestion-cambios.crear` |
| `/api/gestion-cambios/[id]/rechazar` | POST | auth + `gestion-cambios.aprobar` |
| `/api/gestion-cambios/[id]/resetear-eval` | POST | auth + `gestion-cambios.aprobar`, `gestion-cambios.crear` |
| `/api/gestion-cambios/snap` | GET | auth + `gestion-cambios.ver` |

### grupos-masivos

| ruta | métodos | protección |
|---|---|---|
| `/api/grupos-masivos` | POST | auth + `grupos.gestionar` |
| `/api/grupos-masivos/[id]` | GET · PATCH | auth + `grupos.gestionar`, `incidentes.ver` |
| `/api/grupos-masivos/[id]/desvincular` | POST | auth + `grupos.gestionar` |
| `/api/grupos-masivos/[id]/vincular` | POST | auth + `grupos.gestionar` |

### incidentes

| ruta | métodos | protección |
|---|---|---|
| `/api/incidentes` | GET · POST | auth + `incidentes.crear`, `incidentes.ver` |
| `/api/incidentes/[id]` | GET · PUT · DELETE | auth + `incidentes.editar`, `incidentes.eliminar`, `incidentes.ver` |
| `/api/incidentes/[id]/cancelar` | POST | auth + `incidentes.cancelar` |
| `/api/incidentes/[id]/escalar` | POST | auth + `escalamientos.crear` |
| `/api/incidentes/[id]/mitigacion` | POST | auth + `incidentes.editar` |
| `/api/incidentes/[id]/reabrir` | POST | auth + `incidentes.reabrir` |
| `/api/incidentes/[id]/resolver` | POST | auth + `incidentes.editar` |
| `/api/incidentes/[id]/tramos` | GET | auth + `incidentes.ver` |
| `/api/incidentes/[id]/tramos/[tramoId]` | PATCH | auth + `incidentes.editar-tramos` |

### proveedores

| ruta | métodos | protección |
|---|---|---|
| `/api/proveedores` | GET · POST | auth + `proveedores.editar`, `proveedores.ver` |
| `/api/proveedores/[id]` | GET · PUT | auth + `proveedores.editar`, `proveedores.ver` |
| `/api/proveedores/[id]/niveles` | GET · POST | auth + `proveedores.editar`, `proveedores.ver` |
| `/api/proveedores/[id]/niveles/[nivelId]` | PUT · DELETE | auth + `proveedores.editar` |
| `/api/proveedores/[id]/niveles/[nivelId]/impacto` | GET | auth + `proveedores.editar` |
| `/api/proveedores/[id]/tienda/[tiendaId]` | GET | auth + `proveedores.ver` |
| `/api/proveedores/[id]/tiendas` | GET | auth + `proveedores.ver` |

### reportes

| ruta | métodos | protección |
|---|---|---|
| `/api/reportes/export` | GET | auth + `reportes.ver` |
| `/api/reportes/export/fuera-sla` | GET | auth + `reportes.ver` |
| `/api/reportes/export/gerencial` | GET | auth + `reportes.ver` |
| `/api/reportes/export/proveedores` | GET | auth + `reportes.ver` |
| `/api/reportes/export/tiendas-criticas` | GET | auth + `reportes.ver` |

### routers-externos

| ruta | métodos | protección |
|---|---|---|
| `/api/routers-externos` | GET · POST | auth + `mantenimiento.editar`, `mantenimiento.ver` |
| `/api/routers-externos/[id]` | GET · PUT · DELETE | auth + `mantenimiento.editar`, `mantenimiento.ver` |
| `/api/routers-externos/[id]/despliegue` | POST | auth + `mantenimiento.editar` |
| `/api/routers-externos/[id]/retorno` | POST | auth + `mantenimiento.editar` |
| `/api/routers-externos/[id]/traslado` | POST | auth + `mantenimiento.editar` |

### tiendas

| ruta | métodos | protección |
|---|---|---|
| `/api/tiendas` | GET · POST | auth + `mantenimiento.agregar`, `mantenimiento.ver` |
| `/api/tiendas/[id]` | GET · PUT · DELETE | auth + `mantenimiento.editar`, `mantenimiento.eliminar`, `mantenimiento.ver` |
| `/api/tiendas/[id]/baja` | POST | auth + `mantenimiento.eliminar` |
| `/api/tiendas/[id]/contingencia-stats` | GET | auth + `mantenimiento.ver` |
| `/api/tiendas/[id]/contingencias` | GET | auth + `mantenimiento.ver` |
| `/api/tiendas/[id]/impacto-economico` | GET | auth + `mantenimiento.ver` |
| `/api/tiendas/[id]/ultimos-incidentes` | GET | auth + `mantenimiento.ver` |
| `/api/tiendas/export` | GET | auth + `reportes.ver` |
| `/api/tiendas/historial` | GET | auth + `mantenimiento.ver` |
| `/api/tiendas/historial-proveedores` | GET | auth + `mantenimiento.ver` |

### usuarios

| ruta | métodos | protección |
|---|---|---|
| `/api/usuarios` | GET · POST | auth + `usuarios.crear`, `usuarios.ver` |
| `/api/usuarios/[id]` | DELETE · PUT | auth + `usuarios.editar` |
| `/api/usuarios/[id]/incidentes-resueltos` | GET | auth + `usuarios.ver` |
| `/api/usuarios/infra` | GET | auth + `incidentes.ver` |
| `/api/usuarios/me/password` | PATCH | auth |
| `/api/usuarios/publico` | GET | **pública** |

### v1

| ruta | métodos | protección |
|---|---|---|
| `/api/v1/incidentes` | GET | API key (`PBI_API_KEY`) |
| `/api/v1/proveedores` | GET | API key (`PBI_API_KEY`) |
| `/api/v1/tiendas` | GET | API key (`PBI_API_KEY`) |

---

## 3. Estructura del proyecto

```
NetDesk/
├── app/
│   ├── (auth)/            login y cambiar-password (sin sidebar)
│   ├── (dashboard)/       todas las pantallas internas (layout con sidebar)
│   ├── api/               79 route handlers
│   ├── globals.css        design tokens — único lugar del tema
│   ├── layout.tsx         layout raíz
│   └── icon.png           favicon
├── components/
│   ├── brand/             logo y mapa del Perú
│   ├── incidentes/        componentes del módulo de incidentes
│   ├── layout/            Sidebar
│   └── ui/                Badge y primitivas compartidas
├── lib/                   lógica de negocio (18 módulos)
├── drizzle/
│   ├── schema.ts          fuente única del modelo de datos
│   ├── run-sql.ts         migraciones idempotentes (corren en cada arranque)
│   └── migrations/
├── scripts/               migraciones puntuales y herramientas de corrección
├── tests/fixtures/        semillas para la suite
├── types/                 tipos compartidos
├── docs/                  documentación de entrega
└── public/                assets estáticos
```

---

## 4. Dependencias de producción

| paquete | versión | para qué |
|---|---|---|
| `uploadthing` | ^7.7.4 | Archivos |
| `@auth/drizzle-adapter` | ^1.11.2 | Autenticación |
| `bcryptjs` | ^3.0.3 | Autenticación |
| `next-auth` | ^5.0.0-beta.31 | Autenticación |
| `drizzle-orm` | ^0.45.2 | Base de datos |
| `postgres` | ^3.4.9 | Base de datos |
| `dotenv` | ^17.4.2 | Configuración |
| `@types/nodemailer` | ^8.0.0 | Correo |
| `nodemailer` | ^8.0.7 | Correo |
| `next` | 16.2.4 | Framework |
| `react` | 19.2.4 | Framework |
| `react-dom` | 19.2.4 | Framework |
| `recharts` | ^3.8.1 | Gráficas |
| `leaflet` | ^1.9.4 | Mapas |
| `react-leaflet` | ^5.0.0 | Mapas |
| `@base-ui/react` | ^1.4.1 | UI |
| `class-variance-authority` | ^0.7.1 | UI |
| `clsx` | ^2.1.1 | UI |
| `lucide-react` | ^1.11.0 | UI |
| `shadcn` | ^4.5.0 | UI |
| `tailwind-merge` | ^3.5.0 | UI |
| `tw-animate-css` | ^1.4.0 | UI |

### Scripts de npm

| comando | hace |
|---|---|
| `npm run dev` | servidor de desarrollo — `next dev` |
| `npm run build` | build de producción — `next build` |
| `npm run start` | sirve el build — `next start` |
| `npm run lint` | eslint — `eslint` |
| `npm run db:generate` | genera migraciones de Drizzle — `drizzle-kit generate` |
| `npm run db:migrate` | aplica run-sql.ts (lo corre Railway en cada deploy) — `tsx drizzle/run-sql.ts` |
| `npm run db:seed` | siembra datos — `tsx drizzle/seed.ts` |
| `npm run db:add-users` | alta de usuarios — `tsx drizzle/add-users.ts` |
| `npm run geocode` | geocodifica tiendas — `npx tsx scripts/geocode-tiendas.ts` |
| `npm run test` | suite completa — `vitest run` |
| `npm run test:watch` | suite en modo watch — `vitest` |

---

## 5. Variables de entorno

| variable | obligatoria | para qué |
|---|---|---|
| `DATABASE_URL` | sí | cadena de conexión PostgreSQL |
| `NEXTAUTH_SECRET` | sí | firma de los JWT de sesión |
| `NEXTAUTH_URL` | sí | URL base del sistema |
| `CRON_SECRET` | sí | token Bearer que protege el cron de alertas SLA |
| `PBI_API_KEY` | sí | API key de la API pública v1; sin ella responde 401 |
| `APP_URL` | sí | URL base que usa el cron para llamarse a sí mismo |
| `SMTP_HOST` | no | servidor de correo para escalamientos |
| `SMTP_PORT` | no | puerto SMTP (587) |
| `SMTP_USER` | no | usuario SMTP |
| `SMTP_PASS` | no | contraseña SMTP |
| `SMTP_OVERRIDE_TO` | no | modo prueba: desvía **todo** correo a esa casilla. Vacía en operación normal |
| `SMTP_FROM` | no | remitente de los correos |

> El bloque SMTP es opcional: sin él la app funciona, pero el cron de SLA no
> puede enviar avisos por correo.
