// config.js — la app y la API viven en el mismo dominio (Cloudflare sirve
// ambas), así que no hace falta ninguna URL base: todo es relativo ("/api/...").
//
// La llave pública de avisos SÍ es necesaria en el navegador (es pública por
// diseño, como una anon key) — la privada vive solo como secreto del Worker.
const VAPID_PUBLIC_KEY = 'BEUIx-yvhClZrEycUcL8fssCAjPBK337FgYDA3PqjeVktk8ccpqjXCnKRnmC61c4_tpuDMnexV_VLYpMZ4On8AQ';
const PUSH_CONFIGURADO = true;
