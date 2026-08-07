import { config } from 'dotenv'
import path from 'path'

// Carga .env.test (BD local aislada) — nunca .env (que apunta a Railway).
config({ path: path.resolve(__dirname, '../.env.test') })
