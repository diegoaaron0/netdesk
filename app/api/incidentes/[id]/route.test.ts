import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE' } }),
}))

describe('GET /api/incidentes/[id] — fallback de proveedor (Paso 1)', () => {
  it('cuando incidentes.proveedorId es NULL, cae al proveedor actual de la tienda (COALESCE)', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { GET } = await import('./route')

    const [inc] = await db.select({ id: schema.incidentes.id, proveedorId: schema.incidentes.proveedorId })
      .from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    expect(inc, 'fixture TST-P1-001 debe existir — corre tests/fixtures/seed-test-data.ts').toBeTruthy()
    expect(inc.proveedorId).toBeNull() // precondición del fixture

    const res = await GET({} as any, { params: Promise.resolve({ id: inc.id }) })
    const data = await res.json()

    expect(data.proveedorNombre).toBe('BITEL TEST')
    expect(data.proveedorId).toBeTruthy() // ya no debe quedar vacío
  })

  it('cuando incidentes.proveedorId SÍ está seteado, se usa ese (histórico), no el de la tienda', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { GET } = await import('./route')

    const [inc] = await db.select({ id: schema.incidentes.id })
      .from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P2-001'))
    expect(inc).toBeTruthy()

    const res = await GET({} as any, { params: Promise.resolve({ id: inc.id }) })
    const data = await res.json()

    expect(data.proveedorNombre).toBe('BITEL TEST')
  })
})

describe('PUT /api/incidentes/[id] — edición de incidente cerrado (Paso 1, cierre de módulo)', () => {
  it('INFRAESTRUCTURA puede editar un incidente cerrado (mismo acceso que Supervisor)', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'infra-test@netdesk-test.local', rol: 'INFRAESTRUCTURA', id: 'infra-id' } } as any)

    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { PUT } = await import('./route')

    const [inc] = await db.select({ id: schema.incidentes.id, estado: schema.incidentes.estado })
      .from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    expect(inc.estado, 'el fixture debe estar cerrado para esta prueba').toBe('RESUELTO')

    const req = { json: async () => ({ observaciones: 'editado por infraestructura' }) } as any
    const res = await PUT(req, { params: Promise.resolve({ id: inc.id }) })

    expect(res.status).not.toBe(403)
    const data = await res.json()
    expect(data.observaciones).toBe('editado por infraestructura')
  })

  it('un rol sin permiso (AGENTE) sigue sin poder editar un incidente cerrado', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: 'agente-id' } } as any)

    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { PUT } = await import('./route')

    const [inc] = await db.select({ id: schema.incidentes.id })
      .from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))

    const req = { json: async () => ({ observaciones: 'no debería guardar' }) } as any
    const res = await PUT(req, { params: Promise.resolve({ id: inc.id }) })

    expect(res.status).toBe(403)
  })
})

describe('GET /api/incidentes/[id] — panel SLA usa % de cumplimiento (cumple/no cumple), no score de proximidad', () => {
  let incResueltoId: string
  let incAbiertoId: string

  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    const registradoPorId = ref.registradoPorId

    let [proveedor] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, 'SLA INC PCT TEST'))
    if (!proveedor) {
      [proveedor] = await db.insert(schema.proveedores).values({ nombre: 'SLA INC PCT TEST' }).returning()
    }

    let [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-SLA-INC-PCT-01'))
    if (!tienda) {
      [tienda] = await db.insert(schema.tiendas).values({
        codigo: 'T-SLA-INC-PCT-01',
        nombreCc: 'Tienda aislada — % SLA incidente',
        distrito: 'Test',
        cluster: 'B',
        proveedorId: proveedor.id,
        ventaHoraSoles: '100',
        ventaHoraFdsSoles: '150',
      }).returning()
    }

    let [ficha] = await db.select().from(schema.fichas).where(eq(schema.fichas.codigo, 'FC-SLA-INC-PCT-01'))
    if (!ficha) {
      [ficha] = await db.insert(schema.fichas).values({
        codigo: 'FC-SLA-INC-PCT-01',
        tiendaId: tienda.id,
        proveedorId: proveedor.id,
        estado: 'ACTIVA',
        activadoEn: new Date(),
        tiempoRespuestaSla: 90,   // ficha: 90min respuesta / 120min resolución
        tiempoResolucionSla: 120,
      }).returning()
      await db.update(schema.tiendas).set({ fichaActivaId: ficha.id }).where(eq(schema.tiendas.id, tienda.id))
    }

    const BASE = new Date(Date.now() - 3 * 24 * 3600 * 1000)

    // Incidente RESUELTO: respuesta 50min (cumple ≤90), resolución 150min (NO cumple, >120)
    await db.delete(schema.escalamientos).where(
      eq(schema.escalamientos.incidenteId,
        (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-SLAI-RESUELTO')))[0]?.id ?? '00000000-0000-0000-0000-000000000000'),
    )
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-SLAI-RESUELTO'))
    const horaEnvio1 = new Date(BASE.getTime() + 5 * 60000)
    const horaResp1  = new Date(horaEnvio1.getTime() + 50 * 60000)
    const horaFin1   = new Date(horaResp1.getTime() + 150 * 60000)
    const [incResuelto] = await db.insert(schema.incidentes).values({
      codigo: 'TST-SLAI-RESUELTO', tiendaId: tienda.id, registradoPorId, proveedorId: proveedor.id, fichaId: ficha.id,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro: BASE, horaFin: horaFin1,
      mttrMinutos: Math.round((horaFin1.getTime() - BASE.getTime()) / 60000),
    }).returning()
    await db.insert(schema.escalamientos).values({
      incidenteId: incResuelto.id, nivel: 1, contactoEscalado: 'Soporte Test', emailContacto: 'soporte@sla-inc-test.pe',
      horaEnvioCorreo: horaEnvio1, horaRespuesta: horaResp1,
    })
    incResueltoId = incResuelto.id

    // Incidente ABIERTO (sin horaFin): respuesta 100min (NO cumple, >90), resolución aún en curso
    await db.delete(schema.escalamientos).where(
      eq(schema.escalamientos.incidenteId,
        (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-SLAI-ABIERTO')))[0]?.id ?? '00000000-0000-0000-0000-000000000000'),
    )
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-SLAI-ABIERTO'))
    const horaEnvio2 = new Date(BASE.getTime() + 5 * 60000)
    const horaResp2  = new Date(horaEnvio2.getTime() + 100 * 60000)
    const [incAbierto] = await db.insert(schema.incidentes).values({
      codigo: 'TST-SLAI-ABIERTO', tiendaId: tienda.id, registradoPorId, proveedorId: proveedor.id, fichaId: ficha.id,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'EN_SEGUIMIENTO', evaluableProveedor: true,
      horaRegistro: BASE, horaFin: null,
    }).returning()
    await db.insert(schema.escalamientos).values({
      incidenteId: incAbierto.id, nivel: 1, contactoEscalado: 'Soporte Test', emailContacto: 'soporte@sla-inc-test.pe',
      horaEnvioCorreo: horaEnvio2, horaRespuesta: horaResp2,
    })
    incAbiertoId = incAbierto.id
  })

  it('incidente RESUELTO: expone slaRespuestaPct/slaResolucionPct (100% / 0%), no scoreRespuesta/scoreResolucion', async () => {
    const { GET } = await import('./route')
    const res = await GET({} as any, { params: Promise.resolve({ id: incResueltoId }) })
    const data = await res.json()

    expect(data.slaMetrics.slaRespuestaPct).toBe(100)   // 50min ≤ 90min ficha
    expect(data.slaMetrics.slaResolucionPct).toBe(0)     // 150min > 120min ficha
    expect(data.slaMetrics.scoreRespuesta).toBeUndefined()
    expect(data.slaMetrics.scoreResolucion).toBeUndefined()
  })

  it('incidente ABIERTO (aún sin resolver): slaRespuestaPct ya se puede evaluar (0%, respondió tarde), slaResolucionPct sigue null (no exige RESUELTO)', async () => {
    const { GET } = await import('./route')
    const res = await GET({} as any, { params: Promise.resolve({ id: incAbiertoId }) })
    const data = await res.json()

    expect(data.slaMetrics.slaRespuestaPct).toBe(0)      // 100min > 90min ficha
    expect(data.slaMetrics.slaResolucionPct).toBeNull()  // aún no hay hora_fin — no se fuerza a 0%
  })
})
