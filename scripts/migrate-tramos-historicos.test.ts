import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { eq, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import { migrarTodo, reclasificar } from './migrate-tramos-historicos'
import { calcImpactoRow } from '@/lib/impacto-calc'

const H = 3600000
const BASE = new Date('2024-01-08T15:00:00.000Z').getTime() // lunes 10am Lima
function horas(n: number): Date { return new Date(BASE + n * H) }

const PREFIJO = 'TST-MIGTRAMOS-'
let registradoPorId: string
let tiendaId: string
let sql: postgres.Sql

async function limpiarFixtures() {
  const incs = await db.select({ id: schema.incidentes.id }).from(schema.incidentes)
    .where(eq(schema.incidentes.codigo, `${PREFIJO}dummy`)) // placeholder, real cleanup abajo por LIKE
  const filas = await sql`SELECT id FROM incidentes WHERE codigo LIKE ${PREFIJO + '%'}`
  for (const f of filas) {
    await sql`DELETE FROM incidente_mitigacion_tramos_historial WHERE incidente_id = ${f.id}`
    await sql`DELETE FROM incidente_mitigacion_tramos WHERE incidente_id = ${f.id}`
  }
  await sql`DELETE FROM incidentes WHERE codigo LIKE ${PREFIJO + '%'}`
  void incs
}

async function crearIncidente(codigo: string, overrides: Record<string, any> = {}) {
  const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  if (prev) {
    await db.delete(schema.incidenteMitigacionTramosHistorial).where(eq(schema.incidenteMitigacionTramosHistorial.incidenteId, prev.id))
    await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
  }
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  const [inc] = await db.insert(schema.incidentes).values({
    codigo, tiendaId, registradoPorId, nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
    horaRegistro: horas(0), horaFin: horas(3),
    ...overrides,
  }).returning()
  return inc
}

async function tramosDe(incidenteId: string) {
  return db.select().from(schema.incidenteMitigacionTramos)
    .where(eq(schema.incidenteMitigacionTramos.incidenteId, incidenteId))
    .orderBy(asc(schema.incidenteMitigacionTramos.desde))
}

beforeAll(async () => {
  // TimeZone: 'UTC' obligatorio — ver el mismo comentario en migrate-tramos-historicos.ts.
  sql = postgres(process.env.DATABASE_URL!, { connection: { TimeZone: 'UTC' } })
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-MIGTRAMOS'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-MIGTRAMOS', nombreCc: 'Tienda — migración tramos históricos', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()
  }
  tiendaId = t.id

  await limpiarFixtures()
})

afterAll(async () => {
  await limpiarFixtures()
  await sql.end()
})

describe('migrate-tramos-historicos — script de integración contra netdesk_test', () => {
  it('incidente simple con una sola mitigación: migra y verifica contra el IEI conocido', async () => {
    await crearIncidente(`${PREFIJO}SIMPLE`, {
      contActivadoPor: 'AGENTE', contHoraActivacion: horas(0.5), contHoraDesactivacion: horas(2),
      contRendimiento: 'EFECTIVO', contEsExterno: false,
    })

    const res = await migrarTodo(sql, { prefijoCodigo: PREFIJO })
    expect(res.fallos.filter(f => f.codigoIncidente === `${PREFIJO}SIMPLE`)).toHaveLength(0)

    const inc = (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, `${PREFIJO}SIMPLE`)))[0]
    const tramos = await tramosDe(inc.id)
    expect(tramos.length).toBeGreaterThan(0)
    expect(tramos.every(t => t.hasta !== null)).toBe(true) // incidente RESUELTO, nada abierto
    expect(tramos.some(t => t.tipo === 'ROUTER_PROPIO')).toBe(true)
  })

  it('incidente con reapertura: dos ciclos, el hueco de la reapertura no queda cubierto', async () => {
    const cierre1 = horas(3)
    const inicio2 = horas(5)
    // Igual que haría el endpoint real de reabrir: acumula el IEI del ciclo
    // que se cierra ANTES de archivarlo — si no, el "esperado" del script
    // (que lee iei_acumulado de la fila) no reflejaría un incidente real.
    const ieiCiclo1 = calcImpactoRow({
      hora_registro: horas(0), hora_fin: cierre1, estado: 'RESUELTO', tipo: 'CAIDA_TOTAL',
      venta_hora_soles: '100', venta_hora_fds_soles: '150',
      cont_hora_activacion: horas(1), cont_hora_desactivacion: horas(2.5), cont_rendimiento: 'EFECTIVO', cont_es_externo: false,
    }).impactoEconomicoEstimado ?? 0

    await crearIncidente(`${PREFIJO}REAPERTURA`, {
      horaRegistroOriginal: horas(0), horaFinAnterior: cierre1, ieiAcumulado: String(ieiCiclo1),
      mitigacionesPrevias: [{
        clase: 'ROUTER_PROPIO', activadoPor: 'AGENTE', horaActivacion: horas(1), horaDesactivacion: horas(2.5),
        rendimiento: 'EFECTIVO', cerradoEn: cierre1,
      }],
      horaRegistro: inicio2, horaFin: horas(8),
      movActivadoPor: 'AGENTE', movHoraActivacion: horas(6), movHoraDesactivacion: horas(7), movRendimiento: 'PARCIAL',
    })

    const res = await migrarTodo(sql, { prefijoCodigo: PREFIJO })
    expect(res.fallos.filter(f => f.codigoIncidente === `${PREFIJO}REAPERTURA`)).toHaveLength(0)

    const inc = (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, `${PREFIJO}REAPERTURA`)))[0]
    const tramos = await tramosDe(inc.id)
    const cubreElHueco = tramos.some(t =>
      new Date(t.desde).getTime() < inicio2.getTime() && (t.hasta === null || new Date(t.hasta).getTime() > cierre1.getTime()),
    )
    expect(cubreElHueco).toBe(false)
    const horasTotales = tramos.reduce((s, t) => s + (new Date(t.hasta!).getTime() - new Date(t.desde).getTime()) / H, 0)
    expect(horasTotales).toBeCloseTo(6, 6) // 3h + 3h, el hueco de 2h no cuenta
  })

  it('mitigaciones simultáneas: crea el segmento de solape con el tipo ganador', async () => {
    await crearIncidente(`${PREFIJO}SIMULTANEAS`, {
      contActivadoPor: 'AGENTE', contHoraActivacion: horas(0), contHoraDesactivacion: horas(2), contRendimiento: 'PARCIAL', contEsExterno: false,
      movActivadoPor: 'AGENTE', movHoraActivacion: horas(1), movHoraDesactivacion: horas(1.5), movRendimiento: 'EFECTIVO',
    })

    const res = await migrarTodo(sql, { prefijoCodigo: PREFIJO })
    expect(res.fallos.filter(f => f.codigoIncidente === `${PREFIJO}SIMULTANEAS`)).toHaveLength(0)

    const inc = (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, `${PREFIJO}SIMULTANEAS`)))[0]
    const tramos = await tramosDe(inc.id)
    const solape = tramos.find(t => new Date(t.desde).getTime() === horas(1).getTime())
    expect(solape?.tipo).toBe('DATOS_MOVILES')
    expect(Number(solape?.factor)).toBe(0)
  })

  it('timestamp de activación anterior al registro: se recorta y queda anotado en observacion', async () => {
    await crearIncidente(`${PREFIJO}TSANTERIOR`, {
      contActivadoPor: 'AGENTE', contHoraActivacion: horas(-1), contHoraDesactivacion: horas(2),
      contRendimiento: 'EFECTIVO', contEsExterno: false,
    })

    const res = await migrarTodo(sql, { prefijoCodigo: PREFIJO })
    expect(res.fallos.filter(f => f.codigoIncidente === `${PREFIJO}TSANTERIOR`)).toHaveLength(0)

    const inc = (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, `${PREFIJO}TSANTERIOR`)))[0]
    const tramos = await tramosDe(inc.id)
    expect(new Date(tramos[0].desde).getTime()).toBe(horas(0).getTime())
    expect(tramos[0].observacion).toMatch(/anterior al inicio del ciclo/)
  })

  it('rendimiento legado/vacío migra con factor PARCIAL (50%)', async () => {
    await crearIncidente(`${PREFIJO}LEGADO`, {
      contActivadoPor: 'AGENTE', contHoraActivacion: horas(0), contHoraDesactivacion: horas(3),
      contRendimiento: null, contEsExterno: false,
    })

    const res = await migrarTodo(sql, { prefijoCodigo: PREFIJO })
    expect(res.fallos.filter(f => f.codigoIncidente === `${PREFIJO}LEGADO`)).toHaveLength(0)

    const inc = (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, `${PREFIJO}LEGADO`)))[0]
    const tramos = await tramosDe(inc.id)
    expect(tramos.every(t => Number(t.factor) === 0.5)).toBe(true)
  })

  it('caso fabricado para excepción: reabierto más de una vez → NO se migra, queda documentado', async () => {
    await crearIncidente(`${PREFIJO}EXCEPCION`, {
      horaRegistroOriginal: horas(0), horaFinAnterior: horas(6),
      mitigacionesPrevias: [
        { clase: 'ROUTER_PROPIO', horaActivacion: horas(0.5), horaDesactivacion: horas(1), rendimiento: 'EFECTIVO', cerradoEn: horas(2) },
        { clase: 'DATOS_MOVILES', horaActivacion: horas(4), horaDesactivacion: horas(5), rendimiento: 'PARCIAL', cerradoEn: horas(6) },
      ],
      horaRegistro: horas(8), horaFin: horas(9),
    })

    const res = await migrarTodo(sql, { prefijoCodigo: PREFIJO })
    const fallo = res.fallos.find(f => f.codigoIncidente === `${PREFIJO}EXCEPCION`)
    expect(fallo).toBeTruthy()
    expect(fallo!.codigo).toBe('REABERTURAS_MULTIPLES')

    const inc = (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, `${PREFIJO}EXCEPCION`)))[0]
    const tramos = await tramosDe(inc.id)
    expect(tramos).toHaveLength(0) // no se creó nada — no se fuerza

    // El reporte lo deja como excepción real (no hay regla barata para esto hoy)
    const { corregidosOk, excepciones } = reclasificar(res.fallos)
    expect(excepciones.some(e => e.codigoIncidente === `${PREFIJO}EXCEPCION` && e.codigo === 'REABERTURAS_MULTIPLES')).toBe(true)
    expect(corregidosOk).toBe(0)
  })

  it('es idempotente: correr la migración dos veces no duplica tramos ni vuelve a migrar', async () => {
    const primeraCorrida = await migrarTodo(sql, { prefijoCodigo: PREFIJO })
    const segundaCorrida = await migrarTodo(sql, { prefijoCodigo: PREFIJO })

    expect(segundaCorrida.totalMigrados).toBe(0)
    // Todo lo que la primera corrida (o corridas anteriores en este archivo)
    // ya migró exitosamente, la segunda lo encuentra "ya migrado".
    expect(segundaCorrida.totalYaMigrados).toBeGreaterThan(0)
    void primeraCorrida

    const inc = (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, `${PREFIJO}SIMPLE`)))[0]
    const tramos = await tramosDe(inc.id)
    // Sigue habiendo exactamente los mismos tramos que en la primera corrida — no se duplicaron.
    const desdeUnicos = new Set(tramos.map(t => new Date(t.desde).getTime()))
    expect(desdeUnicos.size).toBe(tramos.length)
  })

  it('modo dry-run: cuenta lo que migraría pero no escribe ningún tramo', async () => {
    await crearIncidente(`${PREFIJO}DRYRUN`, {
      contActivadoPor: 'AGENTE', contHoraActivacion: horas(0.5), contHoraDesactivacion: horas(2),
      contRendimiento: 'EFECTIVO', contEsExterno: false,
    })

    const resDry = await migrarTodo(sql, { prefijoCodigo: PREFIJO, dryRun: true })
    expect(resDry.dryRun).toBe(true)
    const falloDry = resDry.fallos.find(f => f.codigoIncidente === `${PREFIJO}DRYRUN`)
    expect(falloDry).toBeUndefined() // habría migrado limpio

    const inc = (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, `${PREFIJO}DRYRUN`)))[0]
    const tramosTrasDry = await tramosDe(inc.id)
    expect(tramosTrasDry).toHaveLength(0) // cero escrituras, aunque el reporte diga que migraría

    // Corriendo SIN dry-run después, el mismo incidente sí migra — confirma que
    // el dry-run no dejó nada a medio escribir ni marcó nada como "ya migrado".
    const resReal = await migrarTodo(sql, { prefijoCodigo: PREFIJO })
    expect(resReal.fallos.filter(f => f.codigoIncidente === `${PREFIJO}DRYRUN`)).toHaveLength(0)
    const tramosTrasReal = await tramosDe(inc.id)
    expect(tramosTrasReal.length).toBeGreaterThan(0)
  })

  it('mov_hora_activacion fantasma (sin movActivadoPor): el "esperado" (ieiConocido) y el reconstruido coinciden, no cae en DIVERGENCIA_IEI', async () => {
    await crearIncidente(`${PREFIJO}MOVFANTASMA`, {
      movActivadoPor: null, movHoraActivacion: horas(0), movHoraDesactivacion: null, movRendimiento: null,
    })

    const res = await migrarTodo(sql, { prefijoCodigo: PREFIJO })
    expect(res.fallos.filter(f => f.codigoIncidente === `${PREFIJO}MOVFANTASMA`)).toHaveLength(0)

    const inc = (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, `${PREFIJO}MOVFANTASMA`)))[0]
    const tramos = await tramosDe(inc.id)
    expect(tramos.every(t => Number(t.factor) === 1.00)).toBe(true) // CAIDA_TOTAL sin mitigación real
  })
})
