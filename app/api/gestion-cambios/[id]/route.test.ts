import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

interface Fixture {
  creadorId: string
  otroUsuarioId: string
  borradorDeCreador: string
}

let fx: Fixture

async function sembrarFixture(): Promise<Fixture> {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  const creadorId = ref.registradoPorId

  let [otro] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, 'gc-delete-otro@netdesk-test.local'))
  if (!otro) {
    [otro] = await db.insert(schema.usuarios).values({
      nombre: 'GC Delete Otro', email: 'gc-delete-otro@netdesk-test.local', rol: 'GERENCIA',
    }).returning()
  }

  async function tienda(codigo: string) {
    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, codigo))
    if (!t) [t] = await db.insert(schema.tiendas).values({ codigo, nombreCc: `Tienda — ${codigo}`, distrito: 'Test', cluster: 'B' }).returning()
    return t.id
  }
  const tiendaId = await tienda('T-GC-DELETE-01')

  async function borrador(codigo: string, creadoPorId: string) {
    await db.delete(schema.accionesGestion).where(eq(schema.accionesGestion.codigo, codigo))
    const [a] = await db.insert(schema.accionesGestion).values({
      codigo, tipo: 'RENOVACION_CONTRATO', estado: 'BORRADOR', alcance: 'TIENDA',
      titulo: `Test ${codigo}`, motivo: 'Motivo de prueba', tiendaId, creadoPorId,
    }).returning()
    return a.id
  }

  const borradorDeCreador = await borrador('AC-GCDEL-01', creadorId)

  return { creadorId, otroUsuarioId: otro.id, borradorDeCreador }
}

beforeAll(async () => { fx = await sembrarFixture() })

describe('DELETE /api/gestion-cambios/[id] — permiso fuerte O creador (no más lista de rol hardcodeada)', () => {
  it('INFRAESTRUCTURA (tiene gestion-cambios.crear, NO es el creador) puede borrar el borrador ajeno — era el bug: antes solo SUPERVISOR/GERENCIA/DEMO podían', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { auth } = await import('@/auth')
    const { DELETE } = await import('./route')

    const id = await (async () => {
      await db.delete(schema.accionesGestion).where(eq(schema.accionesGestion.codigo, 'AC-GCDEL-02'))
      const [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-GC-DELETE-01'))
      const [a] = await db.insert(schema.accionesGestion).values({
        codigo: 'AC-GCDEL-02', tipo: 'RENOVACION_CONTRATO', estado: 'BORRADOR', alcance: 'TIENDA',
        titulo: 'Test AC-GCDEL-02', motivo: 'Motivo de prueba', tiendaId: t.id, creadoPorId: fx.otroUsuarioId,
      }).returning()
      return a.id
    })()

    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'infra-test@netdesk-test.local', rol: 'INFRAESTRUCTURA', id: fx.creadorId } } as any)
    const res = await DELETE({} as any, { params: Promise.resolve({ id }) })
    expect(res.status).toBe(200)

    const [gone] = await db.select().from(schema.accionesGestion).where(eq(schema.accionesGestion.id, id))
    expect(gone).toBeUndefined()
  })

  it('el creador SIN gestion-cambios.crear (rol GERENCIA) puede borrar su propio borrador', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { auth } = await import('@/auth')
    const { DELETE } = await import('./route')

    // fx.borradorDeCreador fue creado con creadoPorId = fx.creadorId — el mock de sesión
    // debe tener ese mismo id (el rol GERENCIA aquí solo sirve para probar que, sin el
    // permiso fuerte, ser el creador basta igual).
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'creador-test@netdesk-test.local', rol: 'GERENCIA', id: fx.creadorId } } as any)
    const res = await DELETE({} as any, { params: Promise.resolve({ id: fx.borradorDeCreador }) })
    expect(res.status).toBe(200)

    const [gone] = await db.select().from(schema.accionesGestion).where(eq(schema.accionesGestion.id, fx.borradorDeCreador))
    expect(gone).toBeUndefined()
  })

  it('sin gestion-cambios.crear y sin ser el creador → 403, no borra el borrador ajeno', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { auth } = await import('@/auth')
    const { DELETE } = await import('./route')

    await db.delete(schema.accionesGestion).where(eq(schema.accionesGestion.codigo, 'AC-GCDEL-03'))
    const [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-GC-DELETE-01'))
    const [ajeno] = await db.insert(schema.accionesGestion).values({
      codigo: 'AC-GCDEL-03', tipo: 'RENOVACION_CONTRATO', estado: 'BORRADOR', alcance: 'TIENDA',
      titulo: 'Test AC-GCDEL-03', motivo: 'Motivo de prueba', tiendaId: t.id, creadoPorId: fx.creadorId,
    }).returning()

    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'gc-delete-otro@netdesk-test.local', rol: 'GERENCIA', id: fx.otroUsuarioId } } as any)
    const res = await DELETE({} as any, { params: Promise.resolve({ id: ajeno.id }) })
    expect(res.status).toBe(403)

    const [stillThere] = await db.select().from(schema.accionesGestion).where(eq(schema.accionesGestion.id, ajeno.id))
    expect(stillThere).toBeTruthy()
  })
})
