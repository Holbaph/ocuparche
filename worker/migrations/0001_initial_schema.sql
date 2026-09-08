-- Ocuparche — esquema D1 (SQLite). Multi-cuenta / freemium, igual en espíritu
-- al que teníamos en Supabase, pero sin RLS: cada endpoint del Worker filtra
-- a mano por cuenta_id (ver src/index.ts) — por eso cada consulta que toca
-- pacientes/registros/configuracion SIEMPRE debe pasar por esas comprobaciones.

CREATE TABLE IF NOT EXISTS cuentas (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','completo')),
  activado_en TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  cuenta_id TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  nombre TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','user')),
  es_dueño INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_profiles_cuenta ON profiles(cuenta_id);

-- El token de sesión NUNCA se guarda en texto plano: la cookie lleva el
-- token real, aquí solo su hash SHA-256 (ver src/crypto.ts: hashToken). Así,
-- si alguien alguna vez ve esta tabla, no puede iniciar sesión como nadie.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invite_tokens (
  token_hash TEXT PRIMARY KEY,
  cuenta_id TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre TEXT,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pacientes (
  id TEXT PRIMARY KEY,
  cuenta_id TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pacientes_cuenta ON pacientes(cuenta_id);

CREATE TABLE IF NOT EXISTS registros (
  id TEXT PRIMARY KEY,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  ojo TEXT NOT NULL CHECK (ojo IN ('derecho','izquierdo')),
  hora TEXT NOT NULL,
  registrado_por TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  notificado INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(paciente_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_registros_paciente_fecha ON registros(paciente_id, fecha DESC);

CREATE TABLE IF NOT EXISTS configuracion (
  paciente_id TEXT PRIMARY KEY REFERENCES pacientes(id) ON DELETE CASCADE,
  duracion_minutos INTEGER NOT NULL DEFAULT 120 CHECK (duracion_minutos > 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS codigos_activacion (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  usado INTEGER NOT NULL DEFAULT 0,
  usado_por_cuenta TEXT REFERENCES cuentas(id),
  usado_en TEXT,
  nota TEXT,
  creado_por TEXT REFERENCES profiles(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
