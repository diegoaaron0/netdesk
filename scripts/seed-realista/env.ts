// Primer import de scripts/seed-realista.ts: carga .env.test ANTES de que
// cualquier otro módulo (lib/db, vía lib/mitigacion-tramos) lea DATABASE_URL.
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(__dirname, '../../.env.test'), override: true })

const url = process.env.DATABASE_URL ?? ''
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\/netdesk_test(\?|$)/.test(url)) {
  throw new Error('Rechazado: DATABASE_URL no apunta a netdesk_test en localhost. Este seed es solo para la BD local de pruebas.')
}
