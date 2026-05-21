import { db } from '@/lib/db'
import { contratosProveedor } from '@/drizzle/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { SLA_RESPUESTA_MIN, SLA_RESOLUCION_POR_TIPO } from './sla-core'

export interface SlaContrato {
  respuestaMin: number
  resolucionPorTipo: Record<string, number>
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
    resolucionPorTipo: { ...SLA_RESOLUCION_POR_TIPO },
    fuente: 'hardcoded',
  }

  try {
    // 1. Buscar contrato específico por tienda
    if (tiendaId) {
      const [especifico] = await db.select().from(contratosProveedor).where(
        and(eq(contratosProveedor.proveedorId, proveedorId), eq(contratosProveedor.tiendaId, tiendaId))
      ).limit(1)
      if (especifico?.tiempoRespuestaSla || especifico?.tiempoResolucionSla) {
        const data: SlaContrato = {
          respuestaMin: especifico.tiempoRespuestaSla ?? SLA_RESPUESTA_MIN,
          resolucionPorTipo: especifico.tiempoResolucionSla
            ? { CAIDA_TOTAL: especifico.tiempoResolucionSla, INTERMITENCIA: especifico.tiempoResolucionSla * 2, LENTITUD: especifico.tiempoResolucionSla * 4, POS: especifico.tiempoResolucionSla, OTROS: especifico.tiempoResolucionSla * 2 }
            : { ...SLA_RESOLUCION_POR_TIPO },
          fuente: 'contrato_especifico',
        }
        cache.set(key, { data, ts: Date.now() })
        return data
      }
    }

    // 2. Buscar contrato marco del proveedor
    const [marco] = await db.select().from(contratosProveedor).where(
      and(eq(contratosProveedor.proveedorId, proveedorId), isNull(contratosProveedor.tiendaId))
    ).limit(1)
    if (marco?.tiempoRespuestaSla || marco?.tiempoResolucionSla) {
      const data: SlaContrato = {
        respuestaMin: marco.tiempoRespuestaSla ?? SLA_RESPUESTA_MIN,
        resolucionPorTipo: marco.tiempoResolucionSla
          ? { CAIDA_TOTAL: marco.tiempoResolucionSla, INTERMITENCIA: marco.tiempoResolucionSla * 2, LENTITUD: marco.tiempoResolucionSla * 4, POS: marco.tiempoResolucionSla, OTROS: marco.tiempoResolucionSla * 2 }
          : { ...SLA_RESOLUCION_POR_TIPO },
        fuente: 'contrato_marco',
      }
      cache.set(key, { data, ts: Date.now() })
      return data
    }
  } catch { /* fallback */ }

  cache.set(key, { data: fallback, ts: Date.now() })
  return fallback
}
