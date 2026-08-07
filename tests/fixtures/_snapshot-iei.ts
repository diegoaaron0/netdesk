// Utilidad de verificación (no permanente): calcula el IEI de los incidentes
// TST-P3-* con la lógica ACTUAL de impacto-calc.ts, para comparar antes/después
// de migrar los datos y limpiar el código legado. Solo contra BD local.
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(__dirname, '../../.env.test'), override: true })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { like, or, eq } from 'drizzle-orm'
import * as schema from '../../drizzle/schema'
import { calcImpactoRow } from '../../lib/impacto-calc'

async function main() {
  const url = process.env.DATABASE_URL!
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error(`Rechazado: DATABASE_URL no es local (${url})`)
  const client = postgres(url)
  const db = drizzle(client, { schema })

  const incs = await db.select().from(schema.incidentes)
    .where(or(like(schema.incidentes.codigo, 'TST-P3-%')))

  const out: Record<string, any> = {}
  for (const inc of incs) {
    const [tienda] = await db.select().from(schema.tiendas).where(eq(schema.tiendas.id, inc.tiendaId))
    const res = calcImpactoRow({
      hora_registro: inc.horaRegistro,
      hora_fin: inc.horaFin,
      estado: inc.estado,
      tipo: inc.tipo,
      venta_hora_soles: tienda?.ventaHoraSoles != null ? Number(tienda.ventaHoraSoles) : null,
      venta_hora_fds_soles: tienda?.ventaHoraFdsSoles != null ? Number(tienda.ventaHoraFdsSoles) : null,
      cluster: tienda?.cluster,
      cont_hora_activacion: inc.contActivadoPor ? inc.contHoraActivacion : null,
      cont_hora_desactivacion: inc.contHoraDesactivacion,
      cont_rendimiento: inc.contRendimiento,
      cont_es_externo: inc.contEsExterno,
      mov_hora_activacion: inc.movHoraActivacion,
      mov_hora_desactivacion: inc.movHoraDesactivacion,
      mov_rendimiento: inc.movRendimiento,
    })
    out[inc.codigo] = {
      cont_rendimiento: inc.contRendimiento,
      mov_rendimiento: inc.movRendimiento,
      factorAplicado: res.factorAplicado,
      impactoEstimado: res.impactoEstimado,
    }
  }
  console.log(JSON.stringify(out, null, 2))
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
