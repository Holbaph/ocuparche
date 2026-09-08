import type { PacienteRoom } from './PacienteRoom';

export interface Env {
  DB: D1Database;
  RESEND_API_KEY?: string;
  PACIENTE_ROOM: DurableObjectNamespace<PacienteRoom>;
}
