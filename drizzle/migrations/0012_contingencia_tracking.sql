ALTER TABLE "incidentes"
  ADD COLUMN "cont_es_externo"          boolean DEFAULT false,
  ADD COLUMN "cont_hora_desactivacion"  timestamptz,
  ADD COLUMN "mov_hora_desactivacion"   timestamptz;
