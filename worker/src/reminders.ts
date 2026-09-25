// reminders.ts — lo llama el cron cada minuto (ver wrangler.jsonc). Avisa por
// push, aunque nadie tenga la app abierta:
//  1. "Ya se puede sacar el parche": para cada paciente, cuando su registro de
//     hoy ya cumplió SU tiempo de parche (cada paciente puede tener una
//     duración distinta). Si ya anotaron que se lo sacó, no avisa.
//  2. Control con el oftalmólogo: el día antes a las 19:00 (hora de Chile).
//  3. Resumen de la semana: los domingos por la tarde.
import { buildPushHTTPRequest } from '@pushforge/builder';
import type { Env } from './types';

const ZONA = 'America/Santiago';

type Mensaje = { cuentaId: string; title: string; body: string };

// Envía cada mensaje a todos los dispositivos suscritos de las personas de esa cuenta.
async function pushACuentas(env: Env, mensajes: Mensaje[]): Promise<void> {
  if (!mensajes.length || !env.VAPID_PRIVATE_KEY_JWK) return;
  const cuentaIds = [...new Set(mensajes.map((m) => m.cuentaId))];
  const { results: perfiles } = await env.DB.prepare(
    `SELECT id, cuenta_id FROM profiles WHERE cuenta_id IN (${cuentaIds.map(() => '?').join(',')})`
  ).bind(...cuentaIds).all<{ id: string; cuenta_id: string }>();
  const cuentaPorUser: Record<string, string> = {};
  (perfiles ?? []).forEach((p) => { cuentaPorUser[p.id] = p.cuenta_id; });
  const userIds = (perfiles ?? []).map((p) => p.id);
  if (!userIds.length) return;

  const { results: subs } = await env.DB.prepare(
    `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${userIds.map(() => '?').join(',')})`
  ).bind(...userIds).all<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }>();

  const privateJWK = JSON.parse(env.VAPID_PRIVATE_KEY_JWK);
  const resultados = await Promise.allSettled(
    (subs ?? []).flatMap((sub) =>
      mensajes.filter((m) => m.cuentaId === cuentaPorUser[sub.user_id]).map(async (m) => {
        const { endpoint, headers, body } = await buildPushHTTPRequest({
          privateJWK,
          subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message: { payload: { title: m.title, body: m.body }, adminContact: 'mailto:pablo.hernandez@outlook.cl' },
        });
        const res = await fetch(endpoint, { method: 'POST', headers, body });
        if (res.status === 404 || res.status === 410) {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
        } else if (!res.ok) {
          throw new Error(`push respondió ${res.status}: ${await res.text().catch(() => '')}`);
        }
      })
    )
  );
  // Sin esto, un fallo de red o de firma quedaba mudo (allSettled no relanza los rechazos).
  resultados.forEach((r) => { if (r.status === 'rejected') console.error('[reminders] envío de push falló:', r.reason); });
}

// ---------- 1. "ya se puede sacar el parche" ----------
export async function revisarYAvisar(env: Env): Promise<{ avisos: number }> {
  if (!env.VAPID_PRIVATE_KEY_JWK) {
    console.log('[reminders] falta VAPID_PRIVATE_KEY_JWK, no se puede avisar todavía');
    return { avisos: 0 };
  }

  const desde = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const { results: registros } = await env.DB.prepare(
    'SELECT id, paciente_id, fecha, hora, hora_fin FROM registros WHERE notificado = 0 AND fecha >= ?'
  ).bind(desde).all<{ id: string; paciente_id: string; fecha: string; hora: string; hora_fin: string | null }>();
  if (!registros?.length) return { avisos: 0 };

  // Si ya anotaron que se sacó el parche, no hay nada que avisar.
  const yaSacados = registros.filter((r) => r.hora_fin).map((r) => r.id);
  const pendientes = registros.filter((r) => !r.hora_fin);

  const pacienteIds = [...new Set(pendientes.map((r) => r.paciente_id))];
  let vencidos: typeof pendientes = [];
  const mensajes: Mensaje[] = [];
  if (pacienteIds.length) {
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
    vencidos = pendientes.filter((r) => new Date(r.hora).getTime() + (duracionPorPaciente[r.paciente_id] ?? 120) * 60000 <= ahora);

    // Agrupa por cuenta: si dos pacientes de la misma familia vencen a la vez, un solo push por cuenta.
    const cuentaAvisos = new Map<string, string[]>();
    for (const r of vencidos) {
      const p = pacientePorId[r.paciente_id];
      if (!p) continue;
      cuentaAvisos.set(p.cuenta_id, [...(cuentaAvisos.get(p.cuenta_id) ?? []), p.nombre]);
    }
    cuentaAvisos.forEach((nombres, cuentaId) => mensajes.push({
      cuentaId,
      title: '¡Ya se puede sacar el parche! 🎉',
      body: nombres.length === 1 ? `Se cumplió el tiempo de hoy para ${nombres[0]}.` : `Se cumplió el tiempo de hoy para: ${nombres.join(', ')}.`,
    }));
  }

  await pushACuentas(env, mensajes);

  const ids = [...vencidos.map((r) => r.id), ...yaSacados];
  if (ids.length) {
    await env.DB.prepare(`UPDATE registros SET notificado = 1 WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).run();
  }
  return { avisos: vencidos.length };
}

// ---------- hora de Chile ----------
function ahoraChile(): { fecha: string; hora: number; dow: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date());
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { fecha: `${get('year')}-${get('month')}-${get('day')}`, hora: Number(get('hour')), dow };
}
function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function diaSemana(fecha: string): number { return new Date(fecha + 'T12:00:00Z').getUTCDay(); }
function duracionTexto(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h} h${m ? ' ' + m + ' min' : ''}` : `${m} min`;
}

// ---------- 2 y 3. control con el oftalmólogo y resumen semanal ----------
export async function revisarTratamiento(env: Env): Promise<{ controles: number; resumenes: number }> {
  if (!env.VAPID_PRIVATE_KEY_JWK) return { controles: 0, resumenes: 0 };
  const { fecha: hoy, hora, dow } = ahoraChile();
  const mensajes: Mensaje[] = [];
  const controlesAvisados: string[] = [];
  const resumenesEnviados: string[] = [];

  // --- control: el día antes a las 19:00 (o el mismo día desde las 7:00, si se cargó tarde) ---
  const manana = sumarDias(hoy, 1);
  const { results: controles } = await env.DB.prepare(
    `SELECT c.paciente_id, c.control_fecha, c.control_hora, c.control_detalle, c.control_preguntas, p.nombre, p.cuenta_id
     FROM configuracion c
     JOIN pacientes p ON p.id = c.paciente_id
     JOIN cuentas cu ON cu.id = p.cuenta_id
     WHERE cu.plan = 'completo' AND c.control_fecha IN (?1, ?2) AND COALESCE(c.control_aviso_enviado, '') != c.control_fecha`
  ).bind(hoy, manana).all<{
    paciente_id: string; control_fecha: string; control_hora: string | null; control_detalle: string | null;
    control_preguntas: string | null; nombre: string; cuenta_id: string;
  }>();
  for (const c of controles ?? []) {
    const esHoy = c.control_fecha === hoy;
    if (esHoy ? hora < 7 : hora < 19) continue;
    const cuando = esHoy ? 'hoy' : 'mañana';
    mensajes.push({
      cuentaId: c.cuenta_id,
      title: `🩺 Control de ${c.nombre} ${cuando}`,
      body: `${c.control_detalle ? c.control_detalle + ' · ' : ''}${c.control_hora ? 'a las ' + c.control_hora + '. ' : ''}${c.control_preguntas ? 'Lleva tus preguntas anotadas en la app.' : 'No olvides llevar todo lo que quieras consultar.'}`,
    });
    controlesAvisados.push(c.paciente_id);
  }

  // --- resumen semanal: domingo desde las 19:00 ---
  if (dow === 0 && hora >= 19) {
    const { results: pacientes } = await env.DB.prepare(
      `SELECT p.id, p.nombre, p.cuenta_id, c.indicacion_dias, c.premio_meta, c.premio_texto
       FROM pacientes p
       JOIN cuentas cu ON cu.id = p.cuenta_id
       LEFT JOIN configuracion c ON c.paciente_id = p.id
       WHERE cu.plan = 'completo' AND COALESCE(c.resumen_activo, 1) = 1 AND COALESCE(c.resumen_ultimo_envio, '') != ?1`
    ).bind(hoy).all<{ id: string; nombre: string; cuenta_id: string; indicacion_dias: string | null; premio_meta: number | null; premio_texto: string | null }>();

    if (pacientes?.length) {
      const desde = sumarDias(hoy, -6);
      const ids = pacientes.map((p) => p.id);
      const { results: regs } = await env.DB.prepare(
        `SELECT paciente_id, fecha, hora, hora_fin FROM registros WHERE fecha >= ? AND fecha <= ? AND paciente_id IN (${ids.map(() => '?').join(',')})`
      ).bind(desde, hoy, ...ids).all<{ paciente_id: string; fecha: string; hora: string; hora_fin: string | null }>();

      for (const p of pacientes) {
        const dias = (p.indicacion_dias ?? '0,1,2,3,4,5,6').split(',').map(Number);
        let indicados = 0;
        for (let i = 0; i < 7; i++) if (dias.includes(diaSemana(sumarDias(hoy, -i)))) indicados++;
        const suyos = (regs ?? []).filter((r) => r.paciente_id === p.id);
        const usos = suyos.filter((r) => r.hora_fin).map((r) => (Date.parse(r.hora_fin as string) - Date.parse(r.hora)) / 60000).filter((m) => m > 0 && m < 1440);
        const prom = usos.length ? usos.reduce((a, b) => a + b, 0) / usos.length : 0;
        const cumplida = p.premio_meta != null && suyos.length >= p.premio_meta;
        mensajes.push({
          cuentaId: p.cuenta_id,
          title: `📊 Resumen de la semana de ${p.nombre}`,
          body: `Usó el parche ${suyos.length} de ${indicados} días indicados${prom ? ' · promedio ' + duracionTexto(prom) + ' por día' : ''}.` +
            (cumplida ? ` 🎁 ¡Meta cumplida!${p.premio_texto ? ' Premio: ' + p.premio_texto : ''}` : ''),
        });
        resumenesEnviados.push(p.id);
      }
    }
  }

  await pushACuentas(env, mensajes);

  const sentencias = [
    ...controlesAvisados.map((id) => env.DB.prepare('UPDATE configuracion SET control_aviso_enviado = control_fecha WHERE paciente_id = ?').bind(id)),
    ...resumenesEnviados.map((id) => env.DB.prepare(
      `INSERT INTO configuracion (paciente_id, resumen_ultimo_envio, updated_at) VALUES (?1, ?2, datetime('now'))
       ON CONFLICT(paciente_id) DO UPDATE SET resumen_ultimo_envio = ?2`
    ).bind(id, hoy)),
  ];
  if (sentencias.length) await env.DB.batch(sentencias);
  return { controles: controlesAvisados.length, resumenes: resumenesEnviados.length };
}
