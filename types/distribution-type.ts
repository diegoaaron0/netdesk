export type TipoVisible = 'CAIDA_TOTAL' | 'INTERMITENCIA' | 'LENTITUD' | 'OTROS'

export const TIPO_LABELS: Record<TipoVisible, string> = {
  CAIDA_TOTAL:   'Caída total',
  INTERMITENCIA: 'Intermitencia',
  LENTITUD:      'Lentitud',
  OTROS:         'Otros',
}

export const TIPO_COLORS: Record<TipoVisible, string> = {
  CAIDA_TOTAL:   '#E53E3E',
  INTERMITENCIA: '#ED8936',
  LENTITUD:      '#D69E2E',
  OTROS:         '#805AD5',
}

export interface TipoResumen {
  tipo: TipoVisible
  label: string
  color: string
  cantidad: number
  pct: number
  tiendasAfectadas: number
  proveedorMasAsociado: string | null
  totalProveedores: number
  mttrPromedioMin: number | null
  slaPct: number | null
  impactoEstimado: number
  estado: 'optimo' | 'en_riesgo' | 'critico' | 'sin_datos'
  causaMasFrecuente: string | null
}

export interface OtroDesglose {
  causaClasificada: string
  cantidad: number
  pctDeOtros: number
  tiendasAfectadas: number
  proveedorMasAsociado: string | null
  mttrPromedioMin: number | null
  slaPct: number | null
  impactoEstimado: number
  estado: 'optimo' | 'en_riesgo' | 'critico' | 'sin_datos'
}

export interface IncidenteDetalle {
  id: string
  codigo: string
  fecha: string
  tiendaCodigo: string
  tiendaNombre: string
  provNombre: string
  tipo: string
  tipoVisible: TipoVisible
  duracionMin: number | null
  slaGeneral: boolean | null
  impactoEstimado: number
  estado: string
  causaTexto: string | null
  causaClasificada: string | null
}

export interface PatronTipo {
  tipo: TipoVisible
  label: string
  patronDetectado: string
  proveedorAsociado: string | null
  tiendasRepetidas: number
  causaProbable: string
  recomendacion: string
}

export interface DistribucionTipoResponse {
  tiposResumen: TipoResumen[]
  otrosDesglose: OtroDesglose[]
  incidentes: IncidenteDetalle[]
  patrones: PatronTipo[]
  conclusiones: string[]
  total: number
  proveedoresList: Array<{ id: string; nombre: string }>
}
