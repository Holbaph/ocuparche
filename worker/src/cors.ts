// cors.ts — la app y la API se sirven desde el MISMO origen (Workers Static
// Assets), así que no hace falta CORS: no se devuelve ningún
// Access-Control-Allow-Origin y los navegadores bloquean cualquier página de
// otro sitio que intente leer la API. (Antes se permitía github.io con
// credenciales y la cookie era SameSite=None: eso abría la puerta a CSRF.)

const SEGURIDAD: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store', // respuestas con datos personales: que no queden en cachés
  'Referrer-Policy': 'no-referrer',
};

export function corsHeaders(_origin: string | null): HeadersInit {
  return { Vary: 'Origin' };
}

export function json(data: unknown, origin: string | null, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...corsHeaders(origin), ...SEGURIDAD, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

// Sin CORS no hay nada que negociar: la petición "preflight" de otro origen
// simplemente no recibe permisos.
export function preflight(_origin: string | null): Response {
  return new Response(null, { status: 204, headers: { ...SEGURIDAD } });
}
