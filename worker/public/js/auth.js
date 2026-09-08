// auth.js — sesión, alta libre, invitar, códigos. Habla con la API propia
// (worker/), ya no con Supabase.

const Auth = {
  async getSesionYPerfil() {
    const { status, data } = await api('/me');
    if (status !== 200 || !data?.ok) return null;
    return { perfil: data.perfil, cuenta: data.cuenta };
  },

  async registrarse(email, password, nombre) {
    const { data } = await api('/signup', { method: 'POST', body: { email, password, nombre } });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo crear la cuenta');
  },

  async login(email, password) {
    const { data } = await api('/login', { method: 'POST', body: { email, password } });
    if (!data?.ok) throw new Error(data?.error || 'Correo o contraseña incorrectos');
  },

  async logout() {
    await api('/logout', { method: 'POST' });
  },

  async pedirRecuperacion(email) {
    const { data } = await api('/forgot-password', { method: 'POST', body: { email } });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo enviar el enlace');
  },

  async fijarContrasenaConToken(token, password) {
    const { data } = await api('/reset-password', { method: 'POST', body: { token, password } });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo guardar la contraseña');
  },

  async aceptarInvitacion(token, password) {
    const { data } = await api('/accept-invite', { method: 'POST', body: { token, password } });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo aceptar la invitación');
  },

  async listarPersonas() {
    const { data } = await api('/personas');
    return data?.ok ? data.personas : [];
  },

  async actualizarNombre(nombre) {
    const { data } = await api('/me', { method: 'PATCH', body: { nombre } });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo actualizar');
  },

  async invitarPersona(email, nombre) {
    const { data } = await api('/invitar', { method: 'POST', body: { email, nombre } });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo invitar');
    return data;
  },

  async canjearCodigo(codigo) {
    const { data } = await api('/canjear-codigo', { method: 'POST', body: { codigo } });
    if (!data?.ok) throw new Error(data?.error || 'Código inválido');
    return data;
  },

  // ---------- solo para es_dueño (el servidor también lo comprueba) ----------
  async generarCodigo(nota) {
    const { data } = await api('/codigos', { method: 'POST', body: { nota } });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo generar el código');
    return data.codigo;
  },

  async listarCodigos() {
    const { data } = await api('/codigos');
    return data?.ok ? data.codigos : [];
  },
};
