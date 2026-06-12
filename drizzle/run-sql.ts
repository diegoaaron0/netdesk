import 'dotenv/config'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
})

async function main() {
  console.log('[startup] Aplicando migraciones...')

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

  // 0005_decisiones — módulo de decisiones estratégicas
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_decision') THEN
        CREATE TYPE "tipo_decision" AS ENUM(
          'CAMBIO_PROVEEDOR', 'RENEGOCIACION_CONTRATO', 'ACTIVACION_CONTINGENCIA',
          'REVISION_SLA', 'BAJA_TIENDA', 'CAMBIO_PLAN', 'AUDITORIA_PROVEEDOR', 'OTRO'
        );
      END IF;
    END $$
  `
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_decision') THEN
        CREATE TYPE "estado_decision" AS ENUM('PENDIENTE', 'EN_EJECUCION', 'EJECUTADA', 'CANCELADA');
      END IF;
    END $$
  `
  await sql`
    CREATE TABLE IF NOT EXISTS "decisiones" (
      "id"                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      "tipo"                "tipo_decision"         NOT NULL,
      "titulo"              text                    NOT NULL,
      "descripcion"         text,
      "motivo"              text                    NOT NULL,
      "estado"              "estado_decision"       DEFAULT 'PENDIENTE',
      "tienda_id"           UUID,
      "proveedor_id"        UUID,
      "responsable_id"      UUID                    NOT NULL,
      "fecha_seguimiento"   date,
      "snap_sla_pct"        numeric,
      "snap_mttr_minutos"   integer,
      "snap_iei"            numeric,
      "snap_incidentes"     integer,
      "snap_periodo"        text,
      "ejecutada_en"        timestamp,
      "resultado_nota"      text,
      "post_sla_pct"        numeric,
      "post_mttr_minutos"   integer,
      "post_iei"            numeric,
      "post_incidentes"     integer,
      "creado_en"           timestamp   DEFAULT now(),
      "actualizado_en"      timestamp   DEFAULT now()
    )
  `
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decisiones_tienda_id_tiendas_id_fk') THEN
        ALTER TABLE "decisiones" ADD CONSTRAINT "decisiones_tienda_id_tiendas_id_fk"
          FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE SET NULL;
      END IF;
    END $$
  `
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decisiones_proveedor_id_proveedores_id_fk') THEN
        ALTER TABLE "decisiones" ADD CONSTRAINT "decisiones_proveedor_id_proveedores_id_fk"
          FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL;
      END IF;
    END $$
  `
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decisiones_responsable_id_usuarios_id_fk') THEN
        ALTER TABLE "decisiones" ADD CONSTRAINT "decisiones_responsable_id_usuarios_id_fk"
          FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT;
      END IF;
    END $$
  `
  console.log('[startup] ✓ Enums tipo_decision/estado_decision + tabla decisiones (0005_decisiones)')

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

  // 0010 — flujo de aprobación de decisiones
  await sql`ALTER TYPE "estado_decision" ADD VALUE IF NOT EXISTS 'PROPUESTO'`
  await sql`ALTER TYPE "estado_decision" ADD VALUE IF NOT EXISTS 'RECHAZADO'`
  await sql`ALTER TABLE "decisiones" ADD COLUMN IF NOT EXISTS "aprobado_por_id" UUID REFERENCES "usuarios"("id")`
  await sql`ALTER TABLE "decisiones" ADD COLUMN IF NOT EXISTS "aprobado_en" TIMESTAMP`
  await sql`ALTER TABLE "decisiones" ADD COLUMN IF NOT EXISTS "rechazado_motivo" TEXT`
  console.log('[startup] ✓ Flujo aprobación decisiones (0010)')

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

  console.log('[startup] Migraciones completadas.')
  await sql.end()
}

main().catch(e => { console.error('[startup] Error:', e); process.exit(1) })
