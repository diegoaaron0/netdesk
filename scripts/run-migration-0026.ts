import 'dotenv/config'
import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join } from 'path'

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no definida')
  const sql = postgres(process.env.DATABASE_URL, { ssl: process.env.NODE_ENV === 'production' ? 'require' : false })
  const migrationSql = readFileSync(join(process.cwd(), 'drizzle/migrations/0026_drop_legacy_tables.sql'), 'utf-8')
  console.log('Aplicando migración 0026...')
  await sql.unsafe(migrationSql)
  console.log('✓ Migración 0026 aplicada correctamente')
  await sql.end()
}

main().catch(console.error)
