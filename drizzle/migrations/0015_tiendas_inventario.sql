ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS gabinete boolean DEFAULT false;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS vigencia_contrato text;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS descripcion_servicio text;
