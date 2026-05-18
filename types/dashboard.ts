export interface IncidenteListItem {
  id: string
  codigo: string
  tiendaCodigo: string
  tiendaNombre: string
  proveedor: string
  tipo: string
  estado: string
  fecha: string
  horaInicio: string
  horaFin: string | null
  tiendaIncCount: number
}

export interface TiendaDetalle {
  id: string
  codigo: string
  nombre: string
  proveedor: string
  distrito: string | null
  incidentesCount: number
  ultimoIncidente: string
  estadoReciente: string
}

export interface MttrProveedor {
  nombre: string
  mttrMinutos: number
  incidentesResueltos: number
  mejorTiempo: number | null
  peorTiempo: number | null
  mttrPrevMinutos: number | null
  tiendas: Array<{ codigo: string; mttrMinutos: number; incidentes: number; mejorTiempo: number | null; peorTiempo: number | null }>
}

export interface SlaProveedor {
  nombre: string
  slaPct: number
  excessoRespuestaMin: number
  excessoResolucionMin: number
  tiendas: Array<{ codigo: string; slaPct: number }>
}

export interface SlaEvaluableItem {
  codigo: string
  tiendaCodigo: string
  proveedor: string
  tipo: string
  fecha: string
  cumplido: boolean
}

export interface CostoTienda {
  codigo: string
  proveedor: string
  horas: number
  costo: number
  ventaAfectada: number
  factor: number
  motivo: string
}

export interface ReincidenciaTienda {
  id: string
  codigo: string
  proveedor: string
  caidas: number
  razon: string
  incidenteCodigos: string[]
  tipoRepetido: string
  costoEstimado: number
  tieneContingencia: boolean
  diasEntreCaidas: number | null
  tendencia: 'EMPEORA' | 'ESTABLE' | 'NUEVO'
}

export interface DayCount {
  dia: string
  total: number
}

export interface DayMttr {
  dia: string
  mttrMinutos: number | null
}

export interface IncidentesCard {
  total: number
  deltaVsAnterior: number | null
  lista: IncidenteListItem[]
  byDay: DayCount[]
}

export interface TiendasAfectadasCard {
  total: number
  porcentajeRed: number
  deltaVsAnterior: number | null
  lista: TiendaDetalle[]
}

export interface MttrPromedioCard {
  minutos: number | null
  deltaMinutos: number | null
  porProveedor: MttrProveedor[]
  byDay: DayMttr[]
}

export interface CumplimientoSLACard {
  porcentaje: number
  deltaVsAnterior: number | null
  porProveedor: SlaProveedor[]
  evaluables: SlaEvaluableItem[]
}

export interface CostoEstimadoCard {
  total: number
  ventaAfectadaTotal: number
  deltaVsAnterior: number | null
  proveedorMayorImpacto: { nombre: string; costo: number } | null
  tiendaMayorImpacto: { codigo: string; costo: number } | null
  top5Tiendas: CostoTienda[]
}

export interface ReincidenciaCriticaCard {
  total: number
  tiendas: ReincidenciaTienda[]
}

export interface ProveedorCriticoCard {
  nombre: string
  score: number
  metricas: {
    slaPct: number
    mttrMinutos: number
    costoEstimado: number
    reincidenciaTiendas: number
    incidentes: number
  }
  scoreBreakdown: {
    costo: number
    sla: number
    mttr: number
    reincidencia: number
    incidentes: number
  }
}

export interface DashboardAnaliticoResponse {
  periodo: { desde: string; hasta: string }
  proveedores: Array<{ id: string; nombre: string }>
  cards: {
    incidentes: IncidentesCard
    tiendasAfectadas: TiendasAfectadasCard
    mttrPromedio: MttrPromedioCard
    cumplimientoSLA: CumplimientoSLACard
    costoEstimado: CostoEstimadoCard
    reincidenciaCritica: ReincidenciaCriticaCard
    proveedorCritico: ProveedorCriticoCard | null
  }
}
