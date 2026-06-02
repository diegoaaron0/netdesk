/**
 * sla-sql.ts — fragmentos SQL derivados de las constantes de sla-core.ts.
 *
 * Usar estos helpers en queries SQL raw para que el CASE de límite MTTR
 * siempre esté sincronizado con los valores de SLA_MTTR_POR_TIPO.
 *
 * Ejemplo de uso en un query Drizzle:
 *   import { slaLimiteCase } from '@/lib/sla-sql'
 *   sql`... WHERE i.mttr_minutos <= ${slaLimiteCase('i.tipo')} ...`
 */
import { sql } from 'drizzle-orm'
import { SLA_MTTR_POR_TIPO, SLA_MTTR_DEFAULT_MIN } from './sla-core'

/**
 * Genera un fragmento SQL `CASE col WHEN ... THEN N ... ELSE N END`
 * con los límites MTTR de cada tipo de incidente.
 *
 * @param col - Nombre de columna o alias a usar en el CASE (ej. 'i.tipo', 'tipo')
 */
export function slaLimiteCase(col = 'i.tipo') {
  const { CAIDA_TOTAL, INTERMITENCIA, LENTITUD, POS, OTROS, CORTE_ELECTRICO } = SLA_MTTR_POR_TIPO
  return sql.raw(
    `CASE ${col}` +
    ` WHEN 'CAIDA_TOTAL' THEN ${CAIDA_TOTAL}` +
    ` WHEN 'INTERMITENCIA' THEN ${INTERMITENCIA}` +
    ` WHEN 'LENTITUD' THEN ${LENTITUD}` +
    ` WHEN 'POS' THEN ${POS}` +
    ` WHEN 'OTROS' THEN ${OTROS}` +
    ` WHEN 'CORTE_ELECTRICO' THEN ${CORTE_ELECTRICO}` +
    ` ELSE ${SLA_MTTR_DEFAULT_MIN} END`
  )
}
