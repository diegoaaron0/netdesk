// Carga explícitamente .env.test (BD local aislada), NUNCA `dotenv/config` a
// secas: eso cargaba .env, que apunta a Railway, y este script escribe schema —
// una corrida local "de prueba" terminaba aplicando DDL contra producción.
// En Railway real no existe .env.test (está gitignoreado): dotenv no encuentra
// el archivo, no pisa nada, y DATABASE_URL sigue siendo la del entorno Railway.
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(__dirname, '../.env.test'), override: true })

import postgres from 'postgres'

// Guard: correr esto a mano contra Railway es un accidente, no un caso de uso.
// La única corrida legítima contra Railway es la del propio deploy
// (railway.toml → startCommand), que sí corre DENTRO del runtime de Railway y
// por lo tanto tiene RAILWAY_* en el entorno. Sin esa marca, se rechaza.
const dbUrl = process.env.DATABASE_URL ?? ''
const apuntaARailway = /railway|rlwy/i.test(dbUrl)
const dentroDeRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID)
if (apuntaARailway && !dentroDeRailway) {
  throw new Error(
    `Rechazado: DATABASE_URL apunta a Railway (${dbUrl.replace(/:[^:@]+@/, ':***@')}) ` +
    'y este proceso no corre dentro del runtime de Railway. Aplicar migraciones a ' +
    'Railway se coordina aparte, con autorización explícita — no desde una corrida local.',
  )
}

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
})

async function main() {
  console.log('[startup] Aplicando migraciones sobre:', dbUrl.replace(/:[^:@]+@/, ':***@'))

  await sql`ALTER TYPE "rol" ADD VALUE IF NOT EXISTS 'INFRAESTRUCTURA'`
  console.log('[startup] ✓ Enum INFRAESTRUCTURA')

  await sql`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "password" text`
  await sql`UPDATE "usuarios" SET "password" = NULL WHERE "password" = 'soporte123'`
  console.log('[startup] ✓ Columna usuarios.password')

  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "reabrierta_info" text`
  console.log('[startup] ✓ Columna incidentes.reabrierta_info')

  await sql`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "apellido" text`
  console.log('[startup] ✓ Columna usuarios.apellido')

  await sql`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "celular" text`
  console.log('[startup] ✓ Columna usuarios.celular')

  // Insertar usuarios INFRAESTRUCTURA si no existen
  await sql`
    INSERT INTO "usuarios" ("nombre", "email", "password", "rol", "activo")
    SELECT 'Edson Puelles', 'edson.puelles@footloose.pe', NULL, 'INFRAESTRUCTURA', true
    WHERE NOT EXISTS (SELECT 1 FROM "usuarios" WHERE "email" = 'edson.puelles@footloose.pe')
  `
  await sql`
    INSERT INTO "usuarios" ("nombre", "email", "password", "rol", "activo")
    SELECT 'Valentín', 'valentin@footloose.pe', NULL, 'INFRAESTRUCTURA', true
    WHERE NOT EXISTS (SELECT 1 FROM "usuarios" WHERE "email" = 'valentin@footloose.pe')
  `
  console.log('[startup] ✓ Usuarios Edson Puelles y Valentín (INFRAESTRUCTURA)')

  // 0003 — gestión operacional
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "estado_operacion" text`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "operacion_manual" boolean DEFAULT false`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "tipo_operacion_manual" text`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "factor_operativo" numeric`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "cont_activado_por" text`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "cont_hora_activacion" timestamp`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "cont_rendimiento" text`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "cont_observacion" text`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "mov_activado_por" text`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "mov_hora_activacion" timestamp`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "mov_rendimiento" text`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "mov_observacion" text`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "desc_energia" boolean`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "desc_router" boolean`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "desc_dns" boolean`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "check_ipconfig" boolean DEFAULT false`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "check_ping_gw" boolean DEFAULT false`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "check_ping_internet" boolean DEFAULT false`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "check_tracert" boolean DEFAULT false`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "check_dns" boolean DEFAULT false`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "check_renovar_ip" boolean DEFAULT false`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "descartes_detallado" text`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "resuelto_por" text`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "atribucion_final" text`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "evaluable_proveedor" boolean DEFAULT true`
  console.log('[startup] ✓ Columnas gestión operacional (0003)')

  // 0004 — escalamientos v2 + ATC llamadas
  await sql`ALTER TABLE "escalamientos" ADD COLUMN IF NOT EXISTS "no_hubo_respuesta" boolean DEFAULT false`
  await sql`
    CREATE TABLE IF NOT EXISTS "atc_llamadas" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "escalamiento_id" UUID NOT NULL REFERENCES "escalamientos"("id") ON DELETE CASCADE,
      "inicio" TIMESTAMP NOT NULL,
      "fin" TIMESTAMP,
      "duracion_min" INTEGER,
      "notas" TEXT,
      "creado_en" TIMESTAMP DEFAULT now()
    )
  `
  console.log('[startup] ✓ Escalamientos v2 + tabla atc_llamadas (0004)')

  // 0005 — usuarios.modulos_visibles
  await sql`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "modulos_visibles" TEXT[]`
  console.log('[startup] ✓ Columna usuarios.modulos_visibles (0005)')

  // 0006 — usuarios.eliminado_en
  await sql`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "eliminado_en" TIMESTAMP`
  console.log('[startup] ✓ Columna usuarios.eliminado_en (0006)')

  // Eliminar módulo legacy "decisiones" (reemplazado por gestión de cambios / acciones_gestion)
  // Ver migración 0028_drop_decisiones.sql
  await sql`DROP TABLE IF EXISTS "decisiones" CASCADE`
  await sql`DROP TYPE IF EXISTS "tipo_decision"`
  await sql`DROP TYPE IF EXISTS "estado_decision"`
  console.log('[startup] ✓ Tabla y enums decisiones eliminados (drop_decisiones)')

  // 0009 — tabla sla_alertas para deduplicación de alertas de cron
  await sql`
    CREATE TABLE IF NOT EXISTS "sla_alertas" (
      "id"           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      "incidente_id" UUID        NOT NULL REFERENCES "incidentes"("id") ON DELETE CASCADE,
      "tipo"         TEXT        NOT NULL,
      "enviado_en"   TIMESTAMP   NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_sla_alertas_lookup ON sla_alertas(incidente_id, tipo, enviado_en DESC)`
  console.log('[startup] ✓ Tabla sla_alertas + índice (0009)')

  // 0008 — campos IEI en incidentes (condiciones de venta durante el incidente)
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "boleta_manual" boolean`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "venta_parcial" boolean`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "cajas_afectadas" integer`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "cajas_totales" integer`
  console.log('[startup] ✓ Campos IEI en incidentes (0008)')

  // 0011 — celular de tienda
  await sql`ALTER TABLE "tiendas" ADD COLUMN IF NOT EXISTS "celular_tienda" text`
  console.log('[startup] ✓ Columna tiendas.celular_tienda (0011)')

  // 0006 — índices de performance para dashboard y queries frecuentes
  await sql`CREATE INDEX IF NOT EXISTS idx_incidentes_hora_registro ON incidentes(hora_registro DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_incidentes_tienda_hora ON incidentes(tienda_id, hora_registro DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_incidentes_proveedor_hora ON incidentes(proveedor_id, hora_registro DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_incidentes_estado ON incidentes(estado) WHERE estado NOT IN ('RESUELTO','CANCELADO','CERRADO')`
  await sql`CREATE INDEX IF NOT EXISTS idx_escalamientos_incidente_nivel ON escalamientos(incidente_id, nivel)`
  // idx_contratos_proveedor_tienda eliminado — tabla contratos_proveedor dropeada en migración 0026
  console.log('[startup] ✓ Índices de performance (0006)')

  // 0007 — secuencia para códigos de incidente (evita race condition)
  await sql`CREATE SEQUENCE IF NOT EXISTS netdesk_inc_seq START 1`
  console.log('[startup] ✓ Secuencia netdesk_inc_seq (0007)')

  // 0027 — eliminar campos de conectividad de tiendas (ahora viven en fichas)
  await sql`ALTER TABLE tiendas DROP COLUMN IF EXISTS tipo_conexion`
  await sql`ALTER TABLE tiendas DROP COLUMN IF EXISTS tipo_servicio`
  await sql`ALTER TABLE tiendas DROP COLUMN IF EXISTS cid_servicio`
  await sql`ALTER TABLE tiendas DROP COLUMN IF EXISTS velocidad`
  await sql`ALTER TABLE tiendas DROP COLUMN IF EXISTS plan_aplicado`
  await sql`ALTER TABLE tiendas DROP COLUMN IF EXISTS vigencia_contrato`
  await sql`ALTER TABLE tiendas DROP COLUMN IF EXISTS estado_servicio`
  await sql`ALTER TABLE tiendas DROP COLUMN IF EXISTS fecha_alta_servicio`
  await sql`ALTER TABLE tiendas DROP COLUMN IF EXISTS descripcion_servicio`
  await sql`ALTER TABLE tiendas DROP COLUMN IF EXISTS costo_mensual`
  console.log('[startup] ✓ Campos conectividad de tiendas eliminados (0027)')

  // 0028 — reabertura: preservar hora inicio original y hora fin anterior
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "hora_registro_original" timestamp`
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "hora_fin_anterior" timestamp`
  console.log('[startup] ✓ Columnas reabertura (0028)')

  // 0029 — IEI acumulado por períodos (reaperturas)
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "iei_acumulado" numeric`
  console.log('[startup] ✓ Columna iei_acumulado (0029)')

  // Rate limit de cambios de contraseña (máx 3 por 24h) + auditoría
  await sql`
    CREATE TABLE IF NOT EXISTS "password_cambios" (
      "id"         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
      "usuario_id" UUID      NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
      "creado_en"  TIMESTAMP NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_password_cambios_usuario ON password_cambios(usuario_id, creado_en DESC)`
  console.log('[startup] ✓ Tabla password_cambios + índice (rate limit)')

  // FK faltante: incidentes.grupo_masivo_id → grupos_masivos(id)
  // Limpia huérfanos antes de crear el constraint para que no falle
  await sql`
    UPDATE "incidentes" SET "grupo_masivo_id" = NULL
    WHERE "grupo_masivo_id" IS NOT NULL
      AND "grupo_masivo_id" NOT IN (SELECT "id" FROM "grupos_masivos")
  `
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incidentes_grupo_masivo_id_grupos_masivos_id_fk') THEN
        ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_grupo_masivo_id_grupos_masivos_id_fk"
          FOREIGN KEY ("grupo_masivo_id") REFERENCES "grupos_masivos"("id") ON DELETE SET NULL;
      END IF;
    END $$
  `
  console.log('[startup] ✓ FK incidentes.grupo_masivo_id → grupos_masivos (0028_drop_decisiones)')

  // 0030 — mitigaciones previas: snapshot de cont/mov archivado al reabrir un incidente
  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "mitigaciones_previas" jsonb`
  console.log('[startup] ✓ Columna incidentes.mitigaciones_previas (0030)')

  // Backfill: datos móviles activados sin hora (mov_activado_por seteado pero
  // mov_hora_activacion NULL) → usar hora_registro. Bug corregido en el PUT, esto
  // sanea los incidentes ya afectados (p.ej. 00085M). Idempotente.
  await sql`
    UPDATE "incidentes"
    SET "mov_hora_activacion" = "hora_registro"
    WHERE "mov_activado_por" IS NOT NULL
      AND "mov_hora_activacion" IS NULL
  `
  console.log('[startup] ✓ Backfill mov_hora_activacion faltante')

  // Backfill: escalamientos colgados de incidentes ya cerrados (enviados pero sin
  // respuesta, con el cronómetro aún corriendo) → marcar "sin respuesta" para que
  // el reloj se detenga y quede congelado en el cierre, sin inflar el SLA del
  // proveedor. Idempotente. Cubre 00025P, 00051N, 00065E, 00066U, 00091W, etc.
  await sql`
    UPDATE escalamientos es
    SET no_hubo_respuesta = true, estado_cronometro = 'VENCIDO'
    FROM incidentes i
    WHERE es.incidente_id = i.id
      AND i.estado IN ('RESUELTO','CERRADO','CANCELADO')
      AND es.hora_envio_correo IS NOT NULL
      AND es.hora_respuesta IS NULL
      AND es.no_hubo_respuesta IS NOT TRUE
  `
  console.log('[startup] ✓ Backfill escalamientos colgados (cronómetro detenido al cierre)')

  // ── Escalamientos por defecto del proveedor (molde) ──────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS "proveedores_niveles" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "proveedor_id" uuid NOT NULL REFERENCES "proveedores"("id") ON DELETE CASCADE,
      "nivel" integer NOT NULL,
      "nombre_contacto" text NOT NULL,
      "email" text,
      "celular" text,
      "tiempo_resp_sev1" text,
      "tiempo_resp_sev2" text,
      "tiempo_resp_sev3" text,
      "correos_copia" text[],
      "whatsapp" text,
      "canal" text DEFAULT 'correo',
      "horario_atencion" text,
      "tiempo_esperado_solucion" integer,
      "instruccion" text,
      "activo" boolean DEFAULT true,
      "creado_en" timestamp DEFAULT now()
    )
  `
  // Marca de sincronización en los niveles de cada ficha (false = sigue el default del proveedor)
  await sql`ALTER TABLE "fichas_niveles" ADD COLUMN IF NOT EXISTS "personalizado" boolean DEFAULT false`
  console.log('[startup] ✓ Tabla proveedores_niveles + columna fichas_niveles.personalizado')

  // Sembrado: para cada proveedor SIN defaults aún, copiar el nivel más reciente por
  // cada N (de sus fichas existentes). Idempotente (solo proveedores sin moldes).
  await sql`
    INSERT INTO "proveedores_niveles"
      ("proveedor_id","nivel","nombre_contacto","email","celular","tiempo_resp_sev1",
       "tiempo_resp_sev2","tiempo_resp_sev3","correos_copia","whatsapp","canal",
       "horario_atencion","tiempo_esperado_solucion","instruccion","activo")
    SELECT DISTINCT ON (f."proveedor_id", fn."nivel")
      f."proveedor_id", fn."nivel", fn."nombre_contacto", fn."email", fn."celular",
      fn."tiempo_resp_sev1", fn."tiempo_resp_sev2", fn."tiempo_resp_sev3", fn."correos_copia",
      fn."whatsapp", fn."canal", fn."horario_atencion", fn."tiempo_esperado_solucion",
      fn."instruccion", fn."activo"
    FROM "fichas_niveles" fn
    JOIN "fichas" f ON fn."ficha_id" = f."id"
    WHERE NOT EXISTS (SELECT 1 FROM "proveedores_niveles" pn WHERE pn."proveedor_id" = f."proveedor_id")
    ORDER BY f."proveedor_id", fn."nivel", f."activado_en" DESC NULLS LAST, f."creado_en" DESC
  `
  console.log('[startup] ✓ Sembrado de escalamientos por defecto desde fichas existentes')

  // Deriva de esquema corregida: la migración original (0020_routers_externos.sql)
  // crea esta columna, pero drizzle/schema.ts nunca la definió — GET
  // /api/routers-externos/[id] fallaba siempre al armar el historial combinado.
  await sql`ALTER TABLE "router_historial" ADD COLUMN IF NOT EXISTS "tiempo_uso_min" integer`
  console.log('[startup] ✓ Columna router_historial.tiempo_uso_min (deriva de esquema corregida)')

  // Auditoría del módulo Usuarios (Paso 9): cluster en usuarios no filtraba ni
  // restringía nada en el sistema, era solo un dato mostrado sin edición posible
  // desde la pantalla. tiendas.cluster NO se toca — sigue en uso pleno.
  await sql`ALTER TABLE usuarios DROP COLUMN IF EXISTS cluster`
  console.log('[startup] ✓ Columna usuarios.cluster eliminada (tiendas.cluster no se toca)')

  // Forzar cambio de contraseña en el primer login (auditoría del módulo Usuarios)
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT false`
  console.log('[startup] ✓ Columna usuarios.debe_cambiar_password')

  // Fase 2 (Paso 1) — mitigaciones por tramos. Solo el schema, todavía no lo usa
  // ningún endpoint. Reemplazará a futuro cont_*/mov_*/boleta_*/mitigaciones_previas
  // en incidentes (que conviven sin tocar por ahora — ver diseño de la iniciativa).
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_mitigacion_tramo') THEN
        CREATE TYPE "tipo_mitigacion_tramo" AS ENUM (
          'SIN_MITIGACION', 'ROUTER_PROPIO', 'ROUTER_EXTERNO', 'DATOS_MOVILES', 'BOLETA_MANUAL'
        );
      END IF;
    END $$
  `
  console.log('[startup] ✓ Enum tipo_mitigacion_tramo (Fase 2, Paso 1)')

  await sql`
    CREATE TABLE IF NOT EXISTS "incidente_mitigacion_tramos" (
      "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "incidente_id"      uuid NOT NULL REFERENCES "incidentes"("id") ON DELETE CASCADE,
      "tipo"              tipo_mitigacion_tramo NOT NULL,
      "factor"            numeric(5,4) NOT NULL CHECK ("factor" >= 0 AND "factor" <= 1),
      "activado_por"      text,
      "observacion"       text,
      "router_externo_id" uuid REFERENCES "routers_externos"("id"),
      "desde"             timestamp NOT NULL,
      "hasta"             timestamp,
      "ie_tramo"          numeric,
      "origen"            text NOT NULL DEFAULT 'SISTEMA'
                            CHECK ("origen" IN ('SISTEMA','EDICION_MANUAL','RELLENO_AUTOMATICO')),
      "creado_en"         timestamp NOT NULL DEFAULT now(),
      "actualizado_en"    timestamp NOT NULL DEFAULT now(),
      CHECK ( ("hasta" IS NULL AND "ie_tramo" IS NULL) OR ("hasta" IS NOT NULL AND "ie_tramo" IS NOT NULL) )
    )
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tramos_un_abierto_por_incidente
      ON "incidente_mitigacion_tramos" ("incidente_id") WHERE "hasta" IS NULL
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_tramos_incidente_id ON "incidente_mitigacion_tramos" ("incidente_id")`
  await sql`CREATE INDEX IF NOT EXISTS idx_tramos_tipo ON "incidente_mitigacion_tramos" ("tipo")`
  console.log('[startup] ✓ Tabla incidente_mitigacion_tramos + constraints + índices (Fase 2, Paso 1)')

  await sql`
    CREATE TABLE IF NOT EXISTS "incidente_mitigacion_tramos_historial" (
      "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "evento_id"      uuid NOT NULL,
      "tramo_id"       uuid NOT NULL REFERENCES "incidente_mitigacion_tramos"("id"),
      "incidente_id"   uuid NOT NULL,
      "usuario_id"     uuid NOT NULL REFERENCES "usuarios"("id"),
      "accion"         text NOT NULL
                         CHECK ("accion" IN ('EDITAR','RELLENO_INSERTADO','RELLENO_ELIMINADO','VECINO_RECORTADO','VECINO_ELIMINADO')),
      "valor_anterior" jsonb,
      "valor_nuevo"    jsonb,
      "creado_en"      timestamp NOT NULL DEFAULT now()
    )
  `
  console.log('[startup] ✓ Tabla incidente_mitigacion_tramos_historial (Fase 2, Paso 1)')

  // Fase 2 (Paso 5) — tramo_id nullable + ON DELETE SET NULL: un borrado real de
  // vecino (regla 6b) necesita insertar su propia fila de auditoría ANTES del
  // DELETE (para cumplir la FK en el insert); con RESTRICT, el DELETE posterior
  // fallaba porque esa misma fila recién insertada seguía referenciándolo. La
  // identidad del tramo borrado igual se conserva en el snapshot jsonb. Tabla sin
  // uso en producción (sin frontend, sin endpoints conectados) — sin riesgo de datos.
  await sql`ALTER TABLE incidente_mitigacion_tramos_historial ALTER COLUMN tramo_id DROP NOT NULL`
  await sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'incidente_mitigacion_tramos_historial_tramo_id_fkey' AND confdeltype <> 'n'
      ) THEN
        ALTER TABLE incidente_mitigacion_tramos_historial
          DROP CONSTRAINT incidente_mitigacion_tramos_historial_tramo_id_fkey;
        ALTER TABLE incidente_mitigacion_tramos_historial
          ADD CONSTRAINT incidente_mitigacion_tramos_historial_tramo_id_fkey
          FOREIGN KEY (tramo_id) REFERENCES incidente_mitigacion_tramos(id) ON DELETE SET NULL;
      END IF;
    END $$
  `
  console.log('[startup] ✓ tramo_id nullable + ON DELETE SET NULL (Fase 2, Paso 5)')

  // Fase 5 (Paso 4) — auditoría de qué fuente de cálculo (tramos vs legacy) se
  // usó para el IEI de cada evaluación de gestión de cambios. Columnas
  // aditivas, nullable — no rompen filas existentes. NOTA: esto se corrió a
  // mano contra netdesk_test únicamente (DATABASE_URL apuntado ahí). NO se
  // corrió todavía contra Railway — eso se coordina aparte, con autorización
  // explícita, cuando se decida el corte final de la iniciativa de tramos.
  await sql`ALTER TABLE "acciones_gestion" ADD COLUMN IF NOT EXISTS "eval30_metodo" text`
  await sql`ALTER TABLE "acciones_gestion" ADD COLUMN IF NOT EXISTS "eval90_metodo" text`
  console.log('[startup] ✓ Columnas eval30_metodo / eval90_metodo en acciones_gestion (Fase 5, Paso 4)')

  console.log('[startup] Migraciones completadas.')
  await sql.end()
}

main().catch(e => { console.error('[startup] Error:', e); process.exit(1) })
