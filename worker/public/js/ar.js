// ar.js — el "motor" de la cámara (estilo Snapchat). Todo se pinta en un
// canvas, cuadro a cuadro:
//   1) el video (con un filtro de color opcional);
//   2) el avatar: quieto donde lo pongas (se arrastra y se pellizca) o
//      jugando con IA — abraza por detrás, se esconde, imita tus brazos,
//      choca los cinco, baila, sopla burbujas…;
//   3) un filtro de cara (lente): orejas de perrito con lengua si abres la
//      boca, conejita, gatito, princesa, ojos de corazón, unicornio con
//      arcoíris, pirata, brillitos;
//   4) chispitas, burbujas, mariposas, globos de diálogo.
//
// La IA es de MediaPipe y corre en el celular (la imagen no sale del
// dispositivo): PoseLandmarker (cuerpo + silueta de la persona) para el
// avatar, y FaceLandmarker (puntos de la cara + gestos, como abrir la boca)
// para los lentes. Se cargan solo cuando se usan.
//
// Todo el estado está en coordenadas relativas, así la misma escena se puede
// pintar en la pantalla o a la resolución completa de la cámara (la foto), y
// también grabar en video.

const RA = (function () {
  const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODELO_POSE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  const MODELO_CARA = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

  // ================= catálogo =================
  const POSES = [
    { v: 'normal', e: '🙂', n: 'Quieta' }, { v: 'saludo', e: '👋', n: 'Saludo' }, { v: 'victoria', e: '✌️', n: 'La V' },
    { v: 'corazon', e: '💗', n: 'Corazón' }, { v: 'hurra', e: '🙌', n: '¡Hurra!' }, { v: 'abrazo', e: '👐', n: 'Brazos abiertos' },
  ];
  const ACCIONES = [
    { v: 'sorpresa', e: '🎲', n: 'Sorpresa' }, { v: 'copion', e: '🪞', n: 'Copión' }, { v: 'choca', e: '✋', n: 'Choca 5' },
    { v: 'baile', e: '💃', n: 'Baile' }, { v: 'escondidas', e: '🙈', n: 'Escondidas' }, { v: 'sentada', e: '🧚', n: 'En tu hombro' },
    { v: 'abrazo', e: '🤗', n: 'Abrazo' }, { v: 'conejito', e: '🐰', n: 'Conejito' }, { v: 'burbujas', e: '🫧', n: 'Burbujas' },
    { v: 'mariposas', e: '🦋', n: 'Mariposas' }, { v: 'globos', e: '🎈', n: 'Globos' }, { v: 'corona', e: '👑', n: 'Corona' },
    { v: 'besito', e: '😘', n: 'Besito' }, { v: 'hombro', e: '🤝', n: 'Hombro' }, { v: 'saludo', e: '👋', n: 'Hola' },
  ];
  // las que sirven para personajes sin poses (Olaf, Stitch…)
  const SIN_POSES = ['sorpresa', 'escondidas', 'burbujas', 'mariposas', 'globos', 'corona', 'besito', 'saludo'];
  const LENTES = [
    { v: 'perrito', e: '🐶', n: 'Perrito' }, { v: 'conejita', e: '🐰', n: 'Conejita' }, { v: 'gatito', e: '🐱', n: 'Gatito' },
    { v: 'princesa', e: '👑', n: 'Princesa' }, { v: 'corazones', e: '😍', n: 'Corazones' }, { v: 'unicornio', e: '🦄', n: 'Unicornio' },
    { v: 'pirata', e: '🏴‍☠️', n: 'Pirata' }, { v: 'brillitos', e: '✨', n: 'Brillitos' },
  ];
  const FILTROS = [
    { v: 'normal', n: 'Normal', f: 'none' },
    { v: 'vivido', n: 'Vívido', f: 'saturate(1.35) contrast(1.08)' },
    { v: 'calido', n: 'Cálido', f: 'sepia(.22) saturate(1.25) brightness(1.03)' },
    { v: 'frio', n: 'Frío', f: 'hue-rotate(-12deg) saturate(1.1) brightness(1.02)' },
    { v: 'sonado', n: 'Soñado', f: 'brightness(1.07) saturate(1.2) contrast(.95)', tinte: 'rgba(255,170,210,.13)' },
    { v: 'bn', n: 'Blanco y negro', f: 'grayscale(1) contrast(1.12)' },
  ];
  const FRASES = {
    escondidas: ['¡Buu!', '¡Aquí estoy!', '¿Me viste?', '¡Te encontré!'],
    sentada: ['¡Qué alto!', '¡Wiii!', '¡Vamos!', '¡Arre, arre!'],
    abrazo: ['¡Te quiero!', '¡Abrazo!', '¡Qué rico abrazo!'],
    conejito: ['Jijiji 🐰', '¡Conejito!', '¡Shhh!'],
    globos: ['¡Estoy volando!', '¡Wiii!', '¡Mira!'],
    corona: ['¡Eres una princesa!', '¡Reina!', '¡Para ti!'],
    besito: ['¡Muack!', '💗', '¡Te quiero!'],
    hombro: ['¡Amigas!', '¡Somos equipo!', '¡Juntas!'],
    saludo: ['¡Hola!', '¡Sonríe!', '¡Qué lindo parche!', '¡Foto!'],
    copion: ['¡Te copio!', '¡Igualita!', '¡Mira, lo mismo!'],
    choca: ['¡Levanta la mano!', '¡Choca esos cinco!'],
    baile: ['¡A bailar!', '¡Wuju!', '♪ ♫'],
    burbujas: ['¡Burbujas!', 'Jiji', '¡Atrápalas!'],
    mariposas: ['¡Mira, mariposas!', '¡Qué lindas!', '🦋'],
  };
  const COLORES_CHISPAS = ['#f6d26b', '#e8578a', '#7cc4ea', '#b392d6', '#6fbf73', '#ffffff'];
  const azar = (a, b) => a + Math.random() * (b - a);
  const elegir = (l) => l[Math.floor(Math.random() * l.length)];
  const mezcla = (a, b, t) => a + (b - a) * t;
  const punto = (a, b, t) => ({ x: mezcla(a.x, b.x, t), y: mezcla(a.y, b.y, t) });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rebote = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const suaveEntre = (x) => x * x * (3 - 2 * x);
  const conFiltros = 'filter' in document.createElement('canvas').getContext('2d');

  // ================= estado =================
  let cfg = null;             // { fuente, canvas, espejo, dibujar(o), parche, brazo, alEstado, acciones, manoGlobos }
  let activo = false, raf = null, tAnterior = 0, ultimoPose = 0, ultimoCara = 0, ultimoEstado = '';
  // el avatar: 'manual' (quieto donde lo pongas), 'ia' (jugando) o null (sin avatar)
  const av = { modo: 'manual', pose: 'normal', accion: null, x: 0.7, y: 0.62, h: 0.42, espejo: false, rect: null };
  let lente = null, filtro = 'normal', grabando = false;
  let datos = null, suave = null, lado = 1;          // persona (pose)
  let cara = null, caraSuave = null;                 // cara (lentes)
  const acc = { v: null, desde: 0, hasta: Infinity, frase: '', de: null, ultimo: null };
  let particulas = [], mariposas = [];
  let luz = 0.55;
  let chocaListo = 0, chocaFrase = -1e9;
  const img = {};
  const det = document.createElement('canvas');      // cuadro chico para la IA
  const mascara = document.createElement('canvas');  // silueta de la persona
  const capa = document.createElement('canvas');     // lo que va detrás de la persona
  const muestra = document.createElement('canvas'); muestra.width = 16; muestra.height = 16;
  const acciones = () => (cfg && cfg.acciones) || ACCIONES.map((a) => a.v).filter((v) => v !== 'sorpresa');
  function estado(t) { if (t !== ultimoEstado) { ultimoEstado = t; if (cfg && cfg.alEstado) cfg.alEstado(t); } }

  // ================= la IA (se carga cuando se usa) =================
  let visionP = null;
  function vision() {
    if (!visionP) {
      visionP = (async () => { const m = await import(MP + '/vision_bundle.mjs'); return { m, fs: await m.FilesetResolver.forVisionTasks(MP + '/wasm') }; })();
      visionP.catch(() => { visionP = null; });
    }
    return visionP;
  }
  let poseDet = null, poseP = null, poseDelegado = 'GPU', siluetasVacias = 0, pasandoACPU = false;
  async function crearPose(delegate) {
    const { m, fs } = await vision();
    return m.PoseLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: MODELO_POSE, delegate }, runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: true,
    });
  }
  function cargarPose() {
    if (poseDet) return Promise.resolve(poseDet);
    if (!poseP) {
      poseP = (async () => {
        try { poseDet = await crearPose('GPU'); poseDelegado = 'GPU'; }
        catch (e) { poseDet = await crearPose('CPU'); poseDelegado = 'CPU'; }
        return poseDet;
      })();
      poseP.catch(() => { poseP = null; });
    }
    return poseP;
  }
  // en algunos equipos la GPU entrega la silueta vacía: se pasa a CPU
  async function pasarACPU() {
    if (pasandoACPU || poseDelegado === 'CPU') return;
    pasandoACPU = true;
    try { const n = await crearPose('CPU'); if (poseDet && poseDet.close) poseDet.close(); poseDet = n; poseDelegado = 'CPU'; } catch (e) { /* sigue igual */ }
    pasandoACPU = false;
  }
  let caraDet = null, caraP = null;
  function cargarCara() {
    if (caraDet) return Promise.resolve(caraDet);
    if (!caraP) {
      caraP = (async () => {
        const { m, fs } = await vision();
        const op = (delegate) => ({ baseOptions: { modelAssetPath: MODELO_CARA, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true });
        try { caraDet = await m.FaceLandmarker.createFromOptions(fs, op('GPU')); }
        catch (e) { caraDet = await m.FaceLandmarker.createFromOptions(fs, op('CPU')); }
        return caraDet;
      })();
      caraP.catch(() => { caraP = null; });
    }
    return caraP;
  }

  function medidas() {
    const f = cfg && cfg.fuente;
    if (!f) return null;
    const w = f.videoWidth || f.naturalWidth || 0, h = f.videoHeight || f.naturalHeight || 0;
    return w && h ? [w, h] : null;
  }
  // los detectores usan marcas de tiempo que siempre avanzan
  let ultimoTs = 0;
  const ts = () => { ultimoTs = Math.max(ultimoTs + 1, performance.now()); return ultimoTs; };
  function cuadro(ancho) {
    const m = medidas();
    det.width = ancho; det.height = Math.round(ancho * m[1] / m[0]);
    det.getContext('2d').drawImage(cfg.fuente, 0, 0, det.width, det.height);
    try { // luz del lugar, para que el avatar no se vea "pegado"
      const mx = muestra.getContext('2d', { willReadFrequently: true });
      mx.drawImage(det, 0, 0, 16, 16);
      const d = mx.getImageData(0, 0, 16, 16).data;
      let suma = 0;
      for (let i = 0; i < d.length; i += 4) suma += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      luz = mezcla(luz, suma / 256, 0.2);
    } catch (e) { /* sin lectura de píxeles */ }
  }
  function detectarPose(ancho) {
    if (!poseDet || !medidas()) return;
    cuadro(ancho || 256);
    try {
      poseDet.detectForVideo(det, ts(), (r) => {
        if (!r.landmarks || !r.landmarks.length) { datos = null; return; }
        const lm = r.landmarks[0].map((p) => ({ x: p.x, y: p.y, v: p.visibility == null ? 1 : p.visibility }));
        const m = r.segmentationMasks && r.segmentationMasks[0];
        let hay = false;
        if (m) {
          const f = m.getAsFloat32Array();
          mascara.width = m.width; mascara.height = m.height;
          const mctx = mascara.getContext('2d');
          const id = mctx.createImageData(m.width, m.height);
          for (let i = 0; i < f.length; i++) {
            const a = Math.max(0, Math.min(1, (f[i] - 0.35) / 0.3));
            if (a > 0) hay = true;
            id.data[i * 4 + 3] = a * 255;
          }
          mctx.putImageData(id, 0, 0);
        }
        siluetasVacias = hay ? 0 : siluetasVacias + 1;
        if (siluetasVacias >= 3) pasarACPU();
        datos = { lm, conMascara: hay };
      });
    } catch (e) { /* un cuadro que falla no importa */ }
  }
  // puntos de la cara que se usan (y se suavizan para que no tiemblen)
  const IDX_CARA = [1, 10, 13, 14, 33, 263, 152, 234, 454, 50, 280];
  function detectarCara() {
    if (!caraDet || !medidas()) return;
    cuadro(320);
    try {
      const r = caraDet.detectForVideo(det, ts());
      if (r.faceLandmarks && r.faceLandmarks.length) {
        const bs = {};
        ((r.faceBlendshapes && r.faceBlendshapes[0] && r.faceBlendshapes[0].categories) || []).forEach((c) => { bs[c.categoryName] = c.score; });
        cara = { lm: r.faceLandmarks[0], bs };
      } else cara = null;
    } catch (e) { /* idem */ }
  }
  function suavizarCara() {
    if (!cara) { caraSuave = null; return; }
    if (!caraSuave) caraSuave = {};
    IDX_CARA.forEach((i) => {
      const p = cara.lm[i];
      const s = caraSuave[i];
      caraSuave[i] = s ? { x: mezcla(s.x, p.x, 0.55), y: mezcla(s.y, p.y, 0.55) } : { x: p.x, y: p.y };
    });
    caraSuave.boca = mezcla(caraSuave.boca || 0, cara.bs.jawOpen || 0, 0.5);
  }

  // ================= el avatar como imagen =================
  function aImagen(interior, viewBox, w, h) {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}">${interior}</svg>`;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
      const i = new Image();
      i.onload = () => { URL.revokeObjectURL(url); resolve(i); };
      i.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      i.src = url;
    });
  }
  async function prepararAvatar() {
    const d = (o) => aImagen(cfg.dibujar({ parche: cfg.parche, ...o }), '0 0 320 440', 720, 990);
    const variantes = { 'sin-izq': { sinBrazo: 'izq' }, 'sin-der': { sinBrazo: 'der' }, 'sin-ambos': { sinBrazo: 'ambos' } };
    POSES.forEach((p) => { variantes['pose-' + p.v] = p.v === 'normal' ? {} : { pose: p.v }; });
    const claves = Object.keys(variantes);
    const imagenes = await Promise.all(claves.map((k) => d(variantes[k])));
    claves.forEach((k, i) => { img[k] = imagenes[i]; });
    img.corona = await aImagen(sombreroAv('corona', '#e2b64a'), '84 4 152 93', 372, 228); // (avatar.js)
  }

  // ================= piezas de dibujo =================
  function filtroLuz() {
    if (!conFiltros || !medidas()) return 'none';
    const b = Math.max(0.78, Math.min(1.06, 0.7 + luz * 0.62));
    return `brightness(${b.toFixed(2)}) saturate(${(0.88 + luz * 0.18).toFixed(2)})`;
  }
  const elipse = (ctx, x, y, rx, ry, rot) => { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2); };
  const colBrazo = () => (cfg && cfg.brazo) || { piel: '#f1c9a5', contorno: '#c9a27a' };

  // brazo (curva o quebrado) con manga y mano
  function brazoPuntos(ctx, pts, esc, conMano, delante) {
    const b = colBrazo();
    ctx.save();
    if (delante) ctx.filter = filtroLuz();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const camino = (hasta) => {
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.curva) {
        const p1 = punto(pts[0], pts[1], hasta), p01 = punto(pts[1], pts[2], hasta), fin = punto(p1, p01, hasta);
        ctx.quadraticCurveTo(p1.x, p1.y, fin.x, fin.y);
      } else {
        const tramos = pts.length - 1;
        for (let i = 1; i < pts.length; i++) {
          const f = Math.min(1, Math.max(0, hasta * tramos - (i - 1)));
          if (f <= 0) break;
          const q = punto(pts[i - 1], pts[i], f);
          ctx.lineTo(q.x, q.y);
        }
      }
    };
    camino(1); ctx.strokeStyle = b.contorno; ctx.lineWidth = 17.5 * esc; ctx.stroke();
    ctx.strokeStyle = b.piel; ctx.lineWidth = 15 * esc; ctx.stroke();
    if (b.manga) {
      ctx.fillStyle = b.manga.c; ctx.strokeStyle = b.manga.c;
      if (b.manga.tipo === 'larga' || b.manga.tipo === 'velo') {
        ctx.globalAlpha = b.manga.tipo === 'velo' ? 0.75 : 1;
        camino(0.86); ctx.lineWidth = 18 * esc; ctx.stroke();
      }
      elipse(ctx, pts[0].x, pts[0].y, (b.manga.tipo === 'globo' ? 20 : 15) * esc, (b.manga.tipo === 'globo' ? 16 : 13) * esc); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (conMano) mano(ctx, pts[pts.length - 1], esc, false, delante);
  }
  const curva = (a, c, b) => { const p = [a, c, b]; p.curva = true; return p; };
  function mano(ctx, p, esc, dedos, delante) {
    const b = colBrazo();
    ctx.save();
    if (delante) ctx.filter = filtroLuz();
    ctx.fillStyle = b.mano || b.piel; ctx.strokeStyle = b.mano ? '#b9b9c0' : b.contorno; ctx.lineWidth = 1.4 * esc;
    ctx.beginPath(); ctx.arc(p.x, p.y, 10 * esc, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (dedos) for (let i = -1; i <= 1; i++) { elipse(ctx, p.x + i * 6 * esc, p.y + 8 * esc, 3.4 * esc, 5.5 * esc); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
  function pierna(ctx, x, y, largo, ang, esc) {
    const b = colBrazo(), p = b.pierna || { c: b.piel, zapato: null };
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang); ctx.lineCap = 'round';
    ctx.strokeStyle = b.contorno; ctx.lineWidth = 17.5 * esc; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, largo); ctx.stroke();
    ctx.strokeStyle = p.c; ctx.lineWidth = 15 * esc; ctx.stroke();
    ctx.fillStyle = p.zapato || b.piel; ctx.strokeStyle = b.contorno; ctx.lineWidth = 1.2 * esc;
    elipse(ctx, 2 * esc, largo + 4 * esc, 12 * esc, 7 * esc); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function corazon(ctx, x, y, r, color, alfa) {
    ctx.save(); ctx.globalAlpha = alfa == null ? 1 : alfa; ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x, y + r);
    ctx.bezierCurveTo(x - r * 1.3, y + r * 0.2, x - r * 1.2, y - r, x, y - r * 0.5);
    ctx.bezierCurveTo(x + r * 1.2, y - r, x + r * 1.3, y + r * 0.2, x, y + r);
    ctx.fill(); ctx.restore();
  }
  function estrella(ctx, x, y, r, color) {
    ctx.save(); ctx.fillStyle = color; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.fill(); ctx.restore();
  }
  function florCanvas(ctx, x, y, r, color) {
    ctx.save(); ctx.fillStyle = color;
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#f6d26b'; ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  // el avatar (imagen) con sombra y la luz del lugar
  function avatar(ctx, im, x, y, w, h, rot, recorte, espejo) {
    if (!im) return;
    ctx.save();
    ctx.filter = filtroLuz();
    ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = w * 0.06; ctx.shadowOffsetY = w * 0.02;
    ctx.translate(x + w / 2, y + h); if (rot) ctx.rotate(rot); if (espejo) ctx.scale(-1, 1);
    if (recorte) ctx.drawImage(im, 0, 0, im.width, im.height * recorte, -w / 2, -h, w, h * recorte);
    else ctx.drawImage(im, -w / 2, -h, w, h);
    ctx.restore();
  }
  function sombraPiso(ctx, x, y, ancho) {
    ctx.save();
    const g = ctx.createRadialGradient(x, y, 0, x, y, ancho * 0.36);
    g.addColorStop(0, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.translate(x, y); ctx.scale(1, 0.22); ctx.translate(-x, -y);
    ctx.beginPath(); ctx.arc(x, y, ancho * 0.36, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function dialogo(ctx, x, y, texto, tam, alfa) {
    if (!texto || alfa <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alfa);
    ctx.font = `800 ${tam}px Figtree, system-ui, sans-serif`;
    const w = ctx.measureText(texto).width + tam * 1.2, h = tam * 1.8, r = h / 2;
    const bx = Math.max(4, Math.min(ctx.canvas.width - w - 4, x - w / 2)), by = Math.max(4, y - h);
    const px = Math.max(bx + r, Math.min(bx + w - r, x));
    ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = tam * 0.5; ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(bx + r, by); ctx.arcTo(bx + w, by, bx + w, by + h, r); ctx.arcTo(bx + w, by + h, bx, by + h, r);
    ctx.lineTo(px + tam * 0.4, by + h); ctx.lineTo(px, by + h + tam * 0.6); ctx.lineTo(px - tam * 0.2, by + h);
    ctx.arcTo(bx, by + h, bx, by, r); ctx.arcTo(bx, by, bx + w, by, r);
    ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#2a2740'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(texto, bx + w / 2, by + h / 2 + tam * 0.05);
    ctx.restore();
  }
  function firma(ctx, W, H) {
    const fs = Math.round(Math.min(W, H) / 26);
    ctx.save();
    ctx.font = `700 ${fs}px Figtree, system-ui, sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = fs / 3; ctx.fillStyle = '#fff';
    ctx.fillText('Ocuparche ✨ ' + new Date().toLocaleDateString('es-CL'), W - fs * 0.7, H - fs * 0.6);
    ctx.restore();
  }

  // ---------- partículas (en unidades del ancho, así sirven para cualquier tamaño) ----------
  function soltar(xPx, yPx, W, n, fuerza, forma, extra) {
    for (let i = 0; i < n; i++) {
      const ang = azar(0, Math.PI * 2), v = azar(0.3, 1) * fuerza;
      particulas.push({
        x: xPx / W, y: yPx / W, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - fuerza * 0.4, vida: 1, dur: azar(0.8, 1.4),
        color: elegir(COLORES_CHISPAS), tam: azar(0.5, 1), forma: forma || (Math.random() < 0.5 ? 'estrella' : 'confeti'), giro: azar(0, 6), g: 0.14,
        ...(extra || {}),
      });
    }
    if (particulas.length > 260) particulas = particulas.slice(-260);
  }
  function pintarParticulas(ctx, W, dt) {
    if (dt > 0) particulas = particulas.filter((p) => (p.vida -= dt / p.dur) > 0);
    particulas.forEach((p) => {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.giro += dt * 6;
      const x = p.x * W, y = p.y * W, t = W * 0.035 * p.tam;
      ctx.save(); ctx.globalAlpha = Math.min(1, p.vida * 1.5);
      if (p.forma === 'burbuja') {
        const r = W * 0.03 * p.tam;
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(1, r * 0.08);
        ctx.fillStyle = 'rgba(190,220,255,.18)';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.8)'; elipse(ctx, x - r * 0.35, y - r * 0.35, r * 0.22, r * 0.14, -0.6); ctx.fill();
      } else if (p.forma === 'corazon') corazon(ctx, x, y, t * 0.7, p.color === '#ffffff' ? '#e8578a' : p.color);
      else if (p.forma === 'nota') {
        ctx.fillStyle = p.color; ctx.font = `800 ${t * 1.8}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(p.giro % 2 > 1 ? '♪' : '♫', x, y);
      } else {
        ctx.fillStyle = p.color; ctx.translate(x, y); ctx.rotate(p.giro);
        if (p.forma === 'confeti') ctx.fillRect(-t, -t * 0.45, t * 2, t * 0.9);
        else estrella(ctx, 0, 0, t, p.color);
      }
      ctx.restore();
    });
  }
  function celebrar() {
    if (!cfg || !cfg.canvas) return;
    const W = cfg.canvas.width, H = cfg.canvas.height;
    let x = W / 2, y = H * 0.4;
    if (av.modo === 'ia' && acc.ultimo) { x = acc.ultimo.hx * W; y = acc.ultimo.hy * H; }
    else if (av.rect) { x = (av.rect.x + av.rect.w / 2) * W; y = (av.rect.y + av.rect.h * 0.4) * H; }
    soltar(x, y, W, 40, 0.5);
  }

  // ================= avatar quieto (se arrastra y se pellizca) =================
  function pintarManual(ctx, W, H, t) {
    const im = img['pose-' + av.pose] || img['pose-normal'];
    const alto = av.h * H, ancho = alto * 320 / 440;
    const cx = av.x * W, cy = av.y * H;
    let rot = 0, salto = 0;
    if (av.pose === 'saludo') rot = Math.sin(t / 260) * 0.05;
    else if (av.pose === 'hurra') salto = Math.abs(Math.sin(t / 300)) * alto * 0.04;
    else rot = Math.sin(t / 900) * 0.02;
    const x = cx - ancho / 2, y = cy - alto / 2 - salto;
    if (medidas()) sombraPiso(ctx, cx, cy + alto / 2 * 0.985, ancho);
    avatar(ctx, im, x, y, ancho, alto, rot, 0, av.espejo);
    // el rectángulo se guarda en fracciones (así sirve aunque cambie el tamaño)
    av.rect = { x: x / W, y: y / H, w: ancho / W, h: alto / H };
  }

  // ================= avatar con IA =================
  function nuevaAccion(v, t, W, H) {
    acc.v = v; acc.desde = t; acc.de = acc.ultimo;
    acc.frase = elegir(FRASES[v] || ['']);
    acc.hasta = av.accion === 'sorpresa' ? t + azar(4200, 7200) : Infinity;
    if (av.accion === 'sorpresa' && Math.random() < 0.35) lado = -lado;
    mariposas = [];
    if (acc.ultimo) soltar(acc.ultimo.hx * W, acc.ultimo.hy * H, W, 26, 0.45);
  }

  function pintarIA(ctx, W, H, t, dt, map, geo, conEspejo) {
    if (!datos) {
      estado(poseDet ? '🙂 Ponte frente a la cámara, que se te vea la cabeza y los hombros' : '✨ Preparando la magia… (la primera vez tarda un poquito)');
      return;
    }
    estado(av.accion === 'sorpresa' ? '🎲 ¡Sorpresa! Toca para foto, mantén para video' : '✨ ¡Listo! Toca para foto, mantén para video');

    // la persona (suavizada en coordenadas del video, así sirve para cualquier tamaño)
    if (!suave) suave = {};
    [0, 7, 8, 11, 12, 13, 14, 15, 16].forEach((i) => {
      const p = datos.lm[i], s = suave[i];
      suave[i] = s ? { x: mezcla(s.x, p.x, 0.4), y: mezcla(s.y, p.y, 0.4), v: p.v } : { ...p };
    });
    const P = (i) => map(suave[i]);
    const oA = P(7), oB = P(8), hA = P(11), hB = P(12), nariz = P(0);
    const anchoHombros = dist(hA, hB);
    let anchoCabeza = dist(oA, oB) * 1.35;
    if (anchoCabeza < anchoHombros * 0.3 || oA.v < 0.3 || oB.v < 0.3) anchoCabeza = anchoHombros * 0.5;
    const s = { cx: (oA.x + oB.x) / 2 * 0.6 + nariz.x * 0.4, cy: (oA.y + oB.y) / 2, w: anchoCabeza };
    // el lado con más espacio (con margen para no saltar de un lado a otro)
    const espacioDer = W - (s.cx + s.w * 0.55), espacioIzq = s.cx - s.w * 0.55;
    // (en Sorpresa puede cambiar de lado solo, pero nunca a uno sin espacio)
    const umbral = av.accion === 'sorpresa' ? 2.2 : 1.3;
    if (lado > 0 && espacioIzq > espacioDer * umbral) lado = -1;
    else if (lado < 0 && espacioDer > espacioIzq * umbral) lado = 1;
    s.espacio = Math.max(0, lado > 0 ? espacioDer : espacioIzq);
    s.hombroCerca = (lado > 0) === (hA.x > hB.x) ? hA : hB;
    const hombroLejos = s.hombroCerca === hA ? hB : hA;
    const arribaCabeza = s.cy - s.w * 0.75;
    // brazo de la persona que queda a la izquierda / derecha de la pantalla
    const brazoPersona = (ladoPantalla) => {
      const izq = hA.x < hB.x ? [11, 13, 15] : [12, 14, 16], der = izq[0] === 11 ? [12, 14, 16] : [11, 13, 15];
      const ids = ladoPantalla < 0 ? izq : der;
      return { h: P(ids[0]), c: P(ids[1]), m: P(ids[2]) };
    };

    // acción en curso (en Sorpresa cambia sola)
    if (!acc.v || (av.accion !== 'sorpresa' && acc.v !== av.accion)) nuevaAccion(av.accion === 'sorpresa' ? elegir(acciones()) : av.accion, t, W, H);
    else if (t > acc.hasta) nuevaAccion(elegir(acciones().filter((v) => v !== acc.v)), t, W, H);
    const v = acc.v;

    // dónde va (centro de su cabeza, tamaño y giro)
    const diamBase = Math.max(W * 0.14, Math.min(s.w * 0.85, W * 0.34, s.espacio * 0.95 * 236 / 320));
    const local = t - acc.desde;
    let L;
    switch (v) {
      case 'besito': L = { hx: s.cx + lado * (s.w * 0.5 + diamBase * 0.4), hy: s.cy + s.w * 0.08, diam: diamBase, rot: -lado * 0.16 }; break;
      case 'abrazo': L = { hx: s.cx + lado * (s.w * 0.5 + diamBase * 0.55), hy: s.cy + s.w * 0.35, diam: diamBase, rot: 0 }; break;
      case 'escondidas': {
        const ciclo = 2800, n = Math.floor(local / ciclo), f = (local % ciclo) / ciclo;
        const ladoAqui = (n * 7919 + Math.floor(acc.desde)) % 3 === 0 ? -lado : lado;
        const asoma = f < 0.25 ? suaveEntre(f / 0.25) : f < 0.7 ? 1 : f < 0.9 ? 1 - suaveEntre((f - 0.7) / 0.2) : 0;
        L = { hx: s.cx + ladoAqui * (s.w * 0.05 + s.w * 0.62 * asoma), hy: s.cy + s.w * 0.02, diam: diamBase * 0.95, rot: ladoAqui * 0.14 * asoma, asoma, ladoAqui };
        break;
      }
      case 'sentada': { const d = s.w * 0.5, e = d / 236; L = { hx: s.hombroCerca.x + lado * s.w * 0.05, hy: s.hombroCerca.y - s.w * 0.05 - (372 - 176) * e, diam: d, rot: Math.sin(t / 500) * 0.05 }; break; }
      case 'globos': L = { hx: s.cx + lado * (s.w * 0.85 + s.w * 0.25 * Math.sin(t / 1400)), hy: s.cy - s.w * 0.55 + s.w * 0.18 * Math.sin(t / 800), diam: diamBase * 0.8, rot: Math.sin(t / 700) * 0.12 }; break;
      case 'baile': L = { hx: s.cx + lado * (s.w * 0.55 + diamBase * 0.62), hy: s.cy + s.w * 0.35 - Math.abs(Math.sin(t / 250)) * diamBase * 0.12, diam: diamBase, rot: Math.sin(t / 250) * 0.12 }; break;
      default: L = { hx: s.cx + lado * (s.w * 0.55 + diamBase * 0.62), hy: s.cy + s.w * 0.35, diam: diamBase, rot: 0 };
    }
    const trans = Math.min(1, local / 650);
    const enTransicion = trans < 1 && !!acc.de;
    if (enTransicion) {
      const e = rebote(trans), de = acc.de;
      L = { ...L, hx: mezcla(de.hx * W, L.hx, e), hy: mezcla(de.hy * H, L.hy, e), diam: mezcla(de.diam * W, L.diam, e), rot: mezcla(de.rot || 0, L.rot || 0, e) };
    }
    const esc = L.diam / 236, ancho = 320 * esc, alto = 440 * esc;
    if (!['escondidas', 'globos', 'sentada'].includes(v)) {
      L.hx = Math.min(W - ancho * 0.45, Math.max(ancho * 0.45, L.hx));
      L.hy = Math.min(H - alto * 0.35, Math.max(176 * esc * 0.8, L.hy));
    }
    acc.ultimo = { hx: L.hx / W, hy: L.hy / H, diam: L.diam / W, rot: L.rot || 0 };
    const bote = ['sentada', 'globos', 'baile'].includes(v) ? 0 : Math.sin(t / 320) * 3 * esc;
    const ax = L.hx - 160 * esc, ay = L.hy - 176 * esc + bote;
    const cercano = lado > 0 ? 'izq' : 'der';
    const hombroDe = (ladoAv) => ({ x: ax + (ladoAv === 'izq' ? 118 : 202) * esc, y: ay + 298 * esc });
    const hombroAv = hombroDe(cercano);
    const dentro = (p) => ({ x: Math.min(W - 12 * esc, Math.max(12 * esc, p.x)), y: Math.min(H - 12 * esc, Math.max(12 * esc, p.y)) });
    const tamTexto = Math.max(13 * (Math.min(W, H) / 400), L.diam * 0.13);
    const alfaFrase = Math.min(1, (local - 500) / 300);

    // capa de atrás (se le borra la silueta de la persona)
    if (capa.width !== W || capa.height !== H) { capa.width = W; capa.height = H; }
    const cc = capa.getContext('2d');
    cc.clearRect(0, 0, W, H);
    const frente = [];
    const piso = ay + alto * 0.985;
    const conSombra = () => { if (piso < H) frente.push(() => sombraPiso(ctx, L.hx, piso, ancho)); };
    let conFrase = !enTransicion;

    if (enTransicion || (!datos.conMascara && ['abrazo', 'hombro', 'conejito', 'escondidas', 'besito'].includes(v))) {
      frente.push(() => avatar(ctx, img['pose-hurra'], ax, ay, ancho, alto, L.rot));
    } else if (v === 'abrazo' || v === 'hombro' || v === 'conejito') {
      conSombra();
      frente.push(() => avatar(ctx, img['sin-' + cercano], ax, ay, ancho, alto, 0));
      if (v === 'abrazo') {
        const a = dentro({ x: hombroLejos.x, y: hombroLejos.y - s.w * 0.12 });
        brazoPuntos(cc, curva(hombroAv, { x: (hombroAv.x + a.x) / 2, y: Math.max(hombroAv.y, a.y) + s.w * 0.35 }, a), esc, false);
        frente.push(() => mano(ctx, a, esc * 1.45, true, true));
      } else if (v === 'hombro') {
        const a = dentro({ x: s.hombroCerca.x - lado * s.w * 0.05, y: s.hombroCerca.y - s.w * 0.14 });
        brazoPuntos(cc, curva(hombroAv, { x: (hombroAv.x + a.x) / 2, y: Math.min(hombroAv.y, a.y) - s.w * 0.1 }, a), esc, false);
        frente.push(() => mano(ctx, a, esc * 1.45, true, true));
      } else {
        const a = { x: s.cx + lado * s.w * 0.12, y: arribaCabeza + s.w * 0.25 };
        brazoPuntos(cc, curva(hombroAv, { x: hombroAv.x + lado * s.w * 0.1, y: a.y }, a), esc, true);
        const b = colBrazo(), largo = s.w * (0.58 + 0.06 * Math.sin(t / 180)), grosor = 10 * esc;
        [-0.2, 0.2].forEach((ang) => {
          cc.save(); cc.translate(a.x, a.y); cc.rotate(ang + Math.sin(t / 250) * 0.05);
          cc.fillStyle = b.mano || b.piel; cc.strokeStyle = b.mano ? '#b9b9c0' : b.contorno; cc.lineWidth = 1.4 * esc;
          elipse(cc, 0, -largo / 2, grosor, largo / 2); cc.fill(); cc.stroke();
          cc.restore();
        });
      }
    } else if (v === 'copion' || v === 'choca') {
      // Copión: sus brazos imitan los tuyos. Choca 5: si levantas la mano de su lado, la choca.
      conSombra();
      frente.push(() => avatar(ctx, img[v === 'copion' ? 'sin-ambos' : 'sin-' + cercano], ax, ay, ancho, alto, 0));
      const ladosAv = v === 'copion' ? ['izq', 'der'] : [cercano];
      const dir = (a, b) => { const d = dist(a, b) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };
      ladosAv.forEach((ladoAv) => {
        const sh = hombroDe(ladoAv);
        const lp = brazoPersona(ladoAv === 'izq' ? -1 : 1);
        const visible = lp.c.v > 0.45 && lp.m.v > 0.45;
        let pts;
        if (v === 'copion') {
          const sg = ladoAv === 'izq' ? -1 : 1;
          const d1 = visible ? dir(lp.h, lp.c) : { x: sg * 0.25, y: 0.97 };
          const d2 = visible ? dir(lp.c, lp.m) : { x: sg * 0.2, y: 0.98 };
          const codo = { x: sh.x + d1.x * 34 * esc, y: sh.y + d1.y * 34 * esc };
          pts = [sh, codo, { x: codo.x + d2.x * 32 * esc, y: codo.y + d2.y * 32 * esc }];
        } else {
          // mano en alto esperando, al costado de la cabeza (como el "¡hurra!");
          // si tu mano (la de su lado) está levantada, va a chocarla
          const sg = ladoAv === 'izq' ? -1 : 1;
          let objetivo = { x: sh.x + sg * 94 * esc, y: sh.y - 62 * esc };
          const tuMano = lp.m, levantada = visible && tuMano.y < lp.h.y;
          if (!levantada) pts = [sh, { x: sh.x + sg * 62 * esc, y: sh.y + 6 * esc }, objetivo];
          else {
            const lejos = dist(sh, tuMano) || 1, alcance = 66 * esc * 2.2;
            objetivo = lejos < alcance ? tuMano : { x: sh.x + (tuMano.x - sh.x) * alcance / lejos, y: sh.y + (tuMano.y - sh.y) * alcance / lejos };
            if (dist(objetivo, tuMano) < s.w * 0.25 && t > chocaListo) {
              chocaListo = t + 1300; chocaFrase = t;
              soltar(tuMano.x, tuMano.y, W, 34, 0.55);
            }
            const codo = { x: (sh.x + objetivo.x) / 2 + sg * 16 * esc, y: (sh.y + objetivo.y) / 2 + 10 * esc };
            pts = [sh, codo, objetivo];
          }
        }
        frente.push(() => { brazoPuntos(ctx, pts, esc, false, true); mano(ctx, pts[2], esc * (v === 'choca' ? 1.5 : 1), v === 'choca', true); });
      });
      if (v === 'choca' && t - chocaFrase < 1400) { conFrase = false; frente.push(() => dialogo(ctx, L.hx, ay - 4 * esc, '¡Chócala! ✋', tamTexto * 1.1, 1)); }
    } else if (v === 'baile') {
      conSombra();
      frente.push(() => {
        ctx.save();
        ctx.translate(L.hx, ay + alto); ctx.rotate(L.rot); ctx.translate(-L.hx, -(ay + alto));
        avatar(ctx, img['sin-ambos'], ax, ay, ancho, alto, 0);
        ['izq', 'der'].forEach((ladoAv, i) => {
          const sh = hombroDe(ladoAv), sg = ladoAv === 'izq' ? -1 : 1;
          // brazos arriba y abajo, alternados, al ritmo
          const sube = Math.sin(t / 250 + i * Math.PI);
          const a1 = Math.PI / 2 - sg * (0.5 + 1.6 * (sube * 0.5 + 0.5));
          const codo = { x: sh.x + Math.cos(a1) * 34 * esc, y: sh.y + Math.sin(a1) * 34 * esc };
          const a2 = a1 - sg * (0.6 + 0.4 * Math.sin(t / 180));
          brazoPuntos(ctx, [sh, codo, { x: codo.x + Math.cos(a2) * 32 * esc, y: codo.y + Math.sin(a2) * 32 * esc }], esc, true, true);
        });
        ctx.restore();
      });
      if (Math.random() < dt * 3) soltar(L.hx + azar(-1, 1) * ancho * 0.5, ay + alto * 0.2, W, 1, 0.12, 'nota', { g: -0.05, dur: 2.2 });
    } else if (v === 'burbujas') {
      conSombra();
      frente.push(() => avatar(ctx, img['pose-normal'], ax, ay, ancho, alto, Math.sin(t / 600) * 0.03));
      if (Math.random() < dt * 5) {
        const bx = L.hx - lado * L.diam * 0.1, by = L.hy + L.diam * 0.22;
        particulas.push({ x: bx / W, y: by / W, vx: -lado * azar(0.05, 0.14), vy: azar(-0.08, -0.02), vida: 1, dur: azar(2.5, 4), tam: azar(0.5, 1.2), forma: 'burbuja', g: -0.004, giro: 0, color: '#fff' });
      }
    } else if (v === 'mariposas') {
      conSombra();
      frente.push(() => avatar(ctx, img['pose-hurra'], ax, ay, ancho, alto, 0));
      if (mariposas.length < 5) mariposas.push({ ang: azar(0, 6.28), vel: azar(0.6, 1.1) * (Math.random() < 0.5 ? -1 : 1), rad: azar(0.75, 1.15), fase: azar(0, 6), color: elegir(['#f6a6c8', '#7cc4ea', '#f6d26b', '#b392d6', '#8fd8c4']) });
      frente.push(() => mariposas.forEach((m) => {
        m.ang += m.vel * dt;
        const x = s.cx + Math.cos(m.ang) * s.w * m.rad, y = s.cy - s.w * 0.25 + Math.sin(m.ang) * s.w * m.rad * 0.55;
        const aleteo = Math.abs(Math.sin(t / 90 + m.fase)), r = s.w * 0.07;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(m.ang) * 0.3);
        ctx.fillStyle = m.color;
        ctx.save(); ctx.scale(0.25 + aleteo * 0.75, 1);
        elipse(ctx, -r * 0.6, -r * 0.3, r * 0.65, r * 0.5); ctx.fill(); elipse(ctx, r * 0.6, -r * 0.3, r * 0.65, r * 0.5); ctx.fill();
        elipse(ctx, -r * 0.45, r * 0.35, r * 0.4, r * 0.32); ctx.fill(); elipse(ctx, r * 0.45, r * 0.35, r * 0.4, r * 0.32); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#3a3540'; elipse(ctx, 0, 0, r * 0.1, r * 0.55); ctx.fill();
        ctx.restore();
      }));
    } else if (v === 'escondidas') {
      conFrase = false;
      cc.save(); cc.filter = filtroLuz();
      cc.translate(L.hx, ay + alto); cc.rotate(L.rot); cc.drawImage(L.asoma > 0.8 ? img['pose-saludo'] : img['pose-normal'], ax - L.hx, -alto, ancho, alto);
      cc.restore();
      if (L.asoma > 0.85) frente.push(() => dialogo(ctx, L.hx + L.ladoAqui * L.diam * 0.35, ay + 20 * esc, acc.frase, tamTexto, (L.asoma - 0.85) / 0.15));
    } else if (v === 'sentada') {
      conFrase = false;
      const interior = lado > 0 ? 'izq' : 'der', caderaY = ay + 372 * esc;
      frente.push(() => {
        pierna(ctx, L.hx - 11 * esc, caderaY - 4 * esc, 58 * esc, 0.25 * Math.sin(t / 230), esc);
        pierna(ctx, L.hx + 11 * esc, caderaY - 4 * esc, 58 * esc, 0.25 * Math.sin(t / 230 + 2), esc);
        avatar(ctx, img['sin-' + interior], ax, ay, ancho, alto, L.rot, 372 / 440);
        const hAv = hombroDe(interior), a = { x: s.cx + lado * s.w * 0.47, y: arribaCabeza + s.w * 0.42 };
        brazoPuntos(ctx, curva(hAv, { x: (hAv.x + a.x) / 2 + lado * s.w * 0.05, y: Math.min(hAv.y, a.y) - s.w * 0.05 }, a), esc, true, true);
        dialogo(ctx, L.hx, ay - 6 * esc, acc.frase, tamTexto * 0.85, alfaFrase);
      });
    } else if (v === 'globos') {
      frente.push(() => {
        const mg = cfg.manoGlobos || { x: 296, y: 236 };
        const manoG = { x: ax + mg.x * esc, y: ay + mg.y * esc };
        ['#e8578a', '#7cc4ea', '#f6d26b'].forEach((c, i) => {
          const gx = manoG.x + (i - 1) * L.diam * 0.32 + Math.sin(t / 600 + i) * L.diam * 0.05, gy = manoG.y - L.diam * (0.9 + 0.12 * i);
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5 * esc;
          ctx.beginPath(); ctx.moveTo(manoG.x, manoG.y); ctx.quadraticCurveTo(gx + 8 * esc, (gy + manoG.y) / 2, gx, gy + L.diam * 0.22); ctx.stroke();
          ctx.fillStyle = c; ctx.shadowColor = 'rgba(0,0,0,.2)'; ctx.shadowBlur = 8 * esc;
          elipse(ctx, gx, gy, L.diam * 0.17, L.diam * 0.22); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.55)'; elipse(ctx, gx - L.diam * 0.06, gy - L.diam * 0.08, L.diam * 0.04, L.diam * 0.06, -0.5); ctx.fill();
          ctx.restore();
        });
        avatar(ctx, img['pose-saludo'], ax, ay, ancho, alto, L.rot);
      });
    } else if (v === 'corona') {
      conSombra();
      frente.push(() => avatar(ctx, img['pose-hurra'], ax, ay, ancho, alto, 0));
      const cw = s.w, ch = cw * 76 / 124, baja = Math.min(1, local / 700);
      frente.push(() => { if (img.corona) ctx.drawImage(img.corona, s.cx - cw / 2, arribaCabeza - ch * 0.55 - (1 - rebote(baja)) * s.w * 0.6, cw, ch); });
    } else if (v === 'besito') {
      cc.save(); cc.filter = filtroLuz();
      cc.translate(L.hx, ay + alto); cc.rotate(L.rot); cc.drawImage(img['pose-corazon'], ax - L.hx, -alto, ancho, alto);
      cc.restore();
      frente.push(() => {
        for (let i = 0; i < 3; i++) {
          const fase = ((t / 1400) + i / 3) % 1;
          corazon(ctx, s.cx + lado * s.w * (0.45 + 0.1 * Math.sin(fase * 6 + i)), s.cy - fase * s.w * 0.9, s.w * (0.06 + 0.03 * i), '#e8578a', 1 - fase);
        }
      });
    } else { // saludo
      conSombra();
      frente.push(() => avatar(ctx, img['pose-saludo'], ax, ay, ancho, alto, Math.sin(t / 260) * 0.06));
    }
    if (conFrase) frente.push(() => dialogo(ctx, L.hx, ay - 4 * esc, acc.frase, tamTexto, alfaFrase));

    if (datos.conMascara) {
      cc.globalCompositeOperation = 'destination-out';
      if (conFiltros) cc.filter = `blur(${Math.max(1, W / 400).toFixed(1)}px)`;
      conEspejo(cc, () => cc.drawImage(mascara, geo.ox, geo.oy, geo.dw, geo.dh));
      cc.filter = 'none';
      cc.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(capa, 0, 0);
    frente.forEach((f) => f());
  }

  // ================= filtros de cara (lentes) =================
  function pintarLente(ctx, W, H, t, dt, map) {
    if (!caraSuave) { estado(caraDet ? '🙂 Mira a la cámara para el filtro' : '✨ Preparando el filtro… (la primera vez tarda un poquito)'); return; }
    if (av.modo !== 'ia') estado('✨ ¡Listo! Toca para foto, mantén para video');
    const P = (i) => map(caraSuave[i]);
    const a = P(33), b = P(263), ojoI = a.x < b.x ? a : b, ojoD = a.x < b.x ? b : a;
    const ang = Math.atan2(ojoD.y - ojoI.y, ojoD.x - ojoI.x);
    const mI = P(234), mD = P(454), u = dist(mI, mD);
    const fr = P(10), me = P(152), na = P(1), ls = P(13), li = P(14);
    const arriba = { x: fr.x + (fr.x - me.x) * 0.3, y: fr.y + (fr.y - me.y) * 0.3 };
    const cI = P(50), cD = P(280);
    const abierta = Math.max(0, Math.min(1, ((caraSuave.boca || 0) - 0.22) / 0.45));
    const en = (p, fn) => { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang); fn(); ctx.restore(); };
    const bigotes = (color) => en(na, () => {
      ctx.strokeStyle = color; ctx.lineWidth = u * 0.012; ctx.lineCap = 'round';
      [-1, 1].forEach((sg) => [-0.12, 0, 0.12].forEach((k) => { ctx.beginPath(); ctx.moveTo(sg * u * 0.1, u * 0.04 + k * u * 0.2); ctx.lineTo(sg * u * 0.4, u * 0.02 + k * u * 0.5); ctx.stroke(); }));
    });
    const rubor = (alfa) => [cI, cD].forEach((c) => {
      ctx.save();
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, u * 0.1);
      g.addColorStop(0, `rgba(255,120,150,${alfa})`); g.addColorStop(1, 'rgba(255,120,150,0)');
      ctx.fillStyle = g; elipse(ctx, c.x, c.y, u * 0.1, u * 0.07, ang); ctx.fill(); ctx.restore();
    });
    switch (lente) {
      case 'perrito':
        en(arriba, () => [-1, 1].forEach((sg) => {
          ctx.save(); ctx.translate(sg * u * 0.4, u * 0.14); ctx.rotate(sg * (0.35 + Math.sin(t / 300) * 0.06));
          ctx.fillStyle = '#8a5a3a'; elipse(ctx, 0, u * 0.2, u * 0.15, u * 0.3); ctx.fill();
          ctx.fillStyle = '#b98a5e'; elipse(ctx, 0, u * 0.22, u * 0.09, u * 0.2); ctx.fill();
          ctx.restore();
        }));
        en(na, () => {
          ctx.fillStyle = '#231a18'; elipse(ctx, 0, -u * 0.01, u * 0.1, u * 0.07); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.6)'; elipse(ctx, -u * 0.03, -u * 0.035, u * 0.03, u * 0.015); ctx.fill();
        });
        if (abierta > 0) en({ x: (ls.x + li.x) / 2, y: li.y }, () => {
          const w = u * 0.17, L = u * (0.08 + 0.38 * abierta);
          ctx.rotate(Math.sin(t / 130) * 0.1);
          ctx.fillStyle = '#ef6f8f'; ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, L - w / 2); ctx.arc(0, L - w / 2, w / 2, Math.PI, 0, true); ctx.lineTo(w / 2, 0); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#d24d70'; ctx.lineWidth = u * 0.012; ctx.beginPath(); ctx.moveTo(0, u * 0.02); ctx.lineTo(0, L - w * 0.6); ctx.stroke();
        });
        break;
      case 'conejita':
        en(arriba, () => [-1, 1].forEach((sg) => {
          ctx.save(); ctx.translate(sg * u * 0.18, -u * 0.05); ctx.rotate(sg * (0.12 + Math.sin(t / 260 + sg) * 0.08));
          ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e6d6dc'; ctx.lineWidth = u * 0.01;
          elipse(ctx, 0, -u * 0.3, u * 0.1, u * 0.34); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#f6b3c8'; elipse(ctx, 0, -u * 0.28, u * 0.055, u * 0.25); ctx.fill();
          ctx.restore();
        }));
        bigotes('rgba(90,64,48,.8)');
        en(na, () => { ctx.fillStyle = '#f08aa8'; ctx.beginPath(); ctx.moveTo(-u * 0.05, -u * 0.02); ctx.lineTo(u * 0.05, -u * 0.02); ctx.lineTo(0, u * 0.04); ctx.closePath(); ctx.fill(); });
        if (abierta > 0.1) en(ls, () => { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ddd'; ctx.lineWidth = u * 0.006; [-1, 1].forEach((sg) => { const x = sg > 0 ? u * 0.004 : -u * 0.064; ctx.fillRect(x, 0, u * 0.06, u * 0.08); ctx.strokeRect(x, 0, u * 0.06, u * 0.08); }); });
        rubor(0.3);
        break;
      case 'gatito':
        en(arriba, () => [-1, 1].forEach((sg) => {
          ctx.save(); ctx.translate(sg * u * 0.3, u * 0.05);
          ctx.fillStyle = '#4a4050'; ctx.beginPath(); ctx.moveTo(-u * 0.14, u * 0.1); ctx.lineTo(sg * u * 0.03, -u * 0.24); ctx.lineTo(u * 0.14, u * 0.1); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#f6b3c8'; ctx.beginPath(); ctx.moveTo(-u * 0.07, u * 0.07); ctx.lineTo(sg * u * 0.02, -u * 0.13); ctx.lineTo(u * 0.07, u * 0.07); ctx.closePath(); ctx.fill();
          ctx.restore();
        }));
        bigotes('rgba(40,30,40,.85)');
        en(na, () => { ctx.fillStyle = '#e87a9c'; ctx.beginPath(); ctx.moveTo(-u * 0.045, -u * 0.02); ctx.lineTo(u * 0.045, -u * 0.02); ctx.lineTo(0, u * 0.035); ctx.closePath(); ctx.fill(); });
        rubor(0.35);
        break;
      case 'princesa': {
        const cw = u * 0.85, ch = cw * 76 / 124;
        if (img.corona) en(arriba, () => ctx.drawImage(img.corona, -cw / 2, -ch * 0.55, cw, ch));
        rubor(0.4);
        if (Math.random() < dt * 8) soltar(arriba.x + azar(-1, 1) * u * 0.7, arriba.y + azar(-0.2, 0.9) * u, W, 1, 0.04, 'estrella', { g: 0.02, dur: 1.2, tam: azar(0.3, 0.6), color: elegir(['#fff', '#f6d26b']) });
        break;
      }
      case 'corazones':
        [ojoI, ojoD].forEach((o) => en(o, () => corazon(ctx, 0, 0, u * 0.11 * (1 + 0.12 * Math.sin(t / 150)), '#e8375e')));
        if (abierta > 0.2 && Math.random() < dt * 10) soltar((ls.x + li.x) / 2, li.y, W, 1, 0.18, 'corazon', { g: -0.08, dur: 1.8, color: elegir(['#e8578a', '#f28bb0', '#e8375e']) });
        rubor(0.35);
        break;
      case 'unicornio':
        if (abierta > 0.05) {
          // ¡arcoíris al abrir la boca!
          const bx = (ls.x + li.x) / 2, by = (ls.y + li.y) / 2, franja = u * 0.05 * (0.5 + abierta);
          const ola = Math.sin(t / 200) * u * 0.1;
          ['#e8605a', '#f0a04b', '#f2cf5b', '#6fbf73', '#7cc4ea', '#9b7fd6'].forEach((c, i) => {
            const off = (i - 2.5) * franja;
            ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = franja * 1.05; ctx.lineCap = 'round'; ctx.globalAlpha = 0.9;
            ctx.beginPath(); ctx.moveTo(bx + off, by);
            ctx.bezierCurveTo(bx + off + ola, by + u * 0.5, bx + off - ola, by + u * 1.1, bx + off + ola * 0.5, H + 20);
            ctx.stroke(); ctx.restore();
          });
        }
        en(fr, () => {
          const bw = u * 0.15, hl = u * 0.5;
          const g = ctx.createLinearGradient(0, 0, 0, -hl); g.addColorStop(0, '#f6d26b'); g.addColorStop(1, '#fff3c4');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-bw / 2, -u * 0.02); ctx.lineTo(0, -hl); ctx.lineTo(bw / 2, -u * 0.02); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#d9a93a'; ctx.lineWidth = u * 0.012;
          for (let i = 1; i <= 3; i++) { const y = -hl * i / 4.2, k = 1 - i / 4.2; ctx.beginPath(); ctx.moveTo(-bw / 2 * k, y + u * 0.02); ctx.lineTo(bw / 2 * k, y - u * 0.02); ctx.stroke(); }
          [-0.24, -0.12, 0.12, 0.24].forEach((k, i) => florCanvas(ctx, k * u, -u * 0.01, u * 0.028, ['#f6a6c8', '#b392d6', '#7cc4ea', '#f6a6c8'][i]));
        });
        rubor(0.3);
        break;
      case 'pirata':
        en(arriba, () => {
          ctx.fillStyle = '#1f1a1c';
          ctx.beginPath(); ctx.moveTo(-u * 0.62, u * 0.12); ctx.quadraticCurveTo(0, -u * 0.55, u * 0.62, u * 0.12); ctx.quadraticCurveTo(0, u * 0.02, -u * 0.62, u * 0.12); ctx.fill();
          ctx.strokeStyle = '#e2b64a'; ctx.lineWidth = u * 0.025; ctx.beginPath(); ctx.moveTo(-u * 0.58, u * 0.1); ctx.quadraticCurveTo(0, 0, u * 0.58, u * 0.1); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -u * 0.12, u * 0.06, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#1f1a1c'; elipse(ctx, -u * 0.022, -u * 0.125, u * 0.013, u * 0.016); ctx.fill(); elipse(ctx, u * 0.022, -u * 0.125, u * 0.013, u * 0.016); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = u * 0.018; ctx.beginPath(); ctx.moveTo(-u * 0.09, -u * 0.02); ctx.lineTo(u * 0.09, -u * 0.08); ctx.moveTo(-u * 0.09, -u * 0.08); ctx.lineTo(u * 0.09, -u * 0.02); ctx.stroke();
        });
        [mI, mD].forEach((m) => en(m, () => { ctx.strokeStyle = '#e2b64a'; ctx.lineWidth = u * 0.018; ctx.beginPath(); ctx.arc(0, u * 0.14, u * 0.035, 0, Math.PI * 2); ctx.stroke(); }));
        if (abierta > 0.2) dialogo(ctx, arriba.x, arriba.y - u * 0.35, '¡Arrr! 🏴‍☠️', Math.max(14, u * 0.12), 1);
        break;
      case 'brillitos':
        rubor(0.35);
        [cI, cD].forEach((c) => [[-0.04, -0.02], [0.03, 0.01], [-0.01, 0.04]].forEach(([dx, dy]) => estrella(ctx, c.x + dx * u, c.y + dy * u, u * 0.022, '#fff6c9')));
        if (Math.random() < dt * 22) soltar(fr.x + azar(-0.7, 0.7) * u, fr.y + azar(-0.3, 1.3) * u, W, 1, 0.03, 'estrella', { g: 0.01, dur: 1, tam: azar(0.2, 0.45), color: elegir(['#fff', '#f6d26b', '#f6a6c8', '#b9e3ff']) });
        break;
    }
  }

  // ================= un cuadro completo =================
  function pintar(cv, t, op) {
    op = op || {};
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, dt = op.dt || 0;
    const m = medidas();
    const fil = FILTROS.find((f) => f.v === filtro) || FILTROS[0];
    const conEspejo = (c, fn) => { c.save(); if (cfg.espejo) { c.translate(W, 0); c.scale(-1, 1); } fn(); c.restore(); };
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    let map = null, geo = null;
    if (m) {
      const k = Math.max(W / m[0], H / m[1]), dw = m[0] * k, dh = m[1] * k, ox = (W - dw) / 2, oy = (H - dh) / 2;
      geo = { ox, oy, dw, dh };
      ctx.save(); if (conFiltros && fil.f !== 'none') ctx.filter = fil.f;
      conEspejo(ctx, () => ctx.drawImage(cfg.fuente, ox, oy, dw, dh));
      ctx.restore();
      map = (l) => { let x = ox + l.x * dw; if (cfg.espejo) x = W - x; return { x, y: oy + l.y * dh, v: l.v == null ? 1 : l.v }; };
    } else {
      // sin cámara: un fondo de colores
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#f9c5d9'); g.addColorStop(0.5, '#d9c8f5'); g.addColorStop(1, '#bfe3f7');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      for (let i = 0; i < 40; i++) {
        const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * W, y = (Math.sin(i * 78.233) * 12345.678 % 1 + 1) % 1 * H;
        ctx.beginPath(); ctx.arc(x, y, (i % 3 + 1) * Math.min(W, H) / 320, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (fil.tinte) { ctx.fillStyle = fil.tinte; ctx.fillRect(0, 0, W, H); }
    if (av.modo === 'manual') pintarManual(ctx, W, H, t);
    else if (av.modo === 'ia' && map) pintarIA(ctx, W, H, t, dt, map, geo, conEspejo);
    else if (av.modo === 'ia') estado('Para esto hace falta la cámara encendida 📷');
    if (lente && map) pintarLente(ctx, W, H, t, dt, map);
    else if (lente) estado('Los filtros de cara necesitan la cámara encendida 📷');
    pintarParticulas(ctx, W, dt);
    if (op.firma) firma(ctx, W, H);
    ctx.restore();
  }

  function bucle(t) {
    if (!activo) return;
    raf = requestAnimationFrame(bucle);
    const dt = Math.min(0.1, Math.max(0, (t - (tAnterior || t)) / 1000)); tAnterior = t;
    // el canvas sigue el tamaño con que se ve (nítido y sin deformar)
    const cv = cfg.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (w && h && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
    if (av.modo === 'ia' && poseDet && t - ultimoPose > 80) { ultimoPose = t; detectarPose(256); }
    if (lente && caraDet && t - ultimoCara > 60) { ultimoCara = t; detectarCara(); }
    suavizarCara();
    pintar(cfg.canvas, t, { dt, firma: grabando });
  }

  // ================= API =================
  async function iniciar(c) {
    detener();
    cfg = c; datos = null; suave = null; cara = null; caraSuave = null; ultimoEstado = ''; particulas = []; mariposas = [];
    Object.assign(av, { modo: 'manual', pose: 'normal', accion: null, x: 0.7, y: 0.62, h: 0.42, espejo: false, rect: null });
    lente = null; filtro = 'normal';
    acc.v = null; acc.ultimo = null; acc.de = null; acc.hasta = Infinity;
    activo = true; tAnterior = 0;
    raf = requestAnimationFrame(bucle);
    await prepararAvatar();
  }
  function detener() { activo = false; cancelAnimationFrame(raf); raf = null; grabando = false; }
  function cambiar(c) {
    if (!cfg) return;
    Object.assign(cfg, c);
    if ('fuente' in c || 'espejo' in c) { datos = null; suave = null; cara = null; caraSuave = null; }
    if ('parche' in c) prepararAvatar().catch(() => {});
  }
  // avatar: { modo: 'manual' | 'ia' | null, pose, accion }
  async function setAvatar(o) {
    av.modo = o.modo;
    if (o.pose) av.pose = o.pose;
    ultimoEstado = '';
    if (o.modo === 'ia') {
      av.accion = o.accion; acc.v = null; acc.hasta = Infinity; mariposas = [];
      await cargarPose();
    } else {
      acc.ultimo = null; acc.v = null;
      if (!lente) estado(o.modo === 'manual' ? 'Mueve al personaje con el dedo · pellizca para agrandarlo' : '📸 Toca para foto, mantén para video');
    }
  }
  async function setLente(v) {
    lente = v; ultimoEstado = '';
    if (v) await cargarCara();
  }
  function setFiltro(v) { filtro = FILTROS.some((f) => f.v === v) ? v : 'normal'; }
  function siguienteFiltro() { const i = FILTROS.findIndex((f) => f.v === filtro); filtro = FILTROS[(i + 1) % FILTROS.length].v; return FILTROS[(i + 1) % FILTROS.length]; }
  // avatar quieto: mover (en fracción de la pantalla), agrandar, voltear, ¿tocaste el avatar? (x, y en fracciones)
  function moverAvatar(dx, dy) { av.x = Math.min(1, Math.max(0, av.x + dx)); av.y = Math.min(1.1, Math.max(0, av.y + dy)); }
  function escalarAvatar(f) { av.h = Math.min(1.3, Math.max(0.15, av.h * f)); }
  function voltearAvatar() { av.espejo = !av.espejo; }
  function enAvatar(x, y) { const r = av.rect; return av.modo === 'manual' && !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  // Foto a la resolución completa de la cámara (con la silueta calculada más fina).
  function capturar() {
    const disp = cfg.canvas, A = disp.width / disp.height, m = medidas();
    let w = disp.width, h = disp.height;
    if (m) {
      const [vw, vh] = m;
      if (vw / vh > A) { h = vh; w = Math.round(vh * A); } else { w = vw; h = Math.round(vw / A); }
      const tope = 2160 / Math.max(w, h);
      if (tope < 1) { w = Math.round(w * tope); h = Math.round(h * tope); }
      if (w < disp.width) { w = disp.width; h = disp.height; }
    }
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    if (av.modo === 'ia' && poseDet) detectarPose(512);
    pintar(out, performance.now(), { dt: 0, firma: true });
    return out;
  }
  // Video (lo que se ve en pantalla, con la firma). Devuelve { detener(): Promise<Blob> }
  function puedeGrabar() { return !!(window.MediaRecorder && cfg && cfg.canvas && cfg.canvas.captureStream); }
  function grabar() {
    const stream = cfg.canvas.captureStream(30);
    const tipos = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const tipo = tipos.find((x) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x));
    const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo, videoBitsPerSecond: 6000000 } : undefined);
    const partes = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
    rec.start(250);
    grabando = true;
    return {
      detener: () => new Promise((resolve) => {
        rec.onstop = () => {
          grabando = false;
          stream.getTracks().forEach((tr) => tr.stop());
          resolve(partes.length ? new Blob(partes, { type: (rec.mimeType || tipo || 'video/webm').split(';')[0] }) : null);
        };
        try { rec.stop(); } catch (e) { grabando = false; resolve(null); }
      }),
    };
  }
  function nombreFiltro() { return (FILTROS.find((f) => f.v === filtro) || FILTROS[0]).n; }
  // un cuadro "a pedido" (para probar con una imagen fija)
  function probar(t) { if (av.modo === 'ia') detectarPose(256); if (lente) detectarCara(); suavizarCara(); pintar(cfg.canvas, t || performance.now(), { dt: 0.03 }); }

  return {
    POSES, ACCIONES, SIN_POSES, LENTES, FILTROS,
    iniciar, detener, cambiar, setAvatar, setLente, setFiltro, siguienteFiltro, nombreFiltro,
    moverAvatar, escalarAvatar, voltearAvatar, enAvatar, capturar, puedeGrabar, grabar, celebrar, probar,
    get activo() { return activo; },
  };
})();
