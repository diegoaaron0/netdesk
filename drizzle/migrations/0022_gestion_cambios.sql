-- Migration: Módulo Gestión de Cambios
-- Nuevas enums, tabla principal y tabla de scope multi-tienda

-- Enums
CREATE TYPE tipo_accion AS ENUM (
  'CAMBIO_PROVEEDOR', 'RENEGOCIACION_CONTRATO', 'ACTUALIZACION_PLAN',
  'AUDITORIA_PROVEEDOR', 'ADQUISICION_EQUIPO', 'PLAN_MEJORA'
);

CREATE TYPE estado_accion AS ENUM (
  'BORRADOR', 'PROPUESTO', 'APROBADO', 'EN_EJECUCION',
  'EJECUTADO', 'EN_EVALUACION', 'COMPLETADO', 'RECHAZADO', 'CANCELADO'
);

CREATE TYPE alcance_accion AS ENUM ('TIENDA', 'ZONA');

-- Tabla principal
CREATE TABLE acciones_gestion (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                      TEXT UNIQUE NOT NULL,
  tipo                        tipo_accion NOT NULL,
  estado                      estado_accion NOT NULL DEFAULT 'BORRADOR',
  alcance                     alcance_accion NOT NULL DEFAULT 'TIENDA',

  titulo                      TEXT NOT NULL,
  descripcion                 TEXT,
  motivo                      TEXT NOT NULL,
  zona_descripcion            TEXT,

  -- Scope tienda única
  tienda_id                   UUID REFERENCES tiendas(id),

  -- Proveedores
  proveedor_anterior_id       UUID REFERENCES proveedores(id),
  proveedor_nuevo_id          UUID REFERENCES proveedores(id),

  -- Contrato previo
  contrato_anterior_id        UUID REFERENCES contratos_proveedor(id),

  -- Router vinculado
  router_externo_id           UUID REFERENCES routers_externos(id) ON DELETE SET NULL,

  -- Personas
  creado_por_id               UUID NOT NULL REFERENCES usuarios(id),
  aprobado_por_id             UUID REFERENCES usuarios(id),
  ejecutado_por_id            UUID REFERENCES usuarios(id),

  -- Timestamps
  creado_en                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Planificación
  fecha_ejecucion_planificada DATE,

  -- Aprobación
  aprobado_en                 TIMESTAMPTZ,
  notas_aprobacion            TEXT,
  rechazado_motivo            TEXT,

  -- Ejecución
  ejecutado_en                TIMESTAMPTZ,
  notas_ejecucion             TEXT,

  -- Ventanas de evaluación
  fecha_eval_30               DATE,
  fecha_eval_90               DATE,

  -- Snapshot ANTES
  snap_periodo_dias           INTEGER DEFAULT 90,
  snap_sla_pct                NUMERIC,
  snap_mttr_min               INTEGER,
  snap_iei                    NUMERIC,
  snap_nincidentes            INTEGER,
  snap_detalle                JSONB,

  -- Evaluación 30 días
  eval30_completada           BOOLEAN DEFAULT FALSE,
  eval30_fecha                TIMESTAMPTZ,
  eval30_sla_pct              NUMERIC,
  eval30_mttr_min             INTEGER,
  eval30_iei                  NUMERIC,
  eval30_nincidentes          INTEGER,
  eval30_detalle              JSONB,
  eval30_nota                 TEXT,

  -- Evaluación 90 días
  eval90_completada           BOOLEAN DEFAULT FALSE,
  eval90_fecha                TIMESTAMPTZ,
  eval90_sla_pct              NUMERIC,
  eval90_mttr_min             INTEGER,
  eval90_iei                  NUMERIC,
  eval90_nincidentes          INTEGER,
  eval90_detalle              JSONB,
  eval90_nota                 TEXT,

  -- Penalidad (nota de crédito)
  penalidad_estimada          NUMERIC,

  -- Input tienda (fase futura)
  input_tienda                TEXT
);

-- Tabla de tiendas para alcance ZONA
CREATE TABLE acciones_gestion_tiendas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accion_id             UUID NOT NULL REFERENCES acciones_gestion(id) ON DELETE CASCADE,
  tienda_id             UUID NOT NULL REFERENCES tiendas(id),
  proveedor_anterior_id UUID REFERENCES proveedores(id),
  proveedor_nuevo_id    UUID REFERENCES proveedores(id),
  snap_detalle          JSONB,
  eval30_detalle        JSONB,
  eval90_detalle        JSONB,
  ejecutada             BOOLEAN DEFAULT FALSE,
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_acciones_gestion_estado   ON acciones_gestion(estado);
CREATE INDEX idx_acciones_gestion_tipo     ON acciones_gestion(tipo);
CREATE INDEX idx_acciones_gestion_tienda   ON acciones_gestion(tienda_id);
CREATE INDEX idx_acciones_gestion_creado   ON acciones_gestion(creado_en DESC);
CREATE INDEX idx_ag_tiendas_accion         ON acciones_gestion_tiendas(accion_id);

-- Función para auto-generar código AC-NNN
CREATE OR REPLACE FUNCTION next_accion_codigo() RETURNS TEXT AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO n FROM acciones_gestion;
  RETURN 'AC-' || LPAD(n::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;
