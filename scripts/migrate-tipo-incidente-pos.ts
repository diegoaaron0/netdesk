// Elimina el valor 'POS' del enum tipo_incidente: fusiona POS -> OTROS.
// Mismo patrón que migrate-gestion-cambios-tipos.ts para tipo_accion — Postgres
// no permite DROP VALUE de un enum, así que se reconstruye (rename -> create ->
// ALTER COLUMN ... USING CASE -> drop del tipo viejo), dentro de una transacción.
//
// Uso:  npx tsx scripts/migrate-tipo-incidente-pos.ts
// Cablea .env.test explícitamente y se niega a correr si el host no es local.
import { config } from 'dotenv'
import path from 'path'
import { pathToFileURL } from 'url'
config({ path: path.resolve(__dirname, '../.env.test'), override: true })

import postgres from 'postgres'

// Mapeo legado -> nuevo (única fuente de verdad — el CASE de la migración SQL
// se genera a partir de este objeto, no se repite a mano).
export const MAPEO_TIPO_INCIDENTE_LEGADO: Record<string, string> = {
  POS: 'OTROS',
}

export function mapTipoIncidenteLegado(tipo: string): string {
  return MAPEO_TIPO_INCIDENTE_LEGADO[tipo] ?? tipo
}

function casoSqlMapeo(): string {
  const whens = Object.entries(MAPEO_TIPO_INCIDENTE_LEGADO)
    .map(([legado, nuevo]) => `WHEN '${legado}' THEN '${nuevo}'`)
    .join('\n            ')
  return `CASE tipo::text\n            ${whens}\n            ELSE tipo::text\n          END`
}

async function main() {
  const url = process.env.DATABASE_URL!
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`Rechazado: DATABASE_URL no apunta a localhost (${url}). Este script es solo para BD local.`)
  }
  const sql = postgres(url)
  console.log('BD destino:', url.replace(/:[^:@]+@/, ':***@'))

  const yaMigrado = await sql`
    SELECT 1 FROM pg_enum WHERE enumtypid = 'tipo_incidente'::regtype AND enumlabel = 'POS'
  `
  if (yaMigrado.length === 0) {
    console.log('[tipo_incidente] ya migrado (POS ya no existe en el enum) — nada que hacer')
  } else {
    const antes = await sql`SELECT tipo, COUNT(*)::int AS n FROM incidentes GROUP BY tipo ORDER BY tipo`
    console.log('[tipo_incidente] filas por tipo ANTES de migrar:', antes)

    await sql.begin(async (tx) => {
      await tx`ALTER TYPE tipo_incidente RENAME TO tipo_incidente_old`
      await tx`
        CREATE TYPE tipo_incidente AS ENUM (
          'CAIDA_TOTAL', 'INTERMITENCIA', 'LENTITUD', 'OTROS', 'CORTE_ELECTRICO'
        )
      `
      await tx.unsafe(`
        ALTER TABLE incidentes ALTER COLUMN tipo TYPE tipo_incidente USING (
          ${casoSqlMapeo()}
        )::tipo_incidente
      `)
      await tx`DROP TYPE tipo_incidente_old`
    })

    const despues = await sql`SELECT tipo, COUNT(*)::int AS n FROM incidentes GROUP BY tipo ORDER BY tipo`
    console.log('[tipo_incidente] filas por tipo DESPUÉS de migrar:', despues)
  }

  await sql.end()
}

// Solo ejecuta al correr el script directamente (tsx scripts/...), no al
// importar mapTipoIncidenteLegado/MAPEO_TIPO_INCIDENTE_LEGADO desde el test unitario.
const esEjecucionDirecta = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href
if (esEjecucionDirecta) {
  main().catch(e => { console.error(e); process.exit(1) })
}
