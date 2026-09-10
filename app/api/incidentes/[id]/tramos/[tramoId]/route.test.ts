import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import { calcIeTramo } from '@/lib/mitigacion-tramos'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'sup-test@netdesk-test.local', rol: 'SUPERVISOR', id: 'sup-test-id' } }),
}))

let registradoPorId: string
let tiendaId: string
let tienda: { ventaHoraSoles: string | null; ventaHoraFdsSoles: string | null }

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId

  // usuario real en la sesión — incidente_mitigacion_tramos_historial.usuario_id es uuid NOT NULL
  const { auth } = await import('@/auth')
  vi.mocked(auth).mockResolvedValue({ user: { email: 'sup-test@netdesk-test.local', rol: 'SUPERVISOR', id: registradoPorId } } as any)

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-EDITAR-TRAMOS'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-EDITAR-TRAMOS', nombreCc: 'Tienda — editar tramos', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()
  }
  tiendaId = t.id
  tienda = { ventaHoraSoles: t.ventaHoraSoles, ventaHoraFdsSoles: t.ventaHoraFdsSoles }
})

const H = 3600000
// Ancla FIJA calculada una sola vez — si se recalculara Date.now() en cada
// llamada, dos llamadas a horas(3) en momentos distintos del test (ej. al
// crear el fixture y luego al armar la aserción) darían timestamps distintos
// por la deriva de milisegundos reales entre una llamada y otra.
const ANCLA = Date.now()
function horas(n: number) { return new Date(ANCLA - (10 - n) * H) } // "hora 0" = hace 10h desde ANCLA, "hora 10" = ANCLA

/** Incidente RESUELTO con 3 tramos sellados contiguos: A[0-3] B[3-6] C[6-9]. */
async function crearFixture3Tramos(codigo: string) {
  const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  if (prev) {
    await db.delete(schema.incidenteMitigacionTramosHistorial).where(eq(schema.incidenteMitigacionTramosHistorial.incidenteId, prev.id))
    await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
  }
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  const [inc] = await db.insert(schema.incidentes).values({
    codigo, tiendaId, registradoPorId, nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
    horaRegistro: horas(0), horaFin: horas(9), mttrMinutos: 540,
  }).returning()

  const [a] = await db.insert(schema.incidenteMitigacionTramos).values({
    incidenteId: inc.id, tipo: 'ROUTER_PROPIO', factor: '0.0000', desde: horas(0), hasta: horas(3), ieTramo: '0.00',
  }).returning()
  const [b] = await db.insert(schema.incidenteMitigacionTramos).values({
    incidenteId: inc.id, tipo: 'DATOS_MOVILES', factor: '0.5000', desde: horas(3), hasta: horas(6), ieTramo: '999.00',
  }).returning()
  const [c] = await db.insert(schema.incidenteMitigacionTramos).values({
    incidenteId: inc.id, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: horas(6), hasta: horas(9), ieTramo: '999.00',
  }).returning()

  return { inc, a, b, c }
}

async function tramosOrdenados(incidenteId: string) {
  return db.select().from(schema.incidenteMitigacionTramos)
    .where(eq(schema.incidenteMitigacionTramos.incidenteId, incidenteId))
    .orderBy(asc(schema.incidenteMitigacionTramos.desde))
}

function ieEsperado(tipo: string, factor: number, desde: Date, hasta: Date) {
  return calcIeTramo({ tipo: tipo as any, factor, desde, hasta, tipoIncidente: 'CAIDA_TOTAL' }, tienda)
}

describe('PATCH /api/incidentes/[id]/tramos/[tramoId] — validaciones base', () => {
  it('rechaza editar el tramo actualmente ABIERTO', async () => {
    const { inc } = await crearFixture3Tramos('TST-EDITAR-ABIERTO')
    const [abierto] = await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: horas(9),
    }).returning()
    await db.update(schema.incidentes).set({ estado: 'ABIERTO', horaFin: null }).where(eq(schema.incidentes.id, inc.id))

    const { PATCH } = await import('./route')
    const res = await PATCH(
      { json: async () => ({ desde: horas(9).toISOString() }) } as any,
      { params: Promise.resolve({ id: inc.id, tramoId: abierto.id }) },
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/mitigaci[oó]n/i)
  })

  it('rechaza una fecha en el futuro', async () => {
    const { inc, b } = await crearFixture3Tramos('TST-EDITAR-FUTURO')
    const { PATCH } = await import('./route')
    const futuro = new Date(Date.now() + 3600000).toISOString()
    const res = await PATCH(
      { json: async () => ({ hasta: futuro }) } as any,
      { params: Promise.resolve({ id: inc.id, tramoId: b.id }) },
    )
    expect(res.status).toBe(400)
  })

  it('rechaza un rango fuera de los límites del incidente (antes de horaRegistro)', async () => {
    const { inc, a } = await crearFixture3Tramos('TST-EDITAR-FUERA-LIMITE')
    const { PATCH } = await import('./route')
    const res = await PATCH(
      { json: async () => ({ desde: horas(-1).toISOString() }) } as any,
      { params: Promise.resolve({ id: inc.id, tramoId: a.id }) },
    )
    expect(res.status).toBe(400)
  })
})

describe('PATCH — recorte parcial de un vecino', () => {
  it('invadir parcialmente al vecino ANTERIOR lo recorta (no lo borra) y recalcula su ie_tramo', async () => {
    const { inc, a, b } = await crearFixture3Tramos('TST-EDITAR-RECORTE-ANTERIOR')
    const nuevoDesdeB = new Date(horas(3).getTime() - 30 * 60000) // invade 30min a "a"

    const { PATCH } = await import('./route')
    const res = await PATCH(
      { json: async () => ({ desde: nuevoDesdeB.toISOString() }) } as any,
      { params: Promise.resolve({ id: inc.id, tramoId: b.id }) },
    )
    expect(res.status).not.toBe(400)
    expect(res.status).not.toBe(409)

    const [aDespues] = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.id, a.id))
    expect(aDespues).toBeTruthy() // sigue existiendo
    expect(new Date(aDespues.hasta!).getTime()).toBe(nuevoDesdeB.getTime())
    expect(Number(aDespues.ieTramo)).toBe(ieEsperado('ROUTER_PROPIO', 0, horas(0), nuevoDesdeB))

    const [bDespues] = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.id, b.id))
    expect(new Date(bDespues.desde).getTime()).toBe(nuevoDesdeB.getTime())
    expect(Number(bDespues.ieTramo)).toBe(ieEsperado('DATOS_MOVILES', 0.5, nuevoDesdeB, horas(6)))
  })
})

describe('PATCH — tapado completo del vecino', () => {
  it('tapado completo SIN historial: el vecino se borra de verdad', async () => {
    const { inc, a, b } = await crearFixture3Tramos('TST-EDITAR-TAPADO-SIN-HIST')
    const { PATCH } = await import('./route')
    // desde de B == desde de A → consume A por completo
    const res = await PATCH(
      { json: async () => ({ desde: horas(0).toISOString() }) } as any,
      { params: Promise.resolve({ id: inc.id, tramoId: b.id }) },
    )
    expect(res.status).not.toBe(400)
    expect(res.status).not.toBe(409)

    const [aDespues] = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.id, a.id))
    expect(aDespues).toBeUndefined() // borrado de verdad

    const tramos = await tramosOrdenados(inc.id)
    expect(tramos).toHaveLength(2) // b (ahora desde=horas(0)) + c
  })

  it('tapado completo CON historial: BLOQUEA toda la edición, nada cambia (ni siquiera el tramo objetivo)', async () => {
    const { inc, a, b } = await crearFixture3Tramos('TST-EDITAR-TAPADO-CON-HIST')
    const { PATCH } = await import('./route')

    // "a" ya tiene historial previo — insertado directamente, sin pasar por un
    // PATCH real. Un PATCH real sobre "a" dejaría un hueco entre "a" y "b" (10min),
    // lo que insertaría un RELLENO_AUTOMATICO intermedio y cambiaría el vecino
    // "anterior" real de "b" de "a" al relleno, rompiendo el escenario que este
    // test quiere probar.
    await db.insert(schema.incidenteMitigacionTramosHistorial).values({
      eventoId: crypto.randomUUID(), tramoId: a.id, incidenteId: inc.id, usuarioId: registradoPorId,
      accion: 'EDITAR', valorAnterior: { nota: 'edicion previa simulada' }, valorNuevo: { nota: 'edicion previa simulada' },
    })

    const [aAntes] = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.id, a.id))
    const [bAntes] = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.id, b.id))

    // Paso 2: intentar que "b" trague por completo a "a" (ahora con historial) → debe bloquearse
    const res = await PATCH(
      { json: async () => ({ desde: horas(0).toISOString() }) } as any,
      { params: Promise.resolve({ id: inc.id, tramoId: b.id }) },
    )
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toMatch(/historial/i)

    const [aDespues] = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.id, a.id))
    const [bDespues] = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.id, b.id))
    expect(aDespues).toEqual(aAntes) // "a" no cambió
    expect(bDespues).toEqual(bAntes) // "b" (el objetivo) tampoco cambió — nada se aplicó
  })
})

describe('PATCH — hueco (relleno automático)', () => {
  it('dejar un hueco respecto a un vecino inserta un tramo SIN_MITIGACION (RELLENO_AUTOMATICO) con ie_tramo correcto', async () => {
    const { inc, a, b } = await crearFixture3Tramos('TST-EDITAR-HUECO')
    const nuevoDesdeB = new Date(horas(3).getTime() + 20 * 60000) // deja un hueco de 20min tras "a"

    const { PATCH } = await import('./route')
    const res = await PATCH(
      { json: async () => ({ desde: nuevoDesdeB.toISOString() }) } as any,
      { params: Promise.resolve({ id: inc.id, tramoId: b.id }) },
    )
    expect(res.status).not.toBe(400)
    expect(res.status).not.toBe(409)

    const tramos = await tramosOrdenados(inc.id)
    expect(tramos).toHaveLength(4) // a, relleno, b, c
    const relleno = tramos[1]
    expect(relleno.tipo).toBe('SIN_MITIGACION')
    expect(relleno.origen).toBe('RELLENO_AUTOMATICO')
    expect(new Date(relleno.desde).getTime()).toBe(horas(3).getTime())
    expect(new Date(relleno.hasta!).getTime()).toBe(nuevoDesdeB.getTime())
    expect(Number(relleno.ieTramo)).toBe(ieEsperado('SIN_MITIGACION', 1.00, horas(3), nuevoDesdeB))
  })

  it('el relleno se limpia solo cuando una edición posterior vuelve a cerrar el hueco', async () => {
    const { inc, a, b } = await crearFixture3Tramos('TST-EDITAR-HUECO-SE-CIERRA')
    const nuevoDesdeB = new Date(horas(3).getTime() + 20 * 60000)

    const { PATCH } = await import('./route')
    await PATCH(
      { json: async () => ({ desde: nuevoDesdeB.toISOString() }) } as any,
      { params: Promise.resolve({ id: inc.id, tramoId: b.id }) },
    )
    let tramos = await tramosOrdenados(inc.id)
    expect(tramos).toHaveLength(4)
    const rellenoId = tramos[1].id

    // Ahora se cierra el hueco: se vuelve a mover "desde" de b a horas(3) exacto (== desde del relleno)
    const res2 = await PATCH(
      { json: async () => ({ desde: horas(3).toISOString() }) } as any,
      { params: Promise.resolve({ id: inc.id, tramoId: b.id }) },
    )
    expect(res2.status).not.toBe(400)
    expect(res2.status).not.toBe(409)

    tramos = await tramosOrdenados(inc.id)
    expect(tramos).toHaveLength(3) // a, b, c — el relleno desapareció solo
    const [rellenoDespues] = await db.select().from(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.id, rellenoId))
    expect(rellenoDespues).toBeUndefined()
  })
})

describe('PATCH — auditoría', () => {
  it('edición simple: una fila EDITAR con snapshot antes/después correcto', async () => {
    const { inc, b } = await crearFixture3Tramos('TST-EDITAR-AUDITORIA-SIMPLE')
    const nuevoHastaB = new Date(horas(6).getTime() - 15 * 60000)

    const { PATCH } = await import('./route')
    await PATCH(
      { json: async () => ({ hasta: nuevoHastaB.toISOString() }) } as any,
      { params: Promise.resolve({ id: inc.id, tramoId: b.id }) },
    )

    const filas = await db.select().from(schema.incidenteMitigacionTramosHistorial).where(eq(schema.incidenteMitigacionTramosHistorial.tramoId, b.id))
    expect(filas).toHaveLength(1)
    expect(filas[0].accion).toBe('EDITAR')
    expect((filas[0].valorAnterior as any).hasta).toBe(horas(6).toISOString())
    expect((filas[0].valorNuevo as any).hasta).toBe(nuevoHastaB.toISOString())
  })

  it('recorte + relleno + tapado comparten el mismo evento_id, con la acción correcta cada uno', async () => {
    const { inc, a, b } = await crearFixture3Tramos('TST-EDITAR-AUDITORIA-EVENTO')
    // Mueve "desde" de b para invadir completamente a "a" (tapado sin historial)
    const { PATCH } = await import('./route')
    const res = await PATCH(
      { json: async () => ({ desde: horas(0).toISOString() }) } as any,
      { params: Promise.resolve({ id: inc.id, tramoId: b.id }) },
    )
    expect(res.status).not.toBe(400)
    expect(res.status).not.toBe(409)

    const filas = await db.select().from(schema.incidenteMitigacionTramosHistorial).where(eq(schema.incidenteMitigacionTramosHistorial.incidenteId, inc.id))
    expect(filas.length).toBeGreaterThanOrEqual(2) // EDITAR (b) + VECINO_ELIMINADO (a)
    const eventos = new Set(filas.map(f => f.eventoId))
    expect(eventos.size).toBe(1) // todas del mismo evento

    const editar = filas.find(f => f.accion === 'EDITAR')
    const eliminado = filas.find(f => f.accion === 'VECINO_ELIMINADO')
    expect(editar).toBeTruthy()
    expect(eliminado).toBeTruthy()
    // tramo_id queda en NULL tras el DELETE (ON DELETE SET NULL) — la
    // identidad del tramo borrado se conserva en el snapshot, no en la FK.
    expect(eliminado!.tramoId).toBeNull()
    expect((eliminado!.valorAnterior as any).id).toBe(a.id)
    expect(eliminado!.valorNuevo).toBeNull()
    expect(eliminado!.valorAnterior).toBeTruthy()
  })
})
