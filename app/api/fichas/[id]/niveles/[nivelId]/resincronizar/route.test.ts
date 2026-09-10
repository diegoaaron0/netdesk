import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq, and } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR' } }),
}))

const PROVEEDOR_NOMBRE = 'RESYNC NIVELES TEST PROV'
const NIVEL = 8

let proveedorId: string
let nivelMoldeId: string
let fichaId: string
let nivelFichaId: string

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  let [prov] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, PROVEEDOR_NOMBRE))
  if (!prov) [prov] = await db.insert(schema.proveedores).values({ nombre: PROVEEDOR_NOMBRE }).returning()
  proveedorId = prov.id

  // Molde con valores conocidos — el resync debe copiar exactamente esto.
  let [nivel] = await db.select().from(schema.proveedoresNiveles)
    .where(and(eq(schema.proveedoresNiveles.proveedorId, proveedorId), eq(schema.proveedoresNiveles.nivel, NIVEL)))
  if (!nivel) {
    [nivel] = await db.insert(schema.proveedoresNiveles).values({
      proveedorId, nivel: NIVEL, nombreContacto: 'Contacto Molde',
      email: 'molde@resync-test.pe', celular: '999000111', whatsapp: '999000111',
      canal: 'whatsapp', horarioAtencion: '24/7', instruccion: 'Instrucción del molde',
      tiempoRespSev1: '15', tiempoEsperadoSolucion: 30, activo: true,
    }).returning()
  } else {
    [nivel] = await db.update(schema.proveedoresNiveles).set({
      nombreContacto: 'Contacto Molde', email: 'molde@resync-test.pe', celular: '999000111',
      whatsapp: '999000111', canal: 'whatsapp', horarioAtencion: '24/7',
      instruccion: 'Instrucción del molde', tiempoRespSev1: '15', tiempoEsperadoSolucion: 30, activo: true,
    } as any).where(eq(schema.proveedoresNiveles.id, nivel.id)).returning()
  }
  nivelMoldeId = nivel.id

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-RESYNC-NIVEL-01'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-RESYNC-NIVEL-01', nombreCc: 'Tienda aislada — resync nivel', distrito: 'Test', cluster: 'B',
    }).returning()
  }

  await db.delete(schema.fichas).where(eq(schema.fichas.codigo, 'FC-RESYNC-NIVEL-01')) // cascada a fichas_niveles
  const [f] = await db.insert(schema.fichas).values({
    codigo: 'FC-RESYNC-NIVEL-01', tiendaId: t.id, proveedorId, estado: 'ACTIVA',
  }).returning()
  fichaId = f.id

  // Nivel personalizado en la ficha, con valores DISTINTOS al molde.
  const [nf] = await db.insert(schema.fichasNiveles).values({
    fichaId, nivel: NIVEL, nombreContacto: 'Contacto personalizado a mano',
    email: 'custom@ficha.pe', celular: '888777666', whatsapp: null,
    canal: 'correo', horarioAtencion: 'Oficina', instruccion: 'Instrucción propia',
    tiempoRespSev1: '60', tiempoEsperadoSolucion: 90, activo: true,
    personalizado: true,
  }).returning()
  nivelFichaId = nf.id
})

describe('POST /api/fichas/[id]/niveles/[nivelId]/resincronizar', () => {
  it('sobreescribe el nivel personalizado con los valores actuales del molde y lo marca sincronizado', async () => {
    const { POST } = await import('./route')
    const res = await POST({} as any, { params: Promise.resolve({ id: fichaId, nivelId: nivelFichaId }) })
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.personalizado).toBe(false)
    expect(data.nombreContacto).toBe('Contacto Molde')
    expect(data.email).toBe('molde@resync-test.pe')
    expect(data.celular).toBe('999000111')
    expect(data.whatsapp).toBe('999000111')
    expect(data.canal).toBe('whatsapp')
    expect(data.horarioAtencion).toBe('24/7')
    expect(data.instruccion).toBe('Instrucción del molde')
    expect(data.tiempoRespSev1).toBe('15')
    expect(data.tiempoEsperadoSolucion).toBe(30)

    // Persistido en BD, no solo en la respuesta.
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const [fresh] = await db.select().from(schema.fichasNiveles).where(eq(schema.fichasNiveles.id, nivelFichaId))
    expect(fresh.personalizado).toBe(false)
    expect(fresh.nombreContacto).toBe('Contacto Molde')
  })

  it('una vez resincronizada, la ficha SÍ recibe el próximo cambio del molde (propagación normal)', async () => {
    const { PUT } = await import('@/app/api/proveedores/[id]/niveles/[nivelId]/route')
    const res = await PUT(
      { json: async () => ({ nombreContacto: 'Contacto Molde v2', canal: 'correo' }) } as any,
      { params: Promise.resolve({ id: proveedorId, nivelId: nivelMoldeId }) },
    )
    expect(res.status).toBe(200)

    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const [fresh] = await db.select().from(schema.fichasNiveles).where(eq(schema.fichasNiveles.id, nivelFichaId))
    expect(fresh.nombreContacto).toBe('Contacto Molde v2')
    expect(fresh.canal).toBe('correo')
    expect(fresh.personalizado).toBe(false)
  })

  it('nivel de ficha inexistente → 404', async () => {
    const { POST } = await import('./route')
    const res = await POST({} as any, { params: Promise.resolve({ id: fichaId, nivelId: '00000000-0000-0000-0000-000000000000' }) })
    expect(res.status).toBe(404)
  })
})
