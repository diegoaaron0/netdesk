-- Índice parcial para lookup rápido de tiendas con contingencia activa.
-- Usado en dashboard operativo: WHERE contingencia_activa = true
-- Con 156 tiendas es un full-scan hoy, pero el índice previene degradación futura.
CREATE INDEX IF NOT EXISTS idx_tiendas_contingencia_activa
  ON tiendas (id)
  WHERE contingencia_activa = true;
