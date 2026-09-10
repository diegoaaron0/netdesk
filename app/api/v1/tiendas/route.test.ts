import { describe, it, expect, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'

const CODIGO_ACTIVA = 'T-V1-ACTIVA-01'
const CODIGO_ARCHIVADA = 'T-V1-ARCHIVADA-01'

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  let [a] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, CODIGO_ACTIVA))
  if (!a) await db.insert(schema.tiendas).values({ codigo: CODIGO_ACTIVA, nombreCc: 'V1 activa', distrito: 'Test', cluster: 'B' })
  else await db.update(schema.tiendas).set({ estado: 'ACTIVA', archivadaEn: null } as any).where(eq(schema.tiendas.id, a.id))

  let [b] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, CODIGO_ARCHIVADA))
  if (!b) {
    await db.insert(schema.tiendas).values({
      codigo: CODIGO_ARCHIVADA, nombreCc: 'V1 archivada', distrito: 'Test', cluster: 'B',
      estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Cierre de prueba',
    })
  } else {
    await db.update(schema.tiendas).set({ estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Cierre de prueba' } as any).where(eq(schema.tiendas.id, b.id))
  }
})

function reqConKey() {
  return new NextRequest('http://localhost/api/v1/tiendas', {
    headers: { 'x-api-key': process.env.PBI_API_KEY! },
  })
}

describe('GET /api/v1/tiendas — no cambia el filtro por defecto, pero expone estado', () => {
  it('sigue devolviendo tiendas ACTIVA y ARCHIVADA mezcladas (compatibilidad con consumidores externos)', async () => {
    const { GET } = await import('./route')
    const res = await GET(reqConKey())
    const body = await res.json()

    const activa = body.data.find((t: any) => t.codigo === CODIGO_ACTIVA)
    const archivada = body.data.find((t: any) => t.codigo === CODIGO_ARCHIVADA)
    expect(activa).toBeTruthy()
    expect(archivada).toBeTruthy()
  })

  it('cada fila incluye el campo estado para que el consumidor externo pueda filtrar', async () => {
    const { GET } = await import('./route')
    const res = await GET(reqConKey())
    const body = await res.json()

    const activa = body.data.find((t: any) => t.codigo === CODIGO_ACTIVA)
    const archivada = body.data.find((t: any) => t.codigo === CODIGO_ARCHIVADA)
    expect(activa.estado).toBe('ACTIVA')
    expect(archivada.estado).toBe('ARCHIVADA')
  })
})
