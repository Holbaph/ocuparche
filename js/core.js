// core.js — fechas/horas y la capa de datos de pacientes/registros/config.
// Todo queda ligado a un paciente (a diferencia de Ojitos de Mili, donde
// había un solo niño implícito) — la cuenta puede tener varios.

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

const Utils = {
  dateId(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  todayId() { return Utils.dateId(new Date()); },
  parseId(id) { const [y, m, d] = id.split('-').map(Number); return new Date(y, m - 1, d); },
  fmtLong(d) { return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; },
  fmtShort(d) { return `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; },
  fmtTime(iso) {
    try {
      const d = new Date(iso);
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      const ap = h >= 12 ? 'p.m.' : 'a.m.';
      h = h % 12; if (h === 0) h = 12;
      return `${h}:${m} ${ap}`;
    } catch (e) { return ''; }
  },
  label(side) { return side === 'derecho' ? 'Derecho' : 'Izquierdo'; },
  iniciales(nombre) {
    if (!nombre) return '?';
    return nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  },
};

// ---------- pacientes ----------
const Pacientes = {
  async listar(cuentaId) {
    const { data, error } = await supabaseClient
      .from('pacientes')
      .select('id, nombre, created_at')
      .eq('cuenta_id', cuentaId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async crear(cuentaId, nombre) {
    const { data, error } = await supabaseClient
      .from('pacientes')
      .insert({ cuenta_id: cuentaId, nombre })
      .select('id, nombre, created_at')
      .single();
    if (error) throw error;
    return data;
  },
  async renombrar(pacienteId, nombre) {
    const { error } = await supabaseClient.from('pacientes').update({ nombre }).eq('id', pacienteId);
    if (error) throw error;
  },
  async eliminar(pacienteId) {
    const { error } = await supabaseClient.from('pacientes').delete().eq('id', pacienteId);
    if (error) throw error;
  },
};

function rowToRegistro(r) {
  return { fecha: r.fecha, ojo: r.ojo, hora: r.hora, registradoPor: r.registrado_por, id: r.id };
}

// ---------- registros (por paciente) ----------
const DB = {
  async cargarRegistros(pacienteId) {
    const { data, error } = await supabaseClient
      .from('registros')
      .select('id, fecha, ojo, hora, registrado_por')
      .eq('paciente_id', pacienteId)
      .order('fecha', { ascending: false })
      .limit(400);
    if (error) throw error;
    const out = {};
    (data || []).forEach(r => { out[r.fecha] = rowToRegistro(r); });
    return out;
  },

  async guardarRegistro(pacienteId, fecha, ojo, horaISO, userId) {
    const { error } = await supabaseClient
      .from('registros')
      .upsert(
        { paciente_id: pacienteId, fecha, ojo, hora: horaISO || new Date().toISOString(), registrado_por: userId, notificado: false },
        { onConflict: 'paciente_id,fecha' }
      );
    if (error) throw error;
  },

  async eliminarRegistro(pacienteId, fecha) {
    const { error } = await supabaseClient.from('registros').delete().eq('paciente_id', pacienteId).eq('fecha', fecha);
    if (error) throw error;
  },

  // Realtime por paciente — cada vez que cambias de paciente hay que
  // desuscribirse de la anterior y suscribirse a la nueva (ver app.js).
  suscribirRegistros(pacienteId, onChange) {
    return supabaseClient
      .channel('registros-' + pacienteId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registros', filter: `paciente_id=eq.${pacienteId}` }, onChange)
      .subscribe();
  },
};

// ---------- duración del parche (por paciente) ----------
const Config = {
  async obtenerDuracionMinutos(pacienteId) {
    const { data, error } = await supabaseClient
      .from('configuracion')
      .select('duracion_minutos')
      .eq('paciente_id', pacienteId)
      .maybeSingle();
    if (error || !data) return 120;
    return data.duracion_minutos;
  },
  async guardarDuracionMinutos(pacienteId, minutos) {
    const { error } = await supabaseClient
      .from('configuracion')
      .upsert({ paciente_id: pacienteId, duracion_minutos: minutos, updated_at: new Date().toISOString() });
    if (error) throw error;
  },
};

// ---------- avisos push ----------
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const Push = {
  soportado() {
    return PUSH_CONFIGURADO && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },
  instalada() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  },
  async estaSuscrito() {
    if (!this.soportado()) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  },
  async activar(userId) {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') throw new Error('No diste permiso para las notificaciones');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    const { error } = await supabaseClient.from('push_subscriptions').upsert(
      { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
      { onConflict: 'endpoint' }
    );
    if (error) throw error;
  },
  async desactivar() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabaseClient.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  },
};
