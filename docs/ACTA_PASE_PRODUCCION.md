# Acta de Entrega de Pase a Producción — NetDesk

| | | |
|------|------|------|
| **CÓDIGO** | FO-GTI-DTI-05 | |
| **VERSIÓN** | 01 | |
| **APROBACIÓN** | `[DD/MM/AAAA]` | |
| **PÁGINA** | 1 de 1 | |

**GESTIÓN DE CAMBIOS, MEJORAS, PROYECTOS E INICIATIVAS**

---

## Datos de la entrega

| Campo | Detalle |
|-------|---------|
| **Analista Desarrollador** | Diego Junior Ordinola Chonlón |
| **Cargo** | Desarrollador de Software — Mesa de Servicios TI |
| **Programa o Procedimiento** | **Servicio:** NetDesk — Sistema de Gestión de Incidentes de Red<br>**Server (entorno actual, temporal):** https://netdesk-production-2fb0.up.railway.app<br>**Server (destino de producción, Footloose):** Por asignar tras la aprobación de esta acta<br>**Base de Datos:** PostgreSQL — base `netdesk`<br>**Procedimiento Almacenado:** No aplica (migraciones de esquema vía script idempotente `drizzle/run-sql.ts`) |
| **Motivo de la entrega** | Solicitud de aprobación del pase a producción del sistema NetDesk (v1.0) para la gestión centralizada de incidentes de conectividad de red de las 156 tiendas a nivel nacional. La aprobación habilita la asignación del dominio institucional y la migración de la base de datos del entorno temporal al servidor de Footloose (ver Anexo E). |
| **Fecha Entrega** | `[DD/MM/AAAA]` |
| **Fecha Implementación** | `[DD/MM/AAAA]` |

---

## Sección Alterada

### ANTES
No existía un sistema centralizado. La gestión de incidentes de red de las 156 tiendas se
realizaba de forma manual y dispersa (correos / hojas de cálculo), sin trazabilidad ni
métricas de SLA, MTTR ni impacto económico, y sin evaluación objetiva de proveedores.

### DESPUÉS
Se implementa **NetDesk**, aplicación web full-stack (Next.js 16 + PostgreSQL) que centraliza
la gestión de incidentes de conectividad de red de las 156 tiendas, reemplazando el
seguimiento manual por un sistema con trazabilidad completa, métricas y reportería en tiempo
real. Incluye backend con API REST y lógica de negocio en TypeScript, autenticación con
control de acceso por rol y alertas automáticas de SLA.

**Módulos entregados:** gestión de incidentes (escalamiento N1–N3, MTTR, reaperturas),
contingencias, evaluación de proveedores y SLA por contrato, cálculo del Impacto Económico
(IEI), grupos masivos, inventario de routers, gestión de cambios (evaluación 30/90 días),
dashboards operativo y analítico, y 5 reportes exportables a Excel.

*(Arquitectura, alcance y requerimientos de infraestructura: ver Anexos.)*

---

## Firmas

| QUIEN ENTREGA | QUIEN RECIBE | TESTIGO |
|---------------|--------------|---------|
| Diego Junior Ordinola Chonlón<br>Desarrollador de Software | `[Nombre]`<br>`[Cargo]` | `[Nombre]`<br>`[Cargo]` |

*Esta documentación es de propiedad de FOOTLOOSE y está prohibida su reproducción total o parcial sin autorización.*

---
---

# ANEXOS

## Anexo A — Arquitectura de la solución (backend)

- **Tipo:** aplicación web full-stack monolítica sobre **Next.js 16 (App Router) + TypeScript**.
  Un mismo proyecto sirve el frontend (React/SSR) y el backend.
- **Backend / API:** API REST interna en `/api/*` (incidentes, escalamientos, contingencias,
  grupos masivos, reportes, dashboard, usuarios, adjuntos) más **API pública `/api/v1/*`**
  (incidentes, tiendas, proveedores) protegida por API key. Lógica de negocio centralizada en
  `lib/` (cálculo de SLA, IEI, permisos, insights, envío de correos).
- **Base de datos:** **PostgreSQL** vía **Drizzle ORM** (consultas tipadas). Esquema definido en
  código (18 tablas) y aplicado con script idempotente `drizzle/run-sql.ts`. Los adjuntos se
  almacenan como **imágenes base64 dentro de la propia BD** → no requiere almacenamiento de
  objetos externo.
- **Autenticación / Autorización:** **NextAuth v5** (credenciales + JWT, sesión de 8 h),
  contraseñas con **bcrypt (costo 12)**, autorización granular por permisos y **4 roles**
  (AGENTE, SUPERVISOR, GERENCIA, INFRAESTRUCTURA).
- **Tareas programadas:** job de **alertas SLA cada 5 minutos** (`/api/cron/sla-alert`,
  protegido con token Bearer).
- **Notificaciones:** correos de escalamiento a proveedores vía **SMTP (nodemailer)**.
- **Seguridad:** toda ruta valida sesión (`auth()`) y permiso (`can()`); secretos fuera del
  repositorio (variables de entorno); HTTPS obligatorio.

## Anexo B — Alcance funcional entregado

- Gestión de incidentes: registro, escalamiento N1–N3, cronómetros de SLA, resolución con
  cálculo de MTTR, y reaperturas con motivo.
- Contingencias: router propio, router externo, datos móviles y contingencias standalone.
- Evaluación de proveedores y SLA por contrato (fichas), con override de tiempos por ficha activa.
- Cálculo del Impacto Económico del Incidente (IEI).
- Grupos masivos (agrupación de incidentes simultáneos).
- Inventario de routers externos e historial de movimientos.
- Gestión de cambios (acciones con snapshot de KPIs y evaluación a 30/90 días).
- Dashboards: operativo (cola en tiempo real) y analítico (KPIs, SLA, MTTR, tendencias).
- Reportes exportables a Excel: gerencial, seguimiento de proveedores, incumplimientos SLA,
  tiendas críticas e incidentes operativos.
- Administración: usuarios / roles / permisos, tiendas (156), proveedores y fichas/contratos.
- API pública v1 (incidentes, tiendas, proveedores) con autenticación por API key.
- Job automático de alertas de SLA y notificaciones por correo.

## Anexo C — Requerimientos de infraestructura para producción

| Componente | Requerimiento |
|------------|---------------|
| **Servidor de aplicación** | Node.js **20 LTS** (requerido por Next.js 16); ~2 vCPU / 2 GB RAM; Linux o Windows Server |
| **Base de datos** | **PostgreSQL 15+**; espacio en disco considerando que los adjuntos (base64) viven en la BD; **backups automáticos** |
| **Variables de entorno** | `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `DEFAULT_USER_PASSWORD`, `CRON_SECRET`, `APP_URL`, `SMTP_*` |
| **Dominio / red** | Dominio propio + **certificado SSL (HTTPS)**; reverse proxy (nginx / IIS) delante de `next start` (puerto 3000); salida SMTP habilitada |
| **Programador de tareas** | Cron (Linux) o Tareas Programadas (Windows) que invoque cada 5 min `/api/cron/sla-alert` con `Authorization: Bearer $CRON_SECRET` |
| **Gestor de procesos** | pm2 / systemd / servicio de Windows para mantener la aplicación activa |

## Anexo D — Proceso de despliegue

1. `git clone` del repositorio → `npm ci`
2. Configurar `.env` (variables del Anexo C)
3. `npm run db:migrate` → crea/actualiza el esquema (idempotente, corre `drizzle/run-sql.ts`)
4. **Migración de datos** (ver Anexo E)
5. `npm run build` → `npm start` (detrás del reverse proxy con el dominio)
6. Programar el cron de alertas SLA
7. **Verificación post-deploy:** login, registro de incidente, dashboard y descarga de un reporte

## Anexo E — Plan de migración de datos

### 1. Objetivo
Migrar íntegramente la base de datos de NetDesk (**estructura + datos**) desde el entorno actual
al servidor PostgreSQL de Footloose, **sin pérdida de información ni de integridad referencial**.

### 2. Alcance — qué se migra
Las **18 tablas** del sistema con todas sus relaciones, secuencias e índices:
- **Maestros:** usuarios, proveedores, tiendas (156), fichas/contratos, fichas_niveles, routers_externos
- **Operación:** incidentes, escalamientos, atc_llamadas, contingencias, grupos_masivos, adjuntos
- **Gestión y auditoría:** acciones_gestion, acciones_gestion_tiendas, tiendas_historial, router_historial, sla_alertas, password_cambios

### 3. Origen y destino
| | Entorno | Cadena |
|---|---------|--------|
| **Origen** | BD actual (en producción) | `DATABASE_URL` actual |
| **Destino** | PostgreSQL del servidor Footloose | `DATABASE_URL` nueva |

### 4. Prerrequisitos
- BD destino **creada y accesible** (con su cadena de conexión)
- Herramientas **`pg_dump` / `pg_restore`** (PostgreSQL client 15+)
- **Conectividad de red** a ambas BDs desde la máquina que ejecuta la migración
- **Ventana de mantenimiento** acordada (sistema en solo-lectura o detenido durante el cutover)
- Respaldo verificado antes de iniciar

### 5. Estrategia
**Volcado y restauración completos** (full dump & restore) en formato *custom* comprimido. Se
elige este método porque traslada en una sola operación el esquema, los datos, las relaciones
(FKs) y las secuencias, garantizando una **réplica exacta** del origen.

### 6. Procedimiento paso a paso
```powershell
$PG = "C:\Program Files\PostgreSQL\17\bin"

# Paso 1 — Respaldo completo del origen (esquema + datos)
& "$PG\pg_dump.exe" "<DATABASE_URL_ORIGEN>" -Fc -f "netdesk_backup_$(Get-Date -Format yyyyMMdd).dump"

# Paso 2 — Restauración en el servidor destino
& "$PG\pg_restore.exe" --no-owner --no-privileges -d "<DATABASE_URL_DESTINO>" netdesk_backup_*.dump

# Paso 3 — Verificación de conteos (deben coincidir con el origen)
& "$PG\psql.exe" "<DATABASE_URL_DESTINO>" -c "SELECT (SELECT count(*) FROM tiendas) tiendas, (SELECT count(*) FROM incidentes) incidentes, (SELECT count(*) FROM usuarios) usuarios, (SELECT count(*) FROM escalamientos) escalamientos;"
```

### 7. Ventana de mantenimiento (congelamiento)
Durante el cutover se **congela el ingreso de datos** (se avisa a los agentes que no registren
incidentes), para que el volcado sea consistente. Cualquier dato ingresado *después* del
`pg_dump` no se migra.

### 8. Validación post-migración
1. **Comparar conteos** de filas origen vs destino (tiendas, incidentes, usuarios, escalamientos)
2. **Smoke test** apuntando a la BD nueva: login, listar incidentes, abrir un incidente con
   adjuntos, generar un reporte CSV
3. Confirmar que los **dashboards** muestran datos correctos

### 9. Plan de rollback
Se **conservan el archivo de respaldo y el entorno origen intactos** hasta confirmar el éxito.
Si la validación falla, se mantiene el entorno origen como producción y se reintenta — sin
pérdida de datos.

### 10. Responsables y tiempo estimado
- **Ejecuta:** Diego (desarrollador) con apoyo de infraestructura (`[responsable]`)
- **Tiempo estimado:** 30–60 min según volumen de datos

## Anexo F — Validación y plan de contingencia (general)

- **Pruebas realizadas:** compilación de producción sin errores, verificación de tipos
  (TypeScript) limpia, y pruebas funcionales en entorno de desarrollo.
- **Rollback del despliegue:** se conservan el respaldo (`pg_dump`) y la versión previa; ante
  una falla en producción, se restaura la BD y se revierte a la versión anterior.

---

**Datos técnicos de la entrega**
- Versión: 1.0 (primera puesta en producción)
- Repositorio: github.com/Inversiones-Rubins-SAC/fl-netdesk (privado)
- Stack: Next.js 16.2.4 · Drizzle ORM · PostgreSQL · NextAuth v5
