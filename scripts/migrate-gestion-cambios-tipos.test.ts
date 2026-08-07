import { describe, it, expect } from 'vitest'
import { mapTipoAccionLegado, MAPEO_TIPO_LEGADO } from './migrate-gestion-cambios-tipos'

describe('migrate-gestion-cambios-tipos — mapeo de fusión (fuente única usada también por el CASE de la migración SQL)', () => {
  it('CAMBIO_PROVEEDOR → CAMBIO_CONTRATO', () => {
    expect(mapTipoAccionLegado('CAMBIO_PROVEEDOR')).toBe('CAMBIO_CONTRATO')
  })

  it('ACTUALIZACION_PLAN → CAMBIO_CONTRATO (fusión con CAMBIO_PROVEEDOR)', () => {
    expect(mapTipoAccionLegado('ACTUALIZACION_PLAN')).toBe('CAMBIO_CONTRATO')
  })

  it('RENEGOCIACION_CONTRATO → RENOVACION_CONTRATO (solo renombre)', () => {
    expect(mapTipoAccionLegado('RENEGOCIACION_CONTRATO')).toBe('RENOVACION_CONTRATO')
  })

  it('los tipos fuera de alcance quedan intactos (AUDITORIA_PROVEEDOR, ADQUISICION_EQUIPO, PLAN_MEJORA)', () => {
    expect(mapTipoAccionLegado('AUDITORIA_PROVEEDOR')).toBe('AUDITORIA_PROVEEDOR')
    expect(mapTipoAccionLegado('ADQUISICION_EQUIPO')).toBe('ADQUISICION_EQUIPO')
    expect(mapTipoAccionLegado('PLAN_MEJORA')).toBe('PLAN_MEJORA')
  })

  it('un tipo ya migrado (nuevo) es idempotente: se conserva igual si se le vuelve a aplicar el mapeo', () => {
    expect(mapTipoAccionLegado('CAMBIO_CONTRATO')).toBe('CAMBIO_CONTRATO')
    expect(mapTipoAccionLegado('RENOVACION_CONTRATO')).toBe('RENOVACION_CONTRATO')
    expect(mapTipoAccionLegado('BAJA_CONTRATO')).toBe('BAJA_CONTRATO')
  })

  it('el mapeo no tiene entradas huérfanas: todo valor legado mapea a uno de los 3 tipos nuevos', () => {
    const NUEVOS = ['RENOVACION_CONTRATO', 'CAMBIO_CONTRATO', 'BAJA_CONTRATO']
    for (const nuevo of Object.values(MAPEO_TIPO_LEGADO)) {
      expect(NUEVOS).toContain(nuevo)
    }
  })
})
