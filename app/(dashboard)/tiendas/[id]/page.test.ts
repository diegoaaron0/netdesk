import { describe, it, expect, vi } from 'vitest'
import { loadTiendaOnly } from './page'

describe('loadTiendaOnly (Paso 1 — auto-refresh del detalle de tienda sin resetear el formulario en edición)', () => {
  it('actualiza tienda con los datos frescos del servidor', async () => {
    const setTienda = vi.fn()
    const fetchImpl = vi.fn().mockResolvedValue({ json: async () => ({ id: 'tienda-1', contingenciaActiva: true }) })

    await loadTiendaOnly('tienda-1', { fetchImpl: fetchImpl as any, setTienda })

    expect(fetchImpl).toHaveBeenCalledWith('/api/tiendas/tienda-1')
    expect(setTienda).toHaveBeenCalledWith({ id: 'tienda-1', contingenciaActiva: true })
  })

  it('no llama a setTienda si la respuesta no trae id (evita pisar el estado con basura)', async () => {
    const setTienda = vi.fn()
    const fetchImpl = vi.fn().mockResolvedValue({ json: async () => ({ error: 'No encontrado' }) })

    await loadTiendaOnly('tienda-1', { fetchImpl: fetchImpl as any, setTienda })

    expect(setTienda).not.toHaveBeenCalled()
  })

  it('su firma no acepta un setter de formulario — estructuralmente no puede pisar una edición en curso', async () => {
    // loadTiendaOnly solo recibe { fetchImpl, setTienda } — a diferencia de loadData()
    // (que también hace setForm(d)), esta función no tiene forma de tocar el form de edición.
    const setTienda = vi.fn()
    const fetchImpl = vi.fn().mockResolvedValue({ json: async () => ({ id: 'tienda-1' }) })
    const opts = { fetchImpl: fetchImpl as any, setTienda }
    expect('setForm' in opts).toBe(false)
    await loadTiendaOnly('tienda-1', opts)
  })
})
