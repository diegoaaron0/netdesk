import { describe, it, expect, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'

const EMAIL_ACTIVO   = 'publico-activo@netdesk-test.local'
const EMAIL_INACTIVO = 'publico-inactivo@netdesk-test.local'

beforeAll(async () => {
  for (const email of [EMAIL_ACTIVO, EMAIL_INACTIVO]) {
    await db.delete(schema.usuarios).where(eq(schema.usuarios.email, email))
  }
  await db.insert(schema.usuarios).values([
    { nombre: 'Publico Activo',   email: EMAIL_ACTIVO,   rol: 'AGENTE',    activo: true },
    { nombre: 'Publico Inactivo', email: EMAIL_INACTIVO, rol: 'AGENTE',    activo: false },
  ])
})

describe('GET /api/usuarios/publico', () => {
  it('incluye el rol de cada usuario — sin él, el filtro de agentes de la lista de incidentes queda vacío', async () => {
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()

    const u = data.find((x: any) => x.email === EMAIL_ACTIVO)
    expect(u, 'el usuario activo debe aparecer').toBeTruthy()
    expect(u.rol).toBe('AGENTE')
    // Todos traen rol: el filtro del front compara contra este campo.
    expect(data.every((x: any) => typeof x.rol === 'string' && x.rol.length > 0)).toBe(true)
  })

  it('los roles devueltos permiten separar quién registra incidentes de quién no', async () => {
    const { GET } = await import('./route')
    const res = await GET()
    const data = await res.json()

    const OPERATIVOS = ['AGENTE', 'SUPERVISOR', 'INFRAESTRUCTURA']
    const agentes = data.filter((x: any) => OPERATIVOS.includes(x.rol))
    expect(agentes.length).toBeGreaterThan(0)
    expect(agentes.every((a: any) => a.nombre && a.id)).toBe(true)
  })

  it('sigue excluyendo usuarios inactivos', async () => {
    const { GET } = await import('./route')
    const res = await GET()
    const data = await res.json()
    expect(data.find((x: any) => x.email === EMAIL_INACTIVO)).toBeUndefined()
  })

  it('no expone la contraseña', async () => {
    const { GET } = await import('./route')
    const res = await GET()
    const data = await res.json()
    expect(data.every((x: any) => !('password' in x))).toBe(true)
  })
})
