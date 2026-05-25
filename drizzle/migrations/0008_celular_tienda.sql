-- Migración 0008: agregar celular_tienda a la tabla tiendas
-- El campo administrador_celular venía siendo usado incorrectamente para el celular
-- de la tienda. Se crea el campo correcto y se migran los datos existentes.

ALTER TABLE tiendas ADD COLUMN celular_tienda text;

UPDATE tiendas
SET celular_tienda = administrador_celular
WHERE celular_tienda IS NULL
  AND administrador_celular IS NOT NULL;
