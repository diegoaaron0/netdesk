import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'SUPERVISOR' } }),
}))

let tiendaActivaId: string
let tiendaArchivadaId: string
const FECHA_BAJA = '2026-01-15T12:00:00.000Z'

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  let [a] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-LISTA-ACTIVA-01'))
  if (!a) {
    [a] = await db.insert(schema.tiendas).values({
      codigo: 'T-LISTA-ACTIVA-01', nombreCc: 'Tienda activa — filtro lista', distrito: 'Test', cluster: 'B',
    }).returning()
  } else {
    await db.update(schema.tiendas).set({ estado: 'ACTIVA', archivadaEn: null } as any).where(eq(schema.tiendas.id, a.id))
  }
  tiendaActivaId = a.id

  let [b] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-LISTA-ARCHIVADA-01'))
  if (!b) {
    [b] = await db.insert(schema.tiendas).values({
      codigo: 'T-LISTA-ARCHIVADA-01', nombreCc: 'Tienda archivada — filtro lista', distrito: 'Test', cluster: 'B',
      estado: 'ARCHIVADA', archivadaEn: new Date(FECHA_BAJA), archivadaMotivo: 'Cierre de prueba',
    }).returning()
  } else {
    await db.update(schema.tiendas).set({ estado: 'ARCHIVADA', archivadaEn: new Date(FECHA_BAJA), archivadaMotivo: 'Cierre de prueba' } as any).where(eq(schema.tiendas.id, b.id))
  }
  tiendaArchivadaId = b.id
})

describe('GET /api/tiendas — filtro por estado (ACTIVA por defecto, excluye ARCHIVADA)', () => {
  it('sin parámetro estado: incluye la tienda ACTIVA, excluye la ARCHIVADA', async () => {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/tiendas'))
    const data = await res.json()

    expect(data.some((t: any) => t.id === tiendaActivaId)).toBe(true)
    expect(data.some((t: any) => t.id === tiendaArchivadaId)).toBe(false)
  })

  it('estado=ARCHIVADA: muestra solo la archivada, con archivadaEn visible', async () => {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/tiendas?estado=ARCHIVADA'))
    const data = await res.json()

    expect(data.some((t: any) => t.id === tiendaActivaId)).toBe(false)
    const archivada = data.find((t: any) => t.id === tiendaArchivadaId)
    expect(archivada).toBeTruthy()
    expect(archivada.archivadaEn).toBeTruthy()
  })

  it('estado=ARCHIVADA + archivadaDesde/archivadaHasta: filtra por fecha de baja', async () => {
    const { GET } = await import('./route')
    // Rango que SÍ cubre FECHA_BAJA (2026-01-15)
    const resDentro = await GET(new NextRequest('http://localhost/api/tiendas?estado=ARCHIVADA&archivadaDesde=2026-01-01&archivadaHasta=2026-01-31'))
    const dataDentro = await resDentro.json()
    expect(dataDentro.some((t: any) => t.id === tiendaArchivadaId)).toBe(true)

    // Rango que NO cubre FECHA_BAJA
    const resFuera = await GET(new NextRequest('http://localhost/api/tiendas?estado=ARCHIVADA&archivadaDesde=2026-03-01&archivadaHasta=2026-03-31'))
    const dataFuera = await resFuera.json()
    expect(dataFuera.some((t: any) => t.id === tiendaArchivadaId)).toBe(false)
  })

  it('estado=TODAS: incluye ambas', async () => {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/tiendas?estado=TODAS'))
    const data = await res.json()

    expect(data.some((t: any) => t.id === tiendaActivaId)).toBe(true)
    expect(data.some((t: any) => t.id === tiendaArchivadaId)).toBe(true)
  })
})
