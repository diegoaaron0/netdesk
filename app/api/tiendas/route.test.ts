import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'SUPERVISOR' } }),
}))

let tiendaActivaId: string
let tiendaArchivadaId: string
let tiendaAutocompleteArchivadaId: string
const FECHA_BAJA = '2026-01-15T12:00:00.000Z'
const Q_AUTOCOMPLETE = 'AUTOCOMPLETEARCHIVADA'

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

  let [c] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, `T-${Q_AUTOCOMPLETE}-01`))
  if (!c) {
    [c] = await db.insert(schema.tiendas).values({
      codigo: `T-${Q_AUTOCOMPLETE}-01`, nombreCc: 'Tienda archivada — autocompletado', distrito: 'Test', cluster: 'B',
      estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Cierre de prueba',
    }).returning()
  } else {
    await db.update(schema.tiendas).set({ estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Cierre de prueba' } as any).where(eq(schema.tiendas.id, c.id))
  }
  tiendaAutocompleteArchivadaId = c.id
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

describe('GET /api/tiendas?q= — autocompletado (usado al crear un incidente)', () => {
  it('una tienda ARCHIVADA no aparece en los resultados de q=', async () => {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest(`http://localhost/api/tiendas?q=${Q_AUTOCOMPLETE}`))
    const data = await res.json()

    expect(data.some((t: any) => t.id === tiendaAutocompleteArchivadaId)).toBe(false)
  })
})

function reqConBody(body: Record<string, unknown>) {
  return { json: async () => body } as any
}

describe('POST /api/tiendas — permisos (mantenimiento.agregar, no rol crudo)', () => {
  it('INFRAESTRUCTURA puede crear (201) — tiene mantenimiento.agregar', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    await db.delete(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-POST-PERM-INFRA-01'))

    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'infra-test@netdesk-test.local', rol: 'INFRAESTRUCTURA' } } as any)
    const { POST } = await import('./route')

    const res = await POST(reqConBody({ codigo: 'T-POST-PERM-INFRA-01' }))
    expect(res.status).toBe(201)
  })

  it('AGENTE no puede crear (403) — no tiene mantenimiento.agregar', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE' } } as any)
    const { POST } = await import('./route')

    const res = await POST(reqConBody({ codigo: 'T-POST-PERM-AGENTE-01' }))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/tiendas — validación de código', () => {
  it('sin código → 400 con mensaje de negocio, no 500', async () => {
    const { POST } = await import('./route')
    const res = await POST(reqConBody({ nombreCc: 'Sin código' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/código.*requerido|requerido.*código/i)
  })

  it('código en blanco → 400', async () => {
    const { POST } = await import('./route')
    const res = await POST(reqConBody({ codigo: '   ' }))
    expect(res.status).toBe(400)
  })

  it('código ya existente → 400 con mensaje de negocio, no 500', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    await db.delete(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-POST-CODIGO-DUP'))
    await db.insert(schema.tiendas).values({ codigo: 'T-POST-CODIGO-DUP', nombreCc: 'Original', distrito: 'Test', cluster: 'B' })

    const { POST } = await import('./route')
    const res = await POST(reqConBody({ codigo: 'T-POST-CODIGO-DUP' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/ya existe/i)
  })
})
