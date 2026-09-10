import { describe, it, expect } from 'vitest'

describe('calcIeiEnCurso — IEI en curso del panel de detalle (incidente ABIERTO)', () => {
  const horaRegistro = '2024-01-08T15:00:00.000Z' // lunes 10:00 Lima
  const nowMs = new Date(horaRegistro).getTime() + 2 * 3600000 // 2 horas después

  it('router activo (contActivadoPor + contHoraActivacion) con rendimiento PARCIAL: factor 0.50', async () => {
    const { calcIeiEnCurso } = await import('./page')
    const inc = {
      tiendaVentaHoraSoles: 100, horaRegistro, tipo: 'CAIDA_TOTAL',
      contActivadoPor: 'AGENTE', contHoraActivacion: horaRegistro, contRendimiento: 'PARCIAL',
    }
    const { ieiEnCurso } = calcIeiEnCurso(inc, nowMs)
    expect(ieiEnCurso).toBe(Math.round(100 * 2 * 0.35 * 0.50))
  })

  it('datos móviles activo (movActivadoPor + movHoraActivacion) con rendimiento PARCIAL: factor 0.50', async () => {
    const { calcIeiEnCurso } = await import('./page')
    const inc = {
      tiendaVentaHoraSoles: 100, horaRegistro, tipo: 'CAIDA_TOTAL',
      movActivadoPor: 'AGENTE', movHoraActivacion: horaRegistro, movRendimiento: 'PARCIAL',
    }
    const { ieiEnCurso } = calcIeiEnCurso(inc, nowMs)
    expect(ieiEnCurso).toBe(Math.round(100 * 2 * 0.35 * 0.50))
  })

  it('movHoraActivacion seteado con movActivadoPor vacío → sin mitigación, no datos móviles activo (bug real de producción)', async () => {
    const { calcIeiEnCurso } = await import('./page')
    const inc = {
      tiendaVentaHoraSoles: 100, horaRegistro, tipo: 'CAIDA_TOTAL',
      movHoraActivacion: horaRegistro, movRendimiento: 'PARCIAL', // movActivadoPor vacío
    }
    const { ieiEnCurso } = calcIeiEnCurso(inc, nowMs)
    expect(ieiEnCurso).toBe(Math.round(100 * 2 * 0.35 * 1.00))
  })

  it('sin tiendaVentaHoraSoles: devuelve todo en cero, no lanza', async () => {
    const { calcIeiEnCurso } = await import('./page')
    const inc = { tiendaVentaHoraSoles: null, horaRegistro, tipo: 'CAIDA_TOTAL' }
    const res = calcIeiEnCurso(inc, nowMs)
    expect(res.ieiEnCurso).toBe(0)
    expect(res.segmentosEnCurso).toHaveLength(0)
  })
})

describe('calcIeiTramoAbierto — IEI en vivo del tramo actualmente abierto (tabla de Desglose por tramos)', () => {
  const desde = '2024-01-08T15:00:00.000Z' // lunes 10:00 Lima

  it('crece con el tiempo transcurrido — a las 2h duplica el valor de 1h', async () => {
    const { calcIeiTramoAbierto } = await import('./page')
    const tramo = { desde, hasta: null, factor: '0.50' }
    const tienda = { ventaHoraSoles: 100, ventaHoraFdsSoles: 150 }
    const iei1h = calcIeiTramoAbierto(tramo, tienda, new Date(desde).getTime() + 1 * 3600000)
    const iei2h = calcIeiTramoAbierto(tramo, tienda, new Date(desde).getTime() + 2 * 3600000)
    expect(iei1h).toBe(Math.round(100 * 1 * 0.35 * 0.50))
    expect(iei2h).toBe(Math.round(100 * 2 * 0.35 * 0.50))
    expect(iei2h).toBeGreaterThan(iei1h) // confirma que "se refresca solo" al avanzar el tiempo
  })

  it('tramo ya cerrado (hasta no nulo) → 0, no se calcula en vivo', async () => {
    const { calcIeiTramoAbierto } = await import('./page')
    const tramo = { desde, hasta: '2024-01-08T17:00:00.000Z', factor: '0.50' }
    const iei = calcIeiTramoAbierto(tramo, { ventaHoraSoles: 100, ventaHoraFdsSoles: 150 }, Date.now())
    expect(iei).toBe(0)
  })

  it('sin tramo (null) → 0, no lanza', async () => {
    const { calcIeiTramoAbierto } = await import('./page')
    expect(calcIeiTramoAbierto(null, { ventaHoraSoles: 100, ventaHoraFdsSoles: 150 }, Date.now())).toBe(0)
  })
})

describe('puedeEditarTramo — el botón de editar solo aparece con permiso Y en tramos cerrados', () => {
  it('con permiso y tramo cerrado → true', async () => {
    const { puedeEditarTramo } = await import('./page')
    expect(puedeEditarTramo(true, { hasta: '2024-01-08T17:00:00.000Z' })).toBe(true)
  })

  it('con permiso pero tramo abierto (hasta=null) → false', async () => {
    const { puedeEditarTramo } = await import('./page')
    expect(puedeEditarTramo(true, { hasta: null })).toBe(false)
  })

  it('sin permiso, aunque el tramo esté cerrado → false', async () => {
    const { puedeEditarTramo } = await import('./page')
    expect(puedeEditarTramo(false, { hasta: '2024-01-08T17:00:00.000Z' })).toBe(false)
  })

  it('sin permiso y tramo abierto → false', async () => {
    const { puedeEditarTramo } = await import('./page')
    expect(puedeEditarTramo(false, { hasta: null })).toBe(false)
  })
})

describe('sumaIeiTramos — fila de total de la tabla "Desglose por tramos"', () => {
  it('suma el ie_tramo de los tramos cerrados', async () => {
    const { sumaIeiTramos } = await import('./page')
    const tramos = [
      { hasta: '2024-01-08T16:00:00.000Z', ieTramo: '100' },
      { hasta: '2024-01-08T17:00:00.000Z', ieTramo: '50.5' },
    ]
    expect(sumaIeiTramos(tramos, 0)).toBe(150.5)
  })

  it('agrega el IEI en vivo del tramo abierto, que todavía no tiene ie_tramo', async () => {
    const { sumaIeiTramos } = await import('./page')
    const tramos = [
      { hasta: '2024-01-08T16:00:00.000Z', ieTramo: '100' },
      { hasta: null, ieTramo: null },
    ]
    expect(sumaIeiTramos(tramos, 40)).toBe(140)
  })

  it('el tramo abierto no se cuenta dos veces aunque trajera un ieTramo viejo', async () => {
    const { sumaIeiTramos } = await import('./page')
    const tramos = [{ hasta: null, ieTramo: '999' }]
    expect(sumaIeiTramos(tramos, 25)).toBe(25)
  })

  it('sin tramos y sin abierto → 0', async () => {
    const { sumaIeiTramos } = await import('./page')
    expect(sumaIeiTramos([], 0)).toBe(0)
  })

  it('trata ieTramo nulo de un tramo cerrado como 0, sin devolver NaN', async () => {
    const { sumaIeiTramos } = await import('./page')
    const tramos = [
      { hasta: '2024-01-08T16:00:00.000Z', ieTramo: null },
      { hasta: '2024-01-08T17:00:00.000Z', ieTramo: '30' },
    ]
    expect(sumaIeiTramos(tramos, 0)).toBe(30)
  })
})
