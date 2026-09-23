// email.ts — correos transaccionales vía Resend (resend.com, gratis hasta
// 3.000/mes). Cloudflare no tiene un envío de correo de propósito general
// listo para usar (su "Email Workers" es para RECIBIR correo en un dominio
// propio, no para mandar a cualquier destinatario) — por eso este es el
// único servicio externo a Cloudflare en todo el proyecto.
//
// Si RESEND_API_KEY no está configurado (secreto de Worker), no falla:
// registra el link en los logs para poder probar sin tener Resend armado
// todavía.

import type { Env } from './types';

const FROM = 'Ocuparche <onboarding@resend.dev>'; // cámbialo cuando tengas tu propio dominio en Resend

export async function enviarCorreo(env: Env, to: string, subject: string, html: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log('[email simulado, falta RESEND_API_KEY]', { to, subject, html });
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    console.error('Resend error', res.status, await res.text());
  }
}

export function correoRecuperar(link: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>Recupera tu acceso a Ocuparche</h2>
      <p>Toca el botón para elegir una contraseña nueva. Si no fuiste tú, ignora este correo.</p>
      <p><a href="${link}" style="background:#e1673f;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block">Elegir contraseña nueva</a></p>
      <p style="color:#888;font-size:12px">Este enlace vence en 1 hora.</p>
    </div>`;
}

export function correoInvitacion(link: string, cuentaNombre: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>Te invitaron a Ocuparche</h2>
      <p>${cuentaNombre} te invitó a ayudar con el tratamiento de parche ocular. Toca el botón para crear tu contraseña y entrar.</p>
      <p><a href="${link}" style="background:#e1673f;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block">Aceptar invitación</a></p>
      <p style="color:#888;font-size:12px">Este enlace vence en 3 días.</p>
    </div>`;
}

// Segundo factor del login del panel de plataforma — el código va aparte de
// la contraseña, así que aunque alguien la adivine no le alcanza para entrar.
export function correoOtpAdmin(codigo: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>Tu código de acceso al panel</h2>
      <p>Alguien (con suerte tú) inició sesión en el panel de administrador de Ocuparche. Escribe este código para completar el ingreso:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:.15em;text-align:center;background:#fef8f3;border-radius:14px;padding:16px 0">${codigo}</p>
      <p style="color:#888;font-size:12px">Vence en 10 minutos. Si no fuiste tú, ignora este correo — tu contraseña sigue siendo la única forma de llegar hasta acá.</p>
    </div>`;
}

// Se manda al cliente cuando el dueño atiende su solicitud y le genera el
// código de activación.
export function correoCodigoActivacion(codigo: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>¡Tu Ocuparche completo ya está listo! 🎉</h2>
      <p>Recibimos tu pago y aquí está tu código de activación. Pégalo en la app, en "Tu cuenta":</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:.1em;text-align:center;background:#fef8f3;border-radius:14px;padding:16px 0">${codigo}</p>
      <p>Con esto desbloqueas hij@s ilimitados, el reloj de arena con avisos automáticos, e invitar hasta 3 personas más de tu familia.</p>
      <p style="color:#888;font-size:12px">¿Algún problema? Responde este correo.</p>
    </div>`;
}
