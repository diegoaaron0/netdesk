import { describe, it, expect, vi } from 'vitest'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}

describe('GET /api/routers-externos — mantenimiento.ver basta', () => {
  it('AGENTE (solo mantenimiento.ver) puede listar (200)', async () => {
    const { auth } = await import('@/auth')
    const { GET } = await import('./route')

    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: 'agente-test-id' } } as any)
    const res = await GET()
    expect(res.status).toBe(200)
  })
})

describe('POST /api/routers-externos — permisos (mantenimiento.editar, no mantenimiento.ver)', () => {
  it('AGENTE (solo mantenimiento.ver) → 403, no crea el router', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { eq } = await import('drizzle-orm')
    const { auth } = await import('@/auth')
    const { POST } = await import('./route')

    await db.delete(schema.routersExternos).where(eq(schema.routersExternos.codigo, 'RT-PERM-TEST-AGENTE'))
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: 'agente-test-id' } } as any)
    const res = await POST(reqCon({ codigo: 'RT-PERM-TEST-AGENTE' }))
    expect(res.status).toBe(403)

    const [existe] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.codigo, 'RT-PERM-TEST-AGENTE'))
    expect(existe).toBeUndefined()
  })

  it('SUPERVISOR (mantenimiento.editar) puede crear (201)', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { eq } = await import('drizzle-orm')
    const { POST } = await import('./route')

    await db.delete(schema.routersExternos).where(eq(schema.routersExternos.codigo, 'RT-PERM-TEST-SUP'))
    const res = await POST(reqCon({ codigo: 'RT-PERM-TEST-SUP' }))
    expect(res.status).toBe(201)
  })
})
