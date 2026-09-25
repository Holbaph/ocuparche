// sw-register.js — registra el service worker. Vive en un archivo aparte (y no
// como <script> dentro de app.html) para que la política de seguridad de
// contenido (CSP, ver _headers) no necesite permitir scripts en línea.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
