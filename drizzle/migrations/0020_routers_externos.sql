-- Módulo Routers Contingencia TI
-- Gestión de equipos de router externo desplegados en tiendas

CREATE TABLE routers_externos (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           TEXT        UNIQUE NOT NULL,
  ip               TEXT,
  password         TEXT,
  chip             TEXT,
  plan             TEXT,
  tipo_conexion    TEXT,
  estado           TEXT        NOT NULL DEFAULT 'DISPONIBLE',
  tienda_actual_id UUID        REFERENCES tiendas(id) ON DELETE SET NULL,
  activo           BOOLEAN     NOT NULL DEFAULT TRUE,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE router_historial (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id         UUID        NOT NULL REFERENCES routers_externos(id) ON DELETE CASCADE,
  tienda_id         UUID        NOT NULL REFERENCES tiendas(id),
  incidente_id      UUID        REFERENCES incidentes(id) ON DELETE SET NULL,
  fecha_ingreso     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_retorno     TIMESTAMPTZ,
  tiempo_uso_min    INTEGER,
  accion            TEXT        NOT NULL,
  nota              TEXT,
  registrado_por_id UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE router_fotos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id     UUID        NOT NULL REFERENCES routers_externos(id) ON DELETE CASCADE,
  url           TEXT        NOT NULL,
  descripcion   TEXT,
  tamano_bytes  INTEGER,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE incidentes
  ADD COLUMN IF NOT EXISTS router_externo_id UUID REFERENCES routers_externos(id) ON DELETE SET NULL;

-- Seed: dos routers disponibles para comenzar
INSERT INTO routers_externos (codigo, estado)
VALUES ('RE-001', 'DISPONIBLE'), ('RE-002', 'DISPONIBLE');
