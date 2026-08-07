import { describe, it, expect } from 'vitest'
import { calcImpactoRow, normContFactor, normBoletaFactor } from './impacto-calc'

// Anclas de fecha conocidas (verificadas): 2024-01-08 es lunes, 2024-01-06 es sábado.
// Los timestamps se guardan en UTC; Lima es UTC-5, así que sumamos 5h en el ISO
// para que el "reloj de pared" en Lima caiga en la hora que queremos probar.
const LUNES_10AM_LIMA   = '2024-01-08T15:00:00.000Z' // lunes 10:00 Lima
const SABADO_10AM_LIMA  = '2024-01-06T15:00:00.000Z' // sábado 10:00 Lima
const DOMINGO_10AM_LIMA = '2024-01-07T15:00:00.000Z' // domingo 10:00 Lima

function horasDespues(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3600000).toISOString()
}

describe('impacto-calc — resolveVentaHora (día de semana vs fin de semana)', () => {
  it('usa venta_hora_soles en un día de semana (lunes)', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA,
      hora_fin: horasDespues(LUNES_10AM_LIMA, 2),
      estado: 'RESUELTO',
      tipo: 'CAIDA_TOTAL',
      venta_hora_soles: 100,
      venta_hora_fds_soles: 999, // no debe usarse en día de semana
    })
    expect(res.faltaInformacion).toBe(false)
    expect(res.ventaHora).toBe(100)
    expect(res.factorAplicado).toBe(1)
    expect(res.impactoEconomicoEstimado).toBe(Math.round(100 * 2 * 0.35 * 1))
  })

  it('usa venta_hora_fds_soles en fin de semana (sábado)', () => {
    const res = calcImpactoRow({
      hora_registro: SABADO_10AM_LIMA,
      hora_fin: horasDespues(SABADO_10AM_LIMA, 3),
      estado: 'RESUELTO',
      tipo: 'CAIDA_TOTAL',
      venta_hora_soles: 999, // no debe usarse en fin de semana
      venta_hora_fds_soles: 200,
    })
    expect(res.ventaHora).toBe(200)
    expect(res.impactoEconomicoEstimado).toBe(Math.round(200 * 3 * 0.35 * 1))
  })

  it('usa venta_hora_fds_soles también en domingo', () => {
    const res = calcImpactoRow({
      hora_registro: DOMINGO_10AM_LIMA,
      hora_fin: horasDespues(DOMINGO_10AM_LIMA, 1),
      estado: 'RESUELTO',
      tipo: 'CAIDA_TOTAL',
      venta_hora_soles: 999,
      venta_hora_fds_soles: 300,
    })
    expect(res.ventaHora).toBe(300)
  })

  it('cae al valor de relleno por cluster cuando no hay venta/hora propia', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA,
      hora_fin: horasDespues(LUNES_10AM_LIMA, 1),
      estado: 'RESUELTO',
      tipo: 'CAIDA_TOTAL',
      cluster: 'B',
    })
    expect(res.ventaHora).toBe(360) // CLUSTER_FALLBACK_HORA.B
  })

  it('sin venta/hora ni cluster → falta información, IEI 0', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA,
      hora_fin: horasDespues(LUNES_10AM_LIMA, 1),
      estado: 'RESUELTO',
      tipo: 'CAIDA_TOTAL',
    })
    expect(res.faltaInformacion).toBe(true)
    expect(res.motivoFactor).toBe('Sin venta/hora para esta tienda.')
    expect(res.impactoEstimado).toBe(0)
  })
})

describe('impacto-calc — casos guardia', () => {
  it('incidente no resuelto → falta información', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA,
      hora_fin: null,
      estado: 'ABIERTO',
      tipo: 'CAIDA_TOTAL',
      venta_hora_soles: 100,
    })
    expect(res.faltaInformacion).toBe(true)
    expect(res.motivoFactor).toBe('Incidente no resuelto.')
  })
})

describe('impacto-calc — sin mitigación (factor base por tipo)', () => {
  it('CAIDA_TOTAL → factor 1.00', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA, hora_fin: horasDespues(LUNES_10AM_LIMA, 1),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL', venta_hora_soles: 100,
    })
    expect(res.factorAplicado).toBe(1)
    expect(res.motivoFactor).toBe('sin mitigación')
  })

  it('INTERMITENCIA → factor 0.50', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA, hora_fin: horasDespues(LUNES_10AM_LIMA, 1),
      estado: 'RESUELTO', tipo: 'INTERMITENCIA', venta_hora_soles: 100,
    })
    expect(res.factorAplicado).toBe(0.5)
  })

  it('LENTITUD → factor 0.30', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA, hora_fin: horasDespues(LUNES_10AM_LIMA, 1),
      estado: 'RESUELTO', tipo: 'LENTITUD', venta_hora_soles: 100,
    })
    expect(res.factorAplicado).toBe(0.3)
  })
})

describe('impacto-calc — con mitigación de red (contingencia) formato nuevo', () => {
  it('EFECTIVO cubre todo el incidente → factor 0.00', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA,
      hora_fin: horasDespues(LUNES_10AM_LIMA, 2),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL', venta_hora_soles: 100,
      cont_hora_activacion: LUNES_10AM_LIMA,
      cont_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 2),
      cont_rendimiento: 'EFECTIVO',
    })
    expect(res.factorAplicado).toBe(0)
    expect(res.impactoEconomicoEstimado).toBe(0)
  })

  it('PARCIAL cubre todo el incidente → factor 0.20', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA,
      hora_fin: horasDespues(LUNES_10AM_LIMA, 2),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL', venta_hora_soles: 100,
      cont_hora_activacion: LUNES_10AM_LIMA,
      cont_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 2),
      cont_rendimiento: 'PARCIAL',
    })
    expect(res.factorAplicado).toBe(0.2)
  })

  it('NULO cubre todo el incidente → factor 1.00', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA,
      hora_fin: horasDespues(LUNES_10AM_LIMA, 2),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL', venta_hora_soles: 100,
      cont_hora_activacion: LUNES_10AM_LIMA,
      cont_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 2),
      cont_rendimiento: 'NULO',
    })
    expect(res.factorAplicado).toBe(1)
  })

  it('sin rendimiento registrado → se asume parcial (0.20) por defecto', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA,
      hora_fin: horasDespues(LUNES_10AM_LIMA, 2),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL', venta_hora_soles: 100,
      cont_hora_activacion: LUNES_10AM_LIMA,
      cont_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 2),
      cont_rendimiento: null,
    })
    expect(res.factorAplicado).toBe(0.2)
  })
})

describe('impacto-calc — normContFactor: solo formato nuevo (post-migración, Paso 3)', () => {
  it.each([
    ['EFECTIVO', 0.00],
    ['PARCIAL', 0.20],
    ['NULO', 1.00],
  ])('normContFactor(%s) === %f', (valor, esperado) => {
    expect(normContFactor(valor)).toBe(esperado)
  })

  it('valor nulo/indefinido → 0.20 (parcial por defecto)', () => {
    expect(normContFactor(null)).toBe(0.20)
    expect(normContFactor(undefined)).toBe(0.20)
  })

  it('es insensible a mayúsculas/minúsculas', () => {
    expect(normContFactor('efectivo')).toBe(0.00)
    expect(normContFactor('parcial')).toBe(0.20)
  })

  // El soporte de valores legado (TOTAL/EFECTIVA/LIMITADA/FALLIDA/NO_FUNCIONO/
  // INOPERATIVA) se eliminó a propósito en el Paso 3 — los datos ya guardados
  // se migraron una sola vez (scripts/migrate-rendimiento-legado.ts) a
  // EFECTIVO/PARCIAL/NULO. Cualquier valor legado que aparezca de ahora en
  // adelante (no debería) cae al mismo lugar que cualquier valor desconocido:
  // se trata como NULO (1.00), el bucket "sin cobertura confirmada".
  it('un valor legado ya no se reconoce como sinónimo — cae al mismo bucket que cualquier valor desconocido (NULO)', () => {
    for (const legadoVal of ['TOTAL', 'EFECTIVA', 'LIMITADA', 'FALLIDA', 'NO_FUNCIONO', 'INOPERATIVA']) {
      expect(normContFactor(legadoVal)).toBe(1.00)
    }
  })
})

describe('impacto-calc — múltiples mitigaciones simultáneas: gana la de menor pérdida', () => {
  it('router PARCIAL (0.20) + datos móviles EFECTIVO (0.00) simultáneos → se queda con 0.00', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA,
      hora_fin: horasDespues(LUNES_10AM_LIMA, 2),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL', venta_hora_soles: 100,
      cont_hora_activacion: LUNES_10AM_LIMA,
      cont_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 2),
      cont_rendimiento: 'PARCIAL',
      mov_hora_activacion: LUNES_10AM_LIMA,
      mov_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 2),
      mov_rendimiento: 'EFECTIVO',
    })
    expect(res.factorAplicado).toBe(0)
    expect(res.motivoFactor).toContain('datos móviles')
  })

  it('router EFECTIVO (0.00) + datos móviles NULO (1.00) + boleta NULA (1.00) → se queda con 0.00 (router)', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA,
      hora_fin: horasDespues(LUNES_10AM_LIMA, 2),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL', venta_hora_soles: 100,
      cont_hora_activacion: LUNES_10AM_LIMA,
      cont_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 2),
      cont_rendimiento: 'EFECTIVO',
      mov_hora_activacion: LUNES_10AM_LIMA,
      mov_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 2),
      mov_rendimiento: 'NULO',
      boleta_manual: true,
      boleta_rendimiento: 'NULA',
      boleta_hora_activacion: LUNES_10AM_LIMA,
    })
    expect(res.factorAplicado).toBe(0)
    expect(res.impactoEconomicoEstimado).toBe(0)
  })
})

describe('impacto-calc — corte eléctrico vs falla normal', () => {
  it('corte eléctrico sin boleta → factor 1.00 (igual que sin mitigación)', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA, hora_fin: horasDespues(LUNES_10AM_LIMA, 2),
      estado: 'RESUELTO', tipo: 'CORTE_ELECTRICO', venta_hora_soles: 100,
    })
    expect(res.factorAplicado).toBe(1)
  })

  it('corte eléctrico: el router/datos móviles NO influyen en el cálculo', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA, hora_fin: horasDespues(LUNES_10AM_LIMA, 2),
      estado: 'RESUELTO', tipo: 'CORTE_ELECTRICO', venta_hora_soles: 100,
      cont_hora_activacion: LUNES_10AM_LIMA,
      cont_hora_desactivacion: horasDespues(LUNES_10AM_LIMA, 2),
      cont_rendimiento: 'EFECTIVO', // sería factor 0.00 en falla normal — en corte no cuenta
    })
    expect(res.factorAplicado).toBe(1) // sigue en 1.00: la contingencia de red se ignora
  })

  it('corte eléctrico + boleta EFECTIVA desde el inicio → factor 0.00 (cubre 100%)', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA, hora_fin: horasDespues(LUNES_10AM_LIMA, 2),
      estado: 'RESUELTO', tipo: 'CORTE_ELECTRICO', venta_hora_soles: 100,
      boleta_manual: true, boleta_rendimiento: 'EFECTIVA', boleta_hora_activacion: LUNES_10AM_LIMA,
    })
    expect(res.factorAplicado).toBe(0)
    expect(res.impactoEconomicoEstimado).toBe(0)
  })

  it('falla normal (no corte) + boleta EFECTIVA desde el inicio → factor 0.10 residual (NO es 0.00)', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA, hora_fin: horasDespues(LUNES_10AM_LIMA, 2),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL', venta_hora_soles: 100,
      boleta_manual: true, boleta_rendimiento: 'EFECTIVA', boleta_hora_activacion: LUNES_10AM_LIMA,
    })
    expect(res.factorAplicado).toBe(0.10)
    expect(res.impactoEconomicoEstimado).toBeGreaterThan(0)
  })

  it('falla normal + boleta PARCIAL → factor 0.30', () => {
    const res = calcImpactoRow({
      hora_registro: LUNES_10AM_LIMA, hora_fin: horasDespues(LUNES_10AM_LIMA, 2),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL', venta_hora_soles: 100,
      boleta_manual: true, boleta_rendimiento: 'PARCIAL', boleta_hora_activacion: LUNES_10AM_LIMA,
    })
    expect(res.factorAplicado).toBe(0.30)
  })
})

describe('normBoletaFactor — mapeo directo', () => {
  it('corte eléctrico: EFECTIVA/TOTAL → 0.00 residual', () => {
    expect(normBoletaFactor('EFECTIVA', 'CORTE_ELECTRICO')).toBe(0.00)
    expect(normBoletaFactor('TOTAL', 'CORTE_ELECTRICO')).toBe(0.00)
  })
  it('falla normal: EFECTIVA/TOTAL → 0.10 residual', () => {
    expect(normBoletaFactor('EFECTIVA', 'CAIDA_TOTAL')).toBe(0.10)
  })
  it('PARCIAL → 0.30 en ambos casos', () => {
    expect(normBoletaFactor('PARCIAL', 'CAIDA_TOTAL')).toBe(0.30)
    expect(normBoletaFactor('PARCIAL', 'CORTE_ELECTRICO')).toBe(0.30)
  })
  it('NULA → 1.00', () => {
    expect(normBoletaFactor('NULA', 'CAIDA_TOTAL')).toBe(1.00)
  })
})
