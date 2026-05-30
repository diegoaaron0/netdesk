# NetDesk — Sistema de gestión de incidentes de red

## Qué es
NetDesk es una herramienta operativa desarrollada para Footloose Perú
(Inversiones Rubin's S.A.C.) que gestiona incidentes de conectividad de red
en sus 156 tiendas a nivel nacional.

## Para qué sirve
- Registrar y escalar incidentes de red en tiempo real
- Evaluar el desempeño de proveedores (BITEL, CLARO, ENTEL, CONVERGIA, MOVISTAR)
- Calcular el impacto económico estimado (IEI) de cada caída
- Generar reportes gerenciales y operativos en CSV para Excel
- Dashboard operativo en tiempo real para agentes y supervisores
- Dashboard analítico con KPIs, SLA, MTTR y tendencias para gerencia

## Quién lo usa
- Agentes de soporte: registran y resuelven incidentes
- Supervisores: monitorean cola activa y evalúan proveedores
- Walter (Gerente TI): toma decisiones basadas en datos del dashboard analítico
- Angela Chamaya (Coordinadora Mesa de Servicios TI): supervisión general

## Tech stack
- Framework: Next.js 14 App Router (con Turbopack)
- ORM: Drizzle ORM
- Base de datos: PostgreSQL (Railway en dev, servidor Footloose en producción)
- Auth: NextAuth v5
- Deploy: Railway (dev) → servidor propio Footloose (producción)
- Repositorio: github.com/Inversiones-Rubins-SAC/fl-netdesk (privado)

---

## Módulos del sistema (mapeo actual)

### Páginas (app/(dashboard)/)
| Ruta | Descripción |
|------|-------------|
| `/dashboard` | Dashboard operativo (cola en tiempo real) + analítico (KPIs gerenciales) |
| `/incidentes` | Lista de incidentes con filtros; badge Cont. y Datos cuando hay contingencia activa |
| `/incidentes/nuevo` | Formulario de registro de incidente |
| `/incidentes/[id]` | Detalle completo: escalamientos, contingencia, IEI, adjuntos, checklist |
| `/tiendas` | Lista de tiendas con subrayado amarillo cuando tienen contingencia activa |
| `/tiendas/[id]` | Detalle de tienda: historial, contingencias, stats |
| `/proveedores` | Lista de proveedores |
| `/proveedores/[id]` | Detalle: niveles de escalamiento, contratos, tiendas vinculadas |
| `/usuarios` | Gestión de usuarios (roles, permisos, contraseñas) |
| `/reportes` | Generación de CSVs para Excel (gerencial, por proveedor, tiendas críticas) |
| `/decisiones` | Módulo de decisiones gerenciales con seguimiento |

### API routes principales
- `/api/incidentes` — CRUD incidentes; PUT acepta cualquier campo parcial
- `/api/incidentes/[id]/escalar` — crea escalamiento a proveedor
- `/api/incidentes/[id]/resolver` — cierra incidente, calcula MTTR
- `/api/incidentes/[id]/cancelar` — cancela incidente
- `/api/contingencias` — POST crea contingencia standalone; PATCH desactiva
- `/api/tiendas/[id]/contingencia-stats` — stats acumuladas de contingencia
- `/api/grupos-masivos` — gestión de incidentes masivos agrupados
- `/api/dashboard/operativo` — datos en tiempo real: activos, equipo, contingencias, kpis
- `/api/dashboard/analitico` — métricas históricas para dashboard gerencial
- `/api/reportes/export` — CSVs de reportes
- `/api/v1/*` — API pública externa (incidentes, tiendas, proveedores)
- `/api/cron/sla-alert` — job automático de alertas SLA

### Schema — tablas principales (drizzle/schema.ts)
| Tabla | Descripción |
|-------|-------------|
| `usuarios` | Agentes, supervisores, gerencia, infraestructura |
| `tiendas` | 156 tiendas con proveedor, cluster, datos de contingencia |
| `proveedores` | Proveedores de conectividad |
| `niveles_escalamiento` | Contactos por nivel (N1/N2/N3) por proveedor |
| `contratos_proveedor` | Contratos vigentes con SLA comprometido por tienda |
| `incidentes` | Core del sistema — ver campos importantes abajo |
| `escalamientos` | Registro de escalamientos a proveedor con cronómetro |
| `contingencias` | Contingencias standalone (fuera de incidente) |
| `grupos_masivos` | Agrupación de incidentes masivos simultáneos |
| `adjuntos` | Archivos adjuntos a incidentes o escalamientos |
| `atc_llamadas` | Registro de llamadas ATC durante escalamientos |
| `decisiones` | Decisiones gerenciales con snapshot de KPIs |
| `tiendas_historial` | Auditoría de cambios en datos de tiendas |
| `sla_alertas` | Registro de alertas SLA enviadas (evita duplicados) |

### Enums importantes
```
rol:              AGENTE | SUPERVISOR | GERENCIA | INFRAESTRUCTURA
estadoIncidente:  ABIERTO | EN_SEGUIMIENTO | ESCALADO_N1 | ESCALADO_N2 | ESCALADO_N3 | RESUELTO | CANCELADO | CERRADO
tipoIncidente:    CAIDA_TOTAL | INTERMITENCIA | LENTITUD | POS | OTROS | CORTE_ELECTRICO
nivelImpacto:     ALTO | MEDIO | BAJO
cluster:          A | B | C | D
```

### Campos clave del modelo incidente
```
contActivadoPor / contHoraActivacion / contHoraDesactivacion  → contingencia router (propio/externo)
contEsExterno                                                  → true = ROUTER_EXTERNO
movActivadoPor / movHoraActivacion / movHoraDesactivacion     → contingencia datos móviles
escaladoInfraId / horaEscaladoInfra / notaEscaladoInfra       → escalado a equipo infra interno
grupoMasivoId                                                  → pertenece a incidente masivo
resueltoPor / atribucionFinal / evaluableProveedor             → para métricas de proveedor
cajasAfectadas / cajasTotales / ventaParcial / boletaManual   → para cálculo IEI
```

### Libs de lógica de negocio (lib/)
| Archivo | Función |
|---------|---------|
| `sla-core.ts` | Límites SLA por tipo de incidente — fuente única de verdad |
| `sla-contrato.ts` | Override de SLA por contrato de proveedor |
| `impacto-calc.ts` | Cálculo del IEI (Impacto Económico del Incidente) |
| `permisos.ts` | Sistema de permisos granular por rol |
| `permisos-config.ts` | Permisos por defecto de cada rol |
| `mailer.ts` | Envío de correos para escalamientos |
| `geo-zones.ts` | Zonificación geográfica para dashboard de impacto |
| `dashboard-calculations.ts` | Cálculos del dashboard analítico |
| `insights-gen.ts` | Generación automática de insights gerenciales |

### Sistema de contingencias (3 tipos)
- `ROUTER_PROPIO`: activa `tiendas.contingencia_activa = true`; se registra en `incidentes.cont_*`
- `ROUTER_EXTERNO`: igual que ROUTER_PROPIO pero `cont_es_externo = true`
- `DATOS_MOVILES`: NO activa el flag de tienda; se registra en `incidentes.mov_*`
- Standalone: tabla `contingencias` — cualquier tipo, sin incidente asociado
- Desactivar siempre sella timestamps, nunca borra `activadoPor` (preserva historial)

### Dashboard operativo — fuentes de datos
- `contRows`: tiendas con `contingencia_activa = true` (routers)
- `movRows`: incidentes con `mov_activado_por IS NOT NULL AND mov_hora_desactivacion IS NULL`
- `contStandaloneRows`: tabla `contingencias` con `hora_desactivacion IS NULL`
- Incidentes infra: activos con `escalado_infra_id IS NOT NULL` → franja morada en cola

---

## Reglas críticas del sistema — leer antes de cualquier cambio

### SLA
- Toda lógica SLA viene de `lib/sla-core.ts` — NUNCA duplicar constantes
- Límites: CAIDA_TOTAL=60min, INTERMITENCIA=120min, LENTITUD=240min, POS=60min
- `getSlaContrato()` en `lib/sla-contrato.ts` para overrides por proveedor
- Filtrar siempre por `estado='VIGENTE'` en contratos

### Timestamps
- Todos los timestamps se guardan en UTC en la BD
- Se muestran con `AT TIME ZONE 'America/Lima'` en queries SQL
- Fechas desde/hasta en API routes usan sufijo -05:00: `new Date(fecha + 'T00:00:00-05:00')`
- NUNCA usar `T00:00:00` sin offset — se parsea como UTC y da datos incorrectos

### Tiendas
- El identificador principal de tienda es `codigo` (T20, T40, T39, etc.)
- `nombreCc` es el nombre del centro comercial — va siempre como dato secundario
- En UI: `codigo` en bold/grande, `nombreCc` en gris/chico debajo
- En CSV: columnas separadas "Código Tienda" y "Nombre CC"

### Proveedor histórico
- Usar siempre `COALESCE(pi.nombre, pt.nombre)` para el nombre del proveedor
  ```sql
  LEFT JOIN proveedores pi ON i.proveedor_id = pi.id  -- proveedor del incidente
  LEFT JOIN proveedores pt ON t.proveedor_id = pt.id  -- proveedor actual de tienda
  ```
- NUNCA hacer JOIN directo por `t.proveedor_id` solo — pierde el historial

### CSVs y reportes
- BOM UTF-8 al inicio de todo CSV para que Excel abra sin problemas de encoding
- Fechas en columnas separadas: Fecha (DD/MM/YYYY) y Hora (HH:MM)
- IEI como número sin símbolo en la celda, el símbolo va en el header
- Si query retorna 0 filas: CSV con solo headers, nunca error 500

### Contingencias — invariantes de lógica
- Las queries de count para limpiar `tiendas.contingencia_activa` DEBEN incluir `AND cont_hora_desactivacion IS NULL`
  (sin este filtro, incidentes históricos bloqueaban el clear del flag)
- `DATOS_MOVILES` standalone NO debe setear `tiendas.contingencia_activa = true`
- Al desactivar desde operativo: enviar `{ contHoraDesactivacion: now }` o `{ movHoraDesactivacion: now }`, NUNCA `{ contActivadoPor: null }`

### Railway (entorno dev)
- Railway agrega `LIMIT` automático a cualquier SQL en su UI
- Para UPDATE/DELETE desde Railway: envolver en CTE:
  ```sql
  WITH upd AS (UPDATE tabla SET ... RETURNING id) SELECT * FROM upd;
  ```

### Seguridad
- Todo API route debe verificar sesión con `auth()` y permiso con `can()`
- La ruta `/tiendas` requiere permiso `'mantenimiento.ver'`
- Contraseña default de nuevos usuarios: `S0p0rt3@!#`
- Sesión JWT expira a las 8h (`session.maxAge = 8 * 60 * 60` en auth.config.ts)

---

## Autor
Diego Junior Ordinola Chonlón
Desarrollador — NetDesk Footloose
