-- Eliminar módulo legacy "decisiones" (reemplazado por gestión de cambios / acciones_gestion)
-- La página /decisiones y la API /api/decisiones ya fueron eliminadas.

-- 1. Tabla decisiones (CASCADE limpia FKs y objetos dependientes)
DROP TABLE IF EXISTS decisiones CASCADE;

-- 2. Enums huérfanos que solo usaba decisiones
DROP TYPE IF EXISTS tipo_decision;
DROP TYPE IF EXISTS estado_decision;

-- 3. FK faltante: incidentes.grupo_masivo_id → grupos_masivos(id)
--    Limpiar huérfanos antes de crear el constraint
UPDATE incidentes SET grupo_masivo_id = NULL
WHERE grupo_masivo_id IS NOT NULL
  AND grupo_masivo_id NOT IN (SELECT id FROM grupos_masivos);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incidentes_grupo_masivo_id_grupos_masivos_id_fk') THEN
    ALTER TABLE incidentes ADD CONSTRAINT incidentes_grupo_masivo_id_grupos_masivos_id_fk
      FOREIGN KEY (grupo_masivo_id) REFERENCES grupos_masivos(id) ON DELETE SET NULL;
  END IF;
END $$;
