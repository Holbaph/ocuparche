// helpers.ts — comprobaciones de pertenencia a cuenta (el equivalente a mano
// de lo que hacía RLS en Supabase). Cualquier ruta nueva que toque
// pacientes/registros/configuracion debe pasar por estas, sin excepción.
import type { Env } from './types';

// Las fechas de vencimiento se guardan en ISO ("2026-09-25T12:00:00.000Z");
// datetime('now') de SQLite da "2026-09-25 12:00:00", y comparar esos dos
// textos hacía que un token durara hasta el final del día en vez de la hora
// prometida. Esta expresión da el "ahora" en el mismo formato ISO.
export const AHORA_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// Recorta y limpia un texto de entrada (nombres, notas…).
export function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function emailValido(e: string): boolean {
  return e.length <= 254 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e);
}

const CONTRASEÑAS_TRIVIALES = new Set(['12345678', '123456789', '1234567890', 'password', 'contraseña', 'qwertyui', 'abcd1234', '11111111', 'password1', 'ocuparche']);
// null = está bien; si no, el mensaje para mostrar
export function contraseñaInvalida(pw: unknown, email = ''): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (pw.length > 128) return 'La contraseña es demasiado larga';
  if (CONTRASEÑAS_TRIVIALES.has(pw.toLowerCase()) || /^(.)\1+$/.test(pw)) return 'Esa contraseña es muy fácil de adivinar — elige otra';
  if (email && pw.toLowerCase() === email.toLowerCase()) return 'La contraseña no puede ser tu correo';
  return null;
}

export function uuid(): string {
  return crypto.randomUUID();
}

export async function pacienteDeLaCuenta(env: Env, pacienteId: string, cuentaId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 FROM pacientes WHERE id = ? AND cuenta_id = ?')
    .bind(pacienteId, cuentaId)
    .first();
  return !!row;
}

export async function contarPacientes(env: Env, cuentaId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) as n FROM pacientes WHERE cuenta_id = ?')
    .bind(cuentaId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function contarPersonas(env: Env, cuentaId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) as n FROM profiles WHERE cuenta_id = ?')
    .bind(cuentaId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// Cuenta personas ya creadas MÁS invitaciones mandadas y aún no aceptadas
// (ni vencidas) — si solo contáramos profiles, un admin podría mandar de
// más invitaciones antes de que la primera se acepte y pasarse del cupo.
export async function contarPersonasYPendientes(env: Env, cuentaId: string): Promise<number> {
  const reales = await contarPersonas(env, cuentaId);
  const pendientes = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM invite_tokens WHERE cuenta_id = ? AND used = 0 AND expires_at > ${AHORA_SQL}`
  ).bind(cuentaId).first<{ n: number }>();
  return reales + (pendientes?.n ?? 0);
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
