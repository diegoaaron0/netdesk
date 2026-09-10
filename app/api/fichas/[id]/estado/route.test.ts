import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}

let proveedorId: string
let tiendaArchivadaId: string
let fichaBorradorId: string

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')
  const { auth } = await import('@/auth')

  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  const usuarioId = ref.registradoPorId
  vi.mocked(auth).mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: usuarioId } } as any)

  let [prov] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, 'FICHAS ESTADO TEST PROV'))
  if (!prov) [prov] = await db.insert(schema.proveedores).values({ nombre: 'FICHAS ESTADO TEST PROV' }).returning()
  proveedorId = prov.id

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-FICHAS-ESTADO-ARCHIVADA'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-FICHAS-ESTADO-ARCHIVADA', nombreCc: 'Tienda archivada — PATCH estado ficha', distrito: 'Test', cluster: 'B',
      estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Cierre de prueba',
    }).returning()
  } else {
    await db.update(schema.tiendas)
      .set({ estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Cierre de prueba', fichaActivaId: null } as any)
      .where(eq(schema.tiendas.id, t.id))
  }
  tiendaArchivadaId = t.id

  await db.delete(schema.fichas).where(eq(schema.fichas.codigo, 'FC-ESTADO-ARCHIVADA-01'))
  const [f] = await db.insert(schema.fichas).values({
    codigo: 'FC-ESTADO-ARCHIVADA-01', tiendaId: tiendaArchivadaId, proveedorId, estado: 'BORRADOR',
  }).returning()
  fichaBorradorId = f.id
})

describe('PATCH /api/fichas/[id]/estado — activar una ficha de una tienda ARCHIVADA', () => {
  it('rechaza con 409, la ficha sigue en BORRADOR', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { PATCH } = await import('./route')

    const res = await PATCH(reqCon({ estado: 'ACTIVA' }), { params: Promise.resolve({ id: fichaBorradorId }) })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toMatch(/archivada/i)

    const [ficha] = await db.select().from(schema.fichas).where(eq(schema.fichas.id, fichaBorradorId))
    expect(ficha.estado).toBe('BORRADOR')
    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tiendaArchivadaId))
    expect(tienda.fichaActivaId).toBeNull()
  })
})
