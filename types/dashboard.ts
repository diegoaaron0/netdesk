export interface IncidenteListItem {
  codigo: string
  proveedor: string
  tipo: string
  estado: string
}

export interface TiendaChip {
  id: string
  codigo: string
}

export interface MttrProveedor {
  nombre: string
  mttrMinutos: number
}

export interface SlaProveedor {
  nombre: string
  slaPct: number
  excessoPromMin: number
}

export interface CostoTienda {
  codigo: string
  proveedor: string
  horas: number
  costo: number
}

export interface ReincidenciaTienda {
  id: string
  codigo: string
  proveedor: string
  caidas: number
  razon: string
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
  lista: TiendaChip[]
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
