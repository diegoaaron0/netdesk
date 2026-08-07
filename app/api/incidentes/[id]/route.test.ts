import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE' } }),
}))

describe('GET /api/incidentes/[id] — fallback de proveedor (Paso 1)', () => {
  it('cuando incidentes.proveedorId es NULL, cae al proveedor actual de la tienda (COALESCE)', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { GET } = await import('./route')

    const [inc] = await db.select({ id: schema.incidentes.id, proveedorId: schema.incidentes.proveedorId })
      .from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    expect(inc, 'fixture TST-P1-001 debe existir — corre tests/fixtures/seed-test-data.ts').toBeTruthy()
    expect(inc.proveedorId).toBeNull() // precondición del fixture

    const res = await GET({} as any, { params: Promise.resolve({ id: inc.id }) })
    const data = await res.json()

    expect(data.proveedorNombre).toBe('BITEL TEST')
    expect(data.proveedorId).toBeTruthy() // ya no debe quedar vacío
  })

  it('cuando incidentes.proveedorId SÍ está seteado, se usa ese (histórico), no el de la tienda', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { GET } = await import('./route')

    const [inc] = await db.select({ id: schema.incidentes.id })
      .from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P2-001'))
    expect(inc).toBeTruthy()

    const res = await GET({} as any, { params: Promise.resolve({ id: inc.id }) })
    const data = await res.json()

    expect(data.proveedorNombre).toBe('BITEL TEST')
  })
})

describe('PUT /api/incidentes/[id] — edición de incidente cerrado (Paso 1, cierre de módulo)', () => {
  it('INFRAESTRUCTURA puede editar un incidente cerrado (mismo acceso que Supervisor)', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'infra-test@netdesk-test.local', rol: 'INFRAESTRUCTURA', id: 'infra-id' } } as any)

    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { PUT } = await import('./route')

    const [inc] = await db.select({ id: schema.incidentes.id, estado: schema.incidentes.estado })
      .from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    expect(inc.estado, 'el fixture debe estar cerrado para esta prueba').toBe('RESUELTO')

    const req = { json: async () => ({ observaciones: 'editado por infraestructura' }) } as any
    const res = await PUT(req, { params: Promise.resolve({ id: inc.id }) })

    expect(res.status).not.toBe(403)
    const data = await res.json()
    expect(data.observaciones).toBe('editado por infraestructura')
  })

  it('un rol sin permiso (AGENTE) sigue sin poder editar un incidente cerrado', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: 'agente-id' } } as any)

    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { PUT } = await import('./route')

    const [inc] = await db.select({ id: schema.incidentes.id })
      .from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))

    const req = { json: async () => ({ observaciones: 'no debería guardar' }) } as any
    const res = await PUT(req, { params: Promise.resolve({ id: inc.id }) })

    expect(res.status).toBe(403)
  })
})
