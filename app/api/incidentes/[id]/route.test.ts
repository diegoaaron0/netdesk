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

describe('GET /api/incidentes/[id] — ieiCalc: datos móviles necesita mov_activado_por, no solo mov_hora_activacion (bug real de producción)', () => {
  it('mov_hora_activacion seteado con mov_activado_por vacío → se calcula como sin mitigación, no como datos móviles activo', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { GET } = await import('./route')

    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    const registradoPorId = ref.registradoPorId
    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, ref.tiendaId!))

    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-MOV-FANTASMA'))
    const horaRegistro = new Date(Date.now() - 3 * 3600000)
    const horaFin = new Date(Date.now() - 1 * 3600000)
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-MOV-FANTASMA', tiendaId: tienda.id, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      horaRegistro, horaFin, mttrMinutos: 120,
      // mov_hora_activacion seteado, mov_activado_por vacío — el bug real encontrado en Railway
      movHoraActivacion: horaRegistro, movHoraDesactivacion: null, movRendimiento: null,
    }).returning()

    const res = await GET({} as any, { params: Promise.resolve({ id: inc.id }) })
    const data = await res.json()

    // CAIDA_TOTAL sin mitigación real → factor 1.00. Si el bug estuviera presente,
    // el factor bajaría a 0.50 (PARCIAL por defecto de datos móviles "activo").
    expect(data.ieiCalc.factorAplicado).toBe(1.00)
    expect(data.ieiCalc.motivoFactor).toBe('sin mitigación')
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

describe('PUT /api/incidentes/[id] — descartes del rediseño (capa física y reinicio)', () => {
  let incidenteId: string

  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))

    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-DESCARTES-NUEVO'))
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-DESCARTES-NUEVO', tiendaId: ref.tiendaId, registradoPorId: ref.registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: new Date(),
    }).returning()
    incidenteId = inc.id
  })

  it('persiste descCableado y descReinicioEquipo', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { PUT } = await import('./route')

    const req = { json: async () => ({ descCableado: true, descReinicioEquipo: false }) } as any
    const res = await PUT(req, { params: Promise.resolve({ id: incidenteId }) })
    expect(res.status).not.toBe(403)

    const [enBd] = await db.select({
      cableado: schema.incidentes.descCableado,
      reinicio: schema.incidentes.descReinicioEquipo,
    }).from(schema.incidentes).where(eq(schema.incidentes.id, incidenteId))
    expect(enBd.cableado).toBe(true)
    expect(enBd.reinicio).toBe(false)
  })

  it('un incidente nuevo arranca con los descartes nuevos en null — nunca respondido, no "falla"', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-DESCARTES-VIRGEN'))
    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-DESCARTES-VIRGEN', tiendaId: ref.tiendaId, registradoPorId: ref.registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: new Date(),
    }).returning()

    expect(inc.descCableado).toBeNull()
    expect(inc.descReinicioEquipo).toBeNull()
  })

  it('no reinterpreta el descDns de un incidente histórico: si no se envía, no se toca', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { PUT } = await import('./route')

    // Incidente "viejo" con el campo descontinuado ya respondido.
    await db.update(schema.incidentes).set({ descDns: true }).where(eq(schema.incidentes.id, incidenteId))

    const req = { json: async () => ({ descCableado: false }) } as any
    await PUT(req, { params: Promise.resolve({ id: incidenteId }) })

    const [enBd] = await db.select({ dns: schema.incidentes.descDns, cableado: schema.incidentes.descCableado })
      .from(schema.incidentes).where(eq(schema.incidentes.id, incidenteId))
    expect(enBd.dns, 'el descarte histórico debe sobrevivir intacto').toBe(true)
    expect(enBd.cableado).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Divergencia tramos ↔ campos viejos: el botón "desactivar contingencia" del
// dashboard operativo entra por PUT con cont/mov_hora_desactivacion (o
// boletaManual:false) y nada más. Sellaba el campo viejo pero dejaba el tramo
// abierto, y como todos los consumidores leen tramos, el IEI seguía acumulando
// con el factor mitigado. Estos tests fijan que el PUT también cierre el tramo.
// ─────────────────────────────────────────────────────────────────────────────
function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}

describe('PUT /api/incidentes/[id] — desactivar mitigación cierra también el tramo', () => {
  let tiendaDivId: string
  let registradoPorDivId: string

  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    registradoPorDivId = ref.registradoPorId

    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-DIVERGENCIA'))
    if (!t) {
      [t] = await db.insert(schema.tiendas).values({
        codigo: 'T-DIVERGENCIA', nombreCc: 'Tienda divergencia tramos', distrito: 'Test', cluster: 'B',
        ventaHoraSoles: '100', ventaHoraFdsSoles: '150', tieneContingencia: true,
      }).returning()
    } else {
      await db.update(schema.tiendas)
        .set({ estado: 'ACTIVA', tieneContingencia: true, ventaHoraSoles: '100' } as any)
        .where(eq(schema.tiendas.id, t.id))
    }
    tiendaDivId = t.id
  })

  async function incidenteConMitigacion(codigo: string, tipoMitigacion: string) {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
    const [inc] = await db.insert(schema.incidentes).values({
      codigo, tiendaId: tiendaDivId, registradoPorId: registradoPorDivId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO',
      horaRegistro: new Date(Date.now() - 3 * 3600000),
    }).returning()

    // Activar por el control nuevo — es lo que hace el detalle del incidente.
    const { POST: postMitigacion } = await import('./mitigacion/route')
    const res = await postMitigacion(
      { json: async () => ({ tipo: tipoMitigacion, rendimiento: 'PARCIAL', activadoPor: 'AGENTE' }) } as any,
      { params: Promise.resolve({ id: inc.id }) },
    )
    expect(res.status, 'la activación de la mitigación debe funcionar').toBe(200)
    return inc.id
  }

  async function tramoAbierto(incId: string) {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { and, isNull } = await import('drizzle-orm')
    const [t] = await db.select().from(schema.incidenteMitigacionTramos)
      .where(and(eq(schema.incidenteMitigacionTramos.incidenteId, incId), isNull(schema.incidenteMitigacionTramos.hasta)))
    return t ?? null
  }

  it('router: desactivar desde el operativo cierra el tramo y abre SIN_MITIGACION', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const incId = await incidenteConMitigacion('TST-DIV-ROUTER', 'ROUTER_PROPIO')
    expect((await tramoAbierto(incId))!.tipo).toBe('ROUTER_PROPIO')

    // Exactamente lo que manda el botón del dashboard operativo.
    const { PUT } = await import('./route')
    const res = await PUT(
      reqCon({ contHoraDesactivacion: new Date().toISOString() }),
      { params: Promise.resolve({ id: incId }) },
    )
    expect(res.status).toBe(200)

    // El campo viejo sigue sellándose (no se sacó la escritura vieja todavía)…
    const [inc] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.id, incId))
    expect(inc.contHoraDesactivacion).not.toBeNull()

    // …y ahora el tramo de router también quedó cerrado.
    const abierto = await tramoAbierto(incId)
    expect(abierto!.tipo, 'el tramo de router no puede seguir abierto').toBe('SIN_MITIGACION')

    const cerrado = await db.select().from(schema.incidenteMitigacionTramos)
      .where(eq(schema.incidenteMitigacionTramos.incidenteId, incId))
    const router = cerrado.find(t => t.tipo === 'ROUTER_PROPIO')!
    expect(router.hasta, 'el tramo cerrado debe tener hora de fin').not.toBeNull()
    // El IEI queda sellado (no null). El monto es ~0 porque en el test la
    // activación y la desactivación ocurren con milisegundos de diferencia:
    // lo que importa es que el tramo dejó de acumular, no cuánto acumuló.
    expect(router.ieTramo, 'y su IEI sellado, no null').not.toBeNull()
  })

  it('datos móviles: idem por movHoraDesactivacion', async () => {
    const incId = await incidenteConMitigacion('TST-DIV-MOVILES', 'DATOS_MOVILES')
    const { PUT } = await import('./route')
    const res = await PUT(
      reqCon({ movHoraDesactivacion: new Date().toISOString() }),
      { params: Promise.resolve({ id: incId }) },
    )
    expect(res.status).toBe(200)
    expect((await tramoAbierto(incId))!.tipo).toBe('SIN_MITIGACION')
  })

  it('boleta manual: idem por boletaManual:false', async () => {
    const incId = await incidenteConMitigacion('TST-DIV-BOLETA', 'BOLETA_MANUAL')
    const { PUT } = await import('./route')
    const res = await PUT(reqCon({ boletaManual: false }), { params: Promise.resolve({ id: incId }) })
    expect(res.status).toBe(200)
    expect((await tramoAbierto(incId))!.tipo).toBe('SIN_MITIGACION')
  })

  it('desactivar el router NO cierra un tramo de datos móviles que sigue corriendo', async () => {
    const incId = await incidenteConMitigacion('TST-DIV-CRUZADO', 'DATOS_MOVILES')
    const { PUT } = await import('./route')
    const res = await PUT(
      reqCon({ contHoraDesactivacion: new Date().toISOString() }),
      { params: Promise.resolve({ id: incId }) },
    )
    expect(res.status).toBe(200)
    expect((await tramoAbierto(incId))!.tipo, 'el tramo de datos móviles debe seguir abierto').toBe('DATOS_MOVILES')
  })

  it('un incidente sin tramos (flujo viejo) no se rompe: sigue sellando el campo viejo', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-DIV-SIN-TRAMOS'))
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-DIV-SIN-TRAMOS', tiendaId: tiendaDivId, registradoPorId: registradoPorDivId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO',
      horaRegistro: new Date(Date.now() - 2 * 3600000),
      contActivadoPor: 'AGENTE', contHoraActivacion: new Date(Date.now() - 3600000), contRendimiento: 'PARCIAL',
    }).returning()

    const { PUT } = await import('./route')
    const res = await PUT(
      reqCon({ contHoraDesactivacion: new Date().toISOString() }),
      { params: Promise.resolve({ id: inc.id }) },
    )
    expect(res.status).toBe(200)
    const [after] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.id, inc.id))
    expect(after.contHoraDesactivacion).not.toBeNull()
    expect(await tramoAbierto(inc.id), 'no debe inventar tramos donde no había').toBeNull()
  })
})
