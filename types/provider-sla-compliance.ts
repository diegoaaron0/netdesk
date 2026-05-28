export type SLAEstado = 'optimo' | 'revisar' | 'critico'

export interface ProveedorSLAResumen {
  proveedorId: string
  nombre: string
  evaluables: number
  dentraSLA: number
  fueraSLA: number
  slaPct: number | null             // slaGeneral (ambos)
  slaRespuestaPct: number | null    // solo respuesta
  slaResolucionPct: number | null   // solo resolución
  scoreEficiencia: number | null
  tPromRespuestaMin: number | null
  tPromResolucionMin: number | null
  tasaEscalamientoN2Pct: number | null  // % incidentes que llegaron a N2+
  cumplimientoETAPct: number | null     // % que cumplió su propio ETA prometido
  estado: SLAEstado
  motivoPrincipal: string | null
}

export interface ProveedorSLATiempos {
  nombre: string
  slaRespuestaObj: number
  tRespuestaRealProm: number | null
  slaResolucionObj: number | null
  tResolucionRealProm: number | null
  fueraSLAPorRespuesta: number
  fueraSLAPorResolucion: number
  fueraSLAPorAmbos: number
}

export interface DistribucionNiveles {
  n1Solo: number        // max_nivel = 1
  escN2: number         // max_nivel = 2
  escN3mas: number      // max_nivel >= 3
  sinRespuesta: number  // evaluable pero nunca respondió
  pctN1Solo: number | null
  pctEscN2: number | null
  pctEscN3mas: number | null
}

export interface ProveedorSLANiveles {
  nombre: string
  respondioN1: number
  respondioN2: number
  respondioN3: number
  respondioN4: number
  sinRespuesta: number
  distribucion: DistribucionNiveles
  pctLlegaronN2: number   // % con max_nivel >= 2 (backward compat)
}

export interface CasoFueraSLA {
  id: string
  codigo: string
  tiendaCodigo: string
  tiendaNombre: string
  provNombre: string
  tipo: string
  nivelFinal: number | null
  nivelQueRespondio: number | null
  tPrimeraRespuestaMin: number | null
  tResolucionMin: number | null
  slaRespuesta: boolean
  slaResolucion: boolean
  slaGeneral: boolean
  cumplioETA: boolean | null
  motivoIncumplimiento: string
  scoreEficiencia: number | null
}

export interface SLAProveedorResumenGlobal {
  proveedoresEvaluados: number
  slaGeneral: number | null
  slaRespuestaPct: number | null
  slaResolucionPct: number | null
  fueraSLATotal: number
  tPromRespuestaMin: number | null
  tPromResolucionMin: number | null
  casosEscaladosN2: number
  cumplimientoETAPct: number | null
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
