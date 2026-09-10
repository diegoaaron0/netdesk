import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq, and, isNull } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: null } }),
}))

/**
 * Corte final, Paso 2 — los gates de resolver/ y cancelar/ deciden contra
 * `incidente_mitigacion_tramos`, no contra cont_activado_por. Los incidentes
 * sin ningún tramo (los históricos que no migraron) siguen usando el gate viejo.
 * Los campos viejos se siguen escribiendo: acá sólo cambió la decisión.
 */
describe('resolver / cancelar — gates de cierre contra tramos', () => {
  let tiendaId: string
  let registradoPorId: string
  let routerId: string

  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    registradoPorId = ref.registradoPorId

    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-CIERRE-GATES'))
    if (!t) {
      [t] = await db.insert(schema.tiendas).values({
        codigo: 'T-CIERRE-GATES', nombreCc: 'Cierre gates', distrito: 'Test', cluster: 'B',
        ventaHoraSoles: '100', ventaHoraFdsSoles: '150', tieneContingencia: true,
      }).returning()
    } else {
      await db.update(schema.tiendas)
        .set({ estado: 'ACTIVA', tieneContingencia: true, ventaHoraSoles: '100' } as any)
        .where(eq(schema.tiendas.id, t.id))
    }
    tiendaId = t.id

    let [r] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.codigo, 'RT-CIERRE-GATES'))
    if (!r) {
      [r] = await db.insert(schema.routersExternos).values({ codigo: 'RT-CIERRE-GATES', estado: 'DISPONIBLE' }).returning()
    }
    routerId = r.id
  })

  /** Incidente ABIERTO limpio, sin tramos ni campos viejos. */
  async function nuevoIncidente(codigo: string, extra: Record<string, any> = {}) {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    await db.delete(schema.incidenteMitigacionTramos).where(
      eq(schema.incidenteMitigacionTramos.incidenteId,
        (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo)))[0]?.id ?? '00000000-0000-0000-0000-000000000000'))
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
    const [inc] = await db.insert(schema.incidentes).values({
      codigo, tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO',
      horaRegistro: new Date(Date.now() - 2 * 3600000),
      ...extra,
    }).returning()
    return inc.id
  }

  async function activarPorTramos(incId: string, tipo: string, routerExternoId?: string) {
    const { POST } = await import('./mitigacion/route')
    const res = await POST(
      { json: async () => ({ tipo, rendimiento: 'PARCIAL', activadoPor: 'AGENTE', routerExternoId }) } as any,
      { params: Promise.resolve({ id: incId }) },
    )
    expect(res.status, 'la activación por tramos debe funcionar').toBe(200)
  }

  async function estado(incId: string) {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const tramos = await db.select().from(schema.incidenteMitigacionTramos)
      .where(eq(schema.incidenteMitigacionTramos.incidenteId, incId))
    const [abierto] = await db.select().from(schema.incidenteMitigacionTramos)
      .where(and(eq(schema.incidenteMitigacionTramos.incidenteId, incId), isNull(schema.incidenteMitigacionTramos.hasta)))
    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tiendaId))
    const [router] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.id, routerId))
    const [inc] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.id, incId))
    return { tramos, abierto: abierto ?? null, tienda, router, inc }
  }

  it('con tramo abierto: resolver cierra el tramo, limpia la tienda y baja el router', async () => {
    const incId = await nuevoIncidente('TST-GATE-RESOLVER')
    await activarPorTramos(incId, 'ROUTER_EXTERNO', routerId)

    const antes = await estado(incId)
    expect(antes.abierto!.tipo).toBe('ROUTER_EXTERNO')
    expect(antes.tienda.contingenciaActiva, 'la activación prende el flag').toBe(true)
    expect(antes.router.estado).toBe('EN_TIENDA_ACTIVO')

    const { POST } = await import('./resolver/route')
    const res = await POST({ json: async () => ({ resueltoPor: 'AGENTE' }) } as any, { params: Promise.resolve({ id: incId }) })
    expect(res.status).toBe(200)

    const d = await estado(incId)
    expect(d.abierto, 'no debe quedar ningún tramo abierto').toBeNull()
    expect(d.tramos.find(t => t.tipo === 'ROUTER_EXTERNO')!.hasta).not.toBeNull()
    expect(d.tienda.contingenciaActiva, 'la tienda queda sin contingencia').toBe(false)
    expect(d.router.estado, 'el router baja a inactivo').toBe('EN_TIENDA_INACTIVO')
  })

  it('con tramo abierto: cancelar hace lo mismo', async () => {
    const incId = await nuevoIncidente('TST-GATE-CANCELAR')
    await activarPorTramos(incId, 'ROUTER_EXTERNO', routerId)
    expect((await estado(incId)).tienda.contingenciaActiva).toBe(true)

    const { POST } = await import('./cancelar/route')
    const res = await POST({} as any, { params: Promise.resolve({ id: incId }) })
    expect(res.status).toBe(200)

    const d = await estado(incId)
    expect(d.abierto).toBeNull()
    expect(d.tienda.contingenciaActiva).toBe(false)
    expect(d.router.estado).toBe('EN_TIENDA_INACTIVO')
  })

  it('sin tramos (histórico): resolver usa el gate viejo y limpia igual', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    // Incidente del flujo viejo: campos cont_* poblados, cero tramos.
    const incId = await nuevoIncidente('TST-GATE-VIEJO-RESOLVER', {
      contActivadoPor: 'AGENTE', contHoraActivacion: new Date(Date.now() - 3600000),
      contRendimiento: 'PARCIAL', contEsExterno: false,
    })
    await db.update(schema.tiendas).set({ contingenciaActiva: true } as any).where(eq(schema.tiendas.id, tiendaId))
    expect((await estado(incId)).tramos, 'el escenario exige cero tramos').toHaveLength(0)

    const { POST } = await import('./resolver/route')
    expect((await POST({ json: async () => ({}) } as any, { params: Promise.resolve({ id: incId }) })).status).toBe(200)

    const d = await estado(incId)
    expect(d.tienda.contingenciaActiva, 'el gate viejo sigue limpiando la tienda').toBe(false)
    expect(d.inc.contHoraDesactivacion, 'y el campo viejo se sigue sellando').not.toBeNull()
    expect(d.tramos, 'no inventa tramos donde no había').toHaveLength(0)
  })

  it('sin tramos (histórico): cancelar tampoco se rompe', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const incId = await nuevoIncidente('TST-GATE-VIEJO-CANCELAR', {
      contActivadoPor: 'AGENTE', contHoraActivacion: new Date(Date.now() - 3600000), contRendimiento: 'PARCIAL',
    })
    await db.update(schema.tiendas).set({ contingenciaActiva: true } as any).where(eq(schema.tiendas.id, tiendaId))

    const { POST } = await import('./cancelar/route')
    expect((await POST({} as any, { params: Promise.resolve({ id: incId }) })).status).toBe(200)

    const d = await estado(incId)
    expect(d.tienda.contingenciaActiva).toBe(false)
    expect(d.inc.contHoraDesactivacion).not.toBeNull()
  })

  it('tramo ya cerrado antes de resolver: no cierra nada de nuevo, pero sí limpia', async () => {
    const incId = await nuevoIncidente('TST-GATE-YA-CERRADO')
    await activarPorTramos(incId, 'ROUTER_EXTERNO', routerId)
    // El agente desactiva la mitigación ANTES de resolver: queda un tramo
    // ROUTER_EXTERNO cerrado y un SIN_MITIGACION abierto.
    await activarPorTramos(incId, 'SIN_MITIGACION')

    const antes = await estado(incId)
    const routerTramoAntes = antes.tramos.find(t => t.tipo === 'ROUTER_EXTERNO')!
    expect(routerTramoAntes.hasta, 'el tramo de router ya está cerrado').not.toBeNull()
    expect(antes.abierto!.tipo).toBe('SIN_MITIGACION')

    const { POST } = await import('./resolver/route')
    expect((await POST({ json: async () => ({}) } as any, { params: Promise.resolve({ id: incId }) })).status).toBe(200)

    const d = await estado(incId)
    const routerTramoDespues = d.tramos.find(t => t.tipo === 'ROUTER_EXTERNO')!
    expect(routerTramoDespues.hasta, 'el tramo ya cerrado no se vuelve a tocar')
      .toEqual(routerTramoAntes.hasta)
    expect(d.abierto, 'el SIN_MITIGACION abierto sí se sella').toBeNull()
    expect(d.tienda.contingenciaActiva, 'y la tienda queda limpia igual').toBe(false)
  })

  it('no limpia la tienda si otro incidente sigue con router activo', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    const incA = await nuevoIncidente('TST-GATE-CONVIVE-A')
    await activarPorTramos(incA, 'ROUTER_PROPIO')
    const incB = await nuevoIncidente('TST-GATE-CONVIVE-B')
    await activarPorTramos(incB, 'ROUTER_PROPIO')

    const { POST } = await import('./resolver/route')
    expect((await POST({ json: async () => ({}) } as any, { params: Promise.resolve({ id: incA }) })).status).toBe(200)

    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tiendaId))
    expect(tienda.contingenciaActiva, 'B sigue con router abierto: la tienda no se limpia').toBe(true)

    // Al cerrar el segundo, ahora sí.
    expect((await POST({ json: async () => ({}) } as any, { params: Promise.resolve({ id: incB }) })).status).toBe(200)
    const [tienda2] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tiendaId))
    expect(tienda2.contingenciaActiva).toBe(false)
  })

  it('datos móviles no toca el flag de tienda, pero su tramo se sella igual', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    await db.update(schema.tiendas).set({ contingenciaActiva: false } as any).where(eq(schema.tiendas.id, tiendaId))

    const incId = await nuevoIncidente('TST-GATE-MOVILES')
    await activarPorTramos(incId, 'DATOS_MOVILES')
    expect((await estado(incId)).tienda.contingenciaActiva, 'datos móviles no prende el flag').toBe(false)

    const { POST } = await import('./resolver/route')
    expect((await POST({ json: async () => ({}) } as any, { params: Promise.resolve({ id: incId }) })).status).toBe(200)

    const d = await estado(incId)
    expect(d.abierto).toBeNull()
    expect(d.tramos.find(t => t.tipo === 'DATOS_MOVILES')!.hasta).not.toBeNull()
  })
})
