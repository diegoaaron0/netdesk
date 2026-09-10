import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: 'agente-test-id' } }),
}))

// El id de sesión de arriba ('agente-test-id') no es un uuid real — sirve para
// la mayoría de los tests, pero los que disparan un insert en tiendas_historial
// (usuario_id es uuid NOT NULL) necesitan un usuario real de la BD.
async function usarUsuarioRealEnSesion() {
  const { auth } = await import('@/auth')
  vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: registradoPorId } } as any)
}

let registradoPorId: string

async function crearTienda(codigo: string, opts: { tieneContingencia?: boolean } = {}) {
  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, codigo))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo, nombreCc: `Tienda — ${codigo}`, distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
      tieneContingencia: opts.tieneContingencia ?? true,
    }).returning()
  } else if (opts.tieneContingencia !== undefined && t.tieneContingencia !== opts.tieneContingencia) {
    [t] = await db.update(schema.tiendas).set({ tieneContingencia: opts.tieneContingencia }).where(eq(schema.tiendas.id, t.id)).returning()
  }
  return t
}

type TipoIncidenteTest = 'CAIDA_TOTAL' | 'INTERMITENCIA' | 'LENTITUD' | 'OTROS' | 'CORTE_ELECTRICO'

async function crearIncidente(codigo: string, tiendaId: string, tipo: TipoIncidenteTest = 'CAIDA_TOTAL') {
  await db.delete(schema.incidenteMitigacionTramosHistorial).where(
    eq(schema.incidenteMitigacionTramosHistorial.incidenteId,
      (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo)))[0]?.id ?? '00000000-0000-0000-0000-000000000000'),
  )
  await db.delete(schema.incidenteMitigacionTramos).where(
    eq(schema.incidenteMitigacionTramos.incidenteId,
      (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo)))[0]?.id ?? '00000000-0000-0000-0000-000000000000'),
  )
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  const [inc] = await db.insert(schema.incidentes).values({
    codigo, tiendaId, registradoPorId, nivelImpacto: 'ALTO', tipo, estado: 'ABIERTO', horaRegistro: new Date(),
  }).returning()
  return inc
}

async function tramoAbierto(incidenteId: string) {
  const [row] = await db.select().from(schema.incidenteMitigacionTramos)
    .where(and(eq(schema.incidenteMitigacionTramos.incidenteId, incidenteId), isNull(schema.incidenteMitigacionTramos.hasta)))
  return row
}

async function contarTramos(incidenteId: string) {
  const rows = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, incidenteId))
  return rows.length
}

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId
})

describe('POST /api/incidentes/[id]/mitigacion — validaciones', () => {
  it('rechaza si el incidente está RESUELTO', async () => {
    const tienda = await crearTienda('T-MIT-RESUELTO')
    const inc = await crearIncidente('TST-MIT-RESUELTO', tienda.id)
    await db.update(schema.incidentes).set({ estado: 'RESUELTO', horaFin: new Date() }).where(eq(schema.incidentes.id, inc.id))

    const { POST } = await import('./route')
    const req = { json: async () => ({ tipo: 'DATOS_MOVILES', rendimiento: 'PARCIAL' }) } as any
    const res = await POST(req, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).toBe(409)
  })

  it('rechaza si el incidente está CANCELADO', async () => {
    const tienda = await crearTienda('T-MIT-CANCELADO')
    const inc = await crearIncidente('TST-MIT-CANCELADO', tienda.id)
    await db.update(schema.incidentes).set({ estado: 'CANCELADO', horaFin: new Date() }).where(eq(schema.incidentes.id, inc.id))

    const { POST } = await import('./route')
    const req = { json: async () => ({ tipo: 'DATOS_MOVILES', rendimiento: 'PARCIAL' }) } as any
    const res = await POST(req, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).toBe(409)
  })

  it.each(['ROUTER_PROPIO', 'ROUTER_EXTERNO', 'DATOS_MOVILES'])(
    'corte eléctrico bloquea %s',
    async (tipo) => {
      const tienda = await crearTienda('T-MIT-CORTE')
      const inc = await crearIncidente(`TST-MIT-CORTE-${tipo}`, tienda.id, 'CORTE_ELECTRICO')

      const { POST } = await import('./route')
      const req = { json: async () => ({ tipo, rendimiento: 'PARCIAL' }) } as any
      const res = await POST(req, { params: Promise.resolve({ id: inc.id }) })
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error).toBeTruthy()
    },
  )

  it('corte eléctrico SÍ permite BOLETA_MANUAL', async () => {
    const tienda = await crearTienda('T-MIT-CORTE-OK')
    const inc = await crearIncidente('TST-MIT-CORTE-OK', tienda.id, 'CORTE_ELECTRICO')

    const { POST } = await import('./route')
    const req = { json: async () => ({ tipo: 'BOLETA_MANUAL', rendimiento: 'EFECTIVO' }) } as any
    const res = await POST(req, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(409)
  })

  it('router propio sin tienda.tiene_contingencia falla (nueva activación)', async () => {
    const tienda = await crearTienda('T-MIT-SIN-CONT', { tieneContingencia: false })
    const inc = await crearIncidente('TST-MIT-SIN-CONT', tienda.id)

    const { POST } = await import('./route')
    const req = { json: async () => ({ tipo: 'ROUTER_PROPIO', rendimiento: 'EFECTIVO' }) } as any
    const res = await POST(req, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).toBe(409)
  })

  it('router externo SIN routerExternoId se rechaza (400) — antes se guardaba en silencio sin router asignado', async () => {
    const tienda = await crearTienda('T-MIT-EXT-SIN-ID')
    const inc = await crearIncidente('TST-MIT-EXT-SIN-ID', tienda.id)

    const { POST } = await import('./route')
    const req = { json: async () => ({ tipo: 'ROUTER_EXTERNO', rendimiento: 'EFECTIVO' }) } as any
    const res = await POST(req, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/router/i)

    expect(await contarTramos(inc.id)).toBe(0) // no se creó nada
  })

  it('router externo ya EN_TIENDA_ACTIVO en otra tienda falla', async () => {
    const tiendaA = await crearTienda('T-MIT-EXT-A')
    const tiendaB = await crearTienda('T-MIT-EXT-B')
    const incA = await crearIncidente('TST-MIT-EXT-A', tiendaA.id)

    await db.delete(schema.routersExternos).where(eq(schema.routersExternos.codigo, 'RT-MIT-TEST-01'))
    const [router] = await db.insert(schema.routersExternos).values({
      codigo: 'RT-MIT-TEST-01', estado: 'EN_TIENDA_ACTIVO', tiendaActualId: tiendaB.id,
    }).returning()

    const { POST } = await import('./route')
    const req = { json: async () => ({ tipo: 'ROUTER_EXTERNO', rendimiento: 'EFECTIVO', routerExternoId: router.id }) } as any
    const res = await POST(req, { params: Promise.resolve({ id: incA.id }) })
    expect(res.status).toBe(409)
  })
})

describe('POST /api/incidentes/[id]/mitigacion — caso feliz', () => {
  it('activar por primera vez: abre un tramo nuevo con hasta=null', async () => {
    const tienda = await crearTienda('T-MIT-FELIZ-01')
    const inc = await crearIncidente('TST-MIT-FELIZ-01', tienda.id)

    const { POST } = await import('./route')
    const req = { json: async () => ({ tipo: 'DATOS_MOVILES', rendimiento: 'PARCIAL', activadoPor: 'AGENTE' }) } as any
    const res = await POST(req, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(409)
    expect(res.status).not.toBe(403)

    const abierto = await tramoAbierto(inc.id)
    expect(abierto).toBeTruthy()
    expect(abierto.tipo).toBe('DATOS_MOVILES')
    expect(Number(abierto.factor)).toBe(0.50)
    expect(abierto.hasta).toBeNull()
    expect(abierto.ieTramo).toBeNull()
  })

  it('cambiar de mitigación: sella el tramo viejo con ie_tramo correcto y abre uno nuevo', async () => {
    const tienda = await crearTienda('T-MIT-FELIZ-02')
    const inc = await crearIncidente('TST-MIT-FELIZ-02', tienda.id)
    const desdeViejo = new Date(Date.now() - 2 * 3600000) // hace 2 horas

    const [tramoViejo] = await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'ROUTER_PROPIO', factor: '0.0000', desde: desdeViejo,
    }).returning()

    await usarUsuarioRealEnSesion()
    const { POST } = await import('./route')
    const req = { json: async () => ({ tipo: 'DATOS_MOVILES', rendimiento: 'NULO' }) } as any
    const res = await POST(req, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(409)

    const [sellado] = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.id, tramoViejo.id))
    expect(sellado.hasta).not.toBeNull()
    expect(sellado.ieTramo).not.toBeNull()
    // router propio EFECTIVO (factor 0) por 2 horas → IEI = 0
    expect(Number(sellado.ieTramo)).toBe(0)

    const nuevo = await tramoAbierto(inc.id)
    expect(nuevo.tipo).toBe('DATOS_MOVILES')
    expect(Number(nuevo.factor)).toBe(1.00)

    expect(await contarTramos(inc.id)).toBe(2)
  })

  it('guardado redundante (mismo tipo+factor+routerExternoId) es no-op: no crea un tramo nuevo', async () => {
    const tienda = await crearTienda('T-MIT-NOOP')
    const inc = await crearIncidente('TST-MIT-NOOP', tienda.id)

    const { POST } = await import('./route')
    const req1 = { json: async () => ({ tipo: 'DATOS_MOVILES', rendimiento: 'PARCIAL' }) } as any
    await POST(req1, { params: Promise.resolve({ id: inc.id }) })
    expect(await contarTramos(inc.id)).toBe(1)

    const req2 = { json: async () => ({ tipo: 'DATOS_MOVILES', rendimiento: 'PARCIAL' }) } as any
    const res2 = await POST(req2, { params: Promise.resolve({ id: inc.id }) })
    expect(res2.status).not.toBe(409)
    expect(await contarTramos(inc.id)).toBe(1) // sigue siendo 1 — no se creó un tramo de duración cero
  })
})

describe('POST /api/incidentes/[id]/mitigacion — efectos secundarios (router externo, tiendas.contingencia_activa)', () => {
  it('activar ROUTER_EXTERNO pone el router en EN_TIENDA_ACTIVO y activa contingencia_activa de la tienda', async () => {
    const tienda = await crearTienda('T-MIT-EFECTO-01')
    const inc = await crearIncidente('TST-MIT-EFECTO-01', tienda.id)
    await db.update(schema.tiendas).set({ contingenciaActiva: false }).where(eq(schema.tiendas.id, tienda.id))

    await db.delete(schema.routersExternos).where(eq(schema.routersExternos.codigo, 'RT-MIT-EFECTO-01'))
    const [router] = await db.insert(schema.routersExternos).values({ codigo: 'RT-MIT-EFECTO-01', estado: 'DISPONIBLE' }).returning()

    await usarUsuarioRealEnSesion()
    const { POST } = await import('./route')
    const req = { json: async () => ({ tipo: 'ROUTER_EXTERNO', rendimiento: 'EFECTIVO', routerExternoId: router.id }) } as any
    const res = await POST(req, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(409)

    const [routerAfter] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.id, router.id))
    expect(routerAfter.estado).toBe('EN_TIENDA_ACTIVO')
    expect(routerAfter.tiendaActualId).toBe(tienda.id)

    const [tiendaAfter] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tienda.id))
    expect(tiendaAfter.contingenciaActiva).toBe(true)
  })

  it('cambiar de ROUTER_EXTERNO a DATOS_MOVILES pone el router en EN_TIENDA_INACTIVO y desactiva contingencia_activa (si no queda otro router abierto)', async () => {
    const tienda = await crearTienda('T-MIT-EFECTO-02')
    const inc = await crearIncidente('TST-MIT-EFECTO-02', tienda.id)

    await db.delete(schema.routersExternos).where(eq(schema.routersExternos.codigo, 'RT-MIT-EFECTO-02'))
    const [router] = await db.insert(schema.routersExternos).values({
      codigo: 'RT-MIT-EFECTO-02', estado: 'EN_TIENDA_ACTIVO', tiendaActualId: tienda.id,
    }).returning()
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'ROUTER_EXTERNO', factor: '0.0000', desde: new Date(Date.now() - 3600000), routerExternoId: router.id,
    })
    await db.update(schema.tiendas).set({ contingenciaActiva: true, contingenciaActivadaPor: 'AGENTE' }).where(eq(schema.tiendas.id, tienda.id))

    await usarUsuarioRealEnSesion()
    const { POST } = await import('./route')
    const req = { json: async () => ({ tipo: 'DATOS_MOVILES', rendimiento: 'PARCIAL' }) } as any
    const res = await POST(req, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(409)

    const [routerAfter] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.id, router.id))
    expect(routerAfter.estado).toBe('EN_TIENDA_INACTIVO')

    const [tiendaAfter] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tienda.id))
    expect(tiendaAfter.contingenciaActiva).toBe(false)
  })
})
