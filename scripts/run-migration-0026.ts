import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join } from 'path'

async function main() {
  const sql = postgres('postgresql://postgres:cbaEdUFlVULJNdlsdHdqBelVllfBMZwL@tramway.proxy.rlwy.net:10333/railway', { ssl: 'require' })
  const migrationSql = readFileSync(join(process.cwd(), 'drizzle/migrations/0026_drop_legacy_tables.sql'), 'utf-8')
  console.log('Aplicando migración 0026...')
  await sql.unsafe(migrationSql)
  console.log('✓ Migración 0026 aplicada correctamente')
  await sql.end()
}

main().catch(console.error)
