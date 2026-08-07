import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'placeholder' } }),
}))

function reqCon(body: Record<string, unknown> = {}) {
  return { json: async () => body } as any
}

interface Fixture {
  usuarioId: string
  tiendaConFicha: string
  tiendaConRouter: string
  tiendaConIncidenteAbierto: string
  tiendaLimpia: string
  tiendaMotivoVacio: string
}

let fx: Fixture

async function sembrarFixture(): Promise<Fixture> {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')
  const { auth } = await import('@/auth')

  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  const usuarioId = ref.registradoPorId
  // archivada_por_id/usuario_id son columnas uuid reales — el mock necesita un uuid real.
  vi.mocked(auth).mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR', id: usuarioId } } as any)

  let [proveedor] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, 'BAJA TIENDA TEST PROV'))
  if (!proveedor) [proveedor] = await db.insert(schema.proveedores).values({ nombre: 'BAJA TIENDA TEST PROV' }).returning()

  async function tiendaLimpia(codigo: string): Promise<string> {
    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, codigo))
    if (!t) {
      [t] = await db.insert(schema.tiendas).values({
        codigo, nombreCc: `Tienda aislada — ${codigo}`, distrito: 'Test', cluster: 'B',
        ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
      }).returning()
    } else {
      // autocorrectivo: dejarla ACTIVA, sin ficha/proveedor, por si quedó archivada de una corrida previa
      await db.update(schema.tiendas)
        .set({ estado: 'ACTIVA', archivadaEn: null, archivadaPorId: null, archivadaMotivo: null, fichaActivaId: null, proveedorId: null } as any)
        .where(eq(schema.tiendas.id, t.id))
    }
    return t.id
  }

  // Tienda con ficha ACTIVA → debe bloquear
  const tiendaConFicha = await tiendaLimpia('T-BAJA-01-FICHA')
  await db.delete(schema.fichas).where(eq(schema.fichas.codigo, 'FC-BAJA-01'))
  const [ficha] = await db.insert(schema.fichas).values({
    codigo: 'FC-BAJA-01', tiendaId: tiendaConFicha, proveedorId: proveedor.id, estado: 'ACTIVA', activadoEn: new Date(),
  }).returning()
  await db.update(schema.tiendas).set({ fichaActivaId: ficha.id, proveedorId: proveedor.id }).where(eq(schema.tiendas.id, tiendaConFicha))

  // Tienda con router externo asignado → debe bloquear
  const tiendaConRouter = await tiendaLimpia('T-BAJA-02-ROUTER')
  let [router] = await db.select().from(schema.routersExternos).where(eq(schema.routersExternos.codigo, 'RT-BAJA-TEST-01'))
  if (!router) {
    [router] = await db.insert(schema.routersExternos).values({
      codigo: 'RT-BAJA-TEST-01', estado: 'ASIGNADO', tiendaActualId: tiendaConRouter,
    }).returning()
  } else {
    await db.update(schema.routersExternos).set({ tiendaActualId: tiendaConRouter, estado: 'ASIGNADO' }).where(eq(schema.routersExternos.id, router.id))
  }

  // Tienda con incidente abierto → debe bloquear
  const tiendaConIncidenteAbierto = await tiendaLimpia('T-BAJA-03-INCIDENTE')
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-BAJA-ABIERTO'))
  await db.insert(schema.incidentes).values({
    codigo: 'TST-BAJA-ABIERTO', tiendaId: tiendaConIncidenteAbierto, registradoPorId: usuarioId,
    nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: new Date(),
  })

  // Tienda limpia → debe darse de baja con éxito
  const tiendaLimpiaId = await tiendaLimpia('T-BAJA-04-LIMPIA')

  // Tienda limpia, para el caso de motivo vacío (no debe cambiar nada)
  const tiendaMotivoVacio = await tiendaLimpia('T-BAJA-05-MOTIVO-VACIO')

  return { usuarioId, tiendaConFicha, tiendaConRouter, tiendaConIncidenteAbierto, tiendaLimpia: tiendaLimpiaId, tiendaMotivoVacio }
}

beforeAll(async () => { fx = await sembrarFixture() })

describe('POST /api/tiendas/[id]/baja', () => {
  it('bloquea si la tienda tiene ficha activa (409) — primero hay que dar de baja el contrato', async () => {
    const { POST } = await import('./route')
    const res = await POST(reqCon({ motivo: 'cierre definitivo' }), { params: Promise.resolve({ id: fx.tiendaConFicha }) })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toMatch(/ficha activa/i)
  })

  it('bloquea si hay un router externo asignado (409) — debe devolverse al almacén primero', async () => {
    const { POST } = await import('./route')
    const res = await POST(reqCon({ motivo: 'cierre definitivo' }), { params: Promise.resolve({ id: fx.tiendaConRouter }) })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toMatch(/router/i)
  })

  it('bloquea si hay incidentes abiertos (409)', async () => {
    const { POST } = await import('./route')
    const res = await POST(reqCon({ motivo: 'cierre definitivo' }), { params: Promise.resolve({ id: fx.tiendaConIncidenteAbierto }) })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.incidentesAbiertos).toBe(1)
  })

  it('motivo vacío → 400, no cambia nada', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { POST } = await import('./route')

    const res = await POST(reqCon({ motivo: '   ' }), { params: Promise.resolve({ id: fx.tiendaMotivoVacio }) })
    expect(res.status).toBe(400)

    const [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, fx.tiendaMotivoVacio))
    expect(t.estado).toBe('ACTIVA')
  })

  it('sin permiso (AGENTE no tiene mantenimiento.eliminar) → 403', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE', id: fx.usuarioId } } as any)
    const { POST } = await import('./route')

    const res = await POST(reqCon({ motivo: 'cierre definitivo' }), { params: Promise.resolve({ id: fx.tiendaLimpia }) })
    expect(res.status).toBe(403)
  })

  it('tienda limpia (sin ficha, router ni incidentes abiertos) → archiva: estado, archivadaEn/PorId/Motivo, y registra en tiendas_historial', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { POST } = await import('./route')

    const res = await POST(reqCon({ motivo: 'Local cerrado definitivamente' }), { params: Promise.resolve({ id: fx.tiendaLimpia }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.estado).toBe('ARCHIVADA')
    expect(data.archivadaMotivo).toBe('Local cerrado definitivamente')
    expect(data.archivadaPorId).toBe(fx.usuarioId)
    expect(data.archivadaEn).not.toBeNull()

    const [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, fx.tiendaLimpia))
    expect(t.estado).toBe('ARCHIVADA')

    const [hist] = await db.select().from(schema.tiendasHistorial)
      .where(eq(schema.tiendasHistorial.tiendaId, fx.tiendaLimpia))
    expect(hist.campoEditado).toBe('estado')
    expect(hist.valorNuevo).toBe('ARCHIVADA')
    expect(hist.motivo).toBe('Local cerrado definitivamente')
    expect(hist.usuarioId).toBe(fx.usuarioId)
  })

  it('una tienda ya ARCHIVADA no se puede volver a dar de baja (400)', async () => {
    const { POST } = await import('./route')
    const res = await POST(reqCon({ motivo: 'de nuevo' }), { params: Promise.resolve({ id: fx.tiendaLimpia }) })
    expect(res.status).toBe(400)
  })
})
