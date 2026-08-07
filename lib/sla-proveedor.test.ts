import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'sup-test-id' } }),
}))

// ── Fixture compartido por Paso 1, 2 y 3 ──────────────────────────────────────
// 3 de las 4 rutas ("lista", "detalle de proveedor", "detalle proveedor↔tienda")
// usan una ventana fija de "últimos 30 días desde NOW() real" sin aceptar
// desde/hasta — así que las fechas del fixture tienen que ser relativas a la
// hora real de ejecución, no un ancla fija como en otros tests de esta suite.
const AHORA = new Date()
const BASE = new Date(AHORA.getTime() - 3 * 24 * 3600 * 1000) // hace 3 días — con margen de sobra dentro de cualquier ventana de 30 días

function masMin(base: Date, min: number): Date {
  return new Date(base.getTime() + min * 60000)
}
function masHoras(base: Date, horas: number): Date {
  return new Date(base.getTime() + horas * 3600000)
}

const PROVEEDOR_NOMBRE = 'SLA CONSOLIDACION TEST'

// Ficha con override de contrato: 90 min respuesta / 120 min resolución
// (distinto a los defaults del sistema: 60 / 90).
const FICHA_SLA_RESPUESTA = 90
const FICHA_SLA_RESOLUCION = 120

interface Fixture { proveedorId: string; tiendaId: string; fichaId: string; incidentes: { id: string; codigo: string }[] }

let fx: Fixture

async function sembrarFixture(): Promise<Fixture> {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  // Proveedor y usuario de referencia (reusa el usuario ya sembrado)
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  const registradoPorId = ref.registradoPorId

  let [proveedor] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, PROVEEDOR_NOMBRE))
  if (!proveedor) {
    [proveedor] = await db.insert(schema.proveedores).values({ nombre: PROVEEDOR_NOMBRE }).returning()
  }

  let [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-SLA-CONSOLIDACION-01'))
  if (!tienda) {
    [tienda] = await db.insert(schema.tiendas).values({
      codigo: 'T-SLA-CONSOLIDACION-01',
      nombreCc: 'Tienda aislada — consolidación SLA',
      distrito: 'Test',
      cluster: 'B',
      proveedorId: proveedor.id,
      ventaHoraSoles: '100',
      ventaHoraFdsSoles: '150',
    }).returning()
  }

  let [ficha] = await db.select().from(schema.fichas).where(eq(schema.fichas.codigo, 'FC-SLA-CONSOLIDACION-01'))
  if (!ficha) {
    [ficha] = await db.insert(schema.fichas).values({
      codigo: 'FC-SLA-CONSOLIDACION-01',
      tiendaId: tienda.id,
      proveedorId: proveedor.id,
      estado: 'ACTIVA',
      activadoEn: new Date(),
      tiempoRespuestaSla: FICHA_SLA_RESPUESTA,
      tiempoResolucionSla: FICHA_SLA_RESOLUCION,
    }).returning()
    await db.update(schema.tiendas).set({ fichaActivaId: ficha.id }).where(eq(schema.tiendas.id, tienda.id))
  }

  // 4 incidentes con tiempos de respuesta/resolución diseñados para divergir
  // entre las 4 fuentes actuales (ficha-aware vs hardcodeado, score vs %, etc.)
  //   A: respuesta 80min, resolución 75min  → cumple bajo la ficha (90/120);
  //      no cumple bajo el default de respuesta (60) de lista/tienda-detalle.
  //   B: respuesta 15min, resolución 30min  → cumple en cualquier umbral.
  //   C: respuesta 135min, resolución 180min → no cumple en ningún umbral.
  //   D: respuesta 50min, resolución 150min → cumple respuesta, no cumple
  //      resolución bajo la ficha — asimetría clave para el Paso 3.
  const specs = [
    { codigo: 'TST-SLA-A', horaRegistro: BASE,               respMin: 5, respuestaMin: 80,  resolucionMin: 75 },
    { codigo: 'TST-SLA-B', horaRegistro: masHoras(BASE, 4),  respMin: 5, respuestaMin: 15,  resolucionMin: 30 },
    { codigo: 'TST-SLA-C', horaRegistro: masHoras(BASE, 8),  respMin: 5, respuestaMin: 135, resolucionMin: 180 },
    { codigo: 'TST-SLA-D', horaRegistro: masHoras(BASE, 12), respMin: 5, respuestaMin: 50,  resolucionMin: 150 },
  ]

  const incidentesOut: { id: string; codigo: string }[] = []
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
      emailContacto: 'soporte@sla-test.pe',
      horaEnvioCorreo: horaEnvio,
      horaRespuesta,
    })

    incidentesOut.push({ id: inc.id, codigo: inc.codigo })
  }

  return { proveedorId: proveedor.id, tiendaId: tienda.id, fichaId: ficha.id, incidentes: incidentesOut }
}

beforeAll(async () => { fx = await sembrarFixture() })

// NOTA: este describe originalmente (Paso 1) también probaba Lista, Detalle
// proveedor↔tienda y el Analítico con los valores de ANTES de la
// consolidación (50/50, 50/25, slaPct=50 combinado) y un test cruzado
// confirmando que divergían. Esas aserciones quedaron obsoletas apenas se
// aplicaron los fixes de Paso 2 y Paso 3 — reemplazadas por los describes
// "Paso 2" y "Paso 3" de abajo. Se conserva aquí solo el score de proximidad
// del Detalle (metricas.scoreRespuestaPromedio/scoreResolucionPromedio), que
// Paso 2 deliberadamente NO tocó (sigue alimentando slaBreakdown) y que Paso
// 3.5 investigará antes de decidir si se retira.
describe('Paso 1 — comportamiento aún no consolidado (Detalle: score de proximidad, pendiente de Paso 3.5)', () => {
  it('[Detalle proveedor] GET /api/proveedores/[id] — scoreRespuestaPromedio/scoreResolucionPromedio siguen siendo score de proximidad (0-100), no % de cumplimiento: 88 / 81', async () => {
    const { GET } = await import('@/app/api/proveedores/[id]/route')
    const res = await GET({} as any, { params: Promise.resolve({ id: fx.proveedorId }) })
    const data = await res.json()

    expect(data.metricas.scoreRespuestaPromedio).toBe(88)
    expect(data.metricas.scoreResolucionPromedio).toBe(81)
  })
})

describe('Paso 3 — el slaPct del Analítico ahora es el promedio de % respuesta y % resolución', () => {
  // respuesta 75% (Paso 2), resolución 50% (Paso 2) → promedio (75+50)/2 = 62.5 → 63 (round-half-up JS)
  const ESPERADO_SLA_PCT = 63

  it('[Analítico → getScoreProveedor] slaPct = promedio de % respuesta/resolución, ya no el ratio combinado (slaGeneral)', async () => {
    const { GET } = await import('@/app/api/dashboard/analitico/route')
    const desde = BASE.toISOString().slice(0, 10)
    const hasta = masHoras(BASE, 15).toISOString().slice(0, 10)
    const req = new NextRequest(`http://localhost/api/dashboard/analitico?desde=${desde}&hasta=${hasta}&proveedorId=${encodeURIComponent(PROVEEDOR_NOMBRE)}`)
    const res = await GET(req)
    const data = await res.json()

    expect(data.cards?.proveedorCritico, 'proveedorCritico debe estar poblado (único proveedor en el filtro)').toBeTruthy()
    expect(data.cards.proveedorCritico.nombre).toBe(PROVEEDOR_NOMBRE)
    expect(data.cards.proveedorCritico.metricas.slaPct).toBe(ESPERADO_SLA_PCT)
  })

  it('el nuevo slaPct alimenta correctamente getScoreProveedor() sin cambiar su firma ni el umbral >= 30', async () => {
    const { getScoreProveedor } = await import('@/lib/dashboard-calculations')
    const { GET } = await import('@/app/api/dashboard/analitico/route')
    const desde = BASE.toISOString().slice(0, 10)
    const hasta = masHoras(BASE, 15).toISOString().slice(0, 10)
    const req = new NextRequest(`http://localhost/api/dashboard/analitico?desde=${desde}&hasta=${hasta}&proveedorId=${encodeURIComponent(PROVEEDOR_NOMBRE)}`)
    const res = await GET(req)
    const data = await res.json()

    const m = data.cards.proveedorCritico.metricas
    expect(m.slaPct).toBe(ESPERADO_SLA_PCT)

    // Único proveedor en el filtro → maximos = sus propios valores → normCosto/normMttr/normIncidentes = 100
    const maximos = { costo: m.costoEstimado || 1, mttrMinutos: m.mttrMinutos || 1, reincidenciaTiendas: m.reincidenciaTiendas || 1, incidentes: m.incidentes || 1 }
    const { score, breakdown } = getScoreProveedor(
      { costo: m.costoEstimado, slaPct: m.slaPct, mttrMinutos: m.mttrMinutos, reincidenciaTiendas: m.reincidenciaTiendas, incidentes: m.incidentes },
      maximos,
    )
    // sla breakdown = round((100 - slaPct) * 0.25) = round(37 * 0.25) = round(9.25) = 9
    expect(breakdown.sla).toBe(9)
    expect(data.cards.proveedorCritico.score).toBe(score)
    expect(score).toBeGreaterThanOrEqual(30) // no cruza el umbral "Proveedor Crítico" con este fixture — solo referencia (Paso 4)
  })
})

describe('Paso 2 — Lista, Detalle y Detalle proveedor↔tienda convergen tras la consolidación', () => {
  // Con la ficha (90min/120min): A(80,75)=cumple/cumple, B(15,30)=cumple/cumple,
  // C(135,180)=no/no, D(50,150)=cumple/no → respuesta 3/4=75%, resolución 2/4=50%
  const ESPERADO_RESPUESTA  = 75
  const ESPERADO_RESOLUCION = 50

  it('[Lista] ahora usa la ficha (75% / 50%), no el hardcodeo 60/90 de antes', async () => {
    const { GET } = await import('@/app/api/proveedores/route')
    const res = await GET(new NextRequest('http://localhost/api/proveedores'))
    const data = await res.json()
    const fila = (data as any[]).find(p => p.nombre === PROVEEDOR_NOMBRE)

    expect(fila.slaRespuesta).toBe(ESPERADO_RESPUESTA)
    expect(fila.slaResolucion).toBe(ESPERADO_RESOLUCION)
  })

  it('[Detalle proveedor] slaRespuestaPct/slaResolucionPct (% real, no score de proximidad) coinciden con Lista', async () => {
    const { GET } = await import('@/app/api/proveedores/[id]/route')
    const res = await GET({} as any, { params: Promise.resolve({ id: fx.proveedorId }) })
    const data = await res.json()

    expect(data.metricas.slaRespuestaPct).toBe(ESPERADO_RESPUESTA)
    expect(data.metricas.slaResolucionPct).toBe(ESPERADO_RESOLUCION)
  })

  it('[Detalle proveedor↔tienda] converge con Lista y Detalle', async () => {
    const { GET } = await import('@/app/api/proveedores/[id]/tienda/[tiendaId]/route')
    const res = await GET({} as any, { params: Promise.resolve({ id: fx.proveedorId, tiendaId: fx.tiendaId }) })
    const data = await res.json()

    expect(data.metricas.slaRespuestaTienda).toBe(ESPERADO_RESPUESTA)
    expect(data.metricas.slaResolucionTienda).toBe(ESPERADO_RESOLUCION)
  })

  it('las 3 fuentes dan EXACTAMENTE el mismo resultado para el mismo proveedor/período', async () => {
    const listaMod   = await import('@/app/api/proveedores/route')
    const detalleMod = await import('@/app/api/proveedores/[id]/route')
    const tiendaMod  = await import('@/app/api/proveedores/[id]/tienda/[tiendaId]/route')

    const lista   = (await (await listaMod.GET(new NextRequest('http://localhost/api/proveedores'))).json())
      .find((p: any) => p.nombre === PROVEEDOR_NOMBRE)
    const detalle = await (await detalleMod.GET({} as any, { params: Promise.resolve({ id: fx.proveedorId }) })).json()
    const tienda  = await (await tiendaMod.GET({} as any, { params: Promise.resolve({ id: fx.proveedorId, tiendaId: fx.tiendaId }) })).json()

    expect([lista.slaRespuesta, detalle.metricas.slaRespuestaPct, tienda.metricas.slaRespuestaTienda])
      .toEqual([ESPERADO_RESPUESTA, ESPERADO_RESPUESTA, ESPERADO_RESPUESTA])
    expect([lista.slaResolucion, detalle.metricas.slaResolucionPct, tienda.metricas.slaResolucionTienda])
      .toEqual([ESPERADO_RESOLUCION, ESPERADO_RESOLUCION, ESPERADO_RESOLUCION])
  })
})
