import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

let usuarioId: string

function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}

let routerId: string

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  usuarioId = ref.registradoPorId

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-RETORNO-PERM-TEST'))
  if (!t) [t] = await db.insert(schema.tiendas).values({ codigo: 'T-RETORNO-PERM-TEST', nombreCc: 'Tienda — retorno permisos', distrito: 'Test', cluster: 'B' }).returning()

  let [r] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.codigo, 'RT-RETORNO-PERM-TEST'))
  if (!r) {
    [r] = await db.insert(schema.routersExternos).values({ codigo: 'RT-RETORNO-PERM-TEST', estado: 'EN_TIENDA_INACTIVO', tiendaActualId: t.id }).returning()
  } else {
    await db.update(schema.routersExternos).set({ estado: 'EN_TIENDA_INACTIVO', tiendaActualId: t.id } as any).where(eq(schema.routersExternos.id, r.id))
  }
  routerId = r.id
})

describe('POST /api/routers-externos/[id]/retorno — permisos (mantenimiento.editar, no mantenimiento.ver)', () => {
  it('AGENTE (solo mantenimiento.ver) → 403', async () => {
    const { auth } = await import('@/auth')
    const { POST } = await import('./route')

    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: usuarioId } } as any)
    const res = await POST(reqCon({ almacenDestino: 'Almacén Vulcano' }), { params: Promise.resolve({ id: routerId }) })
    expect(res.status).toBe(403)
  })

  it('SUPERVISOR (mantenimiento.editar) puede marcar el retorno (200)', async () => {
    const { auth } = await import('@/auth')
    const { POST } = await import('./route')
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: usuarioId } } as any)
    const res = await POST(reqCon({ almacenDestino: 'Almacén Vulcano' }), { params: Promise.resolve({ id: routerId }) })
    expect(res.status).toBe(200)
  })
})
