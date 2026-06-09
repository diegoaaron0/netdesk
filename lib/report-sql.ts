import { UMBRAL_ALERTA_MTTR, UMBRAL_ALERTA_MTTR_DEFAULT } from './sla-core'

/**
 * Helpers de SQL como strings planos para rutas de exportación.
 * Se inyectan con sql.raw() en el punto de uso — nunca como objetos Drizzle anidados.
 */

export function umbralAlertaCase(col = 'i.tipo'): string {
  const t = UMBRAL_ALERTA_MTTR
  return (
    `CASE ${col}` +
    ` WHEN 'CAIDA_TOTAL' THEN ${t.CAIDA_TOTAL}` +
    ` WHEN 'INTERMITENCIA' THEN ${t.INTERMITENCIA}` +
    ` WHEN 'LENTITUD' THEN ${t.LENTITUD}` +
    ` WHEN 'POS' THEN ${t.POS}` +
    ` WHEN 'OTROS' THEN ${t.OTROS}` +
    ` WHEN 'CORTE_ELECTRICO' THEN ${t.CORTE_ELECTRICO}` +
    ` ELSE ${UMBRAL_ALERTA_MTTR_DEFAULT} END`
  )
}

export function clusterFallback(): string {
  return `CASE t.cluster WHEN 'A' THEN 601 WHEN 'B' THEN 360 WHEN 'C' THEN 262 WHEN 'D' THEN 153 ELSE 0 END`
}

export function ieiFactor(): string {
  return `CASE
    WHEN i.tipo = 'CORTE_ELECTRICO' THEN
      CASE
        WHEN i.boleta_manual = true AND UPPER(i.boleta_rendimiento) = 'PARCIAL'                                        THEN 0.30
        WHEN i.boleta_manual = true AND UPPER(i.boleta_rendimiento) IN ('NULA','FALLIDA','NO_FUNCIONO','INOPERATIVA')  THEN 1.00
        WHEN i.boleta_manual = true                                                                                     THEN 0.00
        ELSE 1.00
      END
    ELSE LEAST(
      CASE i.tipo WHEN 'CAIDA_TOTAL' THEN 1.00 WHEN 'INTERMITENCIA' THEN 0.50 WHEN 'LENTITUD' THEN 0.30 ELSE 1.00 END,
      CASE WHEN i.cont_activado_por IS NOT NULL THEN
        CASE
          WHEN i.cont_rendimiento IS NULL                                               THEN 0.20
          WHEN UPPER(i.cont_rendimiento) IN ('EFECTIVO','TOTAL','EFECTIVA')            THEN 0.00
          WHEN UPPER(i.cont_rendimiento) IN ('PARCIAL','LIMITADA')                    THEN 0.20
          ELSE 1.00
        END
      ELSE 9.99 END,
      CASE WHEN i.mov_activado_por IS NOT NULL THEN
        CASE
          WHEN i.mov_rendimiento IS NULL                                                THEN 0.20
          WHEN UPPER(i.mov_rendimiento) IN ('EFECTIVO','TOTAL','EFECTIVA')             THEN 0.00
          WHEN UPPER(i.mov_rendimiento) IN ('PARCIAL','LIMITADA')                     THEN 0.20
          ELSE 1.00
        END
      ELSE 9.99 END,
      CASE WHEN i.boleta_manual = true THEN
        CASE
          WHEN i.boleta_rendimiento IS NULL                                             THEN 0.10
          WHEN UPPER(i.boleta_rendimiento) IN ('EFECTIVA','TOTAL')                    THEN 0.10
          WHEN UPPER(i.boleta_rendimiento) = 'PARCIAL'                               THEN 0.30
          ELSE 1.00
        END
      ELSE 9.99 END
    )
  END`
}

/** IEI por fila (sin SUM/ROUND) — para CTEs con iei_row */
export function ieiPerRow(): string {
  return (
    `COALESCE(t.venta_hora_soles, ${clusterFallback()})` +
    ` * (COALESCE(i.mttr_minutos, 0)::numeric / 60)` +
    ` * 0.35` +
    ` * (${ieiFactor()})`
  )
}

/** IEI agregado: ROUND(SUM(...))::int — para queries con GROUP BY */
export function ieiSum(): string {
  return `ROUND(SUM(${ieiPerRow()}))::int`
}

/** Extrae el mensaje de error real de PostgreSQL desde un error de Drizzle */
export function pgErrMsg(err: unknown): string {
  const e = err as any
  return (e?.cause as any)?.message ?? e?.message ?? String(err)
}
