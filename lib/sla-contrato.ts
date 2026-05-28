import { db } from '@/lib/db'
import { contratosProveedor } from '@/drizzle/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { SLA_RESPUESTA_MIN, SLA_RESOLUCION_DEFAULT_MIN } from './sla-core'

export interface SlaContrato {
  respuestaMin: number
  resolucionMin: number
  fuente: 'contrato_especifico' | 'contrato_marco' | 'hardcoded'
}

const cache = new Map<string, { data: SlaContrato; ts: number }>()
const TTL = 5 * 60 * 1000 // 5 minutos

export async function getSlaContrato(
  proveedorId: string,
  tiendaId?: string | null
): Promise<SlaContrato> {
  const key = `${proveedorId}:${tiendaId ?? 'marco'}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.ts < TTL) return cached.data

  const fallback: SlaContrato = {
    respuestaMin: SLA_RESPUESTA_MIN,
    resolucionMin: SLA_RESOLUCION_DEFAULT_MIN,
    fuente: 'hardcoded',
  }

  try {
    // 1. Buscar contrato específico por tienda
    if (tiendaId) {
      const [especifico] = await db.select().from(contratosProveedor).where(
        and(eq(contratosProveedor.proveedorId, proveedorId), eq(contratosProveedor.tiendaId, tiendaId), eq(contratosProveedor.estado, 'VIGENTE'))
      ).limit(1)
      if (especifico?.tiempoRespuestaSla || especifico?.tiempoResolucionSla) {
        const data: SlaContrato = {
          respuestaMin: especifico.tiempoRespuestaSla ?? SLA_RESPUESTA_MIN,
          resolucionMin: especifico.tiempoResolucionSla ?? SLA_RESOLUCION_DEFAULT_MIN,
          fuente: 'contrato_especifico',
        }
        cache.set(key, { data, ts: Date.now() })
        return data
      }
    }

    // 2. Buscar contrato marco del proveedor
    const [marco] = await db.select().from(contratosProveedor).where(
      and(eq(contratosProveedor.proveedorId, proveedorId), isNull(contratosProveedor.tiendaId), eq(contratosProveedor.estado, 'VIGENTE'))
    ).limit(1)
    if (marco?.tiempoRespuestaSla || marco?.tiempoResolucionSla) {
      const data: SlaContrato = {
        respuestaMin: marco.tiempoRespuestaSla ?? SLA_RESPUESTA_MIN,
        resolucionMin: marco.tiempoResolucionSla ?? SLA_RESOLUCION_DEFAULT_MIN,
        fuente: 'contrato_marco',
      }
      cache.set(key, { data, ts: Date.now() })
      return data
    }
  } catch { /* fallback */ }

  cache.set(key, { data: fallback, ts: Date.now() })
  return fallback
}
