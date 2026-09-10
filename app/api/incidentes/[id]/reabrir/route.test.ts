import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq, and, isNull, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import { sumIeiTramos } from '@/lib/mitigacion-tramos'
import { diaSemanaLima } from '@/lib/impacto-calc'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'sup-test-id' } }),
}))

let registradoPorId: string
let tiendaId: string

async function crearIncidenteResuelto(codigo: string) {
  const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  if (prev) {
    await db.delete(schema.incidenteMitigacionTramosHistorial).where(eq(schema.incidenteMitigacionTramosHistorial.incidenteId, prev.id))
    await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
  }
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  const horaRegistro = new Date(Date.now() - 3 * 3600000)
  const horaFin = new Date(Date.now() - 3600000)
  const [inc] = await db.insert(schema.incidentes).values({
    codigo, tiendaId, registradoPorId, nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
    horaRegistro, horaFin, mttrMinutos: 120,
  }).returning()
  return inc
}

async function tramosOrdenados(incidenteId: string) {
  return db.select().from(schema.incidenteMitigacionTramos)
    .where(eq(schema.incidenteMitigacionTramos.incidenteId, incidenteId))
    .orderBy(asc(schema.incidenteMitigacionTramos.desde))
}

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId

  // Un test de este archivo también llama a resolver/route.ts (reabrir dos veces
  // seguidas), que escribe resuelto_por_usuario_id (uuid) — necesita un usuario real.
  const { auth } = await import('@/auth')
  vi.mocked(auth).mockResolvedValue({ user: { email: 'sup-test@netdesk-test.local', rol: 'SUPERVISOR', id: registradoPorId } } as any)

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-REABRIR-TRAMOS'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-REABRIR-TRAMOS', nombreCc: 'Tienda — reabrir tramos', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()
  }
  tiendaId = t.id
})

describe('POST /api/incidentes/[id]/reabrir — abre un tramo SIN_MITIGACION nuevo (Fase 2, Paso 4)', () => {
  it('abre un tramo nuevo SIN_MITIGACION con el factor de FACTOR_BASE_SIN_MITIGACION del tipo del incidente', async () => {
    const inc = await crearIncidenteResuelto('TST-REABRIR-BASICO')
    // Tramo sellado del ciclo anterior (invariante: resolver ya lo selló)
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'ROUTER_PROPIO', factor: '0.0000',
      desde: inc.horaRegistro, hasta: inc.horaFin, ieTramo: '0.00',
    })

    const { POST } = await import('./route')
    const antes = Date.now()
    const res = await POST({ json: async () => ({ motivo: 'ERROR_AGENTE' }) } as any, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(403)
    const data = await res.json()
    expect(data.estado).toBe('ABIERTO')

    const abierto = await db.select().from(schema.incidenteMitigacionTramos)
      .where(and(eq(schema.incidenteMitigacionTramos.incidenteId, inc.id), isNull(schema.incidenteMitigacionTramos.hasta)))
    expect(abierto).toHaveLength(1)
    expect(abierto[0].tipo).toBe('SIN_MITIGACION')
    expect(Number(abierto[0].factor)).toBe(1.00) // CAIDA_TOTAL
    expect(new Date(abierto[0].desde).getTime()).toBeGreaterThanOrEqual(antes)
  })

  it('sigue reseteando horaRegistro y escribiendo mitigaciones_previas igual que hoy (comportamiento viejo intacto)', async () => {
    const inc = await crearIncidenteResuelto('TST-REABRIR-VIEJO-INTACTO')
    await db.update(schema.incidentes).set({
      contActivadoPor: 'AGENTE', contHoraActivacion: inc.horaRegistro, contHoraDesactivacion: inc.horaFin, contRendimiento: 'EFECTIVO',
    }).where(eq(schema.incidentes.id, inc.id))

    const { POST } = await import('./route')
    const antes = Date.now()
    const res = await POST({ json: async () => ({ motivo: 'ERROR_AGENTE' }) } as any, { params: Promise.resolve({ id: inc.id }) })
    const data = await res.json()

    expect(new Date(data.horaRegistro).getTime()).toBeGreaterThanOrEqual(antes) // sigue reseteándose
    expect(data.mitigacionesPrevias).toBeTruthy() // sigue archivando ahí
    expect(data.mitigacionesPrevias[0].clase).toBe('ROUTER_PROPIO')
  })

  it('con un tramo TODAVÍA abierto (caso defensivo — no debería pasar): lo sella antes de abrir el nuevo', async () => {
    const inc = await crearIncidenteResuelto('TST-REABRIR-TRAMO-COLGADO')
    const [colgado] = await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'DATOS_MOVILES', factor: '0.5000', desde: inc.horaRegistro, // sin hasta — abierto
    }).returning()

    const { POST } = await import('./route')
    const res = await POST({ json: async () => ({ motivo: 'ERROR_AGENTE' }) } as any, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(403)

    const [sellado] = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.id, colgado.id))
    expect(sellado.hasta).not.toBeNull()
    expect(sellado.ieTramo).not.toBeNull()

    const abiertos = await db.select().from(schema.incidenteMitigacionTramos)
      .where(and(eq(schema.incidenteMitigacionTramos.incidenteId, inc.id), isNull(schema.incidenteMitigacionTramos.hasta)))
    expect(abiertos).toHaveLength(1) // el nuevo SIN_MITIGACION, no el colgado
    expect(abiertos[0].tipo).toBe('SIN_MITIGACION')
  })

  it('el hueco entre el cierre y la reapertura NO queda cubierto por ningún tramo', async () => {
    const inc = await crearIncidenteResuelto('TST-REABRIR-HUECO')
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'SIN_MITIGACION', factor: '1.0000',
      desde: inc.horaRegistro, hasta: inc.horaFin, ieTramo: '50.00',
    })

    const { POST } = await import('./route')
    await POST({ json: async () => ({ motivo: 'ERROR_AGENTE' }) } as any, { params: Promise.resolve({ id: inc.id }) })

    const tramos = await tramosOrdenados(inc.id)
    expect(tramos).toHaveLength(2)
    const [selladoViejo, nuevoAbierto] = tramos
    // El nuevo tramo empieza estrictamente después de que el viejo terminó — nada cubre el hueco.
    expect(new Date(nuevoAbierto.desde).getTime()).toBeGreaterThan(new Date(selladoViejo.hasta!).getTime())
    // SUM(ie_tramo) solo cuenta lo sellado (50), el tramo abierto aporta 0 — el hueco nunca sumó nada.
    expect(await sumIeiTramos(inc.id)).toBe(50)
  })

  it('reabrir dos veces seguidas: 3 tramos en total, cada ciclo sellado correctamente', async () => {
    const inc = await crearIncidenteResuelto('TST-REABRIR-DOS-VECES')
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'SIN_MITIGACION', factor: '1.0000',
      desde: inc.horaRegistro, hasta: inc.horaFin, ieTramo: '30.00',
    })

    const { POST: postReabrir } = await import('./route')
    const { POST: postResolver } = await import('../resolver/route')

    // Primera reapertura
    await postReabrir({ json: async () => ({ motivo: 'ERROR_AGENTE' }) } as any, { params: Promise.resolve({ id: inc.id }) })
    let tramos = await tramosOrdenados(inc.id)
    expect(tramos).toHaveLength(2)
    expect(tramos[1].hasta).toBeNull()

    // Se vuelve a resolver (sella el segundo tramo)
    await postResolver({ json: async () => ({}) } as any, { params: Promise.resolve({ id: inc.id }) })
    tramos = await tramosOrdenados(inc.id)
    expect(tramos).toHaveLength(2)
    expect(tramos[1].hasta).not.toBeNull()
    expect(tramos[1].ieTramo).not.toBeNull()

    // Segunda reapertura
    await postReabrir({ json: async () => ({ motivo: 'ERROR_AGENTE' }) } as any, { params: Promise.resolve({ id: inc.id }) })
    tramos = await tramosOrdenados(inc.id)
    expect(tramos).toHaveLength(3)
    expect(tramos[0].hasta).not.toBeNull() // 1er ciclo, sellado desde el inicio
    expect(tramos[1].hasta).not.toBeNull() // 2do ciclo, sellado por el resolver de arriba
    expect(tramos[2].hasta).toBeNull()     // 3er ciclo, recién abierto
    expect(tramos[2].tipo).toBe('SIN_MITIGACION')
  })

  it('mov_hora_activacion fantasma (sin mov_activado_por) NO se cuenta como mitigación al acumular el IEI del ciclo cerrado (bug real de producción)', async () => {
    const inc = await crearIncidenteResuelto('TST-REABRIR-MOV-FANTASMA')
    await db.update(schema.incidentes).set({
      movActivadoPor: null, movHoraActivacion: inc.horaRegistro, movHoraDesactivacion: null, movRendimiento: null,
    }).where(eq(schema.incidentes.id, inc.id))

    const { POST } = await import('./route')
    const res = await POST({ json: async () => ({ motivo: 'ERROR_AGENTE' }) } as any, { params: Promise.resolve({ id: inc.id }) })
    const data = await res.json()

    // CAIDA_TOTAL, 2h de mttr, sin mitigación real → factor 1.00. Si el bug
    // estuviera presente, el mov fantasma bajaría el factor a 0.50.
    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tiendaId))
    const dow = diaSemanaLima(inc.horaRegistro)
    const isFDS = dow === 0 || dow === 5 || dow === 6
    const ventaHora = isFDS
      ? Number(tienda.ventaHoraFdsSoles ?? tienda.ventaHoraSoles ?? 0)
      : Number(tienda.ventaHoraSoles ?? tienda.ventaHoraFdsSoles ?? 0)
    const esperado = Math.round(ventaHora * 2 * 0.35 * 1.00)
    expect(Number(data.ieiAcumulado)).toBe(esperado)
  })

  it('router externo asignado en el último tramo (ya sellado): su estado no se altera al reabrir', async () => {
    const inc = await crearIncidenteResuelto('TST-REABRIR-ROUTER-EXTERNO')
    await db.delete(schema.routersExternos).where(eq(schema.routersExternos.codigo, 'RT-REABRIR-TEST'))
    const [router] = await db.insert(schema.routersExternos).values({
      codigo: 'RT-REABRIR-TEST', estado: 'EN_TIENDA_ACTIVO', tiendaActualId: tiendaId,
    }).returning()
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'ROUTER_EXTERNO', factor: '0.0000',
      desde: inc.horaRegistro, hasta: inc.horaFin, ieTramo: '0.00', routerExternoId: router.id,
    })

    const { POST } = await import('./route')
    const res = await POST({ json: async () => ({ motivo: 'ERROR_AGENTE' }) } as any, { params: Promise.resolve({ id: inc.id }) })
    expect(res.status).not.toBe(403)

    const [routerDespues] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.id, router.id))
    expect(routerDespues.estado).toBe('EN_TIENDA_ACTIVO') // reabrir no lo tocó — sigue como estaba
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Reapertura inconsistente — fixes (a) y (b).
// Reabrir un incidente que NO estaba cerrado dejaba horaFinAnterior en null
// (porque horaFin era null) mientras horaRegistroOriginal pasaba a diferir de
// horaRegistro: la firma REABERTURA_INCONSISTENTE que dejó a 00071M fuera de la
// migración de tramos. Verificado reproducible antes del fix.
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /reabrir — solo se reabre lo que está cerrado (fix a)', () => {
  async function crearConEstado(codigo: string, estado: any, extra: Record<string, any> = {}) {
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
    const [inc] = await db.insert(schema.incidentes).values({
      codigo, tiendaId, registradoPorId, nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL',
      estado, horaRegistro: new Date(Date.now() - 2 * 3600000), ...extra,
    }).returning()
    return inc
  }

  async function reabrir(id: string) {
    const { POST } = await import('./route')
    return POST(
      { json: async () => ({ motivo: 'ERROR_AGENTE', justificacion: 'prueba' }) } as any,
      { params: Promise.resolve({ id }) },
    )
  }

  it('un incidente ABIERTO no se puede reabrir (409) y queda intacto', async () => {
    const inc = await crearConEstado('TST-REAP-ABIERTO', 'ABIERTO')
    const res = await reabrir(inc.id)

    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toMatch(/RESUELTO o CERRADO/i)

    const [d] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.id, inc.id))
    expect(d.horaRegistro).toEqual(inc.horaRegistro)
    expect(d.horaRegistroOriginal, 'no debe empezar a rastrear una reapertura que no ocurrió').toBeNull()
    expect(d.motivoReabertura).toBeNull()
  })

  it('un incidente CANCELADO tampoco (409) — se cancela por decisión, no se reabre', async () => {
    const inc = await crearConEstado('TST-REAP-CANCELADO', 'CANCELADO', { horaFin: new Date() })
    expect((await reabrir(inc.id)).status).toBe(409)
  })

  it('RESUELTO y CERRADO sí se reabren, y nunca producen la firma inconsistente', async () => {
    for (const [codigo, estado] of [['TST-REAP-OK-RESUELTO', 'RESUELTO'], ['TST-REAP-OK-CERRADO', 'CERRADO']] as const) {
      const inc = await crearConEstado(codigo, estado, {
        horaFin: new Date(Date.now() - 3600000), mttrMinutos: 60,
      })
      expect((await reabrir(inc.id)).status, `${estado} debe poder reabrirse`).toBe(200)

      const [d] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.id, inc.id))
      expect(d.estado).toBe('ABIERTO')
      const difieren = d.horaRegistroOriginal != null
        && new Date(d.horaRegistroOriginal).getTime() !== new Date(d.horaRegistro).getTime()
      expect(difieren, 'la reapertura sí debe quedar registrada').toBe(true)
      // La invariante que el CHECK va a exigir en la BD.
      expect(d.horaFinAnterior, 'si difieren, horaFinAnterior no puede ser null').not.toBeNull()
    }
  })
})

describe('PUT /api/incidentes/[id] — horaRegistroOriginal no es editable (fix b)', () => {
  it('lo ignora en silencio: 200, sin tocar el valor', async () => {
    const codigo = 'TST-REAP-PUT-ORIGINAL'
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
    const original = new Date(Date.now() - 5 * 3600000)
    const [inc] = await db.insert(schema.incidentes).values({
      codigo, tiendaId, registradoPorId, nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL',
      estado: 'ABIERTO', horaRegistro: new Date(Date.now() - 2 * 3600000),
      horaRegistroOriginal: original, horaFinAnterior: new Date(Date.now() - 3 * 3600000),
    }).returning()

    const { PUT } = await import('../route')
    const res = await PUT(
      { json: async () => ({
        observaciones: 'editado',
        horaRegistroOriginal: new Date().toISOString(),   // intento de retipeo
      }) } as any,
      { params: Promise.resolve({ id: inc.id }) },
    )
    expect(res.status, 'ignora en silencio, no rechaza').toBe(200)

    const [d] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.id, inc.id))
    expect(d.observaciones, 'lo legítimo sí se guarda').toBe('editado')
    expect(new Date(d.horaRegistroOriginal!).getTime(), 'horaRegistroOriginal no se movió').toBe(original.getTime())
  })
})

describe('BD — CHECK incidentes_reapertura_consistente (fix c)', () => {
  it('la constraint existe', async () => {
    const { sql: raw } = await import('drizzle-orm')
    const rows = await db.execute(raw`
      SELECT conname FROM pg_constraint WHERE conname = 'incidentes_reapertura_consistente'`) as any[]
    expect(rows.length, 'la aplica drizzle/run-sql.ts en el arranque').toBe(1)
  })

  it('la BD rechaza el estado inconsistente aunque el código lo intente', async () => {
    const codigo = 'TST-CHECK-REAPERTURA'
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))

    // horaRegistroOriginal distinto de horaRegistro, con horaFinAnterior en null:
    // exactamente la firma REABERTURA_INCONSISTENTE de 00071M.
    let err: any = null
    try {
      await db.insert(schema.incidentes).values({
        codigo, tiendaId, registradoPorId, nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL',
        estado: 'ABIERTO',
        horaRegistro: new Date(Date.now() - 3600000),
        horaRegistroOriginal: new Date(Date.now() - 7200000),
        horaFinAnterior: null,
      })
    } catch (e) { err = e }

    expect(err, 'la BD tiene que rechazarlo').toBeTruthy()
    // drizzle envuelve el error de postgres; el nombre de la constraint viaja
    // en la causa, no en el mensaje de arriba.
    const detalle = `${err?.message ?? ''} ${err?.cause?.message ?? ''} ${err?.cause?.constraint_name ?? ''}`
    expect(detalle).toMatch(/incidentes_reapertura_consistente/)
  })

  it('acepta un reabierto bien formado y uno nunca reabierto', async () => {
    for (const [codigo, extra] of [
      ['TST-CHECK-OK-REABIERTO', { horaRegistroOriginal: new Date(Date.now() - 7200000), horaFinAnterior: new Date(Date.now() - 5400000) }],
      ['TST-CHECK-OK-VIRGEN',    { horaRegistroOriginal: null, horaFinAnterior: null }],
    ] as const) {
      await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
      const [inc] = await db.insert(schema.incidentes).values({
        codigo, tiendaId, registradoPorId, nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL',
        estado: 'ABIERTO', horaRegistro: new Date(Date.now() - 3600000), ...extra,
      }).returning()
      expect(inc.id).toBeTruthy()
      await db.delete(schema.incidentes).where(eq(schema.incidentes.id, inc.id))
    }
  })
})
