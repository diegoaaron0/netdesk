import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

function postReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/gestion-cambios', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
function putReq(body: Record<string, unknown>) {
  return { json: async () => body } as any
}

let usuarioId: string
let tiendaId: string
let accionZonaId: string

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')
  const { auth } = await import('@/auth')

  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  usuarioId = ref.registradoPorId
  tiendaId = ref.tiendaId
  vi.mocked(auth).mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: usuarioId } } as any)

  // Acción ZONA preexistente, insertada directo en la BD (como si viniera de
  // antes de este cambio) — simula "el historial de acciones ZONA ya creadas"
  // para probar que listarla/verla en detalle sigue funcionando igual.
  await db.delete(schema.accionesGestion).where(eq(schema.accionesGestion.codigo, 'AC-ZONA-TEST-01'))
  const [accion] = await db.insert(schema.accionesGestion).values({
    codigo: 'AC-ZONA-TEST-01', tipo: 'RENOVACION_CONTRATO', estado: 'BORRADOR', alcance: 'ZONA',
    titulo: 'Zona de prueba preexistente', motivo: 'Motivo de prueba', zonaDescripcion: 'Lima Norte (test)',
    creadoPorId: usuarioId,
  }).returning()
  accionZonaId = accion.id

  await db.delete(schema.accionesGestionTiendas).where(eq(schema.accionesGestionTiendas.accionId, accionZonaId))
  await db.insert(schema.accionesGestionTiendas).values({ accionId: accionZonaId, tiendaId })
})

describe('POST /api/gestion-cambios — alcance ZONA deshabilitado temporalmente', () => {
  it('rechaza con 400 y el mensaje esperado, no crea la acción', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { POST } = await import('./route')

    const res = await POST(postReq({
      tipo: 'RENOVACION_CONTRATO', titulo: 'Intento de zona', motivo: 'test', alcance: 'ZONA',
      zonaDescripcion: 'Zona X', tiendaIds: [tiendaId],
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Alcance por zona no disponible temporalmente.')

    const [existe] = await db.select().from(schema.accionesGestion).where(eq(schema.accionesGestion.titulo, 'Intento de zona'))
    expect(existe).toBeUndefined()
  })

  it('alcance TIENDA sigue funcionando normalmente (el bloqueo es solo para ZONA)', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { POST } = await import('./route')

    await db.delete(schema.accionesGestion).where(eq(schema.accionesGestion.titulo, 'Acción tienda normal (test)'))
    const res = await POST(postReq({
      tipo: 'RENOVACION_CONTRATO', titulo: 'Acción tienda normal (test)', motivo: 'test', alcance: 'TIENDA', tiendaId,
    }))
    expect(res.status).toBe(201)
  })
})

describe('PUT /api/gestion-cambios/[id] — tampoco permite cambiar un borrador a alcance ZONA', () => {
  it('rechaza con 400 el intento de editar un borrador TIENDA para volverlo ZONA', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { PUT } = await import('./[id]/route')

    await db.delete(schema.accionesGestion).where(eq(schema.accionesGestion.codigo, 'AC-ZONA-PUT-TEST-01'))
    const [borrador] = await db.insert(schema.accionesGestion).values({
      codigo: 'AC-ZONA-PUT-TEST-01', tipo: 'RENOVACION_CONTRATO', estado: 'BORRADOR', alcance: 'TIENDA',
      titulo: 'Borrador para intentar volver ZONA', motivo: 'test', tiendaId, creadoPorId: usuarioId,
    }).returning()

    const res = await PUT(putReq({ alcance: 'ZONA' }), { params: Promise.resolve({ id: borrador.id }) })
    expect(res.status).toBe(400)

    const [sigue] = await db.select().from(schema.accionesGestion).where(eq(schema.accionesGestion.id, borrador.id))
    expect(sigue.alcance).toBe('TIENDA')
  })
})

describe('Paso 3 — las acciones ZONA ya existentes se siguen viendo con normalidad (solo lectura)', () => {
  it('GET /api/gestion-cambios (lista) incluye la acción ZONA preexistente', async () => {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/gestion-cambios'))
    const data = await res.json()

    const fila = data.find((a: any) => a.id === accionZonaId)
    expect(fila).toBeTruthy()
    expect(fila.alcance).toBe('ZONA')
    expect(fila.nTiendas).toBe(1)
  })

  it('GET /api/gestion-cambios/[id] (detalle) muestra la acción ZONA con su scope de tiendas', async () => {
    const { GET } = await import('./[id]/route')
    const res = await GET({} as any, { params: Promise.resolve({ id: accionZonaId }) })
    const data = await res.json()

    expect(data.alcance).toBe('ZONA')
    expect(data.zonaDescripcion).toBe('Lima Norte (test)')
    expect(Array.isArray(data.tiendasScope)).toBe(true)
    expect(data.tiendasScope.length).toBe(1)
    expect(data.tiendasScope[0].tiendaId).toBe(tiendaId)
  })
})
