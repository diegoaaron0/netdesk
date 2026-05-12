export type SLATendenciaEstado = 'optimo' | 'revisar' | 'critico'
export type EstadoTendencia = 'Estable / Positiva' | 'En mejora' | 'Empeorando' | 'Crítico sostenido' | 'Revisar'

export interface PuntoTendencia {
  mesKey: string        // "2024-12"
  mesLabel: string      // "Dic 2024"
  proveedor: string
  evaluables: number
  dentraSLA: number
  fueraSLA: number
  slaPct: number | null
  variacionPP: number | null
  tPromRespuestaMin: number | null
  tPromResolucionMin: number | null
  escaladosN2: number
  estado: SLATendenciaEstado
}

export interface ChartMes {
  mesKey: string
  mesLabel: string
  [key: string]: number | string | null
}

export interface ResumenProveedor {
  proveedor: string
  slaPromedio: number | null
  mejorMes: string | null
  mejorMesSLA: number | null
  peorMes: string | null
  peorMesSLA: number | null
  variacionTotal: number | null
  mesesBajoMeta: number
  estadoTendencia: EstadoTendencia
}

export interface MesCritico {
  mesKey: string
  mesLabel: string
  proveedor: string
  slaPct: number | null
  fueraSLA: number
  variacionPP: number | null
  causaPrincipal: string
  recomendacion: string
}

export interface SLATrendResumenGlobal {
  mejorProveedor: string | null
  mejorProveedorPP: number | null
  peorProveedor: string | null
  peorProveedorPP: number | null
  slaPromedioGlobal: number | null
  mesMasCriticoLabel: string | null
  mesMasCriticoSLA: number | null
  mayorCaidaProveedor: string | null
  mayorCaidaMesLabel: string | null
  mayorCaidaPP: number | null
  proveedoresBajoMeta: number
  totalProveedores: number
}

export interface SLATrendResponse {
  puntos: PuntoTendencia[]
  chartData: ChartMes[]
  resumenProveedores: ResumenProveedor[]
  mesCriticos: MesCritico[]
  resumenGlobal: SLATrendResumenGlobal
  conclusiones: string[]
  proveedoresList: Array<{ id: string; nombre: string }>
  proveedoresEnGrafico: string[]
}
