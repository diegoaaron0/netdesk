ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "estado_operacion" text;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "operacion_manual" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "tipo_operacion_manual" text;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "factor_operativo" numeric;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "cont_activado_por" text;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "cont_hora_activacion" timestamp;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "cont_rendimiento" text;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "cont_observacion" text;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "mov_activado_por" text;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "mov_hora_activacion" timestamp;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "mov_rendimiento" text;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "mov_observacion" text;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "desc_energia" boolean;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "desc_router" boolean;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "desc_dns" boolean;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "check_ipconfig" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "check_ping_gw" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "check_ping_internet" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "check_tracert" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "check_dns" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "check_renovar_ip" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "descartes_detallado" text;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "resuelto_por" text;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "atribucion_final" text;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "evaluable_proveedor" boolean DEFAULT true;
