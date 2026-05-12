export type InsightPrioridad = 'alta' | 'media' | 'baja'
export type InsightTipo = 'alerta' | 'accion' | 'logro'
export type InsightCategoria =
  | 'proveedor_critico'
  | 'incumplimiento_sostenido'
  | 'tienda_sin_contingencia'
  | 'tipo_dominante'
  | 'zona_critica'
  | 'otros_repetido'
  | 'mejora_positiva'

export type KpiOrigen = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

export interface EvidenciaSummary {
  entidad: string
  metrica: string
  valor: string
}

export interface Insight {
  id: string
  categoria: InsightCategoria
  tipo: InsightTipo
  prioridad: InsightPrioridad
  titulo: string
  descripcion: string
  accionSugerida: string
  kpisOrigen: KpiOrigen[]
  score: number
  entidad: string
  entidadTipo: 'proveedor' | 'tienda' | 'zona' | 'tipo' | 'global'
  evidencia: EvidenciaSummary[]
  metaDatos: Record<string, string | number | null>
}

export interface InsightsResumenGlobal {
  totalInsights: number
  alertasAltas: number
  accionesPendientes: number
  logros: number
  entidadMasCritica: string
  entidadMasCriticaTipo: string
  slaPromedioGlobal: number | null
  impactoEstimadoTotal: number
}

export interface EvidenciaIncidente {
  id: string
  codigo: string
  tipo: string
  proveedor: string
  tienda: string
  distrito: string
  horaRegistro: string
  horaFin: string | null
  estado: string
  slaCumplido: boolean | null
  mttrMin: number | null
  impactoEstimado: number | null
  otrosClasificacion: string | null
}

export interface InsightsResponse {
  insights: Insight[]
  resumenGlobal: InsightsResumenGlobal
  conclusiones: string[]
  proveedoresList: { id: string; nombre: string }[]
}
