ALTER TABLE "incidentes"
  ADD COLUMN "escalado_infra_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
  ADD COLUMN "hora_escalado_infra" timestamptz,
  ADD COLUMN "nota_escalado_infra" text;
