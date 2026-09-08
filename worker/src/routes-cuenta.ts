// routes-cuenta.ts — personas de la cuenta, invitar, canjear código, panel
// de generar códigos (solo es_dueño) y suscripciones push.
import { json } from './cors';
import { perfilDesdeSesion, crearSesion } from './auth';
import { uuid, contarPersonasYPendientes, readJson } from './helpers';
import { randomToken, sha256Hex, randomCodigoActivacion } from './crypto';
import { enviarCorreo, correoInvitacion } from './email';
import { APP_URL } from './constants';
import type { Env } from './types';

type Handler = (request: Request, env: Env, origin: string | null) => Promise<Response>;

const MAX_PERSONAS_POR_CUENTA = 4; // admin + hasta 3 invitados

export const listarPersonas: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const { results } = await env.DB.prepare(
    'SELECT id, email, nombre, role, es_dueño, created_at FROM profiles WHERE cuenta_id = ? ORDER BY created_at ASC'
  ).bind(perfil.cuenta_id).all();
  return json({ ok: true, personas: results }, origin);
};

export const actualizarMiNombre: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const body = await readJson<{ nombre?: string }>(request);
  const nombre = (body?.nombre || '').trim();
  if (!nombre) return json({ ok: false, error: 'Escribe un nombre' }, origin, { status: 400 });
  await env.DB.prepare('UPDATE profiles SET nombre = ? WHERE id = ?').bind(nombre, perfil.id).run();
  return json({ ok: true }, origin);
};

export const invitarPersona: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  if (perfil.role !== 'admin') return json({ ok: false, error: 'Solo la administradora/or de la cuenta puede invitar personas' }, origin, { status: 403 });

  const cuenta = await env.DB.prepare('SELECT plan FROM cuentas WHERE id = ?').bind(perfil.cuenta_id).first<{ plan: string }>();
  if (cuenta?.plan !== 'completo') return json({ ok: false, error: 'Invitar personas es parte del plan completo. Activa tu cuenta primero.' }, origin, { status: 403 });

  const total = await contarPersonasYPendientes(env, perfil.cuenta_id);
  if (total >= MAX_PERSONAS_POR_CUENTA) {
    return json({ ok: false, error: 'Ya alcanzaste el máximo de personas para tu cuenta (admin + 3)' }, origin, { status: 403 });
  }

  const body = await readJson<{ email?: string; nombre?: string }>(request);
  const email = (body?.email || '').trim().toLowerCase();
  const nombre = (body?.nombre || '').trim();
  if (!email || !email.includes('@')) return json({ ok: false, error: 'Escribe un correo válido' }, origin, { status: 400 });

  const existente = await env.DB.prepare('SELECT id FROM profiles WHERE email = ?').bind(email).first();
  if (existente) return json({ ok: false, error: 'Ese correo ya tiene una cuenta' }, origin, { status: 400 });

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 3 * 86400000).toISOString();
  await env.DB.prepare(
    'INSERT INTO invite_tokens (token_hash, cuenta_id, email, nombre, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(tokenHash, perfil.cuenta_id, email, nombre || null, expiresAt).run();

  const link = `${APP_URL}#invite=${token}`;
  await enviarCorreo(env, email, `${perfil.nombre} te invitó a Ocuparche`, correoInvitacion(link, perfil.nombre));

  return json({ ok: true }, origin);
};

export const canjearCodigo: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  if (perfil.role !== 'admin') return json({ ok: false, error: 'Solo la administradora/or de la cuenta puede activar el plan' }, origin, { status: 403 });

  const body = await readJson<{ codigo?: string }>(request);
  const codigo = (body?.codigo || '').trim().toUpperCase();
  if (!codigo) return json({ ok: false, error: 'Escribe el código' }, origin, { status: 400 });

  const fila = await env.DB.prepare('SELECT id, usado FROM codigos_activacion WHERE codigo = ?')
    .bind(codigo).first<{ id: string; usado: number }>();
  if (!fila) return json({ ok: false, error: 'Ese código no existe' }, origin, { status: 400 });
  if (fila.usado) return json({ ok: false, error: 'Ese código ya fue usado' }, origin, { status: 400 });

  await env.DB.batch([
    env.DB.prepare(`UPDATE codigos_activacion SET usado = 1, usado_por_cuenta = ?, usado_en = datetime('now') WHERE id = ?`)
      .bind(perfil.cuenta_id, fila.id),
    env.DB.prepare(`UPDATE cuentas SET plan = 'completo', activado_en = datetime('now') WHERE id = ?`).bind(perfil.cuenta_id),
  ]);
  return json({ ok: true }, origin);
};

// ---------- solo es_dueño (además de la comprobación acá, cualquier
// endpoint nuevo que toque codigos_activacion debe repetirla) ----------

export const generarCodigo: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  if (!perfil.es_dueño) return json({ ok: false, error: 'No autorizado' }, origin, { status: 403 });

  const body = await readJson<{ nota?: string }>(request);
  const codigo = randomCodigoActivacion();
  await env.DB.prepare('INSERT INTO codigos_activacion (id, codigo, nota, creado_por) VALUES (?, ?, ?, ?)')
    .bind(uuid(), codigo, (body?.nota || '').trim() || null, perfil.id).run();
  return json({ ok: true, codigo }, origin);
};

export const listarCodigos: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  if (!perfil.es_dueño) return json({ ok: false, error: 'No autorizado' }, origin, { status: 403 });

  const { results } = await env.DB.prepare(
    'SELECT codigo, usado, usado_en, nota, creado_en FROM codigos_activacion ORDER BY creado_en DESC LIMIT 200'
  ).all();
  return json({ ok: true, codigos: results }, origin);
};

// ---------- avisos push ----------

export const guardarPushSubscription: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });

  const cuenta = await env.DB.prepare('SELECT plan FROM cuentas WHERE id = ?').bind(perfil.cuenta_id).first<{ plan: string }>();
  if (cuenta?.plan !== 'completo') return json({ ok: false, error: 'Los avisos son parte del plan completo' }, origin, { status: 403 });

  const body = await readJson<{ endpoint?: string; p256dh?: string; auth?: string }>(request);
  if (!body?.endpoint || !body?.p256dh || !body?.auth) return json({ ok: false, error: 'Datos inválidos' }, origin, { status: 400 });

  await env.DB.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
  ).bind(uuid(), perfil.id, body.endpoint, body.p256dh, body.auth).run();
  return json({ ok: true }, origin);
};

export const eliminarPushSubscription: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const endpoint = new URL(request.url).searchParams.get('endpoint');
  if (!endpoint) return json({ ok: false, error: 'Falta endpoint' }, origin, { status: 400 });
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(endpoint, perfil.id).run();
  return json({ ok: true }, origin);
};
