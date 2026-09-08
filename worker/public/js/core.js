// core.js — fechas/horas, pacientes, registros (+ tiempo real por
// WebSocket), duración del temporizador y avisos push.

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
  async listar() {
    const { data } = await api('/pacientes');
    return data?.ok ? data.pacientes : [];
  },
  async crear(nombre) {
    const { data } = await api('/pacientes', { method: 'POST', body: { nombre } });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo agregar');
    return data.paciente;
  },
  async renombrar(id, nombre) {
    const { data } = await api('/pacientes', { method: 'PATCH', body: { id, nombre } });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo renombrar');
  },
  async eliminar(id) {
    const { data } = await api(`/pacientes?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo eliminar');
  },
};

function rowToRegistro(r) {
  return { fecha: r.fecha, ojo: r.ojo, hora: r.hora, registradoPor: r.registrado_por, id: r.id };
}

// ---------- registros ----------
const DB = {
  async cargarRegistros(pacienteId) {
    const { data } = await api(`/registros?paciente_id=${encodeURIComponent(pacienteId)}`);
    const out = {};
    if (data?.ok) (data.registros || []).forEach(r => { out[r.fecha] = rowToRegistro(r); });
    return out;
  },

  async guardarRegistro(pacienteId, fecha, ojo, horaISO) {
    const { data } = await api('/registros', { method: 'PUT', body: { paciente_id: pacienteId, fecha, ojo, hora: horaISO } });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo guardar');
  },

  async eliminarRegistro(pacienteId, fecha) {
    const { data } = await api(`/registros?paciente_id=${encodeURIComponent(pacienteId)}&fecha=${encodeURIComponent(fecha)}`, { method: 'DELETE' });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo eliminar');
  },

  // WebSocket al Durable Object del paciente — devuelve un objeto con
  // .cerrar() para desconectar al cambiar de paciente o cerrar sesión.
  suscribirRegistros(pacienteId, onChange) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws = null;
    let cerrado = false;
    let intentos = 0;

    function conectar() {
      if (cerrado) return;
      ws = new WebSocket(`${proto}//${location.host}/api/realtime?paciente_id=${encodeURIComponent(pacienteId)}`);
      ws.addEventListener('open', () => { intentos = 0; });
      ws.addEventListener('message', () => onChange());
      ws.addEventListener('close', () => {
        if (cerrado) return;
        // reconexión con espera creciente — un corte de red no debe dejar
        // la sincronización en vivo muerta para siempre.
        intentos++;
        setTimeout(conectar, Math.min(1000 * intentos, 15000));
      });
      ws.addEventListener('error', () => { try { ws.close(); } catch (e) {} });
    }
    conectar();

    return { cerrar() { cerrado = true; try { ws && ws.close(); } catch (e) {} } };
  },
};

// ---------- duración del parche (por paciente) ----------
const Config = {
  async obtenerDuracionMinutos(pacienteId) {
    const { data } = await api(`/config?paciente_id=${encodeURIComponent(pacienteId)}`);
    return data?.ok ? data.duracion_minutos : 120;
  },
  async guardarDuracionMinutos(pacienteId, minutos) {
    const { data } = await api('/config', { method: 'PUT', body: { paciente_id: pacienteId, duracion_minutos: minutos } });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo guardar');
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
  async activar() {
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
    const { data } = await api('/push-subscriptions', {
      method: 'POST',
      body: { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    if (!data?.ok) throw new Error(data?.error || 'No se pudo activar');
  },
  async desactivar() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api(`/push-subscriptions?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' });
      await sub.unsubscribe();
    }
  },
};
