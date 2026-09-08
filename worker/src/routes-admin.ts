// routes-admin.ts — panel de control del negocio: estadísticas y lista de
// clientes. Solo para es_dueño=true (se comprueba en cada ruta, no alcanza
// con ocultar el botón en el frontend).
import { json } from './cors';
import { perfilDesdeSesion } from './auth';
import type { Env } from './types';

type Handler = (request: Request, env: Env, origin: string | null) => Promise<Response>;

async function exigirDueño(request: Request, env: Env) {
  const perfil = await perfilDesdeSesion(request, env);
  if (!perfil) return { error: 'No autenticado' as const, status: 401 as const };
  if (!perfil.es_dueño) return { error: 'No autorizado' as const, status: 403 as const };
  return { perfil };
}

export const estadisticas: Handler = async (request, env, origin) => {
  const chequeo = await exigirDueño(request, env);
  if ('error' in chequeo) return json({ ok: false, error: chequeo.error }, origin, { status: chequeo.status });

  const row = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM cuentas) as total_cuentas,
      (SELECT COUNT(*) FROM cuentas WHERE plan = 'completo') as cuentas_completo,
      (SELECT COUNT(*) FROM profiles) as total_personas,
      (SELECT COUNT(*) FROM profiles WHERE role = 'admin') as total_admins,
      (SELECT COUNT(*) FROM profiles WHERE role = 'user') as total_users,
      (SELECT COUNT(*) FROM pacientes) as total_pacientes,
      (SELECT COUNT(*) FROM registros) as total_registros,
      (SELECT COUNT(*) FROM codigos_activacion WHERE usado = 0) as codigos_libres
  `).first();

  return json({ ok: true, stats: row }, origin);
};

export const listarClientes: Handler = async (request, env, origin) => {
  const chequeo = await exigirDueño(request, env);
  if ('error' in chequeo) return json({ ok: false, error: chequeo.error }, origin, { status: chequeo.status });

  const { results } = await env.DB.prepare(`
    SELECT
      c.id, c.plan, c.activado_en, c.created_at,
      p.nombre as admin_nombre, p.email as admin_email,
      (SELECT COUNT(*) FROM pacientes WHERE cuenta_id = c.id) as num_pacientes,
      (SELECT COUNT(*) FROM profiles WHERE cuenta_id = c.id) as num_personas
    FROM cuentas c
    LEFT JOIN profiles p ON p.id = c.admin_id
    ORDER BY c.created_at DESC
    LIMIT 500
  `).all();

  return json({ ok: true, clientes: results }, origin);
};
