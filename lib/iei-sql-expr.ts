import { sql } from 'drizzle-orm'

/**
 * Cluster fallback de venta/hora (S/hora) cuando la tienda no tiene venta_hora_soles.
 * Usa tasas L-J de DASHBOARD_CONFIG.CLUSTER_FALLBACK_HORA.
 * Requiere alias 't' para tiendas.
 */
export const IEI_CLUSTER_FALLBACK = sql.raw(
  `CASE t.cluster WHEN 'A' THEN 601 WHEN 'B' THEN 360 WHEN 'C' THEN 262 WHEN 'D' THEN 153 ELSE 0 END`,
)

/**
 * Factor de mitigación IEI (0.00 – 1.00) por fila de incidente.
 * Espeja exactamente la lógica de impacto-calc.ts:
 *   normContFactor  → router/móvil: efectivo=0.00 | parcial=0.20 | null=0.20 | resto=1.00
 *   normBoletaFactor→ boleta:       efectiva=0.10  | parcial=0.30 | null=0.10 | resto=1.00
 *                                   (CORTE:          efectiva=0.00  | parcial=0.30 | null=0.00)
 *   FACTOR_BASE     → CAIDA_TOTAL=1.00 | INTERMITENCIA=0.50 | LENTITUD=0.30 | resto=1.00
 *
 * Reglas: CORTE_ELECTRICO solo acepta boleta; para los demás tipos se toma
 * LEAST(base, factor_router, factor_movil, factor_boleta) usando 9.99 como
 * centinela para mitigaciones inactivas (LEAST las ignora efectivamente).
 *
 * Requiere aliases: i = incidentes, t = tiendas (t solo para CLUSTER_FALLBACK en el SUM externo).
 */
export const IEI_FACTOR = sql.raw(`
  CASE
    WHEN i.tipo = 'CORTE_ELECTRICO' THEN
      CASE
        WHEN i.boleta_manual = true AND UPPER(i.boleta_rendimiento) = 'PARCIAL'                                       THEN 0.30
        WHEN i.boleta_manual = true AND UPPER(i.boleta_rendimiento) IN ('NULA','FALLIDA','NO_FUNCIONO','INOPERATIVA') THEN 1.00
        WHEN i.boleta_manual = true                                                                                    THEN 0.00
        ELSE 1.00
      END
    ELSE
      LEAST(
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
            WHEN UPPER(i.boleta_rendimiento) = 'PARCIAL'                                THEN 0.30
            ELSE 1.00
          END
        ELSE 9.99 END
      )
  END`.trim(),
)
