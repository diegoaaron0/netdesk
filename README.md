# NetDesk — Sistema de Gestión de Incidentes de Red

Sistema operativo desarrollado para **Inversiones Rubin's S.A.C. (Footloose Perú)** que gestiona incidentes de conectividad de red en las 156 tiendas a nivel nacional.

## Funcionalidades principales

- Registro y escalamiento de incidentes en tiempo real
- Evaluación de desempeño de proveedores (BITEL, CLARO, ENTEL, CONVERGIA, MOVISTAR)
- Cálculo del Impacto Económico del Incidente (IEI)
- Dashboard operativo para agentes y supervisores
- Dashboard analítico con KPIs, SLA y MTTR para gerencia
- Gestión de contingencias (router propio, router externo, datos móviles)
- Reportes exportables a CSV compatibles con Excel

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 14 App Router (Turbopack) |
| ORM | Drizzle ORM |
| Base de datos | PostgreSQL |
| Autenticación | NextAuth v5 |
| Deploy dev | Railway |
| Deploy producción | Servidor propio Footloose |

## Requisitos

- Node.js 18+
- PostgreSQL 15+
- Variables de entorno configuradas (ver `.env.example`)

## Instalación

```bash
npm install
cp .env.example .env
# Configurar variables de conexión en .env
npm run db:migrate   # aplica el esquema a la BD (corre drizzle/run-sql.ts, idempotente)
npm run dev          # servidor de desarrollo en http://localhost:3000
```

## Variables de entorno requeridas

```
DATABASE_URL=          # cadena de conexión PostgreSQL
NEXTAUTH_SECRET=       # secreto para JWT (generado con openssl rand -base64 32)
NEXTAUTH_URL=          # URL base del sistema (tu dominio)
DEFAULT_USER_PASSWORD= # contraseña inicial de usuarios nuevos
CRON_SECRET=           # token Bearer que protege el cron de alertas SLA
APP_URL=               # URL base usada por el cron
# SMTP para alertas por email (opcional):
SMTP_HOST=  SMTP_PORT=587  SMTP_USER=  SMTP_PASS=  SMTP_FROM=
```

## Migraciones de base de datos

El esquema se aplica con el script **idempotente** `drizzle/run-sql.ts` (vía `npm run db:migrate`),
que es la **fuente única de verdad** del esquema. Se puede correr cuantas veces sea necesario
sin riesgo. Los archivos `.sql` en `drizzle/migrations/` quedan como historial de cambios,
pero **no** son el mecanismo activo (no se usa `drizzle-kit migrate`).

## Despliegue en producción (servidor propio)

```bash
npm ci                 # instalar dependencias
cp .env.example .env   # y completar las variables (ver arriba)
npm run db:migrate     # aplicar/actualizar el esquema (drizzle/run-sql.ts)
npm run build          # compilar
npm start              # next start — servir detrás de un reverse proxy con tu dominio
```

Programar el **cron de alertas SLA** (cada 5 minutos) para que invoque el endpoint protegido:

```bash
*/5 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://TU_DOMINIO/api/cron/sla-alert
```

## Roles de usuario

| Rol | Permisos |
|-----|---------|
| AGENTE | Registrar y resolver incidentes |
| SUPERVISOR | Monitoreo de cola activa y evaluación de proveedores |
| GERENCIA | Dashboard analítico y decisiones gerenciales |
| INFRAESTRUCTURA | Escalamientos de infraestructura interna |

---

Desarrollado por Diego Junior Ordinola Chonlón — Inversiones Rubin's S.A.C.
