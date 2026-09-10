import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupIncidenteAutoRefresh } from './helpers'

// Fake objects para window/document — no hace falta jsdom, setupIncidenteAutoRefresh
// recibe el target de eventos como parámetro en vez de asumir el global del navegador.
function fakeEventTarget() {
  const listeners: Record<string, (() => void)[]> = {}
  return {
    addEventListener: (type: string, fn: () => void) => { (listeners[type] ??= []).push(fn) },
    removeEventListener: (type: string, fn: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter(f => f !== fn)
    },
    dispatch: (type: string) => { (listeners[type] ?? []).forEach(fn => fn()) },
  }
}

describe('setupIncidenteAutoRefresh — refetch periódico + al recuperar foco (Paso 1)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('llama a fetchInc cada 20s mientras esté habilitado', () => {
    const fetchInc = vi.fn()
    const win = fakeEventTarget()
    const doc = fakeEventTarget() as any
    doc.visibilityState = 'visible'

    setupIncidenteAutoRefresh(fetchInc, { enabled: true, windowTarget: win, documentTarget: doc })

    expect(fetchInc).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20000)
    expect(fetchInc).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(20000)
    expect(fetchInc).toHaveBeenCalledTimes(2)
  })

  it('llama a fetchInc al disparar focus en la ventana, sin esperar el intervalo', () => {
    const fetchInc = vi.fn()
    const win = fakeEventTarget()
    const doc = fakeEventTarget() as any
    doc.visibilityState = 'visible'

    setupIncidenteAutoRefresh(fetchInc, { enabled: true, windowTarget: win, documentTarget: doc })

    win.dispatch('focus')
    expect(fetchInc).toHaveBeenCalledTimes(1)
  })

  it('llama a fetchInc al volver visible la pestaña (visibilitychange), no cuando se oculta', () => {
    const fetchInc = vi.fn()
    const win = fakeEventTarget()
    const doc = fakeEventTarget() as any
    doc.visibilityState = 'hidden'

    setupIncidenteAutoRefresh(fetchInc, { enabled: true, windowTarget: win, documentTarget: doc })

    doc.dispatch('visibilitychange') // se oculta la pestaña
    expect(fetchInc).not.toHaveBeenCalled()

    doc.visibilityState = 'visible'
    doc.dispatch('visibilitychange') // vuelve a estar visible
    expect(fetchInc).toHaveBeenCalledTimes(1)
  })

  it('no hace nada si enabled es false (p.ej. incidente ya RESUELTO)', () => {
    const fetchInc = vi.fn()
    const win = fakeEventTarget()
    const doc = fakeEventTarget() as any

    setupIncidenteAutoRefresh(fetchInc, { enabled: false, windowTarget: win, documentTarget: doc })

    vi.advanceTimersByTime(60000)
    win.dispatch('focus')
    expect(fetchInc).not.toHaveBeenCalled()
  })

  it('la función de limpieza detiene el intervalo y remueve los listeners', () => {
    const fetchInc = vi.fn()
    const win = fakeEventTarget()
    const doc = fakeEventTarget() as any
    doc.visibilityState = 'visible'

    const cleanup = setupIncidenteAutoRefresh(fetchInc, { enabled: true, windowTarget: win, documentTarget: doc })
    cleanup()

    vi.advanceTimersByTime(60000)
    win.dispatch('focus')
    doc.dispatch('visibilitychange')
    expect(fetchInc).not.toHaveBeenCalled()
  })

  it('respeta un intervalMs custom', () => {
    const fetchInc = vi.fn()
    const win = fakeEventTarget()
    const doc = fakeEventTarget() as any
    doc.visibilityState = 'visible'

    setupIncidenteAutoRefresh(fetchInc, { enabled: true, intervalMs: 5000, windowTarget: win, documentTarget: doc })

    vi.advanceTimersByTime(5000)
    expect(fetchInc).toHaveBeenCalledTimes(1)
  })
})
