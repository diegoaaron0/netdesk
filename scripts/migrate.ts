import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('ERROR: DATABASE_URL no definida')
  process.exit(1)
}

const sql = postgres(url, { ssl: 'require', max: 1 })

const migrations = [
  `ALTER TABLE incidentes ADD COLUMN IF NOT EXISTS ticket_invgate TEXT`,
  `ALTER TABLE usuarios   ADD COLUMN IF NOT EXISTS permisos TEXT[]`,
  `ALTER TABLE tiendas    ADD COLUMN IF NOT EXISTS perfil_supervisor TEXT`,
]

async function run() {
  console.log('Conectando a:', url!.replace(/:\/\/[^@]+@/, '://***@'))
  for (const m of migrations) {
    await sql.unsafe(m)
    console.log('OK:', m)
  }
  await sql.end()
  console.log('\nMigración completada.')
}

run().catch(e => { console.error(e); process.exit(1) })
