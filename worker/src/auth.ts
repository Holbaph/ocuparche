// auth.ts — cookie de sesión y helper para exigir sesión en una ruta.
import { randomToken, sha256Hex } from './crypto';
import type { Env } from './types';

const COOKIE_NAME = 'oc_session';
const SESSION_DIAS = 30;

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  // SameSite=None + Secure: la cookie viaja "cross-site" mientras el
  // frontend (GitHub Pages) y la API (Workers) sean orígenes distintos.
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
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

export async function crearSesion(env: Env, userId: string): Promise<{ token: string; cookie: string }> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DIAS * 86400000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, userId, expiresAt)
    .run();
  return { token, cookie: sessionCookie(token, SESSION_DIAS * 86400) };
}

export type Perfil = {
  id: string;
  cuenta_id: string;
  email: string;
  nombre: string;
  role: string;
  es_dueño: number;
};

export async function perfilDesdeSesion(request: Request, env: Env): Promise<Perfil | null> {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT p.id, p.cuenta_id, p.email, p.nombre, p.role, p.es_dueño
     FROM sessions s JOIN profiles p ON p.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
  ).bind(tokenHash).first<Perfil>();
  return row ?? null;
}

export async function cerrarSesion(request: Request, env: Env): Promise<void> {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}
