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

describe('Ficha del router — campos nuevos y contraseña fuera del listado', () => {
  const CODIGO = 'RT-FICHA-TEST'

  it('POST crea con marca/modelo/serie/observaciones y NO acepta ip/password/tipoConexion', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { eq } = await import('drizzle-orm')
    await db.delete(schema.routersExternos).where(eq(schema.routersExternos.codigo, CODIGO))

    const { POST } = await import('./route')
    const res = await POST(reqCon({
      codigo: CODIGO,
      marca: 'TP-Link', modelo: 'Archer MR600', serie: 'SN-123',
      chip: '999', plan: '40 GB', observaciones: 'incluye 3 antenas',
      // Estos ya no deberían persistirse desde el alta:
      ip: '192.168.1.1', password: 'secreta', tipoConexion: 'LTE',
    }))
    expect(res.status).toBe(201)

    const [r] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.codigo, CODIGO))
    expect(r.marca).toBe('TP-Link')
    expect(r.modelo).toBe('Archer MR600')
    expect(r.serie).toBe('SN-123')
    expect(r.observaciones).toBe('incluye 3 antenas')
    expect(r.ip, 'ip salió del alta').toBeNull()
    expect(r.password, 'password salió del alta').toBeNull()
    expect(r.tipoConexion, 'tipoConexion salió del alta').toBeNull()
  })

  it('el listado NO devuelve la contraseña de ningún router', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { eq } = await import('drizzle-orm')
    // Un equipo viejo con contraseña cargada.
    await db.update(schema.routersExternos).set({ password: 'clave-vieja', ip: '10.0.0.9' })
      .where(eq(schema.routersExternos.codigo, CODIGO))

    const { GET } = await import('./route')
    const res = await GET()
    const data = await res.json()
    const fila = data.find((x: any) => x.codigo === CODIGO)

    expect(fila, 'el router debe aparecer en el listado').toBeTruthy()
    expect('password' in fila, 'la contraseña no debe viajar en el listado').toBe(false)
    expect(fila.ip, 'la ip sí sigue en el listado').toBe('10.0.0.9')
    expect(fila.marca).toBe('TP-Link')
  })

  it('el detalle individual SÍ devuelve la contraseña, para mostrarla en lectura', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { eq } = await import('drizzle-orm')
    const [r] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.codigo, CODIGO))

    const { GET } = await import('./[id]/route')
    const res = await GET({} as any, { params: Promise.resolve({ id: r.id }) })
    const data = await res.json()
    expect(data.password).toBe('clave-vieja')
  })

  it('el PUT ya no puede editar ip/password/tipoConexion, pero sí los campos nuevos', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { eq } = await import('drizzle-orm')
    const [antes] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.codigo, CODIGO))

    const { PUT } = await import('./[id]/route')
    await PUT(reqCon({ marca: 'Huawei', password: 'hackeada', ip: '1.2.3.4', tipoConexion: 'FIBRA' }),
      { params: Promise.resolve({ id: antes.id }) })

    const [despues] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.codigo, CODIGO))
    expect(despues.marca, 'el campo vigente sí se edita').toBe('Huawei')
    expect(despues.password, 'la contraseña vieja queda intacta').toBe('clave-vieja')
    expect(despues.ip, 'la ip vieja queda intacta').toBe('10.0.0.9')
    expect(despues.tipoConexion).toBe(antes.tipoConexion)
  })
})
