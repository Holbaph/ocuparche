// totp.ts — TOTP (RFC 6238) para el segundo factor del panel de
// administrador. No depende de que llegue ningún correo: el código se
// genera en el celular con Google Authenticator, Authy, 1Password,
// Microsoft Authenticator, etc., sincronizado por tiempo con el servidor.
// Todo con Web Crypto (HMAC-SHA1) — SHA-1 es "débil" para otros usos, pero
// es el algoritmo que exige el estándar TOTP y el que entienden todas las
// apps de autenticación.

const BASE32_ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PASO_SEGUNDOS = 30;
const DIGITOS = 6;

export function generarSecretoBase32(bytesLen = 20): string {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesLen));
  return base32Encode(bytes);
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALFABETO[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALFABETO[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(b32: string): Uint8Array {
  const limpio = b32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of limpio) {
    const idx = BASE32_ALFABETO.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function hotp(secret: Uint8Array, contador: number): Promise<string> {
  // El contador entra en los 4 bytes bajos de un bloque de 8 (RFC 4226) —
  // con pasos de 30s alcanza para miles de millones de años, así que 32
  // bits de contador sobran de sobra.
  const buf = new ArrayBuffer(8);
  new DataView(buf).setUint32(4, contador, false);

  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const firma = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));

  const offset = firma[firma.length - 1] & 0x0f;
  const binCode =
    ((firma[offset] & 0x7f) << 24) |
    ((firma[offset + 1] & 0xff) << 16) |
    ((firma[offset + 2] & 0xff) << 8) |
    (firma[offset + 3] & 0xff);
  return (binCode % 10 ** DIGITOS).toString().padStart(DIGITOS, '0');
}

// Verifica un código de 6 dígitos contra el secreto, con una ventana de
// ±1 paso (30s) para tolerar que el reloj del celular ande un poco
// desfasado del servidor.
// Devuelve el número de paso (ventana de 30 s) que coincidió, o null si el código no vale — quien llama
// guarda ese paso para no aceptar el mismo código dos veces.
export async function verificarTotp(secretBase32: string, codigo: string, ventana = 1): Promise<number | null> {
  const secret = base32Decode(secretBase32);
  const paso = Math.floor(Date.now() / 1000 / PASO_SEGUNDOS);
  const limpio = codigo.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(limpio)) return null;
  for (let i = -ventana; i <= ventana; i++) {
    const esperado = await hotp(secret, paso + i);
    if (esperado === limpio) return paso + i;
  }
  return null;
}

// URI estándar otpauth:// — algunas apps de escritorio permiten pegarlo
// directo en vez de escribir la clave a mano.
export function otpauthUri(secretBase32: string, email: string): string {
  const label = encodeURIComponent(`Ocuparche:${email}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=Ocuparche&digits=${DIGITOS}&period=${PASO_SEGUNDOS}`;
}
