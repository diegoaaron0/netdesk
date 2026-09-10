import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { diaSemanaLima } from '@/lib/impacto-calc'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE' } }),
}))

describe('GET /api/dashboard/operativo — campos de contingencia/IEI para el CSV (Paso 2)', () => {
  let tiendaId: string
  let registradoPorId: string
  let incActivoId: string
  let incResueltoId: string
  let horaFinResuelto: Date

  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    registradoPorId = ref.registradoPorId

    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-OP-CSV-CAMPOS'))
    if (!t) {
      [t] = await db.insert(schema.tiendas).values({
        codigo: 'T-OP-CSV-CAMPOS', nombreCc: 'Tienda — campos CSV operativo', distrito: 'Test', cluster: 'B',
        ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
      }).returning()
    }
    tiendaId = t.id

    // Incidente ACTIVO con datos móviles activos — la etiqueta "Datos Móviles"
    // del CSV depende de mov_activado_por, que hoy no viene en la query de activos.
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-OP-ACTIVO-MOV'))
    const [incActivo] = await db.insert(schema.incidentes).values({
      codigo: 'TST-OP-ACTIVO-MOV', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO',
      horaRegistro: new Date(),
      movActivadoPor: 'AGENTE', movHoraActivacion: new Date(), movRendimiento: 'PARCIAL',
    }).returning()
    incActivoId = incActivo.id

    // Incidente RESUELTO hoy con router propio + IEI — el CSV de resueltos
    // depende de cont_activado_por/mov_activado_por/boleta_manual/iei_venta_hora,
    // que hoy no vienen en la query de "resoluciones".
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-OP-RESUELTO-CONT'))
    const horaRegistro = new Date(Date.now() - 3600000)
    const horaFin = new Date()
    const [incResuelto] = await db.insert(schema.incidentes).values({
      codigo: 'TST-OP-RESUELTO-CONT', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      horaRegistro, horaFin, mttrMinutos: 60,
      contActivadoPor: 'AGENTE', contHoraActivacion: horaRegistro, contHoraDesactivacion: horaFin, contRendimiento: 'PARCIAL',
    }).returning()
    incResueltoId = incResuelto.id
    horaFinResuelto = horaFin
  })

  it('activos: incluye mov_activado_por (hoy ausente — la etiqueta "Datos Móviles" del CSV nunca podía mostrarse)', async () => {
    const { GET } = await import('./route')
    const req = { nextUrl: { searchParams: new URLSearchParams() } } as any
    const res = await GET(req)
    const data = await res.json()

    const fila = data.activos.find((i: any) => i.id === incActivoId)
    expect(fila, 'el incidente activo de prueba debe aparecer en data.activos').toBeTruthy()
    expect(fila.mov_activado_por).toBe('AGENTE')
  })

  it('resoluciones: incluye cont_activado_por, mov_activado_por, boleta_manual e iei_venta_hora (hoy ausentes — el CSV de resueltos siempre salía vacío en esas columnas)', async () => {
    const { GET } = await import('./route')
    const req = { nextUrl: { searchParams: new URLSearchParams() } } as any
    const res = await GET(req)
    const data = await res.json()

    const fila = data.resoluciones.find((r: any) => r.id === incResueltoId)
    expect(fila, 'el incidente resuelto de prueba debe aparecer en data.resoluciones').toBeTruthy()
    expect(fila.cont_activado_por).toBe('AGENTE')
    expect(fila.mov_activado_por).toBeFalsy()
    expect(fila.boleta_manual).toBeFalsy()
    // Día de semana (L-J) → venta_hora_soles (100); FDS (V-D) → venta_hora_fds_soles (150).
    const dow = diaSemanaLima(horaFinResuelto)
    const esperado = (dow === 0 || dow === 5 || dow === 6) ? 150 : 100
    expect(Number(fila.iei_venta_hora)).toBe(esperado)
  })
})

describe('GET /api/dashboard/operativo — estadoOp respeta el override de SLA por ficha (Paso 2)', () => {
  let registradoPorId: string
  let incOverrideId: string
  let incSinOverrideId: string

  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    registradoPorId = ref.registradoPorId

    let [proveedor] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, 'SLA OVERRIDE OP TEST'))
    if (!proveedor) {
      [proveedor] = await db.insert(schema.proveedores).values({ nombre: 'SLA OVERRIDE OP TEST' }).returning()
    }

    // Tienda CON ficha de contrato: 120 min de resolución (vs. default 90)
    let [tOverride] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-OP-SLA-OVERRIDE'))
    if (!tOverride) {
      [tOverride] = await db.insert(schema.tiendas).values({
        codigo: 'T-OP-SLA-OVERRIDE', nombreCc: 'Tienda — override SLA operativo', distrito: 'Test', cluster: 'B',
      }).returning()
    }
    let [ficha] = await db.select().from(schema.fichas).where(eq(schema.fichas.codigo, 'FC-OP-SLA-OVERRIDE'))
    if (!ficha) {
      [ficha] = await db.insert(schema.fichas).values({
        codigo: 'FC-OP-SLA-OVERRIDE', tiendaId: tOverride.id, proveedorId: proveedor.id,
        estado: 'ACTIVA', activadoEn: new Date(),
        tiempoRespuestaSla: 60, tiempoResolucionSla: 120,
      }).returning()
      await db.update(schema.tiendas).set({ fichaActivaId: ficha.id }).where(eq(schema.tiendas.id, tOverride.id))
    }

    // Tienda SIN ficha (usa el default de 90)
    let [tDefault] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-OP-SLA-DEFAULT'))
    if (!tDefault) {
      [tDefault] = await db.insert(schema.tiendas).values({
        codigo: 'T-OP-SLA-DEFAULT', nombreCc: 'Tienda — SLA default operativo', distrito: 'Test', cluster: 'B',
      }).returning()
    }

    // Ambos incidentes registrados hace 95 minutos: pasó el default (90) pero NO el override (120)
    const horaRegistro = new Date(Date.now() - 95 * 60000)

    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-OP-SLA-OVERRIDE'))
    const [incOverride] = await db.insert(schema.incidentes).values({
      codigo: 'TST-OP-SLA-OVERRIDE', tiendaId: tOverride.id, registradoPorId, fichaId: ficha.id,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro,
    }).returning()
    incOverrideId = incOverride.id

    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-OP-SLA-DEFAULT'))
    const [incSinOverride] = await db.insert(schema.incidentes).values({
      codigo: 'TST-OP-SLA-DEFAULT', tiendaId: tDefault.id, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro,
    }).returning()
    incSinOverrideId = incSinOverride.id
  })

  it('una tienda con override de 120 min NO se marca SLA_VENCIDO a los 95 min (el default sería 90)', async () => {
    const { GET } = await import('./route')
    const req = { nextUrl: { searchParams: new URLSearchParams() } } as any
    const res = await GET(req)
    const data = await res.json()

    const fila = data.activos.find((i: any) => i.id === incOverrideId)
    expect(fila, 'el incidente con override debe aparecer en data.activos').toBeTruthy()
    expect(fila.estadoOp).not.toBe('SLA_VENCIDO')
  })

  it('una tienda sin ficha (default 90) SÍ se marca SLA_VENCIDO a los 95 min', async () => {
    const { GET } = await import('./route')
    const req = { nextUrl: { searchParams: new URLSearchParams() } } as any
    const res = await GET(req)
    const data = await res.json()

    const fila = data.activos.find((i: any) => i.id === incSinOverrideId)
    expect(fila, 'el incidente sin override debe aparecer en data.activos').toBeTruthy()
    expect(fila.estadoOp).toBe('SLA_VENCIDO')
  })
})

describe('GET /api/dashboard/operativo — iei_calculado (Fase 4: ticker conectado al cálculo unificado de tramos)', () => {
  let tiendaId: string
  let registradoPorId: string
  const tienda = { ventaHoraSoles: '100', ventaHoraFdsSoles: '150' }

  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    registradoPorId = ref.registradoPorId

    let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-OP-IEI-TRAMOS'))
    if (!t) {
      [t] = await db.insert(schema.tiendas).values({
        codigo: 'T-OP-IEI-TRAMOS', nombreCc: 'Tienda — iei_calculado operativo', distrito: 'Test', cluster: 'B',
        ventaHoraSoles: tienda.ventaHoraSoles, ventaHoraFdsSoles: tienda.ventaHoraFdsSoles,
      }).returning()
    }
    tiendaId = t.id
  })

  it('con tramos reales: iei_calculado = SUM(ie_tramo cerrados) + IEI en vivo del tramo abierto — mismo criterio que "Desglose por tramos" del detalle del incidente', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const { calcIeTramo } = await import('@/lib/mitigacion-tramos')
    const codigo = 'TST-OP-IEI-CON-TRAMOS'

    const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
    if (prev) await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))

    const horaRegistro = new Date(Date.now() - 3 * 3600000)
    const tramoCerradoHasta = new Date(horaRegistro.getTime() + 3600000)
    const [inc] = await db.insert(schema.incidentes).values({
      codigo, tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro,
    }).returning()

    await db.insert(schema.incidenteMitigacionTramos).values([
      { incidenteId: inc.id, tipo: 'ROUTER_PROPIO', factor: '0.5000', desde: horaRegistro, hasta: tramoCerradoHasta, ieTramo: '50.00' },
      { incidenteId: inc.id, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: tramoCerradoHasta, hasta: null },
    ])

    const before = Date.now()
    const { GET } = await import('./route')
    const req = { nextUrl: { searchParams: new URLSearchParams() } } as any
    const res = await GET(req)
    const after = Date.now()
    const data = await res.json()

    const fila = data.activos.find((i: any) => i.id === inc.id)
    expect(fila, 'el incidente de prueba debe aparecer en data.activos').toBeTruthy()

    const tramoAbierto = { tipo: 'SIN_MITIGACION' as const, factor: '1.0000', desde: tramoCerradoHasta, hasta: null, tipoIncidente: 'CAIDA_TOTAL' }
    const lower = 50 + calcIeTramo(tramoAbierto, tienda, new Date(before))
    const upper = 50 + calcIeTramo(tramoAbierto, tienda, new Date(after))
    expect(Number(fila.iei_calculado)).toBeGreaterThanOrEqual(lower)
    expect(Number(fila.iei_calculado)).toBeLessThanOrEqual(upper)
  })

  it('sin ningún tramo (incidente no tocado por el flujo nuevo): usa el fallback viejo (calcImpactoEnCurso), no queda en S/0', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const codigo = 'TST-OP-IEI-SIN-TRAMOS'
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))

    const horaRegistro = new Date(Date.now() - 2 * 3600000)
    const [inc] = await db.insert(schema.incidentes).values({
      codigo, tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro,
    }).returning()

    const { GET } = await import('./route')
    const req = { nextUrl: { searchParams: new URLSearchParams() } } as any
    const res = await GET(req)
    const data = await res.json()

    const fila = data.activos.find((i: any) => i.id === inc.id)
    expect(fila, 'el incidente de prueba debe aparecer en data.activos').toBeTruthy()
    expect(Number(fila.iei_calculado)).toBeGreaterThan(0)
  })
})
