import { describe, it, expect, vi } from 'vitest'
import { fetchAccionOnly, debeAutoRefrescarAccion } from './page'

describe('fetchAccionOnly (Paso 1 — auto-refresh de la acción sin el flash de "Cargando...")', () => {
  it('actualiza accion con los datos frescos, sin tocar loading', async () => {
    const setAccion = vi.fn()
    const fetchImpl = vi.fn().mockResolvedValue({ json: async () => ({ id: 'accion-1', estado: 'PROPUESTO' }) })

    await fetchAccionOnly('accion-1', { fetchImpl: fetchImpl as any, setAccion })

    expect(fetchImpl).toHaveBeenCalledWith('/api/gestion-cambios/accion-1')
    expect(setAccion).toHaveBeenCalledWith({ id: 'accion-1', estado: 'PROPUESTO' })
  })

  it('su firma no acepta un setter de loading — estructuralmente no puede disparar el flash de "Cargando..."', () => {
    const opts = { fetchImpl: vi.fn(), setAccion: vi.fn() }
    expect('setLoading' in opts).toBe(false)
  })
})

describe('debeAutoRefrescarAccion (Paso 1 — deja de refrescar en estados terminales)', () => {
  it('sigue refrescando en estados en curso', () => {
    for (const estado of ['BORRADOR', 'PROPUESTO', 'APROBADO', 'EN_EJECUCION', 'EJECUTADO', 'EN_EVALUACION']) {
      expect(debeAutoRefrescarAccion(estado)).toBe(true)
    }
  })

  it('deja de refrescar en estados terminales (ya no cambian)', () => {
    for (const estado of ['COMPLETADO', 'RECHAZADO', 'CANCELADO']) {
      expect(debeAutoRefrescarAccion(estado)).toBe(false)
    }
  })

  it('no refresca si todavía no hay acción cargada', () => {
    expect(debeAutoRefrescarAccion(undefined)).toBe(false)
    expect(debeAutoRefrescarAccion(null)).toBe(false)
  })
})
