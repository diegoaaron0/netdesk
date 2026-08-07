import { describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'

const LUNES_10AM_LIMA = '2024-01-08T15:00:00.000Z' // lunes 10:00 Lima
function horasDespues(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3600000).toISOString()
}

describe('GET /api/v1/proveedores — SLA Resolución usa hora_fin−hora_primera_resp, no el MTTR total (Paso 2, barrido)', () => {
  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    const tiendaId = ref.tiendaId
    const registradoPorId = ref.registradoPorId

    // Mismo fixture que app/api/v1/incidentes/route.test.ts (idempotente vía
    // onConflictDoNothing — puede que este archivo corra antes o después).
    // MTTR = 100 min (> 90) pero hora_fin−hora_primera_resp = 70 min (<= 90).
    const [inc] = await db.insert(schema.incidentes).values({
      codigo: 'TST-V1-SLA-01',
      tiendaId, registradoPorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      evaluableProveedor: true,
      horaRegistro: new Date(LUNES_10AM_LIMA),
      horaFin: new Date(horasDespues(LUNES_10AM_LIMA, 100 / 60)),
      mttrMinutos: 100,
    }).onConflictDoNothing().returning()

    const incidenteId = inc?.id ?? (await db.select({ id: schema.incidentes.id }).from(schema.incidentes)
      .where(eq(schema.incidentes.codigo, 'TST-V1-SLA-01')))[0].id

    const yaExiste = await db.select().from(schema.escalamientos).where(eq(schema.escalamientos.incidenteId, incidenteId))
    if (yaExiste.length === 0) {
      await db.insert(schema.escalamientos).values({
        incidenteId,
        nivel: 1,
        contactoEscalado: 'Soporte Test',
        emailContacto: 'soporte@bitel-test.pe',
        horaEnvioCorreo: new Date(horasDespues(LUNES_10AM_LIMA, 20 / 60)),
        horaRespuesta:   new Date(horasDespues(LUNES_10AM_LIMA, 30 / 60)),
      })
    }
  })

  it('sla_resolucion_pct = 100% para el día del fixture (correcto según hora_primera_resp, no 0% como daría el MTTR)', async () => {
    const { GET } = await import('./route')
    // Único incidente de BITEL TEST con escalamiento (hora_envio_correo) el 2024-01-08 —
    // así el porcentaje de ese día depende solo de este fixture.
    const req = new NextRequest('http://localhost/api/v1/proveedores?desde=2024-01-08&hasta=2024-01-08&key=test-api-key')
    const res = await GET(req)
    const body = await res.json()
    const fila = body.data.find((d: any) => d.proveedor === 'BITEL TEST')

    expect(fila, 'BITEL TEST debe aparecer en la respuesta v1/proveedores para ese día').toBeTruthy()
    expect(fila.sla_resolucion_pct).toBe(100)
  })
})
