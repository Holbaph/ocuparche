// send-patch-reminders — la llama pg_cron cada minuto (ver
// supabase/schema_cron.sql), no una persona. Revisa, para cada paciente, si
// el registro de hoy ya cumplió SU tiempo de parche (cada paciente puede
// tener una duración distinta) y, si es así, avisa a todas las personas de
// esa cuenta que tengan avisos activados — aunque nadie tenga la app abierta.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

webpush.setVapidDetails(
  'mailto:ocuparche@gmail.com',
  Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
)

const sb = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const desde = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: registros } = await sb
      .from('registros')
      .select('id, paciente_id, fecha, hora')
      .eq('notificado', false)
      .gte('fecha', desde)

    if (!registros?.length) return json({ ok: true, avisos: 0 })

    const pacienteIds = [...new Set(registros.map((r) => r.paciente_id))]
    const { data: pacientes } = await sb.from('pacientes').select('id, nombre, cuenta_id').in('id', pacienteIds)
    const { data: configs } = await sb.from('configuracion').select('paciente_id, duracion_minutos').in('paciente_id', pacienteIds)

    const pacientePorId: Record<string, { nombre: string; cuenta_id: string }> = {}
    ;(pacientes ?? []).forEach((p) => { pacientePorId[p.id] = { nombre: p.nombre, cuenta_id: p.cuenta_id } })
    const duracionPorPaciente: Record<string, number> = {}
    ;(configs ?? []).forEach((c) => { duracionPorPaciente[c.paciente_id] = c.duracion_minutos })

    const ahora = Date.now()
    const vencidos = registros.filter((r) => {
      const duracionMin = duracionPorPaciente[r.paciente_id] ?? 120
      const fin = new Date(r.hora).getTime() + duracionMin * 60000
      return fin <= ahora
    })

    if (!vencidos.length) return json({ ok: true, avisos: 0 })

    // Agrupa por cuenta para no mandar más de un push por cuenta+paciente.
    const cuentasAvisar = new Map<string, string[]>() // cuenta_id -> [nombres de pacientes]
    vencidos.forEach((r) => {
      const p = pacientePorId[r.paciente_id]
      if (!p) return
      const arr = cuentasAvisar.get(p.cuenta_id) ?? []
      arr.push(p.nombre)
      cuentasAvisar.set(p.cuenta_id, arr)
    })

    if (cuentasAvisar.size) {
      const cuentaIds = [...cuentasAvisar.keys()]
      const { data: perfiles } = await sb.from('profiles').select('id, cuenta_id').in('cuenta_id', cuentaIds)
      const userIds = (perfiles ?? []).map((p) => p.id)
      const { data: subs } = userIds.length
        ? await sb.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds)
        : { data: [] as any[] }

      const perfilPorUser: Record<string, string> = {}
      ;(perfiles ?? []).forEach((p) => { perfilPorUser[p.id] = p.cuenta_id })

      await Promise.allSettled(
        (subs ?? []).map(async (sub) => {
          const cuentaId = perfilPorUser[sub.user_id]
          const nombres = cuentasAvisar.get(cuentaId)
          if (!nombres) return
          const payload = JSON.stringify({
            title: '¡Ya se puede sacar el parche! 🎉',
            body: nombres.length === 1
              ? `Se cumplió el tiempo de hoy para ${nombres[0]}.`
              : `Se cumplió el tiempo de hoy para: ${nombres.join(', ')}.`,
          })
          try {
            await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
          } catch (err) {
            const statusCode = (err as { statusCode?: number })?.statusCode
            if (statusCode === 410 || statusCode === 404) {
              await sb.from('push_subscriptions').delete().eq('id', sub.id)
            }
          }
        })
      )
    }

    await sb.from('registros').update({ notificado: true }).in('id', vencidos.map((r) => r.id))

    return json({ ok: true, avisos: vencidos.length })
  } catch (e) {
    console.error(e)
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
