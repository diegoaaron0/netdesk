import { db } from '@/lib/db'
import { tiendas } from '@/drizzle/schema'
import { sql } from 'drizzle-orm'

let _cache: { total: number; ts: number } | null = null
const TTL = 30 * 60 * 1000 // 30 min — tiendas no cambian frecuentemente

export async function getTotalTiendas(): Promise<number> {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.total
  const [r] = await db.select({ total: sql<number>`count(*)::int` })
    .from(tiendas)
    .where(sql`${tiendas.estado} = 'ACTIVA'`)
  const total = r?.total ?? 156
  _cache = { total, ts: Date.now() }
  return total
}
