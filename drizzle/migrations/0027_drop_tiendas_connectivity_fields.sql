-- Migración 0027: eliminar campos de conectividad de tiendas
-- Estos campos ahora viven exclusivamente en fichas (ficha activa via tiendas.ficha_activa_id)
ALTER TABLE tiendas DROP COLUMN IF EXISTS tipo_conexion;
ALTER TABLE tiendas DROP COLUMN IF EXISTS tipo_servicio;
ALTER TABLE tiendas DROP COLUMN IF EXISTS cid_servicio;
ALTER TABLE tiendas DROP COLUMN IF EXISTS velocidad;
ALTER TABLE tiendas DROP COLUMN IF EXISTS plan_aplicado;
ALTER TABLE tiendas DROP COLUMN IF EXISTS vigencia_contrato;
ALTER TABLE tiendas DROP COLUMN IF EXISTS estado_servicio;
ALTER TABLE tiendas DROP COLUMN IF EXISTS fecha_alta_servicio;
ALTER TABLE tiendas DROP COLUMN IF EXISTS descripcion_servicio;
ALTER TABLE tiendas DROP COLUMN IF EXISTS costo_mensual;
