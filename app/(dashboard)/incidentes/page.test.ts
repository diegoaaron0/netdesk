import { describe, it, expect } from 'vitest'
import { buildIncidentesListaUrl, tieneAlgunaMitigacionActiva } from './page'

describe('buildIncidentesListaUrl (Paso 1 — auto-refresh de la cola sin resetear la página)', () => {
  it('usa fechaDesde/fechaHasta cuando no hay búsqueda de texto', () => {
    const url = buildIncidentesListaUrl({ estado: '', agente: '', debouncedQ: '', fechaDesde: '2026-08-01', fechaHasta: '2026-08-30' })
    expect(url).toContain('fechaDesde=2026-08-01')
    expect(url).toContain('fechaHasta=2026-08-30')
    expect(url).not.toContain('q=')
  })

  it('usa q en vez de fechas cuando hay búsqueda de texto', () => {
    const url = buildIncidentesListaUrl({ estado: '', agente: '', debouncedQ: 'T20', fechaDesde: '2026-08-01', fechaHasta: '2026-08-30' })
    expect(url).toContain('q=T20')
    expect(url).not.toContain('fechaDesde')
    expect(url).not.toContain('fechaHasta')
  })

  it('incluye estado y agente cuando están seteados', () => {
    const url = buildIncidentesListaUrl({ estado: 'ABIERTO', agente: 'agente-id-1', debouncedQ: '', fechaDesde: '2026-08-01', fechaHasta: '2026-08-30' })
    expect(url).toContain('estado=ABIERTO')
    expect(url).toContain('agente=agente-id-1')
  })

  it('omite estado y agente cuando están vacíos', () => {
    const url = buildIncidentesListaUrl({ estado: '', agente: '', debouncedQ: '', fechaDesde: '2026-08-01', fechaHasta: '2026-08-30' })
    expect(url).not.toContain('estado=')
    expect(url).not.toContain('agente=')
  })
})

describe('tieneAlgunaMitigacionActiva — badges Cont./Datos de la lista (Fase 5, Paso 2.2)', () => {
  it('true si mitigacionesActivas incluye alguno de los tipos pedidos', () => {
    expect(tieneAlgunaMitigacionActiva({ mitigacionesActivas: ['ROUTER_PROPIO'] }, ['ROUTER_PROPIO', 'ROUTER_EXTERNO'])).toBe(true)
    expect(tieneAlgunaMitigacionActiva({ mitigacionesActivas: ['ROUTER_EXTERNO'] }, ['ROUTER_PROPIO', 'ROUTER_EXTERNO'])).toBe(true)
    expect(tieneAlgunaMitigacionActiva({ mitigacionesActivas: ['DATOS_MOVILES'] }, ['DATOS_MOVILES'])).toBe(true)
  })

  it('false si mitigacionesActivas no incluye ninguno de los tipos pedidos', () => {
    expect(tieneAlgunaMitigacionActiva({ mitigacionesActivas: ['DATOS_MOVILES'] }, ['ROUTER_PROPIO', 'ROUTER_EXTERNO'])).toBe(false)
    expect(tieneAlgunaMitigacionActiva({ mitigacionesActivas: [] }, ['ROUTER_PROPIO'])).toBe(false)
  })

  it('false, sin explotar, cuando mitigacionesActivas no viene (undefined/null)', () => {
    expect(tieneAlgunaMitigacionActiva({}, ['ROUTER_PROPIO'])).toBe(false)
    expect(tieneAlgunaMitigacionActiva({ mitigacionesActivas: null }, ['ROUTER_PROPIO'])).toBe(false)
  })
})
