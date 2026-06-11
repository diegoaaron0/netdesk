import 'dotenv/config'
import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join } from 'path'

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no definida')
  const sql = postgres(process.env.DATABASE_URL, { ssl: process.env.NODE_ENV === 'production' ? 'require' : false })

  const migrationSql = readFileSync(
    join(process.cwd(), 'drizzle/migrations/0025_tipo_local.sql'),
    'utf-8'
  )

  console.log('Ejecutando migración 0025_tipo_local...')
  await sql.unsafe(migrationSql)
  console.log('✓ Migración aplicada')

  // Verificar resultado
  const resultado = await sql`
    SELECT tipo_local, COUNT(*)::int AS cantidad
    FROM tiendas
    GROUP BY tipo_local
    ORDER BY tipo_local
  `
  console.log('\nDistribución por tipo_local:')
  console.table(resultado)

  const catalogos = await sql`
    SELECT hijo.codigo, padre.codigo AS padre, hijo.tienda_padre_id IS NOT NULL AS tiene_padre
    FROM tiendas hijo
    LEFT JOIN tiendas padre ON padre.id = hijo.tienda_padre_id
    WHERE hijo.tipo_local = 'CATALOGO'
    ORDER BY hijo.codigo
  `
  console.log('\nCatálogos y sus padres:')
  console.table(catalogos)

  await sql.end()
}
main().catch(console.error)
