import { describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'

const LUNES_10AM_LIMA = '2024-01-08T15:00:00.000Z' // lunes 10:00 Lima
function horasDespues(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3600000).toISOString()
}

// Calcula el IEI "a mano" usando exactamente la misma fórmula SQL que ieiPerRow()
// de report-sql.ts, para comparar contra lo que devuelve v1 sin depender de que
// v1 esté implementado de una forma particular (evita un test tautológico).
async function ieiInternoSql(incidenteId: string): Promise<number> {
  const postgres = (await import('postgres')).default
  const { ieiPerRow } = await import('@/lib/report-sql')
  const sqlClient = postgres(process.env.DATABASE_URL!)
  const rows = await sqlClient.unsafe(`
    SELECT ROUND((${ieiPerRow()}))::int AS iei
    FROM incidentes i JOIN tiendas t ON i.tienda_id = t.id
    WHERE i.id = '${incidenteId}'
  `)
  await sqlClient.end()
  return rows[0].iei
}

describe('GET /api/v1/incidentes — IEI de fin de semana (Paso 2)', () => {
  it('el IEI de un incidente de sábado coincide con el cálculo interno (usa venta_hora_fds_soles)', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { calcImpactoRow } = await import('@/lib/impacto-calc')
    const { GET } = await import('./route')

    const [inc] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P2-001'))
    expect(inc, 'fixture TST-P2-001 debe existir — corre tests/fixtures/seed-test-data.ts').toBeTruthy()
    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, inc.tiendaId))

    // Cálculo interno — misma función que usan el detalle y el dashboard,
    // pasándole ambas tarifas (semana y fin de semana) como corresponde.
    const interno = calcImpactoRow({
      hora_registro: inc.horaRegistro,
      hora_fin: inc.horaFin,
      estado: inc.estado,
      tipo: inc.tipo,
      venta_hora_soles: tienda.ventaHoraSoles != null ? Number(tienda.ventaHoraSoles) : null,
      venta_hora_fds_soles: tienda.ventaHoraFdsSoles != null ? Number(tienda.ventaHoraFdsSoles) : null,
      cluster: tienda.cluster,
    })

    const req = new NextRequest('http://localhost/api/v1/incidentes?desde=2024-01-06&hasta=2024-01-06&key=test-api-key')
    const res = await GET(req)
    const body = await res.json()
    const fila = body.data.find((d: any) => d.codigo === 'TST-P2-001')

    expect(fila, 'el incidente de fixture debe venir en la respuesta v1').toBeTruthy()
    expect(fila.iei_estimado_soles).toBe(interno.impactoEstimado)
    // Verificación explícita de que SÍ usa la tarifa de fin de semana (400) y no la de semana (250)
    expect(fila.iei_estimado_soles).toBe(Math.round(400 * 3 * 0.35 * 1))
    expect(fila.iei_estimado_soles).not.toBe(Math.round(250 * 3 * 0.35 * 1))
  })
})

describe('GET /api/v1/incidentes — IEI con mitigación activa (Paso 1, sesión 2)', () => {
  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    // Reusa la tienda BITEL TEST ya sembrada (vía el incidente TST-P1-001)
    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    const tiendaId = ref.tiendaId
    const registradoPorId = ref.registradoPorId

    // Boleta manual con rendimiento NULA: el bug real — v1 nunca leía
    // boleta_rendimiento ni boleta_hora_activacion, así que siempre asumía
    // "residual" (buen rendimiento) sin importar lo que se hubiera registrado.
    await db.insert(schema.incidentes).values({
      codigo: 'TST-V1-BOLETA-01',
      tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      evaluableProveedor: true,
      horaRegistro: new Date(LUNES_10AM_LIMA),
      horaFin: new Date(horasDespues(LUNES_10AM_LIMA, 2)),
      mttrMinutos: 120,
      boletaManual: true,
      boletaRendimiento: 'NULA',
      boletaHoraActivacion: new Date(LUNES_10AM_LIMA),
    }).onConflictDoNothing()

    // Contingencia de router con rendimiento PARCIAL (cobertura de la otra
    // familia de mitigación nombrada en el bug original: contingencia_activa).
    await db.insert(schema.incidentes).values({
      codigo: 'TST-V1-CONT-01',
      tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      evaluableProveedor: true,
      horaRegistro: new Date(LUNES_10AM_LIMA),
      horaFin: new Date(horasDespues(LUNES_10AM_LIMA, 2)),
      mttrMinutos: 120,
      contActivadoPor: 'TIENDA',
      contHoraActivacion: new Date(LUNES_10AM_LIMA),
      contHoraDesactivacion: new Date(horasDespues(LUNES_10AM_LIMA, 2)),
      contRendimiento: 'PARCIAL',
    }).onConflictDoNothing()
  })

  it('boleta manual con rendimiento NULA: el IEI de v1 coincide con el cálculo interno (report-sql.ts)', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { GET } = await import('./route')

    const [inc] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-V1-BOLETA-01'))
    const interno = await ieiInternoSql(inc.id)

    const req = new NextRequest('http://localhost/api/v1/incidentes?desde=2024-01-08&hasta=2024-01-08&key=test-api-key')
    const res = await GET(req)
    const body = await res.json()
    const fila = body.data.find((d: any) => d.codigo === 'TST-V1-BOLETA-01')

    expect(fila, 'el incidente de fixture debe venir en la respuesta v1').toBeTruthy()
    expect(fila.iei_estimado_soles).toBe(interno)
    // Con rendimiento NULA el factor debe ser 1.00 (pérdida total) — el bug
    // anterior daba ~0.10 (residual) porque nunca leía boleta_rendimiento.
    expect(fila.iei_estimado_soles).toBe(Math.round(250 * 2 * 0.35 * 1.00))
  })

  it('contingencia de router con rendimiento PARCIAL: el IEI de v1 coincide con el cálculo interno', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { GET } = await import('./route')

    const [inc] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-V1-CONT-01'))
    const interno = await ieiInternoSql(inc.id)

    const req = new NextRequest('http://localhost/api/v1/incidentes?desde=2024-01-08&hasta=2024-01-08&key=test-api-key')
    const res = await GET(req)
    const body = await res.json()
    const fila = body.data.find((d: any) => d.codigo === 'TST-V1-CONT-01')

    expect(fila).toBeTruthy()
    expect(fila.iei_estimado_soles).toBe(interno)
    expect(fila.iei_estimado_soles).toBe(Math.round(250 * 2 * 0.35 * 0.20))
  })
})

describe('GET /api/v1/incidentes — etiqueta de cont_rendimiento (Paso 2, barrido)', () => {
  it('EFECTIVO se muestra como "Total" (antes mostraba el valor crudo "EFECTIVO")', async () => {
    const { GET } = await import('./route')
    // TST-P3-NEW-01 (sembrado en la sesión anterior) tiene cont_rendimiento = 'EFECTIVO'
    const req = new NextRequest('http://localhost/api/v1/incidentes?desde=2024-01-09&hasta=2024-01-09&key=test-api-key')
    const res = await GET(req)
    const body = await res.json()
    const fila = body.data.find((d: any) => d.codigo === 'TST-P3-NEW-01')
    expect(fila, 'fixture TST-P3-NEW-01 debe existir — sembrado en la sesión anterior').toBeTruthy()
    expect(fila.cont_rendimiento).toBe('Total')
  })

  it('NULO se muestra como "Fallida" (antes mostraba el valor crudo "NULO")', async () => {
    const { GET } = await import('./route')
    // TST-P3-NEW-03 tiene cont_rendimiento = 'NULO'
    const req = new NextRequest('http://localhost/api/v1/incidentes?desde=2024-01-09&hasta=2024-01-09&key=test-api-key')
    const res = await GET(req)
    const body = await res.json()
    const fila = body.data.find((d: any) => d.codigo === 'TST-P3-NEW-03')
    expect(fila, 'fixture TST-P3-NEW-03 debe existir — sembrado en la sesión anterior').toBeTruthy()
    expect(fila.cont_rendimiento).toBe('Fallida')
  })
})

describe('GET /api/v1/incidentes — SLA Resolución usa hora_fin−hora_primera_resp, no el MTTR total (Paso 2, barrido)', () => {
  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    const tiendaId = ref.tiendaId
    const registradoPorId = ref.registradoPorId

    // MTTR total = 100 min (> 90, límite de resolución) pero el proveedor
    // respondió a los 30 min y resolvió en 70 min desde su respuesta (<= 90).
    // Con MTTR esto da "Incumplido"; con hora_fin−hora_primera_resp da "Cumplido".
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-V1-SLA-01',
      tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      evaluableProveedor: true,
      horaRegistro: new Date(LUNES_10AM_LIMA),
      horaFin: new Date(horasDespues(LUNES_10AM_LIMA, 100 / 60)),
      mttrMinutos: 100,
    }).onConflictDoNothing().returning()

    const incidenteId = inc?.id ?? (await db.select({ id: schema.incidentes.id }).from(schema.incidentes)
      .where(eq(schema.incidentes.codigo, 'TST-V1-SLA-01')))[0].id

    const yaExiste = await db.select().from(schema.escalamientos).where(eq(schema.escalamientos.incidenteId, incidenteId))
    if (yaExiste.length === 0) {
      await db.insert(schema.escalamientos).values({
        incidenteId,
        nivel: 1,
        contactoEscalado: 'Soporte Test',
        emailContacto: 'soporte@bitel-test.pe',
        horaEnvioCorreo: new Date(horasDespues(LUNES_10AM_LIMA, 20 / 60)),
        horaRespuesta:   new Date(horasDespues(LUNES_10AM_LIMA, 30 / 60)),
      })
    }
  })

  it('v1/incidentes: Cumplido según hora_fin−hora_primera_resp (70 min), aunque el MTTR (100 min) exceda el límite', async () => {
    const { GET } = await import('./route')
    const req = new NextRequest('http://localhost/api/v1/incidentes?desde=2024-01-08&hasta=2024-01-08&key=test-api-key')
    const res = await GET(req)
    const body = await res.json()
    const fila = body.data.find((d: any) => d.codigo === 'TST-V1-SLA-01')

    expect(fila, 'fixture TST-V1-SLA-01 debe existir').toBeTruthy()
    expect(fila.mttr_minutos).toBe(100) // el MTTR total sigue > 90 (para dejar claro que no es por ahí)
    expect(fila.sla_resolucion).toBe('Cumplido')
  })
})
