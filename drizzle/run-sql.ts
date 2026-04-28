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

  console.log('[startup] Migraciones completadas.')
  await sql.end()
}

main().catch(e => { console.error('[startup] Error:', e); process.exit(1) })
