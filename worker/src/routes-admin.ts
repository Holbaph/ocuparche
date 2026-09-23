// routes-admin.ts — panel de administrador de PLATAFORMA (dueño del
// negocio), completamente aparte de la app familiar: login propio en dos
// pasos, estadísticas, lista de clientes y cola de solicitudes de
// activación. Cada ruta comprueba es_dueño por su cuenta — no alcanza con
// ocultar el botón en el frontend, y esto es lo único que protege datos de
// TODOS los clientes, así que ninguna ruta nueva puede saltarse el chequeo.
import { json } from './cors';
import { perfilDesdeSesion, crearSesion } from './auth';
import { verifyPassword, randomCodigoActivacion } from './crypto';
import { enviarCorreo, correoCodigoActivacion } from './email';
import { generarSecretoBase32, verificarTotp, otpauthUri } from './totp';
import { uuid, readJson } from './helpers';
import type { Env } from './types';

type Handler = (request: Request, env: Env, origin: string | null) => Promise<Response>;

const PENDIENTE_MINUTOS = 10;
const MAX_INTENTOS = 5;

async function exigirDueño(request: Request, env: Env) {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return { error: 'No autenticado' as const, status: 401 as const };
  if (!perfil.es_dueño) return { error: 'No autorizado' as const, status: 403 as const };
  return { perfil };
}

// ---------- login del panel, paso 1: correo + contraseña ----------
// Si son correctos pero la cuenta no es la del dueño, respondemos el mismo
// error genérico que si estuvieran mal — así este login no sirve para
// confirmar si un correo existe o qué rol tiene.
//
// El segundo factor es TOTP (Google Authenticator y similares), no un
// código por correo — no depende de que Resend entregue nada. La primera
// vez que alguien pasa este paso 1 (o si nunca terminó de configurar el
// authenticator) se genera/reusa el secreto y se manda junto con la
// respuesta para armar la cuenta en la app; esto es seguro porque solo
// pasa DESPUÉS de comprobar la contraseña.
export const loginPaso1: Handler = async (request, env, origin) => {
  const body = await readJson<{ email?: string; password?: string }>(request);
  const email = (body?.email || '').trim().toLowerCase();
  const password = body?.password || '';
  const credencialesInvalidas = () => json({ ok: false, error: 'Correo o contraseña incorrectos' }, origin, { status: 401 });
  if (!email || !password) return credencialesInvalidas();

  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, password_salt, es_dueño, totp_secret, totp_confirmado FROM profiles WHERE email = ?'
  ).bind(email).first<{
    id: string; email: string; password_hash: string; password_salt: string;
    es_dueño: number; totp_secret: string | null; totp_confirmado: number;
  }>();
  if (!user || !user.es_dueño) return credencialesInvalidas();

  const valido = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valido) return credencialesInvalidas();

  const pendienteId = uuid();
  const expiresAt = new Date(Date.now() + PENDIENTE_MINUTOS * 60000).toISOString();
  await env.DB.prepare(
    'INSERT INTO admin_login_pendiente (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(pendienteId, user.id, expiresAt).run();

  if (!user.totp_secret || !user.totp_confirmado) {
    let secreto = user.totp_secret;
    if (!secreto) {
      secreto = generarSecretoBase32();
      await env.DB.prepare('UPDATE profiles SET totp_secret = ? WHERE id = ?').bind(secreto, user.id).run();
    }
    return json({
      ok: true, pendiente: pendienteId, configurarTotp: true,
      secreto, otpauth: otpauthUri(secreto, user.email),
    }, origin);
  }

  return json({ ok: true, pendiente: pendienteId, configurarTotp: false }, origin);
};

// ---------- login del panel, paso 2: código del authenticator ----------
export const loginPaso2: Handler = async (request, env, origin) => {
  const body = await readJson<{ pendiente?: string; codigo?: string }>(request);
  const pendienteId = (body?.pendiente || '').trim();
  const codigo = (body?.codigo || '').trim();
  if (!pendienteId || !codigo) return json({ ok: false, error: 'Faltan datos' }, origin, { status: 400 });

  const row = await env.DB.prepare(
    `SELECT ap.id, ap.user_id, ap.intentos, p.totp_secret
     FROM admin_login_pendiente ap JOIN profiles p ON p.id = ap.user_id
     WHERE ap.id = ? AND ap.expires_at > datetime('now')`
  ).bind(pendienteId).first<{ id: string; user_id: string; intentos: number; totp_secret: string | null }>();
  if (!row || !row.totp_secret) return json({ ok: false, error: 'La sesión de login venció — vuelve a iniciar sesión' }, origin, { status: 400 });

  if (row.intentos >= MAX_INTENTOS) {
    await env.DB.prepare('DELETE FROM admin_login_pendiente WHERE id = ?').bind(row.id).run();
    return json({ ok: false, error: 'Demasiados intentos — vuelve a iniciar sesión' }, origin, { status: 400 });
  }

  const valido = await verificarTotp(row.totp_secret, codigo);
  if (!valido) {
    await env.DB.prepare('UPDATE admin_login_pendiente SET intentos = intentos + 1 WHERE id = ?').bind(row.id).run();
    return json({ ok: false, error: 'Código incorrecto' }, origin, { status: 400 });
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_login_pendiente WHERE id = ?').bind(row.id),
    env.DB.prepare('UPDATE profiles SET totp_confirmado = 1 WHERE id = ?').bind(row.user_id),
  ]);
  const { cookie } = await crearSesion(env, row.user_id);
  return json({ ok: true }, origin, { headers: { 'Set-Cookie': cookie } });
};

// ---------- estadísticas ----------
export const estadisticas: Handler = async (request, env, origin) => {
  const chequeo = await exigirDueño(request, env);
  if ('error' in chequeo) return json({ ok: false, error: chequeo.error }, origin, { status: chequeo.status });

  const row = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM cuentas) as total_cuentas,
      (SELECT COUNT(*) FROM cuentas WHERE plan = 'completo') as cuentas_completo,
      (SELECT COUNT(*) FROM profiles) as total_personas,
      (SELECT COUNT(*) FROM profiles WHERE role = 'admin') as total_admins,
      (SELECT COUNT(*) FROM profiles WHERE role = 'user') as total_users,
      (SELECT COUNT(*) FROM pacientes) as total_pacientes,
      (SELECT COUNT(*) FROM registros) as total_registros,
      (SELECT COUNT(*) FROM codigos_activacion WHERE usado = 0) as codigos_libres,
      (SELECT COUNT(*) FROM solicitudes_codigo WHERE estado = 'pendiente') as solicitudes_pendientes
  `).first();

  return json({ ok: true, stats: row }, origin);
};

// ---------- lista de clientes ----------
export const listarClientes: Handler = async (request, env, origin) => {
  const chequeo = await exigirDueño(request, env);
  if ('error' in chequeo) return json({ ok: false, error: chequeo.error }, origin, { status: chequeo.status });

  const { results } = await env.DB.prepare(`
    SELECT
      c.id, c.plan, c.activado_en, c.created_at,
      p.nombre as admin_nombre, p.email as admin_email,
      (SELECT COUNT(*) FROM pacientes WHERE cuenta_id = c.id) as num_pacientes,
      (SELECT COUNT(*) FROM profiles WHERE cuenta_id = c.id) as num_personas
    FROM cuentas c
    LEFT JOIN profiles p ON p.id = c.admin_id
    ORDER BY c.created_at DESC
    LIMIT 500
  `).all();

  return json({ ok: true, clientes: results }, origin);
};

// Borra una cuenta cliente completa: sus pacientes, registros, personas
// invitadas, sesiones, todo. D1/SQLite no aplica ON DELETE CASCADE salvo
// que se active la pragma foreign_keys — se borra a mano en el orden
// correcto, todo junto en un solo batch. No se puede usar para borrar la
// cuenta propia del dueño (ni por accidente ni con el panel abierto).
export const eliminarCuenta: Handler = async (request, env, origin) => {
  const chequeo = await exigirDueño(request, env);
  if ('error' in chequeo) return json({ ok: false, error: chequeo.error }, origin, { status: chequeo.status });
  const perfil = chequeo.perfil;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ ok: false, error: 'Falta el id' }, origin, { status: 400 });
  if (id === perfil.cuenta_id) {
    return json({ ok: false, error: 'No puedes eliminar tu propia cuenta desde acá' }, origin, { status: 400 });
  }

  const cuenta = await env.DB.prepare('SELECT id FROM cuentas WHERE id = ?').bind(id).first();
  if (!cuenta) return json({ ok: false, error: 'No existe esa cuenta' }, origin, { status: 404 });

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM registros WHERE paciente_id IN (SELECT id FROM pacientes WHERE cuenta_id = ?)`).bind(id),
    env.DB.prepare(`DELETE FROM configuracion WHERE paciente_id IN (SELECT id FROM pacientes WHERE cuenta_id = ?)`).bind(id),
    env.DB.prepare('DELETE FROM pacientes WHERE cuenta_id = ?').bind(id),
    env.DB.prepare('DELETE FROM invite_tokens WHERE cuenta_id = ?').bind(id),
    env.DB.prepare(`DELETE FROM push_subscriptions WHERE user_id IN (SELECT id FROM profiles WHERE cuenta_id = ?)`).bind(id),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM profiles WHERE cuenta_id = ?)`).bind(id),
    env.DB.prepare(`DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM profiles WHERE cuenta_id = ?)`).bind(id),
    env.DB.prepare(`DELETE FROM admin_login_pendiente WHERE user_id IN (SELECT id FROM profiles WHERE cuenta_id = ?)`).bind(id),
    env.DB.prepare('UPDATE codigos_activacion SET usado_por_cuenta = NULL WHERE usado_por_cuenta = ?').bind(id),
    env.DB.prepare('DELETE FROM profiles WHERE cuenta_id = ?').bind(id),
    env.DB.prepare('DELETE FROM cuentas WHERE id = ?').bind(id),
  ]);

  return json({ ok: true }, origin);
};

// ---------- cola de solicitudes de activación ----------
export const listarSolicitudes: Handler = async (request, env, origin) => {
  const chequeo = await exigirDueño(request, env);
  if ('error' in chequeo) return json({ ok: false, error: chequeo.error }, origin, { status: chequeo.status });

  const { results } = await env.DB.prepare(`
    SELECT id, nombre, email, nota, estado, codigo, created_at, atendida_en
    FROM solicitudes_codigo
    ORDER BY (estado = 'pendiente') DESC, created_at DESC
    LIMIT 300
  `).all();

  return json({ ok: true, solicitudes: results }, origin);
};

// Carga manual — para cuando el aviso de la transferencia llega por correo o
// WhatsApp y no por un formulario. Queda en la cola para no perderla de vista.
export const crearSolicitud: Handler = async (request, env, origin) => {
  const chequeo = await exigirDueño(request, env);
  if ('error' in chequeo) return json({ ok: false, error: chequeo.error }, origin, { status: chequeo.status });

  const body = await readJson<{ nombre?: string; email?: string; nota?: string }>(request);
  const nombre = (body?.nombre || '').trim();
  const email = (body?.email || '').trim().toLowerCase();
  const nota = (body?.nota || '').trim();
  if (!nombre || !email) return json({ ok: false, error: 'Falta nombre o correo' }, origin, { status: 400 });

  await env.DB.prepare('INSERT INTO solicitudes_codigo (id, nombre, email, nota) VALUES (?, ?, ?, ?)')
    .bind(uuid(), nombre, email, nota || null).run();
  return json({ ok: true }, origin);
};

// Genera el código, lo asocia a la solicitud y se lo manda por correo al
// cliente — cierra el ciclo completo después de que revisaste la cuenta
// bancaria a mano.
export const atenderSolicitud: Handler = async (request, env, origin) => {
  const chequeo = await exigirDueño(request, env);
  if ('error' in chequeo) return json({ ok: false, error: chequeo.error }, origin, { status: chequeo.status });
  const perfil = chequeo.perfil;

  const body = await readJson<{ id?: string }>(request);
  const id = (body?.id || '').trim();
  if (!id) return json({ ok: false, error: 'Falta el id' }, origin, { status: 400 });

  const solicitud = await env.DB.prepare('SELECT id, nombre, email, estado FROM solicitudes_codigo WHERE id = ?')
    .bind(id).first<{ id: string; nombre: string; email: string; estado: string }>();
  if (!solicitud) return json({ ok: false, error: 'No existe esa solicitud' }, origin, { status: 404 });
  if (solicitud.estado !== 'pendiente') return json({ ok: false, error: 'Esa solicitud ya se atendió' }, origin, { status: 400 });

  const codigo = randomCodigoActivacion();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO codigos_activacion (id, codigo, nota, creado_por) VALUES (?, ?, ?, ?)')
      .bind(uuid(), codigo, `${solicitud.nombre} (${solicitud.email})`, perfil.id),
    env.DB.prepare(`UPDATE solicitudes_codigo SET estado = 'atendida', codigo = ?, atendida_en = datetime('now') WHERE id = ?`)
      .bind(codigo, id),
  ]);

  const enviado = await enviarCorreo(env, solicitud.email, '¡Tu Ocuparche completo ya está listo! 🎉', correoCodigoActivacion(codigo));
  return json({ ok: true, codigo, enviado }, origin);
};

export const rechazarSolicitud: Handler = async (request, env, origin) => {
  const chequeo = await exigirDueño(request, env);
  if ('error' in chequeo) return json({ ok: false, error: chequeo.error }, origin, { status: chequeo.status });

  const body = await readJson<{ id?: string }>(request);
  const id = (body?.id || '').trim();
  if (!id) return json({ ok: false, error: 'Falta el id' }, origin, { status: 400 });

  await env.DB.prepare(
    `UPDATE solicitudes_codigo SET estado = 'rechazada', atendida_en = datetime('now') WHERE id = ? AND estado = 'pendiente'`
  ).bind(id).run();
  return json({ ok: true }, origin);
};

// ---------- limpieza de códigos de activación ----------
// Para ir borrando los que se generaron de prueba. No tiene nada que
// dependa de él (nada referencia codigos_activacion), así que es un DELETE
// directo, usado o no.
export const eliminarCodigo: Handler = async (request, env, origin) => {
  const chequeo = await exigirDueño(request, env);
  if ('error' in chequeo) return json({ ok: false, error: chequeo.error }, origin, { status: chequeo.status });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ ok: false, error: 'Falta el id' }, origin, { status: 400 });
  await env.DB.prepare('DELETE FROM codigos_activacion WHERE id = ?').bind(id).run();
  return json({ ok: true }, origin);
};
