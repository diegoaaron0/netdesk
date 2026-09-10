import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}

const EMAIL_EXISTENTE = 'usuario-post-email-dup@netdesk-test.local'

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  await db.delete(schema.usuarios).where(eq(schema.usuarios.email, EMAIL_EXISTENTE))
  await db.insert(schema.usuarios).values({ nombre: 'Existente', email: EMAIL_EXISTENTE, rol: 'AGENTE' })
})

describe('POST /api/usuarios — validación de email único', () => {
  it('email ya registrado → 400 con mensaje de negocio, no 500', async () => {
    const { POST } = await import('./route')
    const res = await POST(reqCon({ nombre: 'Otro Usuario', email: EMAIL_EXISTENTE }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/correo ya está registrado|ese correo/i)
  })

  it('email nuevo → crea con éxito (201)', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const email = 'usuario-post-email-nuevo@netdesk-test.local'
    await db.delete(schema.usuarios).where(eq(schema.usuarios.email, email))

    const { POST } = await import('./route')
    const res = await POST(reqCon({ nombre: 'Usuario Nuevo', email, password: 'ClaveDelAdmin123' }))
    expect(res.status).toBe(201)
  })
})

describe('POST /api/usuarios y PUT /api/usuarios/[id] — crear/editar sin el campo cluster (eliminado)', () => {
  it('crear un usuario sin enviar cluster funciona y la respuesta no trae ese campo', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const email = 'usuario-sin-cluster@netdesk-test.local'
    await db.delete(schema.usuarios).where(eq(schema.usuarios.email, email))

    const { POST } = await import('./route')
    const res = await POST(reqCon({ nombre: 'Usuario Sin Cluster', email, password: 'ClaveDelAdmin123' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data).not.toHaveProperty('cluster')
  })

  it('editar nombre/rol de ese usuario sigue funcionando, sin campo cluster', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const email = 'usuario-sin-cluster@netdesk-test.local'
    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email))

    const { PUT } = await import('./[id]/route')
    const res = await PUT(reqCon({ nombre: 'Usuario Sin Cluster Editado', rol: 'INFRAESTRUCTURA' }), { params: Promise.resolve({ id: u.id }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.nombre).toBe('Usuario Sin Cluster Editado')
    expect(data.rol).toBe('INFRAESTRUCTURA')
    expect(data).not.toHaveProperty('cluster')
  })
})
