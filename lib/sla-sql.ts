/**
 * sla-sql.ts — fragmentos SQL derivados de las constantes de sla-core.ts.
 *
 * Usar estos helpers en queries SQL raw para que el CASE de umbral MTTR
 * siempre esté sincronizado con los valores de UMBRAL_ALERTA_MTTR.
 *
 * Ejemplo de uso en un query Drizzle:
 *   import { umbralAlertaCase } from '@/lib/sla-sql'
 *   sql`... WHERE i.mttr_minutos <= ${umbralAlertaCase('i.tipo')} ...`
 */
import { sql } from 'drizzle-orm'
import { UMBRAL_ALERTA_MTTR, UMBRAL_ALERTA_MTTR_DEFAULT } from './sla-core'

/**
 * Genera un fragmento SQL `CASE col WHEN ... THEN N ... ELSE N END`
 * con los umbrales MTTR de cada tipo de incidente.
 *
 * @param col - Nombre de columna o alias a usar en el CASE (ej. 'i.tipo', 'tipo')
 */
export function umbralAlertaCase(col = 'i.tipo') {
  const { CAIDA_TOTAL, INTERMITENCIA, LENTITUD, POS, OTROS, CORTE_ELECTRICO } = UMBRAL_ALERTA_MTTR
  return sql.raw(
    `CASE ${col}` +
    ` WHEN 'CAIDA_TOTAL' THEN ${CAIDA_TOTAL}` +
    ` WHEN 'INTERMITENCIA' THEN ${INTERMITENCIA}` +
    ` WHEN 'LENTITUD' THEN ${LENTITUD}` +
    ` WHEN 'POS' THEN ${POS}` +
    ` WHEN 'OTROS' THEN ${OTROS}` +
    ` WHEN 'CORTE_ELECTRICO' THEN ${CORTE_ELECTRICO}` +
    ` ELSE ${UMBRAL_ALERTA_MTTR_DEFAULT} END`
  )
}
