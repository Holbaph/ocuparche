# Ocuparche

App web (PWA) para que familias registren y sigan la constancia del tratamiento
de parche ocular de sus hij@s — multi-cuenta y freemium. Basada en el mismo
enfoque probado en [Ojitos de Mili](https://github.com/Holbaph/ojitos-de-mili):
HTML/CSS/JS puro + Supabase (Postgres + Auth + RLS + Edge Functions) + GitHub
Pages, sin costos de tienda ni mensualidades de infraestructura.

Publicada en: **https://holbaph.github.io/ocuparche/** (landing) y
**https://holbaph.github.io/ocuparche/app.html** (la app)

## Estado del proyecto

- [x] Landing page, Privacidad, Términos — con precio ($3.500 CLP) y correo
      (`ocuparche@gmail.com`) reales.
- [x] Esquema de base de datos multi-cuenta (`supabase/schema.sql`).
- [x] App completa (`app.html` + `js/`): login, alta libre, multi-paciente,
      carita interactiva, temporizador, historial, invitar personas, canjear
      código, panel de generar códigos (solo para ti).
- [x] Edge Functions: `invite-user`, `redimir-codigo`, `send-patch-reminders`.
- [x] PWA (manifest, service worker, íconos).
- [ ] **Falta que tú conectes tu propio proyecto de Supabase** (ver abajo) —
      hasta entonces la app muestra "Falta configurar Supabase".

## 1. Configurar Supabase (una sola vez)

1. Crea un proyecto nuevo en **https://supabase.com** — uno **separado** del
   de Ojitos de Mili (son negocios y datos distintos).
2. **SQL Editor → New query**, pega [`supabase/schema.sql`](supabase/schema.sql)
   completo y **Run**.
3. **Authentication → Sign In / Providers → Email**: confirma que **"Allow
   new users to sign up"** (o "Enable email signups") esté **activado** — a
   diferencia de Ojitos de Mili, aquí cualquier familia se registra sola.
4. **Authentication → URL Configuration**: Site URL y Redirect URLs apuntando
   a `https://holbaph.github.io/ocuparche/app.html`.
5. **Project Settings → API**: copia la **Project URL** y la **anon public**
   key.
6. Abre [`js/supabase-config.js`](js/supabase-config.js) y reemplaza
   `SUPABASE_URL` y `SUPABASE_ANON_KEY`. Guarda y `git push`.
7. Regístrate tú primero en la app, con **tu correo real**
   (`phernandez@softcorp.cl`) — el esquema te deja marcado automáticamente
   como dueño del negocio (`es_dueño`), la única cuenta que ve el panel para
   generar códigos de activación.

## 2. Activar las invitaciones (Edge Function)

Igual que en Ojitos de Mili — necesitas la CLI de Supabase instalada
(`scoop install supabase` en Windows) y logueada (`supabase login`).

```
supabase link --project-ref TU-PROJECT-REF
supabase functions deploy invite-user
supabase functions deploy redimir-codigo
```

## 3. Activar el temporizador y los avisos automáticos

1. Genera tus propias llaves VAPID (no reutilices las de Ojitos de Mili):
   ```
   npx web-push generate-vapid-keys
   ```
2. Copia la **pública** a [`js/supabase-config.js`](js/supabase-config.js)
   (`VAPID_PUBLIC_KEY`) y sube el cambio.
3. Guarda ambas como secretos de tus Edge Functions:
   ```
   supabase secrets set VAPID_PUBLIC_KEY=tu-llave-publica
   supabase secrets set VAPID_PRIVATE_KEY=tu-llave-privada
   ```
4. Despliega la función que manda los avisos:
   ```
   supabase functions deploy send-patch-reminders
   ```
5. Abre [`supabase/schema_cron.sql`](supabase/schema_cron.sql), reemplaza
   `TU-PROJECT-REF` y `TU-ANON-KEY`, y corre ese SQL en el SQL Editor —
   programa la revisión automática cada minuto.

## 4. Publicar en GitHub Pages

**Settings → Pages → Deploy from a branch**, rama `main`, carpeta `/ (root)`.

## Cómo generar y entregar un código de activación

1. Alguien te escribe (botón "Solicitar acceso completo" en la landing) con
   su nombre, correo y el comprobante de la transferencia.
2. Verificas el pago.
3. Entras a la app con tu cuenta (`es_dueño`) → **Historial → Generar
   códigos de activación** → escribe una nota (ej. el nombre de la persona) →
   **Generar**.
4. Le mandas ese código por correo — lo pone en **Historial → Tu cuenta →
   Activar**, y su cuenta queda con el plan completo para siempre.

## Modelo de datos (resumen)

```
cuentas             — una por cada admin que se registra solo (plan free/completo)
profiles            — personas (admin o invitadas), ligadas a una cuenta
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
index.html                  landing page
privacidad.html, terminos.html   legales
app.html                     la app (login + dashboard)
css/tokens.css               paleta y tipografía compartidas
css/landing.css              estilos de la landing
css/app.css                  estilos de la app
js/supabase-config.js        credenciales de tu proyecto Supabase
js/auth.js                   sesión, alta libre, invitar, códigos
js/core.js                   fechas, pacientes, registros, temporizador, push
js/app.js                    toda la interacción de la app
supabase/schema.sql          tablas y RLS multi-cuenta
supabase/schema_cron.sql     programa el aviso automático
supabase/functions/          invite-user, redimir-codigo, send-patch-reminders
manifest.json, sw.js         PWA de la app
icons/                       íconos de marca
```

---
Hecho con la experiencia real de Ojitos de Mili 🩹
