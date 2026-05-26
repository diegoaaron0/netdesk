-- Migración 0009: campo contexto en adjuntos para separar archivos de envío y respuesta
ALTER TABLE adjuntos ADD COLUMN contexto text;
