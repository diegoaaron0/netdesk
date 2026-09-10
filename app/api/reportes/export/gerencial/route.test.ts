import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import { calcImpactoRow } from '@/lib/impacto-calc'
import { ieiPerRow } from '@/lib/report-sql'

// Fase 5, Paso 3 — CSV gerencial. Los 6 usos de ieiSum (totales, totales-ant,
// por-proveedor, top15, supervisores, clusters) pasan a calcIeiIncidente
// (segmentado). Se prueba con un incidente de cobertura parcial: si el CSV
// diera lo mismo que ieiSum (SQL viejo), la migración no se aplicó de verdad.

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
  return csv.replace(/^﻿/, '').split('\r\n').map(parseCsvLine)
}

const CODIGO_PROVEEDOR = 'PROV-TEST-GERENCIAL-IEI'
const CODIGO_TIENDA    = 'T-GERENCIAL-IEI'
let tiendaId: string

beforeAll(async () => {
  let [prov] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, CODIGO_PROVEEDOR))
  if (!prov) [prov] = await db.insert(schema.proveedores).values({ nombre: CODIGO_PROVEEDOR }).returning()

  let [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, CODIGO_TIENDA))
  if (!tienda) {
    [tienda] = await db.insert(schema.tiendas).values({
      codigo: CODIGO_TIENDA, nombreCc: 'Tienda — gerencial IEI', distrito: 'Test', cluster: 'B',
      proveedorId: prov.id, ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
      supervisorNombre: 'Supervisor Test Gerencial',
    }).returning()
  }
  tiendaId = tienda.id

  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))

  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-GERENCIAL-PARCIAL'))
  await db.insert(schema.incidentes).values({
    codigo: 'TST-GERENCIAL-PARCIAL', tiendaId, registradoPorId: ref.registradoPorId, proveedorId: prov.id,
    nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
    horaRegistro: new Date(LUNES_10AM_LIMA), horaFin: new Date(horasDespues(LUNES_10AM_LIMA, 4)), mttrMinutos: 240,
    contActivadoPor: 'AGENTE', contHoraActivacion: new Date(horasDespues(LUNES_10AM_LIMA, 1)),
    contHoraDesactivacion: new Date(horasDespues(LUNES_10AM_LIMA, 3)), contRendimiento: 'EFECTIVO', contEsExterno: false,
  })
})

describe('GET /api/reportes/export/gerencial — IEI segmentado en las 5 secciones que lo usan (Fase 5, Paso 3)', () => {
  it('el IEI ya no coincide con ieiSum (SQL viejo) — la migración corrigió el número, no lo dejó igual', async () => {
    const [incRow] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-GERENCIAL-PARCIAL'))
    const [{ iei: ieiViejo }] = await db.execute<{ iei: number }>(sql`
      SELECT ROUND((${sql.raw(ieiPerRow())}))::int AS iei
      FROM incidentes i JOIN tiendas t ON i.tienda_id = t.id
      WHERE i.id = ${incRow.id}
    `)
    const esperado = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA, hora_fin: horasDespues(LUNES_10AM_LIMA, 4),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL', venta_hora_soles: 100, venta_hora_fds_soles: 150,
      cont_hora_activacion: horasDespues(LUNES_10AM_LIMA, 1), cont_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 3),
      cont_rendimiento: 'EFECTIVO',
    }).impactoEstimado

    expect(esperado).not.toBe(ieiViejo) // confirma que el caso de prueba SÍ ejercita la divergencia
    expect(esperado).toBeGreaterThan(0)

    const { GET } = await import('./route')
    const req = new Request('http://localhost/api/reportes/export/gerencial?desde=2024-01-08&hasta=2024-01-08')
    const res = await GET(req)
    const csv = await res.text()
    const rows = parseCsv(csv)

    // Sección 2: por proveedor
    const provHeaderIdx = rows.findIndex(r => r[0] === 'Proveedor' && r[1] === 'Incidentes')
    const provIeiIdx = rows[provHeaderIdx].indexOf('IEI est (S/)')
    const filaProv = rows.find(r => r[0] === CODIGO_PROVEEDOR)
    expect(filaProv, 'proveedor debe estar en sección 2').toBeTruthy()
    expect(Number(filaProv![provIeiIdx])).toBe(esperado)

    // Sección 3: top 15 tiendas
    const top15HeaderIdx = rows.findIndex(r => r[0] === '#' && r[1] === 'Código')
    const top15IeiIdx = rows[top15HeaderIdx].indexOf('IEI est (S/)')
    const filaTienda = rows.find(r => r[1] === CODIGO_TIENDA)
    expect(filaTienda, 'tienda debe estar en top15').toBeTruthy()
    expect(Number(filaTienda![top15IeiIdx])).toBe(esperado)

    // Sección 9: supervisores
    const supHeaderIdx = rows.findIndex(r => r[0] === 'Supervisor')
    const supIeiIdx = rows[supHeaderIdx].indexOf('IEI total est (S/)')
    const filaSup = rows.find(r => r[0] === 'Supervisor Test Gerencial')
    expect(filaSup, 'supervisor debe estar en sección 9').toBeTruthy()
    expect(Number(filaSup![supIeiIdx])).toBe(esperado)

    // Sección 10: clusters (cluster B — puede compartir con otros fixtures, así que solo verificamos que sea >= esperado)
    const clusterHeaderIdx = rows.findIndex(r => r[0] === 'Cluster')
    const clusterIeiIdx = rows[clusterHeaderIdx].indexOf('IEI total est (S/)')
    const filaCluster = rows.find(r => r[0] === 'B')
    expect(filaCluster, 'cluster B debe aparecer').toBeTruthy()
    expect(Number(filaCluster![clusterIeiIdx])).toBeGreaterThanOrEqual(esperado)

    // Sección 1: resumen ejecutivo (total del período) — al menos tan grande como este incidente
    const resumenHeaderIdx = rows.findIndex(r => r[0] === 'Métrica')
    const filaIeiTotal = rows.find(r => r[0] === 'Impacto económico estimado (IEI)')
    expect(filaIeiTotal, 'fila de IEI total debe existir').toBeTruthy()
    const totalTexto = filaIeiTotal![1] // "S/ 1,234"
    const totalNum = Number(totalTexto.replace(/[^0-9.-]/g, ''))
    expect(totalNum).toBeGreaterThanOrEqual(esperado)
  })
})
