// routes-juego.ts — "Jugar a vestir": guardarropa de cada paciente, solo
// plan completo (el mismo candado que el temporizador, ver
// routes-pacientes.ts guardarConfig). Se guarda en la misma tabla
// "configuracion" que la duración del parche, en la columna "juego" (el
// JSON tal cual lo arma js/juego.js) y "juego_minutos_dia".
import { json } from './cors';
import { perfilDesdeSesion } from './auth';
import { pacienteDeLaCuenta, readJson } from './helpers';
import type { Env } from './types';

type Handler = (request: Request, env: Env, origin: string | null) => Promise<Response>;

async function esPlanCompleto(env: Env, cuentaId: string): Promise<boolean> {
  const cuenta = await env.DB.prepare('SELECT plan FROM cuentas WHERE id = ?').bind(cuentaId).first<{ plan: string }>();
  return cuenta?.plan === 'completo';
}

export const obtenerJuego: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const pacienteId = new URL(request.url).searchParams.get('paciente_id');
  if (!pacienteId) return json({ ok: false, error: 'Falta paciente_id' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  if (!(await esPlanCompleto(env, perfil.cuenta_id))) {
    return json({ ok: false, error: 'El juego de vestir es parte del plan completo' }, origin, { status: 403 });
  }

  const row = await env.DB.prepare('SELECT juego, juego_minutos_dia FROM configuracion WHERE paciente_id = ?')
    .bind(pacienteId).first<{ juego: string | null; juego_minutos_dia: number | null }>();
  let juego: unknown = null;
  if (row?.juego) { try { juego = JSON.parse(row.juego); } catch { juego = null; } }
  return json({ ok: true, juego, minutosDia: row?.juego_minutos_dia ?? 20 }, origin);
};

export const guardarJuego: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const body = await readJson<{ paciente_id?: string; juego?: unknown }>(request);
  const pacienteId = body?.paciente_id;
  if (!pacienteId || body?.juego === undefined) return json({ ok: false, error: 'Datos inválidos' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  if (!(await esPlanCompleto(env, perfil.cuenta_id))) {
    return json({ ok: false, error: 'El juego de vestir es parte del plan completo' }, origin, { status: 403 });
  }

  await env.DB.prepare(
    `INSERT INTO configuracion (paciente_id, juego, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(paciente_id) DO UPDATE SET juego = excluded.juego, updated_at = datetime('now')`
  ).bind(pacienteId, JSON.stringify(body.juego)).run();
  return json({ ok: true }, origin);
};

export const guardarJuegoMinutos: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const body = await readJson<{ paciente_id?: string; minutos?: number }>(request);
  const pacienteId = body?.paciente_id;
  const minutos = Number(body?.minutos);
  if (!pacienteId || Number.isNaN(minutos) || minutos < 0) return json({ ok: false, error: 'Datos inválidos' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  if (!(await esPlanCompleto(env, perfil.cuenta_id))) {
    return json({ ok: false, error: 'El juego de vestir es parte del plan completo' }, origin, { status: 403 });
  }

  await env.DB.prepare(
    `INSERT INTO configuracion (paciente_id, juego_minutos_dia, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(paciente_id) DO UPDATE SET juego_minutos_dia = excluded.juego_minutos_dia, updated_at = datetime('now')`
  ).bind(pacienteId, minutos).run();
  return json({ ok: true }, origin);
};
