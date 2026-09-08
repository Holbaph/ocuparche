// cors.ts — la cookie de sesión viaja "cross-site" mientras el frontend siga
// en GitHub Pages y la API en Workers, así que el origen permitido debe ser
// exacto (nunca "*") para que el navegador acepte enviar/recibir la cookie.
// Agrega aquí cualquier otro origen desde el que se abra la app.
const ALLOWED_ORIGINS = [
  'https://holbaph.github.io',
  'http://localhost:5501',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
];

export function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export function json(data: unknown, origin: string | null, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

export function preflight(origin: string | null): Response {
  return new Response(null, { headers: corsHeaders(origin) });
}
