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
npm run db:push   # aplicar schema a la base de datos
npm run dev       # servidor de desarrollo en http://localhost:3000
```

## Variables de entorno requeridas

```
DATABASE_URL=        # cadena de conexión PostgreSQL
NEXTAUTH_SECRET=     # secreto para JWT (generado con openssl rand -base64 32)
NEXTAUTH_URL=        # URL base del sistema
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
