import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@/drizzle/schema'

// El pool se cachea en globalThis fuera de producción. En dev, cada hot-reload
// vuelve a evaluar este módulo: sin la caché se creaba un pool nuevo (10
// conexiones por defecto) y el anterior quedaba abierto para siempre. Con una
// jornada de ediciones sobre rutas, el servidor de dev llegó a retener ~95
// conexiones y Postgres empezó a rechazar todo con "demasiados clientes",
// incluidas las corridas de tests. En producción el módulo se evalúa una sola
// vez, así que la caché no cambia nada allá.
const globalParaDb = globalThis as unknown as { __netdeskPg?: ReturnType<typeof postgres> }

const client = globalParaDb.__netdeskPg ?? postgres(process.env.DATABASE_URL!, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
  connection: { TimeZone: 'UTC' },
})
if (process.env.NODE_ENV !== 'production') globalParaDb.__netdeskPg = client

export const db = drizzle(client, { schema })
