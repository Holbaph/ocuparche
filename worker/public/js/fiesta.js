// fiesta.js — 💃 "Fiesta de baile": los personajes que elige Mili (hasta 4,
// vestidos como los dejó en el juego de vestir) bailan en un escenario con luces.
//
// La música NO viene dentro de la app (tiene derechos de autor). Se elige de
// dónde sale:
//   🎤 Música del celular: la canción suena en Spotify, Apple Music, YouTube,
//      la radio o un parlante, y la app escucha el ritmo con el micrófono para
//      que bailen al compás. El sonido se analiza en el mismo celular: nunca se
//      graba ni se envía. Hay botones para buscar la canción en cada app.
//   ▶️ Video de YouTube: el video oficial se ve dentro de la app (reproductor
//      de YouTube) y bailan al ritmo aproximado de la canción. También se puede
//      pegar el enlace de cualquier video.
// Usa el mismo tiempo de juego por día que los demás juegos (js/tiempo-juego.js).
// Portado de Ojitos de Mili; acá el vestuario y el tiempo son por hij@ (pacienteId).

const Fiesta = (function () {
  const $ = (id) => document.getElementById(id);
  const MAX = 4;
  const GUARDADO = 'ocuparche-fiesta';

  // canciones con su video oficial (se pueden ver incrustadas) y su ritmo
  // aproximado de baile (pasos por minuto)
  const CANCIONES = [
    { n: 'Ay mi gatito miau miau', e: '🐱', yt: 'JUVz3beVAAk', bpm: 120 },
    { n: 'De nada (Moana)', e: '🌊', yt: 'HS2qe2nL2Co', bpm: 104 },
    { n: 'Cuán lejos voy (Moana)', e: '⛵', yt: 'ftNOCfqoIjQ', bpm: 90 },
    { n: 'Soda Pop (Saja Boys)', e: '🥤', yt: '983bBbJx0Mk', bpm: 116 },
    { n: 'Golden (Huntrix)', e: '✨', yt: 'yebNIHKAC4A', bpm: 122 },
    { n: 'Libre soy (Frozen)', e: '❄️', yt: 'rVjI9YRc4pE', bpm: 100 },
    { n: 'No se habla de Bruno (Encanto)', e: '🦋', yt: 'wTi8yLyHeb8', bpm: 103 },
    { n: 'Congelados (Luli Pampín)', e: '💜', yt: 'mnJ7Wk1FASA', bpm: 112 },
  ];
  const BUSCAR = {
    spotify: (q) => 'https://open.spotify.com/search/' + encodeURIComponent(q),
    youtube: (q) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q),
    apple: (q) => 'https://music.apple.com/search?term=' + encodeURIComponent(q),
  };
  const POSES = ['hurra', 'normal', 'victoria', 'abrazo', 'saludo', 'corazon'];
  const PASOS = ['brinco', 'lado-izq', 'giro', 'lado-der', 'inclina', 'brinco', 'agacha', 'aplauso'];

  let abierta = false, cableado = false;
  let pacienteId = null;
  let modo = 'micro';          // 'micro' | 'youtube'
  let bailarines = [];         // ids
  let pasoN = 0;
  let ritmo = { tipo: 'auto', bpm: 100 }; // de dónde salen los golpes
  let timerRitmo = null, raf = null, ultimoGolpe = 0;
  let mic = null;              // { stream, ctx, analyser, datos, energias }
  let bailando = true;

  function leer() { try { return JSON.parse(localStorage.getItem(GUARDADO)) || {}; } catch (e) { return {}; } }
  function guardar() { try { localStorage.setItem(GUARDADO, JSON.stringify({ bailarines, modo })); } catch (e) {} }

  // ---------- el escenario ----------
  function pintarEscenario() {
    const esc = $('fiBailarines');
    if (!bailarines.length) { esc.innerHTML = '<p class="fi-vacio">Elige abajo quién baila 👇</p>'; return; }
    esc.innerHTML = bailarines.map((id, i) =>
      `<div class="fi-bailarin" data-id="${id}" style="--i:${i}"><svg viewBox="0 -20 320 470">${figuraDe(id, 'normal')}</svg><i class="fi-sombra"></i></div>`).join('');
  }
  const figuraDe = (id, pose) => Juego.figura(id, Juego.vestido(id, pacienteId), { pose });

  // un golpe de la música: cada bailarín da un paso (y cambia de pose)
  function golpe(fuerza) {
    if (!abierta || !bailando) return;
    const ahora = performance.now();
    const dur = Math.max(260, Math.min(700, ultimoGolpe ? (ahora - ultimoGolpe) * 0.9 : 500));
    ultimoGolpe = ahora;
    pasoN++;
    document.querySelectorAll('.fi-bailarin').forEach((el, i) => {
      const paso = PASOS[(pasoN + i * 3) % PASOS.length];
      el.style.setProperty('--dur', dur + 'ms');
      el.className = 'fi-bailarin';
      void el.offsetWidth;
      el.classList.add('paso-' + paso);
      if ((pasoN + i) % 2 === 0) {
        const svg = el.querySelector('svg');
        svg.innerHTML = figuraDe(el.dataset.id, POSES[(pasoN / 2 + i) % POSES.length | 0]);
      }
    });
    const luces = $('fiLuces');
    luces.style.setProperty('--h', (pasoN * 47) % 360);
    luces.classList.remove('pulso'); void luces.offsetWidth; luces.classList.add('pulso');
    if (fuerza > 1.6 || pasoN % 8 === 0) confeti();
  }
  function confeti() {
    const esc = $('fiEscenario');
    for (let i = 0; i < 12; i++) {
      const c = document.createElement('span');
      c.className = 'fi-confeti';
      c.style.left = Math.random() * 100 + '%';
      c.style.background = ['#f28bb0', '#7cc4ea', '#f2cf5b', '#8fd48f', '#b392d6'][i % 5];
      c.style.animationDelay = Math.random() * 0.3 + 's';
      c.addEventListener('animationend', () => c.remove());
      esc.appendChild(c);
    }
  }

  // ---------- ritmo fijo (video de YouTube o sin música) ----------
  function ritmoFijo(bpm) {
    clearInterval(timerRitmo);
    ritmo = { tipo: 'auto', bpm };
    timerRitmo = setInterval(() => golpe(1), 60000 / bpm);
  }

  // ---------- ritmo por el micrófono ----------
  async function activarMicro() {
    if (mic) return;
    estadoMicro('Pidiendo permiso para el micrófono…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const fuente = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.2;
      fuente.connect(analyser);
      mic = { stream, ctx, analyser, datos: new Uint8Array(analyser.frequencyBinCount), energias: [], ultimo: 0 };
      clearInterval(timerRitmo);
      ritmo = { tipo: 'micro' };
      estadoMicro('🎤 Escuchando… ¡pon la música fuerte!');
      $('fiMicroBtn').classList.add('hidden');
      escuchar();
    } catch (e) {
      estadoMicro('No se pudo usar el micrófono 😕 Revisa el permiso en los ajustes del celular. Mientras, bailan a su propio ritmo.');
      ritmoFijo(100);
    }
  }
  function apagarMicro() {
    cancelAnimationFrame(raf); raf = null;
    if (mic) { mic.stream.getTracks().forEach((t) => t.stop()); try { mic.ctx.close(); } catch (e) {} }
    mic = null;
  }
  // detecta los golpes (bombo/bajo): energía de los graves por sobre su promedio reciente
  function escuchar() {
    if (!mic || !abierta) return;
    raf = requestAnimationFrame(escuchar);
    mic.analyser.getByteFrequencyData(mic.datos);
    const hz = mic.ctx.sampleRate / mic.analyser.fftSize;
    const hasta = Math.max(2, Math.round(180 / hz));
    let e = 0;
    for (let i = 1; i <= hasta; i++) e += mic.datos[i];
    e /= hasta;
    const h = mic.energias;
    h.push(e); if (h.length > 45) h.shift();
    const prom = h.reduce((a, b) => a + b, 0) / h.length;
    const ahora = performance.now();
    $('fiNivel').style.width = Math.min(100, e / 2.2) + '%';
    if (e > prom * 1.28 && e > 70 && ahora - mic.ultimo > 280) {
      mic.ultimo = ahora;
      golpe(e / Math.max(1, prom));
    } else if (ahora - mic.ultimo > 1600 && ahora - ultimoGolpe > 650) {
      // no se oye música: se balancean suave, a su ritmo
      golpe(0.5);
    }
  }
  const estadoMicro = (t) => { const el = $('fiEstadoMicro'); if (el) el.textContent = t; };

  // ---------- paneles de cada modo ----------
  function pintarModo() {
    document.querySelectorAll('#fiModo button').forEach((b) => b.classList.toggle('active', b.dataset.m === modo));
    const panel = $('fiPanel');
    if (modo === 'micro') {
      panel.innerHTML =
        '<div class="fi-micro">' +
        '<p class="fi-ayuda">Pon la canción en Spotify, Apple Music, YouTube o un parlante, y activa el micrófono: ¡bailan al ritmo de la música! (el sonido no se graba).</p>' +
        '<button class="btn-save fi-grande" id="fiMicroBtn">🎤 Activar micrófono</button>' +
        '<p class="fi-estado" id="fiEstadoMicro">Mientras, bailan a su propio ritmo.</p>' +
        '<div class="fi-medidor"><span id="fiNivel"></span></div>' +
        '<p class="fi-nota">Si la música suena en este mismo iPhone, puede que se pause al activar el micrófono: en ese caso ponla en un parlante, la tele u otro celular.</p>' +
        '<div class="fi-lista">' + CANCIONES.map((c, i) =>
          `<div class="fi-cancion"><span>${c.e} ${c.n}</span><div>` +
          `<button data-ir="spotify" data-i="${i}" aria-label="Buscar en Spotify">Spotify</button>` +
          `<button data-ir="apple" data-i="${i}" aria-label="Buscar en Apple Music">Apple</button>` +
          `<button data-ir="youtube" data-i="${i}" aria-label="Buscar en YouTube">YouTube</button></div></div>`).join('') + '</div></div>';
      if (mic) { $('fiMicroBtn').classList.add('hidden'); estadoMicro('🎤 Escuchando… ¡pon la música fuerte!'); }
      else if (ritmo.tipo !== 'auto' || !timerRitmo) ritmoFijo(100);
    } else {
      panel.innerHTML =
        '<div class="fi-yt">' +
        '<div class="fi-video" id="fiVideo"><p>Elige una canción 👇</p></div>' +
        '<div class="fi-chips">' + CANCIONES.map((c, i) => `<button data-yt="${i}">${c.e} ${c.n}</button>`).join('') + '</div>' +
        '<div class="fi-pegar"><input type="url" id="fiLink" class="fi-input" placeholder="O pega un enlace de YouTube"><button class="btn-save small" id="fiLinkBtn">Ver</button></div>' +
        '</div>';
      if (!timerRitmo) ritmoFijo(100);
    }
  }
  function ponerVideo(id, bpm, titulo) {
    $('fiVideo').innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1" title="${titulo}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    ritmoFijo(bpm);
  }
  const idYoutube = (url) => { const m = String(url).match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/); return m ? m[1] : null; };

  // ---------- elegir bailarines ----------
  function pintarElegir() {
    $('fiPersonajes').innerHTML = Juego.personajes().map((p) => {
      const n = bailarines.indexOf(p.id);
      return `<button class="fi-pj${n >= 0 ? ' activo' : ''}" data-id="${p.id}" aria-label="${p.nombre}">` +
        (n >= 0 ? `<b>${n + 1}</b>` : '') + `<svg viewBox="22 18 276 276">${Juego.figura(p.id, Juego.vestido(p.id, pacienteId))}</svg><span>${p.nombre}</span></button>`;
    }).join('');
  }

  function cablear() {
    $('fiCerrar').addEventListener('click', cerrar);
    $('fiFinOk').addEventListener('click', cerrar);
    $('fiModo').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-m]');
      if (!b || b.dataset.m === modo) return;
      modo = b.dataset.m; guardar();
      apagarMicro(); clearInterval(timerRitmo); timerRitmo = null;
      pintarModo();
    });
    $('fiPanel').addEventListener('click', (e) => {
      if (e.target.closest('#fiMicroBtn')) { activarMicro(); return; }
      const ir = e.target.closest('button[data-ir]');
      if (ir) { const c = CANCIONES[Number(ir.dataset.i)]; window.open(BUSCAR[ir.dataset.ir](c.n), '_blank', 'noopener'); return; }
      const yt = e.target.closest('button[data-yt]');
      if (yt) {
        const c = CANCIONES[Number(yt.dataset.yt)];
        document.querySelectorAll('.fi-chips button').forEach((x) => x.classList.toggle('activo', x === yt));
        ponerVideo(c.yt, c.bpm, c.n);
        return;
      }
      if (e.target.closest('#fiLinkBtn')) {
        const id = idYoutube($('fiLink').value);
        if (!id) { $('fiLink').classList.add('error'); return; }
        $('fiLink').classList.remove('error');
        ponerVideo(id, 108, 'Video de YouTube');
      }
    });
    $('fiPersonajes').addEventListener('click', (e) => {
      const b = e.target.closest('.fi-pj');
      if (!b) return;
      const id = b.dataset.id, n = bailarines.indexOf(id);
      if (n >= 0) bailarines.splice(n, 1);
      else { bailarines.push(id); if (bailarines.length > MAX) bailarines.shift(); }
      guardar(); pintarElegir(); pintarEscenario();
    });
    $('fiPausa').addEventListener('click', () => {
      bailando = !bailando;
      $('fiPausa').textContent = bailando ? '⏸ Parar el baile' : '▶️ Bailar';
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && mic) estadoMicro('🎤 Escuchando… ¡pon la música fuerte!'); });
  }

  // opts: { minutosDia, pacienteId }
  function abrir(opts) {
    if (!cableado) { cablear(); cableado = true; }
    pacienteId = opts.pacienteId;
    Juego.cargarHijos(opts.hijos);
    const g = leer();
    const ids = Juego.personajes().map((p) => p.id);
    bailarines = (Array.isArray(g.bailarines) ? g.bailarines : []).filter((id) => ids.includes(id)).slice(0, MAX);
    if (!bailarines.length) bailarines = ['hijo-' + pacienteId, 'elsa', 'moana'].filter((id) => ids.includes(id));
    modo = g.modo === 'youtube' ? 'youtube' : 'micro';
    abierta = true; bailando = true; pasoN = 0; ultimoGolpe = 0;
    $('fiPausa').textContent = '⏸ Parar el baile';
    TiempoJuego.configurar(opts.minutosDia, opts.pacienteId);
    $('fiFin').classList.add('hidden');
    $('fiesta').classList.remove('hidden');
    document.body.classList.add('jugando');
    pintarEscenario(); pintarElegir(); pintarModo();
    TiempoJuego.empezar($('fiReloj'), () => { detener(); $('fiFin').classList.remove('hidden'); });
  }
  function detener() {
    abierta = false;
    clearInterval(timerRitmo); timerRitmo = null;
    apagarMicro();
    const v = $('fiVideo'); if (v) v.innerHTML = '';
  }
  function cerrar() {
    detener();
    TiempoJuego.detener();
    const f = $('fiesta'); if (f) f.classList.add('hidden');
    document.body.classList.remove('jugando');
  }

  return { abrir, cerrar, CANCIONES };
})();
