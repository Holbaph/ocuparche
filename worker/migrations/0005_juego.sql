-- "Jugar a vestir" (plan completo) — mismo guardarropa por paciente,
-- compartido entre todos los dispositivos de la cuenta, guardado en la
-- misma tabla que la duración del temporizador.
ALTER TABLE configuracion ADD COLUMN juego TEXT;
ALTER TABLE configuracion ADD COLUMN juego_minutos_dia INTEGER NOT NULL DEFAULT 20
  CHECK (juego_minutos_dia >= 0);
