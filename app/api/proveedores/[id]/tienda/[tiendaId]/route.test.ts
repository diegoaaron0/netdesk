import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'agente-test@netdesk-test.local', rol: 'AGENTE' } }),
}))

const LUNES_10AM_LIMA = '2024-01-08T15:00:00.000Z' // lunes 10:00 Lima
function horasDespues(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3600000).toISOString()
}

describe('GET /api/proveedores/[id]/tienda/[tiendaId] — IEI con boleta manual (Paso 0, familia de bug v1)', () => {
  let proveedorId: string
  let tiendaId: string

  beforeAll(async () => {
    const { db } = await import('@/lib/db')
    const schema = await import('@/drizzle/schema')

    const [ref] = await db.select().from(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-P1-001'))
    const [tiendaRef] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, ref.tiendaId))
    proveedorId = tiendaRef.proveedorId!

    // Tienda dedicada y aislada (sin otros incidentes ya sembrados) para que la
    // suma de IEI de esta ruta refleje solo el incidente de este test.
    const [tiendaAislada] = await db.insert(schema.tiendas).values({
      codigo: 'T-TEST-PROVTIENDA-01',
      nombreCc: 'Tienda aislada — test proveedor/tienda',
      distrito: 'Test',
      cluster: 'B',
      proveedorId,
      ventaHoraSoles: '250',
      ventaHoraFdsSoles: '400',
    }).onConflictDoNothing().returning()
    tiendaId = tiendaAislada?.id ?? (await db.select({ id: schema.tiendas.id }).from(schema.tiendas)
      .where(eq(schema.tiendas.codigo, 'T-TEST-PROVTIENDA-01')))[0].id

    // Boleta manual con rendimiento NULA (pérdida total, factor 1.00). El bug:
    // esta ruta nunca lee boleta_rendimiento ni boleta_hora_activacion, así que
    // siempre asume "residual" (factor 0.10) sin importar lo registrado.
    // Se borra cualquier fila previa con este código (de una corrida anterior
    // apuntando a otra tienda aislada) para que el fixture sea autocorrectivo.
    await db.delete(schema.incidentes).where(eq(schema.incidentes.codigo, 'TST-PROVTIENDA-BOLETA-01'))
    await db.insert(schema.incidentes).values({
      codigo: 'TST-PROVTIENDA-BOLETA-01',
      tiendaId, registradoPorId: ref.registradoPorId, proveedorId,
      nivelImpacto: 'ALTO', tipo: 'CAIDA_TOTAL', estado: 'RESUELTO',
      evaluableProveedor: true,
      horaRegistro: new Date(LUNES_10AM_LIMA),
      horaFin: new Date(horasDespues(LUNES_10AM_LIMA, 2)),
      mttrMinutos: 120,
      boletaManual: true,
      boletaRendimiento: 'NULA',
      boletaHoraActivacion: new Date(LUNES_10AM_LIMA),
    })
  })

  it('el IEI refleja rendimiento NULA (factor 1.00 → S/175), no el residual por defecto (factor 0.10 → S/18)', async () => {
    const { GET } = await import('./route')
    const res = await GET({} as any, { params: Promise.resolve({ id: proveedorId, tiendaId }) })
    const data = await res.json()

    // venta_hora_soles=250 (lunes, tarifa de semana) * 2h * margen 0.35 * factor 1.00 (NULA)
    expect(data.metricas.impactoEstimado).toBe(Math.round(250 * 2 * 0.35 * 1.00))
  })
})
