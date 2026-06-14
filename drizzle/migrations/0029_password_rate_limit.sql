-- Rate limit de cambios de contraseña: máximo 3 por ventana de 24h
-- La tabla registra cada cambio exitoso (sirve además como auditoría de seguridad).

CREATE TABLE IF NOT EXISTS "password_cambios" (
  "id"         uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  "usuario_id" uuid      NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
  "creado_en"  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_cambios_usuario ON password_cambios(usuario_id, creado_en DESC);
