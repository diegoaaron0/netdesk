import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq, and } from 'drizzle-orm'

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'supervisor-test@netdesk-test.local', rol: 'SUPERVISOR' } }),
}))

const PROVEEDOR_NOMBRE = 'IMPACTO NIVELES TEST PROV'
const NIVEL = 9

let proveedorId: string
let nivelMoldeId: string

// Ficha aislada (codigo único por caso) con su nivel N9 en el estado/personalizado
// indicados. Se borra y reinserta en cada corrida (idempotente); borrar la ficha
// cascadea a fichas_niveles (onDelete: 'cascade'), así que no hace falta borrar
// el nivel aparte.
async function tiendaConFicha(codigoTienda: string, codigoFicha: string, estadoFicha: string, personalizado: boolean) {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  let [t] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.codigo, codigoTienda))
  if (!t) {
    [t] = await db.insert(schema.tiendas).values({
      codigo: codigoTienda, nombreCc: `Tienda aislada — ${codigoTienda}`, distrito: 'Test', cluster: 'B',
    }).returning()
  }

  await db.delete(schema.fichas).where(eq(schema.fichas.codigo, codigoFicha))

  const [f] = await db.insert(schema.fichas).values({
    codigo: codigoFicha, tiendaId: t.id, proveedorId, estado: estadoFicha as any,
  }).returning()

  await db.insert(schema.fichasNiveles).values({
    fichaId: f.id, nivel: NIVEL, nombreContacto: 'Contacto ficha (antes de sync)', personalizado,
  })

  return f.id
}

beforeAll(async () => {
  const { db } = await import('@/lib/db')
  const schema = await import('@/drizzle/schema')

  let [prov] = await db.select().from(schema.proveedores).where(eq(schema.proveedores.nombre, PROVEEDOR_NOMBRE))
  if (!prov) [prov] = await db.insert(schema.proveedores).values({ nombre: PROVEEDOR_NOMBRE }).returning()
  proveedorId = prov.id

  let [nivel] = await db.select().from(schema.proveedoresNiveles)
    .where(and(eq(schema.proveedoresNiveles.proveedorId, proveedorId), eq(schema.proveedoresNiveles.nivel, NIVEL)))
  if (!nivel) {
    [nivel] = await db.insert(schema.proveedoresNiveles).values({
      proveedorId, nivel: NIVEL, nombreContacto: 'Contacto Molde N9',
    }).returning()
  }
  nivelMoldeId = nivel.id

  // Cuentan (sincronizadas y no históricas/dadas de baja):
  await tiendaConFicha('T-IMPACTO-01-ACTIVA-SYNC', 'FC-IMPACTO-01', 'ACTIVA', false)
  await tiendaConFicha('T-IMPACTO-02-BORRADOR-SYNC', 'FC-IMPACTO-02', 'BORRADOR', false)
  // No cuentan:
  await tiendaConFicha('T-IMPACTO-03-ACTIVA-PERSONALIZADA', 'FC-IMPACTO-03', 'ACTIVA', true)
  await tiendaConFicha('T-IMPACTO-04-HISTORICA-SYNC', 'FC-IMPACTO-04', 'HISTORICA', false)
  await tiendaConFicha('T-IMPACTO-05-BAJA-SYNC', 'FC-IMPACTO-05', 'DADA_DE_BAJA', false)
})

describe('GET /api/proveedores/[id]/niveles/[nivelId]/impacto', () => {
  it('cuenta solo fichas no históricas/dadas de baja con ese nivel sincronizado (mismo predicado que la propagación real)', async () => {
    const { GET } = await import('./route')
    const res = await GET({} as any, { params: Promise.resolve({ id: proveedorId, nivelId: nivelMoldeId }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.count).toBe(2)
  })

  it('nivel inexistente → 404', async () => {
    const { GET } = await import('./route')
    const res = await GET({} as any, { params: Promise.resolve({ id: proveedorId, nivelId: '00000000-0000-0000-0000-000000000000' }) })
    expect(res.status).toBe(404)
  })
})
