# Auditoría Técnica — NetDesk
*Fecha: 2026-05-04 | Auditor: Claude Sonnet 4.6*

---

## 1. ARQUITECTURA GENERAL

### Stack tecnológico

| Paquete | Versión | Propósito |
|---|---|---|
| next | 16.2.4 | Framework principal (App Router, Turbopack) |
| react / react-dom | 19.2.4 | UI |
| next-auth | 5.0.0-beta.31 | Autenticación (JWT, CredentialsProvider) |
| drizzle-orm | ^0.45.2 | ORM para PostgreSQL |
| drizzle-kit | ^0.31.10 | Migraciones y generación de schema |
| postgres | ^3.4.9 | Driver PostgreSQL |
| @auth/drizzle-adapter | ^1.11.2 | Adaptador Drizzle para next-auth (**instalado pero no usado**) |
| recharts | ^3.8.1 | Gráficos en páginas (recharts) |
| uploadthing | ^7.7.4 | Upload de archivos adjuntos |
| lucide-react | ^1.11.0 | Íconos |
| @base-ui/react | ^1.4.1 | Componentes UI base |
| shadcn | ^4.5.0 | CLI de componentes (shadcn/ui) |
| clsx + tailwind-merge | — | Utilidades de clases CSS |
| tailwindcss v4 | ^4 | CSS utility-first |
| tsx | ^4.21.0 | Ejecución de scripts TS en dev |
| Node.js | >=20 | Runtime mínimo requerido |
| TypeScript | ^5 | Tipado estático |

### Estructura de carpetas

```
netdesk/
├── app/
│   ├── layout.tsx                  # Root layout (HTML, SessionProvider)
│   ├── page.tsx                    # Redirige a /incidentes
│   ├── (auth)/
│   │   └── login/page.tsx          # Formulario de login
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Layout protegido: verifica sesión, monta Sidebar
│   │   ├── incidentes/
│   │   │   ├── page.tsx            # Lista de incidentes
│   │   │   ├── nuevo/page.tsx      # Formulario de nuevo incidente
│   │   │   └── [id]/page.tsx       # Detalle de incidente
│   │   ├── dashboard/page.tsx      # Dashboard (operativo + analítico)
│   │   ├── reportes/page.tsx       # Reportes simples
│   │   ├── mantenimiento/page.tsx  # CRUD de tiendas
│   │   └── usuarios/page.tsx       # CRUD de usuarios
│   └── api/
│       ├── auth/[...nextauth]/route.ts   # Handler de next-auth
│       ├── incidentes/
│       │   ├── route.ts                  # GET lista, POST crear
│       │   └── [id]/
│       │       ├── route.ts              # GET, PUT, DELETE
│       │       ├── resolver/route.ts     # POST → estado RESUELTO
│       │       ├── cancelar/route.ts     # POST → estado CANCELADO
│       │       ├── reabrir/route.ts      # POST → estado ABIERTO
│       │       └── escalar/route.ts      # POST → crea escalamiento
│       ├── escalamientos/[id]/
│       │   ├── route.ts                  # PUT (edición manual de tiempos)
│       │   ├── envio/route.ts            # PUT → registra hora envío correo
│       │   └── respuesta/route.ts        # PUT → registra hora respuesta
│       ├── tiendas/
│       │   ├── route.ts                  # GET (autocomplete + lista), POST
│       │   └── [id]/
│       │       ├── route.ts              # PUT (editar tienda)
│       │       └── historial/route.ts    # GET últimos 5 incidentes de la tienda
│       ├── usuarios/
│       │   ├── route.ts                  # GET lista, POST crear
│       │   └── [id]/
│       │       ├── route.ts              # PUT editar, DELETE eliminar
│       │       └── invalidar-sesion/route.ts  # POST (stub, no hace nada real)
│       ├── adjuntos/
│       │   ├── route.ts                  # GET por incidenteId, POST registrar
│       │   └── [id]/route.ts             # DELETE
│       ├── reportes/
│       │   ├── route.ts                  # GET stats analíticas (11 queries SQL)
│       │   └── export/route.ts           # GET → CSV
│       └── dashboard/
│           ├── operativo/route.ts        # GET incidentes activos + equipo
│           └── analitico/route.ts        # GET métricas analíticas (alternativa)
├── components/
│   ├── layout/Sidebar.tsx          # Sidebar fijo de navegación
│   ├── ui/
│   │   ├── Badge.tsx               # Badge de estado/impacto
│   │   ├── MetricCard.tsx          # Tarjeta de métrica
│   │   ├── button.tsx / input.tsx / select.tsx / textarea.tsx / card.tsx / table.tsx
│   ├── incidentes/
│   │   ├── TiendaAutocomplete.tsx  # Búsqueda de tienda en tiempo real
│   │   ├── CronometroPrincipal.tsx # Cronómetro del incidente
│   │   ├── CronometroEscalamiento.tsx  # Cronómetro por escalamiento
│   │   ├── GuiaEscalamiento.tsx    # Muestra instrucciones del proveedor
│   │   └── AdjuntosZona.tsx        # Upload/lista de adjuntos (uploadthing)
│   └── SessionProviderWrapper.tsx  # Envuelve en SessionProvider del cliente
├── drizzle/
│   ├── schema.ts                   # Definición de todas las tablas
│   ├── seed.ts                     # Script de población inicial
│   └── run-sql.ts                  # Script para migraciones en deploy (Railway)
├── lib/
│   ├── db.ts                       # Instancia de Drizzle + cliente postgres
│   └── permisos.ts                 # PERMISOS_POR_ROL, getPermisos(), can()
├── auth.ts                         # Configuración de NextAuth
├── proxy.ts                        # Proxy (equivalente a middleware en Next.js 16)
├── next.config.ts                  # Configuración Next.js (vacía actualmente)
├── drizzle.config.ts               # Config de drizzle-kit
├── railway.toml                    # Config de deploy en Railway
└── package.json
```

### Flujo de una request

```
Navegador → Railway (HTTPS)
  → Next.js 16 (Node.js runtime)
    → proxy.ts  ← verifica sesión via next-auth JWT
      → Si no hay sesión: redirect /login
      → Si no tiene permiso para la ruta: redirect /incidentes o /login
    → app/(dashboard)/layout.tsx (Server Component)
      → auth() → verifica sesión nuevamente
      → Si no hay sesión: redirect /login
      → Renderiza Sidebar + children
    → page.tsx (Client Component)
      → useSession() → lee JWT del cliente
      → fetch() → /api/...
        → route.ts (Server Component/API)
          → auth() → verifica sesión JWT
          → can(session, 'permiso') → verifica permiso
          → db.select/insert/update/delete → postgres (Railway PostgreSQL o external)
          → NextResponse.json(...)
    → Cliente recibe JSON y actualiza estado React
```

---

## 2. BASE DE DATOS

### Tablas y columnas

**`usuarios`**
| Columna | Tipo | Nullable | Default | Notas |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| nombre | text | NO | — | |
| apellido | text | SÍ | NULL | |
| email | text | NO | — | UNIQUE |
| celular | text | SÍ | NULL | |
| password | text | SÍ | `'soporte123'` | **Plaintext, sin hash** |
| rol | rolEnum | NO | `'AGENTE'` | AGENTE/SUPERVISOR/GERENCIA/INFRAESTRUCTURA |
| cluster | clusterEnum | SÍ | NULL | A/B/C/D |
| permisos | text[] | SÍ | NULL | NULL = usar defaults del rol |
| activo | boolean | SÍ | true | |
| creado_en | timestamp | SÍ | now() | |

**`proveedores`**
| Columna | Tipo | Nullable | Notas |
|---|---|---|---|
| id | uuid | NO | PK |
| nombre | text | NO | UNIQUE |
| correo_soporte | text | SÍ | |
| telefono_soporte | text | SÍ | |
| instruccion_general | text | SÍ | |
| creado_en | timestamp | SÍ | |

**`niveles_escalamiento`**
| Columna | Tipo | Nullable | Notas |
|---|---|---|---|
| id | uuid | NO | PK |
| proveedor_id | uuid | SÍ | FK → proveedores.id |
| nivel | integer | NO | 1, 2, 3 |
| nombre_contacto | text | NO | |
| email | text | SÍ | |
| celular | text | SÍ | |
| tiempo_resp_sev1 | text | SÍ | Texto libre ("2 horas") |
| tiempo_resp_sev2 | text | SÍ | |
| tiempo_resp_sev3 | text | SÍ | |

**`tiendas`**
| Columna | Tipo | Nullable | Notas |
|---|---|---|---|
| id | uuid | NO | PK |
| codigo | text | NO | UNIQUE |
| nombre_cc | text | SÍ | |
| formato | text | SÍ | |
| direccion | text | SÍ | |
| referencia | text | SÍ | |
| distrito | text | SÍ | |
| provincia | text | SÍ | |
| ubicacion | text | SÍ | |
| coordenadas | text | SÍ | |
| cluster | clusterEnum | SÍ | A/B/C/D |
| supervisor_nombre | text | SÍ | |
| proveedor_id | uuid | SÍ | FK → proveedores.id |
| tipo_conexion | text | SÍ | |
| tipo_servicio | text | SÍ | |
| cid_servicio | text | SÍ | |
| tiene_contingencia | boolean | SÍ | default false |
| costo_mensual | numeric | SÍ | |
| instruccion_reporte | text | SÍ | |
| contacto_soporte | text | SÍ | |
| administrador_nombre | text | SÍ | |
| administrador_email | text | SÍ | |
| administrador_celular | text | SÍ | |
| perfil_supervisor | text | SÍ | |
| creado_en | timestamp | SÍ | |

**`incidentes`**
| Columna | Tipo | Nullable | Notas |
|---|---|---|---|
| id | uuid | NO | PK |
| codigo | text | NO | UNIQUE ("00001A") |
| tienda_id | uuid | NO | FK → tiendas.id |
| registrado_por_id | uuid | NO | FK → usuarios.id |
| nivel_impacto | nivelImpactoEnum | NO | ALTO/MEDIO/BAJO |
| usuarios_afectados | text | SÍ | |
| descripcion_inicial | text | SÍ | |
| tipo | tipoIncidenteEnum | NO | CAIDA_TOTAL/INTERMITENCIA/LENTITUD/POS/OTROS |
| estado | estadoIncidenteEnum | NO | default ABIERTO |
| ticket_invgate | text | SÍ | |
| ticket_proveedor | text | SÍ | |
| descartes_realizados | text | SÍ | |
| solucion_aplicada | text | SÍ | |
| hora_registro | timestamp | NO | defaultNow() |
| hora_inicio_seguimiento | timestamp | SÍ | |
| hora_fin | timestamp | SÍ | |
| mttr_minutos | integer | SÍ | |
| observaciones | text | SÍ | |
| reabrierta_info | text | SÍ | |
| actualizado_en | timestamp | SÍ | defaultNow() |

**`escalamientos`**
| Columna | Tipo | Nullable | Notas |
|---|---|---|---|
| id | uuid | NO | PK |
| incidente_id | uuid | NO | FK → incidentes.id |
| nivel | integer | NO | 1/2/3 |
| nivel_esc_id | uuid | SÍ | FK → niveles_escalamiento.id |
| contacto_escalado | text | NO | |
| email_contacto | text | NO | |
| telefono_contacto | text | SÍ | |
| tiempo_estimado_solucion | text | SÍ | |
| hora_envio_correo | timestamp | SÍ | |
| hora_respuesta | timestamp | SÍ | |
| tiempo_respuesta_min | integer | SÍ | |
| estado_cronometro | estadoCronometroEnum | SÍ | CORRIENDO/RESPONDIDO/VENCIDO |
| cuerpo_correo | text | SÍ | |
| creado_en | timestamp | SÍ | |

**`adjuntos`**
| Columna | Tipo | Nullable | Notas |
|---|---|---|---|
| id | uuid | NO | PK |
| url | text | NO | |
| nombre | text | NO | |
| tipo | text | SÍ | MIME type |
| tamano_bytes | integer | SÍ | |
| incidente_id | uuid | SÍ | FK → incidentes.id |
| escalamiento_id | uuid | SÍ | FK → escalamientos.id |
| creado_en | timestamp | SÍ | |

### Relaciones

```
proveedores 1──N tiendas
proveedores 1──N niveles_escalamiento
tiendas     1──N incidentes
usuarios    1──N incidentes  (registrado_por_id)
incidentes  1──N escalamientos
incidentes  1──N adjuntos
escalamientos 1──N adjuntos
escalamientos N──1 niveles_escalamiento  (nivel_esc_id, nullable)
```

### Índices

Sólo los creados automáticamente por restricciones:
- `usuarios.email` — UNIQUE
- `proveedores.nombre` — UNIQUE
- `tiendas.codigo` — UNIQUE
- `incidentes.codigo` — UNIQUE
- PKs (uuid) en todas las tablas

**No hay índices explícitos** sobre columnas de consulta frecuente como `incidentes.hora_registro`, `incidentes.tienda_id`, `incidentes.estado`, o `escalamientos.incidente_id`.

### Inconsistencias código vs. BD

| Problema | Archivo | Línea | Detalle |
|---|---|---|---|
| `i.impacto` no existe | `app/api/reportes/export/route.ts` | 20 | SQL usa `i.impacto`, la columna real es `nivel_impacto` → siempre NULL en CSV |
| `i.agente_id` no existe | `app/api/reportes/export/route.ts` | 35 | SQL usa `i.agente_id`, la columna real es `registrado_por_id` → JOIN siempre falla |
| `CRITICO` no está en el enum | `app/(dashboard)/incidentes/[id]/page.tsx` | 409 | El select de supervisor muestra `CRITICO` como opción pero `nivelImpactoEnum` sólo tiene ALTO/MEDIO/BAJO |
| `admin` no existe como permiso | `app/api/escalamientos/[id]/route.ts` | 12 | Verifica `can(session, 'admin')` pero ese permiso no está definido en ningún rol |

---

## 3. AUTENTICACIÓN Y SESIONES

### Flujo de login

1. Usuario accede a `/login` (page.tsx client component)
2. Hace POST a `/api/auth/signin` via `signIn('credentials', {...})`
3. next-auth llama a `authorize()` en `auth.ts:17`
4. `authorize()` busca el usuario por email en la BD
5. Verifica que `user.activo === true`
6. Compara `credentials.password === user.password` (**texto plano**)
7. Si válido, retorna `{ id, name, email, rol, permisos }`
8. next-auth ejecuta callback `jwt()` → agrega `rol` y `permisos` al token
9. next-auth ejecuta callback `session()` → expone `rol` y `permisos` en `session.user`
10. Se emite cookie de sesión HTTP-only con JWT firmado con `NEXTAUTH_SECRET`
11. `proxy.ts` verifica la sesión en cada request a rutas protegidas

### Contenido del JWT

```typescript
// Campos estándar de next-auth:
token.sub          // user.id (uuid)
token.name         // user.nombre
token.email        // user.email

// Campos custom (auth.ts:29-36):
token.rol          // string: 'AGENTE' | 'SUPERVISOR' | 'GERENCIA' | 'INFRAESTRUCTURA'
token.permisos     // string[] | null — null significa "usar defaults del rol"
```

Los permisos se cargan **una sola vez al hacer login** desde la BD (`auth.ts:32-34`). Cualquier cambio posterior en la BD no se refleja hasta que el usuario cierra sesión y vuelve a entrar.

### Verificación por request

| Capa | Mecanismo | Archivo |
|---|---|---|
| Proxy (routing) | `auth()` de next-auth + check manual | `proxy.ts:5-28` |
| Layout del dashboard | `auth()` server-side + `redirect()` | `app/(dashboard)/layout.tsx:6-8` |
| APIs | `await auth()` + `if (!session) return 401` | Cada `route.ts` |
| Páginas (client) | `useSession()` de next-auth/react | Cada `page.tsx` |
| Sidebar | `getPermisos(session)` para filtrar nav | `components/layout/Sidebar.tsx:41` |

---

## 4. SISTEMA DE PERMISOS

### Roles definidos (`lib/permisos.ts`)

| Permiso | AGENTE | SUPERVISOR | GERENCIA | INFRAESTRUCTURA |
|---|:---:|:---:|:---:|:---:|
| incidentes.ver | ✓ | ✓ | — | ✓ |
| incidentes.crear | ✓ | ✓ | — | ✓ |
| incidentes.reabrir | ✓ | ✓ | — | ✓ |
| incidentes.editar | — | ✓ | — | — |
| incidentes.eliminar | — | ✓ | — | — |
| escalamientos.crear | ✓ | ✓ | — | ✓ |
| escalamientos.envio | ✓ | ✓ | — | ✓ |
| escalamientos.respuesta | ✓ | ✓ | — | ✓ |
| mantenimiento.ver | ✓ | ✓ | ✓ | ✓ |
| mantenimiento.editar | — | ✓ | — | ✓ |
| mantenimiento.agregar | — | ✓ | — | ✓ |
| dashboard.ver | — | ✓ | ✓ | ✓ |
| reportes.ver | — | ✓ | ✓ | — |
| reportes.exportar | — | ✓ | ✓ | — |
| usuarios.ver | — | ✓ | — | — |
| usuarios.editar | — | ✓ | — | — |
| usuarios.crear | — | ✓ | — | — |

Los permisos pueden sobreescribirse por usuario guardando un array custom en `usuarios.permisos`.

### Funciones `can()` y `getPermisos()`

```typescript
// lib/permisos.ts:27-32
export function getPermisos(session: any): string[] {
  const rol = session?.user?.rol ?? 'AGENTE'
  const custom = session?.user?.permisos
  if (custom && Array.isArray(custom) && custom.length > 0) return custom
  return PERMISOS_POR_ROL[rol] ?? []
}

// lib/permisos.ts:37-39
export function can(session: any, permiso: string): boolean {
  return getPermisos(session).includes(permiso)
}
```

Lógica: si `session.user.permisos` es un array no vacío → usa esos; si no → usa los defaults del rol. No hay lógica de "permisos del rol + extras": es todo-o-nada.

### Dónde se aplican los permisos

| Ubicación | Permiso verificado | Método |
|---|---|---|
| `proxy.ts:20-25` | `dashboard.ver`, `reportes.ver`, `usuarios.ver` | `can()` con redirect |
| `api/incidentes/route.ts:43,82` | auth + `incidentes.crear` | `auth()` + `can()` |
| `api/incidentes/[id]/route.ts:11,77,103` | auth + `incidentes.eliminar` | `auth()` + `can()` |
| `api/usuarios/route.ts:10,29` | `usuarios.ver` + `usuarios.crear` | `can()` |
| `api/usuarios/[id]/route.ts:12,22` | `usuarios.editar` | `can()` |
| `api/usuarios/[id]/invalidar-sesion/route.ts:12` | `usuarios.editar` | `can()` |
| `api/reportes/route.ts:10` | `reportes.ver` | `can()` |
| `api/reportes/export/route.ts:10` | `reportes.ver` | `can()` |
| `api/dashboard/analitico/route.ts:10` | `dashboard.ver` | `can()` |
| `api/escalamientos/[id]/route.ts:12` | `admin` (**bug: no existe**) | `can()` |
| `components/layout/Sidebar.tsx:57` | Cada item de nav | `permisos.includes()` |
| `app/(dashboard)/incidentes/[id]/page.tsx:190` | `incidentes.editar` | `can()` (client) |
| `app/(dashboard)/usuarios/page.tsx:76-77` | `usuarios.editar`, `usuarios.crear` | `can()` (client) |

### Dónde NO se aplican pero deberían

| Endpoint | Problema |
|---|---|
| `GET /api/tiendas` | Sin autenticación — cualquier persona sin sesión puede listar todas las tiendas |
| `GET /api/tiendas/[id]/historial` | Sin autenticación — acceso público al historial de incidentes |
| `POST /api/incidentes/[id]/resolver` | Solo verifica auth, no verifica ningún permiso específico — cualquier agente puede resolver incidentes ajenos |
| `POST /api/incidentes/[id]/cancelar` | Solo verifica auth — cualquier agente puede cancelar cualquier incidente |
| `POST /api/incidentes/[id]/reabrir` | Solo verifica auth, no verifica `incidentes.reabrir` |
| `POST /api/incidentes/[id]/escalar` | Solo verifica auth, no verifica `escalamientos.crear` |
| `PUT /api/escalamientos/[id]/envio` | Solo verifica auth, no verifica `escalamientos.envio` |
| `PUT /api/escalamientos/[id]/respuesta` | Solo verifica auth, no verifica `escalamientos.respuesta` |
| `PUT /api/incidentes/[id]` | Solo verifica auth, no verifica `incidentes.editar` — cualquier agente puede editar |
| `GET /api/dashboard/operativo` | Verifica `rol === 'SUPERVISOR'` (hardcoded) en vez de `can(session, 'dashboard.ver')` — excluye GERENCIA e INFRAESTRUCTURA que sí tienen ese permiso |
| `/reportes` page (client) | No verifica permiso antes de mostrar la página (el proxy protege la ruta, pero el componente carga datos sin verificar) |

---

## 5. APIs — INVENTARIO COMPLETO

### `GET /api/auth/[...nextauth]` · `POST /api/auth/[...nextauth]`
- **Archivo:** `app/api/auth/[...nextauth]/route.ts`
- **Qué hace:** Handler estándar de next-auth para signin, signout, session, csrf
- **Autenticación:** Gestionada por next-auth internamente
- **Retorna:** Depende del endpoint de next-auth

---

### `GET /api/incidentes`
- **Archivo:** `app/api/incidentes/route.ts:41`
- **Qué hace:** Lista incidentes con JOIN a tiendas/proveedores/usuarios. Separa "vencidos" (abiertos de días anteriores) de regulares. Acepta filtros por fecha, estado, agente.
- **Autenticación:** `auth()` → 401 si no hay sesión. No verifica permiso específico.
- **Parámetros:** `fechaDesde`, `fechaHasta`, `estado`, `agente` (query params)
- **Retorna:** Array de incidentes con `isOverdue: boolean`. Los vencidos van primero.
- **Nota:** La zona horaria de Lima se hardcodea como UTC-5 (`todayLima()` línea 10).

### `POST /api/incidentes`
- **Archivo:** `app/api/incidentes/route.ts:79`
- **Qué hace:** Crea un nuevo incidente. Genera código único tipo "00001A".
- **Autenticación:** `auth()` + `can(session, 'incidentes.crear')`
- **Retorna:** El incidente creado (status 201)
- **Bug de concurrencia:** El código usa `COUNT(*)+1` como secuencia (`línea 89-98`). Dos requests simultáneas pueden generar el mismo número de secuencia, aunque lo resuelve con un loop de reintentos.
- **Sin validación:** No valida que `tiendaId` exista, que `nivelImpacto` sea un valor válido, ni que `tipo` sea un valor del enum.

---

### `GET /api/incidentes/[id]`
- **Archivo:** `app/api/incidentes/[id]/route.ts:8`
- **Qué hace:** Retorna un incidente completo con tienda, proveedor, escalamientos, niveles de escalamiento del proveedor.
- **Autenticación:** `auth()` → 401
- **Retorna:** Objeto con el incidente + `escalamientos[]` + `nivelesProveedor[]`

### `PUT /api/incidentes/[id]`
- **Archivo:** `app/api/incidentes/[id]/route.ts:74`
- **Qué hace:** Edita campos permitidos del incidente (whitelist explícita en línea 81).
- **Autenticación:** Solo `auth()`. **No verifica `incidentes.editar`.**
- **Retorna:** El incidente actualizado.

### `DELETE /api/incidentes/[id]`
- **Archivo:** `app/api/incidentes/[id]/route.ts:99`
- **Qué hace:** Elimina incidente y en cascada sus adjuntos y escalamientos.
- **Autenticación:** `auth()` + `can(session, 'incidentes.eliminar')`
- **Retorna:** `{ ok: true }`

---

### `POST /api/incidentes/[id]/resolver`
- **Archivo:** `app/api/incidentes/[id]/resolver/route.ts`
- **Qué hace:** Marca el incidente como RESUELTO, registra `hora_fin` = now(), calcula `mttr_minutos`.
- **Autenticación:** Solo `auth()`. No verifica permiso.
- **Retorna:** Incidente actualizado.

### `POST /api/incidentes/[id]/cancelar`
- **Archivo:** `app/api/incidentes/[id]/cancelar/route.ts`
- **Qué hace:** Marca el incidente como CANCELADO, registra `hora_fin`.
- **Autenticación:** Solo `auth()`. No verifica permiso.
- **Retorna:** Incidente actualizado.

### `POST /api/incidentes/[id]/reabrir`
- **Archivo:** `app/api/incidentes/[id]/reabrir/route.ts`
- **Qué hace:** Vuelve el incidente a ABIERTO, resetea `hora_fin` y `mttr_minutos`, guarda motivo en `reabrierta_info`.
- **Autenticación:** Solo `auth()`. No verifica `incidentes.reabrir`.
- **Body:** `{ motivo?: string }`
- **Retorna:** Incidente actualizado.

### `POST /api/incidentes/[id]/escalar`
- **Archivo:** `app/api/incidentes/[id]/escalar/route.ts`
- **Qué hace:** Crea un registro de escalamiento, actualiza el estado del incidente a `ESCALADO_N1/N2/N3`.
- **Autenticación:** Solo `auth()`. No verifica `escalamientos.crear`.
- **Sin validación:** No verifica que el incidente exista ni que `nivel` sea 1-3.

---

### `PUT /api/escalamientos/[id]`
- **Archivo:** `app/api/escalamientos/[id]/route.ts`
- **Qué hace:** Edición manual de horas de envío/respuesta de un escalamiento.
- **Autenticación:** `auth()` + `can(session, 'admin')` — **'admin' no existe en ningún rol → nadie puede usar este endpoint.**
- **Retorna:** Escalamiento actualizado.

### `PUT /api/escalamientos/[id]/envio`
- **Archivo:** `app/api/escalamientos/[id]/envio/route.ts`
- **Qué hace:** Registra `hora_envio_correo = now()`, establece `estado_cronometro = 'CORRIENDO'`.
- **Autenticación:** Solo `auth()`. No verifica `escalamientos.envio`.

### `PUT /api/escalamientos/[id]/respuesta`
- **Archivo:** `app/api/escalamientos/[id]/respuesta/route.ts`
- **Qué hace:** Registra `hora_respuesta = now()`, calcula `tiempo_respuesta_min`, establece `estado_cronometro = 'RESPONDIDO'`.
- **Autenticación:** Solo `auth()`. No verifica `escalamientos.respuesta`.

---

### `GET /api/tiendas`
- **Archivo:** `app/api/tiendas/route.ts:16`
- **Qué hace:** Dos modos según `q` param: (A) autocomplete con JOIN proveedor+niveles, (B) lista completa con conteo de incidentes últimos 30 días.
- **Autenticación:** **NINGUNA. Endpoint público.**
- **Parámetros:** `q` (autocomplete), `proveedor`, `cluster` (lista)
- **Retorna:** Array de tiendas (con proveedor anidado en modo autocomplete).
- **Bug:** En modo autocomplete, hace N queries al DB (una por tienda encontrada) en vez de un JOIN.

### `POST /api/tiendas`
- **Archivo:** `app/api/tiendas/route.ts:98`
- **Qué hace:** Crea una tienda.
- **Autenticación:** `auth()` + `rol in ['SUPERVISOR', 'INFRAESTRUCTURA']` — usa rol directo en vez de `can()`.

### `PUT /api/tiendas/[id]`
- **Archivo:** `app/api/tiendas/[id]/route.ts`
- **Qué hace:** Edita una tienda.
- **Autenticación:** `auth()` + `rol in ['SUPERVISOR', 'INFRAESTRUCTURA']` — usa rol directo.

### `GET /api/tiendas/[id]/historial`
- **Archivo:** `app/api/tiendas/[id]/historial/route.ts`
- **Qué hace:** Retorna los últimos 5 incidentes de una tienda.
- **Autenticación:** **NINGUNA. Endpoint público.**
- **Retorna:** Array de 5 incidentes (id, codigo, tipo, estado, horaRegistro).

---

### `GET /api/usuarios`
- **Archivo:** `app/api/usuarios/route.ts:8`
- **Qué hace:** Lista todos los usuarios (sin password).
- **Autenticación:** `auth()` + `can(session, 'usuarios.ver')` → 403 si falla. **Retorna 403 en vez de 401 para sesión inexistente.**
- **Nota:** La página de incidentes llama a este endpoint para llenar el filtro de agentes — usuarios sin `usuarios.ver` (AGENTE) también hacen esta llamada y recibirán 403.

### `POST /api/usuarios`
- **Archivo:** `app/api/usuarios/route.ts:26`
- **Qué hace:** Crea un usuario.
- **Autenticación:** `auth()` + `can(session, 'usuarios.crear')`
- **Sin validación:** No valida email único, no valida formato de email, no hashea password.

### `PUT /api/usuarios/[id]`
- **Archivo:** `app/api/usuarios/[id]/route.ts:18`
- **Qué hace:** Edita un usuario. Whitelist de campos.
- **Autenticación:** `auth()` + `can(session, 'usuarios.editar')`

### `DELETE /api/usuarios/[id]`
- **Archivo:** `app/api/usuarios/[id]/route.ts:8`
- **Qué hace:** Elimina un usuario de la BD.
- **Autenticación:** `auth()` + `can(session, 'usuarios.editar')` — usa `editar` para `eliminar`, no hay permiso `usuarios.eliminar` diferenciado.
- **Riesgo:** Eliminar un usuario con incidentes asociados puede romper FKs si `registrado_por_id` no es nullable en la práctica (es NOT NULL en schema).

### `POST /api/usuarios/[id]/invalidar-sesion`
- **Archivo:** `app/api/usuarios/[id]/invalidar-sesion/route.ts`
- **Qué hace:** **No hace nada real.** Retorna un mensaje diciendo que los cambios aplican en el próximo login. El comentario en el código lo reconoce (línea 4-5).
- **Autenticación:** `auth()` + `can(session, 'usuarios.editar')`

---

### `GET /api/adjuntos`
- **Archivo:** `app/api/adjuntos/route.ts:7`
- **Qué hace:** Lista adjuntos de un incidente.
- **Autenticación:** `auth()` → 401
- **Parámetros:** `incidenteId` (requerido, sino retorna [])

### `POST /api/adjuntos`
- **Archivo:** `app/api/adjuntos/route.ts:26`
- **Qué hace:** Registra metadatos de un adjunto ya subido a uploadthing.
- **Autenticación:** `auth()` → 401
- **Sin validación:** No verifica que `url` sea una URL válida ni que `incidenteId` exista.

### `DELETE /api/adjuntos/[id]`
- **Archivo:** `app/api/adjuntos/[id]/route.ts`
- **Qué hace:** Elimina el registro del adjunto de la BD. **No elimina el archivo de uploadthing.**
- **Autenticación:** `auth()` → 401

---

### `GET /api/reportes`
- **Archivo:** `app/api/reportes/route.ts`
- **Qué hace:** Ejecuta 11 queries SQL en paralelo con `Promise.all`. Retorna estadísticas: totales, por día, por tipo, MTTR por proveedor, SLA por proveedor, top tiendas, reincidencia, por zona geográfica, tendencia SLA, MTTR Lima vs Provincia.
- **Autenticación:** `auth()` + `can(session, 'reportes.ver')`
- **SLA hardcodeado:** `mttr_minutos <= 240` (4 horas) — no es configurable.
- **Costo hardcodeado:** `2.43` como factor de costo por hora (línea 131).

### `GET /api/reportes/export`
- **Archivo:** `app/api/reportes/export/route.ts`
- **Qué hace:** Genera y descarga un CSV de incidentes.
- **Autenticación:** `auth()` + `can(session, 'reportes.ver')`
- **Bug crítico:** SQL usa `i.impacto` (línea 20, no existe) y `i.agente_id` (línea 35, no existe). Las columnas `Impacto` y `Agente` en el CSV siempre serán vacías.

---

### `GET /api/dashboard/operativo`
- **Archivo:** `app/api/dashboard/operativo/route.ts`
- **Qué hace:** Retorna incidentes activos, escalamientos activos y estado del equipo (agentes).
- **Autenticación:** `auth()` + `rol === 'SUPERVISOR'` hardcodeado — **no usa `can()`**, excluye GERENCIA e INFRAESTRUCTURA que tienen `dashboard.ver`.

### `GET /api/dashboard/analitico`
- **Archivo:** `app/api/dashboard/analitico/route.ts`
- **Qué hace:** Métricas analíticas con 5 queries SQL (proveedores, top tiendas, MTTR zona, por día, por tipo).
- **Autenticación:** `auth()` + `can(session, 'dashboard.ver')`
- **Nota:** **Este endpoint no es usado por ninguna página actual.** `dashboard/page.tsx` llama a `/api/reportes` para el tab analítico, no a este endpoint.

---

## 6. PÁGINAS Y COMPONENTES

### Páginas

| Ruta | Archivo | Protegida | Datos que carga | Método |
|---|---|---|---|---|
| `/` | `app/page.tsx` | No (redirige) | Ninguno | redirect → /incidentes |
| `/login` | `app/(auth)/login/page.tsx` | No | Ninguno | signIn() de next-auth |
| `/incidentes` | `app/(dashboard)/incidentes/page.tsx` | Sí (layout) | `/api/incidentes`, `/api/usuarios` | fetch() client-side |
| `/incidentes/nuevo` | `app/(dashboard)/incidentes/nuevo/page.tsx` | Sí (layout) | `/api/tiendas` (autocomplete) | fetch() client-side |
| `/incidentes/[id]` | `app/(dashboard)/incidentes/[id]/page.tsx` | Sí (layout) | `/api/incidentes/[id]`, `/api/escalamientos/[id]/...` | fetch() client-side |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Sí (proxy + layout) | `/api/dashboard/operativo`, `/api/reportes` | fetch() client-side |
| `/reportes` | `app/(dashboard)/reportes/page.tsx` | Sí (proxy + layout) | `/api/incidentes` | fetch() client-side |
| `/mantenimiento` | `app/(dashboard)/mantenimiento/page.tsx` | Sí (layout) | `/api/tiendas` | fetch() client-side |
| `/usuarios` | `app/(dashboard)/usuarios/page.tsx` | Sí (proxy + layout) | `/api/usuarios` | fetch() client-side |

**Notas sobre páginas:**
- `/reportes` (`app/(dashboard)/reportes/page.tsx`) **no llama a `/api/reportes`** — llama a `/api/incidentes` y hace los cálculos en el cliente. Es una versión simple/duplicada de la analítica del dashboard.
- `/dashboard` tab analítico llama a `/api/reportes` (el endpoint complejo), no a `/api/dashboard/analitico`.
- La protección del layout (`app/(dashboard)/layout.tsx`) es server-side y sólida. Las páginas client-side dependen del proxy para la redirección.

### Componentes compartidos principales

| Componente | Archivo | Propósito |
|---|---|---|
| `Sidebar` | `components/layout/Sidebar.tsx` | Navegación fija izquierda. Filtra items según permisos. |
| `SessionProviderWrapper` | `components/SessionProviderWrapper.tsx` | Wrappea en `<SessionProvider>` para client components |
| `Badge` | `components/ui/Badge.tsx` | Badge de estado (ABIERTO, ESCALADO, etc.) e impacto |
| `MetricCard` | `components/ui/MetricCard.tsx` | Tarjeta de métrica con label + valor + sub |
| `TiendaAutocomplete` | `components/incidentes/TiendaAutocomplete.tsx` | Input de búsqueda de tienda con debounce + fetch |
| `CronometroPrincipal` | `components/incidentes/CronometroPrincipal.tsx` | Cronómetro en vivo del incidente (tiempo desde apertura) |
| `CronometroEscalamiento` | `components/incidentes/CronometroEscalamiento.tsx` | Cronómetro de respuesta del proveedor por escalamiento |
| `GuiaEscalamiento` | `components/incidentes/GuiaEscalamiento.tsx` | Muestra instrucciones del proveedor al crear/ver incidente |
| `AdjuntosZona` | `components/incidentes/AdjuntosZona.tsx` | Upload de adjuntos via uploadthing + lista de adjuntos |

---

## 7. ERRORES Y BUGS CONOCIDOS

1. **CSV de exportación roto** — `app/api/reportes/export/route.ts:20,35`
   Las columnas `Impacto` y `Agente` siempre salen vacías en el CSV porque el SQL usa `i.impacto` (debe ser `i.nivel_impacto`) y `i.agente_id` (debe ser `i.registrado_por_id`). El JOIN a usuarios también falla.

2. **`PUT /api/escalamientos/[id]` es inaccesible** — `app/api/escalamientos/[id]/route.ts:12`
   Verifica `can(session, 'admin')` pero el permiso `'admin'` no existe en ningún rol ni puede asignarse. Este endpoint nunca puede ser usado. La UI en `incidentes/[id]/page.tsx:269-282` llama `saveEscTimers()` que sí lo invoca — siempre fallará con 403.

3. **`CRITICO` no existe en el enum de impacto** — `app/(dashboard)/incidentes/[id]/page.tsx:409`
   El select de edición supervisor muestra `CRITICO` como opción, pero `nivelImpactoEnum` en el schema sólo tiene `ALTO`, `MEDIO`, `BAJO`. Intentar guardar `CRITICO` causará error de BD.

4. **`/api/tiendas` y `/api/tiendas/[id]/historial` son públicos** — `app/api/tiendas/route.ts`, `app/api/tiendas/[id]/historial/route.ts`
   Cualquier persona sin sesión puede consultar la lista completa de tiendas y el historial de incidentes por tienda. No hay `auth()`.

5. **N+1 queries en autocomplete de tiendas** — `app/api/tiendas/route.ts:36-53`
   En modo autocomplete (q param), por cada tienda encontrada hace una query al proveedor y otra a niveles_escalamiento. Con 8 resultados = hasta 17 queries por keystroke.

6. **`/api/dashboard/analitico` no es usado** — `app/api/dashboard/analitico/route.ts`
   El dashboard llama a `/api/reportes`, no a este endpoint. Código muerto.

7. **`/api/usuarios/[id]/invalidar-sesion` es un stub** — `app/api/usuarios/[id]/invalidar-sesion/route.ts:4-5`
   El endpoint existe y está en la UI pero no hace nada operacional. Los cambios de permisos solo aplican tras un nuevo login manual del usuario afectado.

8. **Passwords en plaintext** — `drizzle/schema.ts:28`, `auth.ts:22`
   Las contraseñas se almacenan y comparan en texto plano. No hay bcrypt ni ningún hash.

9. **Incidentes page llama a `/api/usuarios`** para el filtro de agentes — si el usuario es AGENTE (sin `usuarios.ver`), la llamada retorna 403 y el select de agentes queda vacío silenciosamente (`app/(dashboard)/incidentes/page.tsx:85`).

10. **`DELETE /api/usuarios/[id]`** puede romper incidentes — si se elimina un usuario que tiene incidentes, la FK `registrado_por_id NOT NULL` puede causar errores si se intenta referenciar ese usuario desde incidentes existentes. La eliminación en sí puede fallar por constraint violation.

11. **Doble Chart.js**: `dashboard/page.tsx` usa tanto `recharts` (importado en línea 5) como Chart.js cargado dinámicamente desde CDN (`cdnjs.cloudflare.com`, línea 379-384). Dependencia externa en runtime.

---

## 8. PUNTOS DE MEJORA TÉCNICA

### Hardcoding

| Valor | Ubicación | Problema |
|---|---|---|
| SLA = 240 min (4 horas) | `api/reportes/route.ts:23`, múltiples queries | No configurable |
| Costo = S/ 2.43/hora | `api/reportes/route.ts:131` | Número mágico sin origen documentado |
| Lima = UTC-5 | `api/incidentes/route.ts:10` | Correcto para Perú pero frágil |
| Empresa = "Footloose Perú" | `incidentes/[id]/page.tsx:104` | En el template del correo de escalamiento |
| RUC = 20427799973 | `incidentes/[id]/page.tsx:106` | En el template del correo |
| Colores de proveedores | `api/tiendas/route.ts:7-14`, `mantenimiento/page.tsx:5-17` | Duplicados en dos archivos |
| Zonas geográficas | `api/reportes/route.ts:88-98` | Lista hardcodeada de distritos por zona |

### Sin validación

- **Inputs de APIs**: Ningún endpoint valida el body con Zod u otro schema validator. Se confía en los tipos del body sin parsear.
- **Email format**: No se valida que `email` sea un email válido al crear/editar usuarios.
- **UUID params**: Los `[id]` de rutas no validan que sean UUIDs válidos antes de hacer la query.
- **Rangos de fecha**: `desde`/`hasta` en reportes no se validan — strings inválidos causarán errores de PostgreSQL.
- **`tiendaId`** en POST incidentes: No se verifica que la tienda exista.

### Sin manejo de errores

- **Todas las páginas client-side**: Los `fetch()` no tienen `.catch()` — un error de red falla silenciosamente.
- **`mantenimiento/page.tsx`**: Sí tiene try/catch con `console.error`, pero no muestra nada al usuario.
- **`incidentes/page.tsx:77-79`**: Si la API retorna error, `res.json()` puede fallar y no hay catch.
- **`usuarios/page.tsx:84-86`**: `fetch('/api/usuarios').then(r => r.json())` — si retorna 403, `r.json()` retornará el error pero `setUsuarios` lo recibirá como objeto, no array.
- **APIs sin try/catch**: Ningún route handler tiene try/catch global — un error de BD no manejado retorna 500 con stack trace en desarrollo.

### Riesgos de escala

| Riesgo | Detalle |
|---|---|
| 11 queries en paralelo | `api/reportes/route.ts` lanza 11 queries simultáneas. Con muchos usuarios concurrentes, puede saturar el pool de conexiones |
| Sin paginación | `api/incidentes` retorna todos los incidentes del rango de fecha sin límite. Con muchos incidentes, la respuesta puede ser muy grande |
| Polling cada 30s | `dashboard/page.tsx` y `incidentes/page.tsx` refrescan automáticamente — N usuarios × 2 requests/min constantes |
| Sin índices en columnas de filtro | Queries sobre `hora_registro`, `estado`, `tienda_id` hacen full scan sobre la tabla `incidentes` |
| Conexión DB sin pool limit | `lib/db.ts` crea el cliente sin configurar `max` connections — en prod, un spike puede agotar conexiones de PostgreSQL |
| N+1 en autocomplete | Hasta 17 queries por búsqueda de tienda |

---

## 9. DEPENDENCIAS

### Producción

| Paquete | Versión | Propósito | Crítico |
|---|---|---|---|
| next | 16.2.4 | Framework | Sí |
| react / react-dom | 19.2.4 | UI | Sí |
| next-auth | 5.0.0-beta.31 | Auth | Sí — **versión beta** |
| drizzle-orm | ^0.45.2 | ORM | Sí |
| postgres | ^3.4.9 | Driver PG | Sí |
| dotenv | ^17.4.2 | Env vars en scripts | Solo scripts |
| uploadthing | ^7.7.4 | Upload de archivos | Medio |
| recharts | ^3.8.1 | Gráficos | Medio |
| lucide-react | ^1.11.0 | Íconos | Bajo |
| @base-ui/react | ^1.4.1 | Componentes UI | Bajo |
| clsx | ^2.1.1 | Utilidad de clases | Bajo |
| tailwind-merge | ^3.5.0 | Merge de clases TW | Bajo |
| tw-animate-css | ^1.4.0 | Animaciones CSS | Bajo |
| shadcn | ^4.5.0 | CLI (no runtime) | No |
| class-variance-authority | ^0.7.1 | Variantes de clases | Bajo |
| @auth/drizzle-adapter | ^1.11.2 | Adaptador BD para next-auth | **No usado** |

### Desarrollo

| Paquete | Versión | Propósito |
|---|---|---|
| drizzle-kit | ^0.31.10 | Migraciones y studio |
| tsx | ^4.21.0 | Ejecutar scripts TS |
| typescript | ^5 | Compilador |
| tailwindcss | ^4 | Framework CSS |
| @tailwindcss/postcss | ^4 | PostCSS para Tailwind |
| eslint | ^9 | Linter |
| eslint-config-next | 16.2.4 | Reglas ESLint para Next.js |
| @types/node, @types/react, @types/react-dom | — | Tipos TypeScript |

### Observaciones

1. **`next-auth` está en beta** (`5.0.0-beta.31`). La API v5 es estable en la práctica pero puede tener breaking changes en parches.

2. **`@auth/drizzle-adapter`** está instalado pero no se usa. El sistema usa JWT puro sin persistencia de sesiones en BD. Se puede remover.

3. **`shadcn`** es una CLI de desarrollo, no debería estar en `dependencies` — debería estar en `devDependencies` o no instalarse en prod.

4. **Chart.js** se carga desde CDN en runtime (`dashboard/page.tsx:379`) en vez de ser una dependencia npm. Riesgo de disponibilidad y CSP.

5. **`dotenv`** en `dependencies` (no `devDependencies`) porque `drizzle/run-sql.ts` y scripts de seed lo usan en Railway al deploy. Es intencional.

6. **Sin gestor de estado global** (Zustand, Redux, etc.) — todo el estado es local con `useState`. Funciona a esta escala pero dificulta compartir estado entre páginas sin prop drilling o re-fetching.

7. **Sin librería de formularios** (React Hook Form, etc.) — los formularios usan estado manual con `useState` y objetos genéricos `any`.

---

*Fin del documento de auditoría. Total de archivos analizados: ~35. Generado automáticamente a partir del código fuente del repositorio.*
