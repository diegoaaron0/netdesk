import { describe, it, expect } from 'vitest'
import { construirTramosIncidente, type IncidenteMigracionInput, type TiendaVentaInput, type TramoConstruido } from './migracion-tramos-historicos'
import { calcImpactoRow } from './impacto-calc'

const H = 3600000
// Lunes 10am Lima (día de semana, no FDS) — misma ancla usada en impacto-calc.test.ts.
const BASE = new Date('2024-01-08T15:00:00.000Z').getTime()
function horas(n: number): Date { return new Date(BASE + n * H) }

const tienda: TiendaVentaInput = { venta_hora_soles: 100, venta_hora_fds_soles: 150, cluster: 'B' }

function baseIncidente(overrides: Partial<IncidenteMigracionInput> = {}): IncidenteMigracionInput {
  return {
    id: 'test-id', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
    horaRegistro: horas(0), horaFin: horas(3),
    horaRegistroOriginal: null, horaFinAnterior: null, mitigacionesPrevias: null,
    contActivadoPor: null, contHoraActivacion: null, contHoraDesactivacion: null,
    contRendimiento: null, contObservacion: null, contEsExterno: null, routerExternoId: null,
    movActivadoPor: null, movHoraActivacion: null, movHoraDesactivacion: null,
    movRendimiento: null, movObservacion: null,
    boletaManual: null, boletaRendimiento: null, boletaHoraActivacion: null,
    ...overrides,
  }
}

function sumIe(tramos: TramoConstruido[]): number {
  return tramos.reduce((s, t) => s + (t.ieTramo ?? 0), 0)
}

/** IEI "ya conocido" de UN ciclo, vía la fórmula actual (misma que usa la
 *  app hoy para cada ciclo cerrado). */
function ieiConocidoDeCiclo(campos: {
  horaRegistro: Date; horaFin: Date | null; tipo?: string
  contActivadoPor?: string | null; contHoraActivacion?: Date | null; contHoraDesactivacion?: Date | null
  contRendimiento?: string | null; contEsExterno?: boolean | null
  movActivadoPor?: string | null; movHoraActivacion?: Date | null; movHoraDesactivacion?: Date | null; movRendimiento?: string | null
  boletaManual?: boolean | null; boletaRendimiento?: string | null; boletaHoraActivacion?: Date | null
}): number {
  return calcImpactoRow({
    hora_registro: campos.horaRegistro, hora_fin: campos.horaFin, estado: 'RESUELTO', tipo: campos.tipo ?? 'CAIDA_TOTAL',
    venta_hora_soles: tienda.venta_hora_soles, venta_hora_fds_soles: tienda.venta_hora_fds_soles, cluster: tienda.cluster,
    cont_hora_activacion: campos.contActivadoPor ? campos.contHoraActivacion : null,
    cont_hora_desactivacion: campos.contHoraDesactivacion, cont_rendimiento: campos.contRendimiento, cont_es_externo: campos.contEsExterno,
    mov_hora_activacion: campos.movHoraActivacion, mov_hora_desactivacion: campos.movHoraDesactivacion, mov_rendimiento: campos.movRendimiento,
    boleta_manual: campos.boletaManual, boleta_rendimiento: campos.boletaRendimiento, boleta_hora_activacion: campos.boletaHoraActivacion,
  }).impactoEconomicoEstimado ?? 0
}

const tolerancia = (n: number) => Math.max(2, n)

function assertCobertura(tramos: TramoConstruido[], desde: Date, hasta: Date | null) {
  const ord = [...tramos].sort((a, b) => a.desde.getTime() - b.desde.getTime())
  expect(ord[0].desde.getTime()).toBe(desde.getTime())
  if (hasta) {
    expect(ord[ord.length - 1].hasta!.getTime()).toBe(hasta.getTime())
  } else {
    expect(ord[ord.length - 1].hasta).toBeNull()
  }
  for (let i = 0; i < ord.length - 1; i++) {
    expect(ord[i].hasta!.getTime()).toBe(ord[i + 1].desde.getTime())
  }
}

describe('construirTramosIncidente — incidente simple, una sola mitigación', () => {
  it('router propio EFECTIVO en medio del incidente — cubre sin huecos y coincide con calcImpactoRow', () => {
    const inc = baseIncidente({
      contActivadoPor: 'AGENTE', contHoraActivacion: horas(0.5), contHoraDesactivacion: horas(2),
      contRendimiento: 'EFECTIVO', contEsExterno: false,
    })
    const r = construirTramosIncidente(inc, tienda)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    assertCobertura(r.tramos, horas(0), horas(3))
    expect(r.tramos.some(t => t.tipo === 'ROUTER_PROPIO' && t.factor === 0)).toBe(true)

    const esperado = ieiConocidoDeCiclo({ horaRegistro: horas(0), horaFin: horas(3), contActivadoPor: 'AGENTE', contHoraActivacion: horas(0.5), contHoraDesactivacion: horas(2), contRendimiento: 'EFECTIVO', contEsExterno: false })
    expect(Math.abs(sumIe(r.tramos) - esperado)).toBeLessThanOrEqual(tolerancia(r.tramos.length))
  })

  it('incidente ABIERTO (sin horaFin): el último tramo queda abierto', () => {
    const inc = baseIncidente({
      estado: 'ABIERTO', horaFin: null,
      contActivadoPor: 'AGENTE', contHoraActivacion: horas(0.5), contHoraDesactivacion: null, contRendimiento: 'PARCIAL', contEsExterno: false,
    })
    const ahora = horas(1.5)
    const r = construirTramosIncidente(inc, tienda, ahora)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    assertCobertura(r.tramos, horas(0), null)
    const abiertos = r.tramos.filter(t => t.hasta === null)
    expect(abiertos).toHaveLength(1)
    expect(abiertos[0].ieTramo).toBeNull()
    expect(abiertos[0].tipo).toBe('ROUTER_PROPIO')
  })
})

describe('construirTramosIncidente — mitigaciones simultáneas', () => {
  it('router PARCIAL + datos móviles EFECTIVO solapados — gana el menor factor durante el solape', () => {
    const inc = baseIncidente({
      contActivadoPor: 'AGENTE', contHoraActivacion: horas(0), contHoraDesactivacion: horas(2), contRendimiento: 'PARCIAL', contEsExterno: false,
      movActivadoPor: 'AGENTE', movHoraActivacion: horas(1), movHoraDesactivacion: horas(1.5), movRendimiento: 'EFECTIVO',
    })
    const r = construirTramosIncidente(inc, tienda)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    assertCobertura(r.tramos, horas(0), horas(3))
    const solape = r.tramos.find(t => t.desde.getTime() === horas(1).getTime())
    expect(solape?.tipo).toBe('DATOS_MOVILES')
    expect(solape?.factor).toBe(0)

    const esperado = ieiConocidoDeCiclo({
      horaRegistro: horas(0), horaFin: horas(3),
      contActivadoPor: 'AGENTE', contHoraActivacion: horas(0), contHoraDesactivacion: horas(2), contRendimiento: 'PARCIAL', contEsExterno: false,
      movActivadoPor: 'AGENTE', movHoraActivacion: horas(1), movHoraDesactivacion: horas(1.5), movRendimiento: 'EFECTIVO',
    })
    expect(Math.abs(sumIe(r.tramos) - esperado)).toBeLessThanOrEqual(tolerancia(r.tramos.length))
  })
})

describe('construirTramosIncidente — casos raros conocidos', () => {
  it('activación con timestamp anterior a hora_registro: se recorta y se anota el original', () => {
    const inc = baseIncidente({
      contActivadoPor: 'AGENTE', contHoraActivacion: horas(-1), contHoraDesactivacion: horas(2),
      contRendimiento: 'EFECTIVO', contEsExterno: false,
    })
    const r = construirTramosIncidente(inc, tienda)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    assertCobertura(r.tramos, horas(0), horas(3))
    expect(r.tramos[0].desde.getTime()).toBe(horas(0).getTime())
    expect(r.tramos[0].observacion).toMatch(/anterior al inicio del ciclo/)
  })

  it('rendimiento legado/vacío cae a PARCIAL (50%, el valor actual)', () => {
    const inc = baseIncidente({
      contActivadoPor: 'AGENTE', contHoraActivacion: horas(0), contHoraDesactivacion: horas(3),
      contRendimiento: null, contEsExterno: false,
    })
    const r = construirTramosIncidente(inc, tienda)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tramos.every(t => t.factor === 0.5)).toBe(true)
  })

  it('fila de mitigaciones_previas sin horaDesactivacion usa cerradoEn', () => {
    const cierre1 = horas(3)
    const inc = baseIncidente({
      horaRegistroOriginal: horas(0), horaFinAnterior: cierre1,
      mitigacionesPrevias: [{
        clase: 'ROUTER_PROPIO', activadoPor: 'AGENTE', horaActivacion: horas(1),
        horaDesactivacion: null, rendimiento: 'EFECTIVO', cerradoEn: cierre1,
      }],
      horaRegistro: horas(5), horaFin: horas(6),
    })
    const r = construirTramosIncidente(inc, tienda)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const routerTramo = r.tramos.find(t => t.tipo === 'ROUTER_PROPIO')
    expect(routerTramo?.hasta?.getTime()).toBe(cierre1.getTime())
  })
})

describe('construirTramosIncidente — con reapertura', () => {
  it('dos ciclos, cada uno con su propia mitigación — el hueco de la reapertura NO se cubre', () => {
    const cierre1 = horas(3)
    const inicio2 = horas(5) // 2h de hueco real entre resolver y reabrir
    const inc = baseIncidente({
      horaRegistroOriginal: horas(0), horaFinAnterior: cierre1,
      mitigacionesPrevias: [{
        clase: 'ROUTER_PROPIO', activadoPor: 'AGENTE', horaActivacion: horas(1), horaDesactivacion: horas(2.5),
        rendimiento: 'EFECTIVO', cerradoEn: cierre1,
      }],
      horaRegistro: inicio2, horaFin: horas(8),
      movActivadoPor: 'AGENTE', movHoraActivacion: horas(6), movHoraDesactivacion: horas(7), movRendimiento: 'PARCIAL',
    })
    const r = construirTramosIncidente(inc, tienda)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const ord = [...r.tramos].sort((a, b) => a.desde.getTime() - b.desde.getTime())
    // ciclo 1 cubre [0,3) sin huecos, ciclo 2 cubre [5,8) sin huecos — nada cubre [3,5).
    expect(ord[0].desde.getTime()).toBe(horas(0).getTime())
    expect(ord.some(t => t.hasta?.getTime() === cierre1.getTime())).toBe(true)
    expect(ord.some(t => t.desde.getTime() === inicio2.getTime())).toBe(true)
    expect(ord[ord.length - 1].hasta!.getTime()).toBe(horas(8).getTime())
    const horasTotales = r.tramos.reduce((s, t) => s + (t.hasta!.getTime() - t.desde.getTime()) / H, 0)
    expect(horasTotales).toBeCloseTo(3 + 3, 6) // 3h del ciclo 1 + 3h del ciclo 2, el hueco de 2h no cuenta

    const esperado =
      ieiConocidoDeCiclo({ horaRegistro: horas(0), horaFin: cierre1, contActivadoPor: 'AGENTE', contHoraActivacion: horas(1), contHoraDesactivacion: horas(2.5), contRendimiento: 'EFECTIVO', contEsExterno: false }) +
      ieiConocidoDeCiclo({ horaRegistro: inicio2, horaFin: horas(8), movActivadoPor: 'AGENTE', movHoraActivacion: horas(6), movHoraDesactivacion: horas(7), movRendimiento: 'PARCIAL' })
    expect(Math.abs(sumIe(r.tramos) - esperado)).toBeLessThanOrEqual(tolerancia(r.tramos.length))
  })
})

describe('construirTramosIncidente — excepciones (no se fuerza la migración)', () => {
  it('reabierto más de una vez → excepción REABERTURAS_MULTIPLES, no se inventa el inicio de los ciclos intermedios', () => {
    const inc = baseIncidente({
      horaRegistroOriginal: horas(0), horaFinAnterior: horas(6),
      mitigacionesPrevias: [
        { clase: 'ROUTER_PROPIO', horaActivacion: horas(0.5), horaDesactivacion: horas(1), rendimiento: 'EFECTIVO', cerradoEn: horas(2) },
        { clase: 'DATOS_MOVILES', horaActivacion: horas(4), horaDesactivacion: horas(5), rendimiento: 'PARCIAL', cerradoEn: horas(6) },
      ],
      horaRegistro: horas(8), horaFin: horas(9),
    })
    const r = construirTramosIncidente(inc, tienda)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('REABERTURAS_MULTIPLES')
  })

  it('boleta_manual activo + incidente reabierto → excepción BOLETA_CON_REAPERTURA, no se adivina a qué ciclo pertenece', () => {
    const inc = baseIncidente({
      horaRegistroOriginal: horas(0), horaFinAnterior: horas(3), mitigacionesPrevias: [],
      horaRegistro: horas(5), horaFin: horas(6),
      boletaManual: true, boletaRendimiento: 'PARCIAL', boletaHoraActivacion: horas(1),
    })
    const r = construirTramosIncidente(inc, tienda)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('BOLETA_CON_REAPERTURA')
  })

  it('reabertura inconsistente (horaRegistroOriginal difiere pero horaFinAnterior es null) → excepción', () => {
    const inc = baseIncidente({ horaRegistroOriginal: horas(-2), horaFinAnterior: null })
    const r = construirTramosIncidente(inc, tienda)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('REABERTURA_INCONSISTENTE')
  })

  it('sin venta_hora ni cluster con fallback → excepción SIN_VENTA_HORA', () => {
    const inc = baseIncidente()
    const r = construirTramosIncidente(inc, { venta_hora_soles: null, venta_hora_fds_soles: null, cluster: null })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('SIN_VENTA_HORA')
  })
})

describe('construirTramosIncidente — CORTE_ELECTRICO (solo boleta aplica)', () => {
  it('boleta manual en corte eléctrico — router/datos móviles se ignoran aunque existan', () => {
    const inc = baseIncidente({
      tipo: 'CORTE_ELECTRICO',
      contActivadoPor: 'AGENTE', contHoraActivacion: horas(0), contHoraDesactivacion: horas(3), contRendimiento: 'EFECTIVO', contEsExterno: false,
      boletaManual: true, boletaRendimiento: 'PARCIAL', boletaHoraActivacion: horas(1),
    })
    const r = construirTramosIncidente(inc, tienda)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    assertCobertura(r.tramos, horas(0), horas(3))
    expect(r.tramos.some(t => t.tipo === 'ROUTER_PROPIO')).toBe(false)
    const boletaTramo = r.tramos.find(t => t.tipo === 'BOLETA_MANUAL')
    expect(boletaTramo).toBeTruthy()

    const esperado = ieiConocidoDeCiclo({ horaRegistro: horas(0), horaFin: horas(3), tipo: 'CORTE_ELECTRICO', boletaManual: true, boletaRendimiento: 'PARCIAL', boletaHoraActivacion: horas(1) })
    expect(Math.abs(sumIe(r.tramos) - esperado)).toBeLessThanOrEqual(tolerancia(r.tramos.length))
  })
})
