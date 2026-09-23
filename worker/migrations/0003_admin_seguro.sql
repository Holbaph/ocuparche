-- Panel de administrador de plataforma, separado de la app familiar:
-- login en dos pasos (contraseña + código de un solo uso mandado al correo
-- del dueño) y una cola de solicitudes de activación para no tener que
-- andar revisando el correo para saber quién está esperando su código.

CREATE TABLE admin_login_pendiente (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  codigo_hash TEXT NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE solicitudes_codigo (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  nota TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | atendida | rechazada
  codigo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  atendida_en TEXT
);
