// avatar.js — personalización de apariencia por paciente. El avatar se guarda
// como JSON junto al paciente; acá vive todo lo visual: paletas, peinados, y
// cómo se dibuja el cuerpo entero (torso, brazos, piernas, ropa, zapatos,
// gorros, lentes y joyas) dentro del mismo monito SVG que ya existe en el HTML.
//
// Plan gratis: solo género y peinado. Plan completo: todo lo demás (el
// servidor también lo exige, ver routes-pacientes.ts).

const PALETA_PELO = ['#2b2420', '#6b4a34', '#9c6b3f', '#d9b26a', '#b5532c', '#9a9a9a', '#e29ac2'];
const PALETA_OJOS = ['#8b5e3c', '#4a3222', '#5c8a5c', '#5b8fae', '#8a94a3', '#a67b4f'];
const PALETA_MONO = ['#c96f8f', '#5b8fae', '#e0b23c', '#9b6fb0', '#c9525a', '#5c9a72'];
const PALETA_ROPA = ['#e1673f', '#2f6e73', '#5b8fae', '#e0b23c', '#9b6fb0', '#5c9a72', '#c9525a', '#2e2622', '#f7f5f2'];
const PALETA_PANTALON = ['#5b7c9e', '#2e2622', '#8a94a3', '#2f6e73', '#c9525a', '#9b6fb0', '#c9a874', '#f7f5f2'];
const PALETA_ZAPATOS = ['#3a3540', '#f7f5f2', '#c9525a', '#5b8fae', '#e0b23c', '#8a5a3a', '#e29ac2'];
const PALETA_PIEL = ['#fde6d4', '#f6e0c8', '#f1c9a5', '#dfa77c', '#c98e64', '#b97d52', '#8a5634', '#5e3a24'];

const HEX_AV = /^#[0-9a-f]{6}$/i;

const AVATAR_POR_DEFECTO = {
  niña: {
    genero: 'niña', peinado: 'largo', colorPelo: '#6b4a34', moño: true, colorMoño: '#c96f8f', colorOjos: '#8b5e3c', colorRopa: '#c9525a',
    piel: '#f6e0c8', cuerpo: 'normal', ropa: 'vestido', pantalon: 'falda', colorPantalon: '#5b7c9e', colorZapatos: '#3a3540',
    sombrero: 'ninguno', colorSombrero: '#e1673f', lentes: 'ninguno', reloj: false, collar: 'ninguno', aros: false,
  },
  niño: {
    genero: 'niño', peinado: 'corto', colorPelo: '#2b2420', moño: false, colorMoño: '#c96f8f', colorOjos: '#8b5e3c', colorRopa: '#5b8fae',
    piel: '#f6e0c8', cuerpo: 'normal', ropa: 'polera', pantalon: 'jeans', colorPantalon: '#5b7c9e', colorZapatos: '#3a3540',
    sombrero: 'ninguno', colorSombrero: '#e1673f', lentes: 'ninguno', reloj: false, collar: 'ninguno', aros: false,
  },
};

function avatarPorDefecto(genero) {
  return { ...(AVATAR_POR_DEFECTO[genero] || AVATAR_POR_DEFECTO.niña) };
}

// ---------- opciones (g: 'niña' / 'niño' = solo ese género; sin g = las dos) ----------
const CUERPOS_AV = [{ v: 'delgado', n: 'Delgado' }, { v: 'normal', n: 'Normal' }, { v: 'fuerte', n: 'Fuerte' }];
const ESCALA_CUERPO_AV = { delgado: 0.86, normal: 1, fuerte: 1.16 };
const ROPAS_AV = [
  { v: 'polera', n: 'Polera' }, { v: 'sweater', n: 'Sweater' }, { v: 'tirantes', n: 'Tirantes' },
  { v: 'vestido', n: 'Vestido', g: 'niña' }, { v: 'heroe', n: 'Traje de héroe' },
];
const PANTALONES_AV = [
  { v: 'jeans', n: 'Jeans' }, { v: 'short', n: 'Short' }, { v: 'calzas', n: 'Calzas' }, { v: 'falda', n: 'Falda', g: 'niña' },
];
const SOMBREROS_AV = [
  { v: 'ninguno', n: 'Ninguno' }, { v: 'jockey', n: 'Jockey' }, { v: 'jockey-plano', n: 'Jockey plano' },
  { v: 'gorro-lana', n: 'Gorro de lana' }, { v: 'sombrero', n: 'Sombrero' }, { v: 'boina', n: 'Boina' },
];
const LENTES_AV = [{ v: 'ninguno', n: 'Ninguno' }, { v: 'sol', n: 'De sol' }, { v: 'redondos', n: 'Redondos' }];
const COLLARES_AV = [{ v: 'ninguno', n: 'Ninguno' }, { v: 'cadena', n: 'Cadena' }, { v: 'perlas', n: 'Perlas' }];

function opcionesDe(lista, genero) { return lista.filter((o) => !o.g || o.g === genero); }

// Cada peinado son formas simples (círculos/óvalos) dibujadas DETRÁS de la
// cabeza — como esa capa se pinta antes que el círculo de piel, cualquier
// parte que quede "por dentro" del contorno de la cara se tapa sola, sin
// necesitar recortes (clip-path) exactos.
const PEINADOS = {
  corto: () => `<ellipse cx="160" cy="106" rx="112" ry="64"/>`,
  largo: () => `
    <ellipse cx="160" cy="106" rx="112" ry="64"/>
    <ellipse cx="56" cy="212" rx="28" ry="92"/>
    <ellipse cx="264" cy="212" rx="28" ry="92"/>`,
  rizado: () => `
    <ellipse cx="160" cy="112" rx="106" ry="58"/>
    <circle cx="70" cy="98" r="30"/>
    <circle cx="112" cy="66" r="32"/>
    <circle cx="160" cy="54" r="34"/>
    <circle cx="208" cy="66" r="32"/>
    <circle cx="250" cy="98" r="30"/>`,
  coleta: () => `
    <ellipse cx="160" cy="100" rx="100" ry="54"/>
    <ellipse cx="258" cy="132" rx="34" ry="46" transform="rotate(25 258 132)"/>`,
  bob: () => `
    <ellipse cx="160" cy="106" rx="112" ry="64"/>
    <ellipse cx="62" cy="190" rx="30" ry="62"/>
    <ellipse cx="258" cy="190" rx="30" ry="62"/>`,
  chongos: () => `
    <ellipse cx="160" cy="106" rx="108" ry="60"/>
    <circle cx="70" cy="64" r="32"/>
    <circle cx="250" cy="64" r="32"/>`,
  trenzas: () => `
    <ellipse cx="160" cy="106" rx="110" ry="62"/>
    <ellipse cx="60" cy="230" rx="22" ry="84"/>
    <ellipse cx="260" cy="230" rx="22" ry="84"/>
    <circle cx="60" cy="318" r="12"/>
    <circle cx="260" cy="318" r="12"/>`,
  mohicano: () => `
    <ellipse cx="160" cy="104" rx="100" ry="46" opacity=".3"/>
    <ellipse cx="160" cy="56" rx="24" ry="58"/>`,
  copete: () => `
    <ellipse cx="160" cy="106" rx="110" ry="62"/>
    <ellipse cx="184" cy="52" rx="66" ry="30" transform="rotate(-12 184 52)"/>`,
  rapado: () => `<ellipse cx="160" cy="102" rx="104" ry="54" opacity=".32"/>`,
  lado: () => `
    <ellipse cx="160" cy="106" rx="112" ry="64"/>
    <ellipse cx="120" cy="64" rx="86" ry="34" transform="rotate(-8 120 64)"/>`,
};

// g: 'niña' / 'niño' = solo ese género; sin g = los dos
const PEINADOS_LISTA = [
  { v: 'corto', n: 'Corto' },
  { v: 'rizado', n: 'Rizado' },
  { v: 'largo', n: 'Largo', g: 'niña' },
  { v: 'coleta', n: 'Coleta', g: 'niña' },
  { v: 'bob', n: 'Bob', g: 'niña' },
  { v: 'chongos', n: 'Chongos', g: 'niña' },
  { v: 'trenzas', n: 'Trenzas', g: 'niña' },
  { v: 'copete', n: 'Copete', g: 'niño' },
  { v: 'lado', n: 'De lado', g: 'niño' },
  { v: 'mohicano', n: 'Mohicano', g: 'niño' },
  { v: 'rapado', n: 'Rapado', g: 'niño' },
];
function peinadosDe(genero) { return PEINADOS_LISTA.filter((p) => !p.g || p.g === genero); }

function moñoSvg() {
  return `
    <path d="M138 40 L112 22 L112 58 Z"/>
    <path d="M182 40 L208 22 L208 58 Z"/>
    <circle cx="160" cy="40" r="10"/>`;
}

// ---------- colores ----------
function mezclarHex(a, b, t) {
  const p = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const A = p(a), B = p(b);
  return '#' + [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0')).join('');
}
function oscurecerHex(c, t) { return mezclarHex(c, '#000000', t); }
function aclararHex(c, t) { return mezclarHex(c, '#ffffff', t); }

// Lo guardado viene de la base de datos y se mete en el SVG: se valida todo
// (solo colores #rrggbb y opciones conocidas), sin fiarse del JSON.
function normalizarAvatar(avatar) {
  const gen = avatar && avatar.genero === 'niño' ? 'niño' : 'niña';
  const base = avatarPorDefecto(gen);
  const a = { ...base };
  const raw = avatar && typeof avatar === 'object' ? avatar : {};
  ['colorPelo', 'colorMoño', 'colorOjos', 'colorRopa', 'piel', 'colorPantalon', 'colorZapatos', 'colorSombrero'].forEach((k) => {
    if (typeof raw[k] === 'string' && HEX_AV.test(raw[k])) a[k] = raw[k].toLowerCase();
  });
  if (PEINADOS[raw.peinado]) a.peinado = raw.peinado;
  const enLista = (lista, v) => lista.some((o) => o.v === v);
  if (enLista(CUERPOS_AV, raw.cuerpo)) a.cuerpo = raw.cuerpo;
  if (enLista(ROPAS_AV, raw.ropa)) a.ropa = raw.ropa;
  if (enLista(PANTALONES_AV, raw.pantalon)) a.pantalon = raw.pantalon;
  if (enLista(SOMBREROS_AV, raw.sombrero)) a.sombrero = raw.sombrero;
  if (enLista(LENTES_AV, raw.lentes)) a.lentes = raw.lentes;
  if (enLista(COLLARES_AV, raw.collar)) a.collar = raw.collar;
  ['moño', 'reloj', 'aros'].forEach((k) => { if (typeof raw[k] === 'boolean') a[k] = raw[k]; });
  return a;
}

// ---------- el cuerpo ----------
// Coordenadas (viewBox 0 0 320 500): la cabeza es un círculo en (160,168) de
// radio 118; el cuello arranca en y=262 y el cuerpo va debajo, con zapatos
// hasta y≈494. Todo centrado en x=160 para poder ensancharlo/afinarlo.
const BRAZO_I = 'M104 302 Q78 316 68 372 Q66 394 79 396 Q92 396 96 378 Q101 342 123 320 Z';
const BRAZO_D = 'M216 302 Q242 316 252 372 Q254 394 241 396 Q228 396 224 378 Q219 342 197 320 Z';
const TORSO_AV = 'M100 296 Q160 278 220 296 Q234 304 234 326 L230 386 Q228 404 224 410 L96 410 Q92 404 90 386 L86 326 Q86 304 100 296 Z';

function pantalonAv(tipo, c, o) {
  switch (tipo) {
    case 'short':
      return `<path d="M118 382 L202 382 L204 438 L166 438 L160 414 L154 438 L116 438 Z" fill="${c}"/>` +
        `<path d="M118 386 L202 386" stroke="${o}" stroke-width="5"/>`;
    case 'calzas':
      return `<path d="M122 382 L198 382 L196 430 L194 476 L166 476 L160 416 L154 476 L126 476 L124 430 Z" fill="${c}"/>` +
        `<path d="M122 386 L198 386" stroke="${o}" stroke-width="5"/><path d="M160 396 L160 416" stroke="${o}" stroke-width="2"/>`;
    case 'falda':
      return `<path d="M102 380 L218 380 L242 442 Q160 460 78 442 Z" fill="${c}"/>` +
        `<path d="M102 384 L218 384" stroke="${o}" stroke-width="5"/>` +
        `<path d="M84 436 Q160 454 236 436" fill="none" stroke="${o}" stroke-width="2.4" stroke-dasharray="5 4" opacity=".7"/>`;
    default: // jeans
      return `<path d="M116 382 L204 382 L202 432 L198 476 L165 476 L160 414 L155 476 L122 476 L118 432 Z" fill="${c}"/>` +
        `<path d="M116 386 L204 386" stroke="${o}" stroke-width="5"/>` +
        `<path d="M160 392 L160 414 M126 470 L152 470 M168 470 L194 470" stroke="${aclararHex(c, 0.35)}" stroke-width="1.8" stroke-dasharray="3 3"/>`;
  }
}

function cuerpoAvatar(a) {
  const piel = 'var(--skin)';
  const cr = a.colorRopa, oR = oscurecerHex(cr, 0.22), lR = aclararHex(cr, 0.5);
  const cp = a.colorPantalon, oP = oscurecerHex(cp, 0.25);
  const cz = a.colorZapatos;
  const vestido = a.ropa === 'vestido';
  const mangaLarga = a.ropa === 'sweater' || a.ropa === 'heroe';
  let s = '';

  // cuello, piernas, zapatos y torso de piel (debajo de la ropa)
  s += `<rect x="146" y="262" width="28" height="44" rx="12" fill="${piel}"/>`;
  s += `<path d="M126 396 L156 396 Q155 436 152 476 L132 476 Q127 436 126 396 Z" fill="${piel}"/>` +
    `<path d="M164 396 L194 396 Q193 436 188 476 L168 476 Q165 436 164 396 Z" fill="${piel}"/>`;
  s += [140, 180].map((x) =>
    `<ellipse cx="${x}" cy="483" rx="25" ry="11" fill="${cz}"/>` +
    `<path d="M${x - 24} 488 Q${x} 497 ${x + 24} 488" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`
  ).join('');
  s += `<path d="${TORSO_AV}" fill="${piel}"/>`;

  // ropa de abajo (no si lleva vestido)
  if (!vestido) s += pantalonAv(a.pantalon, cp, oP);

  // ropa de arriba
  const cuerpoTop = `M100 296 Q160 278 220 296 Q234 304 234 326 L230 396 L90 396 L86 326 Q86 304 100 296 Z`;
  if (vestido) {
    s += `<path d="M104 300 Q160 280 216 300 Q232 308 232 330 L226 372 L248 452 Q160 472 72 452 L94 372 L88 330 Q88 308 104 300 Z" fill="${cr}"/>` +
      `<path d="M94 372 Q160 386 226 372" fill="none" stroke="${oR}" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="M78 446 Q160 466 242 446" fill="none" stroke="${oR}" stroke-width="2.4" stroke-dasharray="5 4" opacity=".7"/>`;
  } else if (a.ropa === 'tirantes') {
    s += `<path d="M110 306 L210 306 Q226 316 228 334 L226 396 L94 396 L92 334 Q94 316 110 306 Z" fill="${cr}"/>` +
      `<path d="M132 304 L128 286 M188 304 L192 286" stroke="${cr}" stroke-width="10" stroke-linecap="round"/>`;
  } else {
    s += `<path d="${cuerpoTop}" fill="${cr}"/>` +
      `<path d="M146 292 Q160 312 174 292" fill="none" stroke="${oR}" stroke-width="4" stroke-linecap="round"/>`;
    if (a.ropa === 'sweater') s += `<rect x="90" y="386" width="140" height="10" rx="4" fill="${oR}"/>`;
    if (a.ropa === 'heroe') {
      s += `<path d="M160 306 l6.5 13.5 14.5 2 -10.5 10 2.5 14.5 -13 -7 -13 7 2.5 -14.5 -10.5 -10 14.5 -2z" fill="${lR}"/>` +
        `<rect x="90" y="384" width="140" height="12" fill="${oR}"/><rect x="150" y="382" width="20" height="16" rx="3" fill="${lR}"/>`;
    }
  }

  // collar / cadena (sobre la ropa)
  if (a.collar === 'cadena') {
    s += `<path d="M126 296 Q160 342 194 296" fill="none" stroke="#e2b64a" stroke-width="4.5" stroke-dasharray="7 3" stroke-linecap="round"/>` +
      `<circle cx="160" cy="333" r="8" fill="#e2b64a" stroke="#b58a1f" stroke-width="1.5"/><circle cx="160" cy="333" r="3" fill="#fbe9a8"/>`;
  } else if (a.collar === 'perlas') {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, u = 1 - t;
      s += `<circle cx="${(u * u * 122 + 2 * t * u * 160 + t * t * 198).toFixed(1)}" cy="${(u * u * 298 + 2 * t * u * 348 + t * t * 298).toFixed(1)}" r="5" fill="#f7f5f2" stroke="#cfc6bb" stroke-width="1"/>`;
    }
  }

  // brazos (con mangas según la ropa)
  s += `<path d="${BRAZO_I}" fill="${mangaLarga ? cr : piel}"/><path d="${BRAZO_D}" fill="${mangaLarga ? cr : piel}"/>`;
  if (!mangaLarga && (a.ropa === 'polera' || vestido)) {
    s += `<path d="M104 298 Q80 310 72 346 L100 354 Q104 326 124 316 Z" fill="${cr}"/><path d="M216 298 Q240 310 248 346 L220 354 Q216 326 196 316 Z" fill="${cr}"/>`;
  }
  s += `<circle cx="73" cy="399" r="14" fill="${piel}"/><circle cx="247" cy="399" r="14" fill="${piel}"/>`;
  if (mangaLarga) {
    s += `<path d="M69 384 Q80 392 94 388" fill="none" stroke="${oR}" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M251 384 Q240 392 226 388" fill="none" stroke="${oR}" stroke-width="7" stroke-linecap="round"/>`;
  }

  // reloj en la muñeca
  if (a.reloj) {
    s += `<rect x="60" y="377" width="28" height="14" rx="4" fill="#2a2740"/>` +
      `<circle cx="74" cy="384" r="8" fill="#e2b64a" stroke="#b58a1f" stroke-width="1.5"/><circle cx="74" cy="384" r="5.2" fill="#fff"/>` +
      `<path d="M74 384 L74 380.5 M74 384 L77 386" stroke="#2a2740" stroke-width="1.4" stroke-linecap="round"/>`;
  }

  const k = ESCALA_CUERPO_AV[a.cuerpo] || 1;
  return k === 1 ? s : `<g transform="translate(160 0) scale(${k} 1) translate(-160 0)">${s}</g>`;
}

// Gorros, lentes, aros y moño: van por encima de la cabeza.
function sombreroAv(tipo, c) {
  const o = oscurecerHex(c, 0.25);
  switch (tipo) {
    case 'jockey':
      return `<path d="M76 112 Q76 34 160 28 Q244 34 244 112 Z" fill="${c}"/>` +
        `<ellipse cx="160" cy="114" rx="96" ry="14" fill="${o}"/><circle cx="160" cy="30" r="6" fill="${o}"/>` +
        `<path d="M160 32 L160 108" stroke="${o}" stroke-width="2" opacity=".5"/>`;
    case 'jockey-plano':
      return `<path d="M78 112 Q78 40 160 36 Q242 40 242 112 Z" fill="${c}"/>` +
        `<path d="M52 110 Q160 92 268 110 L278 126 Q160 110 42 126 Z" fill="${o}"/><circle cx="160" cy="38" r="5" fill="${o}"/>`;
    case 'gorro-lana':
      return `<path d="M80 108 Q80 34 160 28 Q240 34 240 108 Z" fill="${c}"/>` +
        `<rect x="74" y="94" width="172" height="24" rx="11" fill="${o}"/>` +
        `<path d="M92 96 L92 116 M112 96 L112 116 M132 96 L132 116 M152 96 L152 116 M172 96 L172 116 M192 96 L192 116 M212 96 L212 116 M228 96 L228 116" stroke="${oscurecerHex(c, 0.4)}" stroke-width="2" opacity=".5"/>` +
        `<circle cx="160" cy="26" r="15" fill="${aclararHex(c, 0.35)}"/>`;
    case 'sombrero':
      return `<ellipse cx="160" cy="98" rx="138" ry="22" fill="${c}"/>` +
        `<path d="M92 98 Q96 22 160 18 Q224 22 228 98 Z" fill="${c}"/>` +
        `<rect x="92" y="78" width="136" height="14" fill="${oscurecerHex(c, 0.3)}"/>`;
    case 'boina':
      return `<ellipse cx="150" cy="62" rx="92" ry="34" transform="rotate(-8 150 62)" fill="${c}"/>` +
        `<ellipse cx="150" cy="62" rx="92" ry="34" transform="rotate(-8 150 62)" fill="none" stroke="${o}" stroke-width="2"/>` +
        `<circle cx="166" cy="26" r="6" fill="${o}"/>`;
    default: return '';
  }
}

function lentesAv(tipo) {
  if (tipo === 'sol') {
    return `<path d="M82 156 L46 148 M238 156 L274 148" stroke="#2a2740" stroke-width="4" stroke-linecap="round"/>` +
      `<rect x="78" y="136" width="68" height="46" rx="18" fill="#2a2740" opacity=".93"/><rect x="174" y="136" width="68" height="46" rx="18" fill="#2a2740" opacity=".93"/>` +
      `<path d="M146 152 Q160 144 174 152" fill="none" stroke="#2a2740" stroke-width="4"/>` +
      `<path d="M90 146 L104 142 M186 146 L200 142" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>`;
  }
  if (tipo === 'redondos') {
    return `<path d="M82 158 L46 148 M238 158 L274 148" stroke="#5a4030" stroke-width="4" stroke-linecap="round"/>` +
      `<circle cx="112" cy="160" r="32" fill="#fff" fill-opacity=".12" stroke="#5a4030" stroke-width="5"/>` +
      `<circle cx="208" cy="160" r="32" fill="#fff" fill-opacity=".12" stroke="#5a4030" stroke-width="5"/>` +
      `<path d="M144 156 Q160 146 176 156" fill="none" stroke="#5a4030" stroke-width="5"/>`;
  }
  return '';
}

function arosAv() {
  return [44, 276].map((x) =>
    `<circle cx="${x}" cy="194" r="5.5" fill="#e2b64a" stroke="#b58a1f" stroke-width="1"/>` +
    `<path d="M${x} 199 L${x} 208" stroke="#e2b64a" stroke-width="2"/>` +
    `<circle cx="${x}" cy="212" r="4.6" fill="#fbe9a8" stroke="#e2b64a" stroke-width="1.4"/>`
  ).join('');
}

// Pinta un avatar dentro del monito que ya está en el DOM (uno solo a la
// vez — el del paciente que se está viendo).
function aplicarAvatar(avatar) {
  const a = normalizarAvatar(avatar);
  const svg = document.querySelector('svg.face');
  const hairBack = document.getElementById('hairBack');
  const bowLayer = document.getElementById('bowLayer');
  const bodyLayer = document.getElementById('bodyLayer');
  if (svg) {
    svg.style.setProperty('--skin', a.piel);
    svg.style.setProperty('--skin-line', oscurecerHex(a.piel, 0.12));
  }
  hairBack.innerHTML = `<g fill="${a.colorPelo}">${(PEINADOS[a.peinado] || PEINADOS.corto)()}</g>`;
  if (bodyLayer) bodyLayer.innerHTML = cuerpoAvatar(a);
  // esta capa no debe tapar los ojos (se tocan para registrar el parche)
  bowLayer.setAttribute('pointer-events', 'none');
  bowLayer.innerHTML =
    lentesAv(a.lentes) +
    (a.aros ? arosAv() : '') +
    (a.moño ? `<g fill="${a.colorMoño}">${moñoSvg()}</g>` : '') +
    sombreroAv(a.sombrero, a.colorSombrero);
  document.querySelectorAll('.iris-circle').forEach(el => el.setAttribute('fill', a.colorOjos));
}

function crearSwatches(contenedor, paleta, colorActual, onPick) {
  contenedor.innerHTML = '';
  paleta.forEach(color => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (color.toLowerCase() === (colorActual || '').toLowerCase() ? ' active' : '');
    b.style.background = color;
    b.addEventListener('click', () => onPick(color));
    contenedor.appendChild(b);
  });
}

// ---------- controles del plan completo ----------
// Dibuja, dentro de `cont`, todos los selectores extra (tono de piel, cuerpo,
// ropa, pantalón, zapatos, gorro, lentes, joyas) para el avatar `a` (se
// modifica en el lugar). `cambio()` se llama después de cada toque.
function renderControlesExtra(cont, a, cambio) {
  cont.innerHTML = '';
  const genero = a.genero === 'niño' ? 'niño' : 'niña';

  function bloque(titulo) {
    const sec = document.createElement('section');
    sec.className = 'block';
    sec.innerHTML = '<p class="block-title"></p>';
    sec.firstChild.textContent = titulo;
    cont.appendChild(sec);
    return sec;
  }
  function seg(sec, opciones, campo, wrap) {
    const d = document.createElement('div');
    d.className = 'seg' + (wrap ? ' wrap' : '');
    opciones.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.n;
      if (a[campo] === o.v) b.className = 'active';
      b.addEventListener('click', () => { a[campo] = o.v; cambio(); });
      d.appendChild(b);
    });
    sec.appendChild(d);
  }
  function colores(sec, paleta, campo) {
    const d = document.createElement('div');
    d.className = 'swatch-row';
    d.style.marginTop = '10px';
    sec.appendChild(d);
    crearSwatches(d, paleta, a[campo], (c) => { a[campo] = c; cambio(); });
  }
  function siNo(sec, campo) {
    const d = document.createElement('div');
    d.className = 'seg';
    [['Sí', true], ['No', false]].forEach(([n, v]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = n;
      if (!!a[campo] === v) b.className = 'active';
      b.addEventListener('click', () => { a[campo] = v; cambio(); });
      d.appendChild(b);
    });
    sec.appendChild(d);
  }

  let s = bloque('Tono de piel');
  const d = document.createElement('div'); d.className = 'swatch-row'; s.appendChild(d);
  crearSwatches(d, PALETA_PIEL, a.piel, (c) => { a.piel = c; cambio(); });

  seg(bloque('Forma del cuerpo'), CUERPOS_AV, 'cuerpo');
  s = bloque('Ropa de arriba'); seg(s, opcionesDe(ROPAS_AV, genero), 'ropa', true);
  if (a.ropa !== 'vestido') {
    s = bloque('Pantalón o falda'); seg(s, opcionesDe(PANTALONES_AV, genero), 'pantalon', true); colores(s, PALETA_PANTALON, 'colorPantalon');
  }
  colores(bloque('Zapatos'), PALETA_ZAPATOS, 'colorZapatos');
  s = bloque('Gorro o jockey'); seg(s, SOMBREROS_AV, 'sombrero', true);
  if (a.sombrero !== 'ninguno') colores(s, PALETA_ROPA, 'colorSombrero');
  seg(bloque('Lentes'), LENTES_AV, 'lentes');
  seg(bloque('Collar o cadena'), COLLARES_AV, 'collar');
  siNo(bloque('Reloj'), 'reloj');
  siNo(bloque('Aros'), 'aros');
}
