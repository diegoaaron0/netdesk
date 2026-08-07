// Migra el rediseño de tipos de Gestión de Cambios:
//   - estado_ficha: agrega DADA_DE_BAJA (estado terminal nuevo, distinto de
//     HISTORICA — una ficha dada de baja no fue reemplazada por otra).
//   - tipo_accion: fusiona CAMBIO_PROVEEDOR + ACTUALIZACION_PLAN → CAMBIO_CONTRATO,
//     renombra RENEGOCIACION_CONTRATO → RENOVACION_CONTRATO, agrega BAJA_CONTRATO.
//     AUDITORIA_PROVEEDOR / ADQUISICION_EQUIPO / PLAN_MEJORA quedan intactos.
//
// Postgres no permite DROP VALUE de un enum, así que tipo_accion se reconstruye
// (rename → create → ALTER COLUMN ... USING CASE → drop del tipo viejo), dentro
// de una transacción. estado_ficha solo agrega un valor, eso sí es nativo/idempotente.
//
// Uso:  npx tsx scripts/migrate-gestion-cambios-tipos.ts
// Cablea .env.test explícitamente y se niega a correr si el host no es local.
import { config } from 'dotenv'
import path from 'path'
import { pathToFileURL } from 'url'
config({ path: path.resolve(__dirname, '../.env.test'), override: true })

import postgres from 'postgres'

// Mapeo legado → nuevo (única fuente de verdad — el CASE de la migración SQL
// se genera a partir de este objeto, no se repite a mano). Un tipo legado que
// no está en el mapa se conserva tal cual (AUDITORIA_PROVEEDOR, ADQUISICION_EQUIPO,
// PLAN_MEJORA quedan fuera de alcance).
export const MAPEO_TIPO_LEGADO: Record<string, string> = {
  CAMBIO_PROVEEDOR:       'CAMBIO_CONTRATO',
  ACTUALIZACION_PLAN:     'CAMBIO_CONTRATO',
  RENEGOCIACION_CONTRATO: 'RENOVACION_CONTRATO',
}

export function mapTipoAccionLegado(tipo: string): string {
  return MAPEO_TIPO_LEGADO[tipo] ?? tipo
}

function casoSqlMapeo(): string {
  const whens = Object.entries(MAPEO_TIPO_LEGADO)
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

  // ── estado_ficha: agregar DADA_DE_BAJA ──────────────────────────────────────
  await sql`ALTER TYPE estado_ficha ADD VALUE IF NOT EXISTS 'DADA_DE_BAJA'`
  console.log('[estado_ficha] DADA_DE_BAJA asegurado en el enum')

  // ── tipo_accion: fusión + rename + alta ─────────────────────────────────────
  const yaMigrado = await sql`
    SELECT 1 FROM pg_enum WHERE enumtypid = 'tipo_accion'::regtype AND enumlabel = 'CAMBIO_CONTRATO'
  `
  if (yaMigrado.length > 0) {
    console.log('[tipo_accion] ya migrado (CAMBIO_CONTRATO ya existe en el enum) — nada que hacer')
  } else {
    const antes = await sql`SELECT tipo, COUNT(*)::int AS n FROM acciones_gestion GROUP BY tipo ORDER BY tipo`
    console.log('[tipo_accion] filas por tipo ANTES de migrar:', antes)

    await sql.begin(async (tx) => {
      await tx`ALTER TYPE tipo_accion RENAME TO tipo_accion_old`
      await tx`
        CREATE TYPE tipo_accion AS ENUM (
          'RENOVACION_CONTRATO', 'CAMBIO_CONTRATO', 'BAJA_CONTRATO',
          'AUDITORIA_PROVEEDOR', 'ADQUISICION_EQUIPO', 'PLAN_MEJORA'
        )
      `
      await tx.unsafe(`
        ALTER TABLE acciones_gestion ALTER COLUMN tipo TYPE tipo_accion USING (
          ${casoSqlMapeo()}
        )::tipo_accion
      `)
      await tx`DROP TYPE tipo_accion_old`
    })

    const despues = await sql`SELECT tipo, COUNT(*)::int AS n FROM acciones_gestion GROUP BY tipo ORDER BY tipo`
    console.log('[tipo_accion] filas por tipo DESPUÉS de migrar:', despues)
  }

  await sql.end()
}

// Solo ejecuta al correr el script directamente (tsx scripts/...), no al
// importar mapTipoAccionLegado/MAPEO_TIPO_LEGADO desde el test unitario.
const esEjecucionDirecta = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href
if (esEjecucionDirecta) {
  main().catch(e => { console.error(e); process.exit(1) })
}
