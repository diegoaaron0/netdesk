export interface ProveedorMetricas {
  id: string
  nombre: string
  incidentes: number
  evaluables: number
  dentraSLA: number
  fueraSLA: number
  slaPct: number | null
  mttrMinutos: number | null
  costoTotal: number
  tiendasAfectadas: number
  reincidencia: number
  causaPrincipal: string | null
  estado: 'optimo' | 'en_riesgo' | 'critico' | 'sin_datos'
  score: number
  scoreBreakdown: {
    costo: number
    sla: number
    mttr: number
    reincidencia: number
    incidentes: number
  }
}

export interface TopIncidente {
  codigo: string
  tiendaCodigo: string
  tiendaNombre: string
  provNombre: string
  tipo: string
  mttrMinutos: number | null
  costoEstimado: number
  slaGeneral: boolean | null
  motivoIncumplimiento: string | null
  diaFmt: string
}

export interface TiendaAfectada {
  tiendaCodigo: string
  tiendaNombre: string
  incidentes: number
  proveedores: string[]
  mttrPromedioMin: number | null
  costoTotal: number
  fueraSLA: number
}

export interface ImpactoProveedorResumen {
  totalProveedores: number
  globalMttrMin: number | null
  globalSlaPct: number | null
  totalCosto: number
  proveedorMasIncidentes: string | null
  proveedorMasCostoso: string | null
}

export interface ImpactoProveedorResponse {
  proveedores: ProveedorMetricas[]
  topIncidentes: TopIncidente[]
  tiendasAfectadas: TiendaAfectada[]
  resumen: ImpactoProveedorResumen
  conclusiones: string[]
  proveedoresList: Array<{ id: string; nombre: string }>
}
