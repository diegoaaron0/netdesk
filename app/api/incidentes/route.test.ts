import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq, count } from 'drizzle-orm'
import { NextRequest } from 'next/server'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE' } }),
}))

let tiendaArchivadaId: string

function postReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/incidentes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-INC-ARCHIVADA-01'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-INC-ARCHIVADA-01', nombreCc: 'Tienda archivada — bloqueo incidentes', distrito: 'Test', cluster: 'B',
      estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Test',
    }).returning()
  } else {
    await db.update(schema.tiendas).set({ estado: 'ARCHIVADA', archivadaEn: new Date() } as any).where(eq(schema.tiendas.id, t.id))
  }
  tiendaArchivadaId = t.id
})

describe('POST /api/incidentes — rechaza contra tienda archivada', () => {
  it('tienda con estado ARCHIVADA → 409, no crea el incidente', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { POST } = await import('./route')

    const [{ total: antes }] = await db.select({ total: count() }).from(schema.incidentes)
      .where(eq(schema.incidentes.tiendaId, tiendaArchivadaId))

    const res = await POST(postReq({ tiendaId: tiendaArchivadaId, nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL' }))
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toMatch(/archivada/i)

    const [{ total: despues }] = await db.select({ total: count() }).from(schema.incidentes)
      .where(eq(schema.incidentes.tiendaId, tiendaArchivadaId))
    expect(despues).toBe(antes)
  })
})
