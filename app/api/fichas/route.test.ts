import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}

let usuarioId: string
let proveedorId: string
let tiendaArchivadaId: string

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')
  const { auth } = await import('@/auth')

  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  usuarioId = ref.registradoPorId
  vi.mocked(auth).mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: usuarioId } } as any)

  let [prov] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, 'FICHAS POST TEST PROV'))
  if (!prov) [prov] = await db.insert(schema.proveedores).values({ nombre: 'FICHAS POST TEST PROV' }).returning()
  proveedorId = prov.id

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-FICHAS-POST-ARCHIVADA'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-FICHAS-POST-ARCHIVADA', nombreCc: 'Tienda archivada — POST fichas', distrito: 'Test', cluster: 'B',
      estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Cierre de prueba',
    }).returning()
  } else {
    await db.update(schema.tiendas).set({ estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Cierre de prueba' } as any).where(eq(schema.tiendas.id, t.id))
  }
  tiendaArchivadaId = t.id
})

describe('POST /api/fichas — rechaza si la tienda está ARCHIVADA', () => {
  it('devuelve 409 y no crea la ficha', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { POST } = await import('./route')

    await db.delete(schema.fichas).where(eq(schema.fichas.tiendaId, tiendaArchivadaId))

    const res = await POST(reqCon({ tiendaId: tiendaArchivadaId, proveedorId }))
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toMatch(/archivada/i)

    const [existe] = await db.select().from(schema.fichas).where(eq(schema.fichas.tiendaId, tiendaArchivadaId))
    expect(existe).toBeUndefined()
  })
})
