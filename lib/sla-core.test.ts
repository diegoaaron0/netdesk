import { describe, it, expect } from 'vitest'
import { calcSLARow } from './sla-core'

const T0 = '2024-01-08T15:00:00.000Z' // hora_registro
function minDespues(iso: string, min: number): string {
  return new Date(new Date(iso).getTime() + min * 60000).toISOString()
}

describe('sla-core — no evaluable', () => {
  it('nunca se escaló (hora_correo_n1 null) → no evaluable', () => {
    const res = calcSLARow({
      tipo: 'CAIDA_TOTAL',
      hora_correo_n1: null,
      hora_primera_resp: null,
      hora_fin: null,
      hora_registro: T0,
      max_nivel: 0,
    })
    expect(res.evaluable).toBe(false)
    expect(res.slaGeneral).toBe(false)
  })
})

describe('sla-core — SLA por defecto (respuesta 60min / resolución 90min)', () => {
  it('respuesta y resolución dentro del límite → cumple ambos', () => {
    const correoN1 = minDespues(T0, 5)
    const respuesta = minDespues(correoN1, 50) // 50 <= 60 → cumple respuesta
    const fin = minDespues(respuesta, 80)      // 80 <= 90 → cumple resolución
    const res = calcSLARow({
      tipo: 'CAIDA_TOTAL',
      hora_correo_n1: correoN1,
      hora_primera_resp: respuesta,
      hora_fin: fin,
      hora_registro: T0,
      max_nivel: 1,
    })
    expect(res.evaluable).toBe(true)
    expect(res.slaRespuestaObj).toBe(60)
    expect(res.slaResolucionObj).toBe(90)
    expect(res.tPrimeraRespuestaMin).toBe(50)
    expect(res.tResolucionMin).toBe(80)
    expect(res.slaRespuesta).toBe(true)
    expect(res.slaResolucion).toBe(true)
    expect(res.slaGeneral).toBe(true)
  })

  it('respuesta pasada de 60min → incumple respuesta aunque resolución esté bien', () => {
    const correoN1 = minDespues(T0, 5)
    const respuesta = minDespues(correoN1, 61) // > 60
    const fin = minDespues(respuesta, 10)
    const res = calcSLARow({
      tipo: 'CAIDA_TOTAL',
      hora_correo_n1: correoN1,
      hora_primera_resp: respuesta,
      hora_fin: fin,
      hora_registro: T0,
      max_nivel: 1,
    })
    expect(res.slaRespuesta).toBe(false)
    expect(res.slaResolucion).toBe(true)
    expect(res.slaGeneral).toBe(false)
    expect(res.motivoIncumplimiento).toBe('Respuesta fuera de tiempo')
  })

  it('resolución pasada de 90min → incumple resolución aunque respuesta esté bien', () => {
    const correoN1 = minDespues(T0, 5)
    const respuesta = minDespues(correoN1, 30)
    const fin = minDespues(respuesta, 91) // > 90
    const res = calcSLARow({
      tipo: 'CAIDA_TOTAL',
      hora_correo_n1: correoN1,
      hora_primera_resp: respuesta,
      hora_fin: fin,
      hora_registro: T0,
      max_nivel: 1,
    })
    expect(res.slaRespuesta).toBe(true)
    expect(res.slaResolucion).toBe(false)
    expect(res.slaGeneral).toBe(false)
    expect(res.motivoIncumplimiento).toBe('Resolución fuera de tiempo')
  })

  it('el tipo de incidente NO cambia el límite SLA (mismos 60/90 para todos los tipos)', () => {
    const correoN1 = minDespues(T0, 5)
    const respuesta = minDespues(correoN1, 50)
    const fin = minDespues(respuesta, 80)
    for (const tipo of ['CAIDA_TOTAL', 'INTERMITENCIA', 'LENTITUD', 'POS']) {
      const res = calcSLARow({
        tipo, hora_correo_n1: correoN1, hora_primera_resp: respuesta,
        hora_fin: fin, hora_registro: T0, max_nivel: 1,
      })
      expect(res.slaRespuestaObj).toBe(60)
      expect(res.slaResolucionObj).toBe(90)
    }
  })
})

describe('sla-core — SLA de contrato específico (override distinto al default)', () => {
  it('contrato con SLA de resolución más laxo (120min) permite un tiempo que con el default incumpliría', () => {
    const correoN1 = minDespues(T0, 5)
    const respuesta = minDespues(correoN1, 30)
    const fin = minDespues(respuesta, 100) // > 90 default, pero <= 120 del contrato
    const res = calcSLARow({
      tipo: 'CAIDA_TOTAL',
      hora_correo_n1: correoN1,
      hora_primera_resp: respuesta,
      hora_fin: fin,
      hora_registro: T0,
      max_nivel: 1,
      slaResolucionOverride: 120,
    })
    expect(res.slaResolucionObj).toBe(120)
    expect(res.slaResolucion).toBe(true)
    expect(res.slaGeneral).toBe(true)
  })

  it('contrato con SLA de respuesta más estricto (30min) incumple un tiempo que con el default cumpliría', () => {
    const correoN1 = minDespues(T0, 5)
    const respuesta = minDespues(correoN1, 40) // <= 60 default, pero > 30 del contrato
    const fin = minDespues(respuesta, 10)
    const res = calcSLARow({
      tipo: 'CAIDA_TOTAL',
      hora_correo_n1: correoN1,
      hora_primera_resp: respuesta,
      hora_fin: fin,
      hora_registro: T0,
      max_nivel: 1,
      slaRespuestaOverride: 30,
    })
    expect(res.slaRespuestaObj).toBe(30)
    expect(res.slaRespuesta).toBe(false)
    expect(res.slaGeneral).toBe(false)
  })

  it('con ambos overrides de contrato aplicados a la vez', () => {
    const correoN1 = minDespues(T0, 5)
    const respuesta = minDespues(correoN1, 20)
    const fin = minDespues(respuesta, 40)
    const res = calcSLARow({
      tipo: 'CAIDA_TOTAL',
      hora_correo_n1: correoN1,
      hora_primera_resp: respuesta,
      hora_fin: fin,
      hora_registro: T0,
      max_nivel: 1,
      slaRespuestaOverride: 25,
      slaResolucionOverride: 45,
    })
    expect(res.slaRespuestaObj).toBe(25)
    expect(res.slaResolucionObj).toBe(45)
    expect(res.slaRespuesta).toBe(true)
    expect(res.slaResolucion).toBe(true)
    expect(res.slaGeneral).toBe(true)
  })
})

describe('sla-core — sin respuesta del proveedor', () => {
  it('escalado pero sin hora_primera_resp → slaRespuesta false, score 0', () => {
    const correoN1 = minDespues(T0, 5)
    const res = calcSLARow({
      tipo: 'CAIDA_TOTAL',
      hora_correo_n1: correoN1,
      hora_primera_resp: null,
      hora_fin: null,
      hora_registro: T0,
      max_nivel: 1,
    })
    expect(res.slaRespuesta).toBe(false)
    expect(res.scoreRespuesta).toBe(0)
    expect(res.scoreResolucion).toBe(0)
    expect(res.motivoIncumplimiento).toBe('Sin respuesta')
  })
})
