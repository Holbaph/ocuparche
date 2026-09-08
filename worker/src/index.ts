// index.ts — API de Ocuparche (Cloudflare Workers + D1). Reemplaza lo que
// antes hacían Supabase Auth + Edge Functions. Sin RLS: cada consulta que
// toca datos de una cuenta filtra a mano por cuenta_id — revisa dos veces
// cualquier query nueva que agregues.

import { corsHeaders, json, preflight } from './cors';
import { hashPassword, verifyPassword, randomToken, sha256Hex } from './crypto';
import { crearSesion, perfilDesdeSesion, cerrarSesion, clearSessionCookie } from './auth';
import { enviarCorreo, correoRecuperar } from './email';
import { uuid, readJson } from './helpers';
import { APP_URL } from './constants';
import type { Env } from './types';
import * as pacientes from './routes-pacientes';
import * as cuenta from './routes-cuenta';
import * as admin from './routes-admin';
import { revisarYAvisar } from './reminders';

export type { Env };
export { PacienteRoom } from './PacienteRoom';

// ---------- rutas ----------

async function handleSignup(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string; nombre?: string }>(request);
  const email = (body?.email || '').trim().toLowerCase();
  const password = body?.password || '';
  const nombre = (body?.nombre || '').trim();

  if (!email || !email.includes('@')) return json({ ok: false, error: 'Escribe un correo válido' }, origin, { status: 400 });
  if (password.length < 6) return json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' }, origin, { status: 400 });
  if (!nombre) return json({ ok: false, error: 'Escribe tu nombre' }, origin, { status: 400 });

  const existente = await env.DB.prepare('SELECT id FROM profiles WHERE email = ?').bind(email).first();
  if (existente) return json({ ok: false, error: 'Ese correo ya tiene una cuenta' }, origin, { status: 400 });

  const { hash, salt } = await hashPassword(password);
  const cuentaId = uuid();
  const userId = uuid();
  const esDueño = email === 'phernandez@softcorp.cl' ? 1 : 0;

  await env.DB.batch([
    env.DB.prepare('INSERT INTO cuentas (id, admin_id) VALUES (?, ?)').bind(cuentaId, userId),
    env.DB.prepare(
      'INSERT INTO profiles (id, cuenta_id, email, password_hash, password_salt, nombre, role, es_dueño) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, cuentaId, email, hash, salt, nombre, 'admin', esDueño),
  ]);

  const { cookie } = await crearSesion(env, userId);
  return json({ ok: true }, origin, { headers: { 'Set-Cookie': cookie } });
}

async function handleAcceptInvite(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await readJson<{ token?: string; password?: string }>(request);
  const token = (body?.token || '').trim();
  const password = body?.password || '';
  if (!token) return json({ ok: false, error: 'Falta el token de invitación' }, origin, { status: 400 });
  if (password.length < 6) return json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' }, origin, { status: 400 });

  const tokenHash = await sha256Hex(token);
  const invite = await env.DB.prepare(
    `SELECT * FROM invite_tokens WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')`
  ).bind(tokenHash).first<{ cuenta_id: string; email: string; nombre: string | null }>();
  if (!invite) return json({ ok: false, error: 'Esa invitación no existe o ya venció' }, origin, { status: 400 });

  const existente = await env.DB.prepare('SELECT id FROM profiles WHERE email = ?').bind(invite.email).first();
  if (existente) return json({ ok: false, error: 'Ese correo ya tiene una cuenta' }, origin, { status: 400 });

  const { hash, salt } = await hashPassword(password);
  const userId = uuid();

  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO profiles (id, cuenta_id, email, password_hash, password_salt, nombre, role, es_dueño) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
    ).bind(userId, invite.cuenta_id, invite.email, hash, salt, invite.nombre || invite.email.split('@')[0], 'user'),
    env.DB.prepare('UPDATE invite_tokens SET used = 1 WHERE token_hash = ?').bind(tokenHash),
  ]);

  const { cookie } = await crearSesion(env, userId);
  return json({ ok: true }, origin, { headers: { 'Set-Cookie': cookie } });
}

async function handleLogin(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string }>(request);
  const email = (body?.email || '').trim().toLowerCase();
  const password = body?.password || '';
  if (!email || !password) return json({ ok: false, error: 'Completa correo y contraseña' }, origin, { status: 400 });

  const user = await env.DB.prepare('SELECT id, password_hash, password_salt FROM profiles WHERE email = ?')
    .bind(email)
    .first<{ id: string; password_hash: string; password_salt: string }>();
  if (!user) return json({ ok: false, error: 'Correo o contraseña incorrectos' }, origin, { status: 401 });

  const valido = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valido) return json({ ok: false, error: 'Correo o contraseña incorrectos' }, origin, { status: 401 });

  const { cookie } = await crearSesion(env, user.id);
  return json({ ok: true }, origin, { headers: { 'Set-Cookie': cookie } });
}

async function handleLogout(request: Request, env: Env, origin: string | null): Promise<Response> {
  await cerrarSesion(request, env);
  return json({ ok: true }, origin, { headers: { 'Set-Cookie': clearSessionCookie() } });
}

async function handleMe(request: Request, env: Env, origin: string | null): Promise<Response> {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const cuenta = await env.DB.prepare('SELECT id, plan, activado_en FROM cuentas WHERE id = ?').bind(perfil.cuenta_id).first();
  return json({ ok: true, perfil, cuenta }, origin);
}

async function handleForgotPassword(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await readJson<{ email?: string }>(request);
  const email = (body?.email || '').trim().toLowerCase();
  if (!email) return json({ ok: false, error: 'Escribe tu correo' }, origin, { status: 400 });

  const user = await env.DB.prepare('SELECT id FROM profiles WHERE email = ?').bind(email).first<{ id: string }>();
  // Responde ok igual si el correo no existe — no revelamos qué correos están registrados.
  if (user) {
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    await env.DB.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(tokenHash, user.id, expiresAt)
      .run();
    const link = `${APP_URL}#reset=${token}`;
    await enviarCorreo(env, email, 'Recupera tu acceso a Ocuparche', correoRecuperar(link));
  }
  return json({ ok: true }, origin);
}

async function handleResetPassword(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await readJson<{ token?: string; password?: string }>(request);
  const token = (body?.token || '').trim();
  const password = body?.password || '';
  if (!token) return json({ ok: false, error: 'Falta el token' }, origin, { status: 400 });
  if (password.length < 6) return json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' }, origin, { status: 400 });

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')`
  ).bind(tokenHash).first<{ user_id: string }>();
  if (!row) return json({ ok: false, error: 'El enlace no existe o ya venció' }, origin, { status: 400 });

  const { hash, salt } = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare('UPDATE profiles SET password_hash = ?, password_salt = ? WHERE id = ?').bind(hash, salt, row.user_id),
    env.DB.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token_hash = ?').bind(tokenHash),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id), // cierra sesiones viejas por seguridad
  ]);

  const { cookie } = await crearSesion(env, row.user_id);
  return json({ ok: true }, origin, { headers: { 'Set-Cookie': cookie } });
}

// ---------- router ----------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') return preflight(origin);

    // Cloudflare documenta que /__scheduled (el atajo para probar el cron a
    // mano) queda accesible en producción para cualquiera si no se bloquea
    // — acá lo hacemos siempre. Para probar el cron en desarrollo se usa
    // "wrangler dev --test-scheduled", que lo intercepta ANTES de que
    // llegue hasta acá, así que este bloqueo no estorba las pruebas locales.
    if (url.pathname === '/__scheduled') {
      return new Response('Not found', { status: 404 });
    }

    // Conexión en vivo — no es una ruta JSON normal, se detecta por el
    // header Upgrade y se maneja aparte (ver routes-pacientes.ts).
    if (url.pathname === '/api/realtime' && request.headers.get('Upgrade') === 'websocket') {
      return pacientes.conectarRealtime(request, env);
    }

    const routes: Record<string, (req: Request, env: Env, origin: string | null) => Promise<Response>> = {
      'POST /api/signup': handleSignup,
      'POST /api/accept-invite': handleAcceptInvite,
      'POST /api/login': handleLogin,
      'POST /api/logout': handleLogout,
      'GET /api/me': handleMe,
      'POST /api/forgot-password': handleForgotPassword,
      'POST /api/reset-password': handleResetPassword,

      'GET /api/pacientes': pacientes.listarPacientes,
      'POST /api/pacientes': pacientes.crearPaciente,
      'PATCH /api/pacientes': pacientes.actualizarPaciente,
      'DELETE /api/pacientes': pacientes.eliminarPaciente,

      'GET /api/registros': pacientes.listarRegistros,
      'PUT /api/registros': pacientes.guardarRegistro,
      'DELETE /api/registros': pacientes.eliminarRegistro,

      'GET /api/config': pacientes.obtenerConfig,
      'PUT /api/config': pacientes.guardarConfig,

      'GET /api/personas': cuenta.listarPersonas,
      'PATCH /api/me': cuenta.actualizarMiNombre,
      'POST /api/invitar': cuenta.invitarPersona,
      'POST /api/canjear-codigo': cuenta.canjearCodigo,

      'GET /api/codigos': cuenta.listarCodigos,
      'POST /api/codigos': cuenta.generarCodigo,

      'POST /api/push-subscriptions': cuenta.guardarPushSubscription,
      'DELETE /api/push-subscriptions': cuenta.eliminarPushSubscription,

      'GET /api/admin/stats': admin.estadisticas,
      'GET /api/admin/clientes': admin.listarClientes,
    };

    const key = `${request.method} ${url.pathname}`;
    const handler = routes[key];
    if (!handler) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });

    try {
      return await handler(request, env, origin);
    } catch (e) {
      console.error(e);
      return json({ ok: false, error: 'Error interno' }, origin, { status: 500 });
    }
  },

  // Lo dispara el cron de wrangler.jsonc cada minuto — revisa si algún
  // paciente ya cumplió su tiempo de parche y avisa por push.
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      revisarYAvisar(env)
        .then((r) => console.log('[cron] avisos enviados:', r.avisos))
        .catch((e) => console.error('[cron] error', e))
    );
  },
};
