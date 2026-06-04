-- routers_externos: fotos (array de URLs) y almacén de ubicación
ALTER TABLE routers_externos ADD COLUMN IF NOT EXISTS fotos TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE routers_externos ADD COLUMN IF NOT EXISTS almacen_actual TEXT;

-- router_historial: origen y destino de almacén para DESPLIEGUE y RETORNO
ALTER TABLE router_historial ADD COLUMN IF NOT EXISTS almacen_origen TEXT;
ALTER TABLE router_historial ADD COLUMN IF NOT EXISTS almacen_destino TEXT;
