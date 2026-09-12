// ESTADO: estado de ejecucion NO CONFIRMADO — verificar antes de correr.
// Agrega usuarios.debe_cambiar_password (boolean, default false) — forzar cambio
// de contraseña en el primer login cuando se crea con la contraseña por defecto,
// o cuando un Supervisor le resetea la contraseña a otro usuario.
//
// Uso:  npx tsx scripts/migrate-usuarios-debe-cambiar-password.ts
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

  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT false`
  console.log('[usuarios] columna debe_cambiar_password asegurada (todas las filas existentes quedan en false)')

  await sql.end()
}

const esEjecucionDirecta = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href
if (esEjecucionDirecta) {
  main().catch(e => { console.error(e); process.exit(1) })
}
