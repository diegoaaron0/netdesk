-- Agregar PROPUESTO y RECHAZADO al enum estado_decision
ALTER TYPE "public"."estado_decision" ADD VALUE IF NOT EXISTS 'PROPUESTO';--> statement-breakpoint
ALTER TYPE "public"."estado_decision" ADD VALUE IF NOT EXISTS 'RECHAZADO';--> statement-breakpoint

-- Campos de aprobación (estaban en schema pero faltaban en BD)
ALTER TABLE "decisiones" ADD COLUMN IF NOT EXISTS "aprobado_por_id" uuid REFERENCES "public"."usuarios"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "decisiones" ADD COLUMN IF NOT EXISTS "aprobado_en" timestamp;--> statement-breakpoint
ALTER TABLE "decisiones" ADD COLUMN IF NOT EXISTS "rechazado_motivo" text;--> statement-breakpoint

-- Campos específicos CAMBIO_PROVEEDOR
ALTER TABLE "decisiones" ADD COLUMN IF NOT EXISTS "proveedor_anterior_id" uuid REFERENCES "public"."proveedores"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "decisiones" ADD COLUMN IF NOT EXISTS "snap_detalle" jsonb;--> statement-breakpoint
ALTER TABLE "decisiones" ADD COLUMN IF NOT EXISTS "post_detalle" jsonb;--> statement-breakpoint
