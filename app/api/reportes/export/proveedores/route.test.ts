import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import { calcImpactoRow } from '@/lib/impacto-calc'

// Fase 5, Paso 3 — CSV evaluación de proveedores. IEI (resumen por proveedor Y
// detalle por tienda) pasa de ieiSum (SQL, un solo factor sobre todo el mttr)
// a calcIeiIncidente (segmentado).

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'SUPERVISOR' } }),
}))

const LUNES_10AM_LIMA = '2024-01-08T15:00:00.000Z'
function horasDespues(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3600000).toISOString()
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = []; let cur = ''; let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') inQuotes = false; else cur += c }
    else { if (c === '"') inQuotes = true; else if (c === ',') { cols.push(cur); cur = '' } else cur += c }
  }
  cols.push(cur); return cols
}
function parseCsv(csv: string): string[][] {
  return csv.replace(/^﻿/, '').split('\r\n').filter(l => l.length > 0).map(parseCsvLine)
}

describe('GET /api/reportes/export/proveedores — IEI segmentado, resumen y detalle (Fase 5, Paso 3)', () => {
  const CODIGO_PROVEEDOR = 'PROV-TEST-EXPORT-IEI'
  const CODIGO_TIENDA    = 'T-EXPORT-PROV-IEI'

  beforeAll(async () => {
    let [prov] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, CODIGO_PROVEEDOR))
    if (!prov) [prov] = await db.insert(schema.proveedores).values({ nombre: CODIGO_PROVEEDOR }).returning()

    let [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, CODIGO_TIENDA))
    if (!tienda) {
      [tienda] = await db.insert(schema.tiendas).values({
        codigo: CODIGO_TIENDA, nombreCc: 'Tienda — export proveedores IEI', distrito: 'Test', cluster: 'B',
        proveedorId: prov.id, ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
      }).returning()
    }

    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))

    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-EXPORTPROV-PARCIAL'))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-EXPORTPROV-PARCIAL', tiendaId: tienda.id, registradoPorId: ref.registradoPorId, proveedorId: prov.id,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro: new Date(LUNES_10AM_LIMA), horaFin: new Date(horasDespues(LUNES_10AM_LIMA, 4)), mttrMinutos: 240,
      contActivadoPor: 'AGENTE', contHoraActivacion: new Date(horasDespues(LUNES_10AM_LIMA, 1)),
      contHoraDesactivacion: new Date(horasDespues(LUNES_10AM_LIMA, 3)), contRendimiento: 'EFECTIVO', contEsExterno: false,
    })
  })

  it('sección resumen: IEI del proveedor coincide con calcImpactoRow segmentado', async () => {
    const esperado = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA, hora_fin: horasDespues(LUNES_10AM_LIMA, 4),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL', venta_hora_soles: 100, venta_hora_fds_soles: 150,
      cont_hora_activacion: horasDespues(LUNES_10AM_LIMA, 1), cont_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 3),
      cont_rendimiento: 'EFECTIVO',
    }).impactoEstimado

    const { GET } = await import('./route')
    const req = new Request('http://localhost/api/reportes/export/proveedores?desde=2024-01-08&hasta=2024-01-08')
    const res = await GET(req)
    const csv = await res.text()
    const rows = parseCsv(csv)
    const headerResumenIdx = rows.findIndex(r => r[0] === 'Proveedor' && r[1] === 'Total incidentes')
    const ieiIdx = rows[headerResumenIdx].indexOf('IEI est (S/)')
    const fila = rows.find(r => r[0] === CODIGO_PROVEEDOR)

    expect(fila, 'proveedor debe aparecer en el resumen').toBeTruthy()
    expect(Number(fila![ieiIdx])).toBe(esperado)
    expect(Number(fila![ieiIdx])).toBeGreaterThan(0)
  })

  it('sección detalle por tienda: IEI coincide con el mismo cálculo segmentado', async () => {
    const esperado = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA, hora_fin: horasDespues(LUNES_10AM_LIMA, 4),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL', venta_hora_soles: 100, venta_hora_fds_soles: 150,
      cont_hora_activacion: horasDespues(LUNES_10AM_LIMA, 1), cont_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 3),
      cont_rendimiento: 'EFECTIVO',
    }).impactoEstimado

    const { GET } = await import('./route')
    const req = new Request('http://localhost/api/reportes/export/proveedores?desde=2024-01-08&hasta=2024-01-08')
    const res = await GET(req)
    const csv = await res.text()
    const rows = parseCsv(csv)
    const headerDetalleIdx = rows.findIndex(r => r[0] === 'Proveedor' && r[1] === 'Código tienda')
    const ieiIdx = rows[headerDetalleIdx].indexOf('IEI est (S/)')
    const codigoTiendaIdx = rows[headerDetalleIdx].indexOf('Código tienda')
    const fila = rows.find(r => r[codigoTiendaIdx] === CODIGO_TIENDA)

    expect(fila, 'la tienda debe aparecer en el detalle').toBeTruthy()
    expect(Number(fila![ieiIdx])).toBe(esperado)
  })
})
