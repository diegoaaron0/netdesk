-- Mitigaciones previas: snapshot de las contingencias (router propio/externo, datos
-- móviles) que estaban activas y se autosellaron al cerrar un incidente. Al reabrir,
-- el slot vivo (cont_* / mov_*) se libera para poder activar una nueva mitigación, y
-- el periodo anterior se conserva aquí para no perder el historial ni los minutos
-- acumulados en las estadísticas de la tienda.
--
-- Forma de cada elemento del array:
-- {
--   "clase":             "ROUTER_PROPIO" | "ROUTER_EXTERNO" | "DATOS_MOVILES",
--   "activadoPor":       "AGENTE" | "TIENDA" | "INFRAESTRUCTURA" | ...,
--   "horaActivacion":    "ISO-8601",
--   "horaDesactivacion": "ISO-8601",
--   "rendimiento":       "EFECTIVO" | "PARCIAL" | "NULO" | null,
--   "observacion":       "..." | null,
--   "cerradoEn":         "ISO-8601"   -- hora_fin del cierre que archivó este periodo
-- }

ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "mitigaciones_previas" jsonb;
