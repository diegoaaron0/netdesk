import { describe, it, expect, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { db } from './db'
import * as schema from '../drizzle/schema'
import { ieiSum } from './report-sql'
import { diaSemanaLima } from './impacto-calc'

let registradoPorId: string
let tiendaId: string

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId
  tiendaId = ref.tiendaId!
})

const HORA_REGISTRO = new Date(Date.now() - 3 * 3600000)
const HORA_FIN = new Date(Date.now() - 1 * 3600000)

function ventaHoraEsperada(tienda: { ventaHoraSoles: string | null; ventaHoraFdsSoles: string | null }): number {
  const dow = diaSemanaLima(HORA_REGISTRO)
  const isFDS = dow === 0 || dow === 5 || dow === 6
  return isFDS
    ? Number(tienda.ventaHoraFdsSoles ?? tienda.ventaHoraSoles ?? 0)
    : Number(tienda.ventaHoraSoles ?? tienda.ventaHoraFdsSoles ?? 0)
}

async function crearIncidente(codigo: string, overrides: Record<string, any>) {
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  const [inc] = await db.insert(schema.incidentes).values({
    codigo, tiendaId, registradoPorId, nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
    horaRegistro: HORA_REGISTRO, horaFin: HORA_FIN, mttrMinutos: 120,
    ...overrides,
  }).returning()
  return inc
}

async function ieiDe(incidenteId: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT ${sql.raw(ieiSum())} AS iei
    FROM incidentes i
    JOIN tiendas t ON t.id = i.tienda_id
    WHERE i.id = ${incidenteId}
  `)
  return Number((rows[0] as any).iei ?? 0)
}

describe('report-sql — ieiFactor/ieiSum: datos móviles necesita mov_activado_por, no solo mov_hora_activacion', () => {
  it('mov_hora_activacion seteado con mov_activado_por vacío → se calcula como sin mitigación (ya era correcto, esto lo bloquea)', async () => {
    const inc = await crearIncidente('TST-REPORTSQL-MOV-FANTASMA', {
      movHoraActivacion: HORA_REGISTRO, movHoraDesactivacion: null, movRendimiento: null,
    })
    const iei = await ieiDe(inc.id)
    // CAIDA_TOTAL, 2h de mttr, factor 1.00 (sin mitigación) — si el bug estuviera
    // presente, el factor bajaría a 0.50 por el mov_hora_activacion fantasma.
    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tiendaId))
    const esperado = Math.round(ventaHoraEsperada(tienda) * 2 * 0.35 * 1.00)
    expect(iei).toBe(esperado)
  })

  it('mov_activado_por + mov_hora_activacion (activo de verdad) con rendimiento PARCIAL: factor 0.50', async () => {
    const inc = await crearIncidente('TST-REPORTSQL-MOV-REAL', {
      movActivadoPor: 'AGENTE', movHoraActivacion: HORA_REGISTRO, movRendimiento: 'PARCIAL',
    })
    const iei = await ieiDe(inc.id)
    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, tiendaId))
    const esperado = Math.round(ventaHoraEsperada(tienda) * 2 * 0.35 * 0.50)
    expect(iei).toBe(esperado)
  })
})
