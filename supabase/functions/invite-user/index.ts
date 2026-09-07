// invite-user — invita a una persona nueva a TU cuenta (no crea una cuenta
// nueva para ella). Solo puede llamarla el admin de una cuenta con plan
// completo, y solo mientras queden cupos (admin + hasta 3 personas más).
// Usa la service role key para invitar — nunca llega al navegador.
//
// Responde siempre HTTP 200 con { ok: true } o { ok: false, error }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APP_URL = 'https://holbaph.github.io/ocuparche/app.html'
const MAX_PERSONAS_POR_CUENTA = 4 // admin + hasta 3 invitados

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await callerClient.auth.getUser()
    if (userError || !userData?.user) {
      return json({ ok: false, error: 'No autenticado' })
    }

    const { data: perfil, error: perfilError } = await callerClient
      .from('profiles')
      .select('role, cuenta_id')
      .eq('id', userData.user.id)
      .single()

    if (perfilError || !perfil || perfil.role !== 'admin') {
      return json({ ok: false, error: 'Solo la administradora/or de la cuenta puede invitar personas' })
    }

    const { data: cuenta, error: cuentaError } = await callerClient
      .from('cuentas')
      .select('plan')
      .eq('id', perfil.cuenta_id)
      .single()

    if (cuentaError || !cuenta || cuenta.plan !== 'completo') {
      return json({ ok: false, error: 'Invitar personas es parte del plan completo. Activa tu cuenta primero.' })
    }

    const { count, error: countError } = await callerClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('cuenta_id', perfil.cuenta_id)

    if (countError) return json({ ok: false, error: countError.message })
    if ((count ?? 0) >= MAX_PERSONAS_POR_CUENTA) {
      return json({ ok: false, error: 'Ya alcanzaste el máximo de personas para tu cuenta (admin + 3)' })
    }

    let body: { email?: string; nombre?: string }
    try {
      body = await req.json()
    } catch {
      return json({ ok: false, error: 'Solicitud inválida' })
    }

    const email = String(body?.email || '').trim().toLowerCase()
    const nombre = String(body?.nombre || '').trim()
    if (!email || !email.includes('@')) {
      return json({ ok: false, error: 'Escribe un correo válido' })
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: APP_URL,
      data: { cuenta_id: perfil.cuenta_id, ...(nombre ? { nombre } : {}) },
    })

    if (error) {
      return json({ ok: false, error: error.message })
    }

    return json({ ok: true, userId: data.user?.id })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
})
