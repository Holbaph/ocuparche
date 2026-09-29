// camara.js — la cámara "estilo Snapchat" con el personaje del juego de vestir
// (o el avatar de un hij@). Portado de Ojitos de Mili.
//
// Todo se ve en un solo canvas que pinta js/ar.js: el video, el personaje y
// los efectos. Abajo hay un carrusel con tres pestañas:
//   🧸 Personaje — el personaje quieto con una pose; se mueve con el dedo y se
//                  agranda pellizcando (o con ➕/➖);
//   ✨ Con IA    — el personaje juega con quien sale en la foto (abrazo,
//                  escondidas, copión, choca los cinco, baile…);
//   🎭 Filtros   — filtros de cara (perrito, conejita, corona…), que se
//                  pueden combinar con el personaje.
// El botón grande: tocar = foto (a la resolución completa de la cámara);
// mantener apretado = video (hasta 15 s). 🎨 cambia el color de la imagen.
//
// La IA (MediaPipe) corre en el mismo celular: la imagen de la cámara no se
// envía a ningún lado. Las fotos y videos se guardan SOLO en este dispositivo
// (IndexedDB, "Mis fotos"): no se suben al servidor ni a ningún otro lado,
// porque son de niños. Sin cámara (o sin permiso) igual se puede sacar la
// foto sobre un fondo de colores.

const Camara = (function () {
  const $ = (id) => document.getElementById(id);
  const MAX_FOTOS = 60;
  const MAX_VIDEO_S = 15;
  const ESPERA_VIDEO_MS = 380;   // cuánto hay que mantener apretado para grabar

  let stream = null;
  let frontal = true;            // cámara de adelante (selfie)
  let dibujante = null;          // (o: { pose, parche, sinBrazo }) => SVG del personaje
  let brazoInfo = null;
  let limitado = false;          // personaje sin poses (Olaf, Stitch…): menos acciones
  let manoGlobos = null;
  let conParche = false;         // si el personaje puede llevar el parche (el avatar de un hij@)
  let parche = 'ninguno';        // 'ninguno' | 'derecho' | 'izquierdo'
  let pestana = 'avatar';        // 'avatar' | 'ia' | 'lentes'
  let sel = { avatar: 'normal', ia: null, lente: null }; // lo elegido en cada pestaña
  let fotoActual = null;         // { id, blob, url }
  let urlsGaleria = [];
  let cableado = false;
  let conCuenta = false, contando = false;
  let grabacion = null;          // { rec, timer }

  // ---------- cámara ----------
  async function iniciarCamara() {
    detenerCamara();
    const video = $('camVideo');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('sin cámara');
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: frontal ? 'user' : 'environment', width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play().catch(() => {});
      $('camSin').classList.add('hidden');
    } catch (e) {
      stream = null;
      $('camSin').classList.remove('hidden');
    }
    RA.cambiar({ fuente: video, espejo: frontal });
  }
  function detenerCamara() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    const video = $('camVideo');
    if (video) video.srcObject = null;
  }

  function ayuda(texto) { $('camAyuda').textContent = texto; }
  let avisoT = null;
  function aviso(texto) {
    const el = $('camAviso');
    el.textContent = texto;
    el.classList.remove('hidden', 'sale'); void el.offsetWidth; el.classList.add('sale');
    clearTimeout(avisoT); avisoT = setTimeout(() => el.classList.add('hidden'), 1400);
  }

  // ---------- carrusel ----------
  function itemsDe(tab) {
    if (tab === 'avatar') {
      const poses = limitado ? RA.POSES.filter((p) => p.v === 'normal') : RA.POSES;
      return [{ v: 'nada', e: '🚫', n: 'Sin personaje' }, ...poses];
    }
    if (tab === 'ia') return RA.ACCIONES.filter((a) => !limitado || RA.SIN_POSES.includes(a.v));
    return [{ v: 'nada', e: '🚫', n: 'Sin filtro' }, ...RA.LENTES];
  }
  function elegido(tab) {
    if (tab === 'avatar') return sel.ia ? null : sel.avatar;
    if (tab === 'ia') return sel.ia;
    return sel.lente || 'nada';
  }
  function pintarCarrusel() {
    document.querySelectorAll('#camTabs button').forEach((b) => {
      const on = b.dataset.tab === pestana;
      b.classList.toggle('activo', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const actual = elegido(pestana);
    $('camCarrusel').innerHTML = itemsDe(pestana).map((it) =>
      `<button class="cam-item${it.v === actual ? ' activo' : ''}" data-v="${it.v}" aria-label="${it.n}"><span class="cam-item-e">${it.e}</span><span class="cam-item-n">${it.n}</span></button>`).join('');
    const act = $('camCarrusel').querySelector('.activo');
    if (act) act.scrollIntoView({ block: 'nearest', inline: 'center' });
    // herramientas que solo sirven con el personaje quieto
    const manual = !sel.ia && sel.avatar !== 'nada';
    ['camEspejo', 'camMas', 'camMenos'].forEach((id) => $(id).classList.toggle('hidden', !manual));
  }
  async function elegir(v) {
    if (pestana === 'avatar') {
      sel.avatar = v; sel.ia = null;
      await RA.setAvatar(v === 'nada' ? { modo: null } : { modo: 'manual', pose: v });
    } else if (pestana === 'ia') {
      if (sel.ia === v) { // tocar otra vez la misma acción la apaga
        sel.ia = null;
        await RA.setAvatar(sel.avatar === 'nada' ? { modo: null } : { modo: 'manual', pose: sel.avatar });
      } else {
        sel.ia = v;
        if (!stream) ayuda('Para esto hace falta la cámara encendida 📷');
        pintarCarrusel();
        try { await RA.setAvatar({ modo: 'ia', accion: v }); } catch (e) { sel.ia = null; ayuda('No se pudo cargar la IA (revisa el internet)'); RA.setAvatar({ modo: 'manual', pose: sel.avatar === 'nada' ? 'normal' : sel.avatar }); }
      }
    } else {
      sel.lente = v === 'nada' ? null : v;
      pintarCarrusel();
      try { await RA.setLente(sel.lente); } catch (e) { sel.lente = null; RA.setLente(null); ayuda('No se pudo cargar el filtro (revisa el internet)'); }
    }
    pintarCarrusel();
  }

  function pintarParche() {
    const bp = $('camParche');
    bp.classList.toggle('hidden', !conParche);
    bp.classList.toggle('activo', parche !== 'ninguno');
    bp.setAttribute('aria-label', { ninguno: 'Parche: sin parche', derecho: 'Parche: ojo derecho', izquierdo: 'Parche: ojo izquierdo' }[parche]);
  }

  // ---------- foto ----------
  async function cuentaRegresiva() {
    const el = $('camCuenta');
    for (const n of [3, 2, 1]) {
      el.textContent = n;
      el.classList.remove('hidden', 'late'); void el.offsetWidth; el.classList.add('late');
      await new Promise((r) => setTimeout(r, 1000));
    }
    el.classList.add('hidden');
  }
  async function foto() {
    if (contando) return;
    if (conCuenta) { contando = true; await cuentaRegresiva(); contando = false; }
    const c = RA.capturar();
    flash();
    RA.celebrar(); // chispitas en la vista (la foto ya salió)
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
    if (blob) guardarYMostrar(blob);
  }
  function flash() {
    const f = $('camFlash');
    f.classList.remove('activo'); void f.offsetWidth; f.classList.add('activo');
  }

  // ---------- video (mantener apretado) ----------
  function empezarVideo() {
    if (grabacion || !RA.puedeGrabar()) return false;
    let rec;
    try { rec = RA.grabar(); } catch (e) { return false; }
    const inicio = performance.now();
    const btn = $('camDisparo');
    btn.classList.add('grabando');
    $('camRec').classList.remove('hidden');
    const tic = () => {
      const s = (performance.now() - inicio) / 1000;
      btn.style.setProperty('--p', Math.min(1, s / MAX_VIDEO_S).toFixed(3));
      $('camRec').textContent = '● ' + Math.floor(s) + ' s';
      if (s >= MAX_VIDEO_S) terminarVideo();
    };
    grabacion = { rec, timer: setInterval(tic, 100) };
    tic();
    return true;
  }
  function limpiarGrabacion() {
    const btn = $('camDisparo');
    btn.classList.remove('grabando', 'apretado'); btn.style.removeProperty('--p');
    $('camRec').classList.add('hidden');
  }
  async function terminarVideo() {
    if (!grabacion) return;
    const g = grabacion; grabacion = null;
    clearInterval(g.timer);
    limpiarGrabacion();
    const blob = await g.rec.detener();
    if (blob && blob.size) guardarYMostrar(blob);
  }

  function cablearDisparo() {
    const btn = $('camDisparo');
    let apretado = null;
    btn.addEventListener('pointerdown', (e) => {
      if (contando || grabacion) return;
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* igual funciona */ }
      apretado = { t: setTimeout(() => { if (apretado) apretado.video = empezarVideo(); }, ESPERA_VIDEO_MS), video: false };
      btn.classList.add('apretado');
    });
    const soltar = (cancelado) => {
      btn.classList.remove('apretado');
      if (grabacion) { terminarVideo(); apretado = null; return; }
      if (!apretado) return;
      clearTimeout(apretado.t);
      const eraVideo = apretado.video;
      apretado = null;
      if (!eraVideo && !cancelado) foto();
    };
    btn.addEventListener('pointerup', () => soltar(false));
    btn.addEventListener('pointercancel', () => soltar(true));
    // con teclado (Enter / espacio) = foto
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); foto(); } });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------- mover y agrandar al personaje (dedo, pellizco, rueda) ----------
  function cablearGestos() {
    const cv = $('camRA');
    const dedos = new Map();
    let arrastre = false, distInicial = 0;
    const frac = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
    const separacion = () => { const [a, b] = [...dedos.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    cv.addEventListener('pointerdown', (e) => {
      const p = frac(e);
      dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* sigue igual */ }
      if (dedos.size === 1) arrastre = RA.enAvatar(p.x, p.y);
      if (dedos.size === 2) { distInicial = separacion(); arrastre = false; }
    });
    cv.addEventListener('pointermove', (e) => {
      const antes = dedos.get(e.pointerId);
      if (!antes) return;
      const r = cv.getBoundingClientRect();
      if (dedos.size === 1 && arrastre) RA.moverAvatar((e.clientX - antes.x) / r.width, (e.clientY - antes.y) / r.height);
      dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (dedos.size === 2 && distInicial > 0) {
        const d = separacion();
        RA.escalarAvatar(d / distInicial);
        distInicial = d;
      }
    });
    const fin = (e) => { dedos.delete(e.pointerId); if (dedos.size < 2) distInicial = 0; if (!dedos.size) arrastre = false; };
    cv.addEventListener('pointerup', fin);
    cv.addEventListener('pointercancel', fin);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); RA.escalarAvatar(e.deltaY < 0 ? 1.08 : 1 / 1.08); }, { passive: false });
  }

  // ---------- guardar / ver / compartir / borrar ----------
  async function guardarYMostrar(blob) {
    let id = null;
    try { id = await guardarFoto(blob); } catch (e) { /* sin IndexedDB: igual se muestra y se puede compartir */ }
    mostrarFoto({ id, blob });
    actualizarMiniatura();
  }
  const esVideo = (blob) => !!blob && /^video\//.test(blob.type);
  function mostrarFoto(f) {
    if (fotoActual && fotoActual.url) URL.revokeObjectURL(fotoActual.url);
    fotoActual = { ...f, url: URL.createObjectURL(f.blob) };
    const vid = esVideo(f.blob);
    const img = $('camFoto'), video = $('camFotoVideo');
    img.classList.toggle('hidden', vid); video.classList.toggle('hidden', !vid);
    if (vid) { img.removeAttribute('src'); video.src = fotoActual.url; video.play().catch(() => {}); }
    else { video.pause(); video.removeAttribute('src'); img.src = fotoActual.url; }
    $('camBorrar').classList.toggle('hidden', fotoActual.id == null);
    $('camResultado').classList.remove('hidden');
  }
  // Al descartar la foto se libera su URL (si no, cada foto quedaría ocupando
  // memoria del navegador hasta recargar la página).
  function cerrarFoto() {
    if (fotoActual && fotoActual.url) URL.revokeObjectURL(fotoActual.url);
    fotoActual = null;
    $('camFoto').removeAttribute('src');
    const v = $('camFotoVideo'); v.pause(); v.removeAttribute('src'); v.load();
    $('camResultado').classList.add('hidden');
    reiniciarBorrar();
  }

  function extension(tipo) {
    if (/mp4/.test(tipo)) return 'mp4';
    if (/webm/.test(tipo)) return 'webm';
    if (/png/.test(tipo)) return 'png';
    return 'jpg';
  }
  async function compartir() {
    if (!fotoActual) return;
    const tipo = fotoActual.blob.type || 'image/jpeg';
    const nombre = 'ocuparche-' + Date.now() + '.' + extension(tipo);
    const archivo = new File([fotoActual.blob], nombre, { type: tipo });
    try {
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: 'Mi foto con mi personaje' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // cerró el menú de compartir
    }
    // sin "compartir": se descarga
    const a = document.createElement('a');
    a.href = fotoActual.url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
  }

  let confirmarBorrar = null;
  function reiniciarBorrar() {
    clearTimeout(confirmarBorrar); confirmarBorrar = null;
    $('camBorrar').textContent = '🗑 Borrar';
  }
  async function borrar() {
    if (!fotoActual || fotoActual.id == null) return;
    if (!confirmarBorrar) {
      $('camBorrar').textContent = '¿Seguro? Toca otra vez';
      confirmarBorrar = setTimeout(reiniciarBorrar, 3000);
      return;
    }
    reiniciarBorrar();
    try { await borrarFoto(fotoActual.id); } catch (e) {}
    cerrarFoto();
    actualizarMiniatura();
    if (!$('camGaleria').classList.contains('hidden')) abrirGaleria();
  }

  // ---------- "Mis fotos" (IndexedDB, solo en este dispositivo) ----------
  function db() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('ocuparche-fotos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('fotos', { keyPath: 'id', autoIncrement: true });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function tx(modo, fn) {
    const base = await db();
    return new Promise((resolve, reject) => {
      const t = base.transaction('fotos', modo);
      const res = fn(t.objectStore('fotos'));
      t.oncomplete = () => resolve(res && 'result' in res ? res.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }
  async function listarFotos() {
    const todas = (await tx('readonly', (s) => s.getAll())) || [];
    return todas.sort((a, b) => b.fecha - a.fecha);
  }
  async function guardarFoto(blob) {
    const id = await tx('readwrite', (s) => s.add({ fecha: Date.now(), blob }));
    // se guardan las últimas MAX_FOTOS
    const todas = await listarFotos();
    if (todas.length > MAX_FOTOS) {
      await tx('readwrite', (s) => { todas.slice(MAX_FOTOS).forEach((f) => s.delete(f.id)); });
    }
    return id;
  }
  function borrarFoto(id) { return tx('readwrite', (s) => s.delete(id)); }

  async function actualizarMiniatura() {
    const img = $('camUltima'), icono = $('camUltimaIcono');
    try {
      const [ultima] = await listarFotos();
      if (img.dataset.url) { URL.revokeObjectURL(img.dataset.url); delete img.dataset.url; }
      if (ultima && !esVideo(ultima.blob)) {
        img.dataset.url = URL.createObjectURL(ultima.blob);
        img.src = img.dataset.url;
        img.classList.remove('hidden');
        icono.textContent = '🖼️';
      } else {
        img.removeAttribute('src'); img.classList.add('hidden');
        icono.textContent = ultima ? '🎬' : '🖼️';
      }
    } catch (e) { img.classList.add('hidden'); }
  }

  function limpiarGaleria() { urlsGaleria.forEach((u) => URL.revokeObjectURL(u)); urlsGaleria = []; }

  async function abrirGaleria() {
    limpiarGaleria();
    const grid = $('camGalGrid');
    let fotos = [];
    try { fotos = await listarFotos(); } catch (e) {}
    grid.innerHTML = '';
    if (!fotos.length) {
      grid.innerHTML = '<p class="cam-gal-vacio">Todavía no hay fotos. ¡Saca la primera! 📸</p>';
    }
    fotos.forEach((f) => {
      const url = URL.createObjectURL(f.blob);
      urlsGaleria.push(url);
      const b = document.createElement('button');
      b.className = 'cam-gal-item';
      const vid = esVideo(f.blob);
      b.setAttribute('aria-label', vid ? 'Ver video' : 'Ver foto');
      let m;
      if (vid) {
        m = document.createElement('video');
        m.muted = true; m.playsInline = true; m.preload = 'metadata'; m.src = url + '#t=0.1';
        const marca = document.createElement('span');
        marca.className = 'cam-gal-play'; marca.textContent = '▶';
        b.appendChild(marca);
      } else {
        m = document.createElement('img');
        m.src = url; m.alt = '';
      }
      b.prepend(m);
      b.addEventListener('click', () => mostrarFoto(f));
      grid.appendChild(b);
    });
    $('camGaleria').classList.remove('hidden');
  }
  function cerrarGaleria() { $('camGaleria').classList.add('hidden'); limpiarGaleria(); }

  function cablear() {
    cablearDisparo();
    cablearGestos();
    $('camCerrar').addEventListener('click', cerrar);
    $('camGirar').addEventListener('click', async () => {
      frontal = !frontal;
      await iniciarCamara();
    });
    $('camTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (b) { pestana = b.dataset.tab; pintarCarrusel(); }
    });
    $('camCarrusel').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (b) elegir(b.dataset.v);
    });
    $('camEspejo').addEventListener('click', () => RA.voltearAvatar());
    $('camMas').addEventListener('click', () => RA.escalarAvatar(1.12));
    $('camMenos').addEventListener('click', () => RA.escalarAvatar(1 / 1.12));
    $('camFiltroBtn').addEventListener('click', () => {
      const f = RA.siguienteFiltro();
      $('camFiltroBtn').classList.toggle('activo', f.v !== 'normal');
      aviso('🎨 ' + f.n);
    });
    $('camParche').addEventListener('click', () => {
      parche = { ninguno: 'derecho', derecho: 'izquierdo', izquierdo: 'ninguno' }[parche];
      pintarParche();
      RA.cambiar({ parche });
      aviso({ ninguno: '🩹 Sin parche', derecho: '🩹 Ojo derecho', izquierdo: '🩹 Ojo izquierdo' }[parche]);
    });
    $('camCuentaBtn').addEventListener('click', () => {
      conCuenta = !conCuenta;
      $('camCuentaBtn').classList.toggle('activo', conCuenta);
      aviso(conCuenta ? '⏱ Espera 3 segundos' : '⏱ Foto al tiro');
    });
    $('camOtra').addEventListener('click', cerrarFoto);
    $('camCompartir').addEventListener('click', compartir);
    $('camBorrar').addEventListener('click', borrar);
    $('camGaleriaBtn').addEventListener('click', abrirGaleria);
    $('camGalCerrar').addEventListener('click', cerrarGaleria);
    document.addEventListener('visibilitychange', () => { if (document.hidden && grabacion) terminarVideo(); });
  }

  // ================= API =================
  // cfg = { dibujar(o: { pose, parche, sinBrazo }) -> SVG, brazo() -> { piel, contorno, manga },
  //         conParche, parche, limitado, manoGlobos }
  // dibujar() arma el SVG desde estados ya validados (Juego.figura /
  // solo colores #rrggbb y opciones de listas cerradas).
  function abrir(cfg) {
    if (!cableado) { cablear(); cableado = true; }
    dibujante = cfg.dibujar;
    brazoInfo = cfg.brazo ? cfg.brazo() : null;
    limitado = !!cfg.limitado;
    manoGlobos = cfg.manoGlobos || null;
    conParche = !!cfg.conParche;
    parche = conParche && cfg.parche ? cfg.parche : 'ninguno';
    pestana = 'avatar';
    sel = { avatar: 'normal', ia: null, lente: null };
    conCuenta = false;
    $('camCuentaBtn').classList.remove('activo');
    $('camFiltroBtn').classList.remove('activo');
    $('camTabs').querySelector('[data-tab="ia"]').classList.toggle('hidden', !brazoInfo);
    pintarParche();
    $('camResultado').classList.add('hidden');
    $('camGaleria').classList.add('hidden');
    $('camara').classList.remove('hidden');
    document.body.classList.add('con-camara');
    ayuda('Mueve al personaje con el dedo · pellizca para agrandarlo');
    RA.iniciar({
      fuente: $('camVideo'), canvas: $('camRA'), espejo: frontal,
      dibujar: dibujante, parche, brazo: brazoInfo, alEstado: ayuda,
      acciones: limitado ? RA.SIN_POSES.filter((v) => v !== 'sorpresa') : null, manoGlobos,
    }).catch(() => ayuda('No se pudo dibujar el personaje 😕'));
    pintarCarrusel();
    iniciarCamara();
    actualizarMiniatura();
  }

  function cerrar() {
    if (grabacion) { clearInterval(grabacion.timer); grabacion.rec.detener(); grabacion = null; limpiarGrabacion(); }
    RA.detener();
    detenerCamara();
    cerrarGaleria();
    cerrarFoto();
    const c = $('camara');
    if (c) c.classList.add('hidden');
    document.body.classList.remove('con-camara');
  }

  return { abrir, cerrar };
})();
