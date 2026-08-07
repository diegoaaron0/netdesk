import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'sup-test-id' } }),
}))

function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}

interface Fixture {
  provA: string; provB: string
  tienda1: string; ficha1Activa: string; ficha1Nueva: string; accion1: string
  tienda2: string; ficha2Activa: string; ficha2Nueva: string; accion2: string
  tienda3: string; ficha3Activa: string; accion3: string
  tienda4: string; ficha4Activa: string; accion4: string
  tienda5: string; ficha5Activa: string; ficha5Nueva: string; accion5: string
}

let fx: Fixture

async function sembrarFixture(): Promise<Fixture> {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')
  const { auth } = await import('@/auth')

  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  const registradoPorId = ref.registradoPorId
  // ejecutadoPorId/usuarioId terminan en columnas uuid reales (ejecutado_por_id,
  // tiendas_historial.usuario_id) — el mock de sesión necesita un uuid real, no
  // un string arbitrario como 'sup-test-id'.
  vi.mocked(auth).mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: registradoPorId } } as any)

  async function proveedor(nombre: string) {
    let [p] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, nombre))
    if (!p) [p] = await db.insert(schema.proveedores).values({ nombre }).returning()
    return p.id
  }
  const provA = await proveedor('GC EJEC PROV A')
  const provB = await proveedor('GC EJEC PROV B')

  async function tienda(codigo: string, proveedorId: string) {
    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, codigo))
    if (!t) {
      [t] = await db.insert(schema.tiendas).values({
        codigo, nombreCc: `Tienda aislada — ${codigo}`, distrito: 'Test', cluster: 'B',
        proveedorId, ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
      }).returning()
    } else {
      await db.update(schema.tiendas).set({ proveedorId, fichaActivaId: null } as any).where(eq(schema.tiendas.id, t.id))
    }
    return t.id
  }

  async function ficha(codigo: string, tiendaId: string, proveedorId: string, estado: 'ACTIVA' | 'BORRADOR') {
    await db.delete(schema.fichas).where(eq(schema.fichas.codigo, codigo))
    const [f] = await db.insert(schema.fichas).values({
      codigo, tiendaId, proveedorId, estado,
      activadoEn: estado === 'ACTIVA' ? new Date() : null,
    }).returning()
    return f.id
  }

  async function incidenteAbierto(codigo: string, tiendaId: string, proveedorId: string) {
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
    await db.insert(schema.incidentes).values({
      codigo, tiendaId, registradoPorId, proveedorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO',
      horaRegistro: new Date(),
    })
  }

  async function accion(codigo: string, tipo: string, tiendaId: string, opts: {
    proveedorAnteriorId?: string | null; proveedorNuevoId?: string | null; fichaNuevaId?: string | null
  } = {}) {
    await db.delete(schema.accionesGestion).where(eq(schema.accionesGestion.codigo, codigo))
    const [a] = await db.insert(schema.accionesGestion).values({
      codigo, tipo: tipo as any, estado: 'APROBADO', alcance: 'TIENDA',
      titulo: `Test ${codigo}`, motivo: 'Motivo de prueba', tiendaId,
      creadoPorId: registradoPorId,
      proveedorAnteriorId: opts.proveedorAnteriorId ?? null,
      proveedorNuevoId:    opts.proveedorNuevoId    ?? null,
      fichaNuevaId:        opts.fichaNuevaId         ?? null,
    }).returning()
    return a.id
  }

  // Tienda 1: CAMBIO_CONTRATO, MISMO proveedor (solo plan) + incidente abierto → NO debe bloquear
  const tienda1 = await tienda('T-GC-EJEC-01', provA)
  const ficha1Activa = await ficha('FC-GC-EJEC-01A', tienda1, provA, 'ACTIVA')
  await db.update(schema.tiendas).set({ fichaActivaId: ficha1Activa }).where(eq(schema.tiendas.id, tienda1))
  const ficha1Nueva = await ficha('FC-GC-EJEC-01B', tienda1, provA, 'BORRADOR')
  await incidenteAbierto('TST-GC-EJEC-01', tienda1, provA)
  const accion1 = await accion('AC-GCTEST-01', 'CAMBIO_CONTRATO', tienda1, { proveedorAnteriorId: provA, proveedorNuevoId: provA, fichaNuevaId: ficha1Nueva })

  // Tienda 2: CAMBIO_CONTRATO, CAMBIO real de proveedor + incidente abierto → debe bloquear
  const tienda2 = await tienda('T-GC-EJEC-02', provA)
  const ficha2Activa = await ficha('FC-GC-EJEC-02A', tienda2, provA, 'ACTIVA')
  await db.update(schema.tiendas).set({ fichaActivaId: ficha2Activa }).where(eq(schema.tiendas.id, tienda2))
  const ficha2Nueva = await ficha('FC-GC-EJEC-02B', tienda2, provB, 'BORRADOR')
  await incidenteAbierto('TST-GC-EJEC-02', tienda2, provA)
  const accion2 = await accion('AC-GCTEST-02', 'CAMBIO_CONTRATO', tienda2, { proveedorAnteriorId: provA, proveedorNuevoId: provB, fichaNuevaId: ficha2Nueva })

  // Tienda 3: BAJA_CONTRATO + incidente abierto → debe bloquear
  const tienda3 = await tienda('T-GC-EJEC-03', provA)
  const ficha3Activa = await ficha('FC-GC-EJEC-03A', tienda3, provA, 'ACTIVA')
  await db.update(schema.tiendas).set({ fichaActivaId: ficha3Activa }).where(eq(schema.tiendas.id, tienda3))
  await incidenteAbierto('TST-GC-EJEC-03', tienda3, provA)
  const accion3 = await accion('AC-GCTEST-03', 'BAJA_CONTRATO', tienda3)

  // Tienda 4: BAJA_CONTRATO SIN incidentes abiertos → debe ejecutarse
  const tienda4 = await tienda('T-GC-EJEC-04', provA)
  const ficha4Activa = await ficha('FC-GC-EJEC-04A', tienda4, provA, 'ACTIVA')
  await db.update(schema.tiendas).set({ fichaActivaId: ficha4Activa }).where(eq(schema.tiendas.id, tienda4))
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-GC-EJEC-04')) // asegurar que no queden de una corrida previa
  const accion4 = await accion('AC-GCTEST-04', 'BAJA_CONTRATO', tienda4)

  // Tienda 5: CAMBIO_CONTRATO, CAMBIO real de proveedor, SIN incidentes → debe aplicar el cambio
  const tienda5 = await tienda('T-GC-EJEC-05', provA)
  const ficha5Activa = await ficha('FC-GC-EJEC-05A', tienda5, provA, 'ACTIVA')
  await db.update(schema.tiendas).set({ fichaActivaId: ficha5Activa }).where(eq(schema.tiendas.id, tienda5))
  const ficha5Nueva = await ficha('FC-GC-EJEC-05B', tienda5, provB, 'BORRADOR')
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-GC-EJEC-05'))
  const accion5 = await accion('AC-GCTEST-05', 'CAMBIO_CONTRATO', tienda5, { proveedorAnteriorId: provA, proveedorNuevoId: provB, fichaNuevaId: ficha5Nueva })

  return {
    provA, provB,
    tienda1, ficha1Activa, ficha1Nueva, accion1,
    tienda2, ficha2Activa, ficha2Nueva, accion2,
    tienda3, ficha3Activa, accion3,
    tienda4, ficha4Activa, accion4,
    tienda5, ficha5Activa, ficha5Nueva, accion5,
  }
}

beforeAll(async () => { fx = await sembrarFixture() })

describe('POST /api/gestion-cambios/[id]/ejecutar — CAMBIO_CONTRATO: bloqueo dinámico (no por el nombre del tipo)', () => {
  it('mismo proveedor (solo actualización de plan) + incidente abierto → NO bloquea, activa la ficha nueva', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { POST } = await import('./route')

    const res = await POST(reqCon(), { params: Promise.resolve({ id: fx.accion1 }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.estado).toBe('COMPLETADO')

    const [activa] = await db.select().from(schema.fichas).where(eq(schema.fichas.id, fx.ficha1Nueva))
    expect(activa.estado).toBe('ACTIVA')
    const [anterior] = await db.select().from(schema.fichas).where(eq(schema.fichas.id, fx.ficha1Activa))
    expect(anterior.estado).toBe('HISTORICA')
    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, fx.tienda1))
    expect(tienda.proveedorId).toBe(fx.provA) // no cambió — nunca hubo _cambiarProveedorTienda
    expect(tienda.fichaActivaId).toBe(fx.ficha1Nueva)
  })

  it('cambio real de proveedor + incidente abierto → bloquea con 409, nada cambia', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { POST } = await import('./route')

    const res = await POST(reqCon(), { params: Promise.resolve({ id: fx.accion2 }) })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.incidentesAbiertos).toBe(1)

    const [anterior] = await db.select().from(schema.fichas).where(eq(schema.fichas.id, fx.ficha2Activa))
    expect(anterior.estado).toBe('ACTIVA') // no se tocó — la transacción se revirtió
    const [nueva] = await db.select().from(schema.fichas).where(eq(schema.fichas.id, fx.ficha2Nueva))
    expect(nueva.estado).toBe('BORRADOR')
    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, fx.tienda2))
    expect(tienda.proveedorId).toBe(fx.provA)
    const [accion] = await db.select().from(schema.accionesGestion).where(eq(schema.accionesGestion.id, fx.accion2))
    expect(accion.estado).toBe('APROBADO') // no avanzó a COMPLETADO
  })

  it('cambio real de proveedor SIN incidentes abiertos → se ejecuta y aplica el cambio de proveedor', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { POST } = await import('./route')

    const res = await POST(reqCon(), { params: Promise.resolve({ id: fx.accion5 }) })
    expect(res.status).toBe(200)

    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, fx.tienda5))
    expect(tienda.proveedorId).toBe(fx.provB) // sí cambió
    expect(tienda.fichaActivaId).toBe(fx.ficha5Nueva)
    const [anterior] = await db.select().from(schema.fichas).where(eq(schema.fichas.id, fx.ficha5Activa))
    expect(anterior.estado).toBe('HISTORICA')
  })
})

describe('POST /api/gestion-cambios/[id]/ejecutar — BAJA_CONTRATO', () => {
  it('con incidente abierto → bloquea con 409, la ficha sigue ACTIVA', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { POST } = await import('./route')

    const res = await POST(reqCon(), { params: Promise.resolve({ id: fx.accion3 }) })
    expect(res.status).toBe(409)

    const [ficha] = await db.select().from(schema.fichas).where(eq(schema.fichas.id, fx.ficha3Activa))
    expect(ficha.estado).toBe('ACTIVA')
    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, fx.tienda3))
    expect(tienda.proveedorId).toBe(fx.provA)
    expect(tienda.fichaActivaId).toBe(fx.ficha3Activa)
  })

  it('sin ficha nueva y sin incidentes abiertos → ejecuta: ficha ACTIVA pasa a DADA_DE_BAJA, tienda queda sin proveedor ni ficha activa', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { POST } = await import('./route')

    const res = await POST(reqCon(), { params: Promise.resolve({ id: fx.accion4 }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.estado).toBe('COMPLETADO')
    expect(data.fichaNuevaId).toBeNull() // nunca llevó ficha nueva
    expect(data.fichaAnteriorId).toBe(fx.ficha4Activa) // la ficha dada de baja queda registrada como "anterior"

    const [ficha] = await db.select().from(schema.fichas).where(eq(schema.fichas.id, fx.ficha4Activa))
    expect(ficha.estado).toBe('DADA_DE_BAJA')
    expect(ficha.archivadoEn).not.toBeNull()

    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, fx.tienda4))
    expect(tienda.proveedorId).toBeNull()
    expect(tienda.fichaActivaId).toBeNull()
  })
})
