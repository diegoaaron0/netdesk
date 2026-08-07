// TOTAL_TIENDAS_ACTIVAS eliminado — usar getTotalTiendas() de lib/tiendas-stats.ts

export const DASHBOARD_CONFIG = {
  // Margen bruto usado en el cálculo del IEI (Impacto Económico del Incidente).
  // Decisión de negocio confirmada: un solo margen fijo para las 156 tiendas,
  // sin diferenciar por formato/categoría. No es un placeholder ni deuda técnica.
  //
  // Fuente única: si el negocio cambia este número en el futuro, basta con
  // editar el valor de abajo — no hay que tocar nada más. Todos los puntos que
  // calculan IEI leen de aquí (ninguno tiene su propio literal duplicado):
  //   - lib/impacto-calc.ts (calcImpactoRow)
  //   - lib/report-sql.ts (ieiPerRow/ieiSum — SQL crudo de los reportes; el
  //     margen se pasa como parámetro con este valor por defecto)
  //   - app/(dashboard)/dashboard/page.tsx (ticker de IEI en vivo + fila de CSV)
  //   - app/(dashboard)/incidentes/[id]/page.tsx (bloque IEI del detalle)
  MARGEN_BRUTO: 0.35,
  HORAS_ATENCION: 12,
  SLA_META_PORCENTAJE: 90,

  FACTOR_IMPACTO: {
    CAIDA_TOTAL:   1.00,
    INTERMITENCIA: 0.50,
    LENTITUD:      0.30,
    POS:           0.40,
    OTROS:         0.60,
  } as Record<string, number>,

  FACTOR_CONTINGENCIA: {
    SIN_CONTINGENCIA: 1.00,
    CON_CONTINGENCIA: 0.25,
  },

  // Factores de boleta manual para el IEI (conectividad, NO corte eléctrico).
  // Representan la venta que se pierde a pesar de operar con boleta manual.
  // En CORTE_ELECTRICO la boleta efectiva cubre el 100% → residual 0.00 (caso especial en impacto-calc).
  BOLETA_RESIDUAL: 0.10,  // boleta EFECTIVA/TOTAL → 10% de venta perdida residual
  BOLETA_PARCIAL:  0.30,  // boleta PARCIAL → 30% de venta perdida

  CLUSTER_FALLBACK_HORA: {
    A: 601, B: 360, C: 262, D: 153,
  } as Record<string, number>,

  CLUSTER_FALLBACK_HORA_FDS: {
    A: 951, B: 562, C: 387, D: 231,
  } as Record<string, number>,

  SCORE_PROVEEDOR_PESOS: {
    costo: 0.35, sla: 0.25, mttr: 0.20,
    reincidencia: 0.10, incidentes: 0.10,
  },

}
