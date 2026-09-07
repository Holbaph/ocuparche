// redimir-codigo — activa el plan completo de TU cuenta con un código de un
// solo uso. Usa la service role key porque necesita: (1) leer la tabla
// codigos_activacion, a la que un usuario normal no tiene acceso por RLS, y
// (2) actualizar el plan de tu cuenta, que tampoco puedes tocar tú mismo.
//
// Responde siempre HTTP 200 con { ok: true } o { ok: false, error }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
      .select('cuenta_id, role')
      .eq('id', userData.user.id)
      .single()

    if (perfilError || !perfil) {
      return json({ ok: false, error: 'No se pudo cargar tu perfil' })
    }
    if (perfil.role !== 'admin') {
      return json({ ok: false, error: 'Solo la administradora/or de la cuenta puede activar el plan' })
    }

    let body: { codigo?: string }
    try {
      body = await req.json()
    } catch {
      return json({ ok: false, error: 'Solicitud inválida' })
    }

    const codigo = String(body?.codigo || '').trim().toUpperCase()
    if (!codigo) return json({ ok: false, error: 'Escribe el código' })

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: fila, error: filaError } = await adminClient
      .from('codigos_activacion')
      .select('id, usado')
      .eq('codigo', codigo)
      .maybeSingle()

    if (filaError) return json({ ok: false, error: filaError.message })
    if (!fila) return json({ ok: false, error: 'Ese código no existe' })
    if (fila.usado) return json({ ok: false, error: 'Ese código ya fue usado' })

    const { error: updCodigoError } = await adminClient
      .from('codigos_activacion')
      .update({ usado: true, usado_por_cuenta: perfil.cuenta_id, usado_en: new Date().toISOString() })
      .eq('id', fila.id)
    if (updCodigoError) return json({ ok: false, error: updCodigoError.message })

    const { error: updCuentaError } = await adminClient
      .from('cuentas')
      .update({ plan: 'completo', activado_en: new Date().toISOString() })
      .eq('id', perfil.cuenta_id)
    if (updCuentaError) return json({ ok: false, error: updCuentaError.message })

    return json({ ok: true })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
})
