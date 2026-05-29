CREATE TABLE "contingencias" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tienda_id"           uuid NOT NULL REFERENCES tiendas(id),
  "tipo"                text NOT NULL,
  "activado_por"        text NOT NULL,
  "usuario_id"          uuid REFERENCES usuarios(id),
  "hora_activacion"     timestamptz NOT NULL DEFAULT now(),
  "hora_desactivacion"  timestamptz,
  "justificacion"       text NOT NULL,
  "creado_en"           timestamptz NOT NULL DEFAULT now()
);
