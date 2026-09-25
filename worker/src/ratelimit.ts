// ratelimit.ts — límite de intentos por ventana fija, guardado en D1. Frena
// la fuerza bruta de contraseñas, códigos de activación y códigos TOTP, y el
// abuso de los endpoints que mandan correos. Sin Workers KV ni servicios
// pagos: una fila por clave.
import { json } from './cors';
import type { Env } from './types';

// Cuenta este intento y dice si todavía está permitido. Es una sola
// sentencia SQL (atómica), así que dos peticiones simultáneas no se pasan de largo.
export async function permitir(env: Env, clave: string, max: number, ventanaSeg: number): Promise<boolean> {
  const ahora = Math.floor(Date.now() / 1000);
  const fila = await env.DB.prepare(
    `INSERT INTO rate_limits (clave, ventana_inicio, intentos) VALUES (?1, ?2, 1)
     ON CONFLICT(clave) DO UPDATE SET
       intentos = CASE WHEN ventana_inicio + ?3 <= ?2 THEN 1 ELSE intentos + 1 END,
       ventana_inicio = CASE WHEN ventana_inicio + ?3 <= ?2 THEN ?2 ELSE ventana_inicio END
     RETURNING intentos`
  ).bind(clave, ahora, ventanaSeg).first<{ intentos: number }>();
  return (fila?.intentos ?? 1) <= max;
}

export async function olvidar(env: Env, clave: string): Promise<void> {
  await env.DB.prepare('DELETE FROM rate_limits WHERE clave = ?').bind(clave).run();
}

export function ipDe(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'sin-ip';
}

export function demasiadosIntentos(origin: string | null, segundos = 900): Response {
  return json({ ok: false, error: 'Demasiados intentos. Espera unos minutos y vuelve a intentar.' }, origin, {
    status: 429,
    headers: { 'Retry-After': String(segundos) },
  });
}
