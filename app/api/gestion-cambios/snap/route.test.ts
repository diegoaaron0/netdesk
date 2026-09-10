import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import { diaSemanaLima, calcImpactoRow } from '@/lib/impacto-calc'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'SUPERVISOR' } }),
}))

let registradoPorId: string
let tiendaId: string

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-SNAP-MOV-FANTASMA'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-SNAP-MOV-FANTASMA', nombreCc: 'Tienda — snap mov fantasma', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()
  }
  tiendaId = t.id
})

describe('GET /api/gestion-cambios/snap — datos móviles necesita mov_activado_por, no solo mov_hora_activacion', () => {
  it('mov_hora_activacion fantasma (sin mov_activado_por) no reduce el ieiAcumulado del período', async () => {
    const { GET } = await import('./route')

    const horaRegistro = new Date(Date.now() - 3 * 3600000)
    const horaFin = new Date(Date.now() - 1 * 3600000)
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-SNAP-MOV-FANTASMA'))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-SNAP-MOV-FANTASMA', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      horaRegistro, horaFin, mttrMinutos: 120,
      movActivadoPor: null, movHoraActivacion: horaRegistro, movHoraDesactivacion: null, movRendimiento: null,
    })

    const req = new NextRequest(`http://localhost/api/gestion-cambios/snap?tiendaId=${tiendaId}&dias=7`)
    const res = await GET(req)
    const data = await res.json()

    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tiendaId))
    const dow = diaSemanaLima(horaRegistro)
    const isFDS = dow === 0 || dow === 5 || dow === 6
    const ventaHora = isFDS
      ? Number(tienda.ventaHoraFdsSoles ?? tienda.ventaHoraSoles ?? 0)
      : Number(tienda.ventaHoraSoles ?? tienda.ventaHoraFdsSoles ?? 0)
    // CAIDA_TOTAL, 2h, sin mitigación real → factor 1.00. Si el bug estuviera
    // presente, el mov fantasma bajaría el factor a 0.50.
    const esperado = Math.round(ventaHora * 2 * 0.35 * 100) / 100
    expect(data.ieiAcumulado).toBe(esperado)
  })
})

describe('GET /api/gestion-cambios/snap — CERRADO se cuenta igual que RESUELTO (fix autorizado, Fase 5, Paso 4)', () => {
  it('incidente CERRADO ya NO da 0 en ieiAcumulado (antes: snap no hardcodeaba RESUELTO como sí hace evaluar)', async () => {
    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-SNAP-CERRADO'))
    if (!t) [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-SNAP-CERRADO', nombreCc: 'Tienda — snap cerrado', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()

    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-SNAP-CERRADO'))
    const horaRegistro = new Date(Date.now() - 3 * 3600000)
    const horaFin = new Date(Date.now() - 1 * 3600000)
    await db.insert(schema.incidentes).values({
      codigo: 'TST-SNAP-CERRADO', tiendaId: t.id, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'CERRADO',
      horaRegistro, horaFin, mttrMinutos: 120,
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/gestion-cambios/snap?tiendaId=${t.id}&dias=7`)
    const res = await GET(req)
    const data = await res.json()

    expect(data.ieiAcumulado).toBeGreaterThan(0)
    expect(data.totalIncidentes).toBe(1)
  })
})

describe('GET /api/gestion-cambios/snap — IEI segmentado y campo metodo (Fase 5, Paso 4)', () => {
  it('router activo solo una parte del incidente → cobra las horas descubiertas', async () => {
    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-SNAP-PARCIAL'))
    if (!t) [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-SNAP-PARCIAL', nombreCc: 'Tienda — snap parcial', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()

    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-SNAP-PARCIAL'))
    // Fechas relativas a "ahora" (no una fecha fija de 2024) — snap siempre usa
    // una ventana [ahora - dias, ahora], así que el fixture debe caer ahí.
    const horaRegistro = new Date(Date.now() - 4 * 3600000)
    const horaFin = new Date(Date.now())
    const contActivacion = new Date(Date.now() - 3 * 3600000)
    const contDesactivacion = new Date(Date.now() - 1 * 3600000)
    await db.insert(schema.incidentes).values({
      codigo: 'TST-SNAP-PARCIAL', tiendaId: t.id, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro, horaFin, mttrMinutos: 240,
      contActivadoPor: 'AGENTE', contHoraActivacion: contActivacion,
      contHoraDesactivacion: contDesactivacion, contRendimiento: 'EFECTIVO', contEsExterno: false,
    })

    const esperado = calcImpactoRow({
      hora_registro: horaRegistro, hora_fin: horaFin, estado: 'RESUELTO', tipo: 'CAIDA_TOTAL',
      venta_hora_soles: 100, venta_hora_fds_soles: 150,
      cont_hora_activacion: contActivacion, cont_hora_desactivacion: contDesactivacion,
      cont_rendimiento: 'EFECTIVO',
    }).impactoEstimado

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/gestion-cambios/snap?tiendaId=${t.id}&dias=7`)
    const res = await GET(req)
    const data = await res.json()

    expect(data.totalIncidentes).toBe(1)
    expect(data.ieiAcumulado).toBe(Math.round(esperado * 100) / 100)
    expect(data.ieiAcumulado).toBeGreaterThan(0)
  })

  it('metodo: TRAMOS cuando el incidente del período tiene tramos', async () => {
    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-SNAP-METODO-TRAMOS'))
    if (!t) [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-SNAP-METODO-TRAMOS', nombreCc: 'Tienda — snap metodo tramos', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()

    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-SNAP-METODO-TRAMOS'))
    const horaRegistro = new Date(Date.now() - 3 * 3600000)
    const horaFin = new Date(Date.now() - 1 * 3600000)
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-SNAP-METODO-TRAMOS', tiendaId: t.id, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      horaRegistro, horaFin, mttrMinutos: 120,
    }).returning()
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: horaRegistro, hasta: horaFin, ieTramo: '70.00',
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/gestion-cambios/snap?tiendaId=${t.id}&dias=7`)
    const res = await GET(req)
    const data = await res.json()

    expect(data.metodo).toBe('TRAMOS')
  })
})

describe('GET /api/gestion-cambios/snap — no evalúa tiendas dadas de baja', () => {
  it('tienda ARCHIVADA → 409 con mensaje claro, sin calcular KPIs', async () => {
    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-SNAP-ARCHIVADA'))
    if (!t) [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-SNAP-ARCHIVADA', nombreCc: 'Tienda — snap archivada', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()
    await db.update(schema.tiendas)
      .set({ estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Cierre de prueba' } as any)
      .where(eq(schema.tiendas.id, t.id))

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/gestion-cambios/snap?tiendaId=${t.id}&dias=7`)
    const res = await GET(req)

    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toMatch(/archivada/i)
    expect(data.ieiAcumulado).toBeUndefined()
  })

  it('la misma tienda ACTIVA sí se evalúa (el 409 es por el estado, no por la tienda)', async () => {
    const [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-SNAP-ARCHIVADA'))
    await db.update(schema.tiendas)
      .set({ estado: 'ACTIVA', archivadaEn: null, archivadaMotivo: null } as any)
      .where(eq(schema.tiendas.id, t.id))

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/gestion-cambios/snap?tiendaId=${t.id}&dias=7`)
    const res = await GET(req)

    expect(res.status).toBe(200)
  })
})
