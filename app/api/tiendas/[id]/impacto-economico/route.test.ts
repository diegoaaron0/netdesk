import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import { diaSemanaLima, calcImpactoRow } from '@/lib/impacto-calc'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE' } }),
}))

let registradoPorId: string
let tiendaId: string

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-IMPACTOECO-FANTASMA'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-IMPACTOECO-FANTASMA', nombreCc: 'Tienda — impacto-economico mov/cont fantasma', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()
  }
  tiendaId = t.id
})

function ventaHoraEsperada(tienda: { ventaHoraSoles: string | null; ventaHoraFdsSoles: string | null }, horaRegistro: Date): number {
  const dow = diaSemanaLima(horaRegistro)
  const isFDS = dow === 0 || dow === 5 || dow === 6
  return isFDS
    ? Number(tienda.ventaHoraFdsSoles ?? tienda.ventaHoraSoles ?? 0)
    : Number(tienda.ventaHoraSoles ?? tienda.ventaHoraFdsSoles ?? 0)
}

describe('GET /api/tiendas/[id]/impacto-economico — cont/mov necesitan su activado_por, no solo el timestamp', () => {
  it('cont_hora_activacion fantasma (sin cont_activado_por) → sin mitigación, no router activo', async () => {
    const { GET } = await import('./route')
    const horaRegistro = new Date(Date.now() - 3 * 3600000)
    const horaFin = new Date(Date.now() - 1 * 3600000)
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-IMPACTOECO-CONT-FANTASMA'))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-IMPACTOECO-CONT-FANTASMA', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      horaRegistro, horaFin, mttrMinutos: 120,
      contActivadoPor: null, contHoraActivacion: horaRegistro, contHoraDesactivacion: null, contRendimiento: null,
    })

    const req = new NextRequest(`http://localhost/api/tiendas/${tiendaId}/impacto-economico?desde=2000-01-01&hasta=2100-01-01`)
    const res = await GET(req, { params: Promise.resolve({ id: tiendaId }) })
    const data = await res.json()

    const inc = data.incidentes.find((i: any) => i.codigo === 'TST-IMPACTOECO-CONT-FANTASMA')
    expect(inc).toBeTruthy()
    expect(inc.ieiMotivo).toBe('sin mitigación')

    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tiendaId))
    const esperado = Math.round(ventaHoraEsperada(tienda, horaRegistro) * 2 * 0.35 * 1.00)
    expect(inc.iei).toBe(esperado)
  })

  it('mov_hora_activacion fantasma (sin mov_activado_por) → sin mitigación, no datos móviles activo', async () => {
    const { GET } = await import('./route')
    const horaRegistro = new Date(Date.now() - 3 * 3600000)
    const horaFin = new Date(Date.now() - 1 * 3600000)
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-IMPACTOECO-MOV-FANTASMA'))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-IMPACTOECO-MOV-FANTASMA', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      horaRegistro, horaFin, mttrMinutos: 120,
      movActivadoPor: null, movHoraActivacion: horaRegistro, movHoraDesactivacion: null, movRendimiento: null,
    })

    const req = new NextRequest(`http://localhost/api/tiendas/${tiendaId}/impacto-economico?desde=2000-01-01&hasta=2100-01-01`)
    const res = await GET(req, { params: Promise.resolve({ id: tiendaId }) })
    const data = await res.json()

    const inc = data.incidentes.find((i: any) => i.codigo === 'TST-IMPACTOECO-MOV-FANTASMA')
    expect(inc).toBeTruthy()
    expect(inc.ieiMotivo).toBe('sin mitigación')

    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tiendaId))
    const esperado = Math.round(ventaHoraEsperada(tienda, horaRegistro) * 2 * 0.35 * 1.00)
    expect(inc.iei).toBe(esperado)

    // iei30d (segunda query interna) también debe reflejar el mismo arreglo.
    const breakdownEntry = data.iei30dBreakdown.find((b: any) => b.codigo === 'TST-IMPACTOECO-MOV-FANTASMA')
    if (breakdownEntry) expect(breakdownEntry.iei).toBe(esperado)
  })
})

// ─── Fase 5, Paso 3 — calcIeiIncidente reemplaza calcImpactoRow ────────────────
// Este endpoint ya usaba calcImpactoRow (segmentado), así que el número no
// cambia para incidentes legacy — la novedad es que ahora también soporta
// incidentes con tramos.

describe('GET /api/tiendas/[id]/impacto-economico — IEI por incidente y acumulado 30d (Fase 5, Paso 3)', () => {
  const LUNES_10AM_LIMA = '2024-01-08T15:00:00.000Z'
  function horasDespues(iso: string, horas: number): string {
    return new Date(new Date(iso).getTime() + horas * 3600000).toISOString()
  }

  async function limpiar(codigo: string) {
    const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
    if (prev) await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  }

  it('legacy: IEI coincide con calcImpactoRow (sin cambios, ya era segmentado)', async () => {
    await limpiar('TST-IMPACTOECO-LEGACY')
    const horaRegistro = new Date(LUNES_10AM_LIMA)
    const horaFin = new Date(horasDespues(LUNES_10AM_LIMA, 2))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-IMPACTOECO-LEGACY', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro, horaFin, mttrMinutos: 120,
      contActivadoPor: 'AGENTE', contHoraActivacion: horaRegistro, contHoraDesactivacion: horaFin, contRendimiento: 'PARCIAL',
    })

    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tiendaId))
    const esperado = calcImpactoRow({
      hora_registro: horaRegistro, hora_fin: horaFin, estado: 'RESUELTO', tipo: 'CAIDA_TOTAL',
      venta_hora_soles: tienda.ventaHoraSoles, venta_hora_fds_soles: tienda.ventaHoraFdsSoles,
      cont_hora_activacion: horaRegistro, cont_hora_desactivacion: horaFin, cont_rendimiento: 'PARCIAL',
    }).impactoEstimado

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/tiendas/${tiendaId}/impacto-economico?desde=2024-01-08&hasta=2024-01-08`)
    const res = await GET(req, { params: Promise.resolve({ id: tiendaId }) })
    const data = await res.json()
    const inc = data.incidentes.find((i: any) => i.codigo === 'TST-IMPACTOECO-LEGACY')

    expect(inc, 'fixture debe existir').toBeTruthy()
    expect(inc.iei).toBe(esperado)
  })

  it('con tramos: un tramo EFECTIVO cerrado → IEI 0, el incidente sí aparece en el listado', async () => {
    await limpiar('TST-IMPACTOECO-TRAMO')
    const horaRegistro = new Date(LUNES_10AM_LIMA)
    const horaFin = new Date(horasDespues(LUNES_10AM_LIMA, 2))
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-IMPACTOECO-TRAMO', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro, horaFin, mttrMinutos: 120,
    }).returning()
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'ROUTER_PROPIO', factor: '0.0000', desde: horaRegistro, hasta: horaFin, ieTramo: '0.00',
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/tiendas/${tiendaId}/impacto-economico?desde=2024-01-08&hasta=2024-01-08`)
    const res = await GET(req, { params: Promise.resolve({ id: tiendaId }) })
    const data = await res.json()
    const fila = data.incidentes.find((i: any) => i.codigo === 'TST-IMPACTOECO-TRAMO')

    expect(fila, 'fixture debe existir en el listado').toBeTruthy()
    expect(fila.iei).toBe(0)
  })
})
