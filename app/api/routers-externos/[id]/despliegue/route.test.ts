import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}

let routerId: string
let tiendaArchivadaId: string

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-ROUTER-DESPLIEGUE-ARCHIVADA'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-ROUTER-DESPLIEGUE-ARCHIVADA', nombreCc: 'Tienda archivada — despliegue router', distrito: 'Test', cluster: 'B',
      estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Cierre de prueba',
    }).returning()
  } else {
    await db.update(schema.tiendas).set({ estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Cierre de prueba' } as any).where(eq(schema.tiendas.id, t.id))
  }
  tiendaArchivadaId = t.id

  let [r] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.codigo, 'RT-DESPLIEGUE-ARCHIVADA-01'))
  if (!r) {
    [r] = await db.insert(schema.routersExternos).values({ codigo: 'RT-DESPLIEGUE-ARCHIVADA-01', estado: 'DISPONIBLE' }).returning()
  } else {
    await db.update(schema.routersExternos).set({ estado: 'DISPONIBLE', tiendaActualId: null } as any).where(eq(schema.routersExternos.id, r.id))
  }
  routerId = r.id
})

describe('POST /api/routers-externos/[id]/despliegue — rechaza tienda destino ARCHIVADA', () => {
  it('devuelve 409 y no mueve el router', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { POST } = await import('./route')

    const res = await POST(reqCon({ tiendaId: tiendaArchivadaId }), { params: Promise.resolve({ id: routerId }) })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toMatch(/archivada/i)

    const [router] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.id, routerId))
    expect(router.estado).toBe('DISPONIBLE')
    expect(router.tiendaActualId).toBeNull()
  })
})

describe('POST /api/routers-externos/[id]/despliegue — permisos (mantenimiento.editar, no mantenimiento.ver)', () => {
  it('AGENTE (solo mantenimiento.ver) → 403', async () => {
    const { auth } = await import('@/auth')
    const { POST } = await import('./route')

    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: 'agente-test-id' } } as any)
    const res = await POST(reqCon({ tiendaId: tiendaArchivadaId }), { params: Promise.resolve({ id: routerId }) })
    expect(res.status).toBe(403)
  })
})
