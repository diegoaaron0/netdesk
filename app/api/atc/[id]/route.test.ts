import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE' } }),
}))

// Regresión: hora_respuesta del escalamiento debe registrarse al FINALIZAR la
// llamada ATC, no al iniciarla. Esto ya se corrigió una vez (commit 2cd01ca),
// se revirtió por error (f9e25f3) y se volvió a corregir (98b7d77) — sin test
// explícito hasta ahora, por eso se pudo revertir sin que nada lo detectara.
describe('PUT /api/atc/[id] — hora_respuesta se registra al finalizar la llamada, no al iniciarla (Paso 4)', () => {
  let escalamientoId: string
  let atcLlamadaId: string
  let inicioLlamada: Date
  let horaEnvioCorreo: Date

  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))

    const [previo] = await db.select({ id: schema.incidentes.id }).from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-ATC-HORA-RESP'))
    if (previo) {
      const escsPrevios = await db.select({ id: schema.escalamientos.id }).from(schema.escalamientos).where(eq(schema.escalamientos.incidenteId, previo.id))
      for (const e of escsPrevios) {
        await db.delete(schema.atcLlamadas).where(eq(schema.atcLlamadas.escalamientoId, e.id))
      }
      await db.delete(schema.escalamientos).where(eq(schema.escalamientos.incidenteId, previo.id))
    }
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-ATC-HORA-RESP'))
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-ATC-HORA-RESP', tiendaId: ref.tiendaId, registradoPorId: ref.registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'ESCALADO_N1',
      horaRegistro: new Date(),
    }).returning()

    horaEnvioCorreo = new Date(Date.now() - 20 * 60000) // correo enviado hace 20 min
    const [esc] = await db.insert(schema.escalamientos).values({
      incidenteId: inc.id, nivel: 1,
      contactoEscalado: 'Soporte Test', emailContacto: 'soporte@atc-test.pe',
      horaEnvioCorreo,
    }).returning()
    escalamientoId = esc.id

    // La llamada ATC "empezó" hace 5 minutos — si el bug reapareciera (hora_respuesta
    // = inicio de la llamada, no el fin), el tiempoRespuestaMin daría ~15 en vez de ~20.
    inicioLlamada = new Date(Date.now() - 5 * 60000)
    const [llamada] = await db.insert(schema.atcLlamadas).values({
      escalamientoId, inicio: inicioLlamada,
    }).returning()
    atcLlamadaId = llamada.id
  })

  it('al finalizar, hora_respuesta queda cerca de AHORA (fin de la llamada), no del inicio de la llamada', async () => {
    const { PUT } = await import('./route')
    const req = { json: async () => ({ finalizar: true }) } as any
    const antesDeFinalizar = Date.now()
    const res = await PUT(req, { params: Promise.resolve({ id: atcLlamadaId }) })
    expect(res.status).not.toBe(403)

    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const [esc] = await db.select().from(schema.escalamientos).where(eq(schema.escalamientos.id, escalamientoId))

    expect(esc.horaRespuesta).toBeTruthy()
    const horaRespuestaMs = new Date(esc.horaRespuesta!).getTime()

    // Debe estar cerca del momento de finalizar (ahora), con margen generoso por el tiempo de test.
    expect(Math.abs(horaRespuestaMs - antesDeFinalizar)).toBeLessThan(10_000)
    // Y muy lejos del inicio de la llamada (hace 5 minutos) — si usara el inicio, la diferencia sería ~0.
    expect(Math.abs(horaRespuestaMs - inicioLlamada.getTime())).toBeGreaterThan(4 * 60000)
  })

  it('tiempo_respuesta_min se calcula desde hora_envio_correo hasta el FIN de la llamada (~20min), no hasta el inicio (~15min)', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const [esc] = await db.select().from(schema.escalamientos).where(eq(schema.escalamientos.id, escalamientoId))

    expect(esc.tiempoRespuestaMin).not.toBeNull()
    // ~20 minutos (correo hace 20min, respondido ahora), con tolerancia por la duración del test.
    expect(esc.tiempoRespuestaMin!).toBeGreaterThanOrEqual(19)
    expect(esc.tiempoRespuestaMin!).toBeLessThanOrEqual(21)
  })

  it('duracion_min de la llamada ATC se calcula desde su propio inicio (~5min), independiente de hora_respuesta', async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')
    const [llamada] = await db.select().from(schema.atcLlamadas).where(eq(schema.atcLlamadas.id, atcLlamadaId))

    expect(llamada.duracionMin).not.toBeNull()
    expect(llamada.duracionMin!).toBeGreaterThanOrEqual(4)
    expect(llamada.duracionMin!).toBeLessThanOrEqual(6)
  })
})
