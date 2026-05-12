export type TiendaEstado = 'optima' | 'revisar' | 'critica'

export interface TiendaCritica {
  tiendaId: string
  tiendaCodigo: string
  tiendaNombre: string
  distrito: string | null
  cluster: string | null
  proveedorNombre: string | null
  incidentes: number
  reincidencias: number
  mttrPromedioMin: number | null
  slaPct: number | null
  costoEstimado: number
  tieneContingencia: boolean
  ventaHoraPromedio: number | null
  horasAfectadas: number | null
  score: number
  estado: TiendaEstado
  motivosPrincipales: string[]
}

export interface HistorialIncidente {
  id: string
  codigo: string
  fecha: string
  tipo: string
  provNombre: string
  duracionMin: number | null
  slaGeneral: boolean | null
  costoEstimado: number
  estado: string
}

export interface PatronDetectado {
  tiendaCodigo: string
  patronDetectado: string
  tipoRepetido: string | null
  proveedorRepetido: string | null
  veces: number
  recomendacion: string
}

export interface TiendasCriticasResumen {
  totalCriticas: number
  costoAcumulado: number
  mttrPromedioCriticoMin: number | null
  reincidenciasDetectadas: number
  sinContingencia: number
  proveedorMasAsociado: string | null
}

export interface TiendasCriticasResponse {
  tiendas: TiendaCritica[]
  resumen: TiendasCriticasResumen
  patrones: PatronDetectado[]
  conclusiones: string[]
  proveedoresList: Array<{ id: string; nombre: string }>
}
