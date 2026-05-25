import { db } from '@/lib/db'
import { tiendas } from '@/drizzle/schema'
import { isNull, isNotNull, sql } from 'drizzle-orm'

async function main() {
  const result = await db.execute(
    sql`UPDATE tiendas
        SET celular_tienda = administrador_celular
        WHERE celular_tienda IS NULL
          AND administrador_celular IS NOT NULL`
  )
  console.log('Migración completada:', result)
}

main().catch(console.error).finally(() => process.exit())
