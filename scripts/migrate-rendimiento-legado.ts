// Migra los valores legado de rendimiento (TOTAL/EFECTIVA/LIMITADA/FALLIDA/
// NO_FUNCIONO/INOPERATIVA) a su equivalente nuevo (EFECTIVO/PARCIAL/NULO) en
// incidentes.cont_rendimiento e incidentes.mov_rendimiento.
//
// El mapeo NO se re-escribe a mano: se deriva de normContFactor() (lib/impacto-calc.ts),
// que es la fuente de verdad de qué valores producen el mismo factor de IEI. Dos
// valores son equivalentes si generan el mismo factor.
//
// Fuera de alcance a propósito: boleta_rendimiento (vocabulario propio, no es
// parte de este formato legado/nuevo) y mitigaciones_previas (JSON histórico,
// se deja como snapshot congelado — decisión explícita).
//
// Uso:  DATABASE_URL=postgresql://...@localhost:.../netdesk_test npx tsx scripts/migrate-rendimiento-legado.ts
// Nunca contra Railway/producción — el script se niega a correr si el host no es local.
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(__dirname, '../.env.test'), override: true })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq, isNotNull } from 'drizzle-orm'
import * as schema from '../drizzle/schema'
import { normContFactor } from '../lib/impacto-calc'

const NUEVOS = ['EFECTIVO', 'PARCIAL', 'NULO'] as const

function legacyToNew(valor: string): string {
  const factor = normContFactor(valor)
  const nuevo = NUEVOS.find(n => normContFactor(n) === factor)
  if (!nuevo) throw new Error(`No se encontró equivalente nuevo para "${valor}" (factor ${factor}) — revisar normContFactor`)
  return nuevo
}

async function migrarColumna(
  db: ReturnType<typeof drizzle>,
  columna: 'contRendimiento' | 'movRendimiento',
  nombreSql: string,
) {
  const col = schema.incidentes[columna]
  const rows = await db.select({ id: schema.incidentes.id, valor: col })
    .from(schema.incidentes)
    .where(isNotNull(col))

  const cambios: Record<string, number> = {}
  let migrados = 0
  let yaNuevos = 0

  for (const row of rows) {
    const valorActual = (row.valor as string).toUpperCase()
    if ((NUEVOS as readonly string[]).includes(valorActual)) {
      yaNuevos++
      continue
    }
    const nuevo = legacyToNew(valorActual)
    await db.update(schema.incidentes).set({ [columna]: nuevo } as any).where(eq(schema.incidentes.id, row.id))
    const key = `${valorActual} → ${nuevo}`
    cambios[key] = (cambios[key] ?? 0) + 1
    migrados++
  }

  console.log(`[${nombreSql}] filas con valor: ${rows.length} · ya en formato nuevo: ${yaNuevos} · migradas: ${migrados}`)
  for (const [k, n] of Object.entries(cambios)) console.log(`   ${k}  (${n})`)
}

async function main() {
  const url = process.env.DATABASE_URL!
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`Rechazado: DATABASE_URL no apunta a localhost (${url}). Este script es solo para BD local.`)
  }
  const client = postgres(url)
  const db = drizzle(client, { schema })

  console.log('BD destino:', url.replace(/:[^:@]+@/, ':***@'))
  await migrarColumna(db, 'contRendimiento', 'incidentes.cont_rendimiento')
  await migrarColumna(db, 'movRendimiento',  'incidentes.mov_rendimiento')

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
