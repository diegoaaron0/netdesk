-- Migración 0007: soporte para cortes eléctricos dentro del módulo de incidentes
-- Los cortes eléctricos se registran como incidentes de tipo CORTE_ELECTRICO,
-- con borde naranja en la lista y "Energía Eléctrica" como proveedor.

-- 1. Nuevo enum para el alcance del corte (reutilizable si se necesita filtrar)
CREATE TYPE alcance_corte AS ENUM ('SOLO_TIENDA', 'MALL', 'CUADRA_CALLE', 'ZONA_AMPLIA');

-- 2. Agregar CORTE_ELECTRICO al enum de tipo de incidente
ALTER TYPE tipo_incidente ADD VALUE 'CORTE_ELECTRICO';

-- 3. Nuevas columnas en incidentes (solo relevantes para CORTE_ELECTRICO)
ALTER TABLE incidentes
  ADD COLUMN alcance_corte alcance_corte,
  ADD COLUMN tuvo_ups      boolean;
