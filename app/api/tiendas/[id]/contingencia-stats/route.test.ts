import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'

// Fase 5, Paso 2.2 — este test se escribió ANTES de tocar route.ts (captura el
// comportamiento actual, con la query SQL sobre cont_*/mov_*) y debe seguir
// pasando sin cambios después de migrar el endpoint a getTramosPorIncidentes +
// normalizarMitigaciones. La tabla `contingencias` (standalone) no se toca en
// este paso — sigue siendo la misma query SQL de siempre.
//
// Cada test usa su PROPIA tienda: los subqueries `activo_*` de este endpoint
// agregan sobre TODOS los incidentes de la tienda sin filtrar por período — si
// varios tests compartieran una tienda, el incidente "abierto" de un test
// contaminaría el activo_* de otro.

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE' } }),
}))

let registradoPorId: string

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId
})

async function limpiarIncidentePorCodigo(codigo: string) {
  const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  if (prev) {
    await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
    await db.delete(schema.incidentes).where(eq(schema.incidentes.id, prev.id))
  }
}

async function crearTiendaAislada(codigo: string): Promise<string> {
  const [existente] = await db.select({ id: schema.tiendas.id }).from(schema.tiendas).where(eq(schema.tiendas.codigo, codigo))
  if (existente) {
    await db.delete(schema.contingencias).where(eq(schema.contingencias.tiendaId, existente.id))
    const incs = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.tiendaId, existente.id))
    for (const i of incs) await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, i.id))
    await db.delete(schema.incidentes).where(eq(schema.incidentes.tiendaId, existente.id))
    return existente.id
  }
  const [t] = await db.insert(schema.tiendas).values({
    codigo, nombreCc: `Tienda — ${codigo}`, distrito: 'Test', cluster: 'B',
    ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
  }).returning()
  return t.id
}

function rangoAmplio() {
  return '?desde=2000-01-01&hasta=2100-01-01'
}

describe('GET /api/tiendas/[id]/contingencia-stats — minutos por tipo, con y sin tramos', () => {
  it('router propio cerrado (60 min) cuenta en min_router_propio, no está activo ahora', async () => {
    const tiendaId = await crearTiendaAislada('T-CONTSTATS-ROUTER-CERRADO')
    await limpiarIncidentePorCodigo('TST-CONTSTATS-ROUTER-CERRADO')
    const horaActivacion = new Date(Date.now() - 90 * 60000)
    const horaDesactivacion = new Date(Date.now() - 30 * 60000)
    await db.insert(schema.incidentes).values({
      codigo: 'TST-CONTSTATS-ROUTER-CERRADO', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      horaRegistro: horaActivacion, horaFin: horaDesactivacion, mttrMinutos: 60,
      contActivadoPor: 'AGENTE', contHoraActivacion: horaActivacion, contHoraDesactivacion: horaDesactivacion,
      contRendimiento: 'PARCIAL', contEsExterno: false,
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/tiendas/${tiendaId}/contingencia-stats${rangoAmplio()}`)
    const res = await GET(req, { params: Promise.resolve({ id: tiendaId }) })
    const data = await res.json()

    expect(data.min_router_propio).toBeGreaterThanOrEqual(59)
    expect(data.min_router_propio).toBeLessThanOrEqual(61)
    expect(data.cnt_router_propio).toBe(1)
    expect(data.activo_propio).toBe(false)
  })

  it('datos móviles activo AHORA (sin desactivar, incidente abierto) → activo_mov=true', async () => {
    const tiendaId = await crearTiendaAislada('T-CONTSTATS-MOV-ACTIVO')
    await limpiarIncidentePorCodigo('TST-CONTSTATS-MOV-ACTIVO')
    const horaActivacion = new Date(Date.now() - 90 * 60000)
    await db.insert(schema.incidentes).values({
      codigo: 'TST-CONTSTATS-MOV-ACTIVO', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO',
      horaRegistro: horaActivacion,
      movActivadoPor: 'AGENTE', movHoraActivacion: horaActivacion, movRendimiento: 'PARCIAL',
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/tiendas/${tiendaId}/contingencia-stats${rangoAmplio()}`)
    const res = await GET(req, { params: Promise.resolve({ id: tiendaId }) })
    const data = await res.json()

    expect(data.activo_mov).toBe(true)
    expect(data.min_datos_moviles).toBeGreaterThanOrEqual(89)
    expect(data.cnt_datos_moviles).toBe(1)
  })

  it('mov_hora_activacion fantasma (sin mov_activado_por) NO cuenta — mismo gate que el resto del sistema', async () => {
    const tiendaId = await crearTiendaAislada('T-CONTSTATS-MOV-FANTASMA')
    await limpiarIncidentePorCodigo('TST-CONTSTATS-MOV-FANTASMA')
    const horaActivacion = new Date(Date.now() - 90 * 60000)
    await db.insert(schema.incidentes).values({
      codigo: 'TST-CONTSTATS-MOV-FANTASMA', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO',
      horaRegistro: horaActivacion,
      movActivadoPor: null, movHoraActivacion: horaActivacion, movRendimiento: 'PARCIAL',
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/tiendas/${tiendaId}/contingencia-stats${rangoAmplio()}`)
    const res = await GET(req, { params: Promise.resolve({ id: tiendaId }) })
    const data = await res.json()

    expect(data.activo_mov).toBe(false)
    expect(data.min_datos_moviles).toBe(0)
    expect(data.cnt_datos_moviles).toBe(0)
  })

  it('router externo archivado en mitigaciones_previas (reapertura) suma sus minutos aunque el slot vivo ya esté libre', async () => {
    const tiendaId = await crearTiendaAislada('T-CONTSTATS-PREVIAS')
    await limpiarIncidentePorCodigo('TST-CONTSTATS-PREVIAS')
    const horaActivacion = new Date(Date.now() - 180 * 60000)
    const horaDesactivacion = new Date(Date.now() - 120 * 60000) // 60 min archivados
    await db.insert(schema.incidentes).values({
      codigo: 'TST-CONTSTATS-PREVIAS', tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO',
      horaRegistro: new Date(Date.now() - 60000), // el ciclo actual reinició hace 1 min
      mitigacionesPrevias: [{
        clase: 'ROUTER_EXTERNO', activadoPor: 'AGENTE',
        horaActivacion, horaDesactivacion, rendimiento: 'EFECTIVO', cerradoEn: horaDesactivacion,
      }],
      // slot vivo ya liberado, como hace reabrir/route.ts
      contActivadoPor: null, contHoraActivacion: null, contHoraDesactivacion: null,
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/tiendas/${tiendaId}/contingencia-stats${rangoAmplio()}`)
    const res = await GET(req, { params: Promise.resolve({ id: tiendaId }) })
    const data = await res.json()

    expect(data.min_router_externo).toBeGreaterThanOrEqual(59)
    expect(data.min_router_externo).toBeLessThanOrEqual(61)
    expect(data.cnt_router_externo).toBe(1)
    expect(data.activo_externo).toBe(false) // el archivado ya está cerrado, y el slot vivo está libre
  })

  it('contingencia standalone (tabla contingencias, sin incidente) sigue contando igual — no tocada por esta migración', async () => {
    const tiendaId = await crearTiendaAislada('T-CONTSTATS-STANDALONE')
    const horaActivacion = new Date(Date.now() - 45 * 60000)
    await db.insert(schema.contingencias).values({
      tiendaId, tipo: 'DATOS_MOVILES', activadoPor: 'AGENTE', horaActivacion,
      justificacion: 'Test standalone',
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/tiendas/${tiendaId}/contingencia-stats${rangoAmplio()}`)
    const res = await GET(req, { params: Promise.resolve({ id: tiendaId }) })
    const data = await res.json()

    expect(data.activo_mov).toBe(true) // vía standalone, sin ningún incidente activo
    expect(data.min_datos_moviles).toBeGreaterThanOrEqual(44)
  })

  it('sin ninguna actividad → todo en cero, sin explotar', async () => {
    const tiendaId = await crearTiendaAislada('T-CONTSTATS-VACIA')

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/tiendas/${tiendaId}/contingencia-stats${rangoAmplio()}`)
    const res = await GET(req, { params: Promise.resolve({ id: tiendaId }) })
    const data = await res.json()

    expect(data).toMatchObject({
      min_router_propio: 0, min_router_externo: 0, min_datos_moviles: 0,
      cnt_router_propio: 0, cnt_router_externo: 0, cnt_datos_moviles: 0,
      activo_propio: false, activo_externo: false, activo_mov: false,
    })
  })
})
