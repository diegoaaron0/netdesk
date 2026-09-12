// ESTADO: EJECUTADO contra produccion post-deploy: 204 de 215 incidentes migrados. No volver a correr.
// Fase 3 — migración histórica: reconstruye incidente_mitigacion_tramos para
// incidentes viejos a partir de sus campos actuales (cont_*, mov_*, boleta_*,
// mitigaciones_previas). Ver lib/migracion-tramos-historicos.ts para el
// algoritmo (función pura, con su propia batería de tests).
//
// SOLO CONSTRUIR Y PROBAR CONTRA FIXTURES por ahora — correr esto contra
// producción/Railway requiere autorización explícita aparte, más adelante.
// El guard de abajo ya lo impide técnicamente (se niega a correr si el host
// no es local); cuando llegue el momento del corte final, ese guard se
// reemplaza — no se retira a la ligera.
//
// Diseño (confirmado):
//   - Por lotes de 500, no una transacción gigante — permite pausar e inspeccionar.
//   - Idempotente: un incidente que ya tiene tramos se salta.
//   - Verificación obligatoria para RESUELTO: calcImpactoRow(ciclo actual) +
//     iei_acumulado (el IEI "ya conocido", igual que lo muestra hoy el detalle
//     del incidente) debe coincidir con SUM(ie_tramo) dentro de una tolerancia
//     chica de redondeo (cada tramo se redondea individualmente; calcImpactoRow
//     redondea solo el total — la tolerancia absorbe esa deriva).
//   - Tolerancia a fallos: un incidente que no migra limpio NO frena el lote;
//     se registra con su motivo exacto y se sigue. Al final se reclasifica en
//     (a) barato de corregir (RECLASIFICABLES, ver abajo) o (b) excepción
//     documentada — hoy (a) está vacío porque cada caso raro ya conocido
//     (activación previa al registro, rendimiento legado, sin
//     horaDesactivacion) ya es una regla de primera clase en
//     construirTramosIncidente y nunca llega a fallar por esas causas.
//
// Uso:  npx tsx scripts/migrate-tramos-historicos.ts
// Cablea .env.test explícitamente y se niega a correr si el host no es local.
import { config } from 'dotenv'
import path from 'path'
import { pathToFileURL } from 'url'
config({ path: path.resolve(__dirname, '../.env.test'), override: true })

import postgres from 'postgres'
import { construirTramosIncidente, type IncidenteMigracionInput, type TiendaVentaInput, type TramoConstruido } from '../lib/migracion-tramos-historicos'
import { calcImpactoRow } from '../lib/impacto-calc'

export const TAMANO_LOTE = 500
export const tolerancia = (n: number) => Math.max(2, n)

export interface FalloMigracion {
  id: string
  codigoIncidente: string
  codigo: string
  motivo: string
}

export interface ResultadoMigracionTotal {
  totalProcesados: number
  totalYaMigrados: number
  totalMigrados: number
  fallos: FalloMigracion[]
  dryRun: boolean
}

// postgres.js: dos comportamientos distintos medidos empíricamente en este
// proyecto para columnas `timestamp` (sin zona, que acá siempre guardan UTC
// — ver CLAUDE.md):
//   - LECTURA: decodifica el valor binario usando el timezone LOCAL de la
//     máquina donde corre Node (no UTC). `connection: { TimeZone: 'UTC' }`
//     NO lo corrige — eso solo afecta casts de texto del lado del servidor,
//     no la decodificación binaria del cliente. Por eso el SELECT castea
//     cada columna a ::text y acá se parsea a mano, siempre como UTC.
//   - ESCRITURA: un objeto Date real SÍ se codifica bien (usa su instante
//     UTC, agnóstico al timezone local) — pero un STRING que "parece" fecha
//     sin offset explícito se reinterpreta como hora LOCAL antes de
//     codificarse. Por eso insertarTramos pasa Date directamente, nunca texto.
function naiveTextoAUtc(texto: string | null): Date | null {
  if (texto === null) return null
  return new Date(texto.replace(' ', 'T') + 'Z')
}

interface FilaNormalizada {
  id: string; codigo: string; tipo: string; estado: string
  horaRegistro: Date; horaFin: Date | null
  horaRegistroOriginal: Date | null; horaFinAnterior: Date | null
  mitigacionesPrevias: any
  contActivadoPor: string | null; contHoraActivacion: Date | null; contHoraDesactivacion: Date | null
  contRendimiento: string | null; contObservacion: string | null; contEsExterno: boolean | null
  routerExternoId: string | null
  movActivadoPor: string | null; movHoraActivacion: Date | null; movHoraDesactivacion: Date | null
  movRendimiento: string | null; movObservacion: string | null
  boletaManual: boolean | null; boletaRendimiento: string | null; boletaHoraActivacion: Date | null
  ieiAcumulado: string | null
  ventaHoraSoles: string | null; ventaHoraFdsSoles: string | null; cluster: string | null
}

function normalizarFila(fila: any): FilaNormalizada {
  return {
    id: fila.id, codigo: fila.codigo, tipo: fila.tipo, estado: fila.estado,
    horaRegistro: naiveTextoAUtc(fila.hora_registro)!, horaFin: naiveTextoAUtc(fila.hora_fin),
    horaRegistroOriginal: naiveTextoAUtc(fila.hora_registro_original), horaFinAnterior: naiveTextoAUtc(fila.hora_fin_anterior),
    mitigacionesPrevias: fila.mitigaciones_previas,
    contActivadoPor: fila.cont_activado_por, contHoraActivacion: naiveTextoAUtc(fila.cont_hora_activacion),
    contHoraDesactivacion: naiveTextoAUtc(fila.cont_hora_desactivacion), contRendimiento: fila.cont_rendimiento,
    contObservacion: fila.cont_observacion, contEsExterno: fila.cont_es_externo,
    routerExternoId: fila.router_externo_id,
    movActivadoPor: fila.mov_activado_por, movHoraActivacion: naiveTextoAUtc(fila.mov_hora_activacion),
    movHoraDesactivacion: naiveTextoAUtc(fila.mov_hora_desactivacion), movRendimiento: fila.mov_rendimiento,
    movObservacion: fila.mov_observacion,
    boletaManual: fila.boleta_manual, boletaRendimiento: fila.boleta_rendimiento,
    boletaHoraActivacion: naiveTextoAUtc(fila.boleta_hora_activacion),
    ieiAcumulado: fila.iei_acumulado,
    ventaHoraSoles: fila.venta_hora_soles, ventaHoraFdsSoles: fila.venta_hora_fds_soles, cluster: fila.cluster,
  }
}

function filaAIncidenteInput(f: FilaNormalizada): IncidenteMigracionInput {
  return {
    id: f.id, tipo: f.tipo, estado: f.estado,
    horaRegistro: f.horaRegistro, horaFin: f.horaFin,
    horaRegistroOriginal: f.horaRegistroOriginal, horaFinAnterior: f.horaFinAnterior,
    mitigacionesPrevias: f.mitigacionesPrevias,
    contActivadoPor: f.contActivadoPor, contHoraActivacion: f.contHoraActivacion,
    contHoraDesactivacion: f.contHoraDesactivacion, contRendimiento: f.contRendimiento,
    contObservacion: f.contObservacion, contEsExterno: f.contEsExterno,
    routerExternoId: f.routerExternoId,
    movActivadoPor: f.movActivadoPor, movHoraActivacion: f.movHoraActivacion,
    movHoraDesactivacion: f.movHoraDesactivacion, movRendimiento: f.movRendimiento,
    movObservacion: f.movObservacion,
    boletaManual: f.boletaManual, boletaRendimiento: f.boletaRendimiento,
    boletaHoraActivacion: f.boletaHoraActivacion,
  }
}

function ieiConocido(f: FilaNormalizada): number {
  const cicloActual = calcImpactoRow({
    hora_registro: f.horaRegistro, hora_fin: f.horaFin, estado: f.estado, tipo: f.tipo,
    venta_hora_soles: f.ventaHoraSoles, venta_hora_fds_soles: f.ventaHoraFdsSoles, cluster: f.cluster,
    cont_hora_activacion: f.contActivadoPor ? f.contHoraActivacion : null,
    cont_hora_desactivacion: f.contHoraDesactivacion, cont_rendimiento: f.contRendimiento, cont_es_externo: f.contEsExterno,
    // Mismo gate que cont — bug real confirmado en producción, presente
    // también acá: un timestamp fantasma en mov_hora_activacion (sin
    // movActivadoPor) hubiera inflado el "esperado" contra el que se verifica
    // la migración, generando divergencias falsas.
    mov_hora_activacion: f.movActivadoPor ? f.movHoraActivacion : null, mov_hora_desactivacion: f.movHoraDesactivacion, mov_rendimiento: f.movRendimiento,
    boleta_manual: f.boletaManual, boleta_rendimiento: f.boletaRendimiento, boleta_hora_activacion: f.boletaHoraActivacion,
  }).impactoEconomicoEstimado ?? 0
  return cicloActual + Number(f.ieiAcumulado ?? 0)
}

async function insertarTramos(sql: postgres.Sql, incidenteId: string, tramos: TramoConstruido[]) {
  // IMPORTANTE: pasar t.desde/t.hasta como objetos Date, NUNCA como texto.
  // postgres.js codifica un Date real usando su instante UTC (correcto,
  // agnóstico al timezone de la máquina) — pero si se le pasa un STRING que
  // "parece" una fecha sin offset explícito, lo reinterpreta como hora LOCAL
  // de la máquina antes de codificarlo, introduciendo el mismo desface que
  // esta función existe para evitar. Confirmado empíricamente en este proyecto.
  await sql.begin(async (tx) => {
    for (const t of tramos) {
      await tx`
        INSERT INTO incidente_mitigacion_tramos
          (incidente_id, tipo, factor, activado_por, observacion, router_externo_id, desde, hasta, ie_tramo, origen)
        VALUES (
          ${incidenteId}, ${t.tipo}, ${String(t.factor)}, ${t.activadoPor}, ${t.observacion}, ${t.routerExternoId},
          ${t.desde}, ${t.hasta},
          ${t.ieTramo === null ? null : String(t.ieTramo)}, 'SISTEMA'
        )
      `
    }
  })
}

export interface OpcionesMigracion {
  /** Solo para tests de integración: acota la migración a incidentes cuyo
   *  código empieza con este prefijo, para no procesar fixtures de otros
   *  archivos de test que corren en paralelo contra la misma netdesk_test.
   *  Sin especificar (uso real del script) → TODO el historial, sin filtro. */
  prefijoCodigo?: string
  /** Modo solo-reporte: corre todo el cálculo y la verificación de IEI, pero
   *  NUNCA llama a insertarTramos — cero INSERT, incluso si un incidente
   *  migraría limpio. Usado para el corte de prueba contra Railway. */
  dryRun?: boolean
}

export async function migrarTodo(sql: postgres.Sql, opciones: OpcionesMigracion = {}): Promise<ResultadoMigracionTotal> {
  let offset = 0
  let totalProcesados = 0, totalYaMigrados = 0, totalMigrados = 0
  const fallos: FalloMigracion[] = []
  const filtro = opciones.prefijoCodigo ? sql`WHERE i.codigo LIKE ${opciones.prefijoCodigo + '%'}` : sql``

  for (;;) {
    const filas = await sql`
      SELECT i.id, i.codigo, i.tipo, i.estado,
             i.hora_registro::text AS hora_registro, i.hora_fin::text AS hora_fin,
             i.hora_registro_original::text AS hora_registro_original, i.hora_fin_anterior::text AS hora_fin_anterior,
             i.mitigaciones_previas,
             i.cont_activado_por, i.cont_hora_activacion::text AS cont_hora_activacion,
             i.cont_hora_desactivacion::text AS cont_hora_desactivacion,
             i.cont_rendimiento, i.cont_observacion, i.cont_es_externo, i.router_externo_id,
             i.mov_activado_por, i.mov_hora_activacion::text AS mov_hora_activacion,
             i.mov_hora_desactivacion::text AS mov_hora_desactivacion,
             i.mov_rendimiento, i.mov_observacion,
             i.boleta_manual, i.boleta_rendimiento, i.boleta_hora_activacion::text AS boleta_hora_activacion,
             i.iei_acumulado,
             t.venta_hora_soles, t.venta_hora_fds_soles, t.cluster
      FROM incidentes i
      LEFT JOIN tiendas t ON t.id = i.tienda_id
      ${filtro}
      ORDER BY i.codigo
      LIMIT ${TAMANO_LOTE} OFFSET ${offset}
    `
    if (filas.length === 0) break

    for (const filaCruda of filas) {
      totalProcesados++
      const yaTiene = await sql`SELECT 1 FROM incidente_mitigacion_tramos WHERE incidente_id = ${filaCruda.id} LIMIT 1`
      if (yaTiene.length > 0) { totalYaMigrados++; continue }

      const fila = normalizarFila(filaCruda)
      const inc = filaAIncidenteInput(fila)
      const tienda: TiendaVentaInput = { venta_hora_soles: fila.ventaHoraSoles, venta_hora_fds_soles: fila.ventaHoraFdsSoles, cluster: fila.cluster }

      let resultado: ReturnType<typeof construirTramosIncidente>
      try {
        resultado = construirTramosIncidente(inc, tienda)
      } catch (e: any) {
        fallos.push({ id: fila.id, codigoIncidente: fila.codigo, codigo: 'ERROR_INESPERADO', motivo: e?.message ?? String(e) })
        continue
      }
      if (!resultado.ok) {
        fallos.push({ id: fila.id, codigoIncidente: fila.codigo, codigo: resultado.codigo, motivo: resultado.motivo })
        continue
      }

      if (fila.estado === 'RESUELTO') {
        const conocido = ieiConocido(fila)
        const real = resultado.tramos.reduce((s, t) => s + (t.ieTramo ?? 0), 0)
        const diff = Math.abs(real - conocido)
        if (diff > tolerancia(resultado.tramos.length)) {
          fallos.push({
            id: fila.id, codigoIncidente: fila.codigo, codigo: 'DIVERGENCIA_IEI',
            motivo: `esperado=${conocido}, reconstruido=${real}, diferencia=${diff}`,
          })
          continue
        }
      }

      if (!opciones.dryRun) {
        await insertarTramos(sql, fila.id, resultado.tramos)
      }
      totalMigrados++
    }

    offset += TAMANO_LOTE
  }

  return { totalProcesados, totalYaMigrados, totalMigrados, fallos, dryRun: !!opciones.dryRun }
}

// ─── Reclasificación de fallos: (a) barato de corregir vs (b) excepción ─────
// Vacío a propósito hoy — ver comentario de cabecera. Queda listo para que,
// si una corrida real encuentra un patrón nuevo pero barato, se agregue acá
// sin tocar el resto del script.
const RECLASIFICABLES: Record<string, true> = {}

export function reclasificar(fallos: FalloMigracion[]): { corregidosOk: number; excepciones: FalloMigracion[] } {
  const excepciones = fallos.filter(f => !RECLASIFICABLES[f.codigo])
  return { corregidosOk: fallos.length - excepciones.length, excepciones }
}

export function imprimirReporte(res: ResultadoMigracionTotal) {
  const { corregidosOk, excepciones } = reclasificar(res.fallos)
  console.log(`\n=== Migración de tramos históricos (Fase 3)${res.dryRun ? ' — MODO SOLO-REPORTE (dry-run, cero escrituras)' : ''} ===`)
  console.log(`Procesados:                          ${res.totalProcesados}`)
  console.log(`Ya migrados (idempotente, saltados):  ${res.totalYaMigrados}`)
  console.log(`${res.dryRun ? 'Se migrarían exitosamente (dry-run)' : 'Migrados exitosamente             '}:   ${res.totalMigrados}`)
  console.log(`No migrados (antes de reclasificar):  ${res.fallos.length}`)
  console.log(`Corregidos y migrados al reclasificar: ${corregidosOk}`)
  console.log(`Excepciones finales:                  ${excepciones.length}`)
  if (excepciones.length > 0) {
    const porCodigo = new Map<string, number>()
    for (const e of excepciones) porCodigo.set(e.codigo, (porCodigo.get(e.codigo) ?? 0) + 1)
    console.log('\nExcepciones por código:')
    for (const [codigo, n] of porCodigo) console.log(`  ${codigo}: ${n}`)
    console.log('\nDetalle:')
    for (const e of excepciones) console.log(`  ${e.codigoIncidente} (${e.id}) — [${e.codigo}] ${e.motivo}`)
  }
}

async function main() {
  const url = process.env.DATABASE_URL!
  const dryRun = process.argv.includes('--dry-run')

  // El guard de "solo localhost" se relaja ÚNICAMENTE para --dry-run — la
  // escritura real sigue bloqueada contra cualquier host que no sea local,
  // sin excepción. Correr en modo escritura contra producción requiere
  // autorización explícita aparte (Fase 3, pendiente).
  if (!dryRun && !/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`Rechazado: DATABASE_URL no apunta a localhost (${url}). Correr esto en modo escritura contra producción requiere autorización explícita aparte (Fase 3, pendiente). Usa --dry-run para un corte de solo lectura.`)
  }

  // TimeZone: 'UTC' es obligatorio — sin esto, postgres.js interpreta las
  // columnas `timestamp` (sin zona, guardadas en UTC) con el timezone de
  // sesión del servidor y las devuelve desplazadas (ver lib/db.ts, mismo fix).
  const sql = postgres(url, { connection: { TimeZone: 'UTC' } })
  console.log('BD destino:', url.replace(/:[^:@]+@/, ':***@'))
  console.log(dryRun ? 'MODO: solo-reporte (dry-run) — cero escrituras' : 'MODO: escritura real')

  if (dryRun) {
    // Segunda capa de seguridad, a nivel de base de datos: toda la sesión
    // queda en solo-lectura. Si por cualquier bug se intentara un INSERT,
    // Postgres lo rechaza él mismo — no depende únicamente de que el código
    // JS respete el flag.
    await sql`SET default_transaction_read_only = on`
  }

  const resultado = await migrarTodo(sql, { dryRun })
  imprimirReporte(resultado)
  await sql.end()
}

const esEjecucionDirecta = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href
if (esEjecucionDirecta) {
  main().catch(e => { console.error(e); process.exit(1) })
}
