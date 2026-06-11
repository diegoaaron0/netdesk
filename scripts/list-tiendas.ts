import 'dotenv/config'
import postgres from 'postgres'

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no definida')
  const sql = postgres(process.env.DATABASE_URL, { ssl: process.env.NODE_ENV === 'production' ? 'require' : false })
  const rows = await sql`SELECT codigo, nombre_cc FROM tiendas ORDER BY codigo`
  for (const r of rows) console.log(`${r.codigo.padEnd(10)} ${r.nombre_cc ?? ''}`)
  await sql.end()
}
main().catch(console.error)
