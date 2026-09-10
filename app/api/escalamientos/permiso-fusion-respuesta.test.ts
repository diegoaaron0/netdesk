import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}

// GERENCIA no tiene por defecto ni escalamientos.crear ni escalamientos.respuesta —
// sirve para probar el permiso personalizado en aislamiento, sin que el rol base
// ya lo cubra de por sí (a diferencia de AGENTE/INFRAESTRUCTURA/SUPERVISOR, que
// siempre tuvieron ambos permisos juntos).
function sesionConPermisoPersonalizado(permiso: string) {
  return { user: { email: 'gerencia-test@netdesk-test.local', rol: 'GERENCIA', id: 'gerencia-test-id', permisos: [permiso] } } as any
}

let escalamientoId: string
let atcLlamadaId: string

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))

  const previos = await db.select({ id: schema.escalamientos.id }).from(schema.escalamientos)
    .where(eq(schema.escalamientos.contactoEscalado, 'Fusion Test Contacto'))
  for (const p of previos) {
    await db.delete(schema.atcLlamadas).where(eq(schema.atcLlamadas.escalamientoId, p.id))
  }
  await db.delete(schema.escalamientos).where(eq(schema.escalamientos.contactoEscalado, 'Fusion Test Contacto'))
  const [esc] = await db.insert(schema.escalamientos).values({
    incidenteId: ref.id, nivel: 1, contactoEscalado: 'Fusion Test Contacto',
    emailContacto: 'fusion-test@netdesk-test.local', horaEnvioCorreo: new Date(),
  }).returning()
  escalamientoId = esc.id

  const [llamada] = await db.insert(schema.atcLlamadas).values({
    escalamientoId, inicio: new Date(),
  }).returning()
  atcLlamadaId = llamada.id
})

describe('Fusión de permisos — escalamientos.crear reemplaza a escalamientos.respuesta', () => {
  it('PUT /api/escalamientos/[id]/respuesta: con escalamientos.crear (personalizado) → no da 403', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(sesionConPermisoPersonalizado('escalamientos.crear'))
    const { PUT } = await import('./[id]/respuesta/route')
    const res = await PUT(reqCon({}), { params: Promise.resolve({ id: escalamientoId }) })
    expect(res.status).not.toBe(403)
  })

  it('PUT /api/escalamientos/[id]/respuesta: con SOLO escalamientos.respuesta (permiso viejo) → 403', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(sesionConPermisoPersonalizado('escalamientos.respuesta'))
    const { PUT } = await import('./[id]/respuesta/route')
    const res = await PUT(reqCon({}), { params: Promise.resolve({ id: escalamientoId }) })
    expect(res.status).toBe(403)
  })

  it('PUT /api/escalamientos/[id]/sin-respuesta: con escalamientos.crear → no da 403', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(sesionConPermisoPersonalizado('escalamientos.crear'))
    const { PUT } = await import('./[id]/sin-respuesta/route')
    const res = await PUT(reqCon({}), { params: Promise.resolve({ id: escalamientoId }) })
    expect(res.status).not.toBe(403)
  })

  it('PUT /api/escalamientos/[id]/sin-respuesta: con SOLO escalamientos.respuesta → 403', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(sesionConPermisoPersonalizado('escalamientos.respuesta'))
    const { PUT } = await import('./[id]/sin-respuesta/route')
    const res = await PUT(reqCon({}), { params: Promise.resolve({ id: escalamientoId }) })
    expect(res.status).toBe(403)
  })

  it('POST /api/escalamientos/[id]/atc: con escalamientos.crear → no da 403 (201)', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(sesionConPermisoPersonalizado('escalamientos.crear'))
    const { POST } = await import('./[id]/atc/route')
    const res = await POST(reqCon({}), { params: Promise.resolve({ id: escalamientoId }) })
    expect(res.status).toBe(201)
  })

  it('POST /api/escalamientos/[id]/atc: con SOLO escalamientos.respuesta → 403', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(sesionConPermisoPersonalizado('escalamientos.respuesta'))
    const { POST } = await import('./[id]/atc/route')
    const res = await POST(reqCon({}), { params: Promise.resolve({ id: escalamientoId }) })
    expect(res.status).toBe(403)
  })

  it('PUT /api/atc/[id]: con escalamientos.crear → no da 403', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(sesionConPermisoPersonalizado('escalamientos.crear'))
    const { PUT } = await import('../atc/[id]/route')
    const res = await PUT(reqCon({ notas: 'test' }), { params: Promise.resolve({ id: atcLlamadaId }) })
    expect(res.status).not.toBe(403)
  })

  it('DELETE /api/atc/[id]: con escalamientos.crear → no da 403', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(sesionConPermisoPersonalizado('escalamientos.crear'))
    const { DELETE } = await import('../atc/[id]/route')
    const res = await DELETE(reqCon({}), { params: Promise.resolve({ id: atcLlamadaId }) })
    expect(res.status).not.toBe(403)
  })

  it('PUT y DELETE /api/atc/[id]: con SOLO escalamientos.respuesta → 403', async () => {
    const { auth } = await import('@/auth')
    const { PUT, DELETE } = await import('../atc/[id]/route')

    vi.mocked(auth).mockResolvedValueOnce(sesionConPermisoPersonalizado('escalamientos.respuesta'))
    const resPut = await PUT(reqCon({}), { params: Promise.resolve({ id: randomUUID() }) })
    expect(resPut.status).toBe(403)

    vi.mocked(auth).mockResolvedValueOnce(sesionConPermisoPersonalizado('escalamientos.respuesta'))
    const resDelete = await DELETE(reqCon({}), { params: Promise.resolve({ id: randomUUID() }) })
    expect(resDelete.status).toBe(403)
  })
})
