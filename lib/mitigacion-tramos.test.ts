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
  normalizarMitigaciones,
  calcIeiIncidente,
  getTramosPorIncidentes,
  type SegmentoMitigacion,
} from './mitigacion-tramos'
import { calcImpactoRow, calcImpactoEnCurso } from './impacto-calc'
// calcIeiEnCurso vive en un componente cliente ('use client') — se importa dinámico
// dentro de los tests que lo necesitan, mismo patrón que ya usa page.test.ts.

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

// ─── Fase 5, Paso 2.1 — las 3 funciones centrales ──────────────────────────────
// Objetivo: reemplazar calcImpactoRow + calcImpactoEnCurso + calcIeiEnCurso (las
// 3 copias vivas fuera de esta iniciativa) por un solo punto de entrada. La
// aritmética "sin tramos" NO se reinventa — se compara explícitamente contra
// esas 3 funciones para probar que el número no cambia.

const TIENDA_VENTA = { ventaHoraSoles: 100, ventaHoraFdsSoles: 200 }

function tramo(over: Partial<{
  incidenteId: string; tipo: string; factor: string | number
  desde: string; hasta: string | null; ieTramo: string | number | null
}> = {}) {
  return {
    incidenteId: 'inc-x', tipo: 'ROUTER_PROPIO', factor: '0.0000',
    desde: LUNES_10AM_LIMA, hasta: null, ieTramo: null,
    ...over,
  } as any
}

describe('normalizarMitigaciones — unifica tramos y campos legacy en una sola forma', () => {
  it('con tramos: los mapea 1:1, ordenados por desde, origen TRAMO', () => {
    const tramos = [
      tramo({ tipo: 'DATOS_MOVILES', desde: horasDespues(LUNES_10AM_LIMA, 2), hasta: null }),
      tramo({ tipo: 'SIN_MITIGACION', desde: LUNES_10AM_LIMA, hasta: horasDespues(LUNES_10AM_LIMA, 2), ieTramo: '30.00' }),
    ]
    const inc = { tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: LUNES_10AM_LIMA, horaFin: null }
    const segs = normalizarMitigaciones(inc, tramos)
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ tipo: 'SIN_MITIGACION', origen: 'TRAMO' })
    expect(segs[1]).toMatchObject({ tipo: 'DATOS_MOVILES', origen: 'TRAMO', hasta: null })
  })

  it('sin tramos, RESUELTO, sin ninguna mitigación → un solo segmento SIN_MITIGACION cubriendo todo el incidente', () => {
    const inc = {
      tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      horaRegistro: LUNES_10AM_LIMA, horaFin: horasDespues(LUNES_10AM_LIMA, 2),
    }
    const segs = normalizarMitigaciones(inc, [])
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ tipo: 'SIN_MITIGACION', origen: 'LEGACY' })
    expect(segs[0].desde.toISOString()).toBe(new Date(LUNES_10AM_LIMA).toISOString())
    expect(segs[0].hasta!.toISOString()).toBe(new Date(horasDespues(LUNES_10AM_LIMA, 2)).toISOString())
  })

  it('sin tramos, ABIERTO, router propio activo desde el inicio → segmento con hasta=null (sigue en curso)', () => {
    const inc = {
      tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: LUNES_10AM_LIMA, horaFin: null,
      contActivadoPor: 'AGENTE', contHoraActivacion: LUNES_10AM_LIMA, contRendimiento: 'PARCIAL', contEsExterno: false,
    }
    const segs = normalizarMitigaciones(inc, [])
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ tipo: 'ROUTER_PROPIO', rendimiento: 'PARCIAL', hasta: null, origen: 'LEGACY' })
  })

  it('mov_hora_activacion fantasma (sin mov_activado_por) NO genera segmento — mismo gate que calcImpactoEnCurso', () => {
    const inc = {
      tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: LUNES_10AM_LIMA, horaFin: null,
      movActivadoPor: null, movHoraActivacion: LUNES_10AM_LIMA, movRendimiento: 'PARCIAL',
    }
    const segs = normalizarMitigaciones(inc, [])
    expect(segs.find(s => s.tipo === 'DATOS_MOVILES')).toBeUndefined()
    expect(segs).toHaveLength(1) // solo el relleno SIN_MITIGACION, abierto
    expect(segs[0].tipo).toBe('SIN_MITIGACION')
    expect(segs[0].hasta).toBeNull()
  })

  it('CORTE_ELECTRICO con cont_activado_por seteado (ruido) → el router NO se materializa como segmento', () => {
    const inc = {
      tipo: 'CORTE_ELECTRICO', estado: 'RESUELTO',
      horaRegistro: LUNES_10AM_LIMA, horaFin: horasDespues(LUNES_10AM_LIMA, 2),
      contActivadoPor: 'AGENTE', contHoraActivacion: LUNES_10AM_LIMA, contRendimiento: 'EFECTIVO',
    }
    const segs = normalizarMitigaciones(inc, [])
    expect(segs.find(s => s.tipo === 'ROUTER_PROPIO')).toBeUndefined()
    expect(segs).toHaveLength(1)
    expect(segs[0].tipo).toBe('SIN_MITIGACION')
  })

  it('boleta_manual sin boleta_hora_activacion → cae al inicio del incidente (fallback histórico)', () => {
    const inc = {
      tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      horaRegistro: LUNES_10AM_LIMA, horaFin: horasDespues(LUNES_10AM_LIMA, 2),
      boletaManual: true, boletaRendimiento: 'PARCIAL', boletaHoraActivacion: null,
    }
    const segs = normalizarMitigaciones(inc, [])
    const boleta = segs.find(s => s.tipo === 'BOLETA_MANUAL')
    expect(boleta?.desde.toISOString()).toBe(new Date(LUNES_10AM_LIMA).toISOString())
  })

  it('con mitigaciones_previas (ciclo anterior a una reapertura) → se incluyen como segmentos cerrados', () => {
    const inc = {
      tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: horasDespues(LUNES_10AM_LIMA, 5), horaFin: null,
      mitigacionesPrevias: [{
        clase: 'ROUTER_PROPIO', activadoPor: 'AGENTE',
        horaActivacion: LUNES_10AM_LIMA, horaDesactivacion: horasDespues(LUNES_10AM_LIMA, 2),
        rendimiento: 'EFECTIVO',
      }],
    }
    const segs = normalizarMitigaciones(inc, [])
    const previo = segs.find(s => s.origen === 'LEGACY' && s.tipo === 'ROUTER_PROPIO')
    expect(previo).toBeTruthy()
    expect(previo!.hasta!.toISOString()).toBe(new Date(horasDespues(LUNES_10AM_LIMA, 2)).toISOString())
  })

  it('solapamiento: router activo las primeras 2h, después nada → queda un hueco cubierto por SIN_MITIGACION', () => {
    const inc = {
      tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      horaRegistro: LUNES_10AM_LIMA, horaFin: horasDespues(LUNES_10AM_LIMA, 4),
      contActivadoPor: 'AGENTE', contHoraActivacion: LUNES_10AM_LIMA,
      contHoraDesactivacion: horasDespues(LUNES_10AM_LIMA, 2), contRendimiento: 'EFECTIVO',
    }
    const segs = normalizarMitigaciones(inc, [])
    expect(segs).toHaveLength(2)
    const router = segs.find(s => s.tipo === 'ROUTER_PROPIO')!
    const relleno = segs.find(s => s.tipo === 'SIN_MITIGACION')!
    expect(router.hasta!.toISOString()).toBe(new Date(horasDespues(LUNES_10AM_LIMA, 2)).toISOString())
    expect(relleno.desde.toISOString()).toBe(new Date(horasDespues(LUNES_10AM_LIMA, 2)).toISOString())
    expect(relleno.hasta!.toISOString()).toBe(new Date(horasDespues(LUNES_10AM_LIMA, 4)).toISOString())
  })
})

describe('calcIeiIncidente — reemplaza calcImpactoRow/calcImpactoEnCurso/calcIeiEnCurso, mismo número de siempre', () => {
  describe('con tramos', () => {
    it('suma ie_tramo de los cerrados + calcIeTramo del abierto', () => {
      const inc = { tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: LUNES_10AM_LIMA, horaFin: null }
      const ahora = new Date(horasDespues(LUNES_10AM_LIMA, 3))
      const tramos = [
        tramo({ tipo: 'SIN_MITIGACION', desde: LUNES_10AM_LIMA, hasta: horasDespues(LUNES_10AM_LIMA, 1), ieTramo: '35.00' }),
        tramo({ tipo: 'ROUTER_PROPIO', factor: '0.5000', desde: horasDespues(LUNES_10AM_LIMA, 1), hasta: null }),
      ]
      const { iei } = calcIeiIncidente(inc, tramos, TIENDA_VENTA, ahora)
      const abiertoEsperado = calcIeTramo({ tipo: 'ROUTER_PROPIO', factor: 0.5, desde: horasDespues(LUNES_10AM_LIMA, 1), hasta: null }, TIENDA_VENTA, ahora)
      expect(iei).toBe(35 + abiertoEsperado)
    })

    it('todos los tramos cerrados (incidente resuelto) → solo suma ie_tramo, sin calcIeTramo adicional', () => {
      const inc = { tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', horaRegistro: LUNES_10AM_LIMA, horaFin: horasDespues(LUNES_10AM_LIMA, 2) }
      const tramos = [
        tramo({ tipo: 'SIN_MITIGACION', desde: LUNES_10AM_LIMA, hasta: horasDespues(LUNES_10AM_LIMA, 2), ieTramo: '70.00' }),
      ]
      const { iei, segmentos } = calcIeiIncidente(inc, tramos, TIENDA_VENTA)
      expect(iei).toBe(70)
      expect(segmentos).toHaveLength(1)
    })

    it('suma ieiAcumulado (reaperturas) igual que con la fórmula vieja', () => {
      const inc = { tipo: 'CAIDA_TOTAL', estado: 'RESUELTO', horaRegistro: LUNES_10AM_LIMA, horaFin: horasDespues(LUNES_10AM_LIMA, 2), ieiAcumulado: 40 }
      const tramos = [tramo({ tipo: 'SIN_MITIGACION', desde: LUNES_10AM_LIMA, hasta: horasDespues(LUNES_10AM_LIMA, 2), ieTramo: '70.00' })]
      const { iei } = calcIeiIncidente(inc, tramos, TIENDA_VENTA)
      expect(iei).toBe(110)
    })
  })

  describe('sin tramos, RESUELTO — paridad exacta con calcImpactoRow', () => {
    const casos: [string, any][] = [
      ['sin ninguna mitigación (CAIDA_TOTAL)', {
        tipo: 'CAIDA_TOTAL',
      }],
      ['router EFECTIVO cubre todo', {
        tipo: 'CAIDA_TOTAL',
        contActivadoPor: 'AGENTE', contHoraActivacion: LUNES_10AM_LIMA, contHoraDesactivacion: horasDespues(LUNES_10AM_LIMA, 2), contRendimiento: 'EFECTIVO',
      }],
      ['solapamiento router PARCIAL + datos móviles EFECTIVO → gana el menor factor', {
        tipo: 'CAIDA_TOTAL',
        contActivadoPor: 'AGENTE', contHoraActivacion: LUNES_10AM_LIMA, contHoraDesactivacion: horasDespues(LUNES_10AM_LIMA, 2), contRendimiento: 'PARCIAL',
        movActivadoPor: 'AGENTE', movHoraActivacion: LUNES_10AM_LIMA, movHoraDesactivacion: horasDespues(LUNES_10AM_LIMA, 2), movRendimiento: 'EFECTIVO',
      }],
      ['boleta PARCIAL en falla normal (escala propia, 0.30, no 0.50)', {
        tipo: 'CAIDA_TOTAL',
        boletaManual: true, boletaRendimiento: 'PARCIAL', boletaHoraActivacion: LUNES_10AM_LIMA,
      }],
      ['boleta EFECTIVA en falla normal (residual 0.10, no 0.00)', {
        tipo: 'CAIDA_TOTAL',
        boletaManual: true, boletaRendimiento: 'EFECTIVA', boletaHoraActivacion: LUNES_10AM_LIMA,
      }],
      ['CORTE_ELECTRICO con router EFECTIVO seteado (ruido) → se ignora, factor 1.00', {
        tipo: 'CORTE_ELECTRICO',
        contActivadoPor: 'AGENTE', contHoraActivacion: LUNES_10AM_LIMA, contHoraDesactivacion: horasDespues(LUNES_10AM_LIMA, 2), contRendimiento: 'EFECTIVO',
      }],
      ['CORTE_ELECTRICO con boleta EFECTIVA → residual especial 0.00', {
        tipo: 'CORTE_ELECTRICO',
        boletaManual: true, boletaRendimiento: 'EFECTIVA', boletaHoraActivacion: LUNES_10AM_LIMA,
      }],
      ['router sin rendimiento registrado → parcial 0.50 por defecto', {
        tipo: 'CAIDA_TOTAL',
        contActivadoPor: 'AGENTE', contHoraActivacion: LUNES_10AM_LIMA, contHoraDesactivacion: horasDespues(LUNES_10AM_LIMA, 2), contRendimiento: null,
      }],
    ]

    it.each(casos)('%s', (_label, campos) => {
      const horaRegistro = LUNES_10AM_LIMA
      const horaFin = horasDespues(LUNES_10AM_LIMA, 2)
      const filaVieja = {
        hora_registro: horaRegistro, hora_fin: horaFin, estado: 'RESUELTO',
        tipo: campos.tipo, venta_hora_soles: 100, venta_hora_fds_soles: 200,
        cont_hora_activacion: campos.contActivadoPor ? campos.contHoraActivacion : null,
        cont_hora_desactivacion: campos.contHoraDesactivacion, cont_rendimiento: campos.contRendimiento, cont_es_externo: campos.contEsExterno,
        mov_hora_activacion: campos.movActivadoPor ? campos.movHoraActivacion : null,
        mov_hora_desactivacion: campos.movHoraDesactivacion, mov_rendimiento: campos.movRendimiento,
        boleta_manual: campos.boletaManual, boleta_rendimiento: campos.boletaRendimiento, boleta_hora_activacion: campos.boletaHoraActivacion,
      }
      const esperado = calcImpactoRow(filaVieja).impactoEstimado

      const incNuevo = { ...campos, estado: 'RESUELTO', horaRegistro, horaFin }
      const { iei } = calcIeiIncidente(incNuevo, [], TIENDA_VENTA)
      expect(iei).toBe(esperado)
    })
  })

  describe('sin tramos, ABIERTO — paridad exacta con calcImpactoEnCurso y calcIeiEnCurso', () => {
    const horaRegistro = LUNES_10AM_LIMA
    const nowMs = new Date(horaRegistro).getTime() + 2 * 3600000

    const casos: [string, any][] = [
      ['router PARCIAL en curso', {
        tipo: 'CAIDA_TOTAL',
        contActivadoPor: 'AGENTE', contHoraActivacion: horaRegistro, contRendimiento: 'PARCIAL',
      }],
      ['datos móviles PARCIAL en curso', {
        tipo: 'CAIDA_TOTAL',
        movActivadoPor: 'AGENTE', movHoraActivacion: horaRegistro, movRendimiento: 'PARCIAL',
      }],
      ['mov_hora_activacion fantasma (sin mov_activado_por) → sin mitigación', {
        tipo: 'CAIDA_TOTAL',
        movActivadoPor: null, movHoraActivacion: horaRegistro, movRendimiento: 'PARCIAL',
      }],
      ['boleta manual PARCIAL en curso (0.30)', {
        tipo: 'CAIDA_TOTAL',
        boletaManual: true, boletaRendimiento: 'PARCIAL', boletaHoraActivacion: horaRegistro,
      }],
    ]

    it.each(casos)('%s — igual que calcImpactoEnCurso', (_label, campos) => {
      const filaVieja = {
        iei_venta_hora: 100, hora_registro: horaRegistro, tipo: campos.tipo,
        cont_activado_por: campos.contActivadoPor, cont_hora_activacion: campos.contHoraActivacion, cont_rendimiento: campos.contRendimiento,
        mov_activado_por: campos.movActivadoPor, mov_hora_activacion: campos.movHoraActivacion, mov_rendimiento: campos.movRendimiento,
        boleta_manual: campos.boletaManual, boleta_rendimiento: campos.boletaRendimiento, boleta_hora_activacion: campos.boletaHoraActivacion,
      }
      const esperado = calcImpactoEnCurso(filaVieja, nowMs)

      const incNuevo = { ...campos, estado: 'ABIERTO', horaRegistro, horaFin: null }
      const { iei } = calcIeiIncidente(incNuevo, [], TIENDA_VENTA, new Date(nowMs))
      expect(iei).toBe(esperado)
    })

    it.each(casos)('%s — igual que calcIeiEnCurso (página de detalle)', async (_label, campos) => {
      const { calcIeiEnCurso } = await import('@/app/(dashboard)/incidentes/[id]/page')
      const filaClienteVieja = {
        tiendaVentaHoraSoles: 100, tiendaVentaHoraFdsSoles: 200, horaRegistro, tipo: campos.tipo,
        contActivadoPor: campos.contActivadoPor, contHoraActivacion: campos.contHoraActivacion, contRendimiento: campos.contRendimiento, contEsExterno: campos.contEsExterno,
        movActivadoPor: campos.movActivadoPor, movHoraActivacion: campos.movHoraActivacion, movRendimiento: campos.movRendimiento,
        boletaManual: campos.boletaManual, boletaRendimiento: campos.boletaRendimiento, boletaHoraActivacion: campos.boletaHoraActivacion,
      }
      const esperado = calcIeiEnCurso(filaClienteVieja, nowMs).ieiEnCurso

      const incNuevo = { ...campos, estado: 'ABIERTO', horaRegistro, horaFin: null }
      const { iei } = calcIeiIncidente(incNuevo, [], TIENDA_VENTA, new Date(nowMs))
      expect(iei).toBe(esperado)
    })
  })

  it('sin tramos, ABIERTO, con ieiAcumulado de una reapertura previa → se suma igual que "ieiEnCurso + ieiAcumPrev" en el detalle', () => {
    const inc = {
      tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: LUNES_10AM_LIMA, horaFin: null, ieiAcumulado: 25,
      contActivadoPor: 'AGENTE', contHoraActivacion: LUNES_10AM_LIMA, contRendimiento: 'PARCIAL',
    }
    const nowMs = new Date(LUNES_10AM_LIMA).getTime() + 2 * 3600000
    const { iei } = calcIeiIncidente(inc, [], TIENDA_VENTA, new Date(nowMs))
    const enCursoSolo = calcImpactoEnCurso({
      iei_venta_hora: 100, hora_registro: LUNES_10AM_LIMA, tipo: 'CAIDA_TOTAL',
      cont_activado_por: 'AGENTE', cont_hora_activacion: LUNES_10AM_LIMA, cont_rendimiento: 'PARCIAL',
    }, nowMs)
    expect(iei).toBe(enCursoSolo + 25)
  })
})

describe('getTramosPorIncidentes — trae tramos de varios incidentes en una sola query', () => {
  let idA: string, idB: string, idC: string

  beforeAll(async () => {
    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    for (const codigo of ['TST-BULK-TRAMOS-A', 'TST-BULK-TRAMOS-B', 'TST-BULK-TRAMOS-C']) {
      const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
      if (prev) {
        await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
        await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
      }
    }
    const [a] = await db.insert(schema.incidentes).values({
      codigo: 'TST-BULK-TRAMOS-A', tiendaId: ref.tiendaId, registradoPorId: ref.registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: new Date(),
    }).returning()
    const [b] = await db.insert(schema.incidentes).values({
      codigo: 'TST-BULK-TRAMOS-B', tiendaId: ref.tiendaId, registradoPorId: ref.registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: new Date(),
    }).returning()
    const [c] = await db.insert(schema.incidentes).values({
      codigo: 'TST-BULK-TRAMOS-C', tiendaId: ref.tiendaId, registradoPorId: ref.registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro: new Date(),
    }).returning()
    idA = a.id; idB = b.id; idC = c.id

    await db.insert(schema.incidenteMitigacionTramos).values([
      { incidenteId: idA, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: new Date(Date.now() - 7200000), hasta: new Date(Date.now() - 3600000), ieTramo: '10.00' },
      { incidenteId: idA, tipo: 'ROUTER_PROPIO', factor: '0.0000', desde: new Date(Date.now() - 3600000) }, // abierto
      { incidenteId: idB, tipo: 'DATOS_MOVILES', factor: '0.5000', desde: new Date(Date.now() - 1800000), hasta: new Date(), ieTramo: '5.00' },
      // idC no tiene ningún tramo
    ])
  })

  it('agrupa correctamente por incidente, en una sola consulta', async () => {
    const mapa = await getTramosPorIncidentes([idA, idB, idC])
    expect(mapa.get(idA)).toHaveLength(2)
    expect(mapa.get(idB)).toHaveLength(1)
    expect(mapa.get(idC) ?? []).toHaveLength(0)
  })

  it('con soloAbiertos: true, excluye los tramos ya sellados', async () => {
    const mapa = await getTramosPorIncidentes([idA, idB], { soloAbiertos: true })
    expect(mapa.get(idA)).toHaveLength(1)
    expect(mapa.get(idA)![0].tipo).toBe('ROUTER_PROPIO')
    expect(mapa.get(idB) ?? []).toHaveLength(0) // el único tramo de B ya está sellado
  })

  it('lista vacía de IDs → Map vacío, sin explotar', async () => {
    const mapa = await getTramosPorIncidentes([])
    expect(mapa.size).toBe(0)
  })
})
