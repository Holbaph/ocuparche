// api.js — envoltorio delgado de fetch() para hablar con la API. Manda
// siempre la cookie de sesión (credentials: 'include' — sigue haciendo falta
// aunque sea el mismo origen, es el comportamiento por defecto de fetch) y
// devuelve el cuerpo ya parseado.
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* respuesta vacía */ }
  return { status: res.status, data };
}
