// index.ts — API de Ocuparche (Cloudflare Workers + D1). Reemplaza lo que
// antes hacían Supabase Auth + Edge Functions. Sin RLS: cada consulta que
// toca datos de una cuenta filtra a mano por cuenta_id — revisa dos veces
// cualquier query nueva que agregues.

import { json, preflight } from './cors';
import { hashPassword, verifyPassword, randomToken, sha256Hex } from './crypto';
import { crearSesion, perfilDesdeSesion, cerrarSesion, clearSessionCookie } from './auth';
import { enviarCorreo, correoRecuperar } from './email';
import { uuid, readJson, texto, emailValido, contraseñaInvalida, AHORA_SQL } from './helpers';
import { permitir, olvidar, ipDe, demasiadosIntentos } from './ratelimit';
import { APP_URL } from './constants';
import type { Env } from './types';
import * as pacientes from './routes-pacientes';
import * as cuenta from './routes-cuenta';
import * as admin from './routes-admin';
import * as juego from './routes-juego';
import { revisarYAvisar, revisarTratamiento } from './reminders';

export type { Env };
export { PacienteRoom } from './PacienteRoom';

// ---------- rutas ----------

async function handleSignup(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string; nombre?: string }>(request);
  const email = texto(body?.email, 254).toLowerCase();
  const password = typeof body?.password === 'string' ? body.password : '';
  const nombre = texto(body?.nombre, 60);

  if (!(await permitir(env, `signup:ip:${ipDe(request)}`, 5, 3600))) return demasiadosIntentos(origin, 3600);
  if (!emailValido(email)) return json({ ok: false, error: 'Escribe un correo válido' }, origin, { status: 400 });
  const malaClave = contraseñaInvalida(password, email);
  if (malaClave) return json({ ok: false, error: malaClave }, origin, { status: 400 });
  if (!nombre) return json({ ok: false, error: 'Escribe tu nombre' }, origin, { status: 400 });

  const existente = await env.DB.prepare('SELECT id FROM profiles WHERE email = ?').bind(email).first();
  if (existente) return json({ ok: false, error: 'Ese correo ya tiene una cuenta' }, origin, { status: 400 });

  const { hash, salt } = await hashPassword(password);
  const cuentaId = uuid();
  const userId = uuid();
  // La cuenta de dueño de la plataforma NUNCA se otorga por registro (antes se
  // decidía por el correo, sin verificarlo: si esa cuenta se borraba, cualquiera
  // podía registrarla y quedar como dueño). Se marca a mano en la base de datos:
  //   UPDATE profiles SET es_dueño = 1 WHERE email = '...';
  const esDueño = 0;

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
  const token = texto(body?.token, 200);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!token) return json({ ok: false, error: 'Falta el token de invitación' }, origin, { status: 400 });
  if (!(await permitir(env, `invite:ip:${ipDe(request)}`, 10, 3600))) return demasiadosIntentos(origin, 3600);
  const malaClave = contraseñaInvalida(password);
  if (malaClave) return json({ ok: false, error: malaClave }, origin, { status: 400 });

  const tokenHash = await sha256Hex(token);
  const invite = await env.DB.prepare(
    `SELECT * FROM invite_tokens WHERE token_hash = ? AND used = 0 AND expires_at > ${AHORA_SQL}`
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
  const email = texto(body?.email, 254).toLowerCase();
  const password = typeof body?.password === 'string' ? body.password.slice(0, 200) : '';
  if (!email || !password) return json({ ok: false, error: 'Completa correo y contraseña' }, origin, { status: 400 });

  // Freno a la fuerza bruta: por (correo + IP), por IP y por correo en total.
  const ip = ipDe(request);
  const claveCorreoIp = `login:${email}:${ip}`;
  if (
    !(await permitir(env, claveCorreoIp, 8, 900)) ||
    !(await permitir(env, `login:ip:${ip}`, 40, 900)) ||
    !(await permitir(env, `login:email:${email}`, 60, 3600))
  ) return demasiadosIntentos(origin);

  const user = await env.DB.prepare('SELECT id, password_hash, password_salt FROM profiles WHERE email = ?')
    .bind(email)
    .first<{ id: string; password_hash: string; password_salt: string }>();
  if (!user) {
    await hashPassword(password); // mismo costo que un login real: el tiempo de respuesta no delata qué correos existen
    return json({ ok: false, error: 'Correo o contraseña incorrectos' }, origin, { status: 401 });
  }

  const valido = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valido) return json({ ok: false, error: 'Correo o contraseña incorrectos' }, origin, { status: 401 });

  await olvidar(env, claveCorreoIp);
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
  const email = texto(body?.email, 254).toLowerCase();
  if (!email) return json({ ok: false, error: 'Escribe tu correo' }, origin, { status: 400 });
  // Sin esto se podía usar para llenar de correos la bandeja de cualquiera (y gastar el cupo de Resend).
  if (!(await permitir(env, `forgot:ip:${ipDe(request)}`, 5, 3600)) || !(await permitir(env, `forgot:email:${email}`, 3, 3600))) {
    return json({ ok: true }, origin); // respuesta idéntica: no se revela nada
  }

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
  const token = texto(body?.token, 200);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!token) return json({ ok: false, error: 'Falta el token' }, origin, { status: 400 });
  if (!(await permitir(env, `reset:ip:${ipDe(request)}`, 10, 3600))) return demasiadosIntentos(origin, 3600);
  const malaClave = contraseñaInvalida(password);
  if (malaClave) return json({ ok: false, error: malaClave }, origin, { status: 400 });

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND used = 0 AND expires_at > ${AHORA_SQL}`
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

async function limpiarVencidos(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= ${AHORA_SQL}`),
    env.DB.prepare(`DELETE FROM password_reset_tokens WHERE used = 1 OR expires_at <= ${AHORA_SQL}`),
    env.DB.prepare(`DELETE FROM invite_tokens WHERE used = 1 OR expires_at <= ${AHORA_SQL}`),
    env.DB.prepare(`DELETE FROM admin_login_pendiente WHERE expires_at <= ${AHORA_SQL}`),
    env.DB.prepare('DELETE FROM rate_limits WHERE ventana_inicio < ?').bind(Math.floor(Date.now() / 1000) - 86400),
  ]);
}

// ---------- router ----------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') return preflight(origin);

    // Defensa contra CSRF y contra WebSockets desde otras páginas: la app y la
    // API son el mismo origen, así que cualquier petición que declare venir de
    // otro sitio se rechaza. (Además la cookie es SameSite=Strict.)
    if (origin && origin !== url.origin) {
      return json({ ok: false, error: 'Origen no permitido' }, null, { status: 403 });
    }
    // Los cuerpos siempre son JSON: exigirlo evita que un formulario de otro
    // sitio ("text/plain") le pegue a la API sin pasar por la revisión previa del navegador.
    if (['POST', 'PUT', 'PATCH'].includes(request.method) && !(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
      return json({ ok: false, error: 'Tipo de contenido no permitido' }, null, { status: 415 });
    }

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
      'PUT /api/tratamiento': pacientes.guardarTratamiento,
      'PUT /api/registros/fin': pacientes.sacarParche,

      'GET /api/juego': juego.obtenerJuego,
      'PUT /api/juego': juego.guardarJuego,
      'PUT /api/juego-minutos': juego.guardarJuegoMinutos,

      'GET /api/personas': cuenta.listarPersonas,
      'PATCH /api/me': cuenta.actualizarMiNombre,
      'POST /api/invitar': cuenta.invitarPersona,
      'POST /api/canjear-codigo': cuenta.canjearCodigo,

      'GET /api/codigos': cuenta.listarCodigos,
      'POST /api/codigos': cuenta.generarCodigo,

      'POST /api/push-subscriptions': cuenta.guardarPushSubscription,
      'DELETE /api/push-subscriptions': cuenta.eliminarPushSubscription,

      'GET /api/admin/me': admin.adminMe,
      'POST /api/admin/logout': admin.adminLogout,
      'POST /api/admin/login': admin.loginPaso1,
      'POST /api/admin/verify-otp': admin.loginPaso2,
      'GET /api/admin/stats': admin.estadisticas,
      'GET /api/admin/clientes': admin.listarClientes,
      'DELETE /api/admin/cuentas': admin.eliminarCuenta,
      'GET /api/admin/pacientes': admin.listarPacientesDeCuenta,
      'PATCH /api/admin/pacientes': admin.actualizarAvatarComoAdmin,
      'GET /api/admin/solicitudes': admin.listarSolicitudes,
      'POST /api/admin/solicitudes': admin.crearSolicitud,
      'POST /api/admin/solicitudes/atender': admin.atenderSolicitud,
      'POST /api/admin/solicitudes/rechazar': admin.rechazarSolicitud,
      'DELETE /api/admin/codigos': admin.eliminarCodigo,
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
    // Una vez por hora: borra sesiones, tokens y contadores vencidos (si no,
    // las tablas crecen para siempre).
    if (new Date().getUTCMinutes() === 0) ctx.waitUntil(limpiarVencidos(env).catch((e) => console.error('[cron] limpieza falló', e)));
    // Control con el oftalmólogo y resumen semanal: no hace falta cada minuto, cada 10 alcanza.
    if (new Date().getUTCMinutes() % 10 === 0) {
      ctx.waitUntil(
        revisarTratamiento(env)
          .then((r) => console.log('[cron] tratamiento:', r))
          .catch((e) => console.error('[cron] tratamiento falló', e))
      );
    }
    ctx.waitUntil(
      revisarYAvisar(env)
        .then((r) => console.log('[cron] avisos enviados:', r.avisos))
        .catch((e) => console.error('[cron] error', e))
    );
  },
};
