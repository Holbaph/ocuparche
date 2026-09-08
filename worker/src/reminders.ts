// reminders.ts — lo llama el cron cada minuto (ver wrangler.jsonc). Revisa,
// para cada paciente, si el registro de hoy ya cumplió SU tiempo de parche
// (cada paciente puede tener una duración distinta) y, si es así, avisa por
// push a todas las personas de esa cuenta — aunque nadie tenga la app
// abierta.
import { buildPushHTTPRequest } from '@pushforge/builder';
import type { Env } from './types';

export async function revisarYAvisar(env: Env): Promise<{ avisos: number }> {
  if (!env.VAPID_PRIVATE_KEY_JWK) {
    console.log('[reminders] falta VAPID_PRIVATE_KEY_JWK, no se puede avisar todavía');
    return { avisos: 0 };
  }

  const desde = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const { results: registros } = await env.DB.prepare(
    'SELECT id, paciente_id, fecha, hora FROM registros WHERE notificado = 0 AND fecha >= ?'
  ).bind(desde).all<{ id: string; paciente_id: string; fecha: string; hora: string }>();

  if (!registros?.length) return { avisos: 0 };

  const pacienteIds = [...new Set(registros.map((r) => r.paciente_id))];
  const placeholders = pacienteIds.map(() => '?').join(',');

  const { results: pacientesRows } = await env.DB.prepare(
    `SELECT id, nombre, cuenta_id FROM pacientes WHERE id IN (${placeholders})`
  ).bind(...pacienteIds).all<{ id: string; nombre: string; cuenta_id: string }>();
  const { results: configRows } = await env.DB.prepare(
    `SELECT paciente_id, duracion_minutos FROM configuracion WHERE paciente_id IN (${placeholders})`
  ).bind(...pacienteIds).all<{ paciente_id: string; duracion_minutos: number }>();

  const pacientePorId: Record<string, { nombre: string; cuenta_id: string }> = {};
  (pacientesRows ?? []).forEach((p) => { pacientePorId[p.id] = { nombre: p.nombre, cuenta_id: p.cuenta_id }; });
  const duracionPorPaciente: Record<string, number> = {};
  (configRows ?? []).forEach((c) => { duracionPorPaciente[c.paciente_id] = c.duracion_minutos; });

  const ahora = Date.now();
  const vencidos = registros.filter((r) => {
    const duracionMin = duracionPorPaciente[r.paciente_id] ?? 120;
    const fin = new Date(r.hora).getTime() + duracionMin * 60000;
    return fin <= ahora;
  });
  if (!vencidos.length) return { avisos: 0 };

  // Agrupa por cuenta: si dos pacientes de la misma familia vencen a la vez,
  // mandamos un solo push por cuenta, no uno por paciente.
  const cuentaAvisos = new Map<string, string[]>();
  for (const r of vencidos) {
    const p = pacientePorId[r.paciente_id];
    if (!p) continue;
    const arr = cuentaAvisos.get(p.cuenta_id) ?? [];
    arr.push(p.nombre);
    cuentaAvisos.set(p.cuenta_id, arr);
  }

  if (cuentaAvisos.size) {
    const cuentaIds = [...cuentaAvisos.keys()];
    const cuentaPlaceholders = cuentaIds.map(() => '?').join(',');
    const { results: perfiles } = await env.DB.prepare(
      `SELECT id, cuenta_id FROM profiles WHERE cuenta_id IN (${cuentaPlaceholders})`
    ).bind(...cuentaIds).all<{ id: string; cuenta_id: string }>();

    const cuentaPorUser: Record<string, string> = {};
    (perfiles ?? []).forEach((p) => { cuentaPorUser[p.id] = p.cuenta_id; });
    const userIds = (perfiles ?? []).map((p) => p.id);

    if (userIds.length) {
      const userPlaceholders = userIds.map(() => '?').join(',');
      const { results: subs } = await env.DB.prepare(
        `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${userPlaceholders})`
      ).bind(...userIds).all<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }>();

      const privateJWK = JSON.parse(env.VAPID_PRIVATE_KEY_JWK);

      const resultados = await Promise.allSettled(
        (subs ?? []).map(async (sub) => {
          const cuentaId = cuentaPorUser[sub.user_id];
          const nombres = cuentaAvisos.get(cuentaId);
          if (!nombres) return;

          const { endpoint, headers, body } = await buildPushHTTPRequest({
            privateJWK,
            subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            message: {
              payload: {
                title: '¡Ya se puede sacar el parche! 🎉',
                body: nombres.length === 1 ? `Se cumplió el tiempo de hoy para ${nombres[0]}.` : `Se cumplió el tiempo de hoy para: ${nombres.join(', ')}.`,
              },
              adminContact: 'mailto:pablo.hernandez@outlook.cl',
            },
          });

          const res = await fetch(endpoint, { method: 'POST', headers, body });
          if (res.status === 404 || res.status === 410) {
            await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
          } else if (!res.ok) {
            throw new Error(`push respondió ${res.status}: ${await res.text().catch(() => '')}`);
          }
        })
      );
      // Sin esto, un fallo de red o de firma quedaba mudo — Promise.allSettled
      // no relanza los rechazos, y no habría forma de verlos en los logs de
      // Cloudflare para depurar por qué no llegó un aviso real.
      resultados.forEach((r) => { if (r.status === 'rejected') console.error('[reminders] envío de push falló:', r.reason); });
    }
  }

  const ids = vencidos.map((r) => r.id);
  const idPlaceholders = ids.map(() => '?').join(',');
  await env.DB.prepare(`UPDATE registros SET notificado = 1 WHERE id IN (${idPlaceholders})`).bind(...ids).run();

  return { avisos: vencidos.length };
}
