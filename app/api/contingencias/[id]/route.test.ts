import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

// GERENCIA no tiene por defecto ni contingencias.gestionar ni grupos.gestionar —
// aísla el test del permiso personalizado sin que el rol base ya lo cubra
// (a diferencia de AGENTE/INFRAESTRUCTURA/SUPERVISOR, que siempre tuvieron ambos juntos).
function sesionConPermisoPersonalizado(permiso: string) {
  return { user: { email: 'gerencia-test@netdesk-test.local', rol: 'GERENCIA', id: 'gerencia-test-id', permisos: [permiso] } } as any
}

let tiendaId: string
let contingenciaId: string

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-CONT-FUSION-TEST'))
  if (!t) [t] = await db.insert(schema.tiendas).values({ codigo: 'T-CONT-FUSION-TEST', nombreCc: 'Tienda — fusión permisos contingencia', distrito: 'Test', cluster: 'B' }).returning()
  tiendaId = t.id

  await db.delete(schema.contingencias).where(eq(schema.contingencias.tiendaId, tiendaId))
  const [c] = await db.insert(schema.contingencias).values({
    tiendaId, tipo: 'DATOS_MOVILES', activadoPor: 'Test', justificacion: 'Fusión de permisos — test',
  }).returning()
  contingenciaId = c.id
})

describe('Fusión de permisos — grupos.gestionar reemplaza a contingencias.gestionar', () => {
  it('PATCH /api/contingencias/[id]: con grupos.gestionar (personalizado) → no da 403', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(sesionConPermisoPersonalizado('grupos.gestionar'))
    const { PATCH } = await import('./route')
    const res = await PATCH({} as any, { params: Promise.resolve({ id: contingenciaId }) })
    expect(res.status).not.toBe(403)
  })

  it('PATCH /api/contingencias/[id]: con SOLO contingencias.gestionar (permiso viejo) → 403', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(sesionConPermisoPersonalizado('contingencias.gestionar'))
    const { PATCH } = await import('./route')
    const res = await PATCH({} as any, { params: Promise.resolve({ id: contingenciaId }) })
    expect(res.status).toBe(403)
  })
})
