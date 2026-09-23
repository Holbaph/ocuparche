// crypto.ts — hashing de contraseñas (PBKDF2) y tokens de sesión/recuperación.
// Nada de esto se guarda en texto plano: las contraseñas quedan como
// hash+sal, y los tokens (sesión, invitación, recuperar contraseña) se
// guardan como su hash SHA-256 — la cookie o el link llevan el valor real,
// la base de datos solo el hash. Así, ni con acceso directo a D1 se puede
// iniciar sesión como alguien ni reutilizar un link.

// El plan gratis de Workers da solo 10ms de CPU por solicitud (el plan
// pagado da 30s) — con menos iteraciones nos quedamos cómodos dentro de eso.
// Sigue siendo muchísimo más seguro que no tener hash, solo que no llega al
// estándar recomendado hoy para una app que maneje algo de más valor.
const PBKDF2_ITERATIONS = 50_000;

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToBuffer(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return { hash: bufferToBase64(bits), salt: bufferToBase64(salt.buffer) };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: base64ToBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return constantTimeEqual(bufferToBase64(bits), hash);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Token opaco al azar (para cookies de sesión, links de invitación/recuperación).
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bufferToBase64(bytes.buffer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Código de activación corto, fácil de dictar/escribir a mano.
export function randomCodigoActivacion(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusiones
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) out += alfabeto[b % alfabeto.length];
  return out;
}
