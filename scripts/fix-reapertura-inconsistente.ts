/**
 * Deshace las reaperturas espurias: incidentes con
 * `hora_registro_original <> hora_registro` pero `hora_fin_anterior IS NULL`.
 *
 * POR QUÉ EXISTEN
 *   `POST /reabrir` no validaba el estado del incidente. Reabrir uno que seguía
 *   ABIERTO tomaba `horaFin` (null) como `horaFinAnterior` y reiniciaba
 *   `horaRegistro`, dejando la firma REABERTURA_INCONSISTENTE — la que dejó a
 *   00071M fuera de la migración de tramos. El endpoint ya valida el estado, así
 *   que no pueden aparecer filas nuevas; esto limpia las que quedaron.
 *
 * QUÉ HACE
 *   Deshace la reapertura, porque nunca hubo un cierre previo: el incidente
 *   corrió continuo. `hora_registro` vuelve a `hora_registro_original`,
 *   `hora_registro_original` y los campos de reapertura se limpian, y
 *   `mttr_minutos` se recalcula sobre el ciclo real. La justificación original
 *   se preserva en `observaciones` para no perder el rastro de auditoría.
 *
 * USO
 *   npx tsx scripts/fix-reapertura-inconsistente.ts                     dry-run local
 *   npx tsx scripts/fix-reapertura-inconsistente.ts --aplicar           escribe local
 *   npx tsx scripts/fix-reapertura-inconsistente.ts --railway           dry-run Railway
 *   npx tsx scripts/fix-reapertura-inconsistente.ts --railway --aplicar escribe Railway
 *
 * Correr ANTES de desplegar el CHECK `incidentes_reapertura_consistente`: con
 * filas que lo violen, el ALTER TABLE de run-sql.ts no lo agrega (lo saltea con
 * un WARNING, no tumba el deploy) y la constraint nunca queda puesta.
 */
import { config } from 'dotenv'
import path from 'path'
import postgres from 'postgres'

const APLICAR = process.argv.includes('--aplicar')
const RAILWAY = process.argv.includes('--railway')

// Railway solo con --railway explícito: nunca por arrastre del .env del proyecto.
const envFile = RAILWAY ? '.env.railway.bak' : '.env.test'
const env = config({ path: path.resolve(__dirname, `../${envFile}`), override: true })
const dbUrl = env.parsed?.DATABASE_URL ?? ''

if (RAILWAY && !dbUrl.includes('tramway.proxy.rlwy.net:10333')) {
  throw new Error('Rechazado: --railway pero la URL no es tramway.proxy.rlwy.net:10333')
}
if (!RAILWAY && /railway|rlwy/i.test(dbUrl)) {
  throw new Error('Rechazado: sin --railway pero la URL apunta a Railway')
}

const sql = postgres(dbUrl, { max: 1 })

async function main() {
  console.log(RAILWAY ? '### RAILWAY (PRODUCCIÓN) ###' : '### BD local ###')
  console.log(APLICAR ? '=== MODO APLICAR (escribe) ===' : '=== DRY-RUN (no escribe) ===')
  console.log('BD:', dbUrl.replace(/:[^:@]+@/, ':***@'), '\n')

  // Los timestamps se traen como TEXTO y las asignaciones se hacen enteras en
  // SQL. Pasar por un Date de JS corre la hora: postgres.js parsea un
  // `timestamp` naive como hora local y lo reserializa por sus componentes UTC,
  // sumando el offset. Ese round-trip ya movió 5 horas una fila en producción.
  const malas = await sql`
    SELECT id, codigo, estado,
      hora_registro::text          AS reg_texto,
      hora_registro_original::text AS orig_texto,
      hora_fin::text               AS fin_texto,
      mttr_minutos,
      CASE WHEN hora_fin IS NULL THEN NULL
           ELSE ROUND(EXTRACT(EPOCH FROM (hora_fin - hora_registro_original))/60)::int
      END AS mttr_nuevo,
      tiempo_acumulado_min, iei_acumulado,
      motivo_reabertura, justificacion_reabertura, reabrierta_info,
      mitigaciones_previas
    FROM incidentes
    WHERE hora_registro_original IS NOT NULL
      AND hora_registro_original <> hora_registro
      AND hora_fin_anterior IS NULL
    ORDER BY hora_registro`

  if (malas.length === 0) {
    console.log('No hay reaperturas inconsistentes. Nada que corregir.')
    await sql.end()
    return
  }

  console.log(`Reaperturas inconsistentes: ${malas.length}\n`)
  const aCorregir: any[] = []

  for (const m of malas) {
    // Con mitigaciones_previas o tiempo acumulado hubo un ciclo previo real:
    // deshacer la reapertura perdería ese dato. Se saltea para revisión manual.
    if (m.mitigaciones_previas != null || m.tiempo_acumulado_min != null || m.iei_acumulado != null) {
      console.log(`  ⚠ ${m.codigo}: tiene rastro de un ciclo previo real (previas/acumulados) — SE SALTEA`)
      continue
    }

    console.log(
      `  ${m.codigo} (${m.estado}): hora_registro ${m.reg_texto} → ${m.orig_texto} | ` +
      `mttr ${m.mttr_minutos ?? '—'} → ${m.mttr_nuevo ?? '—'} min | se limpia la reapertura`,
    )
    aCorregir.push(m)
  }

  console.log(`\nA corregir: ${aCorregir.length} | Salteados: ${malas.length - aCorregir.length}`)

  if (!APLICAR) {
    console.log('\nDry-run: no se escribió nada. Agregar --aplicar para ejecutar.')
    await sql.end()
    return
  }

  await sql.begin(async (tx) => {
    for (const c of aCorregir) {
      // El rastro de la reapertura espuria se conserva en observaciones: los
      // campos estructurales se limpian, la auditoría no se pierde.
      const nota = `[Corrección ${new Date().toISOString().slice(0, 10)}] Se deshizo una reapertura inconsistente `
        + `(el incidente no estaba cerrado al reabrirse). Registro original: ${c.reabrierta_info ?? c.justificacion_reabertura ?? 'sin detalle'}`

      // hora_registro se copia de hora_registro_original DENTRO del UPDATE y el
      // MTTR se recalcula en SQL: ningún timestamp sale ni vuelve por JS.
      await tx`
        UPDATE incidentes SET
          hora_registro           = hora_registro_original,
          mttr_minutos            = CASE WHEN hora_fin IS NULL THEN NULL
                                    ELSE ROUND(EXTRACT(EPOCH FROM (hora_fin - hora_registro_original))/60)::int END,
          hora_registro_original  = NULL,
          motivo_reabertura       = NULL,
          justificacion_reabertura = NULL,
          reabrierta_info         = NULL,
          observaciones           = COALESCE(observaciones || E'\n', '') || ${nota},
          actualizado_en          = NOW()
        WHERE id = ${c.id}
          AND hora_registro_original IS NOT NULL
          AND hora_registro_original <> hora_registro
          AND hora_fin_anterior IS NULL`
    }
  })

  console.log(`\n✓ Corregidos ${aCorregir.length}.`)

  const [quedan] = await sql`
    SELECT COUNT(*)::int AS n FROM incidentes
    WHERE hora_registro_original IS NOT NULL
      AND hora_registro_original <> hora_registro
      AND hora_fin_anterior IS NULL`
  console.log('Verificación — filas que violarían el CHECK:', quedan.n)

  await sql.end()
}

main().catch(async (e) => {
  console.error('ERROR:', e.message)
  try { await sql.end() } catch {}
  process.exit(1)
})
