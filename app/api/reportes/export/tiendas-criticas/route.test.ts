import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import { calcImpactoRow } from '@/lib/impacto-calc'

// Fase 5, Paso 3 — CSV tiendas críticas. IEI acumulado por tienda pasa de
// ieiPerRow (SQL, un solo factor sobre todo el mttr) a calcIeiIncidente
// (segmentado). Requiere >=2 incidentes por tienda en el período (HAVING).

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'SUPERVISOR' } }),
}))

const LUNES_10AM_LIMA = '2024-01-08T15:00:00.000Z'
function horasDespues(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3600000).toISOString()
}

let registradoPorId: string
let tiendaId: string

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

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-EXPORT-TIENDACRITICA'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-EXPORT-TIENDACRITICA', nombreCc: 'Tienda — criticas tramos', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()
  }
  tiendaId = t.id

  for (const codigo of ['TST-CRITICA-01', 'TST-CRITICA-02']) {
    const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
    if (prev) await db.delete(schema.incidentes).where(eq(schema.incidentes.id, prev.id))
  }

  const horaRegistro1 = new Date(LUNES_10AM_LIMA)
  const horaFin1 = new Date(horasDespues(LUNES_10AM_LIMA, 4))
  await db.insert(schema.incidentes).values({
    codigo: 'TST-CRITICA-01', tiendaId, registradoPorId,
    nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
    horaRegistro: horaRegistro1, horaFin: horaFin1, mttrMinutos: 240,
    contActivadoPor: 'AGENTE', contHoraActivacion: new Date(horasDespues(LUNES_10AM_LIMA, 1)),
    contHoraDesactivacion: new Date(horasDespues(LUNES_10AM_LIMA, 3)), contRendimiento: 'EFECTIVO', contEsExterno: false,
  })

  const horaRegistro2 = new Date(horasDespues(LUNES_10AM_LIMA, 6))
  const horaFin2 = new Date(horasDespues(LUNES_10AM_LIMA, 7))
  await db.insert(schema.incidentes).values({
    codigo: 'TST-CRITICA-02', tiendaId, registradoPorId,
    nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
    horaRegistro: horaRegistro2, horaFin: horaFin2, mttrMinutos: 60,
  })
})

describe('GET /api/reportes/export/tiendas-criticas — IEI acumulado segmentado (Fase 5, Paso 3)', () => {
  it('el IEI acumulado de la tienda coincide con la suma segmentada (calcImpactoRow) de sus 2 incidentes, no con ieiPerRow', async () => {
    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tiendaId))

    const iei1 = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA, hora_fin: horasDespues(LUNES_10AM_LIMA, 4),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL',
      venta_hora_soles: tienda.ventaHoraSoles, venta_hora_fds_soles: tienda.ventaHoraFdsSoles,
      cont_hora_activacion: horasDespues(LUNES_10AM_LIMA, 1), cont_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 3),
      cont_rendimiento: 'EFECTIVO',
    }).impactoEstimado
    const iei2 = calcImpactoRow({
      hora_registro: horasDespues(LUNES_10AM_LIMA, 6), hora_fin: horasDespues(LUNES_10AM_LIMA, 7),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL',
      venta_hora_soles: tienda.ventaHoraSoles, venta_hora_fds_soles: tienda.ventaHoraFdsSoles,
    }).impactoEstimado
    const esperado = Math.round(iei1) + Math.round(iei2)

    const { GET } = await import('./route')
    const req = new Request('http://localhost/api/reportes/export/tiendas-criticas?desde=2024-01-08&hasta=2024-01-08')
    const res = await GET(req)
    const csv = await res.text()
    const rows = parseCsv(csv)
    const codigoIdx = rows[0].indexOf('Código')
    const ieiIdx = rows[0].indexOf('IEI acumulado (S/)')
    const fila = rows.find(r => r[codigoIdx] === 'T-EXPORT-TIENDACRITICA')

    expect(fila, 'la tienda debe aparecer (>=2 incidentes en el período)').toBeTruthy()
    expect(Number(fila![ieiIdx])).toBe(esperado)
    expect(Number(fila![ieiIdx])).toBeGreaterThan(0)
  })
})
