-- Cambia el segundo factor del panel de administrador: de un código por
-- correo (Resend no estaba entregando, no hay forma confiable de
-- garantizarlo en el plan gratis) a TOTP — el mismo mecanismo de Google
-- Authenticator, Authy, 1Password, etc. No depende de que llegue nada por
-- correo: el código se genera en el celular, sincronizado por tiempo.

ALTER TABLE profiles ADD COLUMN totp_secret TEXT;
ALTER TABLE profiles ADD COLUMN totp_confirmado INTEGER NOT NULL DEFAULT 0;

-- Se recrea sin codigo_hash (ya no hace falta guardar ningún código: el
-- TOTP se recalcula al vuelo contra el secreto de profiles.totp_secret).
-- No hay pérdida de datos real — son filas de login pendiente de 10
-- minutos, nunca se usaron con éxito.
DROP TABLE IF EXISTS admin_login_pendiente;
CREATE TABLE admin_login_pendiente (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  intentos INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
