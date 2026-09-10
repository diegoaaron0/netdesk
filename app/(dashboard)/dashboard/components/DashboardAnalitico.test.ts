import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => vi.useRealTimers())

describe('todayStr/firstDayOfMonth — calculan "hoy" en hora Lima, no UTC (Paso 2)', () => {
  // 11pm hora Lima del 3-sep-2026 = 04:00 UTC del 4-sep-2026. Antes de este fix,
  // el filtro "hasta" del Analítico se precargaba con el día UTC (4-sep), un día
  // adelantado respecto al día real en Lima (3-sep).
  it('todayStr(): a las 11pm hora Lima, devuelve el día de Lima, no el de UTC (que ya es el día siguiente)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T04:00:00.000Z'))

    const { todayStr } = await import('./DashboardAnalitico')
    expect(todayStr()).toBe('2026-09-03')
  })

  it('firstDayOfMonth(): a las 11pm hora Lima del último día del mes, sigue devolviendo el mes correcto en Lima', async () => {
    // 31-ago-2026 11pm Lima = 1-sep-2026 04:00 UTC — en UTC ya es setiembre.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T04:00:00.000Z'))

    const { firstDayOfMonth } = await import('./DashboardAnalitico')
    expect(firstDayOfMonth()).toBe('2026-08-01')
  })

  it('lejos de medianoche, ambas coinciden con el día/mes esperado', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T15:00:00.000Z')) // 10am Lima, sin ambigüedad

    const { todayStr, firstDayOfMonth } = await import('./DashboardAnalitico')
    expect(todayStr()).toBe('2026-09-15')
    expect(firstDayOfMonth()).toBe('2026-09-01')
  })
})
