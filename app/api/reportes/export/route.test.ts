import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import { calcImpactoRow } from '@/lib/impacto-calc'

// Fase 5, Paso 3 — CSV operativo. El IEI ya usaba calcImpactoRow (segmentado),
// así que calcIeiIncidente no le cambia el número a incidentes legacy — solo
// cambia de dónde saca los datos (tramos si los hay). Lo que SÍ cambia de
// comportamiento: tipo_contingencia / contingencia_rendimiento pasan de "un
// solo valor por precedencia" a "todos los tipos que tuvo el incidente,
// separados por coma" (decisión de Diego).

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'SUPERVISOR' } }),
}))

let registradoPorId: string
let tiendaId: string

function parseCsvLine(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else cur += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { cols.push(cur); cur = '' }
      else cur += c
    }
  }
  cols.push(cur)
  return cols
}

function parseCsv(csv: string): string[][] {
  return csv.replace(/^﻿/, '').split('\r\n').filter(l => l.length > 0).map(parseCsvLine)
}

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-EXPORT-OPERATIVO'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-EXPORT-OPERATIVO', nombreCc: 'Tienda — export operativo tramos', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()
  }
  tiendaId = t.id
})

const LUNES_10AM_LIMA = '2024-01-08T15:00:00.000Z'
function horasDespues(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3600000).toISOString()
}

async function limpiar(codigo: string) {
  const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  if (prev) await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
}

describe('GET /api/reportes/export (CSV operativo) — IEI y contingencia (Fase 5, Paso 3)', () => {
  it('IEI de un incidente legacy con router EFECTIVO cubriendo todo → mismo número que calcImpactoRow (sin cambios, ya era segmentado)', async () => {
    await limpiar('TST-EXPORT-ROUTER-FULL')
    const horaRegistro = new Date(LUNES_10AM_LIMA)
    const horaFin = new Date(horasDespues(LUNES_10AM_LIMA, 2))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-EXPORT-ROUTER-FULL', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro, horaFin, mttrMinutos: 120,
      contActivadoPor: 'AGENTE', contHoraActivacion: horaRegistro, contHoraDesactivacion: horaFin, contRendimiento: 'EFECTIVO', contEsExterno: false,
    })

    const esperado = calcImpactoRow({
      hora_registro: horaRegistro, hora_fin: horaFin, estado: 'RESUELTO', tipo: 'CAIDA_TOTAL',
      venta_hora_soles: 100, venta_hora_fds_soles: 150,
      cont_hora_activacion: horaRegistro, cont_hora_desactivacion: horaFin, cont_rendimiento: 'EFECTIVO',
    }).impactoEstimado

    const { GET } = await import('./route')
    const req = new NextRequest('http://localhost/api/reportes/export?desde=2024-01-08&hasta=2024-01-08')
    const res = await GET(req)
    const csv = await res.text()
    const rows = parseCsv(csv)
    const headerIdx = rows[0].indexOf('IEI (S/)')
    const codigoIdx = rows[0].indexOf('Código')
    const fila = rows.find(r => r[codigoIdx] === 'TST-EXPORT-ROUTER-FULL')

    expect(fila, 'fila debe existir en el CSV').toBeTruthy()
    expect(Number(fila![headerIdx])).toBe(esperado)
  })

  it('tipo/rendimiento de contingencia: un solo tipo sigue mostrándose igual que antes (sin coma)', async () => {
    await limpiar('TST-EXPORT-ROUTER-SOLO')
    const horaRegistro = new Date(LUNES_10AM_LIMA)
    const horaFin = new Date(horasDespues(LUNES_10AM_LIMA, 2))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-EXPORT-ROUTER-SOLO', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro, horaFin, mttrMinutos: 120,
      contActivadoPor: 'AGENTE', contHoraActivacion: horaRegistro, contHoraDesactivacion: horaFin, contRendimiento: 'PARCIAL', contEsExterno: false,
    })

    const { GET } = await import('./route')
    const req = new NextRequest('http://localhost/api/reportes/export?desde=2024-01-08&hasta=2024-01-08')
    const res = await GET(req)
    const csv = await res.text()
    const rows = parseCsv(csv)
    const tipoIdx = rows[0].indexOf('Tipo Contingencia')
    const rendIdx = rows[0].indexOf('Rendimiento Contingencia')
    const codigoIdx = rows[0].indexOf('Código')
    const fila = rows.find(r => r[codigoIdx] === 'TST-EXPORT-ROUTER-SOLO')

    expect(fila![tipoIdx]).toBe('Router Propio')
    expect(fila![rendIdx]).toBe('PARCIAL')
  })

  it('tipo/rendimiento de contingencia: dos tipos en el mismo incidente → separados por coma, en orden cronológico', async () => {
    await limpiar('TST-EXPORT-DOS-TIPOS')
    const horaRegistro = new Date(LUNES_10AM_LIMA)
    const horaFin = new Date(horasDespues(LUNES_10AM_LIMA, 4))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-EXPORT-DOS-TIPOS', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', evaluableProveedor: true,
      horaRegistro, horaFin, mttrMinutos: 240,
      contActivadoPor: 'AGENTE', contHoraActivacion: horaRegistro, contHoraDesactivacion: new Date(horasDespues(LUNES_10AM_LIMA, 2)), contRendimiento: 'PARCIAL', contEsExterno: false,
      movActivadoPor: 'AGENTE', movHoraActivacion: new Date(horasDespues(LUNES_10AM_LIMA, 2)), movHoraDesactivacion: horaFin, movRendimiento: 'EFECTIVO',
    })

    const { GET } = await import('./route')
    const req = new NextRequest('http://localhost/api/reportes/export?desde=2024-01-08&hasta=2024-01-08')
    const res = await GET(req)
    const csv = await res.text()
    const rows = parseCsv(csv)
    const tipoIdx = rows[0].indexOf('Tipo Contingencia')
    const rendIdx = rows[0].indexOf('Rendimiento Contingencia')
    const codigoIdx = rows[0].indexOf('Código')
    const fila = rows.find(r => r[codigoIdx] === 'TST-EXPORT-DOS-TIPOS')

    expect(fila![tipoIdx]).toBe('Router Propio, Datos Móviles')
    expect(fila![rendIdx]).toBe('PARCIAL, EFECTIVO')
  })
})
