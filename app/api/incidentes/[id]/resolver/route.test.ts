import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import { diaSemanaLima } from '@/lib/impacto-calc'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: 'agente-test-id' } }),
}))

let registradoPorId: string
let tiendaId: string

async function crearIncidente(codigo: string, tipo: 'CAIDA_TOTAL' | 'INTERMITENCIA' = 'CAIDA_TOTAL') {
  const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  if (prev) {
    await db.delete(schema.incidenteMitigacionTramosHistorial).where(eq(schema.incidenteMitigacionTramosHistorial.incidenteId, prev.id))
    await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
  }
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  const [inc] = await db.insert(schema.incidentes).values({
    codigo, tiendaId, registradoPorId, nivelImpacto: 'ALTO', tipo, estado: 'ABIERTO',
    horaRegistro: new Date(Date.now() - 2 * 3600000), // hace 2 horas
  }).returning()
  return inc
}

async function tramosDe(incidenteId: string) {
  return db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, incidenteId))
}

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId

  // resuelto_por_usuario_id es uuid NOT NULL-compatible — el id de sesión debe ser
  // un usuario real de la BD, no el placeholder 'agente-test-id' del mock estático.
  const { auth } = await import('@/auth')
  vi.mocked(auth).mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: registradoPorId } } as any)

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-RESOLVER-TRAMOS'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-RESOLVER-TRAMOS', nombreCc: 'Tienda — resolver tramos', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()
  }
  tiendaId = t.id
})

describe('POST /api/incidentes/[id]/resolver — sella el tramo abierto (Fase 2, Paso 4)', () => {
  it('con un tramo abierto (mitigación activa): lo sella con hasta=horaFin e ie_tramo calculado, sin abrir uno nuevo', async () => {
    const inc = await crearIncidente('TST-RESOLVER-TRAMO-ACTIVO')
    const desdeTramo = new Date(Date.now() - 3600000) // hace 1 hora
    const [tramo] = await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'ROUTER_PROPIO', factor: '0.0000', desde: desdeTramo,
    }).returning()

    const { POST } = await import('./route')
    const antes = Date.now()
    const res = await POST({ json: async () => ({}) } as any, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(403)
    const data = await res.json()
    expect(data.estado).toBe('RESUELTO')

    const [sellado] = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.id, tramo.id))
    expect(sellado.hasta).not.toBeNull()
    expect(new Date(sellado.hasta!).getTime()).toBeGreaterThanOrEqual(antes)
    expect(sellado.ieTramo).not.toBeNull()
    // router propio EFECTIVO (factor 0) durante ~1h → ie_tramo = 0
    expect(Number(sellado.ieTramo)).toBe(0)

    const abierto = await db.select().from(schema.incidenteMitigacionTramos)
      .where(and(eq(schema.incidenteMitigacionTramos.incidenteId, inc.id), isNull(schema.incidenteMitigacionTramos.hasta)))
    expect(abierto.length).toBe(0) // no se abre ningún tramo nuevo
  })

  it('con un tramo SIN_MITIGACION desde el inicio (nunca se activó nada): se sella igual, con ie_tramo correcto según FACTOR_BASE', async () => {
    const inc = await crearIncidente('TST-RESOLVER-SIN-MITIGACION', 'INTERMITENCIA')
    const [tramo] = await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'SIN_MITIGACION', factor: '0.5000', desde: inc.horaRegistro,
    }).returning()

    const { POST } = await import('./route')
    const res = await POST({ json: async () => ({}) } as any, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(403)

    const [sellado] = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.id, tramo.id))
    expect(sellado.hasta).not.toBeNull()
    expect(sellado.ieTramo).not.toBeNull()
    // INTERMITENCIA sin mitigación (factor 0.50) por ~2h — tarifa L-J o V-D según el día real.
    const dow = diaSemanaLima(new Date(inc.horaRegistro))
    const ventaHora = (dow === 0 || dow === 5 || dow === 6) ? 150 : 100
    const horas = (new Date(sellado.hasta!).getTime() - new Date(tramo.desde).getTime()) / 3600000
    expect(Number(sellado.ieTramo)).toBe(Math.round(ventaHora * horas * 0.35 * 0.50))
  })

  it('un incidente SIN ningún tramo (flujo viejo, o nunca se le insertó el tramo inicial) no rompe: simplemente no hay nada que sellar', async () => {
    const inc = await crearIncidente('TST-RESOLVER-SIN-TRAMO')
    expect(await tramosDe(inc.id)).toHaveLength(0)

    const { POST } = await import('./route')
    const res = await POST({ json: async () => ({}) } as any, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(500)
    const data = await res.json()
    expect(data.estado).toBe('RESUELTO')

    expect(await tramosDe(inc.id)).toHaveLength(0) // sigue sin tramos, no se creó nada raro
  })
})
