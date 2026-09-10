import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import { calcImpactoRow } from '@/lib/impacto-calc'

// Fase 5, Paso 4 — el más sensible: el resultado de calcMetrics se graba
// PERMANENTE en acciones_gestion (eval30/eval90), nunca se recalcula. Estos
// tests capturan el comportamiento correcto ANTES de que exista la migración
// (algunos ya fallan hoy — el hardcode de CERRADO y la fórmula segmentada son
// correcciones autorizadas, no comportamiento nuevo inventado).

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'SUPERVISOR' } }),
}))

const LUNES_10AM_LIMA = '2024-01-08T15:00:00.000Z'
function horasDespues(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3600000).toISOString()
}

let registradoPorId: string

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId
})

async function crearTiendaAislada(codigo: string): Promise<string> {
  const [existente] = await db.select({ id: schema.tiendas.id }).from(schema.tiendas).where(eq(schema.tiendas.codigo, codigo))
  if (existente) {
    const incs = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.tiendaId, existente.id))
    for (const i of incs) await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, i.id))
    await db.delete(schema.incidentes).where(eq(schema.incidentes.tiendaId, existente.id))
    return existente.id
  }
  const [t] = await db.insert(schema.tiendas).values({
    codigo, nombreCc: `Tienda — ${codigo}`, distrito: 'Test', cluster: 'B',
    ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
  }).returning()
  return t.id
}

describe('calcMetrics (gestion-cambios/[id]/evaluar) — ieiAcumulado segmentado (Fase 5, Paso 4)', () => {
  it('router activo solo una parte del incidente → cobra las horas descubiertas, no un solo factor sobre todo el mttr', async () => {
    const tiendaId = await crearTiendaAislada('T-EVALUAR-PARCIAL')
    const horaRegistro = new Date(LUNES_10AM_LIMA)
    const horaFin = new Date(horasDespues(LUNES_10AM_LIMA, 4))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-EVALUAR-PARCIAL', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro, horaFin, mttrMinutos: 240,
      contActivadoPor: 'AGENTE', contHoraActivacion: new Date(horasDespues(LUNES_10AM_LIMA, 1)),
      contHoraDesactivacion: new Date(horasDespues(LUNES_10AM_LIMA, 3)), contRendimiento: 'EFECTIVO', contEsExterno: false,
    })

    const esperado = calcImpactoRow({
      hora_registro: horaRegistro, hora_fin: horaFin, estado: 'RESUELTO', tipo: 'CAIDA_TOTAL',
      venta_hora_soles: 100, venta_hora_fds_soles: 150,
      cont_hora_activacion: horasDespues(LUNES_10AM_LIMA, 1), cont_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 3),
      cont_rendimiento: 'EFECTIVO',
    }).impactoEstimado

    const { calcMetrics } = await import('./route')
    const desde = new Date(horasDespues(LUNES_10AM_LIMA, -1))
    const hasta = new Date(horasDespues(LUNES_10AM_LIMA, 24))
    const metrics = await calcMetrics([tiendaId], desde, hasta)

    expect(metrics.ieiAcumulado).toBe(Math.round(esperado * 100) / 100)
    expect(metrics.ieiAcumulado).toBeGreaterThan(0)
  })

  it('incidente CERRADO (no RESUELTO) SÍ se calcula — antes evaluar ya lo hardcodeaba a RESUELTO, calcIeiIncidente debe preservar eso', async () => {
    const tiendaId = await crearTiendaAislada('T-EVALUAR-CERRADO')
    const horaRegistro = new Date(LUNES_10AM_LIMA)
    const horaFin = new Date(horasDespues(LUNES_10AM_LIMA, 2))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-EVALUAR-CERRADO', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'CERRADO', evaluableProveedor: true,
      horaRegistro, horaFin, mttrMinutos: 120,
    })

    const { calcMetrics } = await import('./route')
    const desde = new Date(horasDespues(LUNES_10AM_LIMA, -1))
    const hasta = new Date(horasDespues(LUNES_10AM_LIMA, 24))
    const metrics = await calcMetrics([tiendaId], desde, hasta)

    // CAIDA_TOTAL, 2h, sin mitigación, venta 100 → 100*2*0.35*1.00 = 70
    expect(metrics.ieiAcumulado).toBe(70)
    expect(metrics.totalIncidentes).toBe(1)
  })

  it('penalidadEstimada solo suma incidentes con SLA vencido, no todos', async () => {
    const tiendaId = await crearTiendaAislada('T-EVALUAR-PENALIDAD')
    // Incidente 1: dentro de SLA (90 min default), NO debe sumar a penalidad
    await db.insert(schema.incidentes).values({
      codigo: 'TST-EVALUAR-PEN-OK', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro: new Date(LUNES_10AM_LIMA), horaFin: new Date(horasDespues(LUNES_10AM_LIMA, 1)), mttrMinutos: 60,
    })
    // Incidente 2: excede SLA (mucho más de 90 min), SÍ debe sumar a penalidad
    const horaRegistro2 = new Date(horasDespues(LUNES_10AM_LIMA, 3))
    const horaFin2 = new Date(horasDespues(LUNES_10AM_LIMA, 8))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-EVALUAR-PEN-VENCIDO', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro: horaRegistro2, horaFin: horaFin2, mttrMinutos: 300,
    })

    const { calcMetrics } = await import('./route')
    const desde = new Date(horasDespues(LUNES_10AM_LIMA, -1))
    const hasta = new Date(horasDespues(LUNES_10AM_LIMA, 24))
    const metrics = await calcMetrics([tiendaId], desde, hasta)

    const esperadoPenalidad = calcImpactoRow({
      hora_registro: horaRegistro2, hora_fin: horaFin2, estado: 'RESUELTO', tipo: 'CAIDA_TOTAL',
      venta_hora_soles: 100, venta_hora_fds_soles: 150,
    }).impactoEstimado

    expect(metrics.incidentesSlaVencido).toBe(1)
    expect(metrics.penalidadEstimada).toBe(Math.round(esperadoPenalidad * 100) / 100)
  })

  it('metodo: LEGACY cuando ningún incidente del período tiene tramos', async () => {
    const tiendaId = await crearTiendaAislada('T-EVALUAR-METODO-LEGACY')
    await db.insert(schema.incidentes).values({
      codigo: 'TST-EVALUAR-METODO-LEGACY', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro: new Date(LUNES_10AM_LIMA), horaFin: new Date(horasDespues(LUNES_10AM_LIMA, 1)), mttrMinutos: 60,
    })
    const { calcMetrics } = await import('./route')
    const metrics = await calcMetrics([tiendaId], new Date(horasDespues(LUNES_10AM_LIMA, -1)), new Date(horasDespues(LUNES_10AM_LIMA, 24)))
    expect(metrics.metodo).toBe('LEGACY')
  })

  it('metodo: TRAMOS cuando todos los incidentes del período tienen tramos', async () => {
    const tiendaId = await crearTiendaAislada('T-EVALUAR-METODO-TRAMOS')
    const horaRegistro = new Date(LUNES_10AM_LIMA)
    const horaFin = new Date(horasDespues(LUNES_10AM_LIMA, 2))
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-EVALUAR-METODO-TRAMOS', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro, horaFin, mttrMinutos: 120,
    }).returning()
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: horaRegistro, hasta: horaFin, ieTramo: '70.00',
    })
    const { calcMetrics } = await import('./route')
    const metrics = await calcMetrics([tiendaId], new Date(horasDespues(LUNES_10AM_LIMA, -1)), new Date(horasDespues(LUNES_10AM_LIMA, 24)))
    expect(metrics.metodo).toBe('TRAMOS')
    expect(metrics.ieiAcumulado).toBe(70)
  })

  it('metodo: MIXTO cuando hay incidentes con y sin tramos en el mismo período', async () => {
    const tiendaId = await crearTiendaAislada('T-EVALUAR-METODO-MIXTO')
    const horaRegistro1 = new Date(LUNES_10AM_LIMA)
    const horaFin1 = new Date(horasDespues(LUNES_10AM_LIMA, 2))
    const [inc1] = await db.insert(schema.incidentes).values({
      codigo: 'TST-EVALUAR-METODO-MIXTO-1', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro: horaRegistro1, horaFin: horaFin1, mttrMinutos: 120,
    }).returning()
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc1.id, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: horaRegistro1, hasta: horaFin1, ieTramo: '70.00',
    })
    await db.insert(schema.incidentes).values({
      codigo: 'TST-EVALUAR-METODO-MIXTO-2', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro: new Date(horasDespues(LUNES_10AM_LIMA, 4)), horaFin: new Date(horasDespues(LUNES_10AM_LIMA, 5)), mttrMinutos: 60,
    })
    const { calcMetrics } = await import('./route')
    const metrics = await calcMetrics([tiendaId], new Date(horasDespues(LUNES_10AM_LIMA, -1)), new Date(horasDespues(LUNES_10AM_LIMA, 24)))
    expect(metrics.metodo).toBe('MIXTO')
  })

  it('metodo: null cuando no hay incidentes en el período', async () => {
    const tiendaId = await crearTiendaAislada('T-EVALUAR-METODO-VACIO')
    const { calcMetrics } = await import('./route')
    const metrics = await calcMetrics([tiendaId], new Date(horasDespues(LUNES_10AM_LIMA, -1)), new Date(horasDespues(LUNES_10AM_LIMA, 24)))
    expect(metrics.metodo).toBeNull()
    expect(metrics.totalIncidentes).toBe(0)
  })
})

describe('POST /api/gestion-cambios/[id]/evaluar — persiste eval30Metodo/eval90Metodo (Fase 5, Paso 4)', () => {
  it('guarda eval30Metodo=LEGACY al evaluar a 30 días una acción sin tramos en su ventana', async () => {
    const tiendaId = await crearTiendaAislada('T-EVALUAR-PERSIST-30')
    const ejecutadoEn = new Date(LUNES_10AM_LIMA)
    await db.insert(schema.incidentes).values({
      codigo: 'TST-EVALUAR-PERSIST-30', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro: new Date(horasDespues(LUNES_10AM_LIMA, 24)), horaFin: new Date(horasDespues(LUNES_10AM_LIMA, 25)), mttrMinutos: 60,
    })

    await db.delete(schema.accionesGestion).where(eq(schema.accionesGestion.codigo, 'AC-TEST-EVAL-PERSIST-30'))
    const [creadoPor] = await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.id, registradoPorId))
    const [accion] = await db.insert(schema.accionesGestion).values({
      codigo: 'AC-TEST-EVAL-PERSIST-30', tipo: 'CAMBIO_CONTRATO', estado: 'COMPLETADO', alcance: 'TIENDA',
      titulo: 'Test evaluar persist', motivo: 'Test', tiendaId, creadoPorId: creadoPor.id, ejecutadoEn,
    }).returning()

    const { POST } = await import('./route')
    const res = await POST({ json: async () => ({ periodo: 30 }) } as any, { params: Promise.resolve({ id: accion.id }) })
    expect(res.status).not.toBe(403)
    const data = await res.json()

    expect(data.eval30Metodo).toBe('LEGACY')
    expect(data.eval30Completada).toBe(true)

    const [enBd] = await db.select({ eval30Metodo: schema.accionesGestion.eval30Metodo, eval90Metodo: schema.accionesGestion.eval90Metodo })
      .from(schema.accionesGestion).where(eq(schema.accionesGestion.id, accion.id))
    expect(enBd.eval30Metodo).toBe('LEGACY')
    expect(enBd.eval90Metodo).toBeNull() // todavía no se evaluó a 90 días
  })
})
