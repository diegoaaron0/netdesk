export const DASHBOARD_CONFIG = {
  MARGEN_BRUTO: 0.35,
  HORAS_ATENCION: 12,
  SLA_META_PORCENTAJE: 90,
  TOTAL_TIENDAS_ACTIVAS: 156,

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

  CLUSTER_FALLBACK_HORA: {
    A: 931, B: 521, C: 348, D: 197,
  } as Record<string, number>,

  SCORE_PROVEEDOR_PESOS: {
    costo: 0.35, sla: 0.25, mttr: 0.20,
    reincidencia: 0.10, incidentes: 0.10,
  },

}
