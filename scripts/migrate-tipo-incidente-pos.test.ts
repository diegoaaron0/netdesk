import { describe, it, expect } from 'vitest'
import { mapTipoIncidenteLegado, MAPEO_TIPO_INCIDENTE_LEGADO } from './migrate-tipo-incidente-pos'

describe('migrate-tipo-incidente-pos — mapeo de fusión (fuente única usada también por el CASE de la migración SQL)', () => {
  it('POS -> OTROS', () => {
    expect(mapTipoIncidenteLegado('POS')).toBe('OTROS')
  })

  it('los tipos fuera de alcance quedan intactos', () => {
    expect(mapTipoIncidenteLegado('CAIDA_TOTAL')).toBe('CAIDA_TOTAL')
    expect(mapTipoIncidenteLegado('INTERMITENCIA')).toBe('INTERMITENCIA')
    expect(mapTipoIncidenteLegado('LENTITUD')).toBe('LENTITUD')
    expect(mapTipoIncidenteLegado('CORTE_ELECTRICO')).toBe('CORTE_ELECTRICO')
  })

  it('un tipo ya migrado (OTROS) es idempotente: se conserva igual si se le vuelve a aplicar el mapeo', () => {
    expect(mapTipoIncidenteLegado('OTROS')).toBe('OTROS')
  })

  it('el mapeo no tiene entradas huérfanas: todo valor legado mapea a un tipo que sigue existiendo en el enum nuevo', () => {
    const NUEVOS = ['CAIDA_TOTAL', 'INTERMITENCIA', 'LENTITUD', 'OTROS', 'CORTE_ELECTRICO']
    for (const nuevo of Object.values(MAPEO_TIPO_INCIDENTE_LEGADO)) {
      expect(NUEVOS).toContain(nuevo)
    }
  })
})
