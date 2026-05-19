export type ZonaEstado = 'optima' | 'revisar' | 'critica'

export interface ZonaResumen {
  zona: string
  incidentes: number
  pctDelTotal: number
  tiendasAfectadas: number
  mttrPromMin: number | null
  slaPct: number | null
  impactoEstimado: number
  proveedorDominante: string | null
  estado: ZonaEstado
}

export interface DistritoDetalle {
  distrito: string
  zona: string
  incidentes: number
  tiendasAfectadas: number
  proveedorDominante: string | null
  mttrPromMin: number | null
  slaPct: number | null
  impactoEstimado: number
  estado: ZonaEstado
}

export interface TiendaZonaDetalle {
  tiendaId: string
  tiendaCodigo: string
  tiendaNombre: string
  distrito: string
  proveedorNombre: string | null
  incidentes: number
  mttrPromMin: number | null
  slaPct: number | null
  impactoEstimado: number
  tieneContingencia: boolean
  estado: ZonaEstado
  coordenadas: string | null
}

export interface PatronGeografico {
  zona: string
  patronDetectado: string
  proveedorAsociado: string | null
  distritosRepetidos: string[]
  causaProbable: string
  recomendacion: string
}

export interface GeographicResumenGlobal {
  zonaMasAfectada: string | null
  impactoTotal: number
  tiendasAfectadas: number
  peorSLAZona: string | null
  peorSLAPct: number | null
  mayorMTTRZona: string | null
  mayorMTTRMin: number | null
  proveedorDominante: string | null
}

export interface TiendaMapPoint {
  tiendaId: string
  codigo: string
  nombreCc: string | null
  distrito: string | null
  proveedor: string | null
  coordenadas: string | null
  slaPct: number | null
  mttrMin: number | null
  impacto: number
}

export interface GeographicImpactResponse {
  zonas: ZonaResumen[]
  distritos: DistritoDetalle[]
  patrones: PatronGeografico[]
  resumenGlobal: GeographicResumenGlobal
  conclusiones: string[]
  proveedoresList: Array<{ id: string; nombre: string }>
  tiendas: TiendaMapPoint[]
}
