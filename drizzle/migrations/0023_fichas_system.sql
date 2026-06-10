-- Migration 0023: Sistema de Fichas
-- Reemplaza contratosProveedor + nivelesEscalamiento con fichas por tienda
-- Las tablas antiguas se mantienen hasta Phase 6 (limpieza)

-- ── 1. Enum estado_ficha ──────────────────────────────────────────────────────
CREATE TYPE estado_ficha AS ENUM ('BORRADOR', 'ACTIVA', 'HISTORICA');

-- ── 2. Tabla fichas ───────────────────────────────────────────────────────────
CREATE TABLE fichas (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo               TEXT UNIQUE NOT NULL,          -- FC-001-T28
  tienda_id            UUID NOT NULL REFERENCES tiendas(id),
  proveedor_id         UUID NOT NULL REFERENCES proveedores(id),
  estado               estado_ficha NOT NULL DEFAULT 'BORRADOR',

  -- Datos del contrato
  codigo_contrato      TEXT,
  plan                 TEXT,
  tipo_servicio        TEXT,
  velocidad_capacidad  TEXT,
  costo_mensual        NUMERIC,
  fecha_inicio         DATE,
  fecha_fin            DATE,
  renovacion_automatica BOOLEAN DEFAULT FALSE,
  penalidad            TEXT,
  sla_comprometido     TEXT,
  tiempo_respuesta_sla INTEGER,
  tiempo_resolucion_sla INTEGER,
  horario_atencion_sla TEXT,       -- ej: "08:00-20:00 LUN-VIE"
  documento_url        TEXT,

  -- Datos de conectividad (migrados desde tiendas)
  tipo_conexion        TEXT,
  cid_servicio         TEXT,
  velocidad            TEXT,
  plan_aplicado        TEXT,
  vigencia_contrato    TEXT,
  estado_servicio      TEXT DEFAULT 'ACTIVO',
  fecha_alta_servicio  DATE,
  descripcion_servicio TEXT,
  observacion          TEXT,

  -- Meta
  creado_por_id        UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  activado_en          TIMESTAMP,
  archivado_en         TIMESTAMP,
  creado_en            TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── 3. Tabla fichas_niveles ───────────────────────────────────────────────────
CREATE TABLE fichas_niveles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id                UUID NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
  nivel                   INTEGER NOT NULL,
  nombre_contacto         TEXT NOT NULL,
  email                   TEXT,
  celular                 TEXT,
  tiempo_resp_sev1        TEXT,
  tiempo_resp_sev2        TEXT,
  tiempo_resp_sev3        TEXT,
  correos_copia           TEXT[],
  whatsapp                TEXT,
  canal                   TEXT DEFAULT 'correo',
  horario_atencion        TEXT,
  tiempo_esperado_solucion INTEGER,
  instruccion             TEXT,
  activo                  BOOLEAN DEFAULT TRUE,
  creado_en               TIMESTAMP DEFAULT NOW()
);

-- ── 4. Columnas nuevas en tablas existentes ───────────────────────────────────

-- tiendas: referencia a la ficha activa
ALTER TABLE tiendas
  ADD COLUMN ficha_activa_id UUID REFERENCES fichas(id) ON DELETE SET NULL;

-- incidentes: ficha vigente al momento del registro
ALTER TABLE incidentes
  ADD COLUMN ficha_id UUID REFERENCES fichas(id) ON DELETE SET NULL;

-- escalamientos: nivel de la ficha (reemplaza nivel_esc_id a futuro)
ALTER TABLE escalamientos
  ADD COLUMN ficha_nivel_id UUID REFERENCES fichas_niveles(id) ON DELETE SET NULL;

-- acciones_gestion: fichas vinculadas al cambio
ALTER TABLE acciones_gestion
  ADD COLUMN ficha_anterior_id UUID REFERENCES fichas(id) ON DELETE SET NULL,
  ADD COLUMN ficha_nueva_id    UUID REFERENCES fichas(id) ON DELETE SET NULL;

-- acciones_gestion_tiendas: fichas por tienda en alcance ZONA
ALTER TABLE acciones_gestion_tiendas
  ADD COLUMN ficha_anterior_id UUID REFERENCES fichas(id) ON DELETE SET NULL,
  ADD COLUMN ficha_nueva_id    UUID REFERENCES fichas(id) ON DELETE SET NULL;

-- ── 5. Índices ────────────────────────────────────────────────────────────────
CREATE INDEX idx_fichas_tienda       ON fichas(tienda_id);
CREATE INDEX idx_fichas_proveedor    ON fichas(proveedor_id);
CREATE INDEX idx_fichas_estado       ON fichas(estado);
CREATE INDEX idx_fichas_niveles_ficha ON fichas_niveles(ficha_id);
CREATE INDEX idx_incidentes_ficha    ON incidentes(ficha_id);
