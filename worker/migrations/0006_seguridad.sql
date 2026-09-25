-- Endurecimiento de seguridad (auditoría):
--  * sessions.admin_2fa: solo las sesiones creadas al pasar el código del
--    authenticator (POST /api/admin/verify-otp) valen para el panel de
--    administrador. Antes, con la contraseña del dueño alcanzaba el login
--    normal para llamar a /api/admin/* y el segundo factor no protegía nada.
--  * profiles.totp_ultimo_paso: un código TOTP ya usado no se puede reutilizar.
--  * rate_limits: contador por ventana de tiempo para frenar fuerza bruta.

ALTER TABLE sessions ADD COLUMN admin_2fa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN totp_ultimo_paso INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS rate_limits (
  clave TEXT PRIMARY KEY,
  ventana_inicio INTEGER NOT NULL,   -- segundos desde epoch
  intentos INTEGER NOT NULL
);
