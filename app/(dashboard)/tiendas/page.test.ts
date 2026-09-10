import { describe, it, expect } from 'vitest'

describe('rangoDePeriodo — presets del filtro de período de la lista de tiendas', () => {
  // 2026-09-10 10:00 Lima
  const ahora = new Date('2026-09-10T15:00:00.000Z').getTime()

  it('30d: los últimos 30 días terminando hoy', async () => {
    const { rangoDePeriodo } = await import('./page')
    expect(rangoDePeriodo('30d', '', '', ahora)).toEqual({ desde: '2026-08-11', hasta: '2026-09-10' })
  })

  it('3m / 6m / año retroceden meses de calendario, no bloques de 30 días', async () => {
    const { rangoDePeriodo } = await import('./page')
    expect(rangoDePeriodo('3m',   '', '', ahora).desde).toBe('2026-06-10')
    expect(rangoDePeriodo('6m',   '', '', ahora).desde).toBe('2026-03-10')
    expect(rangoDePeriodo('anio', '', '', ahora).desde).toBe('2025-09-10')
  })

  it('el día se acota al último del mes destino: 31/05 menos 3 meses es 28/02, no 03/03', async () => {
    const { rangoDePeriodo } = await import('./page')
    // 2026-05-31 10:00 Lima
    const finDeMayo = new Date('2026-05-31T15:00:00.000Z').getTime()
    expect(rangoDePeriodo('3m', '', '', finDeMayo).desde).toBe('2026-02-28')
  })

  it('el rango se calcula en hora Lima: a las 21:00 del 9 "hoy" sigue siendo el 9, aunque en UTC ya sea el 10', async () => {
    const { rangoDePeriodo } = await import('./page')
    // 2026-09-10T02:00Z = 2026-09-09 21:00 Lima
    const nocheDelNueve = new Date('2026-09-10T02:00:00.000Z').getTime()
    expect(rangoDePeriodo('30d', '', '', nocheDelNueve).hasta).toBe('2026-09-09')
  })

  it('custom devuelve las fechas elegidas tal cual', async () => {
    const { rangoDePeriodo } = await import('./page')
    expect(rangoDePeriodo('custom', '2026-01-01', '2026-03-31', ahora))
      .toEqual({ desde: '2026-01-01', hasta: '2026-03-31' })
  })

  it('custom sin ambas fechas devuelve vacío — la pantalla no manda rango y cae al default del backend', async () => {
    const { rangoDePeriodo } = await import('./page')
    expect(rangoDePeriodo('custom', '2026-01-01', '', ahora).hasta).toBe('')
  })
})
