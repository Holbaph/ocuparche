// auth.ts — cookie de sesión y helper para exigir sesión en una ruta.
import { randomToken, sha256Hex } from './crypto';
import { AHORA_SQL } from './helpers';
import type { Env } from './types';

// "__Host-" obliga al navegador a aceptar la cookie solo si es Secure, de
// Path=/ y sin Domain: ningún subdominio ni sitio hermano puede pisarla.
// SameSite=Strict: la app y la API son el mismo sitio, así que la cookie
// nunca viaja en peticiones que empiezan en otra página (defensa contra CSRF).
const COOKIE_NAME = '__Host-oc_session';
const SESSION_DIAS = 30;
const SESSION_ADMIN_HORAS = 8; // el panel de administrador dura mucho menos

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
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
// pone en true; esas sesiones valen para /api/admin/* y duran 8 horas.
export async function crearSesion(env: Env, userId: string, admin2fa = false): Promise<{ token: string; cookie: string }> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const segundos = admin2fa ? SESSION_ADMIN_HORAS * 3600 : SESSION_DIAS * 86400;
  const expiresAt = new Date(Date.now() + segundos * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, admin_2fa) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, userId, expiresAt, admin2fa ? 1 : 0)
    .run();
  return { token, cookie: sessionCookie(token, segundos) };
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

export async function perfilDesdeSesion(request: Request, env: Env): Promise<Perfil | null> {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT p.id, p.cuenta_id, p.email, p.nombre, p.role, p.es_dueño, s.admin_2fa
     FROM sessions s JOIN profiles p ON p.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ${AHORA_SQL}`
  ).bind(tokenHash).first<Perfil>();
  return row ?? null;
}

export async function cerrarSesion(request: Request, env: Env): Promise<void> {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}
