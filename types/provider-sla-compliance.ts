export type SLAEstado = 'optimo' | 'revisar' | 'critico'

export interface ProveedorSLAResumen {
  proveedorId: string
  nombre: string
  evaluables: number
  dentraSLA: number
  fueraSLA: number
  slaPct: number | null
  scoreEficiencia: number | null
  tPromRespuestaMin: number | null
  tPromResolucionMin: number | null
  casosEscaladosN2: number
  nivelMasFrecuente: number | null
  estado: SLAEstado
  motivoPrincipal: string | null
}

export interface ProveedorSLATiempos {
  nombre: string
  slaRespuestaObj: number        // siempre 60 min
  tRespuestaRealProm: number | null
  slaResolucionObjProm: number | null
  tResolucionRealProm: number | null
  fueraSLAPorRespuesta: number
  fueraSLAPorResolucion: number
  fueraSLAPorAmbos: number
}

export interface ProveedorSLANiveles {
  nombre: string
  respondioN1: number
  respondioN2: number
  respondioN3: number
  respondioN4: number
  sinRespuesta: number
  nivelMasUsado: number | null
  pctLlegaronN2: number
}

export interface CasoFueraSLA {
  id: string
  codigo: string
  tiendaCodigo: string
  tiendaNombre: string
  provNombre: string
  tipo: string
  nivelQueRespondio: number | null
  tPrimeraRespuestaMin: number | null
  tResolucionMin: number | null
  slaRespuesta: boolean
  slaResolucion: boolean
  slaGeneral: boolean
  motivoIncumplimiento: string
  scoreEficiencia: number | null
}

export interface SLAProveedorResumenGlobal {
  proveedoresEvaluados: number
  slaGeneral: number | null
  fueraSLATotal: number
  tPromRespuestaMin: number | null
  tPromResolucionMin: number | null
  casosEscaladosN2: number
}

export interface SLAProveedorResponse {
  proveedores: ProveedorSLAResumen[]
  tiempos: ProveedorSLATiempos[]
  niveles: ProveedorSLANiveles[]
  casosFueraSLA: CasoFueraSLA[]
  resumenGlobal: SLAProveedorResumenGlobal
  conclusiones: string[]
  proveedoresList: Array<{ id: string; nombre: string }>
}
