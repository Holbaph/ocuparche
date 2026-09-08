# Ocuparche

App web (PWA) para que familias registren y sigan la constancia del tratamiento
de parche ocular de sus hij@s — multi-cuenta y freemium.

**Arquitectura 100% Cloudflare** (Workers + D1 + Durable Objects + Cron
Triggers), gratis, con un backend propio (nada de Supabase — se migró después
de toparse con el límite de proyectos gratis y decidir no pagar por un
servicio que todavía no genera ingresos). El único servicio externo a
Cloudflare es **Resend**, para los correos de invitación y recuperar
contraseña (Cloudflare no ofrece envío de correo de propósito general).

- **Landing** (marketing, precios, legales): **https://holbaph.github.io/ocuparche/**
  — sigue en GitHub Pages, no necesita sesión ni cookies.
- **App** (login + dashboard): **https://ocuparche-api.pablo-hernandez003.workers.dev/app.html**
  — la sirve el mismo Worker que la API, a propósito: si la app y la API
  vivieran en dominios distintos, Safari (iOS) bloquea la cookie de sesión
  por ser "de otro sitio".

## Estado del proyecto

Completo y probado de punta a punta (con clientes reales — WebSocket, fetch,
firma criptográfica de verdad — no solo con curl):

- [x] Landing, Privacidad, Términos — precio ($3.500 CLP) y correo
      (`ocuparche@gmail.com`) reales.
- [x] Base de datos D1 multi-cuenta, sin RLS (cada ruta comprueba a mano la
      pertenencia a la cuenta — probado que una cuenta no puede tocar los
      datos de otra).
- [x] Auth propia: contraseñas con PBKDF2, sesiones por cookie, recuperar
      contraseña e invitaciones por correo (Resend).
- [x] Multi-paciente, freemium (1 hij@ gratis; ilimitados + temporizador +
      avisos + hasta 3 personas invitadas con el plan completo).
- [x] Códigos de activación de un solo uso (panel para generarlos, solo
      visible para el dueño del negocio).
- [x] Sincronización en vivo entre dispositivos (Durable Objects + WebSocket).
- [x] Aviso automático por push cuando se cumple el tiempo del parche (Cron
      Triggers, cada minuto).
- [x] App conectada de verdad a esta API (ya no a Supabase) y desplegada en
      producción.

## Cómo generar y entregar un código de activación

1. Alguien te escribe (botón "Solicitar acceso completo" en la landing) con
   su nombre, correo y el comprobante de la transferencia.
2. Verificas el pago.
3. Entras a la app con tu cuenta (el correo marcado como dueño) →
   **Historial → Generar códigos de activación** → escribe una nota (ej. el
   nombre de la persona) → **Generar**.
4. Le mandas ese código por correo — lo pone en **Historial → Tu cuenta →
   Activar**, y su cuenta queda con el plan completo para siempre.

## Desarrollo

Todo el backend vive en `worker/` (es su propio proyecto de Node/TypeScript).

```powershell
cd worker
npm install
npx wrangler dev              # local, con D1 emulado
npx wrangler dev --test-scheduled   # además permite probar el cron a mano:
# curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

### Desplegar cambios

```powershell
cd worker
npx wrangler deploy
```

Eso publica tanto la API (`/api/*`) como la app estática (`public/`) — son el
mismo Worker. Un `git push` normal actualiza la landing en GitHub Pages, pero
**la app y la API solo se actualizan con `wrangler deploy`**.

### Configurar desde cero (otro proyecto, u otra cuenta de Cloudflare)

1. `npx wrangler login`
2. `npx wrangler d1 create ocuparche` → copia el `database_id` a
   [`worker/wrangler.jsonc`](worker/wrangler.jsonc).
3. `npx wrangler d1 migrations apply ocuparche --remote`
4. Genera llaves VAPID propias: `npx @pushforge/builder vapid` — la pública
   va en [`worker/public/js/config.js`](worker/public/js/config.js)
   (`VAPID_PUBLIC_KEY`), la privada como secreto:
   `echo '<jwk>' | npx wrangler secret put VAPID_PRIVATE_KEY_JWK`
5. Crea una cuenta en [resend.com](https://resend.com), copia tu API key:
   `echo '<key>' | npx wrangler secret put RESEND_API_KEY`
6. `npx wrangler deploy`
7. Regístrate tú primero en la app, con **tu correo real**
   (`phernandez@softcorp.cl`) — el trigger de alta te deja marcado
   automáticamente como dueño del negocio, la única cuenta que ve el panel
   para generar códigos.

## Modelo de datos (resumen)

```
cuentas             — una por cada admin que se registra solo (plan free/completo)
profiles            — personas (admin o invitadas), ligadas a una cuenta
sessions            — sesiones activas (solo el hash del token, nunca el token real)
password_reset_tokens, invite_tokens — igual, solo hashes
pacientes           — hij@s en tratamiento, uno o varios por cuenta
registros           — un registro por paciente y día (qué ojo, hora)
configuracion       — duración del parche, por paciente
push_subscriptions  — dispositivos suscritos a avisos
codigos_activacion  — códigos de un solo uso que activan el plan completo
```

Plan gratis: 1 paciente, sin temporizador ni avisos, sin invitar a nadie.
Plan completo (pago único, vía código): pacientes ilimitados, temporizador,
avisos, hasta 3 personas invitadas por cuenta.

## Estructura del proyecto

```
index.html, privacidad.html, terminos.html   landing + legales (GitHub Pages)
css/tokens.css, css/landing.css              estilos de la landing
icons/                                        íconos de marca

worker/                          la app (API + frontend), Cloudflare
  wrangler.jsonc                  config: D1, Durable Object, cron
  migrations/                     esquema de la base de datos
  src/
    index.ts                      router HTTP + cron
    auth.ts, crypto.ts             sesiones, hash de contraseñas, tokens
    routes-cuenta.ts               personas, invitar, códigos
    routes-pacientes.ts            pacientes, registros, temporizador, WS
    PacienteRoom.ts                Durable Object (tiempo real)
    reminders.ts                   lógica del aviso automático
    email.ts                       correos vía Resend
  public/                         lo que sirve la app en sí
    app.html, css/, js/, manifest.json, sw.js, icons/
```

---
🩹
