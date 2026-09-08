// routes-pacientes.ts — pacientes, sus registros diarios y la duración del
// temporizador. Toda ruta empieza igual: pedir sesión, y si toca un
// paciente puntual, confirmar que sea de LA MISMA cuenta antes de tocar nada
// (pacienteDeLaCuenta) — es nuestro reemplazo manual de RLS.
import { json } from './cors';
import { perfilDesdeSesion } from './auth';
import { uuid, pacienteDeLaCuenta, contarPacientes, readJson } from './helpers';
import type { Env } from './types';

type Handler = (request: Request, env: Env, origin: string | null) => Promise<Response>;

// Avisa al Durable Object del paciente que algo cambió, para que reenvíe el
// aviso a todos los dispositivos conectados en vivo. Si falla (nadie
// conectado, DO recién creándose, etc.) no aborta la operación principal —
// el dato ya quedó guardado en D1, el peor caso es que el otro dispositivo
// se entere al refrescar en vez de al instante.
async function avisarCambio(env: Env, pacienteId: string) {
  try {
    const id = env.PACIENTE_ROOM.idFromName(pacienteId);
    await env.PACIENTE_ROOM.get(id).broadcast(JSON.stringify({ type: 'registros_cambiaron' }));
  } catch (e) {
    console.error('No se pudo avisar al Durable Object', e);
  }
}

export const listarPacientes: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const { results } = await env.DB.prepare(
    'SELECT id, nombre, created_at FROM pacientes WHERE cuenta_id = ? ORDER BY created_at ASC'
  ).bind(perfil.cuenta_id).all();
  return json({ ok: true, pacientes: results }, origin);
};

export const crearPaciente: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const body = await readJson<{ nombre?: string }>(request);
  const nombre = (body?.nombre || '').trim();
  if (!nombre) return json({ ok: false, error: 'Escribe un nombre' }, origin, { status: 400 });

  const cuenta = await env.DB.prepare('SELECT plan FROM cuentas WHERE id = ?').bind(perfil.cuenta_id).first<{ plan: string }>();
  const total = await contarPacientes(env, perfil.cuenta_id);
  if (cuenta?.plan !== 'completo' && total >= 1) {
    return json({ ok: false, error: 'plan_gratis_limite_pacientes' }, origin, { status: 403 });
  }

  const id = uuid();
  await env.DB.prepare('INSERT INTO pacientes (id, cuenta_id, nombre) VALUES (?, ?, ?)').bind(id, perfil.cuenta_id, nombre).run();
  return json({ ok: true, paciente: { id, nombre } }, origin);
};

export const renombrarPaciente: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const body = await readJson<{ id?: string; nombre?: string }>(request);
  const id = body?.id, nombre = (body?.nombre || '').trim();
  if (!id || !nombre) return json({ ok: false, error: 'Faltan datos' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, id, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  await env.DB.prepare('UPDATE pacientes SET nombre = ? WHERE id = ?').bind(nombre, id).run();
  return json({ ok: true }, origin);
};

export const eliminarPaciente: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ ok: false, error: 'Falta id' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, id, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  // D1/SQLite no aplica ON DELETE CASCADE salvo que se active la pragma
  // foreign_keys — borramos a mano lo que cuelga de este paciente.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM registros WHERE paciente_id = ?').bind(id),
    env.DB.prepare('DELETE FROM configuracion WHERE paciente_id = ?').bind(id),
    env.DB.prepare('DELETE FROM pacientes WHERE id = ?').bind(id),
  ]);
  return json({ ok: true }, origin);
};

// ---------- registros ----------

export const listarRegistros: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const pacienteId = new URL(request.url).searchParams.get('paciente_id');
  if (!pacienteId) return json({ ok: false, error: 'Falta paciente_id' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  const { results } = await env.DB.prepare(
    'SELECT id, fecha, ojo, hora, registrado_por FROM registros WHERE paciente_id = ? ORDER BY fecha DESC LIMIT 400'
  ).bind(pacienteId).all();
  return json({ ok: true, registros: results }, origin);
};

export const guardarRegistro: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const body = await readJson<{ paciente_id?: string; fecha?: string; ojo?: string; hora?: string }>(request);
  const pacienteId = body?.paciente_id, fecha = body?.fecha, ojo = body?.ojo;
  const hora = body?.hora || new Date().toISOString();
  if (!pacienteId || !fecha || (ojo !== 'derecho' && ojo !== 'izquierdo')) {
    return json({ ok: false, error: 'Datos inválidos' }, origin, { status: 400 });
  }
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });

  await env.DB.prepare(
    `INSERT INTO registros (id, paciente_id, fecha, ojo, hora, registrado_por, notificado)
     VALUES (?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(paciente_id, fecha) DO UPDATE SET
       ojo = excluded.ojo, hora = excluded.hora, registrado_por = excluded.registrado_por, notificado = 0`
  ).bind(uuid(), pacienteId, fecha, ojo, hora, perfil.id).run();

  await avisarCambio(env, pacienteId);
  return json({ ok: true }, origin);
};

export const eliminarRegistro: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const url = new URL(request.url);
  const pacienteId = url.searchParams.get('paciente_id');
  const fecha = url.searchParams.get('fecha');
  if (!pacienteId || !fecha) return json({ ok: false, error: 'Faltan datos' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  await env.DB.prepare('DELETE FROM registros WHERE paciente_id = ? AND fecha = ?').bind(pacienteId, fecha).run();
  await avisarCambio(env, pacienteId);
  return json({ ok: true }, origin);
};

// ---------- conexión en vivo (WebSocket) ----------
// No pasa por el router de rutas exactas de index.ts porque una conexión
// WebSocket no es una petición JSON normal — index.ts la detecta por el
// header Upgrade y la manda directo para acá.
export async function conectarRealtime(request: Request, env: Env): Promise<Response> {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return new Response('No autenticado', { status: 401 });

  const pacienteId = new URL(request.url).searchParams.get('paciente_id');
  if (!pacienteId) return new Response('Falta paciente_id', { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return new Response('No encontrado', { status: 404 });

  const id = env.PACIENTE_ROOM.idFromName(pacienteId);
  return env.PACIENTE_ROOM.get(id).fetch(request);
}

// ---------- configuración (duración del temporizador) ----------

export const obtenerConfig: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const pacienteId = new URL(request.url).searchParams.get('paciente_id');
  if (!pacienteId) return json({ ok: false, error: 'Falta paciente_id' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  const row = await env.DB.prepare('SELECT duracion_minutos FROM configuracion WHERE paciente_id = ?')
    .bind(pacienteId).first<{ duracion_minutos: number }>();
  return json({ ok: true, duracion_minutos: row?.duracion_minutos ?? 120 }, origin);
};

export const guardarConfig: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const body = await readJson<{ paciente_id?: string; duracion_minutos?: number }>(request);
  const pacienteId = body?.paciente_id;
  const minutos = Number(body?.duracion_minutos);
  if (!pacienteId || !minutos || minutos <= 0) return json({ ok: false, error: 'Datos inválidos' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });

  const cuenta = await env.DB.prepare('SELECT plan FROM cuentas WHERE id = ?').bind(perfil.cuenta_id).first<{ plan: string }>();
  if (cuenta?.plan !== 'completo') return json({ ok: false, error: 'El temporizador es parte del plan completo' }, origin, { status: 403 });

  await env.DB.prepare(
    `INSERT INTO configuracion (paciente_id, duracion_minutos, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(paciente_id) DO UPDATE SET duracion_minutos = excluded.duracion_minutos, updated_at = datetime('now')`
  ).bind(pacienteId, minutos).run();
  return json({ ok: true }, origin);
};
