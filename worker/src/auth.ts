// auth.ts — cookies de sesión y helper para exigir sesión en una ruta.
import { randomToken, sha256Hex } from './crypto';
import { AHORA_SQL } from './helpers';
import type { Env } from './types';

// "__Host-" obliga al navegador a aceptar la cookie solo si es Secure, de
// Path=/ y sin Domain: ningún subdominio ni sitio hermano puede pisarla.
// SameSite=Strict: la app y la API son el mismo sitio, así que la cookie
// nunca viaja en peticiones que empiezan en otra página (defensa contra CSRF).
//
// Hay DOS cookies distintas: la de la app familiar y la del panel de
// administrador. Así el dueño puede tener el panel abierto y usar su propia
// cuenta de cliente en el mismo navegador sin que una sesión pise a la otra
// (antes compartían cookie: entrar a la cuenta cliente dejaba el panel sin
// permisos y mostrando datos viejos).
const COOKIE_APP = '__Host-oc_session';
const COOKIE_ADMIN = '__Host-oc_admin';
const SESSION_DIAS = 30;
const SESSION_ADMIN_HORAS = 8; // el panel de administrador dura mucho menos

const nombreCookie = (admin: boolean) => (admin ? COOKIE_ADMIN : COOKIE_APP);

export function sessionCookie(token: string, maxAgeSeconds: number, admin = false): string {
  return `${nombreCookie(admin)}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(admin = false): string {
  return `${nombreCookie(admin)}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

// admin2fa: solo el paso 2 del login del panel (código del authenticator) lo
// pone en true; esas sesiones viajan en la cookie del panel, valen solo para
// /api/admin/* y duran 8 horas.
export async function crearSesion(env: Env, userId: string, admin2fa = false): Promise<{ token: string; cookie: string }> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const segundos = admin2fa ? SESSION_ADMIN_HORAS * 3600 : SESSION_DIAS * 86400;
  const expiresAt = new Date(Date.now() + segundos * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, admin_2fa) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, userId, expiresAt, admin2fa ? 1 : 0)
    .run();
  return { token, cookie: sessionCookie(token, segundos, admin2fa) };
}

export type Perfil = {
  id: string;
  cuenta_id: string;
  email: string;
  nombre: string;
  role: string;
  es_dueño: number;
  admin_2fa: number; // 1 = sesión del panel de administrador (pasó el authenticator)
};

// admin=false: sesión de la app familiar. admin=true: sesión del panel (solo
// vale si pasó el authenticator).
export async function perfilDesdeSesion(request: Request, env: Env, admin = false): Promise<Perfil | null> {
  const token = getCookie(request, nombreCookie(admin));
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT p.id, p.cuenta_id, p.email, p.nombre, p.role, p.es_dueño, s.admin_2fa
     FROM sessions s JOIN profiles p ON p.id = s.user_id
     WHERE s.token_hash = ? AND s.admin_2fa = ? AND s.expires_at > ${AHORA_SQL}`
  ).bind(tokenHash, admin ? 1 : 0).first<Perfil>();
  return row ?? null;
}

export async function cerrarSesion(request: Request, env: Env, admin = false): Promise<void> {
  const token = getCookie(request, nombreCookie(admin));
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}
