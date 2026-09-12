import { describe, it, expect } from 'vitest'
import { slaPctPromedio } from './sla-core'

// El cálculo viejo era binario: cumplió / evaluables. Un proveedor con 1 solo
// incidente evaluable solo podía dar 0% o 100%, y responder en 61 minutos con
// límite de 60 puntuaba igual que no responder nunca. Estos tests fijan el
// comportamiento nuevo: proporción del límite contra el promedio real.

describe('slaPctPromedio — reemplaza el conteo binario', () => {
  it('sin evaluables devuelve null, no 0% ni 100%', () => {
    expect(slaPctPromedio(0, 0, 0)).toBeNull()
    expect(slaPctPromedio(500, 300, 0)).toBeNull()
  })

  it('cumplir exactamente el límite da 100%', () => {
    expect(slaPctPromedio(60, 60, 1)).toBe(100)
  })

  it('cumplir MEJOR que el límite capea en 100%, no lo supera', () => {
    expect(slaPctPromedio(10, 60, 1)).toBe(100)
    expect(slaPctPromedio(1, 600, 1)).toBe(100)
  })

  it('el doble del límite da 50%', () => {
    expect(slaPctPromedio(120, 60, 1)).toBe(50)
  })

  it('el cuádruple del límite da 25%', () => {
    expect(slaPctPromedio(240, 60, 1)).toBe(25)
  })

  // El caso que motivó el cambio: con el conteo binario esto daba 0%.
  it('pasarse por 1 minuto ya NO se castiga como no responder nunca', () => {
    const apenasTarde = slaPctPromedio(61, 60, 1)
    const muyTarde    = slaPctPromedio(600, 60, 1)
    expect(apenasTarde).toBe(98)
    expect(muyTarde).toBe(10)
    expect(apenasTarde! - muyTarde!).toBeGreaterThan(80)
  })

  it('promedia sobre el total evaluable: uno bueno y uno malo no dan 50% binario', () => {
    // 30 min y 150 min contra límite 60 → promedio real 90 → 60/90 = 67%
    expect(slaPctPromedio(30 + 150, 60 + 60, 2)).toBe(67)
  })

  it('respeta el límite propio de cada incidente (override de ficha)', () => {
    // límites 60 y 120 → promedio 90; reales 90 y 90 → promedio 90 → 100%
    expect(slaPctPromedio(90 + 90, 60 + 120, 2)).toBe(100)
  })

  it('tiempo real 0 o negativo (datos backdateados) no propaga Infinity', () => {
    expect(slaPctPromedio(0, 60, 1)).toBe(100)
    expect(slaPctPromedio(-30, 60, 1)).toBe(100)
  })

  it('nunca devuelve más de 100 ni menos de 0', () => {
    for (const [real, lim, n] of [[1, 9999, 1], [9999, 1, 1], [50, 50, 5]] as const) {
      const v = slaPctPromedio(real, lim, n)!
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })

  // Datos reales de la auditoría, para que el cambio quede documentado.
  describe('casos reales de producción (auditoría 30d)', () => {
    it('CLARO respuesta: 26min y 181min con límite 60 → 58%, antes 50%', () => {
      expect(slaPctPromedio(26 + 181, 60 + 60, 2)).toBe(58)
    })

    it('CLARO resolución: 180min y 90min con límite 90 → 67%, antes 50%', () => {
      expect(slaPctPromedio(180 + 90, 90 + 90, 2)).toBe(67)
    })
  })
})

// ─── Regresiones de la vía SQL ────────────────────────────────────────────────
// Dos bugs que aparecieron recién al contrastar contra producción y que un test
// de la función pura no puede ver.
describe('slaRespuestaPctExpr / slaResolucionPctExpr — SQL', () => {
  it('no se apoya en LEAST() para propagar el NULL: en Postgres LEAST(100, NULL) da 100', async () => {
    const { slaRespuestaPctExpr, slaResolucionPctExpr } = await import('./sla-sql')
    // Sin el CASE, un proveedor sin incidentes medibles marcaría 100% de SLA.
    for (const expr of [slaRespuestaPctExpr(), slaResolucionPctExpr()]) {
      expect(expr).toMatch(/CASE WHEN .* IS NULL/)
      expect(expr).toMatch(/THEN NULL/)
    }
  })

  it('excluye del promedio los incidentes sin respuesta del proveedor', async () => {
    const { slaRespuestaPctExpr, slaResolucionPctExpr } = await import('./sla-sql')
    // Imputarles "lo que tardó en cerrarse" premiaba a quien nunca contestó.
    for (const expr of [slaRespuestaPctExpr(), slaResolucionPctExpr()]) {
      expect(expr).toContain('resp.hora_primera_resp IS NOT NULL')
      expect(expr).not.toContain('COALESCE(resp.hora_primera_resp')
    }
  })

  it('divide por el promedio real y capea en 100', async () => {
    const { slaRespuestaPctExpr } = await import('./sla-sql')
    expect(slaRespuestaPctExpr()).toContain('LEAST(100')
    expect(slaRespuestaPctExpr()).toContain('AVG(')
  })
})
