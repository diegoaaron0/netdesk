import 'dotenv/config'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
})

async function main() {
  console.log('Aplicando cambios...')

  await sql`ALTER TYPE "rol" ADD VALUE IF NOT EXISTS 'INFRAESTRUCTURA'`
  console.log('✓ Enum INFRAESTRUCTURA añadido')

  await sql`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "password" text DEFAULT 'soporte123'`
  console.log('✓ Columna password añadida')

  await sql`ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "reabrierta_info" text`
  console.log('✓ Columna reabrierta_info añadida')

  console.log('Listo.')
  await sql.end()
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
