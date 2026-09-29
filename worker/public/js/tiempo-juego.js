// tiempo-juego.js — UN solo reloj para todo lo que es juego: "Jugar a vestir"
// (js/juego.js) y "Juegos con el parche" (js/juegos-parche.js) gastan del
// mismo tiempo por día, el que define el papá/mamá en Historial → Juego de
// vestir (configuracion.juego_minutos_dia; 0 = sin límite). Portado de
// Ojitos de Mili — acá el tiempo es por hij@ (usa la misma clave que ya
// usaba juego.js: "ocuparche-juego-uso-<pacienteId>"), así comparten el pool.
//
// El tiempo usado se cuenta por dispositivo y por día (localStorage), solo
// mientras la pantalla del juego está visible.

const TiempoJuego = (function () {
  let pacienteId = null;
  let minutosDia = 20;
  let tick = null;
  let reloj = null;       // elemento donde se muestra el tiempo que queda
  let alTerminar = null;

  function usoKey() { return 'ocuparche-juego-uso-' + pacienteId; }
  function uso() {
    const hoy = Utils.todayId();
    try {
      const u = JSON.parse(localStorage.getItem(usoKey()));
      if (u && u.fecha === hoy && typeof u.seg === 'number') return u;
    } catch (e) {}
    return { fecha: hoy, seg: 0 };
  }
  function guardarUso(u) { try { localStorage.setItem(usoKey(), JSON.stringify(u)); } catch (e) {} }

  function configurar(min, elPaciente) {
    if (elPaciente) pacienteId = elPaciente;
    if (typeof min === 'number' && min >= 0) minutosDia = min;
  }
  function segundosRestantes() { return minutosDia > 0 ? Math.max(0, minutosDia * 60 - uso().seg) : Infinity; }
  function agotado() { return segundosRestantes() <= 0; }

  function render() {
    if (!reloj) return;
    const r = segundosRestantes();
    if (r === Infinity) { reloj.classList.add('hidden'); return; }
    reloj.classList.remove('hidden');
    reloj.textContent = '⏱ ' + Math.floor(r / 60) + ':' + String(Math.floor(r % 60)).padStart(2, '0');
    reloj.classList.toggle('poco', r <= 60);
  }

  // Empieza a descontar tiempo. Devuelve false (y llama a onFin) si ya no queda.
  function empezar(elReloj, onFin) {
    detener();
    reloj = elReloj; alTerminar = onFin;
    render();
    if (agotado()) { onFin(); return false; }
    tick = setInterval(() => {
      if (document.hidden) return;
      const u = uso(); u.seg += 1; guardarUso(u);
      render();
      if (agotado()) { const f = alTerminar; detener(); if (f) f(); }
    }, 1000);
    return true;
  }
  function detener() { clearInterval(tick); tick = null; alTerminar = null; }

  function minutosRestantesHoy(min) {
    if (min != null) configurar(min);
    const r = segundosRestantes();
    return r === Infinity ? Infinity : Math.ceil(r / 60);
  }
  function darMasTiempo() { guardarUso({ fecha: Utils.todayId(), seg: 0 }); }

  return { configurar, empezar, detener, agotado, minutosRestantesHoy, darMasTiempo };
})();
