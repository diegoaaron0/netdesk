// Siembra datos representativos en la BD de pruebas (netdesk_test) para los
// Pasos 1, 2 y 3 del arreglo del módulo Incidentes. Se corre a mano:
//   DATABASE_URL=... npx tsx tests/fixtures/seed-test-data.ts
// NUNCA correr contra Railway/producción.
import 'dotenv/config'
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(__dirname, '../../.env.test'), override: true })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import * as schema from '../../drizzle/schema'

async function main() {
  const url = process.env.DATABASE_URL!
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`Rechazado: DATABASE_URL no apunta a localhost (${url}). Esto es solo para BD local.`)
  }
  const client = postgres(url)
  const db = drizzle(client, { schema })

  const [proveedor] = await db.insert(schema.proveedores).values({
    nombre: 'BITEL TEST',
    correoSoporte: 'soporte@bitel-test.pe',
    telefonoSoporte: '999999999',
  }).returning()

  const [tienda] = await db.insert(schema.tiendas).values({
    codigo: 'T-TEST01',
    nombreCc: 'Tienda de Prueba 01',
    distrito: 'Test',
    cluster: 'B',
    proveedorId: proveedor.id,
    ventaHoraSoles: '250',
    ventaHoraFdsSoles: '400',
    tieneContingencia: true,
  }).returning()

  const [ficha] = await db.insert(schema.fichas).values({
    codigo: 'FC-TEST-001',
    tiendaId: tienda.id,
    proveedorId: proveedor.id,
    estado: 'ACTIVA',
    tiempoRespuestaSla: 60,
    tiempoResolucionSla: 90,
  }).returning()

  await db.update(schema.tiendas).set({ fichaActivaId: ficha.id }).where(eq(schema.tiendas.id, tienda.id))

  const [usuario] = await db.insert(schema.usuarios).values({
    nombre: 'Agente Test',
    email: 'agente-test@netdesk-test.local',
    rol: 'AGENTE',
  }).returning()

  const baseIncidente = {
    tiendaId: tienda.id,
    registradoPorId: usuario.id,
    nivelImpacto: 'ALTO' as const,
    tipo: 'CAIDA_TOTAL' as const,
    estado: 'RESUELTO' as const,
    evaluableProveedor: true,
  }

  // ── Fixture Paso 1: proveedorId vacío en el incidente, la tienda SÍ tiene proveedor ──
  const [incSinProveedor] = await db.insert(schema.incidentes).values({
    ...baseIncidente,
    codigo: 'TST-P1-001',
    proveedorId: null, // caso a cubrir: debe caer al proveedor de la tienda (COALESCE)
    horaRegistro: new Date('2024-01-08T15:00:00.000Z'),
    horaFin: new Date('2024-01-08T17:00:00.000Z'),
    mttrMinutos: 120,
  }).returning()

  // ── Fixture Paso 2: incidente de fin de semana (sábado) para comparar IEI v1 vs interno ──
  const [incFinDeSemana] = await db.insert(schema.incidentes).values({
    ...baseIncidente,
    codigo: 'TST-P2-001',
    proveedorId: proveedor.id,
    fichaId: ficha.id,
    horaRegistro: new Date('2024-01-06T15:00:00.000Z'), // sábado 10:00 Lima
    horaFin: new Date('2024-01-06T18:00:00.000Z'),       // 3h después
    mttrMinutos: 180,
  }).returning()

  // ── Fixtures Paso 3: valores legado de rendimiento en cont_rendimiento / mov_rendimiento ──
  const legado = ['TOTAL', 'EFECTIVA', 'LIMITADA', 'FALLIDA', 'NO_FUNCIONO', 'INOPERATIVA']
  const nuevos = ['EFECTIVO', 'PARCIAL', 'NULO'] // control: no deben cambiar

  let n = 1
  for (const rend of legado) {
    const horaReg = new Date(`2024-01-0${8 + (n % 2)}T15:00:00.000Z`)
    await db.insert(schema.incidentes).values({
      ...baseIncidente,
      codigo: `TST-P3-LEG-${String(n).padStart(2, '0')}`,
      proveedorId: proveedor.id,
      fichaId: ficha.id,
      horaRegistro: horaReg,
      horaFin: new Date(horaReg.getTime() + 2 * 3600000),
      mttrMinutos: 120,
      contActivadoPor: 'TIENDA',
      contHoraActivacion: horaReg,
      contHoraDesactivacion: new Date(horaReg.getTime() + 2 * 3600000),
      contRendimiento: rend,
    })
    n++
  }
  // Uno con el valor legado también en mov_rendimiento (datos móviles)
  await db.insert(schema.incidentes).values({
    ...baseIncidente,
    codigo: 'TST-P3-LEG-MOV-01',
    proveedorId: proveedor.id,
    fichaId: ficha.id,
    horaRegistro: new Date('2024-01-08T15:00:00.000Z'),
    horaFin: new Date('2024-01-08T17:00:00.000Z'),
    mttrMinutos: 120,
    movActivadoPor: 'AGENTE',
    movHoraActivacion: new Date('2024-01-08T15:00:00.000Z'),
    movHoraDesactivacion: new Date('2024-01-08T17:00:00.000Z'),
    movRendimiento: 'LIMITADA',
  })

  n = 1
  for (const rend of nuevos) {
    const horaReg = new Date(`2024-01-0${8 + (n % 2)}T15:00:00.000Z`)
    await db.insert(schema.incidentes).values({
      ...baseIncidente,
      codigo: `TST-P3-NEW-${String(n).padStart(2, '0')}`,
      proveedorId: proveedor.id,
      fichaId: ficha.id,
      horaRegistro: horaReg,
      horaFin: new Date(horaReg.getTime() + 2 * 3600000),
      mttrMinutos: 120,
      contActivadoPor: 'TIENDA',
      contHoraActivacion: horaReg,
      contHoraDesactivacion: new Date(horaReg.getTime() + 2 * 3600000),
      contRendimiento: rend,
    })
    n++
  }

  console.log('Seed OK:', {
    proveedor: proveedor.id,
    tienda: tienda.id,
    ficha: ficha.id,
    usuario: usuario.id,
    incSinProveedor: incSinProveedor.codigo,
    incFinDeSemana: incFinDeSemana.codigo,
  })

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
