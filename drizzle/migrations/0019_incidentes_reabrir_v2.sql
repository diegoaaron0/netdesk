-- Mejora del flujo de reapertura de incidentes:
-- 1. motivo_reabertura: por qué se reabre (TIENDA_SIN_INTERNET = falla del proveedor, ERROR_AGENTE = cierre accidental)
-- 2. justificacion_reabertura: texto libre del agente explicando la situación
-- 3. tiempo_acumulado_min: MTTR acumulado de aperturas anteriores (no incluye el gap cerrado)
--    Al resolver: mttr_final = (hora_fin - hora_registro) + tiempo_acumulado_min
ALTER TABLE incidentes
  ADD COLUMN IF NOT EXISTS motivo_reabertura         text,
  ADD COLUMN IF NOT EXISTS justificacion_reabertura  text,
  ADD COLUMN IF NOT EXISTS tiempo_acumulado_min      integer;
