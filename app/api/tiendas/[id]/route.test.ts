import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'sup-test-id' } }),
}))

// Mismo patrón de fixture relativo-a-ahora que lib/sla-proveedor.test.ts —
// esta ruta también usa "últimos 30 días desde NOW() real", sin desde/hasta.
const AHORA = new Date()
const BASE = new Date(AHORA.getTime() - 3 * 24 * 3600 * 1000)

function masMin(base: Date, min: number): Date { return new Date(base.getTime() + min * 60000) }
function masHoras(base: Date, horas: number): Date { return new Date(base.getTime() + horas * 3600000) }

const PROVEEDOR_NOMBRE = 'SLA TIENDA PCT TEST'
const FICHA_SLA_RESPUESTA = 90
const FICHA_SLA_RESOLUCION = 120

let tiendaId: string

async function sembrarFixture(): Promise<string> {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  const registradoPorId = ref.registradoPorId

  let [proveedor] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, PROVEEDOR_NOMBRE))
  if (!proveedor) {
    [proveedor] = await db.insert(schema.proveedores).values({ nombre: PROVEEDOR_NOMBRE }).returning()
  }

  let [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-SLA-TIENDA-PCT-01'))
  if (!tienda) {
    [tienda] = await db.insert(schema.tiendas).values({
      codigo: 'T-SLA-TIENDA-PCT-01',
      nombreCc: 'Tienda aislada — % SLA tienda',
      distrito: 'Test',
      cluster: 'B',
      proveedorId: proveedor.id,
      ventaHoraSoles: '100',
      ventaHoraFdsSoles: '150',
    }).returning()
  }

  let [ficha] = await db.select().from(schema.fichas).where(eq(schema.fichas.codigo, 'FC-SLA-TIENDA-PCT-01'))
  if (!ficha) {
    [ficha] = await db.insert(schema.fichas).values({
      codigo: 'FC-SLA-TIENDA-PCT-01',
      tiendaId: tienda.id,
      proveedorId: proveedor.id,
      estado: 'ACTIVA',
      activadoEn: new Date(),
      tiempoRespuestaSla: FICHA_SLA_RESPUESTA,
      tiempoResolucionSla: FICHA_SLA_RESOLUCION,
    }).returning()
    await db.update(schema.tiendas).set({ fichaActivaId: ficha.id }).where(eq(schema.tiendas.id, tienda.id))
  }

  // Mismo dataset A/B/C/D que la consolidación de "SLA del proveedor":
  // respuesta 3/4=75% cumple, resolución 2/4=50% cumple (bajo ficha 90/120).
  const specs = [
    { codigo: 'TST-SLAT-A', horaRegistro: BASE,               respMin: 5, respuestaMin: 80,  resolucionMin: 75 },
    { codigo: 'TST-SLAT-B', horaRegistro: masHoras(BASE, 4),  respMin: 5, respuestaMin: 15,  resolucionMin: 30 },
    { codigo: 'TST-SLAT-C', horaRegistro: masHoras(BASE, 8),  respMin: 5, respuestaMin: 135, resolucionMin: 180 },
    { codigo: 'TST-SLAT-D', horaRegistro: masHoras(BASE, 12), respMin: 5, respuestaMin: 50,  resolucionMin: 150 },
  ]

  for (const s of specs) {
    await db.delete(schema.escalamientos).where(
      eq(schema.escalamientos.incidenteId,
        (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, s.codigo)))[0]?.id ?? '00000000-0000-0000-0000-000000000000',
      ),
    )
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, s.codigo))

    const horaEnvio = masMin(s.horaRegistro, s.respMin)
    const horaRespuesta = masMin(horaEnvio, s.respuestaMin)
    const horaFin = masMin(horaRespuesta, s.resolucionMin)
    const mttrMinutos = Math.round((horaFin.getTime() - s.horaRegistro.getTime()) / 60000)

    const [inc] = await db.insert(schema.incidentes).values({
      codigo: s.codigo,
      tiendaId: tienda.id,
      registradoPorId,
      proveedorId: proveedor.id,
      fichaId: ficha.id,
      nivelImpacto: 'ALTO',
      tipo: 'CAIDA_TOTAL',
      estado: 'RESUELTO',
      evaluableProveedor: true,
      horaRegistro: s.horaRegistro,
      horaFin,
      mttrMinutos,
    }).returning()

    await db.insert(schema.escalamientos).values({
      incidenteId: inc.id,
      nivel: 1,
      contactoEscalado: 'Soporte Test',
      emailContacto: 'soporte@sla-tienda-test.pe',
      horaEnvioCorreo: horaEnvio,
      horaRespuesta,
    })
  }

  return tienda.id
}

beforeAll(async () => { tiendaId = await sembrarFixture() })

describe('GET /api/tiendas/[id] — SLA de tienda usa % real de cumplimiento, no score de proximidad', () => {
  it('slaTienda expone slaRespuestaPct/slaResolucionPct (75% / 50%), no scoreRespuestaPromedio/scoreResolucionPromedio', async () => {
    const { GET } = await import('./route')
    const res = await GET({} as any, { params: Promise.resolve({ id: tiendaId }) })
    const data = await res.json()

    expect(data.slaTienda.slaRespuestaPct).toBe(75)
    expect(data.slaTienda.slaResolucionPct).toBe(50)
    expect(data.slaTienda.scoreRespuestaPromedio).toBeUndefined()
    expect(data.slaTienda.scoreResolucionPromedio).toBeUndefined()
  })

  it('los tiempos promedio (no son %, no tenían el bug) se mantienen intactos', async () => {
    const { GET } = await import('./route')
    const res = await GET({} as any, { params: Promise.resolve({ id: tiendaId }) })
    const data = await res.json()

    // tRespuesta: (80+15+135+50)/4 = 70 ; tResolucion: (75+30+180+150)/4 = 108.75 → 109
    expect(data.slaTienda.tRespuestaPromedio).toBe(70)
    expect(data.slaTienda.tResolucionPromedio).toBe(109)
    expect(data.slaTienda.totalEvaluables).toBe(4)
  })
})

describe('DELETE /api/tiendas/[id] — camino angosto, acotado por fichas además de incidentes', () => {
  it('bloquea si la tienda tiene alguna ficha (aunque sea BORRADOR y no tenga incidentes)', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { DELETE } = await import('./route')

    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-DELETE-CON-FICHA'))
    if (!t) {
      [t] = await db.insert(schema.tiendas).values({ codigo: 'T-DELETE-CON-FICHA', nombreCc: 'Tienda — delete con ficha', distrito: 'Test', cluster: 'B' }).returning()
    }
    let [proveedor] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, 'DELETE TEST PROV'))
    if (!proveedor) [proveedor] = await db.insert(schema.proveedores).values({ nombre: 'DELETE TEST PROV' }).returning()
    await db.delete(schema.fichas).where(eq(schema.fichas.codigo, 'FC-DELETE-TEST-01'))
    await db.insert(schema.fichas).values({ codigo: 'FC-DELETE-TEST-01', tiendaId: t.id, proveedorId: proveedor.id, estado: 'BORRADOR' })

    const res = await DELETE({} as any, { params: Promise.resolve({ id: t.id }) })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toMatch(/ficha/i)

    const [stillThere] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, t.id))
    expect(stillThere).toBeTruthy() // no se borró
  })

  it('sin ficha ni incidentes → elimina de verdad (el caso angosto: se creó por error)', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { DELETE } = await import('./route')

    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-DELETE-LIMPIA'))
    if (!t) {
      [t] = await db.insert(schema.tiendas).values({ codigo: 'T-DELETE-LIMPIA', nombreCc: 'Tienda — delete limpia (creada por error)', distrito: 'Test', cluster: 'B' }).returning()
    }

    const res = await DELETE({} as any, { params: Promise.resolve({ id: t.id }) })
    expect(res.status).toBe(200)

    const [gone] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, t.id))
    expect(gone).toBeUndefined()
  })
})
