import 'dotenv/config'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
})

async function main() {
  console.log('[startup] Aplicando migraciones...')

  await sql`ALTER TYPE "rol" ADD VALUE IF NOT EXISTS 'INFRAESTRUCTURA'`
  console.log('[startup] ✓ Enum INFRAESTRUCTURA')

  await sql`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "password" text DEFAULT 'soporte123'`
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
    SELECT 'Edson Puelles', 'edson.puelles@footloose.pe', 'soporte123', 'INFRAESTRUCTURA', true
    WHERE NOT EXISTS (SELECT 1 FROM "usuarios" WHERE "email" = 'edson.puelles@footloose.pe')
  `
  await sql`
    INSERT INTO "usuarios" ("nombre", "email", "password", "rol", "activo")
    SELECT 'Valentín', 'valentin@footloose.pe', 'soporte123', 'INFRAESTRUCTURA', true
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

  console.log('[startup] Migraciones completadas.')
  await sql.end()
}

main().catch(e => { console.error('[startup] Error:', e); process.exit(1) })
