import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import { calcImpactoRow } from '@/lib/impacto-calc'

// Fase 5, Paso 3 — panel proveedor↔tienda. impactoEstimado pasa de ieiSum
// (SQL, un solo factor sobre todo el mttr) a calcIeiIncidente (segmentado).
//
// Este endpoint NO filtra por fecha (suma todo el histórico resuelto de la
// tienda+proveedor) — cada test usa su PROPIA tienda para no contaminarse
// entre sí ni entre corridas.

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE' } }),
}))

const LUNES_10AM_LIMA = '2024-01-08T15:00:00.000Z'
function horasDespues(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3600000).toISOString()
}

const CODIGO_PROVEEDOR = 'PROV-TEST-PROVTIENDA-IEI'
let proveedorId: string
let registradoPorId: string

beforeAll(async () => {
  let [prov] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, CODIGO_PROVEEDOR))
  if (!prov) [prov] = await db.insert(schema.proveedores).values({ nombre: CODIGO_PROVEEDOR }).returning()
  proveedorId = prov.id

  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId
})

async function limpiarIncidentePorCodigo(codigo: string) {
  const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  if (prev) {
    await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
    await db.delete(schema.incidentes).where(eq(schema.incidentes.id, prev.id))
  }
}

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
    proveedorId, ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
  }).returning()
  return t.id
}

describe('GET /api/proveedores/[id]/tienda/[tiendaId] — impactoEstimado segmentado (Fase 5, Paso 3)', () => {
  it('cobertura parcial → cobra las horas descubiertas, ya no da 0 como daba ieiSum', async () => {
    const tiendaId = await crearTiendaAislada('T-PROVTIENDA-PARCIAL')
    await limpiarIncidentePorCodigo('TST-PROVTIENDA-PARCIAL')
    const horaRegistro = new Date(LUNES_10AM_LIMA)
    const horaFin = new Date(horasDespues(LUNES_10AM_LIMA, 4))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-PROVTIENDA-PARCIAL', tiendaId, registradoPorId, proveedorId,
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

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/proveedores/${proveedorId}/tienda/${tiendaId}`)
    const res = await GET(req, { params: Promise.resolve({ id: proveedorId, tiendaId }) })
    const data = await res.json()

    expect(data.metricas.impactoEstimado).toBe(esperado)
    expect(data.metricas.impactoEstimado).toBeGreaterThan(0)
  })

  it('con tramos: suma correctamente aunque el incidente no tenga campos legacy', async () => {
    const tiendaId = await crearTiendaAislada('T-PROVTIENDA-TRAMO')
    await limpiarIncidentePorCodigo('TST-PROVTIENDA-TRAMO')
    const horaRegistro = new Date(LUNES_10AM_LIMA)
    const horaFin = new Date(horasDespues(LUNES_10AM_LIMA, 2))
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-PROVTIENDA-TRAMO', tiendaId, registradoPorId, proveedorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro, horaFin, mttrMinutos: 120,
    }).returning()
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: horaRegistro, hasta: horaFin, ieTramo: '35.00',
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/proveedores/${proveedorId}/tienda/${tiendaId}`)
    const res = await GET(req, { params: Promise.resolve({ id: proveedorId, tiendaId }) })
    const data = await res.json()

    expect(data.metricas.impactoEstimado).toBe(35)
  })
})
