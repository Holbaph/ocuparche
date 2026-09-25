// ar.js — realidad aumentada en la cámara: el avatar juega con quien sale en
// la foto. Puede abrazarla por detrás, hacerle orejas de conejo, esconderse y
// asomarse ("¡Buu!"), sentarse en su hombro, volar con globos, ponerle una
// corona, darle un besito… y en modo 🎲 Sorpresa va cambiando de acción solo,
// sin orden fijo, con transiciones, chispitas y globos de diálogo.
//
// Cómo: PoseLandmarker de MediaPipe (corre en el celular; la imagen no sale
// del dispositivo) entrega dónde están la cabeza, las orejas y los hombros, y
// la SILUETA de la persona. Se pinta en capas sobre un canvas:
//   1) el video;
//   2) una "capa de atrás" (lo que va detrás de la persona: el brazo que
//      abraza, el avatar escondido…) a la que se le borra la silueta;
//   3) lo de adelante: el avatar, manos, corona, globos, chispitas, diálogos.
// La foto es ese mismo canvas.

const RA = (function () {
  const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODELO = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  const EFECTOS = [
    { v: 'sorpresa', n: '🎲 Sorpresa' }, { v: 'escondidas', n: '🙈 Escondidas' }, { v: 'sentada', n: '🧚 En tu hombro' },
    { v: 'abrazo', n: '🤗 Abrazo' }, { v: 'conejito', n: '🐰 Conejito' }, { v: 'globos', n: '🎈 Globos' },
    { v: 'corona', n: '👑 Corona' }, { v: 'besito', n: '😘 Besito' }, { v: 'hombro', n: '🤝 Mano en el hombro' },
    { v: 'saludo', n: '👋 Hola' },
  ];
  const ACCIONES = EFECTOS.map((e) => e.v).filter((v) => v !== 'sorpresa');
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
  };
  const COLORES_CHISPAS = ['#f6d26b', '#e8578a', '#7cc4ea', '#b392d6', '#6fbf73', '#ffffff'];
  const azar = (a, b) => a + Math.random() * (b - a);
  const elegir = (l) => l[Math.floor(Math.random() * l.length)];

  let detector = null, cargando = null;
  let delegado = 'GPU', siluetasVacias = 0; // en algunos equipos la GPU entrega la silueta vacía: se pasa a CPU
  // cfg = { fuente (video o imagen), canvas, espejo, efecto, dibujar(o) -> SVG,
  //         parche, brazo: { piel, contorno, manga, pierna }, alEstado(texto) }
  let cfg = null;
  let activo = false, raf = null, ultimoDetectar = 0, ultimoEstado = '', tAnterior = 0;
  let datos = null;           // { lm, conMascara } de la última persona encontrada
  let suave = null;           // posiciones suavizadas (para que no tiemble)
  let lado = 1;               // 1: el avatar va a la derecha de la persona; -1: a la izquierda
  // la acción en curso (en Sorpresa cambia sola)
  const acc = { v: null, desde: 0, hasta: Infinity, frase: '', de: null, ultimo: null };
  let particulas = [];
  let luz = 0.55;             // luminosidad del ambiente (0–1), para que el avatar no se vea "pegado"
  const muestra = document.createElement('canvas'); muestra.width = 16; muestra.height = 16;
  const conFiltros = 'filter' in document.createElement('canvas').getContext('2d');
  const acciones = () => (cfg && cfg.acciones) || ACCIONES;
  const img = {};             // avatar ya convertido a imagen, por variante
  const det = document.createElement('canvas');      // cuadro chico para la IA
  const mascara = document.createElement('canvas');  // silueta de la persona
  const capa = document.createElement('canvas');     // capa de atrás

  // ================= cargar la IA =================
  async function crear(conDelegado) {
    const { FilesetResolver, PoseLandmarker } = await import(MP + '/vision_bundle.mjs');
    const vision = await FilesetResolver.forVisionTasks(MP + '/wasm');
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODELO, delegate: conDelegado },
      runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: true,
    });
  }
  async function cargar() {
    if (detector) return detector;
    if (!cargando) {
      cargando = (async () => {
        try { detector = await crear('GPU'); delegado = 'GPU'; }
        catch (e) { detector = await crear('CPU'); delegado = 'CPU'; }
        return detector;
      })();
      cargando.catch(() => { cargando = null; });
    }
    return cargando;
  }
  let pasandoACPU = false;
  async function pasarACPU() {
    if (pasandoACPU || delegado === 'CPU') return;
    pasandoACPU = true;
    try { const nuevo = await crear('CPU'); if (detector && detector.close) detector.close(); detector = nuevo; delegado = 'CPU'; }
    catch (e) { /* sigue con lo que había */ }
    pasandoACPU = false;
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
    const d = (o) => aImagen(cfg.dibujar({ parche: cfg.parche, ...o }), '0 0 320 440', 640, 880);
    const [a, b, c, e, f, g, h] = await Promise.all([
      d({ sinBrazo: 'izq' }), d({ sinBrazo: 'der' }), d({ pose: 'hurra' }), d({ pose: 'corazon' }), d({ pose: 'saludo' }), d({}),
      aImagen(sombreroAv('corona', '#e2b64a'), '84 4 152 93', 372, 228), // (avatar.js)
    ]);
    Object.assign(img, { 'sin-izq': a, 'sin-der': b, hurra: c, corazon: e, saludo: f, normal: g, corona: h });
  }

  // ================= IA: persona y silueta =================
  function medidas(f) { return f.videoWidth ? [f.videoWidth, f.videoHeight] : [f.naturalWidth || f.width, f.naturalHeight || f.height]; }

  function detectar() {
    const [vw, vh] = medidas(cfg.fuente);
    if (!vw) return;
    det.width = 256; det.height = Math.round(256 * vh / vw);
    det.getContext('2d').drawImage(cfg.fuente, 0, 0, det.width, det.height);
    try {
      const mx = muestra.getContext('2d', { willReadFrequently: true });
      mx.drawImage(det, 0, 0, 16, 16);
      const d = mx.getImageData(0, 0, 16, 16).data;
      let suma = 0;
      for (let i = 0; i < d.length; i += 4) suma += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      luz = mezcla(luz, suma / 256, 0.2);
    } catch (e) { /* sin lectura de píxeles: se queda con la luz anterior */ }
    try {
      detector.detectForVideo(det, performance.now(), (r) => {
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

  // ================= piezas de dibujo =================
  function estado(texto) { if (texto !== ultimoEstado) { ultimoEstado = texto; if (cfg.alEstado) cfg.alEstado(texto); } }
  const mezcla = (a, b, t) => a + (b - a) * t;
  const punto = (a, b, t) => ({ x: mezcla(a.x, b.x, t), y: mezcla(a.y, b.y, t) });
  const rebote = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const suaveEntre = (x) => x * x * (3 - 2 * x);

  // brazo del avatar (curva hombro -> mano), con manga y, si se pide, mano
  function brazo(ctx, de, ctrl, a, esc, conMano) {
    const b = cfg.brazo;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const curva = (hasta) => {
      const p1 = punto(de, ctrl, hasta), p01 = punto(ctrl, a, hasta), fin = punto(p1, p01, hasta);
      ctx.beginPath(); ctx.moveTo(de.x, de.y); ctx.quadraticCurveTo(p1.x, p1.y, fin.x, fin.y);
    };
    curva(1); ctx.strokeStyle = b.contorno; ctx.lineWidth = 17.5 * esc; ctx.stroke();
    ctx.strokeStyle = b.piel; ctx.lineWidth = 15 * esc; ctx.stroke();
    if (b.manga) {
      ctx.fillStyle = b.manga.c; ctx.strokeStyle = b.manga.c;
      if (b.manga.tipo === 'larga' || b.manga.tipo === 'velo') {
        ctx.globalAlpha = b.manga.tipo === 'velo' ? 0.75 : 1;
        curva(0.85); ctx.lineWidth = 18 * esc; ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(de.x, de.y, (b.manga.tipo === 'globo' ? 20 : 15) * esc, (b.manga.tipo === 'globo' ? 16 : 13) * esc, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (conMano) mano(ctx, a, esc);
    ctx.restore();
  }
  function mano(ctx, p, esc, dedos) {
    const b = cfg.brazo;
    ctx.save();
    ctx.fillStyle = b.piel; ctx.strokeStyle = b.contorno; ctx.lineWidth = 1.4 * esc;
    ctx.beginPath(); ctx.arc(p.x, p.y, 10 * esc, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (dedos) {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.ellipse(p.x + i * 6 * esc, p.y + 8 * esc, 3.4 * esc, 5.5 * esc, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  }
  // pierna colgando (para sentarse en el hombro)
  function pierna(ctx, x, y, largo, ang, esc) {
    const b = cfg.brazo, p = b.pierna || { c: b.piel, zapato: null };
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.lineCap = 'round';
    ctx.strokeStyle = b.contorno; ctx.lineWidth = 17.5 * esc;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, largo); ctx.stroke();
    ctx.strokeStyle = p.c; ctx.lineWidth = 15 * esc; ctx.stroke();
    ctx.fillStyle = p.zapato || b.piel; ctx.strokeStyle = b.contorno; ctx.lineWidth = 1.2 * esc;
    ctx.beginPath(); ctx.ellipse(2 * esc, largo + 4 * esc, 12 * esc, 7 * esc, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function corazon(ctx, x, y, r, color, alfa) {
    ctx.save(); ctx.globalAlpha = alfa; ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x, y + r);
    ctx.bezierCurveTo(x - r * 1.3, y + r * 0.2, x - r * 1.2, y - r, x, y - r * 0.5);
    ctx.bezierCurveTo(x + r * 1.2, y - r, x + r * 1.3, y + r * 0.2, x, y + r);
    ctx.fill(); ctx.restore();
  }
  // brillo del avatar según la luz del ambiente (en sombra, más oscuro; al sol, normal)
  function filtroLuz() {
    if (!conFiltros) return 'none';
    const b = Math.max(0.78, Math.min(1.06, 0.7 + luz * 0.62));
    return `brightness(${b.toFixed(2)}) saturate(${(0.88 + luz * 0.18).toFixed(2)})`;
  }
  // el avatar con una sombrita suave (para que se vea "dentro" de la foto)
  function avatar(ctx, im, x, y, w, h, rot, recorte) {
    ctx.save();
    ctx.filter = filtroLuz();
    ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = w * 0.06; ctx.shadowOffsetY = w * 0.02;
    if (rot) { ctx.translate(x + w / 2, y + h); ctx.rotate(rot); ctx.translate(-(x + w / 2), -(y + h)); }
    if (recorte) ctx.drawImage(im, 0, 0, im.width, im.height * recorte, x, y, w, h * recorte);
    else ctx.drawImage(im, x, y, w, h);
    ctx.restore();
  }
  // sombrita en el piso, bajo los pies
  function sombraPiso(ctx, x, y, ancho) {
    ctx.save();
    const g = ctx.createRadialGradient(x, y, 0, x, y, ancho * 0.36);
    g.addColorStop(0, 'rgba(0,0,0,.32)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.translate(x, y); ctx.scale(1, 0.22); ctx.translate(-x, -y);
    ctx.beginPath(); ctx.arc(x, y, ancho * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // globo de diálogo
  function dialogo(ctx, x, y, texto, tam, alfa) {
    if (!texto || alfa <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alfa);
    ctx.font = `800 ${tam}px Figtree, system-ui, sans-serif`;
    const w = ctx.measureText(texto).width + tam * 1.2, h = tam * 1.8, r = h / 2;
    const bx = Math.max(4, Math.min(ctx.canvas.width - w - 4, x - w / 2)), by = Math.max(4, y - h);
    const px = Math.max(bx + r, Math.min(bx + w - r, x)); // la puntita, siempre dentro del globo
    ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = tam * 0.5;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(bx + r, by); ctx.arcTo(bx + w, by, bx + w, by + h, r); ctx.arcTo(bx + w, by + h, bx, by + h, r);
    ctx.lineTo(px + tam * 0.4, by + h); ctx.lineTo(px, by + h + tam * 0.6); ctx.lineTo(px - tam * 0.2, by + h);
    ctx.arcTo(bx, by + h, bx, by, r); ctx.arcTo(bx, by, bx + w, by, r);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2a2740'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(texto, bx + w / 2, by + h / 2 + tam * 0.05);
    ctx.restore();
  }

  // ---------- chispitas ----------
  function chispas(x, y, n, fuerza) {
    for (let i = 0; i < n; i++) {
      const ang = azar(0, Math.PI * 2), v = azar(0.3, 1) * fuerza;
      particulas.push({
        x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - fuerza * 0.4, vida: 1, dur: azar(0.8, 1.4),
        color: elegir(COLORES_CHISPAS), tam: azar(0.5, 1), forma: Math.random() < 0.5 ? 'estrella' : 'confeti', giro: azar(0, 6),
      });
    }
    if (particulas.length > 220) particulas = particulas.slice(-220);
  }
  function dibujarChispas(ctx, dt, base) {
    particulas = particulas.filter((p) => (p.vida -= dt / p.dur) > 0);
    particulas.forEach((p) => {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += base * 1.2 * dt; p.giro += dt * 6;
      const t = base * 0.035 * p.tam;
      ctx.save(); ctx.globalAlpha = Math.min(1, p.vida * 1.5); ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y); ctx.rotate(p.giro);
      if (p.forma === 'confeti') ctx.fillRect(-t, -t * 0.45, t * 2, t * 0.9);
      else {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? t * 0.45 : t; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.fill();
      }
      ctx.restore();
    });
  }

  // ================= acciones =================
  function nuevaAccion(v, t, dondeEstaba) {
    acc.v = v; acc.desde = t; acc.de = dondeEstaba || acc.ultimo;
    acc.frase = elegir(FRASES[v] || ['']);
    acc.hasta = cfg.efecto === 'sorpresa' ? t + azar(3800, 6800) : Infinity;
    if (cfg.efecto === 'sorpresa' && Math.random() < 0.35) lado = -lado; // a veces se cambia de lado
    if (acc.ultimo) chispas(acc.ultimo.hx, acc.ultimo.hy, 26, acc.ultimo.diam * 2.2);
  }
  function siguienteSorpresa(t) {
    nuevaAccion(elegir(acciones().filter((v) => v !== acc.v)), t, acc.ultimo);
  }

  // dónde va el avatar (centro de su cabeza, tamaño, giro) en cada acción
  function colocar(v, s, t, W) {
    // del tamaño de su cabeza, pero que quepa al lado sin taparle la cara
    const diamBase = Math.max(W * 0.14, Math.min(s.w * 0.85, W * 0.34, s.espacio * 0.95 * 236 / 320));
    const local = t - acc.desde;
    switch (v) {
      case 'besito': return { hx: s.cx + lado * (s.w * 0.5 + diamBase * 0.4), hy: s.cy + s.w * 0.08, diam: diamBase, rot: -lado * 0.16 };
      case 'abrazo': return { hx: s.cx + lado * (s.w * 0.5 + diamBase * 0.55), hy: s.cy + s.w * 0.35, diam: diamBase, rot: 0 };
      case 'escondidas': {
        // se asoma y se esconde detrás de la cabeza, cambiando de lado sin aviso
        const ciclo = 2800, n = Math.floor(local / ciclo), f = (local % ciclo) / ciclo;
        const ladoAqui = (n * 7919 + Math.floor(acc.desde)) % 3 === 0 ? -lado : lado;
        const asoma = f < 0.25 ? suaveEntre(f / 0.25) : f < 0.7 ? 1 : f < 0.9 ? 1 - suaveEntre((f - 0.7) / 0.2) : 0;
        return { hx: s.cx + ladoAqui * (s.w * 0.05 + s.w * 0.62 * asoma), hy: s.cy + s.w * 0.02, diam: diamBase * 0.95, rot: ladoAqui * 0.14 * asoma, asoma, ladoAqui };
      }
      case 'sentada': {
        const d = s.w * 0.5, esc = d / 236;
        return { hx: s.hombroCerca.x + lado * s.w * 0.05, hy: s.hombroCerca.y - s.w * 0.05 - (372 - 176) * esc, diam: d, rot: Math.sin(t / 500) * 0.05 };
      }
      case 'globos':
        return {
          hx: s.cx + lado * (s.w * 0.85 + s.w * 0.25 * Math.sin(t / 1400)),
          hy: s.cy - s.w * 0.55 + s.w * 0.18 * Math.sin(t / 800), diam: diamBase * 0.8, rot: Math.sin(t / 700) * 0.12,
        };
      default: return { hx: s.cx + lado * (s.w * 0.55 + diamBase * 0.62), hy: s.cy + s.w * 0.35, diam: diamBase, rot: 0 };
    }
  }

  // ================= cuadro a cuadro =================
  function dibujar(t) {
    const cv = cfg.canvas, ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const [vw, vh] = medidas(cfg.fuente);
    if (!vw || !W) return;
    const dt = Math.min(0.1, Math.max(0, (t - (tAnterior || t)) / 1000)); tAnterior = t;
    const k = Math.max(W / vw, H / vh), dw = vw * k, dh = vh * k, ox = (W - dw) / 2, oy = (H - dh) / 2;
    const conEspejo = (c, fn) => { c.save(); if (cfg.espejo) { c.translate(W, 0); c.scale(-1, 1); } fn(); c.restore(); };

    // 1) el video
    ctx.clearRect(0, 0, W, H);
    conEspejo(ctx, () => ctx.drawImage(cfg.fuente, ox, oy, dw, dh));
    if (!datos) {
      estado('🙂 Ponte frente a la cámara, que se te vea la cabeza y los hombros');
      dibujarChispas(ctx, dt, W * 0.12);
      return;
    }
    estado(cfg.efecto === 'sorpresa' ? '🎲 ¡Sorpresa! Saca la foto cuando quieras' : '✨ ¡Listo! Saca la foto');

    // la persona, en la pantalla
    const P = (i) => { const l = datos.lm[i]; let x = ox + l.x * dw; if (cfg.espejo) x = W - x; return { x, y: oy + l.y * dh, v: l.v }; };
    const oA = P(7), oB = P(8), hA = P(11), hB = P(12), nariz = P(0);
    const anchoHombros = Math.hypot(hA.x - hB.x, hA.y - hB.y);
    let anchoCabeza = Math.hypot(oA.x - oB.x, oA.y - oB.y) * 1.35;
    if (anchoCabeza < anchoHombros * 0.3 || oA.v < 0.3 || oB.v < 0.3) anchoCabeza = anchoHombros * 0.5;
    const obj = {
      cx: (oA.x + oB.x) / 2 * 0.6 + nariz.x * 0.4, cy: (oA.y + oB.y) / 2, w: anchoCabeza,
      hAx: hA.x, hAy: hA.y, hBx: hB.x, hBy: hB.y,
    };
    if (!suave) suave = { ...obj };
    Object.keys(obj).forEach((key) => { suave[key] = mezcla(suave[key], obj[key], 0.4); });
    const s = { ...suave };
    // el lado con más espacio (con margen para que no salte de un lado a otro)
    const espacioDer = W - (s.cx + s.w * 0.55), espacioIzq = s.cx - s.w * 0.55;
    if (cfg.efecto !== 'sorpresa') {
      if (lado > 0 && espacioIzq > espacioDer * 1.3) lado = -1;
      else if (lado < 0 && espacioDer > espacioIzq * 1.3) lado = 1;
    }
    s.espacio = Math.max(0, lado > 0 ? espacioDer : espacioIzq);
    const hA2 = { x: s.hAx, y: s.hAy }, hB2 = { x: s.hBx, y: s.hBy };
    // hombro de la persona del lado del avatar
    s.hombroCerca = (lado > 0) === (hA2.x > hB2.x) ? hA2 : hB2;
    const hombroLejos = s.hombroCerca === hA2 ? hB2 : hA2;
    const arribaCabeza = s.cy - s.w * 0.75;

    // acción en curso (en Sorpresa, cambia sola cada tanto)
    if (!acc.v || (cfg.efecto !== 'sorpresa' && acc.v !== cfg.efecto)) nuevaAccion(cfg.efecto === 'sorpresa' ? elegir(acciones()) : cfg.efecto, t, acc.ultimo);
    else if (t > acc.hasta) siguienteSorpresa(t);
    const v = acc.v;

    // dónde va, con una transición que rebota desde donde estaba
    let L = colocar(v, s, t, W);
    const trans = Math.min(1, (t - acc.desde) / 650);
    const enTransicion = trans < 1 && !!acc.de;
    if (enTransicion) {
      const e = rebote(trans);
      L = { ...L, hx: mezcla(acc.de.hx, L.hx, e), hy: mezcla(acc.de.hy, L.hy, e), diam: mezcla(acc.de.diam, L.diam, e), rot: mezcla(acc.de.rot || 0, L.rot || 0, e) };
    }
    const esc = L.diam / 236, ancho = 320 * esc, alto = 440 * esc;
    // que no se salga de la imagen (salvo cuando se esconde, vuela o se sienta)
    if (!['escondidas', 'globos', 'sentada'].includes(v)) {
      L.hx = Math.min(W - ancho * 0.45, Math.max(ancho * 0.45, L.hx));
      L.hy = Math.min(H - alto * 0.35, Math.max(176 * esc * 0.8, L.hy));
    }
    acc.ultimo = { hx: L.hx, hy: L.hy, diam: L.diam, rot: L.rot || 0 };
    const bote = v === 'sentada' || v === 'globos' ? 0 : Math.sin(t / 320) * 3 * esc;
    const ax = L.hx - 160 * esc, ay = L.hy - 176 * esc + bote;
    const cercano = lado > 0 ? 'izq' : 'der'; // el brazo del avatar que queda del lado de la persona
    const hombroAv = { x: ax + (cercano === 'izq' ? 118 : 202) * esc, y: ay + 298 * esc };
    const dentro = (p) => ({ x: Math.min(W - 12 * esc, Math.max(12 * esc, p.x)), y: Math.min(H - 12 * esc, Math.max(12 * esc, p.y)) });
    const tamTexto = Math.max(13 * (W / 400), L.diam * 0.13);
    const alfaFrase = Math.min(1, (t - acc.desde - 500) / 300);

    // 2) capa de atrás
    if (capa.width !== W || capa.height !== H) { capa.width = W; capa.height = H; }
    const cc = capa.getContext('2d');
    cc.clearRect(0, 0, W, H);
    const frente = [];
    const sinSilueta = !datos.conMascara;

    if (enTransicion || (sinSilueta && ['abrazo', 'hombro', 'conejito', 'escondidas', 'besito'].includes(v))) {
      // mientras viaja (o sin silueta todavía): el avatar solo, con los brazos arriba
      frente.push(() => avatar(ctx, img.hurra, ax, ay, ancho, alto, L.rot));
    } else if (v === 'abrazo' || v === 'hombro' || v === 'conejito') {
      frente.push(() => avatar(ctx, img['sin-' + cercano], ax, ay, ancho, alto, 0));
      if (v === 'abrazo') {
        const a = dentro({ x: hombroLejos.x, y: hombroLejos.y - s.w * 0.12 });
        const ctrl = { x: (hombroAv.x + a.x) / 2, y: Math.max(hombroAv.y, a.y) + s.w * 0.35 };
        brazo(cc, hombroAv, ctrl, a, esc, false);
        frente.push(() => mano(ctx, a, esc * 1.45, true));
      } else if (v === 'hombro') {
        const a = dentro({ x: s.hombroCerca.x - lado * s.w * 0.05, y: s.hombroCerca.y - s.w * 0.14 });
        const ctrl = { x: (hombroAv.x + a.x) / 2, y: Math.min(hombroAv.y, a.y) - s.w * 0.1 };
        brazo(cc, hombroAv, ctrl, a, esc, false);
        frente.push(() => mano(ctx, a, esc * 1.45, true));
      } else {
        const a = { x: s.cx + lado * s.w * 0.12, y: arribaCabeza + s.w * 0.25 };
        const ctrl = { x: hombroAv.x + lado * s.w * 0.1, y: a.y };
        brazo(cc, hombroAv, ctrl, a, esc, true);
        const b = cfg.brazo, largo = s.w * (0.58 + 0.06 * Math.sin(t / 180)), grosor = 10 * esc; // las orejitas se mueven
        [-0.2, 0.2].forEach((ang) => {
          cc.save(); cc.translate(a.x, a.y); cc.rotate(ang + Math.sin(t / 250) * 0.05);
          cc.fillStyle = b.piel; cc.strokeStyle = b.contorno; cc.lineWidth = 1.4 * esc;
          cc.beginPath(); cc.ellipse(0, -largo / 2, grosor, largo / 2, 0, 0, Math.PI * 2); cc.fill(); cc.stroke();
          cc.restore();
        });
      }
    } else if (v === 'escondidas') {
      // detrás de la persona: se ve solo lo que asoma
      cc.save();
      cc.translate(L.hx, ay + alto); cc.rotate(L.rot); cc.drawImage(L.asoma > 0.8 ? img.saludo : img.normal, ax - L.hx, -alto, ancho, alto);
      cc.restore();
      if (L.asoma > 0.85) frente.push(() => dialogo(ctx, L.hx + L.ladoAqui * L.diam * 0.35, ay + 20 * esc, acc.frase, tamTexto, (L.asoma - 0.85) / 0.15));
    } else if (v === 'sentada') {
      // chiquitita, sentada en el hombro: medio cuerpo, piernas colgando y una mano en la cabeza
      const interior = lado > 0 ? 'izq' : 'der';
      const caderaY = ay + 372 * esc;
      frente.push(() => {
        pierna(ctx, L.hx - 11 * esc, caderaY - 4 * esc, 58 * esc, 0.25 * Math.sin(t / 230), esc);
        pierna(ctx, L.hx + 11 * esc, caderaY - 4 * esc, 58 * esc, 0.25 * Math.sin(t / 230 + 2), esc);
        avatar(ctx, img['sin-' + interior], ax, ay, ancho, alto, L.rot, 372 / 440);
        const hAv = { x: ax + (interior === 'izq' ? 118 : 202) * esc, y: ay + 298 * esc };
        const a = { x: s.cx + lado * s.w * 0.47, y: arribaCabeza + s.w * 0.42 };
        brazo(ctx, hAv, { x: (hAv.x + a.x) / 2 + lado * s.w * 0.05, y: Math.min(hAv.y, a.y) - s.w * 0.05 }, a, esc, true);
        dialogo(ctx, L.hx, ay - 6 * esc, acc.frase, tamTexto * 0.85, alfaFrase);
      });
    } else if (v === 'globos') {
      frente.push(() => {
        // la mano levantada de la pose "saludo" está en (296,236) del avatar
        const mg = cfg.manoGlobos || { x: 296, y: 236 };
        const manoG = { x: ax + mg.x * esc, y: ay + mg.y * esc };
        ['#e8578a', '#7cc4ea', '#f6d26b'].forEach((c, i) => {
          const gx = manoG.x + (i - 1) * L.diam * 0.32 + Math.sin(t / 600 + i) * L.diam * 0.05;
          const gy = manoG.y - L.diam * (0.9 + 0.12 * i);
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5 * esc;
          ctx.beginPath(); ctx.moveTo(manoG.x, manoG.y); ctx.quadraticCurveTo(gx + 8 * esc, (gy + manoG.y) / 2, gx, gy + L.diam * 0.22); ctx.stroke();
          ctx.fillStyle = c; ctx.shadowColor = 'rgba(0,0,0,.2)'; ctx.shadowBlur = 8 * esc;
          ctx.beginPath(); ctx.ellipse(gx, gy, L.diam * 0.17, L.diam * 0.22, 0, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.55)';
          ctx.beginPath(); ctx.ellipse(gx - L.diam * 0.06, gy - L.diam * 0.08, L.diam * 0.04, L.diam * 0.06, -0.5, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        avatar(ctx, img.saludo, ax, ay, ancho, alto, L.rot);
      });
    } else if (v === 'corona') {
      frente.push(() => avatar(ctx, img.hurra, ax, ay, ancho, alto, 0));
      const cw = s.w * 1.0, ch = cw * 76 / 124;
      const baja = Math.min(1, (t - acc.desde) / 700); // la corona "cae" sobre la cabeza
      frente.push(() => ctx.drawImage(img.corona, s.cx - cw / 2, arribaCabeza - ch * 0.55 - (1 - rebote(baja)) * s.w * 0.6, cw, ch));
    } else if (v === 'besito') {
      cc.save();
      cc.translate(L.hx, ay + alto); cc.rotate(L.rot);
      cc.drawImage(img.corazon, ax - L.hx, -alto, ancho, alto);
      cc.restore();
      frente.push(() => {
        for (let i = 0; i < 3; i++) {
          const fase = ((t / 1400) + i / 3) % 1;
          const x = s.cx + lado * s.w * (0.45 + 0.1 * Math.sin(fase * 6 + i));
          corazon(ctx, x, s.cy - fase * s.w * 0.9, s.w * (0.06 + 0.03 * i), '#e8578a', 1 - fase);
        }
      });
    } else { // saludo
      frente.push(() => avatar(ctx, img.saludo, ax, ay, ancho, alto, Math.sin(t / 260) * 0.06));
    }
    // sombrita bajo los pies de los que están parados (va antes que el avatar)
    const piso = ay + alto * 0.985;
    if (!enTransicion && ['abrazo', 'hombro', 'conejito', 'corona', 'saludo'].includes(v) && piso < H) {
      frente.unshift(() => sombraPiso(ctx, L.hx, piso, ancho));
    }
    // globo de diálogo (salvo las acciones que lo ponen ellas mismas)
    if (!enTransicion && !['escondidas', 'sentada'].includes(v)) {
      frente.push(() => dialogo(ctx, L.hx, ay - 4 * esc, acc.frase, tamTexto, alfaFrase));
    }

    if (datos.conMascara) {
      cc.globalCompositeOperation = 'destination-out';
      if (conFiltros) cc.filter = `blur(${Math.max(1, W / 400).toFixed(1)}px)`; // bordes suaves
      conEspejo(cc, () => cc.drawImage(mascara, ox, oy, dw, dh));
      cc.filter = 'none';
      cc.globalCompositeOperation = 'source-over';
    }
    ctx.save(); ctx.filter = filtroLuz(); ctx.drawImage(capa, 0, 0); ctx.restore();

    // 3) lo de adelante
    frente.forEach((f) => f());
    dibujarChispas(ctx, dt, W * 0.12);
  }

  function bucle(t) {
    if (!activo) return;
    raf = requestAnimationFrame(bucle);
    if (t - ultimoDetectar > 80) { ultimoDetectar = t; detectar(); }
    dibujar(t);
  }

  // ================= API =================
  async function iniciar(c) {
    detener();
    cfg = c; datos = null; suave = null; ultimoEstado = ''; particulas = [];
    acc.v = null; acc.ultimo = null; acc.de = null; acc.hasta = Infinity;
    estado('✨ Preparando la magia… (la primera vez tarda un poquito)');
    await cargar();
    await prepararAvatar();
    activo = true;
    raf = requestAnimationFrame(bucle);
  }
  function detener() { activo = false; cancelAnimationFrame(raf); raf = null; }
  function cambiar(cambios) {
    if (!cfg) return;
    Object.assign(cfg, cambios);
    if ('efecto' in cambios) { acc.v = null; acc.hasta = Infinity; }
    if ('parche' in cambios) prepararAvatar().catch(() => {});
  }
  // lluvia de chispitas (al sacar la foto)
  function celebrar() {
    if (!cfg || !acc.ultimo) return;
    chispas(acc.ultimo.hx, acc.ultimo.hy, 40, acc.ultimo.diam * 3);
  }
  // un cuadro "a pedido" (para probar con una imagen fija)
  function dibujarUnaVez(t) { detectar(); dibujar(t || performance.now()); }

  return { EFECTOS, iniciar, detener, cambiar, cargar, celebrar, dibujarUnaVez, get activo() { return activo; } };
})();
