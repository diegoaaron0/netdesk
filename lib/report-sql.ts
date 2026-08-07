export function clusterFallback(): string {
  return `CASE t.cluster WHEN 'A' THEN 601 WHEN 'B' THEN 360 WHEN 'C' THEN 262 WHEN 'D' THEN 153 ELSE 0 END`
}

/** Fallback de venta/hora FDS por cluster (DASHBOARD_CONFIG.CLUSTER_FALLBACK_HORA_FDS). */
export function clusterFallbackFds(): string {
  return `CASE t.cluster WHEN 'A' THEN 951 WHEN 'B' THEN 562 WHEN 'C' THEN 387 WHEN 'D' THEN 231 ELSE 0 END`
}

/** Venta/hora del incidente según el día (Lima) en que inició: FDS (dom/vie/sáb) o L-J.
 *  Espeja resolveVentaHora de impacto-calc para que reportes, dashboard y detalle
 *  usen la misma tarifa. Requiere aliases i = incidentes, t = tiendas. */
export function ventaHoraDia(): string {
  return `CASE
    WHEN EXTRACT(DOW FROM i.hora_registro AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima') IN (0,5,6)
      THEN COALESCE(t.venta_hora_fds_soles, t.venta_hora_soles, ${clusterFallbackFds()})
      ELSE COALESCE(t.venta_hora_soles, t.venta_hora_fds_soles, ${clusterFallback()})
  END`
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
          WHEN i.cont_rendimiento IS NULL             THEN 0.20
          WHEN UPPER(i.cont_rendimiento) = 'EFECTIVO' THEN 0.00
          WHEN UPPER(i.cont_rendimiento) = 'PARCIAL'  THEN 0.20
          ELSE 1.00
        END
      ELSE 9.99 END,
      CASE WHEN i.mov_activado_por IS NOT NULL THEN
        CASE
          WHEN i.mov_rendimiento IS NULL             THEN 0.20
          WHEN UPPER(i.mov_rendimiento) = 'EFECTIVO' THEN 0.00
          WHEN UPPER(i.mov_rendimiento) = 'PARCIAL'  THEN 0.20
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
    `(${ventaHoraDia()})` +
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
