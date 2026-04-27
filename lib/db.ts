import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@/drizzle/schema'

// Force UTC on every connection so timestamps stored without timezone
// are always interpreted and written in UTC, preventing Lima (UTC-5) offset drift.
const client = postgres(process.env.DATABASE_URL!, {
  connection: { TimeZone: 'UTC' },
})
export const db = drizzle(client, { schema })
