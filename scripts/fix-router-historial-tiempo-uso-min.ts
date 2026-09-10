// Corrige una deriva de esquema: la migración original (0020_routers_externos.sql)
// crea router_historial.tiempo_uso_min, pero drizzle/schema.ts nunca la definió y
// en netdesk_test la columna no existe — GET /api/routers-externos/[id] fallaba
// siempre al armar el historial combinado. Se detectó al escribir el primer test
// de ese endpoint (auditoría del módulo Usuarios, Paso 5).
//
// Uso:  npx tsx scripts/fix-router-historial-tiempo-uso-min.ts
// Cablea .env.test explícitamente y se niega a correr si el host no es local.
import { config } from 'dotenv'
import path from 'path'
import { pathToFileURL } from 'url'
config({ path: path.resolve(__dirname, '../.env.test'), override: true })

import postgres from 'postgres'

async function main() {
  const url = process.env.DATABASE_URL!
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`Rechazado: DATABASE_URL no apunta a localhost (${url}). Este script es solo para BD local.`)
  }
  const sql = postgres(url)
  console.log('BD destino:', url.replace(/:[^:@]+@/, ':***@'))

  await sql`ALTER TABLE router_historial ADD COLUMN IF NOT EXISTS tiempo_uso_min INTEGER`
  console.log('[router_historial] columna tiempo_uso_min asegurada')

  await sql.end()
}

const esEjecucionDirecta = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href
if (esEjecucionDirecta) {
  main().catch(e => { console.error(e); process.exit(1) })
}
