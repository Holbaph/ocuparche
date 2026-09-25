# Auditoría de ciberseguridad — Ocuparche

Revisión del backend (Workers + D1 + Durable Objects), el frontend (PWA) y la
configuración de despliegue. La app maneja **datos de salud de menores** y un
panel de administración con acceso a todos los clientes, así que el listón es alto.

> Nadie puede prometer "imposible de vulnerar". Lo que sí se puede es cerrar los
> agujeros conocidos, reducir el daño si algo falla y detectar rápido. Este documento
> separa lo **corregido** de lo **pendiente**, con un orden de prioridad.

## 1. Hallazgos corregidos (auditoría 1)

| # | Sev. | Hallazgo | Corrección |
|---|------|----------|------------|
| 1 | **Crítica** | El segundo factor del panel (TOTP) **se podía saltar**: `/api/admin/*` solo miraba `es_dueño`, y el dueño puede iniciar sesión por el login normal (solo contraseña). | Las sesiones llevan `admin_2fa`; solo `verify-otp` la activa. `exigirDueño` y los endpoints de códigos la exigen. Sesión de panel: 8 h. |
| 2 | **Alta** | Sin límite de intentos en ningún endpoint: fuerza bruta de contraseñas, del código TOTP, de códigos de activación y correos masivos (recuperar contraseña / invitar). | `ratelimit.ts` (D1): login por correo+IP, IP y correo; panel admin por IP y global; canjear código; forgot; signup; invitar; reset. HTTP 429. |
| 2b | Alta | Código TOTP reutilizable durante su ventana. | Se guarda el último paso usado (`totp_ultimo_paso`). |
| 3 | **Alta** | **XSS almacenado**: los nombres de personas e hij@s se insertaban con `innerHTML` sin escapar; una persona invitada podía ejecutar código en la pantalla de la administradora. | `Utils.esc()` en todos los puntos; nombres limitados a 40–60 caracteres en el servidor. |
| 4 | **Alta** | Cookie `SameSite=None` + CORS con credenciales + `request.json()` sin mirar el tipo → **CSRF** posible con `text/plain`. | Cookie `__Host-…; SameSite=Strict`; se rechaza cualquier `Origin` ajeno (403), cuerpos no-JSON (415); se elimina CORS (misma origen). También frena WebSockets desde otros sitios. |
| 5 | **Alta** | La cuenta de dueño se otorgaba **por el correo al registrarse**, sin verificarlo. | Ya no existe esa regla; el dueño se marca a mano en la base. |
| 6 | Media | El service worker **cacheaba las respuestas de `/api/*`** (datos de niños) y quedaban en el teléfono tras cerrar sesión. | El SW no toca `/api/` ni orígenes ajenos; solo cachea respuestas OK. |
| 7 | Media | Sin cabeceras de seguridad. | `public/_headers`: CSP estricta (sin scripts en línea), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy`, COOP. La API: `no-store`, `nosniff`. |
| 8 | Media | **SSRF** por suscripción push: el cron hacía POST a cualquier URL guardada. | Solo `https` y hosts push reales (FCM, Mozilla, Apple, Windows). |
| 9 | Media | Los vencimientos comparaban texto ISO con `datetime('now')`: **un token duraba hasta el fin del día** (el de recuperar contraseña, hasta 24 h en vez de 1 h). | `AHORA_SQL` en el mismo formato. |
| 10 | Media | Contraseña mínima de 6 y sin filtro; login más rápido si el correo no existe (enumeración por tiempo). | Mínimo 8, máximo 128, lista de triviales; login con costo constante. |
| 11 | Media | HTML sin escapar en el correo de invitación (`nombre` de quien invita). | Escapado. |
| 12 | Baja | Entradas sin validar: fechas, horas, minutos, notas, correo, tamaño del JSON del juego (hasta 1 MB por fila). | Validación y topes (juego ≤ 60 KB, minutos 1–1440, fecha `AAAA-MM-DD`). |
| 13 | Baja | Tablas de sesiones/tokens/contadores crecían sin fin. | Limpieza horaria en el cron. |

Lo que ya estaba bien: consultas 100 % parametrizadas (sin inyección SQL), tokens y
sesiones guardados como SHA-256, contraseñas con sal + PBKDF2, cookie `HttpOnly`, todas las
rutas comprueban pertenencia a la cuenta (`pacienteDeLaCuenta`), fotos solo en el dispositivo,
`/__scheduled` bloqueado, avatares validados en cliente y servidor.

## 2. Hoja de ruta recomendada (en orden de prioridad)

### Hazlo ya (gratis, sin código)
1. **Cloudflare Access (Zero Trust, gratis hasta 50 usuarios) delante de `/panel.html` y `/api/admin/*`.** Es una tercera capa: aunque alguien robe contraseña *y* TOTP, no llega ni al login del panel sin pasar tu identidad (correo con código o Google). Es la mejora de mayor impacto para el panel.
2. **Guarda el secreto TOTP en dos lugares** (gestor de contraseñas + respaldo impreso) y pon un segundo dispositivo autenticador; hoy, si pierdes el teléfono, la recuperación es manual en la base.
3. **Regla de rate limiting en el WAF de Cloudflare** (`/api/login`, `/api/signup`, `/api/forgot-password`, `/api/admin/*`): defensa antes de llegar al Worker y protege tu cuota gratis.
4. **Activa alertas de correo** de Cloudflare (picos de 4xx/5xx y de Workers) y revisa `wrangler tail` tras cada despliegue.
5. Revisa con `npx wrangler d1 time-travel` que tu base tenga **restauración a un punto en el tiempo** (D1 la trae) y haz un `wrangler d1 export` mensual guardado fuera de Cloudflare.

### Próximas semanas (código)
6. **Dominio propio** (p. ej. `app.ocuparche.cl`) y verificarlo en Resend con SPF, DKIM y DMARC. Ahora el remitente es `onboarding@resend.dev` (solo entrega a tu correo) y sin dominio propio no puedes usar `__Host-` en subdominios propios ni HSTS preload.
7. **Verificación de correo** al registrarse (hoy cualquiera crea una cuenta con el correo de otra persona) y **CAPTCHA Turnstile** (gratis) en registro, login y recuperar contraseña — hay un skill listo (`turnstile-spin`).
8. **Subir el costo del hash** de contraseñas: hoy PBKDF2 50 000 iteraciones (límite de 10 ms de CPU del plan gratis). OWASP recomienda ≥ 600 000. Con el plan de pago de Workers (USD 5/mes) se sube y se **re-hashea al iniciar sesión**. Es la mejora criptográfica pendiente más relevante.
9. **Verificar contraseñas filtradas** con la API k-anonymity de *Have I Been Pwned* al registrarse/cambiar clave.
10. **Sesiones visibles**: pantalla "Dispositivos conectados" con cierre remoto, y "cerrar sesión en todos" al cambiar contraseña (ya se hace al recuperar).
11. **Registro de auditoría**: tabla con inicios de sesión del panel, activaciones de código, borrados y cambios de plan (fecha, IP, resultado) + aviso por correo cuando alguien entra al panel.
12. **TOTP opcional para las cuentas familiares** (administradoras) y códigos de recuperación de un solo uso para el panel.
13. **Endurecer la CSP**: sacar los `style="…"` en línea para quitar `'unsafe-inline'` de estilos, y alojar MediaPipe (wasm + modelo) en tu propio dominio en vez de jsDelivr/Google (elimina dependencia externa; si no, agrega SRI y fija versión).

### Privacidad y cumplimiento (importante: son datos de salud de niños)
14. **Política de privacidad y términos** visibles (quién ve qué, dónde se guardan los datos, cuánto tiempo) y consentimiento explícito de la persona adulta responsable.
15. **Derechos de las personas titulares** (Ley 19.628 y la nueva Ley 21.719 de Chile): botón de **exportar mis datos** y de **eliminar mi cuenta** dentro de la app (hoy solo lo puedes hacer tú desde el panel).
16. **Minimizar datos**: guardar solo el nombre de pila del niño/a, sin apellidos ni fecha de nacimiento; considerar retención máxima de registros.
17. Documentar un **plan de respuesta a incidentes**: a quién se avisa, en qué plazo, cómo se rotan secretos (`RESEND_API_KEY`, `VAPID_PRIVATE_KEY_JWK`) y cómo se invalidan todas las sesiones (`DELETE FROM sessions`).

### Mantenimiento continuo
18. `npm audit` hoy reporta 3 avisos "high" en `sharp` (vía `wrangler`/`miniflare`): son **dependencias de desarrollo** que no se despliegan; se resuelven actualizando wrangler. Programa una revisión mensual de dependencias (Dependabot en GitHub).
19. Activa **secret scanning y push protection** en el repositorio de GitHub, y **rama `main` protegida** (PR obligatorio + revisión).
20. Pruebas de seguridad periódicas: repetir esta auditoría tras cada funcionalidad grande (sobre todo si añades pagos o más roles).

## 3. Reglas para código nuevo
- Toda ruta nueva: sesión → pertenencia a la cuenta → plan (si aplica) → validar entradas → límite de intentos si manda correos o prueba secretos.
- Todo lo que sea del panel: `exigirDueño` (que exige `admin_2fa`).
- Nunca `innerHTML` con texto de usuarios sin `Utils.esc()`; mejor `textContent`.
- Cada fecha de vencimiento se compara con `AHORA_SQL`.
- Sin scripts en línea (la CSP los bloquea): todo va en archivos `.js`.

## 4. Despliegue de estos cambios (orden obligatorio)
```bash
cd worker
npx wrangler d1 migrations apply ocuparche --remote   # 0006_seguridad.sql  (PRIMERO)
npx wrangler deploy                                    # DESPUÉS
```
Efectos esperados: **todas las sesiones abiertas se cierran una vez** (cambió el nombre de la cookie) y el
panel de administrador pedirá de nuevo contraseña + código del authenticator.
