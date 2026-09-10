import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { getTramosPorIncidentes, calcIeiIncidente, type IncidenteMitigacionInput } from '@/lib/mitigacion-tramos'

/** Traduce los parámetros ?desde=&hasta= (YYYY-MM-DD, hora Lima) al rango ISO
 *  que consumen las queries. Sin parámetros: los últimos 30 días, que es lo que
 *  la columna fija de incidentes mostraba antes de ser filtrable.
 *  El sufijo -05:00 es obligatorio: `T00:00:00` a secas se parsea como UTC y
 *  corre el rango 5 horas — ver CLAUDE.md. */
export function rangoIsoDeParams(
  desdeParam: string | null,
  hastaParam: string | null,
  ahoraMs: number = Date.now(),
): { desdeIso: string; hastaIso: string } {
  return {
    hastaIso: hastaParam
      ? new Date(hastaParam + 'T23:59:59-05:00').toISOString()
      : new Date(ahoraMs).toISOString(),
    desdeIso: desdeParam
      ? new Date(desdeParam + 'T00:00:00-05:00').toISOString()
      : new Date(ahoraMs - 30 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

/** IEI y cantidad de incidentes por tienda para un período, en dos consultas
 *  para TODAS las tiendas (no una por tienda): una trae los incidentes del
 *  rango y otra sus tramos en bloque. El cálculo por incidente es el mismo
 *  calcIeiIncidente que usa la ficha, con el mismo alcance (todo salvo
 *  CANCELADO) y pasando cluster, para que el total de la lista, el del CSV y
 *  el de la ficha no puedan diferir para el mismo período. */
export async function ieiPorTiendaEnPeriodo(desdeIso: string, hastaIso: string) {
  const filas = await db.execute(sql`
    SELECT
      i.id, i.tienda_id, i.tipo, i.estado, i.hora_registro, i.hora_fin,
      i.iei_acumulado,
      i.cont_activado_por, i.cont_hora_activacion, i.cont_hora_desactivacion,
      i.cont_rendimiento, i.cont_es_externo,
      i.mov_activado_por, i.mov_hora_activacion, i.mov_hora_desactivacion, i.mov_rendimiento,
      i.boleta_manual, i.boleta_rendimiento, i.boleta_hora_activacion,
      i.mitigaciones_previas,
      t.venta_hora_soles, t.venta_hora_fds_soles, t.cluster
    FROM incidentes i
    JOIN tiendas t ON i.tienda_id = t.id
    WHERE i.estado != 'CANCELADO'
      AND i.hora_registro >= ${desdeIso}::timestamptz
      AND i.hora_registro <  ${hastaIso}::timestamptz
  `) as any[]

  const tramosPorIncidente = await getTramosPorIncidentes(filas.map(f => f.id))

  const acumulado = new Map<string, { iei: number; incidentes: number }>()
  for (const f of filas) {
    const entrada = acumulado.get(f.tienda_id) ?? { iei: 0, incidentes: 0 }
    const incidenteMitigacion: IncidenteMitigacionInput = {
      tipo: f.tipo, estado: f.estado, horaRegistro: f.hora_registro, horaFin: f.hora_fin,
      ieiAcumulado: f.iei_acumulado,
      contActivadoPor: f.cont_activado_por, contHoraActivacion: f.cont_hora_activacion,
      contHoraDesactivacion: f.cont_hora_desactivacion, contRendimiento: f.cont_rendimiento,
      contEsExterno: f.cont_es_externo,
      movActivadoPor: f.mov_activado_por, movHoraActivacion: f.mov_hora_activacion,
      movHoraDesactivacion: f.mov_hora_desactivacion, movRendimiento: f.mov_rendimiento,
      boletaManual: f.boleta_manual, boletaRendimiento: f.boleta_rendimiento,
      boletaHoraActivacion: f.boleta_hora_activacion,
      mitigacionesPrevias: f.mitigaciones_previas,
    }
    const { iei } = calcIeiIncidente(incidenteMitigacion, tramosPorIncidente.get(f.id) ?? [], {
      ventaHoraSoles: f.venta_hora_soles, ventaHoraFdsSoles: f.venta_hora_fds_soles, cluster: f.cluster,
    })
    entrada.iei += iei
    entrada.incidentes += 1
    acumulado.set(f.tienda_id, entrada)
  }
  return acumulado
}

/** Sin venta configurada y sin cluster no hay con qué calcular el IEI: se
 *  devuelve null, no 0, para poder distinguir "no se puede calcular" de
 *  "no costó nada". */
export function puedeCalcularIei(t: { ventaHoraSoles?: unknown; ventaHoraFdsSoles?: unknown; cluster?: unknown }): boolean {
  return !!(t.ventaHoraSoles || t.ventaHoraFdsSoles || t.cluster)
}
