import type { PacienteRoom } from './PacienteRoom';

export interface Env {
  DB: D1Database;
  RESEND_API_KEY?: string;
  VAPID_PRIVATE_KEY_JWK?: string;
  PACIENTE_ROOM: DurableObjectNamespace<PacienteRoom>;
}
