import { db } from '@/lib/db'
import { fichas, tiendas } from '@/drizzle/schema'
import { and, eq } from 'drizzle-orm'
import { SLA_RESPUESTA_MIN, SLA_RESOLUCION_DEFAULT_MIN } from './sla-core'

export interface SlaContrato {
  respuestaMin: number
  resolucionMin: number
  fuente: 'ficha_activa' | 'hardcoded'
}

const cache = new Map<string, { data: SlaContrato; ts: number }>()
const TTL = 5 * 60 * 1000 // 5 minutos

export async function getSlaContrato(
  _proveedorId: string,
  tiendaId?: string | null
): Promise<SlaContrato> {
  const key = `tienda:${tiendaId ?? 'none'}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.ts < TTL) return cached.data

  const fallback: SlaContrato = {
    respuestaMin: SLA_RESPUESTA_MIN,
    resolucionMin: SLA_RESOLUCION_DEFAULT_MIN,
    fuente: 'hardcoded',
  }

  if (!tiendaId) {
    cache.set(key, { data: fallback, ts: Date.now() })
    return fallback
  }

  try {
    // Buscar la ficha activa de la tienda via fichaActivaId
    const [row] = await db
      .select({
        tiempoRespuestaSla:  fichas.tiempoRespuestaSla,
        tiempoResolucionSla: fichas.tiempoResolucionSla,
      })
      .from(tiendas)
      .innerJoin(fichas, and(eq(fichas.id, tiendas.fichaActivaId!), eq(fichas.estado, 'ACTIVA')))
      .where(eq(tiendas.id, tiendaId))
      .limit(1)

    if (row?.tiempoRespuestaSla || row?.tiempoResolucionSla) {
      const data: SlaContrato = {
        respuestaMin:  row.tiempoRespuestaSla  ?? SLA_RESPUESTA_MIN,
        resolucionMin: row.tiempoResolucionSla ?? SLA_RESOLUCION_DEFAULT_MIN,
        fuente: 'ficha_activa',
      }
      cache.set(key, { data, ts: Date.now() })
      return data
    }
  } catch { /* fallback */ }

  cache.set(key, { data: fallback, ts: Date.now() })
  return fallback
}
