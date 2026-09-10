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

describe('GET /api/tiendas — filtro por proveedor (opciones del desplegable)', () => {
  const PROV_A = 'FILTRO TEST PROV A'
  const PROV_B = 'FILTRO TEST PROV B'

  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    for (const [nombre, codigo] of [[PROV_A, 'T-FILTRO-A'], [PROV_B, 'T-FILTRO-B']] as [string, string][]) {
      let [p] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, nombre))
      if (!p) [p] = await db.insert(schema.proveedores).values({ nombre }).returning()

      let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, codigo))
      if (!t) {
        await db.insert(schema.tiendas).values({
          codigo, nombreCc: `Tienda ${codigo}`, distrito: 'Test', cluster: 'B', proveedorId: p.id,
        })
      } else {
        await db.update(schema.tiendas).set({ proveedorId: p.id, estado: 'ACTIVA' } as any)
          .where(eq(schema.tiendas.id, t.id))
      }
    }
  })

  async function listarPorProveedor(nombre: string) {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest(`http://localhost/api/tiendas?estado=ACTIVA&proveedor=${encodeURIComponent(nombre)}`))
    return res.json()
  }

  it('cada proveedor se puede filtrar de forma independiente — no hace falta resetear entre uno y otro', async () => {
    const soloA = await listarPorProveedor(PROV_A)
    expect(soloA.every((t: any) => t.proveedorNombre === PROV_A)).toBe(true)
    expect(soloA.some((t: any) => t.codigo === 'T-FILTRO-A')).toBe(true)

    // Sin limpiar nada en el medio: el filtro por otro proveedor debe funcionar igual.
    const soloB = await listarPorProveedor(PROV_B)
    expect(soloB.every((t: any) => t.proveedorNombre === PROV_B)).toBe(true)
    expect(soloB.some((t: any) => t.codigo === 'T-FILTRO-B')).toBe(true)
  })

  it('los nombres que ofrece /api/proveedores sirven como filtro de /api/tiendas', async () => {
    // El desplegable ahora se arma con /api/proveedores. Si esos nombres no
    // coincidieran con proveedorNombre de /api/tiendas, ofrecería opciones que
    // no filtran nada.
    const { GET: GETProv } = await import('../proveedores/route')
    const resProv = await GETProv(new NextRequest('http://localhost/api/proveedores'))
    const proveedores = await resProv.json()

    const nombres = proveedores.map((p: any) => p.nombre)
    expect(nombres).toContain(PROV_A)
    expect(nombres).toContain(PROV_B)

    const filtradas = await listarPorProveedor(PROV_A)
    expect(filtradas.length).toBeGreaterThan(0)
  })
})

describe('GET /api/tiendas — período e IEI por tienda', () => {
  const CODIGO = 'T-IEI-LISTA'
  let tiendaId: string

  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, CODIGO))
    if (!t) {
      [t] = await db.insert(schema.tiendas).values({
        codigo: CODIGO, nombreCc: 'Tienda IEI lista', distrito: 'Test', cluster: 'B',
        ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
      }).returning()
    } else {
      await db.update(schema.tiendas)
        .set({ estado: 'ACTIVA', ventaHoraSoles: '100', ventaHoraFdsSoles: '150', cluster: 'B' } as any)
        .where(eq(schema.tiendas.id, t.id))
    }
    tiendaId = t.id

    // Registrador propio, no `usuarios.limit(1)`: ese primer usuario es
    // arbitrario y puede ser un fixture de otra suite, que después no puede
    // borrarlo porque estos incidentes lo referencian (FK) y esa suite falla.
    const EMAIL_REG = 'iei-lista-fixture@netdesk-test.local'
    let [reg] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, EMAIL_REG))
    if (!reg) {
      [reg] = await db.insert(schema.usuarios).values({
        nombre: 'Fixture IEI lista', email: EMAIL_REG, password: 'x', rol: 'AGENTE',
      }).returning()
    }

    // Un incidente de hace 3 días (entra en 30 días) y otro de hace 200 (no).
    for (const [codigo, diasAtras] of [['TST-IEI-LISTA-RECIENTE', 3], ['TST-IEI-LISTA-VIEJO', 200]] as [string, number][]) {
      await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
      const inicio = new Date(Date.now() - diasAtras * 24 * 3600000)
      await db.insert(schema.incidentes).values({
        codigo, tiendaId, registradoPorId: reg.id,
        nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
        horaRegistro: inicio, horaFin: new Date(inicio.getTime() + 2 * 3600000), mttrMinutos: 120,
      })
    }
  })

  async function listar(qs = '') {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest(`http://localhost/api/tiendas?estado=ACTIVA${qs}`))
    const data = await res.json()
    return data.find((t: any) => t.codigo === CODIGO)
  }

  it('por defecto (30 días) cuenta solo los incidentes del período, no los históricos', async () => {
    const fila = await listar()
    expect(fila).toBeTruthy()
    expect(fila.incidentCount, 'el de hace 200 días queda fuera').toBe(1)
    expect(fila.ieiPeriodo).toBeGreaterThan(0)
  })

  it('un rango que abarca todo incluye también el incidente viejo', async () => {
    const hoy = new Date()
    const hace2Anios = new Date(Date.now() - 730 * 24 * 3600000)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const fila = await listar(`&desde=${fmt(hace2Anios)}&hasta=${fmt(hoy)}`)
    expect(fila.incidentCount).toBe(2)
  })

  it('un rango sin incidentes da 0 y IEI 0, no null', async () => {
    const fila = await listar('&desde=2020-01-01&hasta=2020-01-31')
    expect(fila.incidentCount).toBe(0)
    expect(fila.ieiPeriodo).toBe(0)
  })

  it('una tienda sin venta ni cluster devuelve ieiPeriodo null, para no confundirse con S/ 0', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const COD_SIN = 'T-IEI-SIN-VENTA'
    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, COD_SIN))
    if (!t) {
      await db.insert(schema.tiendas).values({ codigo: COD_SIN, nombreCc: 'Sin venta', distrito: 'Test' })
    } else {
      await db.update(schema.tiendas)
        .set({ estado: 'ACTIVA', ventaHoraSoles: null, ventaHoraFdsSoles: null, cluster: null } as any)
        .where(eq(schema.tiendas.id, t.id))
    }

    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/tiendas?estado=ACTIVA'))
    const data = await res.json()
    const fila = data.find((x: any) => x.codigo === COD_SIN)
    expect(fila).toBeTruthy()
    expect(fila.ieiPeriodo).toBeNull()
  })
})
