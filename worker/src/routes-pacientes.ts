// routes-pacientes.ts — pacientes, sus registros diarios y la duración del
// temporizador. Toda ruta empieza igual: pedir sesión, y si toca un
// paciente puntual, confirmar que sea de LA MISMA cuenta antes de tocar nada
// (pacienteDeLaCuenta) — es nuestro reemplazo manual de RLS.
import { json } from './cors';
import { perfilDesdeSesion } from './auth';
import { uuid, pacienteDeLaCuenta, contarPacientes, readJson } from './helpers';
import type { Env } from './types';

type Handler = (request: Request, env: Env, origin: string | null) => Promise<Response>;

// Avisa al Durable Object del paciente que algo cambió, para que reenvíe el
// aviso a todos los dispositivos conectados en vivo. Si falla (nadie
// conectado, DO recién creándose, etc.) no aborta la operación principal —
// el dato ya quedó guardado en D1, el peor caso es que el otro dispositivo
// se entere al refrescar en vez de al instante.
async function avisarCambio(env: Env, pacienteId: string) {
  try {
    const id = env.PACIENTE_ROOM.idFromName(pacienteId);
    await env.PACIENTE_ROOM.get(id).broadcast(JSON.stringify({ type: 'registros_cambiaron' }));
  } catch (e) {
    console.error('No se pudo avisar al Durable Object', e);
  }
}

function parseAvatar(row: { avatar_json?: string | null }): unknown {
  if (!row.avatar_json) return null;
  try { return JSON.parse(row.avatar_json); } catch { return null; }
}

// Mismos valores por defecto y opciones que public/js/avatar.js — hace falta
// una copia acá porque el Worker no comparte runtime con el navegador.
const BASE_COMUN = {
  colorMoño: '#c96f8f', colorOjos: '#8b5e3c',
  piel: '#f6e0c8', cuerpo: 'normal', colorPantalon: '#5b7c9e', colorZapatos: '#3a3540',
  sombrero: 'ninguno', colorSombrero: '#e1673f', lentes: 'ninguno', reloj: false, collar: 'ninguno', aros: false,
};
const AVATAR_POR_DEFECTO: Record<string, Record<string, unknown>> = {
  niña: { ...BASE_COMUN, genero: 'niña', peinado: 'largo', flequillo: 'ondas', colorPelo: '#6b4a34', moño: true, colorRopa: '#c9525a', ropa: 'vestido', pantalon: 'falda' },
  niño: { ...BASE_COMUN, genero: 'niño', peinado: 'corto', flequillo: 'sin', colorPelo: '#2b2420', moño: false, colorRopa: '#5b8fae', ropa: 'polera', pantalon: 'jeans' },
};
const PEINADOS_VALIDOS = new Set([
  'corto', 'largo', 'rizado', 'coleta', 'bob', 'chongos', 'trenzas', 'mohicano', 'copete', 'rapado', 'lado',
  'melena', 'ondas', 'muy-largo', 'pixie', 'afro', 'crespo', 'colitas', 'colitas-altas', 'cola', 'cola-alta',
  'cola-baja', 'tomate', 'moños-dobles', 'trenza', 'dos-trenzas',
]);
const FLEQUILLOS_VALIDOS = new Set(['ondas', 'recto', 'lado', 'cortina', 'sin']);

const HEX = /^#[0-9a-f]{6}$/i;
const CAMPOS_COLOR = ['colorPelo', 'colorMoño', 'colorOjos', 'colorRopa', 'piel', 'colorPantalon', 'colorZapatos', 'colorSombrero'];
const CAMPOS_ENUM: Record<string, Set<string>> = {
  cuerpo: new Set(['delgado', 'normal', 'fuerte']),
  ropa: new Set(['polera', 'sweater', 'tirantes', 'vestido', 'heroe']),
  pantalon: new Set(['jeans', 'short', 'calzas', 'falda']),
  sombrero: new Set(['ninguno', 'jockey', 'jockey-plano', 'gorro-lana', 'sombrero', 'boina']),
  lentes: new Set(['ninguno', 'sol', 'redondos']),
  collar: new Set(['ninguno', 'cadena', 'perlas']),
};
const CAMPOS_BOOL = ['moño', 'reloj', 'aros'];

// Se queda solo con los campos conocidos y con valores válidos (colores
// #rrggbb, opciones de la lista): lo que se guarda termina dentro de un SVG
// en el navegador de toda la familia, así que no se guarda cualquier cosa.
function sanearAvatar(a: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof a.peinado === 'string' && PEINADOS_VALIDOS.has(a.peinado)) out.peinado = a.peinado;
  if (typeof a.flequillo === 'string' && FLEQUILLOS_VALIDOS.has(a.flequillo)) out.flequillo = a.flequillo;
  for (const k of CAMPOS_COLOR) if (typeof a[k] === 'string' && HEX.test(a[k] as string)) out[k] = (a[k] as string).toLowerCase();
  for (const k of Object.keys(CAMPOS_ENUM)) if (typeof a[k] === 'string' && CAMPOS_ENUM[k].has(a[k] as string)) out[k] = a[k];
  for (const k of CAMPOS_BOOL) if (typeof a[k] === 'boolean') out[k] = a[k];
  return out;
}

// El plan gratis solo deja elegir género, peinado y flequillo — todo lo demás (colores,
// ropa, cuerpo, gorros, joyas…) se fuerza al valor por defecto de ese género,
// aunque alguien mande otra cosa a mano pegándole directo a la API. Esto se
// comprueba acá — no alcanza con ocultar los selectores en el frontend.
export function limitarAvatarSegunPlan(avatar: unknown, plan: string | undefined): unknown {
  if (!avatar || typeof avatar !== 'object') return avatar;
  const a = avatar as Record<string, unknown>;
  const genero = a.genero === 'niño' ? 'niño' : 'niña';
  const base = AVATAR_POR_DEFECTO[genero];
  const limpio = sanearAvatar(a);
  if (plan === 'completo') return { ...base, ...limpio, genero };
  const peinado = typeof limpio.peinado === 'string' ? limpio.peinado : base.peinado;
  const flequillo = typeof limpio.flequillo === 'string' ? limpio.flequillo : base.flequillo;
  return { ...base, genero, peinado, flequillo };
}

export const listarPacientes: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const { results } = await env.DB.prepare(
    'SELECT id, nombre, avatar_json, created_at FROM pacientes WHERE cuenta_id = ? ORDER BY created_at ASC'
  ).bind(perfil.cuenta_id).all<{ id: string; nombre: string; avatar_json: string | null; created_at: string }>();
  const pacientes = (results ?? []).map((r) => ({ id: r.id, nombre: r.nombre, avatar: parseAvatar(r), created_at: r.created_at }));
  return json({ ok: true, pacientes }, origin);
};

export const crearPaciente: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const body = await readJson<{ nombre?: string; avatar?: unknown }>(request);
  const nombre = (typeof body?.nombre === 'string' ? body.nombre : '').trim().slice(0, 40);
  if (!nombre) return json({ ok: false, error: 'Escribe un nombre' }, origin, { status: 400 });

  const cuenta = await env.DB.prepare('SELECT plan FROM cuentas WHERE id = ?').bind(perfil.cuenta_id).first<{ plan: string }>();
  const total = await contarPacientes(env, perfil.cuenta_id);
  if (cuenta?.plan !== 'completo' && total >= 1) {
    return json({ ok: false, error: 'plan_gratis_limite_pacientes' }, origin, { status: 403 });
  }

  const id = uuid();
  const avatar = body?.avatar ? limitarAvatarSegunPlan(body.avatar, cuenta?.plan) : null;
  const avatarJson = avatar ? JSON.stringify(avatar) : null;
  await env.DB.prepare('INSERT INTO pacientes (id, cuenta_id, nombre, avatar_json) VALUES (?, ?, ?, ?)')
    .bind(id, perfil.cuenta_id, nombre, avatarJson).run();
  return json({ ok: true, paciente: { id, nombre, avatar } }, origin);
};

// Actualiza nombre y/o apariencia de un paciente — ambos opcionales, se
// mandan solo los campos que cambiaron.
export const actualizarPaciente: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const body = await readJson<{ id?: string; nombre?: string; avatar?: unknown }>(request);
  const id = body?.id;
  if (!id) return json({ ok: false, error: 'Faltan datos' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, id, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });

  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim().slice(0, 40) : undefined;
  if (nombre !== undefined && !nombre) return json({ ok: false, error: 'El nombre no puede quedar vacío' }, origin, { status: 400 });

  let avatarJson: string | undefined;
  if (body?.avatar !== undefined) {
    const cuenta = await env.DB.prepare('SELECT plan FROM cuentas WHERE id = ?').bind(perfil.cuenta_id).first<{ plan: string }>();
    avatarJson = JSON.stringify(limitarAvatarSegunPlan(body.avatar, cuenta?.plan));
  }

  if (nombre !== undefined && avatarJson !== undefined) {
    await env.DB.prepare('UPDATE pacientes SET nombre = ?, avatar_json = ? WHERE id = ?')
      .bind(nombre, avatarJson, id).run();
  } else if (nombre !== undefined) {
    await env.DB.prepare('UPDATE pacientes SET nombre = ? WHERE id = ?').bind(nombre, id).run();
  } else if (avatarJson !== undefined) {
    await env.DB.prepare('UPDATE pacientes SET avatar_json = ? WHERE id = ?').bind(avatarJson, id).run();
  }
  return json({ ok: true }, origin);
};

export const eliminarPaciente: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ ok: false, error: 'Falta id' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, id, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  // D1/SQLite no aplica ON DELETE CASCADE salvo que se active la pragma
  // foreign_keys — borramos a mano lo que cuelga de este paciente.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM registros WHERE paciente_id = ?').bind(id),
    env.DB.prepare('DELETE FROM configuracion WHERE paciente_id = ?').bind(id),
    env.DB.prepare('DELETE FROM pacientes WHERE id = ?').bind(id),
  ]);
  return json({ ok: true }, origin);
};

// ---------- registros ----------

export const listarRegistros: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const pacienteId = new URL(request.url).searchParams.get('paciente_id');
  if (!pacienteId) return json({ ok: false, error: 'Falta paciente_id' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  const { results } = await env.DB.prepare(
    'SELECT id, fecha, ojo, hora, hora_fin, registrado_por FROM registros WHERE paciente_id = ? ORDER BY fecha DESC LIMIT 400'
  ).bind(pacienteId).all();
  return json({ ok: true, registros: results }, origin);
};

export const guardarRegistro: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const body = await readJson<{ paciente_id?: string; fecha?: string; ojo?: string; hora?: string }>(request);
  const pacienteId = body?.paciente_id, fecha = body?.fecha, ojo = body?.ojo;
  const horaRaw = typeof body?.hora === 'string' && body.hora ? body.hora : new Date().toISOString();
  const horaMs = Date.parse(horaRaw);
  if (
    typeof pacienteId !== 'string' || typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    (ojo !== 'derecho' && ojo !== 'izquierdo') || Number.isNaN(horaMs)
  ) {
    return json({ ok: false, error: 'Datos inválidos' }, origin, { status: 400 });
  }
  const hora = new Date(horaMs).toISOString(); // siempre ISO normalizado (el cron y la app lo parsean)
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });

  await env.DB.prepare(
    `INSERT INTO registros (id, paciente_id, fecha, ojo, hora, registrado_por, notificado)
     VALUES (?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(paciente_id, fecha) DO UPDATE SET
       ojo = excluded.ojo, hora = excluded.hora, hora_fin = NULL, registrado_por = excluded.registrado_por, notificado = 0`
  ).bind(uuid(), pacienteId, fecha, ojo, hora, perfil.id).run();

  await avisarCambio(env, pacienteId);
  return json({ ok: true }, origin);
};

export const eliminarRegistro: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const url = new URL(request.url);
  const pacienteId = url.searchParams.get('paciente_id');
  const fecha = url.searchParams.get('fecha');
  if (!pacienteId || !fecha) return json({ ok: false, error: 'Faltan datos' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  await env.DB.prepare('DELETE FROM registros WHERE paciente_id = ? AND fecha = ?').bind(pacienteId, fecha).run();
  await avisarCambio(env, pacienteId);
  return json({ ok: true }, origin);
};

// ---------- conexión en vivo (WebSocket) ----------
// No pasa por el router de rutas exactas de index.ts porque una conexión
// WebSocket no es una petición JSON normal — index.ts la detecta por el
// header Upgrade y la manda directo para acá.
export async function conectarRealtime(request: Request, env: Env): Promise<Response> {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return new Response('No autenticado', { status: 401 });

  const pacienteId = new URL(request.url).searchParams.get('paciente_id');
  if (!pacienteId) return new Response('Falta paciente_id', { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return new Response('No encontrado', { status: 404 });

  const id = env.PACIENTE_ROOM.idFromName(pacienteId);
  return env.PACIENTE_ROOM.get(id).fetch(request);
}

// ---------- configuración (duración del temporizador) ----------

export const obtenerConfig: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const pacienteId = new URL(request.url).searchParams.get('paciente_id');
  if (!pacienteId) return json({ ok: false, error: 'Falta paciente_id' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  const row = await env.DB.prepare(
    `SELECT duracion_minutos, indicacion_ojo, indicacion_dias, premio_meta, premio_texto, control_fecha, control_hora,
            control_detalle, control_preguntas, resumen_activo
     FROM configuracion WHERE paciente_id = ?`
  ).bind(pacienteId).first<FilaTratamiento & { duracion_minutos: number | null }>();
  return json({ ok: true, duracion_minutos: row?.duracion_minutos ?? 120, tratamiento: tratamientoDeFila(row) }, origin);
};

// ---------- control del tratamiento (indicación, premio, próximo control) ----------
// Plan completo, igual que el temporizador. Portado de Ojitos de Mili.
type FilaTratamiento = {
  indicacion_ojo?: string | null; indicacion_dias?: string | null; premio_meta?: number | null; premio_texto?: string | null;
  control_fecha?: string | null; control_hora?: string | null; control_detalle?: string | null; control_preguntas?: string | null;
  resumen_activo?: number | null;
};

function tratamientoDeFila(r: FilaTratamiento | null | undefined) {
  return {
    indicacion_ojo: r?.indicacion_ojo ?? 'alternar',
    indicacion_dias: (r?.indicacion_dias ?? '0,1,2,3,4,5,6').split(',').map(Number).filter((n) => n >= 0 && n <= 6),
    premio_meta: r?.premio_meta ?? null,
    premio_texto: r?.premio_texto ?? null,
    control_fecha: r?.control_fecha ?? null,
    control_hora: r?.control_hora ?? null,
    control_detalle: r?.control_detalle ?? null,
    control_preguntas: r?.control_preguntas ?? null,
    resumen_activo: r?.resumen_activo === 0 ? 0 : 1,
  };
}

export const guardarTratamiento: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const b = await readJson<Record<string, unknown>>(request);
  const pacienteId = b?.paciente_id;
  const malo = (msg: string) => json({ ok: false, error: msg }, origin, { status: 400 });
  if (typeof pacienteId !== 'string') return malo('Datos inválidos');
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  const cuenta = await env.DB.prepare('SELECT plan FROM cuentas WHERE id = ?').bind(perfil.cuenta_id).first<{ plan: string }>();
  if (cuenta?.plan !== 'completo') return json({ ok: false, error: 'El control del tratamiento es parte del plan completo' }, origin, { status: 403 });

  const ojo = b?.indicacion_ojo;
  if (ojo !== 'alternar' && ojo !== 'derecho' && ojo !== 'izquierdo') return malo('Elige qué ojo se tapa');
  const diasArr = Array.isArray(b?.indicacion_dias) ? (b!.indicacion_dias as unknown[]) : [];
  const dias = [...new Set(diasArr.map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6).sort();
  if (!dias.length) return malo('Elige al menos un día de la semana');

  const meta = b?.premio_meta == null || b.premio_meta === '' ? null : Math.round(Number(b.premio_meta));
  if (meta !== null && !(meta >= 1 && meta <= 7)) return malo('La meta del premio va de 1 a 7 días');
  const premioTexto = typeof b?.premio_texto === 'string' ? b.premio_texto.trim().slice(0, 60) : '';

  const fecha = typeof b?.control_fecha === 'string' && b.control_fecha ? b.control_fecha : null;
  if (fecha !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha)))) return malo('La fecha del control no es válida');
  const hora = typeof b?.control_hora === 'string' && b.control_hora ? b.control_hora : null;
  if (hora !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return malo('La hora del control no es válida');
  const detalle = typeof b?.control_detalle === 'string' ? b.control_detalle.trim().slice(0, 80) : '';
  const preguntas = typeof b?.control_preguntas === 'string' ? b.control_preguntas.trim().slice(0, 1500) : '';
  const resumen = b?.resumen_activo === false || b?.resumen_activo === 0 ? 0 : 1;

  // si cambió la fecha del control, el aviso vuelve a quedar pendiente
  const previa = await env.DB.prepare('SELECT control_fecha FROM configuracion WHERE paciente_id = ?').bind(pacienteId).first<{ control_fecha: string | null }>();
  const reiniciarAviso = (previa?.control_fecha ?? null) !== fecha;

  await env.DB.prepare(
    `INSERT INTO configuracion (paciente_id, indicacion_ojo, indicacion_dias, premio_meta, premio_texto, control_fecha, control_hora,
                                control_detalle, control_preguntas, resumen_activo, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))
     ON CONFLICT(paciente_id) DO UPDATE SET
       indicacion_ojo = ?2, indicacion_dias = ?3, premio_meta = ?4, premio_texto = ?5, control_fecha = ?6, control_hora = ?7,
       control_detalle = ?8, control_preguntas = ?9, resumen_activo = ?10, updated_at = datetime('now')`
  ).bind(pacienteId, ojo, dias.join(','), meta, premioTexto || null, fecha, hora, detalle || null, preguntas || null, resumen).run();
  if (reiniciarAviso) await env.DB.prepare('UPDATE configuracion SET control_aviso_enviado = NULL WHERE paciente_id = ?').bind(pacienteId).run();

  await avisarCambio(env, pacienteId);
  return json({ ok: true }, origin);
};

// "Se sacó el parche": cualquiera de la familia puede anotarlo (aunque otra persona haya
// registrado el parche). hora = null lo deshace.
export const sacarParche: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const b = await readJson<{ paciente_id?: string; fecha?: string; hora?: string | null }>(request);
  const pacienteId = b?.paciente_id, fecha = b?.fecha;
  if (typeof pacienteId !== 'string' || typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ ok: false, error: 'Datos inválidos' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });
  const cuenta = await env.DB.prepare('SELECT plan FROM cuentas WHERE id = ?').bind(perfil.cuenta_id).first<{ plan: string }>();
  if (cuenta?.plan !== 'completo') return json({ ok: false, error: 'Registrar cuándo se sacó el parche es parte del plan completo' }, origin, { status: 403 });

  const reg = await env.DB.prepare('SELECT hora FROM registros WHERE paciente_id = ? AND fecha = ?').bind(pacienteId, fecha).first<{ hora: string }>();
  if (!reg) return json({ ok: false, error: 'Ese día no tiene parche registrado' }, origin, { status: 404 });

  let horaFin: string | null = null;
  if (b?.hora != null) {
    const ms = Date.parse(b.hora);
    if (Number.isNaN(ms) || ms < Date.parse(reg.hora) || ms > Date.now() + 5 * 60000) {
      return json({ ok: false, error: 'La hora en que se sacó el parche no es válida' }, origin, { status: 400 });
    }
    horaFin = new Date(ms).toISOString();
  }
  // con "se sacó" ya no hace falta el aviso de "ya se puede sacar"
  await env.DB.prepare('UPDATE registros SET hora_fin = ?, notificado = CASE WHEN ? IS NULL THEN notificado ELSE 1 END WHERE paciente_id = ? AND fecha = ?')
    .bind(horaFin, horaFin, pacienteId, fecha).run();
  await avisarCambio(env, pacienteId);
  return json({ ok: true }, origin);
};

export const guardarConfig: Handler = async (request, env, origin) => {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return json({ ok: false, error: 'No autenticado' }, origin, { status: 401 });
  const body = await readJson<{ paciente_id?: string; duracion_minutos?: number }>(request);
  const pacienteId = body?.paciente_id;
  const minutos = Math.round(Number(body?.duracion_minutos));
  if (typeof pacienteId !== 'string' || !(minutos >= 1 && minutos <= 1440)) return json({ ok: false, error: 'Datos inválidos' }, origin, { status: 400 });
  if (!(await pacienteDeLaCuenta(env, pacienteId, perfil.cuenta_id))) return json({ ok: false, error: 'No encontrado' }, origin, { status: 404 });

  const cuenta = await env.DB.prepare('SELECT plan FROM cuentas WHERE id = ?').bind(perfil.cuenta_id).first<{ plan: string }>();
  if (cuenta?.plan !== 'completo') return json({ ok: false, error: 'El temporizador es parte del plan completo' }, origin, { status: 403 });

  await env.DB.prepare(
    `INSERT INTO configuracion (paciente_id, duracion_minutos, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(paciente_id) DO UPDATE SET duracion_minutos = excluded.duracion_minutos, updated_at = datetime('now')`
  ).bind(pacienteId, minutos).run();
  return json({ ok: true }, origin);
};
