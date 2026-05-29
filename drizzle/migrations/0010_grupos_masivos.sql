-- Migración 0010: incidentes masivos — grupo de incidentes relacionados
CREATE TABLE "grupos_masivos" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "codigo"       text UNIQUE NOT NULL,
  "razon"        text NOT NULL,
  "motivo"       text,
  "creado_por_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
  "creado_en"    timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN "grupo_masivo_id" uuid REFERENCES "grupos_masivos"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "idx_incidentes_grupo_masivo" ON "incidentes"("grupo_masivo_id");
