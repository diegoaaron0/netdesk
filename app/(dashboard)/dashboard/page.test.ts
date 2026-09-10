import { describe, it, expect } from 'vitest'

describe('getEstadoOpClient — respeta el override de SLA por ficha (Paso 2)', () => {
  it('una tienda con override de 120 min NO se marca SLA_VENCIDO a los 95 min (el default sería 90)', async () => {
    const { getEstadoOpClient } = await import('./page')
    const horaRegistro = new Date(Date.now() - 95 * 60000).toISOString()
    const inc = { hora_registro: horaRegistro, estado: 'ABIERTO', pendiente_proveedor: false, sla_resolucion_override: 120 }

    const { estadoOp } = getEstadoOpClient(inc, Date.now())
    expect(estadoOp).not.toBe('SLA_VENCIDO')
  })

  it('sin override, usa el default de 90 min (SÍ se marca SLA_VENCIDO a los 95 min)', async () => {
    const { getEstadoOpClient } = await import('./page')
    const horaRegistro = new Date(Date.now() - 95 * 60000).toISOString()
    const inc = { hora_registro: horaRegistro, estado: 'ABIERTO', pendiente_proveedor: false, sla_resolucion_override: null }

    const { estadoOp } = getEstadoOpClient(inc, Date.now())
    expect(estadoOp).toBe('SLA_VENCIDO')
  })
})
