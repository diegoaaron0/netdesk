import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: 'agente-test-id' } }),
}))

let registradoPorId: string
let tiendaId: string

async function crearIncidente(codigo: string) {
  const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  if (prev) {
    await db.delete(schema.incidenteMitigacionTramosHistorial).where(eq(schema.incidenteMitigacionTramosHistorial.incidenteId, prev.id))
    await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
  }
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  const [inc] = await db.insert(schema.incidentes).values({
    codigo, tiendaId, registradoPorId, nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO',
    horaRegistro: new Date(Date.now() - 3600000),
  }).returning()
  return inc
}

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId

  const { auth } = await import('@/auth')
  vi.mocked(auth).mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: registradoPorId } } as any)

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-CANCELAR-TRAMOS'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-CANCELAR-TRAMOS', nombreCc: 'Tienda — cancelar tramos', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()
  }
  tiendaId = t.id
})

describe('POST /api/incidentes/[id]/cancelar — sella el tramo abierto igual que resolver (Fase 2, Paso 4)', () => {
  it('con un tramo abierto: lo sella con hasta e ie_tramo, sin abrir uno nuevo', async () => {
    const inc = await crearIncidente('TST-CANCELAR-TRAMO-ACTIVO')
    const [tramo] = await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'DATOS_MOVILES', factor: '1.0000', desde: new Date(Date.now() - 1800000),
    }).returning()

    const { POST } = await import('./route')
    const res = await POST({} as any, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(403)
    const data = await res.json()
    expect(data.estado).toBe('CANCELADO')

    const [sellado] = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.id, tramo.id))
    expect(sellado.hasta).not.toBeNull()
    expect(sellado.ieTramo).not.toBeNull()

    const abierto = await db.select().from(schema.incidenteMitigacionTramos)
      .where(and(eq(schema.incidenteMitigacionTramos.incidenteId, inc.id), isNull(schema.incidenteMitigacionTramos.hasta)))
    expect(abierto.length).toBe(0)
  })

  it('sin ningún tramo: no rompe', async () => {
    const inc = await crearIncidente('TST-CANCELAR-SIN-TRAMO')
    const { POST } = await import('./route')
    const res = await POST({} as any, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(500)
    const data = await res.json()
    expect(data.estado).toBe('CANCELADO')
  })
})
