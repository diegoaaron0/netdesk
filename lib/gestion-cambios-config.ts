// Fuente única de verdad para los tipos de acción de Gestión de Cambios —
// antes duplicado en 6 archivos (2 rutas API + 3 páginas del frontend).
// Los valores deben coincidir exactamente con tipoAccionEnum en drizzle/schema.ts.

export const TIPO_LABELS: Record<string, string> = {
  RENOVACION_CONTRATO: 'Renovación de Contrato',
  CAMBIO_CONTRATO:     'Cambio de Contrato',
  BAJA_CONTRATO:       'Dar de Baja',
  AUDITORIA_PROVEEDOR: 'Auditoría de proveedor',
  ADQUISICION_EQUIPO:  'Adquisición / baja de equipo',
  PLAN_MEJORA:         'Plan de mejora',
}

// Tipos que generan/activan una ficha en el flujo (la ficha es obligatoria al
// proponer y se activa al ejecutar). BAJA_CONTRATO queda fuera a propósito:
// no activa una ficha nueva, archiva la actual (ver ejecutar/route.ts).
export const TIPOS_CON_FICHA = ['RENOVACION_CONTRATO', 'CAMBIO_CONTRATO']

// Tipos que requieren indicar proveedor anterior y nuevo en el formulario.
// BAJA_CONTRATO queda fuera a propósito: no pide proveedor nuevo (no hay a
// dónde ir), el proveedor anterior se toma del proveedor actual de la tienda
// al ejecutar, no se pide en el formulario.
export const TIPOS_CON_PROVEEDOR = new Set(['RENOVACION_CONTRATO', 'CAMBIO_CONTRATO', 'AUDITORIA_PROVEEDOR'])
