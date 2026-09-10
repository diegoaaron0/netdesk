import { describe, it, expect, beforeAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { autorizarCredenciales } from './auth'

const EMAIL_OK        = 'login-test-ok@netdesk-test.local'
const EMAIL_INACTIVO  = 'login-test-inactivo@netdesk-test.local'
const EMAIL_ELIMINADO = 'login-test-eliminado@netdesk-test.local'
const EMAIL_LEGACY    = 'login-test-legacy@netdesk-test.local'
const PASSWORD = 'ClaveDePrueba123'

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  const hash = await bcrypt.hash(PASSWORD, 12)

  for (const email of [EMAIL_OK, EMAIL_INACTIVO, EMAIL_ELIMINADO, EMAIL_LEGACY]) {
    await db.delete(schema.usuarios).where(eq(schema.usuarios.email, email))
  }
  await db.insert(schema.usuarios).values({ nombre: 'Login OK', email: EMAIL_OK, password: hash, rol: 'AGENTE', activo: true })
  await db.insert(schema.usuarios).values({ nombre: 'Login Inactivo', email: EMAIL_INACTIVO, password: hash, rol: 'AGENTE', activo: false })
  await db.insert(schema.usuarios).values({ nombre: 'Login Eliminado', email: EMAIL_ELIMINADO, password: hash, rol: 'AGENTE', activo: true, eliminadoEn: new Date() })
  // Contraseña legada en texto plano (usuarios migrados de un sistema viejo)
  await db.insert(schema.usuarios).values({ nombre: 'Login Legacy', email: EMAIL_LEGACY, password: PASSWORD, rol: 'AGENTE', activo: true })
})

describe('autorizarCredenciales — lógica real de login (sin tocar comportamiento, solo extraída para poder testearla)', () => {
  it('email + contraseña correctos → devuelve el usuario', async () => {
    const result = await autorizarCredenciales({ email: EMAIL_OK, password: PASSWORD })
    expect(result).not.toBeNull()
    expect(result?.email).toBe(EMAIL_OK)
    expect(result?.rol).toBe('AGENTE')
  })

  it('contraseña incorrecta → null', async () => {
    const result = await autorizarCredenciales({ email: EMAIL_OK, password: 'clave-equivocada' })
    expect(result).toBeNull()
  })

  it('email inexistente → null', async () => {
    const result = await autorizarCredenciales({ email: 'no-existe@netdesk-test.local', password: PASSWORD })
    expect(result).toBeNull()
  })

  it('usuario inactivo → null, igual que antes de la reforma del login', async () => {
    const result = await autorizarCredenciales({ email: EMAIL_INACTIVO, password: PASSWORD })
    expect(result).toBeNull()
  })

  it('usuario eliminado (baja lógica) → null, igual que antes de la reforma del login', async () => {
    const result = await autorizarCredenciales({ email: EMAIL_ELIMINADO, password: PASSWORD })
    expect(result).toBeNull()
  })

  it('faltan credenciales → null', async () => {
    expect(await autorizarCredenciales({ email: EMAIL_OK })).toBeNull()
    expect(await autorizarCredenciales({ password: PASSWORD })).toBeNull()
    expect(await autorizarCredenciales(undefined)).toBeNull()
  })

  it('contraseña legada en texto plano: autentica y migra a hash en el mismo login', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    const result = await autorizarCredenciales({ email: EMAIL_LEGACY, password: PASSWORD })
    expect(result).not.toBeNull()
    expect(result?.email).toBe(EMAIL_LEGACY)

    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, EMAIL_LEGACY))
    expect(u.password?.startsWith('$2b$') || u.password?.startsWith('$2a$')).toBe(true)

    // Segundo login con la misma contraseña sigue funcionando ya hasheada
    const result2 = await autorizarCredenciales({ email: EMAIL_LEGACY, password: PASSWORD })
    expect(result2).not.toBeNull()
  })
})
