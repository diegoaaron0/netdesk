import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { DASHBOARD_CONFIG } from './dashboard-config'

// El valor original — se restaura después de cada test que lo mute, para no
// filtrar el cambio a otros tests del archivo (o de otros archivos, ya que
// vitest suele compartir el registro de módulos dentro de un mismo run).
const VALOR_ORIGINAL = DASHBOARD_CONFIG.MARGEN_BRUTO

afterEach(() => {
  DASHBOARD_CONFIG.MARGEN_BRUTO = VALOR_ORIGINAL
})

const LUNES_10AM_LIMA = '2024-01-08T15:00:00.000Z'
function horasDespues(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3600000).toISOString()
}

describe('MARGEN_BRUTO — una sola fuente de verdad para los 4 puntos que calculan IEI', () => {
  it('el valor de partida es 35%', () => {
    expect(VALOR_ORIGINAL).toBe(0.35)
  })

  it('[1] lib/impacto-calc.ts (calcImpactoRow) refleja un cambio en tiempo de ejecución', async () => {
    const { calcImpactoRow } = await import('./impacto-calc')
    const fila = {
      hora_registro: LUNES_10AM_LIMA,
      hora_fin: horasDespues(LUNES_10AM_LIMA, 2),
      estado: 'RESUELTO', tipo: 'CAIDA_TOTAL', venta_hora_soles: 100,
    }

    const con35 = calcImpactoRow(fila)
    expect(con35.margenUsado).toBe(0.35)
    expect(con35.impactoEstimado).toBe(Math.round(100 * 2 * 0.35 * 1))

    DASHBOARD_CONFIG.MARGEN_BRUTO = 0.40
    const con40 = calcImpactoRow(fila)
    expect(con40.margenUsado).toBe(0.40)
    expect(con40.impactoEstimado).toBe(Math.round(100 * 2 * 0.40 * 1))
  })

  it('[2] lib/report-sql.ts (ieiPerRow/ieiSum) refleja un cambio en tiempo de ejecución', async () => {
    const { ieiPerRow, ieiSum } = await import('./report-sql')

    expect(ieiPerRow()).toContain('* 0.35')
    expect(ieiSum()).toContain('* 0.35')

    DASHBOARD_CONFIG.MARGEN_BRUTO = 0.40
    expect(ieiPerRow()).toContain('* 0.4')
    expect(ieiPerRow()).not.toContain('* 0.35')
    expect(ieiSum()).toContain('* 0.4')
  })

  it('[3] app/(dashboard)/dashboard/page.tsx (calcIeiLive) refleja un cambio en tiempo de ejecución', async () => {
    const { calcIeiLive } = await import('@/app/(dashboard)/dashboard/page')
    const inc = {
      iei_venta_hora: 100,
      hora_registro: LUNES_10AM_LIMA,
      tipo: 'CAIDA_TOTAL',
    }
    const nowMs = new Date(horasDespues(LUNES_10AM_LIMA, 2)).getTime()

    const con35 = calcIeiLive(inc, nowMs)
    expect(con35).toBe(Math.round(100 * 2 * 0.35 * 1))

    DASHBOARD_CONFIG.MARGEN_BRUTO = 0.40
    const con40 = calcIeiLive(inc, nowMs)
    expect(con40).toBe(Math.round(100 * 2 * 0.40 * 1))
  })

  it('[4] app/(dashboard)/incidentes/[id]/page.tsx — verificación de código fuente (no runtime, ver decisión registrada)', () => {
    // Este punto vive en una IIFE embebida en JSX, no exportada — no se puede
    // invocar en un test de runtime sin extraerla (decisión explícita: no
    // extraerla en esta pasada). Se verifica en el texto fuente que:
    //   (a) ya no queda ningún "MARGEN = 0.35" hardcodeado, y
    //   (b) sí lee DASHBOARD_CONFIG.MARGEN_BRUTO.
    const ruta = resolve(__dirname, '../app/(dashboard)/incidentes/[id]/page.tsx')
    const contenido = readFileSync(ruta, 'utf8')

    expect(contenido).not.toMatch(/const\s+MARGEN\s*=\s*0\.35/)
    expect(contenido).toMatch(/const\s+MARGEN\s*=\s*DASHBOARD_CONFIG\.MARGEN_BRUTO/)
    expect(contenido).toMatch(/import\s*\{\s*DASHBOARD_CONFIG\s*\}\s*from\s*['"]@\/lib\/dashboard-config['"]/)
  })
})
