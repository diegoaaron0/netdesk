# Arquitectura NetDesk — Guía técnica completa
*Última actualización: 2026-05-05*

---

## 1. BASE DE DATOS — Tablas con datos reales

El sistema usa PostgreSQL vía Drizzle ORM. Hay 7 tablas principales.

---

### `usuarios`

Almacena a las personas que operan el sistema. El campo `permisos` es `NULL` para la mayoría — significa "usar los permisos por defecto del rol". Solo se llena cuando alguien tiene permisos personalizados.

```
id                                   | nombre    | apellido | email                      | password    | rol         | cluster | permisos | activo
-------------------------------------|-----------|----------|----------------------------|-------------|-------------|---------|----------|-------
a1b2c3d4-...                         | María     | Torres   | m.torres@footloose.pe      | soporte123  | SUPERVISOR  | NULL    | NULL     | true
e5f6g7h8-...                         | Carlos    | Quispe   | c.quispe@footloose.pe      | soporte123  | AGENTE      | A       | NULL     | true
i9j0k1l2-...                         | Ana       | Ruiz     | a.ruiz@footloose.pe        | soporte123  | GERENCIA    | NULL    | NULL     | true
m3n4o5p6-...                         | Luis      | Mamani   | l.mamani@footloose.pe      | soporte123  | AGENTE      | B       | {incidentes.ver,incidentes.crear} | true
```

> **Nota:** `password` es texto plano. El último usuario tiene permisos custom más restrictivos que los de su rol.

---

### `proveedores`

Los ISPs con los que trabaja la empresa. La `instruccion_general` es lo que el agente ve cuando abre un incidente de esa tienda.

```
id           | nombre    | correo_soporte              | telefono_soporte | instruccion_general
-------------|-----------|-----------------------------|-----------------|-----------------------------------------
aa11bb22-... | CLARO     | soporte.empresas@claro.pe   | 0800-00-123     | Llamar al 0800 primero. Ticket en portal empresas.claro.pe. Escalar N1 si no responden en 2h.
cc33dd44-... | BITEL     | noc@bitel.pe                | (01) 611-9000   | Abrir ticket en portal NOC. CID requerido.
ee55ff66-... | MOVISTAR  | b2b@movistar.pe             | 104             | Reportar por correo con CID y código de tienda en asunto.
```

---

### `niveles_escalamiento`

Contactos organizados por nivel (N1, N2, N3) dentro de cada proveedor. Son los datos que se autocompletan al escalar un incidente.

```
id           | proveedor_id | nivel | nombre_contacto      | email                    | celular        | tiempo_resp_sev1
-------------|-------------|-------|----------------------|--------------------------|----------------|-----------------
aa11-...-01  | aa11bb22-... | 1     | NOC Claro            | noc.empresas@claro.pe    | NULL           | 2 horas
aa11-...-02  | aa11bb22-... | 2     | Supervisor Regional  | sup.lima@claro.pe        | +51 999 111 222| 1 hora
aa11-...-03  | aa11bb22-... | 3     | Gerente B2B          | gerente.b2b@claro.pe     | +51 999 333 444| 30 minutos
```

---

### `tiendas`

El catálogo de tiendas Footloose. Es la tabla más ancha — almacena tanto info logística como datos del proveedor de internet específico de esa tienda.

```
id           | codigo | nombre_cc          | distrito      | provincia | cluster | proveedor_id | tipo_conexion | cid_servicio    | tiene_contingencia | costo_mensual
-------------|--------|--------------------|--------------  |-----------|---------|-------------|---------------|-----------------|--------------------|--------------
t1a2b3c4-... | FL001  | Plaza Lima Norte   | Independencia | Lima      | A       | aa11bb22-...| Fibra         | CID-CLR-00123   | true               | 890.00
t5d6e7f8-... | FL045  | CC Jockey Plaza    | Surco         | Lima      | B       | cc33dd44-...| Dedicada 4G   | BIT-045-LIM     | false              | 1200.00
t9g0h1i2-... | FL102  | Real Plaza Piura   | Piura         | Piura     | D       | ee55ff66-...| Fibra         | MOV-102-PIU     | false              | 650.00
```

---

### `incidentes`

El corazón del sistema. Registra cada evento de caída o problema de red.

```
id           | codigo  | tienda_id    | registrado_por_id | nivel_impacto | tipo        | estado        | hora_registro           | hora_fin                | mttr_minutos
-------------|---------|-------------|-------------------|---------------|-------------|---------------|-------------------------|-------------------------|-------------
i1a2b3c4-... | 00001A  | t1a2b3c4-...| e5f6g7h8-...      | ALTO          | CAIDA_TOTAL | RESUELTO      | 2026-05-04 09:15:00 UTC | 2026-05-04 12:43:00 UTC | 208
i5d6e7f8-... | 00002B  | t5d6e7f8-...| e5f6g7h8-...      | MEDIO         | LENTITUD    | ESCALADO_N1   | 2026-05-05 08:30:00 UTC | NULL                    | NULL
i9g0h1i2-... | 00003C  | t9g0h1i2-...| m3n4o5p6-...      | BAJO          | INTERMITENCIA| RESUELTO     | 2026-05-04 14:00:00 UTC | 2026-05-04 15:22:00 UTC | 82
```

> El código `00001A` = secuencia 5 dígitos + letra aleatoria para unicidad. `mttr_minutos` se calcula automáticamente al resolver: `(hora_fin - hora_registro) / 60`.

---

### `escalamientos`

Cada vez que un agente escala un incidente al proveedor, se crea un registro aquí. Un incidente puede tener múltiples escalamientos (N1, N2, N3).

```
id           | incidente_id | nivel | contacto_escalado  | email_contacto           | hora_envio_correo       | hora_respuesta          | tiempo_respuesta_min | estado_cronometro
-------------|-------------|-------|--------------------|--------------------------|-------------------------|-------------------------|----------------------|------------------
e1a2b3c4-... | i5d6e7f8-...| 1     | NOC Claro          | noc.empresas@claro.pe    | 2026-05-05 08:45:00 UTC | 2026-05-05 09:52:00 UTC | 67                   | RESPONDIDO
e5d6e7f8-... | i5d6e7f8-...| 2     | Supervisor Regional| sup.lima@claro.pe        | 2026-05-05 11:00:00 UTC | NULL                    | NULL                 | CORRIENDO
```

> El `tiempo_respuesta_min` se calcula automáticamente: `(hora_respuesta - hora_envio_correo) / 60`.

---

### `adjuntos`

Metadatos de archivos subidos a través de uploadthing. El archivo real vive en los servidores de uploadthing; aquí solo se guarda la URL y datos descriptivos.

```
id           | url                                    | nombre           | tipo       | tamano_bytes | incidente_id | escalamiento_id
-------------|----------------------------------------|------------------|------------|--------------|-------------|----------------
a1b2c3d4-... | https://utfs.io/f/abc123...            | ping_falla.png   | image/png  | 45320        | i5d6e7f8-...| NULL
a5e6f7g8-... | https://utfs.io/f/def456...            | correo_noc.pdf   | application/pdf | 12800   | NULL        | e1a2b3c4-...
```

---

## 2. FLUJO: CREAR UN INCIDENTE (click → BD)

Este es el camino completo desde que el agente hace clic en "Registrar incidente".

```
┌─────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR (cliente)                                                │
│                                                                     │
│  1. Agente abre /incidentes/nuevo                                   │
│     → layout.tsx verifica sesión server-side (auth())               │
│     → Si no hay sesión → redirect /login                            │
│                                                                     │
│  2. Agente escribe en <TiendaAutocomplete>                          │
│     → debounce 300ms                                                │
│     → GET /api/tiendas?q=FL001                                      │
│     → Muestra proveedor, CID, instrucciones                         │
│                                                                     │
│  3. Agente rellena: nivel_impacto, tipo, descripción...             │
│                                                                     │
│  4. Click "Registrar incidente"                                     │
│     → handleSubmit() en nuevo/page.tsx:56                           │
│     → POST /api/incidentes                                          │
│        body: { tiendaId, nivelImpacto, tipo, descripción... }       │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ fetch()
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SERVIDOR (route.ts: app/api/incidentes/route.ts)                   │
│                                                                     │
│  5. auth() → lee cookie JWT → verifica firma con NEXTAUTH_SECRET    │
│     → si no hay sesión → return 401                                 │
│                                                                     │
│  6. can(session, 'incidentes.crear')                                │
│     → getPermisos(session)                                          │
│        → session.user.permisos ?? PERMISOS_POR_ROL[session.user.rol]│
│     → si no tiene permiso → return 403                              │
│                                                                     │
│  7. Buscar el usuario en BD por email (para obtener su UUID)        │
│     db.select({ id }).from(usuarios).where(eq(email, session.email))│
│                                                                     │
│  8. Generar código único:                                           │
│     a. SELECT COUNT(*) FROM incidentes  → ej: 42                    │
│     b. seq = "00043"                                                │
│     c. letter = letra aleatoria → "G"                               │
│     d. SELECT id FROM incidentes WHERE codigo = "00043G"            │
│        → si existe, reintenta con otra letra (hasta 10 veces)       │
│     e. código final = "00043G"                                      │
│                                                                     │
│  9. INSERT INTO incidentes (...) VALUES (...)                       │
│     → Drizzle genera el SQL parametrizado                           │
│     → postgres driver envía a PostgreSQL                            │
│     → PostgreSQL asigna UUID, aplica defaultNow()                   │
│     → RETURNING * trae el registro creado                           │
│                                                                     │
│  10. return NextResponse.json(inc, { status: 201 })                 │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ { id: "i9g0h1...", codigo: "00043G", ... }
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR (cliente)                                                │
│                                                                     │
│  11. res.ok → router.push(`/incidentes/${inc.id}`)                  │
│      → El agente llega directamente al detalle del incidente        │
└─────────────────────────────────────────────────────────────────────┘
```

**En la BD después del paso 9:**
```sql
INSERT INTO incidentes (
  id, codigo, tienda_id, registrado_por_id,
  nivel_impacto, tipo, estado, hora_registro
) VALUES (
  gen_random_uuid(), '00043G', 't5d6e7f8-...', 'e5f6g7h8-...',
  'ALTO', 'CAIDA_TOTAL', 'ABIERTO', now()
)
```

---

## 3. FLUJO: UN ESCALAMIENTO COMPLETO

Un escalamiento tiene varias fases. Aquí el camino completo desde que el agente decide escalar hasta que el proveedor responde.

```
FASE 1 — ESCALAMIENTO INICIAL
══════════════════════════════

Agente abre /incidentes/[id]
  → fetchInc() carga incidente + escalamientos + nivelesProveedor
  → Si proveedor tiene niveles configurados, el form se autocompleta:
       contacto, email, teléfono, y genera borrador de correo

Click "+ Agregar nivel" → muestra form de escalamiento
Agente ajusta texto, hace click "Escalar →"
  → handleEscalar() en [id]/page.tsx:240
  → POST /api/incidentes/[id]/escalar
     body: { nivel:1, nivelEscId:"...", contactoEscalado:"NOC Claro",
             emailContacto:"noc@claro.pe", cuerpoCorreo:"..." }

Servidor (escalar/route.ts):
  → auth() → 401 si no hay sesión
  → INSERT INTO escalamientos (...) VALUES (...)
  → UPDATE incidentes SET estado = 'ESCALADO_N1' WHERE id = ?
  → return escalamiento creado (201)

Estado en BD:
  incidentes.estado = 'ESCALADO_N1'
  escalamientos: nuevo registro con hora_envio_correo = NULL


FASE 2 — AGENTE ENVÍA EL CORREO (manualmente, fuera del sistema)
═════════════════════════════════════════════════════════════════

El agente copia el borrador con el botón "Copiar"
Lo pega en su cliente de correo y envía manualmente

Cuando envía, vuelve al sistema y hace click:
  "Correo enviado → iniciar cronómetro"
  → handleEnvioCorreo(escId) en [id]/page.tsx:251
  → PUT /api/escalamientos/[id]/envio

Servidor (envio/route.ts):
  → auth() → 401
  → UPDATE escalamientos
     SET hora_envio_correo = now(),
         estado_cronometro = 'CORRIENDO'
     WHERE id = ?

Estado en BD:
  escalamientos.hora_envio_correo = '2026-05-05 08:45:00 UTC'
  escalamientos.estado_cronometro = 'CORRIENDO'

En la UI: aparece el CronometroEscalamiento contando en vivo


FASE 3 — PROVEEDOR RESPONDE
════════════════════════════

El proveedor responde por correo. El agente registra:
  Click "Registrar primera respuesta"
  → handleRespuesta(escId) en [id]/page.tsx:256
  → PUT /api/escalamientos/[id]/respuesta

Servidor (respuesta/route.ts):
  → auth() → 401
  → SELECT hora_envio_correo FROM escalamientos WHERE id = ?
  → horaRespuesta = now()
  → tiempoRespuestaMin = round((now - hora_envio_correo) / 60000)
  → UPDATE escalamientos
     SET hora_respuesta = now(),
         tiempo_respuesta_min = 67,
         estado_cronometro = 'RESPONDIDO'

Estado en BD:
  escalamientos.hora_respuesta = '2026-05-05 09:52:00 UTC'
  escalamientos.tiempo_respuesta_min = 67
  escalamientos.estado_cronometro = 'RESPONDIDO'


FASE 4 — RESOLUCIÓN
════════════════════

El proveedor resuelve el problema. El agente hace click:
  "Marcar como resuelto"
  → handleResolver() en [id]/page.tsx:215
  → POST /api/incidentes/[id]/resolver

Servidor (resolver/route.ts):
  → SELECT hora_registro FROM incidentes WHERE id = ?
  → horaFin = now()
  → mttrMinutos = round((now - hora_registro) / 60000)
  → UPDATE incidentes
     SET estado = 'RESUELTO',
         hora_fin = now(),
         mttr_minutos = 208,
         actualizado_en = now()

Estado final en BD:
  incidentes.estado         = 'RESUELTO'
  incidentes.hora_fin       = '2026-05-04 12:43:00 UTC'
  incidentes.mttr_minutos   = 208
  escalamientos[0].tiempo_respuesta_min = 67
```

**Tiempos que registra el sistema (T1-T4):**
```
T1 = mttr_minutos total del incidente         → 208 min (3h 28m)
T2 = hora_envio_correo (hora exacta Lima)     → "08:45"
T3 = tiempo_respuesta_min del N1              → 67 min (si N1 respondió)
     ó tiempo entre correo N1 y correo N2     → (si no respondió)
T4 = hora_fin - hora_respuesta_del_último_esc → tiempo proveedor→solución
```

---

## 4. SISTEMA DE PERMISOS DE PUNTA A PUNTA

El sistema tiene cuatro capas de control de acceso que se ejecutan en orden:

```
REQUEST DEL NAVEGADOR
        │
        ▼
┌───────────────────────────────────────────────────────┐
│  CAPA 1: proxy.ts (antes de llegar a cualquier ruta)  │
│                                                       │
│  Rutas que protege:                                   │
│    /incidentes/*   → cualquier sesión válida           │
│    /dashboard/*    → can(session, 'dashboard.ver')     │
│    /reportes/*     → can(session, 'reportes.ver')      │
│    /usuarios/*     → can(session, 'usuarios.ver')      │
│    /mantenimiento/*→ cualquier sesión válida           │
│                                                       │
│  Si no hay sesión → redirect /login                   │
│  Si no tiene permiso → redirect /incidentes o /login  │
└───────────────────┬───────────────────────────────────┘
                    │ (pasa)
                    ▼
┌───────────────────────────────────────────────────────┐
│  CAPA 2: app/(dashboard)/layout.tsx (Server Component)│
│                                                       │
│  const session = await auth()                         │
│  if (!session) redirect('/login')                     │
│                                                       │
│  Segunda verificación server-side. Pasa la sesión     │
│  al Sidebar y al SessionProviderWrapper.              │
└───────────────────┬───────────────────────────────────┘
                    │ (pasa)
                    ▼
┌───────────────────────────────────────────────────────┐
│  CAPA 3: page.tsx / componentes (Client Components)   │
│                                                       │
│  const { data: session } = useSession()               │
│  const canEdit = can(session, 'incidentes.editar')    │
│                                                       │
│  Controla qué BOTONES y CAMPOS son visibles.          │
│  Ejemplo: el botón "Editar" solo aparece si el        │
│  usuario tiene 'incidentes.editar'.                   │
│                                                       │
│  IMPORTANTE: Esto es solo cosmético. No protege       │
│  las APIs — alguien puede llamar la API directamente. │
└───────────────────┬───────────────────────────────────┘
                    │ (si hace fetch)
                    ▼
┌───────────────────────────────────────────────────────┐
│  CAPA 4: API route handlers (la única barrera real)   │
│                                                       │
│  const session = await auth()                         │
│  if (!session) return 401                             │
│  if (!can(session, 'permiso')) return 403             │
│                                                       │
│  Aquí se aplica la lógica real de autorización.       │
└───────────────────────────────────────────────────────┘
```

**Cómo se construye y verifica un permiso:**

```
LOGIN
  │
  ├─ authorize() en auth.ts
  │    → busca usuario en BD
  │    → retorna { id, name, email, rol, permisos }
  │
  ├─ callback jwt() en auth.ts
  │    → token.rol     = user.rol        → ej: "AGENTE"
  │    → token.permisos = dbUser.permisos → ej: null
  │    → Esto se firma con NEXTAUTH_SECRET y se guarda en cookie
  │
  └─ callback session() en auth.ts
       → session.user.rol      = token.rol
       → session.user.permisos = token.permisos
       → Esta sesión se expone vía useSession() y auth()


CADA REQUEST POSTERIOR
  │
  └─ can(session, 'incidentes.crear')
       │
       └─ getPermisos(session)
            │
            ├─ session.user.permisos = ['incidentes.ver', 'incidentes.crear']
            │    → usa ESTE array (permisos custom)
            │
            └─ session.user.permisos = null
                 → usa PERMISOS_POR_ROL['AGENTE']
                    = ['incidentes.ver', 'incidentes.crear', 'incidentes.reabrir', ...]
```

**Ejemplo concreto — agente intenta eliminar un incidente:**

```
Carlos (AGENTE) hace DELETE /api/incidentes/abc123

route.ts:
  1. auth() → session = { user: { rol: 'AGENTE', permisos: null } }
  2. can(session, 'incidentes.eliminar')
       → getPermisos(session) → PERMISOS_POR_ROL['AGENTE']
          = ['incidentes.ver', 'incidentes.crear', 'incidentes.reabrir',
             'escalamientos.crear', 'escalamientos.envio', 'escalamientos.respuesta',
             'mantenimiento.ver']
       → 'incidentes.eliminar' no está en la lista
       → can() retorna false
  3. return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
```

**Cómo el Sidebar filtra la navegación:**

```typescript
// components/layout/Sidebar.tsx:57
const permisos = getPermisos(session)

NAV.map(group =>
  group.items.filter(item => permisos.includes(item.permiso))
)

// Un AGENTE ve: Incidentes, + Nuevo incidente, Mantenimiento
// Un SUPERVISOR ve: todo
// Un GERENTE ve: Dashboard, Reportes, Mantenimiento
```

---

## 5. ARCHIVOS EN `lib/` — QUÉ HACE CADA UNO Y POR QUÉ EXISTE

### `lib/db.ts`

```typescript
import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@/drizzle/schema'

const client = postgres(process.env.DATABASE_URL!, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
  connection: { TimeZone: 'UTC' },
})
export const db = drizzle(client, { schema })
```

**Por qué existe:** Es el singleton de conexión a la base de datos. En Next.js, cada módulo se evalúa una vez por proceso, así que importar `db` desde cualquier route handler siempre reutiliza la misma instancia del cliente postgres.

**Decisiones:**
- `import 'dotenv/config'` al inicio: permite que los scripts `tsx drizzle/seed.ts` funcionen sin configurar env vars manualmente. En el servidor de Next.js, las env vars ya están disponibles vía `process.env`.
- `ssl: 'require'` solo en producción: en desarrollo local se conecta sin SSL (Railway local o Docker).
- `TimeZone: 'UTC'`: fuerza que todas las fechas se almacenen y retornen en UTC. La conversión a Lima (UTC-5) se hace en el frontend o en queries SQL con `AT TIME ZONE 'America/Lima'`.
- `{ schema }` en drizzle: necesario para las relaciones tipadas de Drizzle ORM.

---

### `lib/permisos.ts`

```typescript
export const PERMISOS_POR_ROL: Record<string, string[]> = {
  AGENTE: ['incidentes.ver', 'incidentes.crear', ...],
  SUPERVISOR: [...todos los permisos operativos...],
  GERENCIA: ['dashboard.ver', 'reportes.ver', ...],
  INFRAESTRUCTURA: [...similar a SUPERVISOR pero sin usuarios...],
}

export function getPermisos(session: any): string[] {
  const rol = session?.user?.rol ?? 'AGENTE'
  const custom = session?.user?.permisos
  if (custom && Array.isArray(custom) && custom.length > 0) return custom
  return PERMISOS_POR_ROL[rol] ?? []
}

export function can(session: any, permiso: string): boolean {
  return getPermisos(session).includes(permiso)
}

export const sessionPermisos = getPermisos  // alias de compatibilidad
```

**Por qué existe como archivo separado:** La lógica de permisos se usa en tres lugares distintos: el `proxy.ts` (Node.js runtime del servidor), los API route handlers (también servidor), y los Client Components (navegador). Al estar en `lib/`, puede importarse desde cualquiera de estos contextos sin duplicar código.

**Por qué no está en la BD:** Los permisos por rol son configuración del sistema, no datos de usuario. Cambiarlos requiere un deploy, no una query. Esto es intencional — se evita que un error en la BD pueda borrar la configuración de seguridad.

**La lógica de "custom vs. default":** Si `permisos` es un array no vacío en el JWT, se usa ese array completo (reemplaza, no acumula). Si es `null` o vacío, se usan los defaults del rol. Esto permite casos especiales sin complicar la mayoría de los usuarios.

---

## 6. DIAGRAMA DE RELACIONES ENTRE TABLAS

```
┌──────────────┐         ┌───────────────────┐
│  proveedores │ 1     N │ niveles_escalamien │
│──────────────│────────▶│───────────────────│
│ id (PK)      │         │ id (PK)            │
│ nombre       │         │ proveedor_id (FK)  │
│ correo_soporte│        │ nivel (1/2/3)      │
│ telefono     │         │ nombre_contacto    │
│ instruccion  │         │ email              │
└──────┬───────┘         │ celular            │
       │                 │ tiempo_resp_sev1   │
       │ 1             N └─────────┬──────────┘
       │                           │ (nivel_esc_id, nullable)
       ▼                           │
┌──────────────┐                   │
│   tiendas    │                   │
│──────────────│                   │
│ id (PK)      │                   │
│ codigo       │                   │
│ nombre_cc    │                   │
│ distrito     │                   │
│ provincia    │                   │
│ cluster      │                   │
│ proveedor_id │                   │
│ tipo_conexion│                   │
│ cid_servicio │                   │
│ costo_mensual│                   │
└──────┬───────┘                   │
       │                           │
       │ 1             N           │
       ▼                           ▼
┌──────────────┐         ┌──────────────────┐
│  incidentes  │ 1     N │  escalamientos   │
│──────────────│────────▶│──────────────────│
│ id (PK)      │         │ id (PK)           │
│ codigo       │         │ incidente_id (FK) │
│ tienda_id(FK)│         │ nivel_esc_id (FK) │──▶ niveles_escalamiento
│ registrado_  │         │ nivel             │
│   por_id (FK)│         │ contacto_escalado │
│ nivel_impacto│         │ email_contacto    │
│ tipo         │         │ hora_envio_correo │
│ estado       │         │ hora_respuesta    │
│ hora_registro│         │ tiempo_resp_min   │
│ hora_fin     │         │ estado_cronometro │
│ mttr_minutos │         │ cuerpo_correo     │
└──────┬───────┘         └────────┬─────────┘
       │                          │
       │                          │ 1
       │                          ▼
       │                 ┌─────────────────┐
       │                 │    adjuntos     │
       │                 │─────────────────│
       │         1     N │ id (PK)         │
       └────────────────▶│ incidente_id(FK)│
                         │ escalamiento_   │
                         │   id (FK)       │
                         │ url             │
                         │ nombre          │
                         │ tipo (MIME)     │
                         │ tamano_bytes    │
                         └─────────────────┘

┌──────────────┐
│   usuarios   │
│──────────────│
│ id (PK)      │──┐
│ nombre       │  │ registrado_por_id
│ email        │  └────────────────────▶ incidentes
│ password     │
│ rol          │
│ permisos[]   │
│ activo       │
└──────────────┘


Enums definidos en el schema:
  rolEnum:            AGENTE | SUPERVISOR | GERENCIA | INFRAESTRUCTURA
  nivelImpactoEnum:   ALTO | MEDIO | BAJO
  tipoIncidenteEnum:  CAIDA_TOTAL | INTERMITENCIA | LENTITUD | POS | OTROS
  estadoIncidenteEnum:ABIERTO | EN_SEGUIMIENTO | ESCALADO_N1 | ESCALADO_N2
                      ESCALADO_N3 | RESUELTO | CANCELADO | CERRADO
  clusterEnum:        A | B | C | D
  estadoCronometroEnum: CORRIENDO | RESPONDIDO | VENCIDO
```

**Reglas de integridad:**
- Un incidente **siempre** tiene tienda y usuario que lo registró (NOT NULL + FK)
- Un escalamiento **siempre** tiene un incidente (NOT NULL + FK)
- Un adjunto puede pertenecer a un incidente **o** un escalamiento (ambos nullable — solo uno debería ser no-null)
- `nivel_esc_id` en escalamientos es nullable porque se puede escalar a un contacto manual no registrado en la tabla de niveles

---

## 7. DECISIONES TÉCNICAS — QUÉ Y POR QUÉ

### JWT en vez de sesiones en base de datos

**Qué:** Las sesiones de next-auth se guardan como JWT en una cookie HTTP-only, no en una tabla de la BD.

**Por qué:**
- **Sin estado extra en BD:** No hay tabla `sessions` que mantener. Menos complejidad operacional.
- **Escala horizontalmente:** Si hubiera múltiples instancias del servidor, no necesitan sincronizar sesiones — cada una puede verificar el JWT con `NEXTAUTH_SECRET`.
- **Rendimiento:** Verificar un JWT es criptografía local (sin query a BD). Cada request autenticada no necesita un `SELECT` adicional.

**El tradeoff que acepta este sistema:**
Los cambios de permisos o desactivación de usuarios **no aplican inmediatamente**. Si se desactiva un usuario o se le cambian permisos, el JWT existente sigue siendo válido hasta que expire o el usuario cierre sesión. El endpoint `/api/usuarios/[id]/invalidar-sesion` existe para documentar este problema — actualmente es un stub que solo muestra un mensaje informativo.

---

### Drizzle ORM en vez de Prisma

**Qué:** Se usa Drizzle ORM para queries tipadas a PostgreSQL.

**Por qué Drizzle sobre Prisma:**
- **SQL explícito:** Drizzle produce SQL predecible y legible. Con Prisma, queries complejas con JOINs múltiples se vuelven opacos o requieren `$queryRaw`.
- **Sin generación de código:** Prisma necesita correr `prisma generate` para regenerar el cliente. Con Drizzle, el schema ES el código TypeScript.
- **Mejor soporte de queries SQL crudo:** La mitad de las queries de reportes y dashboard usan `db.execute(sql`...`)` con SQL puro — Drizzle lo soporta nativamente sin friction.
- **Más liviano:** No tiene el proceso de Prisma Engine separado.

**Dónde se nota:** `app/api/reportes/route.ts` tiene 11 queries SQL complejas con window functions, LATERAL JOINs y casts. Con Prisma hubieran sido todas `$queryRaw` con strings sin tipado.

---

### No hay Redux (ni Zustand, ni Context global)

**Qué:** No hay gestión de estado global. Cada página maneja su propio estado con `useState`.

**Por qué está bien a esta escala:**
- Las páginas son relativamente independientes entre sí. Un agente abre incidentes, los gestiona, y cierra. No hay estado que necesite compartirse entre `/incidentes` y `/dashboard` simultáneamente.
- El "estado compartido" real (la sesión del usuario) ya está gestionado por next-auth/react vía `useSession()`, que actúa como un Context global de solo lectura.
- Agregar Redux o Zustand para 8 páginas sería over-engineering. El costo de aprender y mantener la indirección supera el beneficio.

**Cuándo esto cambia:** Si se necesita que una acción en una página afecte el estado de otra (notificaciones en tiempo real, un contador global de incidentes activos visible en todas las páginas), ahí sí convendría un store o WebSockets.

---

### Client Components con fetch() en vez de Server Components con data fetching

**Qué:** Casi todas las páginas son `'use client'` y cargan datos con `fetch()` en `useEffect`.

**Por qué no se usan Server Components para el data fetching:**

Las páginas de NetDesk necesitan:
1. **Polling automático** (incidentes y dashboard se refrescan cada 30s)
2. **Interactividad compleja** (filtros, modales, formularios reactivos)
3. **Estado local** (¿está el modal abierto? ¿qué fila está seleccionada?)

Los Server Components son ideales para contenido estático o semi-estático que se renderiza una vez. Las páginas de un service desk en vivo son el caso opuesto — necesitan actualizarse constantemente en respuesta a acciones del usuario y del tiempo.

El único Server Component real con lógica es `app/(dashboard)/layout.tsx`, que verifica la sesión una vez antes de renderizar cualquier página.

---

### next-auth v5 (beta) en vez de v4

**Qué:** Se usa `next-auth@5.0.0-beta.31`.

**Por qué la beta:**
- La v5 está diseñada específicamente para Next.js App Router. La v4 tiene fricción con Server Components y el nuevo sistema de routing.
- La API de `auth()` como función server-side (en vez de `getServerSession(authOptions)`) es mucho más limpia.
- El `proxy.ts` (middleware) de la v5 usa `auth()` directamente en vez del helper separado `withAuth`.
- A pesar de ser beta, lleva más de un año en uso activo y la API está estabilizada en la práctica.

---

### No hay validación de inputs con Zod

**Qué:** Los API handlers leen `body = await req.json()` y acceden a los campos directamente sin validar el schema.

**Por qué está así (y cuál es el riesgo):**
- El sistema fue construido rápido para uso interno con usuarios conocidos. La superficie de ataque es pequeña.
- Los campos se pasan directamente a Drizzle, que sí tiene tipado TypeScript — pero TypeScript no valida en runtime.
- **El riesgo real:** un campo inesperado (tipo incorrecto, string donde se espera fecha) puede causar un error de PostgreSQL que retorna 500 sin mensaje útil, o peor, insertar datos incorrectos silenciosamente.

---

### uploadthing para adjuntos en vez de S3 directo

**Qué:** Los archivos adjuntos se suben a través de uploadthing, no directamente a un bucket S3 propio.

**Por qué:**
- uploadthing provee un SDK Next.js que maneja la autenticación del upload, el presigned URL, y el CDN sin configurar AWS IAM, buckets, políticas, etc.
- Para un sistema interno con volumen moderado de adjuntos (capturas de pantalla, PDFs de tickets), el costo operacional de self-hosted S3 supera el beneficio.
- El tradeoff: si se cancela la cuenta de uploadthing, los archivos no son accesibles hasta migrar las URLs.

---

### Tailwind CSS v4 sin sistema de componentes

**Qué:** Se usa Tailwind v4, pero la mayoría de los estilos están escritos como objetos `React.CSSProperties` inline, no como clases de Tailwind.

**Por qué los inline styles:**
- Tailwind v4 tiene una API de configuración diferente a v3 — la integración con Next.js 16 todavía tenía quirks cuando se desarrolló el sistema.
- Los estilos condicionales complejos (colores que cambian según el estado del incidente, opacidades, bordes de colores) son más directos con objetos JavaScript que con clases condicionales de Tailwind.
- El resultado es código más verboso pero predecible — no hay que recordar qué clase de Tailwind corresponde a qué valor exacto de color.

---

### Zona horaria Lima hardcodeada como UTC-5

**Qué:** La función `todayLima()` en `app/api/incidentes/route.ts:10` hardcodea Lima como `UTC - 5 horas`.

**Por qué es correcto para este sistema:**
Perú (Lima) está en zona horaria `America/Lima`, que es **UTC-5 sin horario de verano**. A diferencia de otras zonas, Lima nunca cambia el offset. El hardcodeo de `-5 * 3600000` es equivalente a usar `AT TIME ZONE 'America/Lima'` para efectos prácticos. Las queries SQL que necesitan precisión (reportes, dashboard analítico) sí usan `AT TIME ZONE 'America/Lima'` explícitamente.

---

*Fin del documento. Para el inventario completo de bugs y endpoints, ver `AUDITORIA_NETDESK.md`.*
