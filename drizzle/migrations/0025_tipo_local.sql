-- Migration 0025: tipo_local y tienda_padre_id
-- Agrega clasificación de local (TIENDA/CATALOGO/ENLACE/ALMACEN/RESTAURANTE)
-- y relación padre-hijo entre tiendas (para catálogos que heredan ficha).

-- 1. Crear enum
CREATE TYPE "public"."tipo_local" AS ENUM('TIENDA', 'CATALOGO', 'ENLACE', 'ALMACEN', 'RESTAURANTE');

-- 2. Agregar columnas
ALTER TABLE "tiendas"
  ADD COLUMN "tipo_local" "tipo_local" NOT NULL DEFAULT 'TIENDA',
  ADD COLUMN "tienda_padre_id" uuid REFERENCES "tiendas"("id") ON DELETE SET NULL;

-- 3. Backfill tipo_local ───────────────────────────────────────────────────────

-- Catálogos (sufijo -C)
UPDATE tiendas SET tipo_local = 'CATALOGO'
WHERE codigo LIKE '%-C';

-- Enlaces
UPDATE tiendas SET tipo_local = 'ENLACE'
WHERE codigo IN ('ENLACE PRINCIPAL', 'ENLACE SECUNDARIO', 'ENLACE DE CAMARAS');

-- Almacenes
UPDATE tiendas SET tipo_local = 'ALMACEN'
WHERE codigo IN ('ALMACEN W4', 'TB7', 'TD6', 'TE9', 'TA6');

-- Restaurante
UPDATE tiendas SET tipo_local = 'RESTAURANTE'
WHERE codigo = 'RESTAURANTE R18';

-- 4. Backfill tienda_padre_id para catálogos ──────────────────────────────────
UPDATE tiendas hijo
SET tienda_padre_id = padre.id
FROM tiendas padre
WHERE hijo.codigo = padre.codigo || '-C'
  AND hijo.tipo_local = 'CATALOGO';

-- Caso especial: TA7-C → TA7 (diferente proveedor, pero sigue siendo hijo de TA7)
-- Ya se cubre con la regla anterior (TA7 || '-C' = TA7-C)

-- 5. Índice para búsquedas por tipo
CREATE INDEX IF NOT EXISTS idx_tiendas_tipo_local ON tiendas(tipo_local);
