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
