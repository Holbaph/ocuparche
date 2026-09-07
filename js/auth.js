// auth.js — sesión, alta libre (a diferencia de Ojitos de Mili, aquí SÍ hay
// registro público: cada quien crea su propia cuenta y queda como admin de
// su propia "cuenta" aislada — ver supabase/schema.sql). Los invitados no se
// registran solos: los invita un admin desde dentro de la app.

const Auth = {
  async getSession() {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) { console.error(error); return null; }
    return data.session;
  },

  async registrarse(email, password, nombre) {
    if (!supabaseClient) throw new Error('Supabase no está configurado');
    const { data, error } = await supabaseClient.auth.signUp({
      email, password,
      options: { data: { nombre }, emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (error) throw error;
    return data;
  },

  async login(email, password) {
    if (!supabaseClient) throw new Error('Supabase no está configurado');
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },

  async logout() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
  },

  async pedirRecuperacion(email) {
    if (!supabaseClient) throw new Error('Supabase no está configurado');
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) throw error;
  },

  async fijarContrasena(password) {
    if (!supabaseClient) throw new Error('Supabase no está configurado');
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;
  },

  async reenviarConfirmacion(email) {
    if (!supabaseClient) throw new Error('Supabase no está configurado');
    const { error } = await supabaseClient.auth.resend({ type: 'signup', email });
    if (error) throw error;
  },

  async getPerfil(userId) {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id, cuenta_id, email, nombre, role, es_dueño, created_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) { console.error(error); return null; }
    return data;
  },

  async getCuenta(cuentaId) {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
      .from('cuentas')
      .select('id, plan, activado_en, created_at')
      .eq('id', cuentaId)
      .maybeSingle();
    if (error) { console.error(error); return null; }
    return data;
  },

  async listarPersonas(cuentaId) {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id, email, nombre, role, es_dueño, created_at')
      .eq('cuenta_id', cuentaId)
      .order('created_at', { ascending: true });
    if (error) { console.error(error); return []; }
    return data;
  },

  async actualizarNombre(userId, nombre) {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.from('profiles').update({ nombre }).eq('id', userId);
    if (error) throw error;
  },

  // Invita a alguien a tu misma cuenta (Edge Function: valida cupo y plan).
  async invitarPersona(email, nombre) {
    if (!supabaseClient) throw new Error('Supabase no está configurado');
    const { data, error } = await supabaseClient.functions.invoke('invite-user', { body: { email, nombre } });
    if (error) throw new Error('No se pudo contactar la función de invitación. ¿Ya la desplegaste? Revisa el README.');
    if (!data || data.ok !== true) throw new Error((data && data.error) || 'No se pudo invitar');
    return data;
  },

  // Canjea un código de activación (Edge Function: usa service role para
  // marcarlo usado y activar el plan completo de tu cuenta).
  async canjearCodigo(codigo) {
    if (!supabaseClient) throw new Error('Supabase no está configurado');
    const { data, error } = await supabaseClient.functions.invoke('redimir-codigo', { body: { codigo } });
    if (error) throw new Error('No se pudo contactar la función de activación.');
    if (!data || data.ok !== true) throw new Error((data && data.error) || 'Código inválido');
    return data;
  },

  // ---------- solo para es_dueño=true (protegido también por RLS) ----------
  async generarCodigo(nota) {
    if (!supabaseClient) throw new Error('Supabase no está configurado');
    const codigo = Array.from({ length: 10 }, () =>
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
    ).join('');
    const { data: sesion } = await supabaseClient.auth.getSession();
    const { error } = await supabaseClient.from('codigos_activacion').insert({
      codigo, nota: nota || null, creado_por: sesion.session.user.id,
    });
    if (error) throw error;
    return codigo;
  },

  async listarCodigos() {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from('codigos_activacion')
      .select('id, codigo, usado, usado_en, nota, creado_en')
      .order('creado_en', { ascending: false })
      .limit(200);
    if (error) { console.error(error); return []; }
    return data;
  },
};
