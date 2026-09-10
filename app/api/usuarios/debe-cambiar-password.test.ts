import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}

describe('POST /api/usuarios — debeCambiarPassword según si se envía contraseña explícita', () => {
  it('sin contraseña (usa la de por defecto) → debeCambiarPassword queda true', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const email = 'usuario-sin-password-explicito@netdesk-test.local'
    await db.delete(schema.usuarios).where(eq(schema.usuarios.email, email))

    const { POST } = await import('./route')
    const res = await POST(reqCon({ nombre: 'Sin Password Explícito', email }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.debeCambiarPassword).toBe(true)

    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email))
    expect(u.debeCambiarPassword).toBe(true)
  })

  it('con contraseña explícita → debeCambiarPassword queda false', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const email = 'usuario-con-password-explicito@netdesk-test.local'
    await db.delete(schema.usuarios).where(eq(schema.usuarios.email, email))

    const { POST } = await import('./route')
    const res = await POST(reqCon({ nombre: 'Con Password Explícito', email, password: 'unaClaveElegidaPorElAdmin123' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.debeCambiarPassword).toBe(false)
  })
})

describe('PUT /api/usuarios/[id] — un Supervisor reseteando la contraseña de otro usuario marca debeCambiarPassword', () => {
  it('el admin escribe una contraseña nueva → debeCambiarPassword pasa a true', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const email = 'usuario-reset-por-supervisor@netdesk-test.local'
    await db.delete(schema.usuarios).where(eq(schema.usuarios.email, email))
    const [u] = await db.insert(schema.usuarios).values({
      nombre: 'Reset Por Supervisor', email, rol: 'AGENTE', debeCambiarPassword: false,
    }).returning()

    const { PUT } = await import('./[id]/route')
    const res = await PUT(reqCon({ password: 'claveNuevaEscritaPorElSupervisor' }), { params: Promise.resolve({ id: u.id }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.debeCambiarPassword).toBe(true)
  })

  it('editar otros campos sin tocar la contraseña NO marca debeCambiarPassword', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const email = 'usuario-sin-reset-password@netdesk-test.local'
    await db.delete(schema.usuarios).where(eq(schema.usuarios.email, email))
    const [u] = await db.insert(schema.usuarios).values({
      nombre: 'Sin Reset', email, rol: 'AGENTE', debeCambiarPassword: false,
    }).returning()

    const { PUT } = await import('./[id]/route')
    const res = await PUT(reqCon({ nombre: 'Sin Reset Editado' }), { params: Promise.resolve({ id: u.id }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.debeCambiarPassword).toBe(false)
  })
})

describe('PATCH /api/usuarios/me/password — cambiar la contraseña correctamente limpia la marca', () => {
  it('debeCambiarPassword pasa de true a false tras un cambio exitoso', async () => {
    const bcrypt = (await import('bcryptjs')).default
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { auth } = await import('@/auth')
    const email = 'usuario-limpia-marca@netdesk-test.local'
    const passwordActual = 'ClaveActualDePrueba123'
    await db.delete(schema.usuarios).where(eq(schema.usuarios.email, email))
    await db.insert(schema.usuarios).values({
      nombre: 'Limpia Marca', email, rol: 'AGENTE',
      password: await bcrypt.hash(passwordActual, 12),
      debeCambiarPassword: true,
    })

    vi.mocked(auth).mockResolvedValueOnce({ user: { email, rol: 'AGENTE' } } as any)
    const { PATCH } = await import('./me/password/route')
    const req = { json: async () => ({ passwordActual, passwordNueva: 'ClaveNuevaDePrueba456' }) } as any
    const res = await PATCH(req)
    expect(res.status).toBe(200)

    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email))
    expect(u.debeCambiarPassword).toBe(false)
  })

  it('un intento fallido (contraseña actual incorrecta) NO limpia la marca', async () => {
    const bcrypt = (await import('bcryptjs')).default
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { auth } = await import('@/auth')
    const email = 'usuario-marca-no-se-limpia@netdesk-test.local'
    await db.delete(schema.usuarios).where(eq(schema.usuarios.email, email))
    await db.insert(schema.usuarios).values({
      nombre: 'Marca No Se Limpia', email, rol: 'AGENTE',
      password: await bcrypt.hash('ClaveCorrecta123', 12),
      debeCambiarPassword: true,
    })

    vi.mocked(auth).mockResolvedValueOnce({ user: { email, rol: 'AGENTE' } } as any)
    const { PATCH } = await import('./me/password/route')
    const req = { json: async () => ({ passwordActual: 'ClaveIncorrecta', passwordNueva: 'ClaveNuevaDePrueba456' }) } as any
    const res = await PATCH(req)
    expect(res.status).toBe(400)

    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email))
    expect(u.debeCambiarPassword).toBe(true)
  })
})
