import postgres from 'postgres'

async function main() {
  const sql = postgres('postgresql://postgres:cbaEdUFlVULJNdlsdHdqBelVllfBMZwL@tramway.proxy.rlwy.net:10333/railway', { ssl: 'require' })
  const rows = await sql`SELECT codigo, nombre_cc FROM tiendas ORDER BY codigo`
  for (const r of rows) console.log(`${r.codigo.padEnd(10)} ${r.nombre_cc ?? ''}`)
  await sql.end()
}
main().catch(console.error)
