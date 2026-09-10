/**
 * Cierra los tramos de mitigación que quedaron huérfanos por la divergencia que
 * arregló el commit "fix(incidentes): desactivar la mitigación también cierra el
 * tramo abierto": el botón de desactivar del dashboard operativo sellaba
 * cont_/mov_/boleta_ pero dejaba el tramo abierto, y el IEI seguía acumulando
 * con el factor mitigado indefinidamente.
 *
 * QUÉ CORRIGE
 *   Un tramo con hasta IS NULL cuyo campo viejo del MISMO tipo ya está sellado:
 *     ROUTER_PROPIO / ROUTER_EXTERNO → cont_hora_desactivacion NOT NULL
 *     DATOS_MOVILES                  → mov_hora_desactivacion  NOT NULL
 *     BOLETA_MANUAL                  → boleta_manual IS NOT TRUE
 *   También los tramos abiertos en incidentes ya RESUELTO/CANCELADO/CERRADO:
 *   nada los va a cerrar nunca. Ahí la hora de cierre es hora_fin.
 *
 * CÓMO CIERRA
 *   hasta = la hora del campo viejo (o hora_fin en incidentes cerrados) — es el
 *   instante real en que el agente apagó la mitigación. Nunca NOW(): eso
 *   inflaría el IEI con todo el tiempo que el tramo estuvo huérfano.
 *   ie_tramo = calcIeTramo(...), la misma función que usa el flujo normal.
 *   Si el incidente sigue abierto, se abre un tramo SIN_MITIGACION desde ese
 *   mismo instante, para no dejar un hueco sin cobertura en la línea de tiempo.
 *
 * USO
 *   npx tsx scripts/fix-tramos-huerfanos.ts            → dry-run (no escribe)
 *   npx tsx scripts/fix-tramos-huerfanos.ts --aplicar  → escribe
 *
 * NO está en drizzle/run-sql.ts a propósito: Railway lo re-ejecuta en cada
 * deploy y esto es una corrección de una sola vez.
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(__dirname, '../.env.test'), override: true })
import postgres from 'postgres'
import { calcIeTramo, factorBaseSinMitigacion, type TipoMitigacionTramo } from '../lib/mitigacion-tramos'

const APLICAR = process.argv.includes('--aplicar')
const TIPOS_ROUTER = ['ROUTER_PROPIO', 'ROUTER_EXTERNO']

const dbUrl = process.env.DATABASE_URL ?? ''
const apuntaARailway = /railway|rlwy/i.test(dbUrl)
const dentroDeRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID)
if (apuntaARailway && !dentroDeRailway) {
  throw new Error(
    'Rechazado: DATABASE_URL apunta a Railway desde una corrida local.\n' +
    'Para correr contra producción hay que hacerlo con autorización explícita y\n' +
    'apuntando la variable a mano, no por el .env del proyecto.',
  )
}

const sql = postgres(dbUrl)

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR (escribe) ===' : '=== DRY-RUN (no escribe) ===')
  console.log('BD:', dbUrl.replace(/:[^:@]+@/, ':***@'), '\n')

  const huerfanos = await sql`
    SELECT
      tr.id AS tramo_id, tr.tipo, tr.factor, tr.desde, tr.router_externo_id,
      i.id AS incidente_id, i.codigo, i.estado, i.tipo AS tipo_incidente, i.tienda_id,
      t.codigo AS tienda_codigo, t.venta_hora_soles, t.venta_hora_fds_soles,
      CASE
        WHEN i.estado IN ('RESUELTO','CANCELADO','CERRADO') THEN i.hora_fin
        WHEN tr.tipo IN ('ROUTER_PROPIO','ROUTER_EXTERNO')  THEN i.cont_hora_desactivacion
        WHEN tr.tipo = 'DATOS_MOVILES'                      THEN i.mov_hora_desactivacion
        WHEN tr.tipo = 'BOLETA_MANUAL'                      THEN i.hora_fin
      END AS cierre
    FROM incidente_mitigacion_tramos tr
    JOIN incidentes i ON i.id = tr.incidente_id
    JOIN tiendas    t ON t.id = i.tienda_id
    WHERE tr.hasta IS NULL
      AND (
        i.estado IN ('RESUELTO','CANCELADO','CERRADO')
        OR (tr.tipo IN ('ROUTER_PROPIO','ROUTER_EXTERNO') AND i.cont_hora_desactivacion IS NOT NULL)
        OR (tr.tipo = 'DATOS_MOVILES' AND i.mov_hora_desactivacion IS NOT NULL)
        OR (tr.tipo = 'BOLETA_MANUAL' AND i.boleta_manual IS NOT TRUE)
      )
    ORDER BY tr.desde ASC`

  if (huerfanos.length === 0) {
    console.log('No hay tramos huérfanos. Nada que corregir.')
    await sql.end()
    return
  }

  console.log(`Tramos huérfanos encontrados: ${huerfanos.length}\n`)
  let sinCierre = 0
  let invertidos = 0
  const aCorregir: any[] = []

  for (const h of huerfanos) {
    // Sin hora de cierre confiable no se toca: mejor dejarlo abierto y visible
    // que sellarlo con una fecha inventada.
    if (!h.cierre) {
      console.log(`  ⚠ ${h.codigo} (${h.tipo}): sin hora de cierre determinable — SE SALTEA`)
      sinCierre++
      continue
    }
    if (new Date(h.cierre) < new Date(h.desde)) {
      console.log(`  ⚠ ${h.codigo} (${h.tipo}): la hora de cierre es anterior al inicio del tramo — SE SALTEA`)
      invertidos++
      continue
    }

    const ieTramo = calcIeTramo(
      { tipo: h.tipo as TipoMitigacionTramo, factor: h.factor, desde: h.desde, hasta: h.cierre, tipoIncidente: h.tipo_incidente },
      { ventaHoraSoles: h.venta_hora_soles, ventaHoraFdsSoles: h.venta_hora_fds_soles },
      new Date(h.cierre),
    )
    const horas = (new Date(h.cierre).getTime() - new Date(h.desde).getTime()) / 3600000
    const sigueAbierto = !['RESUELTO', 'CANCELADO', 'CERRADO'].includes(h.estado)

    console.log(
      `  ${h.codigo} ${h.tienda_codigo} ${h.tipo} (${h.estado}): ` +
      `${horas.toFixed(1)}h → IEI S/ ${ieTramo.toFixed(2)}` +
      (sigueAbierto ? ' + abre SIN_MITIGACION' : ''),
    )
    aCorregir.push({ ...h, ieTramo, sigueAbierto })
  }

  console.log(`\nA corregir: ${aCorregir.length} | Salteados: ${sinCierre + invertidos}`)

  if (!APLICAR) {
    console.log('\nDry-run: no se escribió nada. Correr con --aplicar para ejecutar.')
    await sql.end()
    return
  }

  await sql.begin(async (tx) => {
    for (const c of aCorregir) {
      await tx`
        UPDATE incidente_mitigacion_tramos
        SET hasta = ${c.cierre}, ie_tramo = ${String(c.ieTramo)}, actualizado_en = NOW()
        WHERE id = ${c.tramo_id} AND hasta IS NULL`

      if (c.sigueAbierto) {
        await tx`
          INSERT INTO incidente_mitigacion_tramos (incidente_id, tipo, factor, desde, hasta, observacion)
          VALUES (
            ${c.incidente_id}, 'SIN_MITIGACION',
            ${String(factorBaseSinMitigacion(c.tipo_incidente))}, ${c.cierre}, NULL,
            'Abierto por fix-tramos-huerfanos: el tramo previo quedo sin cerrar por la divergencia con cont_/mov_/boleta_'
          )`
      }

      // Un router externo cuyo tramo se cierra ya no está activo en la tienda.
      if (TIPOS_ROUTER.includes(c.tipo) && c.router_externo_id) {
        await tx`
          UPDATE routers_externos SET estado = 'EN_TIENDA_INACTIVO'
          WHERE id = ${c.router_externo_id} AND estado = 'EN_TIENDA_ACTIVO'`
      }
    }
  })

  console.log(`\n✓ Corregidos ${aCorregir.length} tramos.`)

  const [quedan] = await sql`
    SELECT COUNT(*)::int AS n FROM incidente_mitigacion_tramos tr
    JOIN incidentes i ON i.id = tr.incidente_id
    WHERE tr.hasta IS NULL AND i.estado IN ('RESUELTO','CANCELADO','CERRADO')`
  console.log('Verificación — tramos abiertos en incidentes cerrados:', quedan.n)

  await sql.end()
}

main().catch(async (e) => {
  console.error('ERROR:', e.message)
  try { await sql.end() } catch {}
  process.exit(1)
})
