import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import { calcImpactoRow } from '@/lib/impacto-calc'

// Fase 5, Paso 3 — panel IEI 30d del detalle de proveedor. Este endpoint ya
// usaba calcImpactoRow (segmentado), así que el número no cambia para
// incidentes legacy — la novedad es que ahora también soporta tramos.

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE' } }),
}))

const LUNES_10AM_LIMA = new Date().toISOString().slice(0, 10) + 'T15:00:00.000Z' // hoy, para caer en la ventana de 30d
function horasDespues(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3600000).toISOString()
}

const CODIGO_PROVEEDOR = 'PROV-TEST-DETALLE-IEI'
const CODIGO_TIENDA    = 'T-PROVDETALLE-IEI'
let proveedorId: string
let tiendaId: string
let registradoPorId: string

beforeAll(async () => {
  let [prov] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, CODIGO_PROVEEDOR))
  if (!prov) [prov] = await db.insert(schema.proveedores).values({ nombre: CODIGO_PROVEEDOR }).returning()
  proveedorId = prov.id

  let [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, CODIGO_TIENDA))
  if (!tienda) {
    [tienda] = await db.insert(schema.tiendas).values({
      codigo: CODIGO_TIENDA, nombreCc: 'Tienda — detalle proveedor IEI', distrito: 'Test', cluster: 'B',
      proveedorId, ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()
  }
  tiendaId = tienda.id

  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId
})

async function limpiar(codigo: string) {
  const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  if (prev) await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
}

describe('GET /api/proveedores/[id] — IEI 30d (Fase 5, Paso 3)', () => {
  it('legacy: iei30d coincide con calcImpactoRow (sin cambios, ya era segmentado)', async () => {
    await limpiar('TST-PROVDETALLE-LEGACY')
    const horaRegistro = new Date(LUNES_10AM_LIMA)
    const horaFin = new Date(horasDespues(LUNES_10AM_LIMA, 2))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-PROVDETALLE-LEGACY', tiendaId, registradoPorId, proveedorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro, horaFin, mttrMinutos: 120,
      contActivadoPor: 'AGENTE', contHoraActivacion: horaRegistro, contHoraDesactivacion: horaFin, contRendimiento: 'PARCIAL',
    })

    const esperado = calcImpactoRow({
      hora_registro: horaRegistro, hora_fin: horaFin, estado: 'RESUELTO', tipo: 'CAIDA_TOTAL',
      venta_hora_soles: 100, venta_hora_fds_soles: 150,
      cont_hora_activacion: horaRegistro, cont_hora_desactivacion: horaFin, cont_rendimiento: 'PARCIAL',
    }).impactoEstimado

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/proveedores/${proveedorId}`)
    const res = await GET(req, { params: Promise.resolve({ id: proveedorId }) })
    const data = await res.json()

    expect(data.metricas.iei30d).toBeGreaterThanOrEqual(esperado) // puede compartir ventana con otros fixtures del mismo proveedor
    const entry = data.metricas.iei30dBreakdown.find((b: any) => b.tiendaCodigo === CODIGO_TIENDA)
    expect(entry, 'la tienda debe estar en el breakdown').toBeTruthy()
    expect(entry.ieiTotal).toBe(esperado)
  })

  it('con tramos: un tramo EFECTIVO cerrado → aporta 0 al iei30d, no rompe nada', async () => {
    await limpiar('TST-PROVDETALLE-TRAMO')
    const horaRegistro = new Date(LUNES_10AM_LIMA)
    const horaFin = new Date(horasDespues(LUNES_10AM_LIMA, 2))
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-PROVDETALLE-TRAMO', tiendaId, registradoPorId, proveedorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro, horaFin, mttrMinutos: 120,
    }).returning()
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'ROUTER_PROPIO', factor: '0.0000', desde: horaRegistro, hasta: horaFin, ieTramo: '0.00',
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/proveedores/${proveedorId}`)
    const res = await GET(req, { params: Promise.resolve({ id: proveedorId }) })
    const data = await res.json()

    const entry = data.metricas.iei30dBreakdown.find((b: any) => b.tiendaCodigo === CODIGO_TIENDA)
    const incEntry = entry?.incidentes.find((i: any) => i.codigo === 'TST-PROVDETALLE-TRAMO')
    expect(incEntry, 'el incidente con tramo debe aparecer en el breakdown de la tienda').toBeTruthy()
    expect(incEntry.iei).toBe(0)
  })
})
