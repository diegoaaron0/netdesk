import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'

// Fase 2 — Paso 1: solo el schema, nada lo usa todavía. Este test confirma que
// las constraints de la tabla funcionan de verdad (no solo que existen), para
// que el siguiente paso (los endpoints) pueda confiar en ellas sin tener que
// re-validar lo mismo en aplicación.

let incidenteId: string
let usuarioId: string

beforeAll(async () => {
  // Incidente propio y aislado (no TST-P1-001, fixture compartido por muchos
  // otros archivos de test) — evita colisiones con el índice único parcial
  // cuando la suite corre archivos de test en paralelo.
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  usuarioId = ref.registradoPorId

  await db.delete(schema.incidenteMitigacionTramosHistorial).where(
    eq(schema.incidenteMitigacionTramosHistorial.incidenteId,
      (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-TRAMOS-CONSTRAINTS')))[0]?.id ?? '00000000-0000-0000-0000-000000000000'),
  )
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-TRAMOS-CONSTRAINTS'))
  const [inc] = await db.insert(schema.incidentes).values({
    codigo: 'TST-TRAMOS-CONSTRAINTS', tiendaId: ref.tiendaId, registradoPorId: ref.registradoPorId,
    nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: new Date(),
  }).returning()
  incidenteId = inc.id
})

beforeEach(async () => {
  // Limpia cualquier tramo de pruebas anteriores para este incidente — la
  // constraint de "un solo tramo abierto" depende de que no quede ninguno
  // colgado entre tests. El FK tramo_id de historial es RESTRICT por defecto,
  // así que sus filas se borran primero.
  await db.delete(schema.incidenteMitigacionTramosHistorial).where(eq(schema.incidenteMitigacionTramosHistorial.incidenteId, incidenteId))
  await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, incidenteId))
})

describe('incidente_mitigacion_tramos — constraints (Fase 2, Paso 1)', () => {
  it('inserta un tramo abierto válido (hasta NULL, ie_tramo NULL) sin problema', async () => {
    const [row] = await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: new Date(),
    }).returning()
    expect(row.hasta).toBeNull()
    expect(row.ieTramo).toBeNull()
  })

  it('inserta un tramo sellado válido (hasta seteado, ie_tramo seteado) sin problema', async () => {
    const desde = new Date(Date.now() - 3600000)
    const [row] = await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId, tipo: 'ROUTER_PROPIO', factor: '0.0000', desde, hasta: new Date(), ieTramo: '123.45',
    }).returning()
    expect(row.hasta).not.toBeNull()
    expect(row.ieTramo).not.toBeNull()
  })

  it('RECHAZA un tramo con hasta seteado pero ie_tramo NULL (constraint hasta⟺ie_tramo)', async () => {
    await expect(
      db.insert(schema.incidenteMitigacionTramos).values({
        incidenteId, tipo: 'DATOS_MOVILES', factor: '0.5000',
        desde: new Date(Date.now() - 3600000), hasta: new Date(), // ie_tramo omitido a propósito
      }),
    ).rejects.toThrow()
  })

  it('RECHAZA un tramo con hasta NULL pero ie_tramo seteado (constraint hasta⟺ie_tramo, dirección inversa)', async () => {
    await expect(
      db.insert(schema.incidenteMitigacionTramos).values({
        incidenteId, tipo: 'BOLETA_MANUAL', factor: '0.3000',
        desde: new Date(), ieTramo: '10.00', // hasta omitido, pero ie_tramo sí seteado
      }),
    ).rejects.toThrow()
  })

  it('RECHAZA el factor fuera de [0,1]', async () => {
    await expect(
      db.insert(schema.incidenteMitigacionTramos).values({
        incidenteId, tipo: 'SIN_MITIGACION', factor: '1.5000', desde: new Date(),
      }),
    ).rejects.toThrow()
  })

  it('RECHAZA un origen que no esté en la lista de 3 valores permitidos', async () => {
    await expect(
      db.insert(schema.incidenteMitigacionTramos).values({
        incidenteId, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: new Date(), origen: 'INVENTADO',
      }),
    ).rejects.toThrow()
  })

  it('RECHAZA un segundo tramo abierto para el mismo incidente (índice único parcial)', async () => {
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: new Date(),
    })
    await expect(
      db.insert(schema.incidenteMitigacionTramos).values({
        incidenteId, tipo: 'ROUTER_PROPIO', factor: '0.0000', desde: new Date(),
      }),
    ).rejects.toThrow()
  })

  it('SÍ permite dos tramos SELLADOS (no abiertos) para el mismo incidente', async () => {
    const t0 = new Date(Date.now() - 7200000)
    const t1 = new Date(Date.now() - 3600000)
    const t2 = new Date()
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: t0, hasta: t1, ieTramo: '5.00',
    })
    const [row] = await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId, tipo: 'ROUTER_PROPIO', factor: '0.0000', desde: t1, hasta: t2, ieTramo: '0.00',
    }).returning()
    expect(row.id).toBeTruthy()
  })
})

describe('incidente_mitigacion_tramos_historial — constraints (Fase 2, Paso 1)', () => {
  let tramoId: string

  beforeEach(async () => {
    // El FK tramo_id de historial es RESTRICT por defecto — hay que borrar las
    // filas de auditoría del tramo antes de poder borrar el tramo mismo.
    await db.delete(schema.incidenteMitigacionTramosHistorial).where(eq(schema.incidenteMitigacionTramosHistorial.incidenteId, incidenteId))
    await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, incidenteId))
    const [tramo] = await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: new Date(),
    }).returning()
    tramoId = tramo.id
  })

  it('inserta una fila de auditoría válida', async () => {
    const [row] = await db.insert(schema.incidenteMitigacionTramosHistorial).values({
      eventoId: crypto.randomUUID(), tramoId, incidenteId, usuarioId,
      accion: 'EDITAR', valorAnterior: { factor: '0.2000' }, valorNuevo: { factor: '0.5000' },
    }).returning()
    expect(row.id).toBeTruthy()
  })

  it('RECHAZA una accion fuera de la lista de 5 valores permitidos', async () => {
    await expect(
      db.insert(schema.incidenteMitigacionTramosHistorial).values({
        eventoId: crypto.randomUUID(), tramoId, incidenteId, usuarioId,
        accion: 'INVENTADA',
      }),
    ).rejects.toThrow()
  })
})
