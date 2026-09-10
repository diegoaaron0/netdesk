// Backfill del deploy inicial: marca a TODOS los usuarios existentes para que
// cambien su contraseña en su próximo login.
//
// Motivo: hasta ahora las altas usaban una contraseña por defecto compartida del
// sistema, así que hay cuentas cuya contraseña conoce más de una persona. Con el
// pase a producción, todos deben pasar una vez por el cambio forzado y quedar
// siendo los únicos que la saben.
//
// POR QUÉ NO VA EN drizzle/run-sql.ts: ese script lo corre Railway en CADA
// arranque (railway.toml → startCommand). Este UPDATE no es idempotente en la
// práctica — su condición vuelve a ser verdadera apenas alguien cambia su
// contraseña —, así que ahí dentro re-marcaría a todo el mundo en cada deploy,
// para siempre. Es una migración de una sola vez y va como las demás: a mano,
// desde el runbook del deploy.
//
// Uso:
//   npx tsx scripts/migrate-forzar-cambio-password.ts             (solo reporta)
//   npx tsx scripts/migrate-forzar-cambio-password.ts --aplicar   (escribe)
//
// Cablea .env.test explícitamente y se niega a correr si el host no es local.
import { config } from 'dotenv'
import path from 'path'
import { pathToFileURL } from 'url'
config({ path: path.resolve(__dirname, '../.env.test'), override: true })

import postgres from 'postgres'

async function main() {
  const url = process.env.DATABASE_URL!
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`Rechazado: DATABASE_URL no apunta a localhost (${url.replace(/:[^:@]+@/, ':***@')}). Este script es solo para BD local.`)
  }
  const aplicar = process.argv.includes('--aplicar')
  const sql = postgres(url)
  console.log('BD destino:', url.replace(/:[^:@]+@/, ':***@'))
  console.log(aplicar ? 'MODO: escritura' : 'MODO: solo reporte (agregá --aplicar para escribir)')

  const [antes] = await sql`
    SELECT COUNT(*) FILTER (WHERE debe_cambiar_password = false)::int AS pendientes,
           COUNT(*) FILTER (WHERE debe_cambiar_password = true)::int  AS ya_marcados,
           COUNT(*)::int                                              AS total
    FROM usuarios WHERE eliminado_en IS NULL
  `
  console.log(`\nusuarios (no eliminados): ${antes.total}`)
  console.log(`  ya marcados para cambiar: ${antes.ya_marcados}`)
  console.log(`  se van a marcar:          ${antes.pendientes}`)

  if (!aplicar) {
    console.log('\nNada escrito. Volvé a correrlo con --aplicar para confirmar.')
    await sql.end()
    return
  }

  // Mismo alcance que el conteo de arriba: sin esto el UPDATE también tocaba
  // usuarios eliminados y el reporte no cuadraba con lo que realmente escribía.
  // Una cuenta eliminada no puede loguearse, así que marcarla no aporta nada.
  const filas = await sql`
    UPDATE usuarios SET debe_cambiar_password = true
    WHERE debe_cambiar_password = false AND eliminado_en IS NULL
    RETURNING id
  `
  console.log(`\nmarcados: ${filas.length}`)

  const [despues] = await sql`
    SELECT COUNT(*) FILTER (WHERE debe_cambiar_password = false)::int AS pendientes
    FROM usuarios WHERE eliminado_en IS NULL
  `
  console.log(`quedan sin marcar: ${despues.pendientes} (esperado 0)`)
  await sql.end()
}

const esEjecucionDirecta = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href
if (esEjecucionDirecta) {
  main().catch(e => { console.error(e); process.exit(1) })
}
