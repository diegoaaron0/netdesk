ALTER TYPE "public"."rol" ADD VALUE 'INFRAESTRUCTURA';--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "password" text DEFAULT 'soporte123';--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN IF NOT EXISTS "reabrierta_info" text;