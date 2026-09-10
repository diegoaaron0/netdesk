import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'
import {
  FACTOR_BASE_SIN_MITIGACION,
  factorBaseSinMitigacion,
  normFactorMitigacion,
  calcIeTramo,
  estaActivo,
  validarActivacionMitigacion,
  sumIeiTramos,
} from './mitigacion-tramos'

// Anclas de fecha Lima ya verificadas en el resto del proyecto.
const LUNES_10AM_LIMA  = '2024-01-08T15:00:00.000Z' // lunes 10:00 Lima
const SABADO_10AM_LIMA = '2024-01-06T15:00:00.000Z' // sábado 10:00 Lima
// Caso límite: jueves 23:50 hora Lima, que ya cruzó a viernes en UTC.
const JUEVES_1150PM_LIMA = '2024-01-12T04:50:00.000Z'

function horasDespues(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3600000).toISOString()
}

const TIENDA = { ventaHoraSoles: 100, ventaHoraFdsSoles: 200 }

describe('FACTOR_BASE_SIN_MITIGACION / factorBaseSinMitigacion — tabla explícita, sin fallback silencioso', () => {
  it.each([
    ['CAIDA_TOTAL', 1.00],
    ['INTERMITENCIA', 0.50],
    ['LENTITUD', 0.30],
    ['OTROS', 1.00],
    ['CORTE_ELECTRICO', 1.00],
  ])('%s → %f', (tipo, esperado) => {
    expect(factorBaseSinMitigacion(tipo)).toBe(esperado)
    expect(FACTOR_BASE_SIN_MITIGACION[tipo]).toBe(esperado)
  })

  it('un tipo no reconocido (ej. POS, a propósito excluido de la tabla) lanza error explícito', () => {
    expect(() => factorBaseSinMitigacion('POS')).toThrow()
  })

  it('un tipo inventado también lanza error explícito, no cae a un default silencioso', () => {
    expect(() => factorBaseSinMitigacion('INVENTADO')).toThrow()
  })
})

describe('normFactorMitigacion — escala global única (0% / 50% / 100%), igual para las 4 mitigaciones', () => {
  it.each([
    ['EFECTIVO', 0.00],
    ['PARCIAL', 0.50],
    ['NULO', 1.00],
  ])('%s → %f', (rend, esperado) => {
    expect(normFactorMitigacion(rend)).toBe(esperado)
  })

  it('sin rendimiento registrado → 0.50 (parcial por defecto, mismo criterio conservador de antes)', () => {
    expect(normFactorMitigacion(null)).toBe(0.50)
    expect(normFactorMitigacion(undefined)).toBe(0.50)
  })

  it('un valor no reconocido cae a NULO (1.00), el bucket "sin cobertura confirmada"', () => {
    expect(normFactorMitigacion('ALGO_RARO')).toBe(1.00)
  })

  it('es insensible a mayúsculas/minúsculas', () => {
    expect(normFactorMitigacion('efectivo')).toBe(0.00)
    expect(normFactorMitigacion('parcial')).toBe(0.50)
  })
})

describe('calcIeTramo — tramo SIN_MITIGACION usa FACTOR_BASE_SIN_MITIGACION', () => {
  it('CAIDA_TOTAL en día de semana', () => {
    const iei = calcIeTramo(
      { tipo: 'SIN_MITIGACION', tipoIncidente: 'CAIDA_TOTAL', desde: LUNES_10AM_LIMA, hasta: horasDespues(LUNES_10AM_LIMA, 2) },
      TIENDA,
    )
    expect(iei).toBe(Math.round(100 * 2 * 0.35 * 1.00))
  })

  it('INTERMITENCIA usa 0.50', () => {
    const iei = calcIeTramo(
      { tipo: 'SIN_MITIGACION', tipoIncidente: 'INTERMITENCIA', desde: LUNES_10AM_LIMA, hasta: horasDespues(LUNES_10AM_LIMA, 2) },
      TIENDA,
    )
    expect(iei).toBe(Math.round(100 * 2 * 0.35 * 0.50))
  })

  it('LENTITUD usa 0.30', () => {
    const iei = calcIeTramo(
      { tipo: 'SIN_MITIGACION', tipoIncidente: 'LENTITUD', desde: LUNES_10AM_LIMA, hasta: horasDespues(LUNES_10AM_LIMA, 2) },
      TIENDA,
    )
    expect(iei).toBe(Math.round(100 * 2 * 0.35 * 0.30))
  })

  it('un tramo SIN_MITIGACION sin tipoIncidente lanza error explícito', () => {
    expect(() => calcIeTramo({ tipo: 'SIN_MITIGACION', desde: LUNES_10AM_LIMA, hasta: null } as any, TIENDA)).toThrow()
  })

  it('un tipoIncidente no reconocido (ej. POS) lanza error explícito, no un IEI silenciosamente mal calculado', () => {
    expect(() => calcIeTramo(
      { tipo: 'SIN_MITIGACION', tipoIncidente: 'POS', desde: LUNES_10AM_LIMA, hasta: horasDespues(LUNES_10AM_LIMA, 1) },
      TIENDA,
    )).toThrow()
  })
})

describe('calcIeTramo — escala global (0/50/100%) idéntica para las 4 mitigaciones, sin excepción de boleta', () => {
  const casos: [string, string, number][] = [
    ['ROUTER_PROPIO', 'EFECTIVO', 0.00], ['ROUTER_PROPIO', 'PARCIAL', 0.50], ['ROUTER_PROPIO', 'NULO', 1.00],
    ['ROUTER_EXTERNO', 'EFECTIVO', 0.00], ['ROUTER_EXTERNO', 'PARCIAL', 0.50], ['ROUTER_EXTERNO', 'NULO', 1.00],
    ['DATOS_MOVILES', 'EFECTIVO', 0.00], ['DATOS_MOVILES', 'PARCIAL', 0.50], ['DATOS_MOVILES', 'NULO', 1.00],
    ['BOLETA_MANUAL', 'EFECTIVO', 0.00], ['BOLETA_MANUAL', 'PARCIAL', 0.50], ['BOLETA_MANUAL', 'NULO', 1.00],
  ]

  it.each(casos)('%s con rendimiento %s → factor %f', (tipo, rendimiento, factorEsperado) => {
    const iei = calcIeTramo(
      { tipo: tipo as any, rendimiento, desde: LUNES_10AM_LIMA, hasta: horasDespues(LUNES_10AM_LIMA, 2) },
      TIENDA,
    )
    expect(iei).toBe(Math.round(100 * 2 * 0.35 * factorEsperado))
  })

  it('BOLETA_MANUAL en un incidente CORTE_ELECTRICO ya NO tiene el residual especial (10%/0%) — EFECTIVO da 0% igual que en cualquier otro incidente', () => {
    // La excepción vieja (normBoletaFactor con tipo='CORTE_ELECTRICO') hacía que EFECTIVO diera
    // 0% solo en corte eléctrico, y 10% en cualquier otro tipo. calcIeTramo ya no recibe ni usa
    // el tipo de incidente para mitigaciones activas — la escala es global, sin ese parámetro.
    const iei = calcIeTramo(
      { tipo: 'BOLETA_MANUAL', rendimiento: 'EFECTIVO', desde: LUNES_10AM_LIMA, hasta: horasDespues(LUNES_10AM_LIMA, 2) },
      TIENDA,
    )
    expect(iei).toBe(0)
  })

  it('BOLETA_MANUAL PARCIAL da 50%, no el 30% viejo de la escala de boleta', () => {
    const iei = calcIeTramo(
      { tipo: 'BOLETA_MANUAL', rendimiento: 'PARCIAL', desde: LUNES_10AM_LIMA, hasta: horasDespues(LUNES_10AM_LIMA, 2) },
      TIENDA,
    )
    expect(iei).toBe(Math.round(100 * 2 * 0.35 * 0.50))
  })

  it('un tramo de mitigación sin factor ni rendimiento lanza error explícito', () => {
    expect(() => calcIeTramo({ tipo: 'ROUTER_PROPIO', desde: LUNES_10AM_LIMA, hasta: null } as any, TIENDA)).toThrow()
  })

  it('acepta un factor numérico ya resuelto en vez de rendimiento categórico (forma en que vendrá desde la tabla de tramos)', () => {
    const iei = calcIeTramo(
      { tipo: 'ROUTER_PROPIO', factor: 0.50, desde: LUNES_10AM_LIMA, hasta: horasDespues(LUNES_10AM_LIMA, 2) },
      TIENDA,
    )
    expect(iei).toBe(Math.round(100 * 2 * 0.35 * 0.50))
  })
})

describe('calcIeTramo — tarifa L-J vs V-D en hora Lima', () => {
  it('usa venta_hora_soles (L-J) cuando el tramo empieza lunes', () => {
    const iei = calcIeTramo(
      { tipo: 'SIN_MITIGACION', tipoIncidente: 'CAIDA_TOTAL', desde: LUNES_10AM_LIMA, hasta: horasDespues(LUNES_10AM_LIMA, 1) },
      TIENDA,
    )
    expect(iei).toBe(Math.round(100 * 1 * 0.35 * 1.00))
  })

  it('usa venta_hora_fds_soles (V-D) cuando el tramo empieza sábado', () => {
    const iei = calcIeTramo(
      { tipo: 'SIN_MITIGACION', tipoIncidente: 'CAIDA_TOTAL', desde: SABADO_10AM_LIMA, hasta: horasDespues(SABADO_10AM_LIMA, 1) },
      TIENDA,
    )
    expect(iei).toBe(Math.round(200 * 1 * 0.35 * 1.00))
  })

  it('caso límite: jueves 11:50pm hora Lima usa tarifa L-J, aunque en UTC ya sea viernes', () => {
    const iei = calcIeTramo(
      { tipo: 'SIN_MITIGACION', tipoIncidente: 'CAIDA_TOTAL', desde: JUEVES_1150PM_LIMA, hasta: horasDespues(JUEVES_1150PM_LIMA, 1) },
      TIENDA,
    )
    expect(iei).toBe(Math.round(100 * 1 * 0.35 * 1.00)) // 100 = tarifa L-J, no 200 (FDS)
  })
})

describe('calcIeTramo — tramo abierto (hasta null)', () => {
  it('usa el instante "ahora" explícito que se le pasa, no Date.now() interno', () => {
    const ahora = new Date(horasDespues(LUNES_10AM_LIMA, 3))
    const iei = calcIeTramo(
      { tipo: 'ROUTER_PROPIO', rendimiento: 'NULO', desde: LUNES_10AM_LIMA, hasta: null },
      TIENDA,
      ahora,
    )
    expect(iei).toBe(Math.round(100 * 3 * 0.35 * 1.00))
  })
})

describe('estaActivo — un solo criterio: existe un tramo con ese incidente_id, ese tipo, y hasta IS NULL', () => {
  let incidenteId: string

  // Incidente propio y aislado (no TST-P1-001, que es un fixture compartido por
  // muchos otros archivos de test) — evita colisiones con el índice único parcial
  // cuando la suite corre archivos de test en paralelo.
  beforeAll(async () => {
    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    await db.delete(schema.incidenteMitigacionTramosHistorial).where(
      eq(schema.incidenteMitigacionTramosHistorial.incidenteId,
        (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-MITIGACION-TRAMOS-ESTA-ACTIVO')))[0]?.id ?? '00000000-0000-0000-0000-000000000000'),
    )
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-MITIGACION-TRAMOS-ESTA-ACTIVO'))
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-MITIGACION-TRAMOS-ESTA-ACTIVO', tiendaId: ref.tiendaId, registradoPorId: ref.registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: new Date(),
    }).returning()
    incidenteId = inc.id
  })

  beforeEach(async () => {
    await db.delete(schema.incidenteMitigacionTramosHistorial).where(eq(schema.incidenteMitigacionTramosHistorial.incidenteId, incidenteId))
    await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, incidenteId))
  })

  it('true cuando hay un tramo ABIERTO de ese tipo', async () => {
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId, tipo: 'DATOS_MOVILES', factor: '0.5000', desde: new Date(),
    })
    expect(await estaActivo(incidenteId, 'DATOS_MOVILES')).toBe(true)
  })

  it('false cuando el tramo de ese tipo ya está SELLADO', async () => {
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId, tipo: 'DATOS_MOVILES', factor: '0.5000',
      desde: new Date(Date.now() - 3600000), hasta: new Date(), ieTramo: '10.00',
    })
    expect(await estaActivo(incidenteId, 'DATOS_MOVILES')).toBe(false)
  })

  it('false cuando el tramo abierto es de OTRO tipo', async () => {
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId, tipo: 'ROUTER_PROPIO', factor: '0.0000', desde: new Date(),
    })
    expect(await estaActivo(incidenteId, 'DATOS_MOVILES')).toBe(false)
    expect(await estaActivo(incidenteId, 'ROUTER_PROPIO')).toBe(true)
  })

  it('false cuando no hay ningún tramo para el incidente', async () => {
    expect(await estaActivo(incidenteId, 'ROUTER_PROPIO')).toBe(false)
  })
})

describe('validarActivacionMitigacion — CORTE_ELECTRICO excluye router y datos móviles', () => {
  it.each(['ROUTER_PROPIO', 'ROUTER_EXTERNO', 'DATOS_MOVILES'])(
    'rechaza %s en un incidente CORTE_ELECTRICO',
    (tipo) => {
      expect(() => validarActivacionMitigacion('CORTE_ELECTRICO', tipo as any)).toThrow()
    },
  )

  it('permite BOLETA_MANUAL en un incidente CORTE_ELECTRICO', () => {
    expect(() => validarActivacionMitigacion('CORTE_ELECTRICO', 'BOLETA_MANUAL')).not.toThrow()
  })

  it('permite SIN_MITIGACION en un incidente CORTE_ELECTRICO', () => {
    expect(() => validarActivacionMitigacion('CORTE_ELECTRICO', 'SIN_MITIGACION')).not.toThrow()
  })

  it.each(['ROUTER_PROPIO', 'ROUTER_EXTERNO', 'DATOS_MOVILES', 'BOLETA_MANUAL', 'SIN_MITIGACION'])(
    'permite %s en un incidente que NO es CORTE_ELECTRICO',
    (tipo) => {
      expect(() => validarActivacionMitigacion('CAIDA_TOTAL', tipo as any)).not.toThrow()
    },
  )
})

describe('sumIeiTramos — el IEI total de un incidente es la suma de ie_tramo de todos sus tramos', () => {
  let incidenteId: string

  beforeAll(async () => {
    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    await db.delete(schema.incidenteMitigacionTramosHistorial).where(
      eq(schema.incidenteMitigacionTramosHistorial.incidenteId,
        (await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-MITIGACION-TRAMOS-SUM')))[0]?.id ?? '00000000-0000-0000-0000-000000000000'),
    )
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-MITIGACION-TRAMOS-SUM'))
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-MITIGACION-TRAMOS-SUM', tiendaId: ref.tiendaId, registradoPorId: ref.registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: new Date(),
    }).returning()
    incidenteId = inc.id
  })

  beforeEach(async () => {
    await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, incidenteId))
  })

  it('0 cuando el incidente no tiene ningún tramo', async () => {
    expect(await sumIeiTramos(incidenteId)).toBe(0)
  })

  it('suma los ie_tramo de varios tramos sellados', async () => {
    await db.insert(schema.incidenteMitigacionTramos).values([
      { incidenteId, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: new Date(Date.now() - 7200000), hasta: new Date(Date.now() - 3600000), ieTramo: '100.00' },
      { incidenteId, tipo: 'ROUTER_PROPIO', factor: '0.0000', desde: new Date(Date.now() - 3600000), hasta: new Date(), ieTramo: '0.00' },
    ])
    expect(await sumIeiTramos(incidenteId)).toBe(100)
  })

  it('un tramo abierto (ie_tramo NULL) no rompe la suma — aporta 0', async () => {
    await db.insert(schema.incidenteMitigacionTramos).values([
      { incidenteId, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: new Date(Date.now() - 3600000), hasta: new Date(), ieTramo: '50.00' },
      { incidenteId, tipo: 'DATOS_MOVILES', factor: '0.5000', desde: new Date() }, // abierto, ie_tramo NULL
    ])
    expect(await sumIeiTramos(incidenteId)).toBe(50)
  })
})
