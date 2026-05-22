CREATE INDEX IF NOT EXISTS idx_incidentes_hora_registro ON "incidentes"("hora_registro" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_incidentes_tienda_hora ON "incidentes"("tienda_id", "hora_registro" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_incidentes_proveedor_hora ON "incidentes"("proveedor_id", "hora_registro" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_incidentes_estado ON "incidentes"("estado") WHERE estado NOT IN ('RESUELTO','CANCELADO','CERRADO');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_escalamientos_incidente_nivel ON "escalamientos"("incidente_id", "nivel");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contratos_proveedor_tienda ON "contratos_proveedor"("proveedor_id", "tienda_id", "estado");
