-- Control del tratamiento para los padres (portado de Ojitos de Mili,
-- supabase/schema_tratamiento.sql): tiempo real de uso, indicación del
-- oftalmólogo, premio por constancia, próximo control y resumen semanal.

-- Hora en que se sacó el parche (NULL = sigue puesto, o no se anotó).
ALTER TABLE registros ADD COLUMN hora_fin TEXT;

-- Qué ojo se tapa: 'alternar' | 'derecho' | 'izquierdo'
ALTER TABLE configuracion ADD COLUMN indicacion_ojo TEXT NOT NULL DEFAULT 'alternar';
-- Qué días de la semana va el parche (0 = domingo … 6 = sábado), separados por coma
ALTER TABLE configuracion ADD COLUMN indicacion_dias TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6';
-- Premio por constancia: cuántos días a la semana y qué premio
ALTER TABLE configuracion ADD COLUMN premio_meta INTEGER;
ALTER TABLE configuracion ADD COLUMN premio_texto TEXT;
-- Próximo control con el oftalmólogo
ALTER TABLE configuracion ADD COLUMN control_fecha TEXT;      -- AAAA-MM-DD
ALTER TABLE configuracion ADD COLUMN control_hora TEXT;       -- HH:MM
ALTER TABLE configuracion ADD COLUMN control_detalle TEXT;
ALTER TABLE configuracion ADD COLUMN control_preguntas TEXT;
ALTER TABLE configuracion ADD COLUMN control_aviso_enviado TEXT;
-- Resumen semanal por aviso (los domingos)
ALTER TABLE configuracion ADD COLUMN resumen_activo INTEGER NOT NULL DEFAULT 1;
ALTER TABLE configuracion ADD COLUMN resumen_ultimo_envio TEXT;
