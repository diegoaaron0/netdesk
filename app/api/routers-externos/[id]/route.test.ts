import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}

let routerId: string

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  let [r] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.codigo, 'RT-ID-PERM-TEST'))
  if (!r) {
    [r] = await db.insert(schema.routersExternos).values({ codigo: 'RT-ID-PERM-TEST', estado: 'DISPONIBLE' }).returning()
  } else {
    await db.update(schema.routersExternos).set({ estado: 'DISPONIBLE', tiendaActualId: null, activo: true } as any).where(eq(schema.routersExternos.id, r.id))
  }
  routerId = r.id
})

describe('GET /api/routers-externos/[id] — mantenimiento.ver basta', () => {
  it('AGENTE (solo mantenimiento.ver) puede ver el detalle (200)', async () => {
    const { auth } = await import('@/auth')
    const { GET } = await import('./route')

    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: 'agente-test-id' } } as any)
    const res = await GET({} as any, { params: Promise.resolve({ id: routerId }) })
    expect(res.status).toBe(200)
  })
})

describe('PUT /api/routers-externos/[id] — permisos (mantenimiento.editar, no mantenimiento.ver)', () => {
  it('AGENTE (solo mantenimiento.ver) → 403', async () => {
    const { auth } = await import('@/auth')
    const { PUT } = await import('./route')

    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: 'agente-test-id' } } as any)
    // Campo vigente de la ficha: `ip` salió del formulario y ya no es editable.
    const res = await PUT(reqCon({ marca: 'TP-Link' }), { params: Promise.resolve({ id: routerId }) })
    expect(res.status).toBe(403)
  })

  it('SUPERVISOR (mantenimiento.editar) puede editar (200)', async () => {
    const { PUT } = await import('./route')
    // Campo vigente de la ficha: `ip` salió del formulario y ya no es editable.
    const res = await PUT(reqCon({ marca: 'TP-Link' }), { params: Promise.resolve({ id: routerId }) })
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/routers-externos/[id] — permisos (mantenimiento.editar, no mantenimiento.ver)', () => {
  it('AGENTE (solo mantenimiento.ver) → 403, no elimina', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { auth } = await import('@/auth')
    const { DELETE } = await import('./route')

    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: 'agente-test-id' } } as any)
    const res = await DELETE({} as any, { params: Promise.resolve({ id: routerId }) })
    expect(res.status).toBe(403)

    const [router] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.id, routerId))
    expect(router.activo).toBe(true)
  })
})
