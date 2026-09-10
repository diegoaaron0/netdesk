import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupIncidenteAutoRefresh, buildDescartes } from './helpers'

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

describe('buildDescartes — líneas que ve el proveedor en el correo de escalamiento', () => {
  it('los Sí/No distinguen OK de Falla, y el null se omite (nunca respondido)', () => {
    expect(buildDescartes({ descEnergia: true })).toContain('Energía verificada: OK')
    expect(buildDescartes({ descEnergia: false })).toContain('Energía verificada: Falla')
    expect(buildDescartes({ descEnergia: null, descRouter: true })).not.toContain('Energía')

    expect(buildDescartes({ descRouter: true })).toContain('Router/ONT verificado: OK')
    expect(buildDescartes({ descRouter: false })).toContain('Router/ONT verificado: Falla')
  })

  it('los checkboxes solo aparecen cuando están en true', () => {
    const todos = buildDescartes({
      checkIpconfig: true, checkPingGw: true, checkPingInternet: true,
      checkTracert: true, checkDns: true, checkRenovarIp: true,
    })
    expect(todos).toContain('Ipconfig ejecutado')
    expect(todos).toContain('Ping a gateway')
    expect(todos).toContain('Ping a internet')
    expect(todos).toContain('Tracert ejecutado')
    expect(todos).toContain('Validó DNS')
    expect(todos).toContain('Renovó IP')

    expect(buildDescartes({ checkIpconfig: false })).not.toContain('Ipconfig')
  })

  it('descartesDetallado tiene prioridad sobre el descartesRealizados legado', () => {
    const conAmbos = buildDescartes({ descartesDetallado: 'detalle nuevo', descartesRealizados: 'texto viejo' })
    expect(conAmbos).toContain('detalle nuevo')
    expect(conAmbos).not.toContain('texto viejo')
    expect(buildDescartes({ descartesRealizados: 'texto viejo' })).toContain('texto viejo')
  })

  it('sin ningún descarte cargado avisa que está pendiente', () => {
    expect(buildDescartes({})).toBe('Pendiente de documentar')
  })
})

describe('buildDescartes — descartes nuevos del rediseño (capa física y reinicio)', () => {
  it('cableado distingue OK de Falla y omite el null', () => {
    expect(buildDescartes({ descCableado: true })).toContain('Cableado verificado: OK')
    expect(buildDescartes({ descCableado: false })).toContain('Cableado verificado: Falla')
    expect(buildDescartes({ descCableado: null, descRouter: true })).not.toContain('Cableado')
  })

  it('el reinicio del equipo se lee como Sí/No, no como OK/Falla', () => {
    expect(buildDescartes({ descReinicioEquipo: true })).toContain('Equipo reiniciado: Sí')
    expect(buildDescartes({ descReinicioEquipo: false })).toContain('Equipo reiniciado: No')
    expect(buildDescartes({ descReinicioEquipo: null, descRouter: true })).not.toContain('reiniciado')
  })

  it('un incidente histórico con "Se cambió DNS" lo sigue mostrando', () => {
    expect(buildDescartes({ descDns: true })).toContain('Cambio DNS aplicado: OK')
    expect(buildDescartes({ descDns: false })).toContain('Cambio DNS aplicado: Falla')
  })

  it('un incidente nuevo, sin descDns, no menciona el cambio de DNS', () => {
    const nuevo = buildDescartes({
      descEnergia: true, descRouter: true, descCableado: true, descReinicioEquipo: true,
      checkIpconfig: true, checkDns: true,
    })
    expect(nuevo).not.toContain('Cambio DNS aplicado')
    expect(nuevo).toContain('Validó DNS')
  })

  it('los 4 grupos conviven en el mismo correo', () => {
    const completo = buildDescartes({
      descEnergia: true, descRouter: false, descCableado: true,
      descReinicioEquipo: true,
      checkIpconfig: true, checkRenovarIp: true, checkPingGw: true,
      checkPingInternet: true, checkTracert: true,
      checkDns: true,
    })
    const lineas = completo.split('\n')
    expect(lineas).toHaveLength(10)
    expect(completo).toContain('Energía verificada: OK')
    expect(completo).toContain('Cableado verificado: OK')
    expect(completo).toContain('Equipo reiniciado: Sí')
    expect(completo).toContain('Renovó IP')
    expect(completo).toContain('Validó DNS')
  })
})
