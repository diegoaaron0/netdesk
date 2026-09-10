import { describe, it, expect } from 'vitest'
import type { RawIncidente } from '@/lib/dashboard-queries'

function baseIncidente(overrides: Partial<RawIncidente> = {}): RawIncidente {
  return {
    id: 'test-id', codigo: 'TST-ANALITICO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
    mttr_minutos: 120, evaluable_proveedor: true, resuelto_por: null,
    hora_registro: new Date('2024-01-08T15:00:00.000Z'), // lunes 10am Lima
    hora_fin: new Date('2024-01-08T17:00:00.000Z'),
    proveedor_id: null, tienda_id: 'tienda-1', tienda_codigo: 'T-1', tienda_nombre: null,
    tienda_distrito: null, cluster: null, supervisor_nombre: null,
    venta_hora_soles: 100, venta_hora_fds_soles: 150, tiene_contingencia: false, contingencia_activa: false,
    prov_nombre: null, dia_semana: 1,
    inc_cont_activa: false, cont_es_externo: null, cont_rendimiento: null,
    cont_hora_activacion: null, cont_hora_desactivacion: null,
    mov_rendimiento: null, mov_hora_activacion: null, mov_hora_desactivacion: null,
    boleta_manual: null, boleta_rendimiento: null, boleta_hora_activacion: null,
    venta_parcial: null, cajas_afectadas: null, cajas_totales: null,
    hubo_movil: false, iei_acumulado: 0, mitigaciones_previas: null,
    hora_correo_n1: null, hora_primera_resp: null, nivel_respuesta: null, max_nivel: null,
    eta_str: null, sla_respuesta_override: null, sla_resolucion_override: null,
    ...overrides,
  }
}

describe('calcCostoIncidente (dashboard analitico) — cont/mov necesitan su activado_por, no solo el timestamp', () => {
  it('cont_hora_activacion fantasma (inc_cont_activa=false) → sin mitigación, factor 1.00', async () => {
    const { calcCostoIncidente } = await import('./route')
    const inc = baseIncidente({
      inc_cont_activa: false, cont_hora_activacion: new Date('2024-01-08T15:00:00.000Z'), cont_rendimiento: null,
    })
    const res = calcCostoIncidente(inc, [])
    expect(res.factor).toBe(1.00)
    expect(res.motivo).toBe('sin mitigación')
  })

  it('mov_hora_activacion fantasma (hubo_movil=false) → sin mitigación, factor 1.00', async () => {
    const { calcCostoIncidente } = await import('./route')
    const inc = baseIncidente({
      hubo_movil: false, mov_hora_activacion: new Date('2024-01-08T15:00:00.000Z'), mov_rendimiento: null,
    })
    const res = calcCostoIncidente(inc, [])
    expect(res.factor).toBe(1.00)
    expect(res.motivo).toBe('sin mitigación')
  })

  it('mov activo de verdad (hubo_movil=true) con rendimiento PARCIAL: factor 0.50', async () => {
    const { calcCostoIncidente } = await import('./route')
    const inc = baseIncidente({
      hubo_movil: true, mov_hora_activacion: new Date('2024-01-08T15:00:00.000Z'), mov_rendimiento: 'PARCIAL',
    })
    const res = calcCostoIncidente(inc, [])
    expect(res.factor).toBe(0.50)
  })
})

describe('calcCostoIncidente — con tramos (Fase 5, Paso 3)', () => {
  it('con un tramo EFECTIVO cubriendo todo el incidente → costo 0, igual que el caso legacy equivalente', async () => {
    const { calcCostoIncidente } = await import('./route')
    const inc = baseIncidente()
    const tramos = [{
      incidenteId: inc.id, tipo: 'ROUTER_PROPIO' as const, factor: '0.0000',
      desde: inc.hora_registro, hasta: inc.hora_fin, ieTramo: '0.00',
    }]
    const res = calcCostoIncidente(inc, [], tramos)
    expect(res.costo).toBe(0)
  })

  it('con tramos y un ventasDiarias que NO coincide con la venta real de la tienda → factor sigue en [0,1] (bug real encontrado en verificación manual: el denominador usaba la venta estimada por ventasDiarias en vez de la real, dando factores como 11.5 o 54.2)', async () => {
    const { calcCostoIncidente } = await import('./route')
    const inc = baseIncidente({ venta_hora_soles: 1000, venta_hora_fds_soles: 1500 }) // venta real alta
    // ventasDiarias con un promedio mucho MENOR a la venta real — simula el
    // desajuste que causaba el bug (denominador chico, iei calculado con la
    // venta real grande → factor > 1 antes del fix).
    const ventasDiarias = [{ tienda_codigo: 'T-1', dia_semana: 1, venta_hora_promedio: 5 }]
    const tramos = [{
      incidenteId: inc.id, tipo: 'ROUTER_PROPIO' as const, factor: '1.0000',
      desde: inc.hora_registro, hasta: inc.hora_fin, ieTramo: '700.00', // 1000*2*0.35*1.00
    }]
    const res = calcCostoIncidente(inc, ventasDiarias, tramos)
    expect(res.factor).toBeGreaterThanOrEqual(0)
    expect(res.factor).toBeLessThanOrEqual(1)
  })

  it('cobertura parcial vía tramos → cobra las horas descubiertas (no colapsa a un solo factor)', async () => {
    const { calcCostoIncidente } = await import('./route')
    const inc = baseIncidente({ mttr_minutos: 240, hora_fin: new Date('2024-01-08T19:00:00.000Z') }) // 4h
    const tramos = [
      { incidenteId: inc.id, tipo: 'SIN_MITIGACION' as const, factor: '1.0000', desde: inc.hora_registro, hasta: new Date('2024-01-08T16:00:00.000Z'), ieTramo: '35.00' },
      { incidenteId: inc.id, tipo: 'ROUTER_PROPIO' as const, factor: '0.0000', desde: new Date('2024-01-08T16:00:00.000Z'), hasta: new Date('2024-01-08T18:00:00.000Z'), ieTramo: '0.00' },
      { incidenteId: inc.id, tipo: 'SIN_MITIGACION' as const, factor: '1.0000', desde: new Date('2024-01-08T18:00:00.000Z'), hasta: inc.hora_fin, ieTramo: '35.00' },
    ]
    const res = calcCostoIncidente(inc, [], tramos)
    expect(res.costo).toBe(70) // 35 + 0 + 35, no un solo factor sobre las 4h
  })
})
