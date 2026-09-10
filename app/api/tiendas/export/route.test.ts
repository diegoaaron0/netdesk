import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

const CODIGO_ACTIVA = 'T-EXPORT-ACTIVA-01'
const CODIGO_ARCHIVADA = 'T-EXPORT-ARCHIVADA-01'

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  let [a] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, CODIGO_ACTIVA))
  if (!a) await db.insert(schema.tiendas).values({ codigo: CODIGO_ACTIVA, nombreCc: 'Export activa', distrito: 'Test', cluster: 'B' })
  else await db.update(schema.tiendas).set({ estado: 'ACTIVA', archivadaEn: null } as any).where(eq(schema.tiendas.id, a.id))

  let [b] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, CODIGO_ARCHIVADA))
  if (!b) {
    await db.insert(schema.tiendas).values({
      codigo: CODIGO_ARCHIVADA, nombreCc: 'Export archivada', distrito: 'Test', cluster: 'B',
      estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Cierre de prueba',
    })
  } else {
    await db.update(schema.tiendas).set({ estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Cierre de prueba' } as any).where(eq(schema.tiendas.id, b.id))
  }
})

describe('GET /api/tiendas/export — visibilidad de estado', () => {
  it('por defecto solo exporta tiendas ACTIVA, y siempre incluye la columna Estado', async () => {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/tiendas/export'))
    const text = await res.text()

    expect(text).toContain('Estado')
    expect(text).toContain(CODIGO_ACTIVA)
    expect(text).not.toContain(CODIGO_ARCHIVADA)
  })

  it('estado=ARCHIVADA exporta solo las archivadas', async () => {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/tiendas/export?estado=ARCHIVADA'))
    const text = await res.text()

    expect(text).not.toContain(CODIGO_ACTIVA)
    expect(text).toContain(CODIGO_ARCHIVADA)
  })

  it('estado=TODAS exporta ambas, con el valor correcto en la columna Estado (no solo por coincidencia del código)', async () => {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/tiendas/export?estado=TODAS'))
    const text = await res.text().then(t => t.replace(/^﻿/, ''))
    const [headerLine, ...dataLines] = text.split(/\r\n/)
    const headers = headerLine.split(',')
    const estadoIdx = headers.indexOf('Estado')
    expect(estadoIdx).toBeGreaterThanOrEqual(0)

    const lineaActiva = dataLines.find(l => l.startsWith(CODIGO_ACTIVA + ','))
    const lineaArchivada = dataLines.find(l => l.startsWith(CODIGO_ARCHIVADA + ','))
    expect(lineaActiva?.split(',')[estadoIdx]).toBe('ACTIVA')
    expect(lineaArchivada?.split(',')[estadoIdx]).toBe('ARCHIVADA')
  })
})

describe('GET /api/tiendas/export — columnas de incidentes e IEI del período', () => {
  const CON_VENTA = 'T-EXPORT-IEI-01'
  const SIN_VENTA = 'T-EXPORT-SINVENTA-01'

  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, CON_VENTA))
    if (!t) {
      [t] = await db.insert(schema.tiendas).values({
        codigo: CON_VENTA, nombreCc: 'Export IEI', distrito: 'Test', cluster: 'B',
        ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
      }).returning()
    } else {
      await db.update(schema.tiendas)
        .set({ estado: 'ACTIVA', ventaHoraSoles: '100', ventaHoraFdsSoles: '150', cluster: 'B' } as any)
        .where(eq(schema.tiendas.id, t.id))
    }

    let [s] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, SIN_VENTA))
    if (!s) await db.insert(schema.tiendas).values({ codigo: SIN_VENTA, nombreCc: 'Export sin venta', distrito: 'Test' })
    else await db.update(schema.tiendas)
      .set({ estado: 'ACTIVA', ventaHoraSoles: null, ventaHoraFdsSoles: null, cluster: null } as any)
      .where(eq(schema.tiendas.id, s.id))

    // Registrador propio, no `usuarios.limit(1)`: ese primer usuario es
    // arbitrario y puede ser un fixture de otra suite, que después no puede
    // borrarlo porque este incidente lo referencia (FK) y la suite entera falla.
    const EMAIL_REG = 'export-iei-fixture@netdesk-test.local'
    let [reg] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, EMAIL_REG))
    if (!reg) {
      [reg] = await db.insert(schema.usuarios).values({
        nombre: 'Fixture export IEI', email: EMAIL_REG, password: 'x', rol: 'AGENTE',
      }).returning()
    }

    const COD_INC = 'TST-EXPORT-IEI-RECIENTE'
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, COD_INC))
    const inicio = new Date(Date.now() - 3 * 24 * 3600000)
    await db.insert(schema.incidentes).values({
      codigo: COD_INC, tiendaId: t.id,
      registradoPorId: reg.id,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      horaRegistro: inicio, horaFin: new Date(inicio.getTime() + 2 * 3600000), mttrMinutos: 120,
    })
  })

  /** Las dos columnas nuevas son las últimas: tomarlas desde el final evita que
   *  un campo con comas (que va entrecomillado) corra los índices. */
  async function ultimasDosColumnas(qs: string, codigo: string) {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest(`http://localhost/api/tiendas/export${qs}`))
    const text = await res.text().then(t => t.replace(/^﻿/, ''))
    const [headerLine, ...dataLines] = text.split(/\r\n/)
    const linea = dataLines.find(l => l.startsWith(codigo + ','))
    const [incidentes, iei] = (linea ?? '').split(',').slice(-2)
    return { headers: headerLine.split(','), incidentes, iei }
  }

  it('el CSV trae las dos columnas nuevas al final, con el conteo y el IEI del período', async () => {
    const { headers, incidentes, iei } = await ultimasDosColumnas('', CON_VENTA)
    expect(headers.slice(-2)).toEqual(['Incidentes (período)', 'IEI período (S/.)'])
    expect(incidentes).toBe('1')
    expect(Number(iei)).toBeGreaterThan(0)
  })

  it('respeta ?desde=&hasta= igual que el listado', async () => {
    const { incidentes, iei } = await ultimasDosColumnas('?desde=2020-01-01&hasta=2020-01-31', CON_VENTA)
    expect(incidentes).toBe('0')
    expect(iei).toBe('0')
  })

  it('una tienda sin venta configurada deja la celda de IEI vacía, no en 0', async () => {
    const { iei } = await ultimasDosColumnas('', SIN_VENTA)
    expect(iei).toBe('')
  })
})
