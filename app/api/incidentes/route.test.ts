import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq, count } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import * as schema from '@/drizzle/schema'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE' } }),
}))

let tiendaArchivadaId: string

function postReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/incidentes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-INC-ARCHIVADA-01'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-INC-ARCHIVADA-01', nombreCc: 'Tienda archivada — bloqueo incidentes', distrito: 'Test', cluster: 'B',
      estado: 'ARCHIVADA', archivadaEn: new Date(), archivadaMotivo: 'Test',
    }).returning()
  } else {
    await db.update(schema.tiendas).set({ estado: 'ARCHIVADA', archivadaEn: new Date() } as any).where(eq(schema.tiendas.id, t.id))
  }
  tiendaArchivadaId = t.id
})

describe('POST /api/incidentes — rechaza contra tienda archivada', () => {
  it('tienda con estado ARCHIVADA → 409, no crea el incidente', async () => {
    const { POST } = await import('./route')

    const [{ total: antes }] = await db.select({ total: count() }).from(schema.incidentes)
      .where(eq(schema.incidentes.tiendaId, tiendaArchivadaId))

    const res = await POST(postReq({ tiendaId: tiendaArchivadaId, nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL' }))
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toMatch(/archivada/i)

    const [{ total: despues }] = await db.select({ total: count() }).from(schema.incidentes)
      .where(eq(schema.incidentes.tiendaId, tiendaArchivadaId))
    expect(despues).toBe(antes)
  })
})

// ─── Fase 5, Paso 2.2 — mitigacionesActivas (badges Cont./Datos de la lista) ──
// Campo nuevo, aditivo: qué tipo de mitigación real está abierta AHORA para
// cada incidente, derivado de tramos con fallback legacy (getTramosPorIncidentes
// + normalizarMitigaciones). La badge de Boleta NO se toca en este paso — sigue
// leyendo boletaManual directo (boleta no tiene "hasta" en el modelo legacy, y
// cambiar eso sería un cambio de comportamiento fuera de alcance acá).

let registradoPorId: string
let tiendaMitigacionId: string

beforeAll(async () => {
  const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
  registradoPorId = ref.registradoPorId

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, 'T-INCLISTA-TRAMOS'))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: 'T-INCLISTA-TRAMOS', nombreCc: 'Tienda — lista incidentes tramos', distrito: 'Test', cluster: 'B',
      ventaHoraSoles: '100', ventaHoraFdsSoles: '150',
    }).returning()
  }
  tiendaMitigacionId = t.id
})

async function limpiarIncidenteMitigacion(codigo: string) {
  const [prev] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
  if (prev) await db.delete(schema.incidenteMitigacionTramos).where(eq(schema.incidenteMitigacionTramos.incidenteId, prev.id))
  await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, codigo))
}

function hoyLimaParam(hora: Date) {
  return new Date(hora.getTime() - 5 * 3600000).toISOString().slice(0, 10)
}

describe('GET /api/incidentes — mitigacionesActivas (Cont./Datos) por tramos con fallback legacy', () => {
  it('legacy: router propio activo (sin cont_hora_desactivacion) → mitigacionesActivas incluye ROUTER_PROPIO', async () => {
    await limpiarIncidenteMitigacion('TST-INCLISTA-ROUTER-LEGACY')
    const horaRegistro = new Date()
    await db.insert(schema.incidentes).values({
      codigo: 'TST-INCLISTA-ROUTER-LEGACY', tiendaId: tiendaMitigacionId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro,
      contActivadoPor: 'AGENTE', contHoraActivacion: horaRegistro, contRendimiento: 'PARCIAL', contEsExterno: false,
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/incidentes?fechaDesde=${hoyLimaParam(horaRegistro)}`)
    const res = await GET(req)
    const data = await res.json()

    const inc = data.find((i: any) => i.codigo === 'TST-INCLISTA-ROUTER-LEGACY')
    expect(inc).toBeTruthy()
    expect(inc.mitigacionesActivas).toContain('ROUTER_PROPIO')
  })

  it('legacy: router propio YA desactivado → mitigacionesActivas NO lo incluye', async () => {
    await limpiarIncidenteMitigacion('TST-INCLISTA-ROUTER-CERRADO')
    const horaRegistro = new Date()
    await db.insert(schema.incidentes).values({
      codigo: 'TST-INCLISTA-ROUTER-CERRADO', tiendaId: tiendaMitigacionId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro,
      contActivadoPor: 'AGENTE', contHoraActivacion: horaRegistro, contHoraDesactivacion: new Date(), contRendimiento: 'PARCIAL',
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/incidentes?fechaDesde=${hoyLimaParam(horaRegistro)}`)
    const res = await GET(req)
    const data = await res.json()

    const inc = data.find((i: any) => i.codigo === 'TST-INCLISTA-ROUTER-CERRADO')
    expect(inc.mitigacionesActivas).not.toContain('ROUTER_PROPIO')
  })

  it('mov_hora_activacion fantasma (sin mov_activado_por) → mitigacionesActivas no incluye DATOS_MOVILES (mismo gate del resto del sistema)', async () => {
    await limpiarIncidenteMitigacion('TST-INCLISTA-MOV-FANTASMA')
    const horaRegistro = new Date()
    await db.insert(schema.incidentes).values({
      codigo: 'TST-INCLISTA-MOV-FANTASMA', tiendaId: tiendaMitigacionId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro,
      movActivadoPor: null, movHoraActivacion: horaRegistro, movRendimiento: 'PARCIAL',
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/incidentes?fechaDesde=${hoyLimaParam(horaRegistro)}`)
    const res = await GET(req)
    const data = await res.json()

    const inc = data.find((i: any) => i.codigo === 'TST-INCLISTA-MOV-FANTASMA')
    expect(inc.mitigacionesActivas).not.toContain('DATOS_MOVILES')
  })

  it('con tramos: un tramo ROUTER_EXTERNO abierto → mitigacionesActivas lo refleja, aunque los campos legacy estén vacíos', async () => {
    await limpiarIncidenteMitigacion('TST-INCLISTA-TRAMO-ABIERTO')
    const horaRegistro = new Date()
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-INCLISTA-TRAMO-ABIERTO', tiendaId: tiendaMitigacionId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro,
    }).returning()
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'ROUTER_EXTERNO', factor: '0.0000', desde: horaRegistro,
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/incidentes?fechaDesde=${hoyLimaParam(horaRegistro)}`)
    const res = await GET(req)
    const data = await res.json()

    const row = data.find((i: any) => i.codigo === 'TST-INCLISTA-TRAMO-ABIERTO')
    expect(row.mitigacionesActivas).toContain('ROUTER_EXTERNO')
  })

  it('con tramos: el tramo abierto es SIN_MITIGACION → mitigacionesActivas queda vacío', async () => {
    await limpiarIncidenteMitigacion('TST-INCLISTA-TRAMO-SINMIT')
    const horaRegistro = new Date()
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-INCLISTA-TRAMO-SINMIT', tiendaId: tiendaMitigacionId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ABIERTO', horaRegistro,
    }).returning()
    await db.insert(schema.incidenteMitigacionTramos).values({
      incidenteId: inc.id, tipo: 'SIN_MITIGACION', factor: '1.0000', desde: horaRegistro,
    })

    const { GET } = await import('./route')
    const req = new NextRequest(`http://localhost/api/incidentes?fechaDesde=${hoyLimaParam(horaRegistro)}`)
    const res = await GET(req)
    const data = await res.json()

    const row = data.find((i: any) => i.codigo === 'TST-INCLISTA-TRAMO-SINMIT')
    expect(row.mitigacionesActivas).toEqual([])
  })
})
