-- Personalización de apariencia por paciente: género (define un punto de
-- partida), peinado, color de pelo, moño (con su color) y color de ojos.
-- Se guarda como un solo JSON para no andar agregando columnas cada vez que
-- se sume una opción nueva de personalización.
ALTER TABLE pacientes ADD COLUMN avatar_json TEXT;
