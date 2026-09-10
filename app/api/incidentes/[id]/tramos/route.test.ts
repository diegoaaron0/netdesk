import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: 'agente-test-id' } }),
}))

let registradoPorId: string
let tiendaId: string

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-TRAMOS-LISTADO'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-TRAMOS-LISTADO', nombreCc: 'Tienda — listado de tramos', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()
  }
  tiendaId = t.id
})

async function crearIncidente(codigo: string) {
  const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  if (prev) {
    await db.delete(schema.incidenteMitigacionTramosHistorial).where(eq(schema.incidenteMitigacionTramosHistorial.incidenteId, prev.id))
    await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
  }
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  const [inc] = await db.insert(schema.incidentes).values({
    codigo, tiendaId, registradoPorId, nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: new Date(Date.now() - 3600000),
  }).returning()
  return inc
}

describe('GET /api/incidentes/[id]/tramos — listado de solo lectura, ordenado por desde', () => {
  it('devuelve los tramos del incidente ordenados por desde ascendente', async () => {
    const inc = await crearIncidente('TST-TRAMOS-GET')
    const h = 3600000
    await db.insert(schema.incidenteMitigacionTramos).values([
      { incidenteId: inc.id, tipo: 'DATOS_MOVILES', factor: '0.5000', desde: new Date(Date.now() - 2 * h), hasta: new Date(Date.now() - h), ieTramo: '50.00' },
      { incidenteId: inc.id, tipo: 'ROUTER_PROPIO', factor: '0.0000', desde: new Date(Date.now() - 3 * h), hasta: new Date(Date.now() - 2 * h), ieTramo: '0.00' },
      { incidenteId: inc.id, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: new Date(Date.now() - h), hasta: null },
    ])

    const { GET } = await import('./route')
    const res = await GET({} as any, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(403)
    const data = await res.json()

    expect(data).toHaveLength(3)
    expect(data.map((t: any) => t.tipo)).toEqual(['ROUTER_PROPIO', 'DATOS_MOVILES', 'SIN_MITIGACION'])
    expect(data[2].hasta).toBeNull()
  })

  it('incidente sin tramos → array vacío, no error', async () => {
    const inc = await crearIncidente('TST-TRAMOS-GET-VACIO')
    const { GET } = await import('./route')
    const res = await GET({} as any, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual([])
  })

  it('sin sesión → 401', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as any)
    const { GET } = await import('./route')
    const res = await GET({} as any, { params: Promise.resolve({ id: 'cualquier-id' }) })
    expect(res.status).toBe(401)
  })
})

describe('Integración: cambiar de mitigación (POST .../mitigacion) crea un tramo visible en GET .../tramos', () => {
  it('activar DATOS_MOVILES aparece de inmediato en el listado de tramos', async () => {
    const inc = await crearIncidente('TST-TRAMOS-INTEGRACION')

    const { POST } = await import('../mitigacion/route')
    const resPost = await POST(
      { json: async () => ({ tipo: 'DATOS_MOVILES', rendimiento: 'PARCIAL', activadoPor: 'AGENTE' }) } as any,
      { params: Promise.resolve({ id: inc.id }) },
    )
    expect(resPost.status).not.toBe(403)
    expect(resPost.status).not.toBe(409)

    const { GET } = await import('./route')
    const resGet = await GET({} as any, { params: Promise.resolve({ id: inc.id }) })
    const tramos = await resGet.json()

    expect(tramos).toHaveLength(1)
    expect(tramos[0].tipo).toBe('DATOS_MOVILES')
    expect(tramos[0].hasta).toBeNull()
    expect(Number(tramos[0].factor)).toBe(0.5)
  })
})
