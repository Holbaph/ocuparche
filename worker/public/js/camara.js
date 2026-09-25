// camara.js — "Sacarse una foto" con el personaje del juego de vestir.
// Portado de Ojitos de Mili (mismo comportamiento).
//
// Abre la cámara del celular (la de adelante por defecto, para que el niño o
// la niña se vea a sí mismo) y pone encima al personaje (o al avatar de un
// hij@): se puede mover con el dedo, cambiar de tamaño, voltear, elegir una
// pose animada (saludo, abrazo…) y, con el avatar de un hij@, ponerle o sacarle
// el parche. Con los efectos "✨ Con IA" (realidad aumentada, js/ar.js) el
// personaje interactúa con la persona: la abraza (el brazo pasa por detrás),
// le hace orejas de conejo, se asoma y se esconde, etc. MediaPipe corre en el
// mismo celular: la imagen de la cámara no se envía a ningún lado. Al sacar
// la foto se junta todo en una imagen (canvas) que se puede guardar o compartir.
//
// Las fotos se guardan SOLO en este dispositivo (IndexedDB, "Mis fotos"): no
// se suben al servidor ni a ningún otro lado, porque son fotos de niños.
// Si no hay cámara (o no se dio permiso), igual se puede sacar la foto sobre
// un fondo de colores.

const Camara = (function () {
  const $ = (id) => document.getElementById(id);
  const MAX_FOTOS = 60;

  let stream = null;
  let frontal = true;            // cámara de adelante (selfie)
  let espejo = false;            // personaje volteado
  let pos = { x: 0.68, y: 0.64 }; // centro del personaje, en fracción de la vista (a un lado, para que se vea quien está atrás)
  let tamano = 0.45;              // alto del personaje, en fracción de la vista
  let figuraActual = '';
  let dibujante = null;           // (o: { pose, parche, sinBrazo }) => SVG del personaje
  let pose = 'normal';
  let conParche = false;          // si el personaje puede llevar el parche (el avatar de un hij@)
  let parche = 'ninguno';         // 'ninguno' | 'derecho' | 'izquierdo'
  let fotoActual = null;          // { id, blob, url }
  let urlsGaleria = [];
  let cableado = false;

  // ---------- cámara ----------
  async function iniciar() {
    detener();
    const video = $('camVideo');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('sin cámara');
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: frontal ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      video.srcObject = stream;
      video.classList.toggle('selfie', frontal);
      await video.play().catch(() => {});
      $('camSin').classList.add('hidden');
    } catch (e) {
      stream = null;
      $('camSin').classList.remove('hidden');
    }
  }
  function detener() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    const video = $('camVideo');
    if (video) video.srcObject = null;
  }

  // ---------- personaje encima ----------
  function posicionar() {
    const vista = $('camVista').getBoundingClientRect();
    const el = $('camPersonaje');
    const alto = vista.height * tamano, ancho = alto * 320 / 440;
    el.style.width = ancho + 'px';
    el.style.height = alto + 'px';
    el.style.left = (pos.x * vista.width - ancho / 2) + 'px';
    el.style.top = (pos.y * vista.height - alto / 2) + 'px';
    el.style.transform = espejo ? 'scaleX(-1)' : '';
  }

  // redibuja al personaje con la pose y el parche elegidos
  function redibujar() {
    figuraActual = dibujante({ pose, parche });
    $('camPersonajeSvg').innerHTML = figuraActual;
    $('camPersonaje').className = 'cam-personaje pose-' + pose;
    $('camPoses').querySelectorAll('button').forEach((b) => b.classList.toggle('activo', !efecto && b.dataset.pose === pose));
    const bp = $('camParche');
    bp.classList.toggle('hidden', !conParche);
    bp.textContent = { ninguno: '🩹 Sin parche', derecho: '🩹 Ojo derecho', izquierdo: '🩹 Ojo izquierdo' }[parche];
  }

  // ================= ✨ REALIDAD AUMENTADA (js/ar.js) =================
  // Con un efecto elegido, la vista pasa a un canvas donde el avatar
  // interactúa con la persona (el brazo pasa por detrás, etc.).
  let efecto = null;
  let brazoInfo = null;
  let limitado = false;      // personaje sin poses (Olaf, Stitch…): menos efectos
  let manoGlobos = null;
  const SOLO_SIN_POSES = ['sorpresa', 'escondidas', 'corona', 'besito', 'globos', 'saludo'];
  let conCuenta = false;   // ⏱ esperar 3 segundos antes de sacar la foto
  let contando = false;

  // cuenta regresiva 3, 2, 1 (para alcanzar a posar) y después la foto
  async function dispararConCuenta() {
    if (contando) return;
    if (!conCuenta) { await disparar(); return; }
    contando = true;
    const el = $('camCuenta');
    for (const n of [3, 2, 1]) {
      el.textContent = n;
      el.classList.remove('hidden', 'late'); void el.offsetWidth; el.classList.add('late');
      await new Promise((r) => setTimeout(r, 1000));
    }
    el.classList.add('hidden');
    contando = false;
    await disparar();
  }

  function ayuda(texto) { $('camAyuda').textContent = texto; }

  function pintarEfectos() {
    $('camEfectos').querySelectorAll('button').forEach((b) => b.classList.toggle('activo', b.dataset.efecto === efecto));
    $('camPoses').querySelectorAll('button').forEach((b) => b.classList.toggle('activo', !efecto && b.dataset.pose === pose));
    const conRA = !!efecto;
    $('camRA').classList.toggle('hidden', !conRA);
    $('camPersonaje').classList.toggle('hidden', conRA);
    $('camVideo').classList.toggle('oculto', conRA);
    document.querySelector('.cam-tamano').classList.toggle('hidden', conRA);
    $('camEspejo').classList.toggle('invisible', conRA);
  }

  function tamanoCanvas() {
    const v = $('camVista').getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = $('camRA');
    cv.width = Math.round(v.width * dpr); cv.height = Math.round(v.height * dpr);
  }

  async function usarEfecto(e) {
    if (!stream) { ayuda('Para esto hace falta la cámara encendida 📷'); return; }
    efecto = e;
    pintarEfectos();
    if (RA.activo) { RA.cambiar({ efecto: e }); return; }
    tamanoCanvas();
    try {
      await RA.iniciar({
        fuente: $('camVideo'), canvas: $('camRA'), espejo: frontal, efecto: e,
        dibujar: dibujante, parche, brazo: brazoInfo, alEstado: ayuda,
        acciones: limitado ? SOLO_SIN_POSES.filter((v) => v !== 'sorpresa') : null, manoGlobos,
      });
    } catch (err) {
      salirEfecto();
      ayuda('No se pudo cargar la IA (revisa el internet)');
    }
  }
  function salirEfecto() {
    RA.detener();
    efecto = null;
    pintarEfectos();
    ayuda('Mueve al personaje con el dedo');
  }

  // ---------- sacar la foto ----------
  function firma(ctx, W, H) {
    const fs = Math.round(W / 26);
    ctx.font = `700 ${fs}px Figtree, system-ui, sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = fs / 3;
    ctx.fillStyle = '#fff';
    ctx.fillText('Ocuparche ✨ ' + new Date().toLocaleDateString('es-CL'), W - fs * 0.7, H - fs * 0.6);
  }

  function svgComoImagen(ancho, alto) {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440" width="${ancho}" height="${alto}">${figuraActual}</svg>`;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  function fondoSinCamara(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#f9c5d9'); g.addColorStop(0.5, '#d9c8f5'); g.addColorStop(1, '#bfe3f7');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 40; i++) {
      const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * W;
      const y = (Math.sin(i * 78.233) * 12345.678 % 1 + 1) % 1 * H;
      ctx.beginPath(); ctx.arc(x, y, (i % 3 + 1) * W / 320, 0, Math.PI * 2); ctx.fill();
    }
  }

  async function disparar() {
    if (efecto && RA.activo) {
      const ra = $('camRA');
      const c = document.createElement('canvas');
      c.width = ra.width; c.height = ra.height;
      const cx = c.getContext('2d');
      cx.drawImage(ra, 0, 0);
      firma(cx, c.width, c.height);
      RA.celebrar(); // chispitas en la vista (la foto ya salió)
      return guardarYMostrar(c);
    }
    const vista = $('camVista').getBoundingClientRect();
    const escala = Math.min(2, 1600 / vista.width);
    const W = Math.round(vista.width * escala), H = Math.round(vista.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // fondo: lo que ve la cámara (recortado igual que en pantalla) o colores
    const video = $('camVideo');
    if (stream && video.videoWidth) {
      const k = Math.max(W / video.videoWidth, H / video.videoHeight);
      const dw = video.videoWidth * k, dh = video.videoHeight * k;
      ctx.save();
      if (frontal) { ctx.translate(W, 0); ctx.scale(-1, 1); } // igual que el espejo de la pantalla
      ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      fondoSinCamara(ctx, W, H);
    }

    // el personaje, donde está en pantalla
    const r = $('camPersonaje').getBoundingClientRect();
    const x = (r.left - vista.left) * escala, y = (r.top - vista.top) * escala;
    const w = r.width * escala, h = r.height * escala;
    try {
      const img = await svgComoImagen(Math.round(w), Math.round(h));
      ctx.save();
      if (espejo) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); }
      else ctx.drawImage(img, x, y, w, h);
      ctx.restore();
    } catch (e) { /* si no se pudo dibujar el personaje, queda la foto sola */ }

    firma(ctx, W, H);
    return guardarYMostrar(canvas);
  }

  async function guardarYMostrar(canvas) {
    const flash = $('camFlash');
    flash.classList.remove('activo'); void flash.offsetWidth; flash.classList.add('activo');

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) return;
    let id = null;
    try { id = await guardarFoto(blob); } catch (e) { /* sin IndexedDB: igual se muestra y se puede compartir */ }
    mostrarFoto({ id, blob });
    actualizarMiniatura();
  }

  // ---------- ver / compartir / borrar una foto ----------
  function mostrarFoto(f) {
    if (fotoActual && fotoActual.url) URL.revokeObjectURL(fotoActual.url);
    fotoActual = { ...f, url: URL.createObjectURL(f.blob) };
    $('camFoto').src = fotoActual.url;
    $('camBorrar').classList.toggle('hidden', fotoActual.id == null);
    $('camResultado').classList.remove('hidden');
  }
  // Al descartar la foto se libera su URL (si no, cada foto quedaría ocupando
  // memoria del navegador hasta recargar la página).
  function cerrarFoto() {
    if (fotoActual && fotoActual.url) URL.revokeObjectURL(fotoActual.url);
    fotoActual = null;
    $('camFoto').removeAttribute('src');
    $('camResultado').classList.add('hidden');
    reiniciarBorrar();
  }

  async function compartir() {
    if (!fotoActual) return;
    const nombre = 'ocuparche-' + Date.now() + '.jpg';
    const archivo = new File([fotoActual.blob], nombre, { type: 'image/jpeg' });
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
    const img = $('camUltima');
    try {
      const [ultima] = await listarFotos();
      if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
      if (ultima) {
        img.dataset.url = URL.createObjectURL(ultima.blob);
        img.src = img.dataset.url;
        img.classList.remove('hidden');
      } else { img.removeAttribute('src'); img.classList.add('hidden'); delete img.dataset.url; }
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
      b.setAttribute('aria-label', 'Ver foto');
      const img = document.createElement('img');
      img.src = url; img.alt = '';
      b.appendChild(img);
      b.addEventListener('click', () => mostrarFoto(f));
      grid.appendChild(b);
    });
    $('camGaleria').classList.remove('hidden');
  }
  function cerrarGaleria() { $('camGaleria').classList.add('hidden'); limpiarGaleria(); }

  // ---------- mover al personaje con el dedo ----------
  function cablearArrastre() {
    const el = $('camPersonaje');
    let inicio = null;
    el.addEventListener('pointerdown', (e) => {
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* sigue funcionando sin captura */ }
      inicio = { x: e.clientX, y: e.clientY, pos: { ...pos } };
    });
    el.addEventListener('pointermove', (e) => {
      if (!inicio) return;
      const v = $('camVista').getBoundingClientRect();
      pos.x = Math.min(1, Math.max(0, inicio.pos.x + (e.clientX - inicio.x) / v.width));
      pos.y = Math.min(1, Math.max(0, inicio.pos.y + (e.clientY - inicio.y) / v.height));
      posicionar();
    });
    const fin = () => { inicio = null; };
    el.addEventListener('pointerup', fin);
    el.addEventListener('pointercancel', fin);
  }

  function cablear() {
    cablearArrastre();
    $('camCerrar').addEventListener('click', cerrar);
    $('camGirar').addEventListener('click', async () => {
      frontal = !frontal;
      await iniciar();
      if (efecto) { RA.cambiar({ espejo: frontal }); if (!stream) salirEfecto(); }
    });
    $('camEspejo').addEventListener('click', () => { espejo = !espejo; posicionar(); });
    $('camTamano').addEventListener('input', (e) => { tamano = Number(e.target.value) / 100; posicionar(); });
    $('camPoses').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-pose]');
      if (b) { pose = b.dataset.pose; if (efecto) salirEfecto(); redibujar(); }
    });
    $('camEfectos').innerHTML = '<span class="cam-efectos-titulo">✨ Con IA:</span>' +
      RA.EFECTOS.map((e) => `<button data-efecto="${e.v}">${e.n}</button>`).join('');
    $('camEfectos').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-efecto]');
      if (!b) return;
      if (efecto === b.dataset.efecto) salirEfecto(); else usarEfecto(b.dataset.efecto);
    });
    $('camParche').addEventListener('click', () => {
      parche = { ninguno: 'derecho', derecho: 'izquierdo', izquierdo: 'ninguno' }[parche];
      redibujar();
      if (efecto) RA.cambiar({ parche });
    });
    $('camDisparo').addEventListener('click', dispararConCuenta);
    $('camCuentaBtn').addEventListener('click', () => {
      conCuenta = !conCuenta;
      $('camCuentaBtn').classList.toggle('activo', conCuenta);
      $('camCuentaBtn').textContent = conCuenta ? '⏱ Espera 3 s' : '⏱ Al tiro';
    });
    $('camOtra').addEventListener('click', cerrarFoto);
    $('camCompartir').addEventListener('click', compartir);
    $('camBorrar').addEventListener('click', borrar);
    $('camGaleriaBtn').addEventListener('click', abrirGaleria);
    $('camGalCerrar').addEventListener('click', cerrarGaleria);
    window.addEventListener('resize', () => { if (!$('camara').classList.contains('hidden')) { posicionar(); if (efecto) tamanoCanvas(); } });
  }

  // ================= API =================
  // cfg = { dibujar(o: { pose, parche, sinBrazo }) -> SVG, poses, brazo() -> { piel, contorno, manga, pierna },
  //         conParche, parche, limitado, manoGlobos }
  // dibujar() arma el SVG desde estados ya validados (Juego.figura: solo
  // colores #rrggbb y opciones de listas cerradas).
  function abrir(cfg) {
    if (!cableado) { cablear(); cableado = true; }
    dibujante = cfg.dibujar;
    brazoInfo = cfg.brazo ? cfg.brazo() : null;
    limitado = !!cfg.limitado;
    manoGlobos = cfg.manoGlobos || null;
    $('camPoses').classList.toggle('hidden', limitado);
    $('camEfectos').querySelectorAll('button[data-efecto]').forEach((b) => b.classList.toggle('hidden', limitado && !SOLO_SIN_POSES.includes(b.dataset.efecto)));
    $('camPoses').innerHTML = (cfg.poses || []).map((p) => `<button data-pose="${p.v}">${p.n}</button>`).join('');
    conParche = !!cfg.conParche;
    parche = conParche && cfg.parche ? cfg.parche : 'ninguno';
    pose = 'normal';
    efecto = null;
    redibujar();
    pintarEfectos();
    $('camEfectos').classList.toggle('hidden', !brazoInfo);
    ayuda('Mueve al personaje con el dedo');
    $('camTamano').value = Math.round(tamano * 100);
    $('camResultado').classList.add('hidden');
    $('camGaleria').classList.add('hidden');
    $('camara').classList.remove('hidden');
    document.body.classList.add('con-camara');
    posicionar();
    iniciar();
    actualizarMiniatura();
  }

  function cerrar() {
    if (efecto) salirEfecto();
    detener();
    cerrarGaleria();
    cerrarFoto();
    const c = $('camara');
    if (c) c.classList.add('hidden');
    document.body.classList.remove('con-camara');
  }

  return { abrir, cerrar };
})();
