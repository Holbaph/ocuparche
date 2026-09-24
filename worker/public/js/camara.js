// camara.js — "Sacarse una foto" con el personaje del juego de vestir.
// Portado de Ojitos de Mili (mismo comportamiento).
//
// Abre la cámara del celular (la de adelante por defecto, para que el niño o
// la niña se vea a sí mismo) y pone encima al personaje (o al avatar de un
// hij@): se puede mover con el dedo, cambiar de tamaño, voltear, elegir una
// pose animada (saludo, abrazo…) y, con el avatar de un hij@, ponerle o sacarle
// el parche. Con "🤖 IA", el personaje se ubica
// solo junto a la cara de quien sale en la cámara (MediaPipe, que corre en el
// mismo celular: la imagen de la cámara no se envía a ningún lado). Al sacar
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
  let dibujante = null;           // (o: { pose, parche }) => SVG del personaje
  let poses = [];                 // [{ v, n }] poses disponibles
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
    if (ia.activa) apagarIA();
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
    $('camPoses').querySelectorAll('button').forEach((b) => b.classList.toggle('activo', b.dataset.pose === pose));
    const bp = $('camParche');
    bp.classList.toggle('hidden', !conParche);
    bp.textContent = { ninguno: '🩹 Sin parche', derecho: '🩹 Ojo derecho', izquierdo: '🩹 Ojo izquierdo' }[parche];
  }

  // ================= 🤖 IA: ubicarse junto a la cara =================
  // FaceDetector de MediaPipe (se descarga la primera vez, ~3 MB, y corre en
  // el celular). Busca la cara más grande y pone al personaje al lado, con su
  // cabeza del mismo tamaño y a la misma altura.
  const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODELO = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
  const ia = { activa: false, detector: null, cargando: null, raf: null, ultimo: 0, vista: false };

  async function cargarIA() {
    if (ia.detector) return ia.detector;
    if (!ia.cargando) {
      ia.cargando = (async () => {
        const { FilesetResolver, FaceDetector } = await import(MP + '/vision_bundle.mjs');
        const vision = await FilesetResolver.forVisionTasks(MP + '/wasm');
        const opciones = (delegate) => ({ baseOptions: { modelAssetPath: MODELO, delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.5 });
        try { ia.detector = await FaceDetector.createFromOptions(vision, opciones('GPU')); }
        catch (e) { ia.detector = await FaceDetector.createFromOptions(vision, opciones('CPU')); }
        return ia.detector;
      })();
      ia.cargando.catch(() => { ia.cargando = null; });
    }
    return ia.cargando;
  }

  function ayuda(texto) { $('camAyuda').textContent = texto; }

  function pintarBotonIA() {
    const b = $('camIA');
    b.classList.toggle('activo', ia.activa);
    b.textContent = ia.activa ? '🤖 IA encendida' : '🤖 IA';
  }

  async function encenderIA() {
    if (!stream) { ayuda('La IA necesita la cámara encendida 📷'); return; }
    ia.activa = true; pintarBotonIA();
    ayuda('🤖 Preparando la IA…');
    try { await cargarIA(); }
    catch (e) { ia.activa = false; pintarBotonIA(); ayuda('No se pudo cargar la IA (revisa el internet)'); return; }
    if (!ia.activa) return;
    ayuda('🤖 Buscando tu carita…');
    ia.vista = false;
    cancelAnimationFrame(ia.raf);
    ia.raf = requestAnimationFrame(bucleIA);
  }
  function apagarIA(texto) {
    ia.activa = false; pintarBotonIA();
    cancelAnimationFrame(ia.raf); ia.raf = null;
    ayuda(texto || 'Mueve al personaje con el dedo');
  }

  function bucleIA(t) {
    if (!ia.activa) return;
    ia.raf = requestAnimationFrame(bucleIA);
    const video = $('camVideo');
    if (!stream || !video.videoWidth || t - ia.ultimo < 120) return;
    ia.ultimo = t;
    let caras = [];
    try { caras = ia.detector.detectForVideo(video, performance.now()).detections || []; } catch (e) { return; }
    if (!caras.length) { if (ia.vista) { ia.vista = false; ayuda('🤖 Buscando tu carita…'); } return; }
    if (!ia.vista) { ia.vista = true; ayuda('🤖 ¡Te encontré!'); }
    const cara = caras.reduce((a, b) => (b.boundingBox.width > a.boundingBox.width ? b : a)).boundingBox;

    // de coordenadas del video a la pantalla (object-fit: cover, y espejo si es selfie)
    const v = $('camVista').getBoundingClientRect();
    const k = Math.max(v.width / video.videoWidth, v.height / video.videoHeight);
    const offX = (v.width - video.videoWidth * k) / 2, offY = (v.height - video.videoHeight * k) / 2;
    let x = offX + cara.originX * k;
    const y = offY + cara.originY * k, w = cara.width * k, h = cara.height * k;
    if (frontal) x = v.width - x - w;

    // la cabeza del personaje mide 236/440 de su alto: que quede como la cara
    const diam = w * 1.2;
    const alto = Math.min(v.height * 0.95, Math.max(v.height * 0.25, diam * 440 / 236));
    const junto = pose === 'abrazo' ? 0.3 : 0.62; // en el abrazo se acerca más
    const alLado = (x + w / 2) > v.width / 2 ? -1 : 1; // hacia donde hay más espacio
    const cx = alLado > 0 ? x + w + diam * junto : x - diam * junto;
    const cy = y + h / 2 + alto * 0.1; // centro del personaje (su cabeza está a 0.4 del alto)
    const suave = 0.35;
    tamano += (alto / v.height - tamano) * suave;
    pos.x += (Math.min(1, Math.max(0, cx / v.width)) - pos.x) * suave;
    pos.y += (Math.min(1, Math.max(0, cy / v.height)) - pos.y) * suave;
    $('camTamano').value = Math.round(tamano * 100);
    posicionar();
  }

  // ---------- sacar la foto ----------
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

    // firmita
    const fs = Math.round(W / 26);
    ctx.font = `700 ${fs}px Figtree, system-ui, sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = fs / 3;
    ctx.fillStyle = '#fff';
    ctx.fillText('Ocuparche ✨ ' + new Date().toLocaleDateString('es-CL'), W - fs * 0.7, H - fs * 0.6);

    // flash
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
      if (ia.activa) apagarIA('Lo moviste tú: la IA se apagó');
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
    $('camGirar').addEventListener('click', () => { frontal = !frontal; iniciar(); });
    $('camEspejo').addEventListener('click', () => { espejo = !espejo; posicionar(); });
    $('camTamano').addEventListener('input', (e) => { if (ia.activa) apagarIA(); tamano = Number(e.target.value) / 100; posicionar(); });
    $('camPoses').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-pose]');
      if (b) { pose = b.dataset.pose; redibujar(); }
    });
    $('camParche').addEventListener('click', () => {
      parche = { ninguno: 'derecho', derecho: 'izquierdo', izquierdo: 'ninguno' }[parche];
      redibujar();
    });
    $('camIA').addEventListener('click', () => (ia.activa ? apagarIA() : encenderIA()));
    $('camDisparo').addEventListener('click', disparar);
    $('camOtra').addEventListener('click', cerrarFoto);
    $('camCompartir').addEventListener('click', compartir);
    $('camBorrar').addEventListener('click', borrar);
    $('camGaleriaBtn').addEventListener('click', abrirGaleria);
    $('camGalCerrar').addEventListener('click', cerrarGaleria);
    window.addEventListener('resize', () => { if (!$('camara').classList.contains('hidden')) posicionar(); });
  }

  // ================= API =================
  // cfg = { dibujar(o: { pose, parche }) -> SVG, poses, conParche, parche }
  // dibujar() arma el SVG desde estados ya validados (Juego.figura: solo
  // colores #rrggbb y opciones de listas cerradas).
  function abrir(cfg) {
    if (!cableado) { cablear(); cableado = true; }
    dibujante = cfg.dibujar;
    poses = cfg.poses || [];
    $('camPoses').innerHTML = poses.map((p) => `<button data-pose="${p.v}">${p.n}</button>`).join('');
    conParche = !!cfg.conParche;
    parche = conParche && cfg.parche ? cfg.parche : 'ninguno';
    pose = 'normal';
    redibujar();
    apagarIA();
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
    apagarIA();
    detener();
    cerrarGaleria();
    cerrarFoto();
    const c = $('camara');
    if (c) c.classList.add('hidden');
    document.body.classList.remove('con-camara');
  }

  return { abrir, cerrar };
})();
