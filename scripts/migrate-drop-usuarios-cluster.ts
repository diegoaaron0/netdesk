// Elimina la columna cluster de usuarios (dato sin uso funcional, auditoría del
// módulo Usuarios — Paso 9). NO toca tiendas.cluster, que es una columna distinta
// (mismo enum cluster_tienda, pero sigue en uso pleno en Tiendas).
//
// Uso:  npx tsx scripts/migrate-drop-usuarios-cluster.ts
// Cablea .env.test explícitamente y se niega a correr si el host no es local.
// Requiere dump previo de la BD destino (ver backups/).
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

  await sql`ALTER TABLE usuarios DROP COLUMN IF EXISTS cluster`
  console.log('[usuarios] columna cluster eliminada (tiendas.cluster no se toca)')

  await sql.end()
}

const esEjecucionDirecta = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href
if (esEjecucionDirecta) {
  main().catch(e => { console.error(e); process.exit(1) })
}
