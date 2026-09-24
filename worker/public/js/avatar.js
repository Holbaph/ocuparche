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
// Coordenadas (viewBox 0 0 320 570): la cabeza es un círculo en (160,168) de
// radio 118; el cuello arranca en y≈250, los hombros están en y≈306, la
// cintura en y≈410, la cadera en y≈440 y los pies terminan en y≈566. Todo
// está hecho con curvas (no con rectas) y centrado en x=160, así se puede
// ensanchar o afinar simétricamente.
const TORSO_AV = 'M104 306 C124 292 196 292 216 306 C232 314 238 340 236 372 C234 396 226 410 224 440 L96 440 C94 410 86 396 84 372 C82 340 88 314 104 306 Z';
const PECHO_AV = 'M112 304 C132 296 188 296 208 304 L210 346 L110 346 Z'; // piel del pecho: siempre queda metida bajo la ropa
const BRAZO_I = 'M104 308 C82 314 68 338 64 370 C60 398 58 420 58 440 L84 442 C86 424 90 404 96 384 C100 364 108 348 120 336 Z';
const BRAZO_D = 'M216 308 C238 314 252 338 256 370 C260 398 262 420 262 440 L236 442 C234 424 230 404 224 384 C220 364 212 348 200 336 Z';
const PIERNA_I = 'M118 436 C112 480 116 516 122 546 L154 546 C157 516 159 480 160 436 Z';
const PIERNA_D = 'M202 436 C208 480 204 516 198 546 L166 546 C163 516 161 480 160 436 Z';

function pantalonAv(tipo, c, o) {
  const cinturon = `<path d="M97 428 C130 434 190 434 223 428" fill="none" stroke="${o}" stroke-width="6" stroke-linecap="round"/>`;
  switch (tipo) {
    case 'short':
      return `<path d="M97 424 L223 424 C225 450 224 476 222 502 L166 502 L160 472 L154 502 L98 502 C96 476 95 450 97 424 Z" fill="${c}"/>` + cinturon +
        `<path d="M104 496 L152 496 M168 496 L216 496" stroke="${o}" stroke-width="2" stroke-dasharray="3 3" opacity=".7"/>`;
    case 'calzas':
      return `<path d="M104 424 L216 424 C216 448 214 470 212 490 C210 514 206 530 202 546 L166 546 C164 520 162 490 160 470 C158 490 156 520 154 546 L118 546 C114 530 110 514 108 490 C106 470 104 448 104 424 Z" fill="${c}"/>` + cinturon +
        `<path d="M160 436 L160 470" stroke="${o}" stroke-width="2"/>`;
    case 'falda':
      return `<path d="M100 422 L220 422 C232 452 240 482 246 510 C200 526 120 526 74 510 C80 482 88 452 100 422 Z" fill="${c}"/>` + cinturon +
        `<path d="M82 504 C130 520 190 520 238 504" fill="none" stroke="${o}" stroke-width="2.4" stroke-dasharray="5 4" opacity=".7"/>`;
    default: // jeans
      return `<path d="M97 424 L223 424 C225 448 224 470 221 490 C217 516 213 530 209 546 L167 546 C164 522 162 496 160 472 C158 496 156 522 153 546 L111 546 C107 530 103 516 99 490 C96 470 95 448 97 424 Z" fill="${c}"/>` + cinturon +
        `<path d="M160 436 L160 472 M114 538 L150 538 M170 538 L206 538" stroke="${aclararHex(c, 0.35)}" stroke-width="1.8" stroke-dasharray="3 3"/>`;
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

  // cuello, piernas, zapatos y el parche de piel del pecho (todo queda debajo de la ropa)
  s += `<path d="M146 246 L174 246 L176 300 C176 314 170 318 160 318 C150 318 144 314 144 300 Z" fill="${piel}"/>`;
  s += `<path d="${PIERNA_I}" fill="${piel}"/><path d="${PIERNA_D}" fill="${piel}"/>`;
  s += [136, 184].map((x) =>
    `<ellipse cx="${x}" cy="553" rx="29" ry="13" fill="${cz}"/>` +
    `<path d="M${x - 28} 558 C${x - 10} 568 ${x + 10} 568 ${x + 28} 558" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`
  ).join('');
  s += `<path d="${PECHO_AV}" fill="${piel}"/>`;

  // ropa de abajo (no si lleva vestido)
  if (!vestido) s += pantalonAv(a.pantalon, cp, oP);

  // ropa de arriba
  if (vestido) {
    s += `<path d="M104 306 C124 292 196 292 216 306 C232 314 238 340 232 372 C230 392 226 408 222 424 L250 514 C200 530 120 530 70 514 L98 424 C94 408 90 392 88 372 C82 340 88 314 104 306 Z" fill="${cr}"/>` +
      `<path d="M94 420 C130 432 190 432 226 420" fill="none" stroke="${oR}" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="M76 508 C130 524 190 524 244 508" fill="none" stroke="${oR}" stroke-width="2.4" stroke-dasharray="5 4" opacity=".7"/>`;
  } else if (a.ropa === 'tirantes') {
    s += `<path d="M112 332 C130 324 190 324 208 332 C226 340 236 354 236 374 C234 396 226 410 224 440 L96 440 C94 410 86 396 84 374 C84 354 94 340 112 332 Z" fill="${cr}"/>` +
      `<path d="M130 330 L126 300 M190 330 L194 300" stroke="${cr}" stroke-width="11" stroke-linecap="round"/>`;
  } else {
    s += `<path d="${TORSO_AV}" fill="${cr}"/>` +
      `<path d="M143 297 C149 320 171 320 177 297" fill="none" stroke="${oR}" stroke-width="4" stroke-linecap="round"/>`;
    if (a.ropa === 'sweater') s += `<path d="M96 432 C130 440 190 440 224 432 L224 442 L96 442 Z" fill="${oR}"/>`;
    if (a.ropa === 'heroe') {
      s += `<path d="M160 328 l7 14.5 15.5 2.2 -11.3 10.8 2.7 15.5 -13.9 -7.5 -13.9 7.5 2.7 -15.5 -11.3 -10.8 15.5 -2.2z" fill="${lR}"/>` +
        `<path d="M95 424 C130 432 190 432 225 424 L225 438 C190 446 130 446 95 438 Z" fill="${oR}"/><rect x="149" y="426" width="22" height="16" rx="4" fill="${lR}"/>`;
    }
  }

  // collar / cadena (sobre la ropa)
  if (a.collar === 'cadena') {
    s += `<path d="M128 306 C132 352 188 352 192 306" fill="none" stroke="#e2b64a" stroke-width="4.5" stroke-dasharray="7 3" stroke-linecap="round"/>` +
      `<circle cx="160" cy="352" r="9" fill="#e2b64a" stroke="#b58a1f" stroke-width="1.5"/><circle cx="160" cy="352" r="3.4" fill="#fbe9a8"/>`;
  } else if (a.collar === 'perlas') {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, u = 1 - t;
      s += `<circle cx="${(u * u * 124 + 2 * t * u * 160 + t * t * 196).toFixed(1)}" cy="${(u * u * 308 + 2 * t * u * 372 + t * t * 308).toFixed(1)}" r="5.4" fill="#f7f5f2" stroke="#cfc6bb" stroke-width="1"/>`;
    }
  }

  // brazos (con mangas según la ropa) y manos
  s += `<path d="${BRAZO_I}" fill="${mangaLarga ? cr : piel}"/><path d="${BRAZO_D}" fill="${mangaLarga ? cr : piel}"/>`;
  if (!mangaLarga && (a.ropa === 'polera' || vestido)) {
    s += `<path d="M102 306 C82 312 68 334 63 368 C74 376 90 376 100 370 C102 350 110 336 122 330 Z" fill="${cr}"/>` +
      `<path d="M218 306 C238 312 252 334 257 368 C246 376 230 376 220 370 C218 350 210 336 198 330 Z" fill="${cr}"/>`;
  }
  s += `<ellipse cx="71" cy="458" rx="15" ry="19" fill="${piel}"/><ellipse cx="249" cy="458" rx="15" ry="19" fill="${piel}"/>`;
  if (mangaLarga) {
    s += `<path d="M59 428 C69 436 79 436 85 430" fill="none" stroke="${oR}" stroke-width="8" stroke-linecap="round"/>` +
      `<path d="M261 428 C251 436 241 436 235 430" fill="none" stroke="${oR}" stroke-width="8" stroke-linecap="round"/>`;
  }

  // reloj en la muñeca
  if (a.reloj) {
    s += `<rect x="54" y="422" width="32" height="15" rx="4" fill="#2a2740"/>` +
      `<circle cx="70" cy="429.5" r="9" fill="#e2b64a" stroke="#b58a1f" stroke-width="1.5"/><circle cx="70" cy="429.5" r="6" fill="#fff"/>` +
      `<path d="M70 429.5 L70 425 M70 429.5 L73.5 431.5" stroke="#2a2740" stroke-width="1.5" stroke-linecap="round"/>`;
  }

  const k = ESCALA_CUERPO_AV[a.cuerpo] || 1;
  return k === 1 ? s : `<g transform="translate(160 0) scale(${k} 1) translate(-160 0)">${s}</g>`;
}

// Gorros: van por encima de la cabeza y son más grandes que ella (la cabeza
// es un círculo de radio 118 en (160,168), así que un gorro tiene que cubrir
// de x≈44 a x≈276 y llegar hasta arriba de y≈30). Se usan también en el juego
// (ahí la cabeza está 8 px más abajo).
function sombreroAv(tipo, c) {
  const o = oscurecerHex(c, 0.25);
  switch (tipo) {
    case 'jockey':
      return `<path d="M44 126 C36 58 92 20 160 20 C228 20 284 58 276 126 C230 116 90 116 44 126 Z" fill="${c}"/>` +
        `<path d="M44 122 C100 134 220 134 276 122 L282 130 C222 142 98 142 38 130 Z" fill="${o}"/>` +
        `<circle cx="160" cy="21" r="7" fill="${o}"/><path d="M160 26 L160 118 M120 32 L114 116 M200 32 L206 116" stroke="${o}" stroke-width="2" opacity=".45"/>`;
    case 'jockey-plano':
      return `<path d="M46 122 C40 70 96 36 160 36 C224 36 280 70 274 122 Z" fill="${c}"/>` +
        `<path d="M16 116 C100 104 220 104 304 116 L316 132 C222 122 98 122 4 132 Z" fill="${o}"/>` +
        `<circle cx="160" cy="38" r="6" fill="${o}"/><path d="M160 42 L160 106" stroke="${o}" stroke-width="2" opacity=".45"/>`;
    case 'gorro-lana':
      return `<path d="M50 126 C42 48 96 8 160 8 C224 8 278 48 270 126 Z" fill="${c}"/>` +
        `<rect x="40" y="98" width="240" height="36" rx="16" fill="${o}"/>` +
        `<path d="M62 100 L62 132 M86 100 L86 132 M110 100 L110 132 M134 100 L134 132 M158 100 L158 132 M182 100 L182 132 M206 100 L206 132 M230 100 L230 132 M254 100 L254 132" stroke="${oscurecerHex(c, 0.4)}" stroke-width="2.4" opacity=".5"/>` +
        `<circle cx="160" cy="10" r="22" fill="${aclararHex(c, 0.35)}"/>`;
    case 'sombrero':
      return `<ellipse cx="160" cy="104" rx="176" ry="24" fill="${c}"/>` +
        `<path d="M70 104 C70 34 108 8 160 8 C212 8 250 34 250 104 Z" fill="${c}"/>` +
        `<path d="M70 96 C120 106 200 106 250 96 L250 84 C200 94 120 94 70 84 Z" fill="${oscurecerHex(c, 0.3)}"/>`;
    case 'boina':
      return `<ellipse cx="152" cy="66" rx="124" ry="46" transform="rotate(-8 152 66)" fill="${c}"/>` +
        `<ellipse cx="152" cy="66" rx="124" ry="46" transform="rotate(-8 152 66)" fill="none" stroke="${o}" stroke-width="2.4"/>` +
        `<circle cx="170" cy="22" r="8" fill="${o}"/>`;
    case 'casco':
      return `<path d="M38 132 C30 52 92 10 160 10 C228 10 290 52 282 132 Z" fill="${c}"/>` +
        `<rect x="24" y="118" width="272" height="18" rx="9" fill="${o}"/>` +
        `<path d="M160 12 L160 118 M118 20 L120 118 M202 20 L200 118" stroke="${aclararHex(c, 0.35)}" stroke-width="6" opacity=".6"/>`;
    case 'corona':
      return `<path d="M88 92 L98 24 L128 58 L160 12 L192 58 L222 24 L232 92 C194 80 126 80 88 92 Z" fill="${c}" stroke="${o}" stroke-width="2.5"/>` +
        `<circle cx="160" cy="52" r="7" fill="#e8578a"/><circle cx="108" cy="64" r="4.6" fill="#7cc4ea"/><circle cx="212" cy="64" r="4.6" fill="#7cc4ea"/>`;
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
function aplicarAvatar(avatar, svgRaiz) {
  const a = normalizarAvatar(avatar);
  // Sin `svgRaiz` pinta el monito de la pantalla principal; con `svgRaiz`, esa
  // copia (la vista previa del panel de personalizar). Las capas se buscan
  // dentro del svg por data-capa, así funcionan aunque haya dos monitos.
  const svg = svgRaiz || document.querySelector('svg.face:not(.face-preview)');
  if (!svg) return;
  const capa = (n) => svg.querySelector('[data-capa="' + n + '"]');
  svg.style.setProperty('--skin', a.piel);
  svg.style.setProperty('--skin-line', oscurecerHex(a.piel, 0.12));
  capa('pelo').innerHTML = `<g fill="${a.colorPelo}">${(PEINADOS[a.peinado] || PEINADOS.corto)()}</g>`;
  const cuerpo = capa('cuerpo');
  if (cuerpo) cuerpo.innerHTML = cuerpoAvatar(a);
  // esta capa no debe tapar los ojos (se tocan para registrar el parche)
  const arriba = capa('arriba');
  arriba.setAttribute('pointer-events', 'none');
  arriba.innerHTML =
    lentesAv(a.lentes) +
    (a.aros ? arosAv() : '') +
    (a.moño ? `<g fill="${a.colorMoño}">${moñoSvg()}</g>` : '') +
    sombreroAv(a.sombrero, a.colorSombrero);
  svg.querySelectorAll('.iris-circle').forEach(el => el.setAttribute('fill', a.colorOjos));
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
function renderControlesExtra(cont, a, cambio, grupo) {
  cont.innerHTML = '';
  // grupo: 'cuerpo' | 'ropa' | 'accesorios' (sin grupo: todos)
  const quiere = (g) => !grupo || grupo === g;
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

  let s;
  if (quiere('cuerpo')) {
    s = bloque('Tono de piel');
    const d = document.createElement('div'); d.className = 'swatch-row'; s.appendChild(d);
    crearSwatches(d, PALETA_PIEL, a.piel, (c) => { a.piel = c; cambio(); });
    seg(bloque('Forma del cuerpo'), CUERPOS_AV, 'cuerpo');
  }
  if (quiere('ropa')) {
    s = bloque('Ropa de arriba'); seg(s, opcionesDe(ROPAS_AV, genero), 'ropa', true);
    if (a.ropa !== 'vestido') {
      s = bloque('Pantalón o falda'); seg(s, opcionesDe(PANTALONES_AV, genero), 'pantalon', true); colores(s, PALETA_PANTALON, 'colorPantalon');
    }
    colores(bloque('Zapatos'), PALETA_ZAPATOS, 'colorZapatos');
  }
  if (quiere('accesorios')) {
    s = bloque('Gorro o jockey'); seg(s, SOMBREROS_AV, 'sombrero', true);
    if (a.sombrero !== 'ninguno') colores(s, PALETA_ROPA, 'colorSombrero');
    seg(bloque('Lentes'), LENTES_AV, 'lentes');
    seg(bloque('Collar o cadena'), COLLARES_AV, 'collar');
    siNo(bloque('Reloj'), 'reloj');
    siNo(bloque('Aros'), 'aros');
  }
}
