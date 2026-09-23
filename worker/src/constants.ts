// La app ya se sirve desde el mismo Worker que la API (Workers Static
// Assets) — no desde GitHub Pages, que solo aloja la landing. Ojo si vuelve
// a cambiar de dominio: los links de recuperar contraseña e invitación
// usan esta constante.
export const APP_URL = 'https://ocuparche-api.pablo-hernandez003.workers.dev/app.html';
