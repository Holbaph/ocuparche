// helpers.ts — comprobaciones de pertenencia a cuenta (el equivalente a mano
// de lo que hacía RLS en Supabase). Cualquier ruta nueva que toque
// pacientes/registros/configuracion debe pasar por estas, sin excepción.
import type { Env } from './types';

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
    `SELECT COUNT(*) as n FROM invite_tokens WHERE cuenta_id = ? AND used = 0 AND expires_at > datetime('now')`
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
