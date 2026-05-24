-- Tabla: cortes_electricos
-- Registra cortes de energía eléctrica por tienda sin afectar métricas de SLA de proveedores de red

CREATE TYPE alcance_corte AS ENUM ('SOLO_TIENDA', 'MALL', 'CUADRA_CALLE', 'ZONA_AMPLIA');

CREATE TABLE cortes_electricos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id         uuid NOT NULL REFERENCES tiendas(id),
  registrado_por_id uuid NOT NULL REFERENCES usuarios(id),
  hora_inicio       timestamp NOT NULL,
  hora_fin          timestamp,
  duracion_minutos  integer GENERATED ALWAYS AS (
    CASE WHEN hora_fin IS NOT NULL
      THEN EXTRACT(EPOCH FROM (hora_fin - hora_inicio))::integer / 60
      ELSE NULL
    END
  ) STORED,
  alcance           alcance_corte NOT NULL DEFAULT 'SOLO_TIENDA',
  tuvo_ups          boolean NOT NULL DEFAULT false,
  afecto_red        boolean NOT NULL DEFAULT false,
  observaciones     text,
  creado_en         timestamp NOT NULL DEFAULT now()
);

CREATE INDEX idx_cortes_tienda    ON cortes_electricos(tienda_id);
CREATE INDEX idx_cortes_inicio    ON cortes_electricos(hora_inicio DESC);
CREATE INDEX idx_cortes_creado_en ON cortes_electricos(creado_en DESC);
