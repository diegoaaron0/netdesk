// Migra el alta/baja de tienda como entidad:
//   - tiendas: agrega estado_tienda (ACTIVA/ARCHIVADA), estado (default ACTIVA),
//     archivada_en, archivada_por_id, archivada_motivo. Todas las filas
//     existentes quedan ACTIVA (vía el default de la columna).
//   - tiendas_historial: agrega motivo (NOT NULL, default '' para no romper
//     los call sites existentes que no pasan motivo).
//
// Uso:  npx tsx scripts/migrate-tienda-alta-baja.ts
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

  // ── estado_tienda + columnas de archivado en tiendas ────────────────────────
  await sql`DO $$ BEGIN
    CREATE TYPE estado_tienda AS ENUM ('ACTIVA', 'ARCHIVADA');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`
  console.log('[estado_tienda] tipo asegurado')

  await sql`ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS estado estado_tienda NOT NULL DEFAULT 'ACTIVA'`
  await sql`ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS archivada_en TIMESTAMP`
  await sql`ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS archivada_por_id UUID REFERENCES usuarios(id) ON DELETE SET NULL`
  await sql`ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS archivada_motivo TEXT`
  console.log('[tiendas] columnas de archivado aseguradas (todas las filas existentes quedan ACTIVA por el default)')

  // ── motivo en tiendas_historial ──────────────────────────────────────────────
  await sql`ALTER TABLE tiendas_historial ADD COLUMN IF NOT EXISTS motivo TEXT NOT NULL DEFAULT ''`
  console.log('[tiendas_historial] columna motivo asegurada')

  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM tiendas WHERE estado = 'ACTIVA'`
  console.log(`[tiendas] ${n} fila(s) en estado ACTIVA tras la migración`)

  await sql.end()
}

const esEjecucionDirecta = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href
if (esEjecucionDirecta) {
  main().catch(e => { console.error(e); process.exit(1) })
}
