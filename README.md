# Ocuparche

App web (PWA) para que familias registren y sigan la constancia del tratamiento
de parche ocular de sus hij@s — multi-cuenta y freemium, pensada para ofrecerla
a otras familias (no solo la tuya), en conjunto con un oftalmólogo.

Basada en el mismo enfoque probado en [Ojitos de Mili](https://github.com/Holbaph/ojitos-de-mili):
HTML/CSS/JS puro + Supabase (Postgres + Auth + RLS + Edge Functions) + GitHub Pages,
sin costos de tienda ni mensualidades de infraestructura.

## Estado del proyecto

🚧 **En construcción, por tandas.**

- [x] Landing page (`index.html`) — presentación, precios, por qué existe.
- [x] Páginas legales (`privacidad.html`, `terminos.html`) — **revisar y completar
      los `TU-CORREO-DE-CONTACTO` y `TU-PRECIO`/`TU-LINK-DE-PAGO` antes de publicar**.
- [x] Esquema de base de datos multi-cuenta (`supabase/schema.sql`) — cuentas,
      pacientes, registros, configuración, códigos de activación.
- [ ] App real (`app.html` + `js/`) — login, alta libre, carita interactiva,
      temporizador, historial, multi-paciente, invitar personas.
- [ ] Edge Functions: `invite-user` (invitar personas a tu cuenta) y
      `redimir-codigo` (activar el plan completo con un código).
- [ ] Panel para generar códigos de activación (solo visible para el dueño).
- [ ] PWA (manifest, service worker, íconos de la app en sí — hoy solo existen
      los íconos de marca para la landing).

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

## Configurar Supabase (una sola vez)

1. Crea un proyecto nuevo en **https://supabase.com** (separado del de Ojitos de
   Mili — son negocios/datos distintos).
2. **SQL Editor → New query**, pega [`supabase/schema.sql`](supabase/schema.sql)
   completo y **Run**.
3. **Authentication → Providers → Email**: a diferencia de Ojitos de Mili, esta
   app necesita **registro público habilitado** (para que cualquier familia
   pueda crear su cuenta gratis sola). Revisa que "Enable email signups" esté
   activado.
4. **Authentication → URL Configuration**: Site URL y Redirect URLs apuntando a
   donde publiques esto (ver más abajo).
5. Regístrate tú primero con tu correo real (`phernandez@softcorp.cl`) — el
   esquema te deja marcado automáticamente como dueño del negocio (`es_dueño`),
   la única cuenta que puede generar códigos de activación.

## Publicar en GitHub Pages

Igual que en tus otras apps: **Settings → Pages → Deploy from a branch**, rama
`main`, carpeta `/ (root)`.

---
Hecho con la experiencia real de Ojitos de Mili 🩹
