-- Eliminar tablas legacy reemplazadas por fichas / fichas_niveles
-- Ejecutar DESPUÉS de verificar que no hay datos críticos en estas tablas.

-- 1. Columnas legacy en acciones_gestion y escalamientos
ALTER TABLE escalamientos   DROP COLUMN IF EXISTS nivel_esc_id;
ALTER TABLE acciones_gestion DROP COLUMN IF EXISTS contrato_anterior_id;

-- 2. Columnas eliminadas de proveedores (se gestionan por ficha)
ALTER TABLE proveedores DROP COLUMN IF EXISTS tipo_servicio;
ALTER TABLE proveedores DROP COLUMN IF EXISTS estado_contrato;

-- 3. Tablas eliminadas (CASCADE para limpiar FKs huérfanas si las hubiera)
DROP TABLE IF EXISTS contratos_proveedor CASCADE;
DROP TABLE IF EXISTS niveles_escalamiento CASCADE;
