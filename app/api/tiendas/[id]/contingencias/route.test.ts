import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

let tiendaId: string

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-CONTINGENCIAS-LIMIT'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({ codigo: 'T-CONTINGENCIAS-LIMIT', nombreCc: 'Tienda — limit contingencias', distrito: 'Test', cluster: 'B' }).returning()
  }
  tiendaId = t.id

  await db.delete(schema.contingencias).where(eq(schema.contingencias.tiendaId, tiendaId))
  const filas = Array.from({ length: 105 }, (_, i) => ({
    tiendaId,
    tipo: 'DATOS_MOVILES',
    activadoPor: 'Test',
    justificacion: `Contingencia de prueba ${i}`,
    horaActivacion: new Date(Date.now() - i * 60000),
    horaDesactivacion: new Date(Date.now() - i * 60000 + 30000),
  }))
  await db.insert(schema.contingencias).values(filas)
})

describe('GET /api/tiendas/[id]/contingencias — LIMIT', () => {
  it('nunca devuelve más de 100 filas aunque existan más', async () => {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/tiendas/x/contingencias'), { params: Promise.resolve({ id: tiendaId }) })
    const data = await res.json()

    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeLessThanOrEqual(100)
  })
})
