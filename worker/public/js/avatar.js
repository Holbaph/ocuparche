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
    genero: 'niña', peinado: 'largo', flequillo: 'ondas', colorPelo: '#6b4a34', moño: true, colorMoño: '#c96f8f', colorOjos: '#8b5e3c', colorRopa: '#c9525a',
    piel: '#f6e0c8', cuerpo: 'normal', ropa: 'vestido', pantalon: 'falda', colorPantalon: '#5b7c9e', colorZapatos: '#3a3540',
    sombrero: 'ninguno', colorSombrero: '#e1673f', lentes: 'ninguno', reloj: false, collar: 'ninguno', aros: false,
  },
  niño: {
    genero: 'niño', peinado: 'corto', flequillo: 'sin', colorPelo: '#2b2420', moño: false, colorMoño: '#c96f8f', colorOjos: '#8b5e3c', colorRopa: '#5b8fae',
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

// Los peinados son los de Ojitos de Mili: cada uno es el pelo que se ve
// DETRÁS de la cabeza (se dibuja antes que el círculo de la cara) y, por
// separado, el flequillo, que se dibuja DELANTE de la frente (si no, a las
// niñas se les ve demasiada frente). Las formas de Mili están pensadas para
// una cabeza 8 px más abajo, por eso se dibujan dentro de translate(0 -8).
// Cada función recibe (h = color del pelo, o = un tono más oscuro).
const CASQUETE_AV = 'M35.6 200 A128 128 0 1 1 284.4 200 Z';
const DESPLAZA_MILI = 'translate(0 -8)';
const PEINADOS = {
  melena: (h) => `<path d="M30 172 A130 130 0 0 1 290 172 L292 262 Q278 278 256 268 L64 268 Q42 278 28 262 Z" fill="${h}"/>`,
  largo: (h) => `<path d="M30 172 A130 130 0 0 1 290 172 L298 306 Q302 342 270 340 Q246 326 232 300 L88 300 Q74 326 50 340 Q18 342 22 306 Z" fill="${h}"/>`,
  ondas: (h, o) => `<path d="M30 172 A130 130 0 0 1 290 172 Q306 210 292 240 Q280 270 298 300 Q312 334 276 344 Q252 330 240 304 L80 304 Q68 330 44 344 Q8 334 22 300 Q40 270 28 240 Q14 210 30 172 Z" fill="${h}"/>` +
    `<path d="M40 230 Q52 262 36 292 M280 230 Q268 262 284 292" fill="none" stroke="${o}" stroke-width="3" opacity=".5"/>`,
  'muy-largo': (h, o) => `<path d="M30 172 A130 130 0 0 1 290 172 L300 330 Q308 414 274 438 L46 438 Q12 414 20 330 Z" fill="${h}"/>` +
    `<path d="M36 250 Q30 330 50 420 M284 250 Q290 330 270 420" fill="none" stroke="${o}" stroke-width="3" opacity=".5"/>`,
  corto: (h) => `<path d="${CASQUETE_AV}" fill="${h}"/>`,
  pixie: (h) => `<path d="M40 188 A122 122 0 1 1 280 188 Q274 168 262 160 L58 160 Q46 168 40 188 Z" fill="${h}"/>`,
  afro: (h) => {
    let t = `<circle cx="160" cy="160" r="142" fill="${h}"/>`;
    for (let a = 0; a < 360; a += 24) {
      const r = (a * Math.PI) / 180;
      t += `<circle cx="${(160 + 138 * Math.cos(r)).toFixed(1)}" cy="${(160 + 132 * Math.sin(r)).toFixed(1)}" r="26" fill="${h}"/>`;
    }
    return t;
  },
  crespo: (h) => {
    let t = `<path d="M24 190 A136 136 0 0 1 296 190 L296 316 Q160 350 24 316 Z" fill="${h}"/>`;
    for (let a = -25; a <= 205; a += 23) {
      const r = (a * Math.PI) / 180;
      t += `<circle cx="${(160 + 146 * Math.cos(r)).toFixed(1)}" cy="${(196 - 150 * Math.sin(r)).toFixed(1)}" r="30" fill="${h}"/>`;
    }
    [[36, 300], [284, 300], [60, 330], [260, 330]].forEach(([x, y]) => { t += `<circle cx="${x}" cy="${y}" r="28" fill="${h}"/>`; });
    return t;
  },
  colitas: (h) => `<path d="${CASQUETE_AV}" fill="${h}"/>` +
    `<ellipse cx="30" cy="200" rx="22" ry="50" transform="rotate(16 30 200)" fill="${h}"/>` +
    `<ellipse cx="290" cy="200" rx="22" ry="50" transform="rotate(-16 290 200)" fill="${h}"/>`,
  'colitas-altas': (h) => `<path d="${CASQUETE_AV}" fill="${h}"/>` +
    `<path d="M70 70 Q14 40 10 110 Q8 170 36 206 Q30 140 52 100 Z" fill="${h}"/>` +
    `<path d="M250 70 Q306 40 310 110 Q312 170 284 206 Q290 140 268 100 Z" fill="${h}"/>`,
  cola: (h) => `<path d="${CASQUETE_AV}" fill="${h}"/>` + `<path d="M250 90 Q318 104 308 196 Q302 240 276 258 Q290 204 274 152 Q264 120 240 106 Z" fill="${h}"/>`,
  'cola-alta': (h) => `<path d="${CASQUETE_AV}" fill="${h}"/>` + `<path d="M176 52 Q252 18 294 90 Q320 162 290 254 Q282 182 258 132 Q234 92 190 82 Z" fill="${h}"/>`,
  'cola-baja': (h) => `<path d="${CASQUETE_AV}" fill="${h}"/>` +
    `<path d="M250 196 Q302 236 296 312 Q292 372 270 424 Q256 364 250 304 Q244 252 232 214 Z" fill="${h}"/>` +
    [260, 318, 376].map((y, i) => `<ellipse cx="${277 - i * 3}" cy="${y}" rx="${12 - i * 2}" ry="4" fill="${oscurecerHex(h, 0.3)}"/>`).join(''),
  tomate: (h) => `<path d="${CASQUETE_AV}" fill="${h}"/><circle cx="160" cy="40" r="28" fill="${h}"/>`,
  'moños-dobles': (h, o) => `<path d="${CASQUETE_AV}" fill="${h}"/><circle cx="86" cy="56" r="30" fill="${h}"/><circle cx="234" cy="56" r="30" fill="${h}"/>` +
    `<path d="M70 44 Q86 34 100 48 M218 48 Q234 34 250 44" fill="none" stroke="${o}" stroke-width="3" opacity=".6"/>`,
  trenza: (h) => `<path d="${CASQUETE_AV}" fill="${h}"/>`,
  'dos-trenzas': (h) => `<path d="${CASQUETE_AV}" fill="${h}"/>`,
  // los de niño y el rizado siguen con formas propias (heredan el color del grupo)
  rizado: () => `
    <ellipse cx="160" cy="112" rx="106" ry="58"/>
    <circle cx="70" cy="98" r="30"/>
    <circle cx="112" cy="66" r="32"/>
    <circle cx="160" cy="54" r="34"/>
    <circle cx="208" cy="66" r="32"/>
    <circle cx="250" cy="98" r="30"/>`,
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
// los que vienen de Mili van desplazados; los propios (niño) no
const PEINADOS_DE_MILI = new Set(['melena', 'largo', 'ondas', 'muy-largo', 'corto', 'pixie', 'afro', 'crespo', 'colitas', 'colitas-altas', 'cola', 'cola-alta', 'cola-baja', 'tomate', 'moños-dobles', 'trenza', 'dos-trenzas']);
// nombres de la primera versión → su equivalente actual
const PEINADO_ANTIGUO = { coleta: 'cola', bob: 'melena', chongos: 'moños-dobles', trenzas: 'dos-trenzas' };

// g: 'niña' / 'niño' = solo ese género; sin g = los dos
const PEINADOS_LISTA = [
  { v: 'corto', n: 'Cortito' },
  { v: 'pixie', n: 'Muy cortito' },
  { v: 'rizado', n: 'Rizado' },
  { v: 'afro', n: 'Afro' },
  { v: 'melena', n: 'Melena', g: 'niña' },
  { v: 'largo', n: 'Pelo largo', g: 'niña' },
  { v: 'ondas', n: 'Ondas', g: 'niña' },
  { v: 'muy-largo', n: 'Larguísimo', g: 'niña' },
  { v: 'crespo', n: 'Crespo largo', g: 'niña' },
  { v: 'colitas', n: 'Dos colitas', g: 'niña' },
  { v: 'colitas-altas', n: 'Colitas altas', g: 'niña' },
  { v: 'cola', n: 'Cola al lado', g: 'niña' },
  { v: 'cola-alta', n: 'Cola alta', g: 'niña' },
  { v: 'cola-baja', n: 'Cola larga', g: 'niña' },
  { v: 'tomate', n: 'Tomate', g: 'niña' },
  { v: 'moños-dobles', n: 'Dos moñitos', g: 'niña' },
  { v: 'trenza', n: 'Trenza', g: 'niña' },
  { v: 'dos-trenzas', n: 'Dos trenzas', g: 'niña' },
  { v: 'copete', n: 'Copete', g: 'niño' },
  { v: 'lado', n: 'De lado', g: 'niño' },
  { v: 'mohicano', n: 'Mohicano', g: 'niño' },
  { v: 'rapado', n: 'Rapado', g: 'niño' },
];
function peinadosDe(genero) { return PEINADOS_LISTA.filter((p) => !p.g || p.g === genero); }

// El flequillo es lo que tapa la frente. 'sin' no es "pelo pegado a la cabeza":
// deja la línea del nacimiento del pelo (una franja arriba), como en Mili.
const FLEQUILLOS_LISTA = [
  { v: 'ondas', n: 'Ondulado' }, { v: 'recto', n: 'Recto' }, { v: 'lado', n: 'De lado' },
  { v: 'cortina', n: 'Abierto al medio' }, { v: 'sin', n: 'Sin flequillo' },
];
function flequilloSvg(tipo, h) {
  const o = oscurecerHex(h, 0.25);
  const mechas = `<path d="M160 62 Q150 82 146 100 M120 70 Q106 88 100 104 M200 70 Q214 88 220 104" fill="none" stroke="${o}" stroke-width="2.5" stroke-linecap="round" opacity=".45"/>`;
  switch (tipo) {
    case 'recto':
      return `<path d="M42 152 A121 121 0 0 1 278 152 Q270 124 262 112 Q160 104 58 112 Q50 124 42 152 Z" fill="${h}"/>` +
        `<path d="M100 72 L96 108 M140 64 L138 106 M180 64 L182 106 M220 72 L224 108" stroke="${o}" stroke-width="2" opacity=".35"/>`;
    case 'lado':
      return `<path d="M42 152 A121 121 0 0 1 278 152 Q270 118 250 98 Q180 70 70 128 Q54 136 42 152 Z" fill="${h}"/>` +
        `<path d="M90 110 Q160 76 240 96 M120 90 Q180 70 230 80" fill="none" stroke="${o}" stroke-width="2.5" opacity=".4"/>`;
    case 'cortina':
      return `<path d="M42 152 A121 121 0 0 1 278 152 Q268 116 232 104 Q190 92 162 70 Q130 92 88 104 Q52 116 42 152 Z" fill="${h}"/>` + mechas;
    case 'sin':
      return `<path d="M44 150 A121 121 0 0 1 276 150 Q262 104 214 80 Q160 64 106 80 Q58 104 44 150 Z" fill="${h}"/>`;
    default: // ondas
      return `<path d="M42 152 A121 121 0 0 1 278 152 Q266 118 238 106 Q220 122 196 104 Q176 120 160 102 Q144 120 124 104 Q100 122 82 106 Q54 118 42 152 Z" fill="${h}"/>` + mechas;
  }
}

// Las trenzas caen por delante del cuerpo (van en la capa de delante).
function trenzaAv(x0, dx, largo, grosor, h) {
  const o = oscurecerHex(h, 0.2);
  let t = '';
  for (let i = 0; i < largo; i++) {
    const cx = x0 + dx * i, cy = 216 + i * 22, rx = grosor - i * 0.8;
    t += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="14" transform="rotate(${i % 2 ? 22 : -22} ${cx} ${cy})" fill="${h}" stroke="${o}" stroke-width="1.2"/>`;
  }
  const fx = x0 + dx * largo, fy = 216 + largo * 22 - 4;
  return t + `<path d="M${fx - 7} ${fy} Q${fx} ${fy + 26} ${fx + 7} ${fy} Z" fill="${h}"/>` +
    `<ellipse cx="${fx}" cy="${fy - 2}" rx="7" ry="4.5" fill="${o}"/>`;
}
function peloDelanteAv(peinado, h) {
  if (peinado === 'trenza') return trenzaAv(274, -3, 7, 18, h);
  if (peinado === 'dos-trenzas') return trenzaAv(46, 2.5, 6, 15, h) + trenzaAv(274, -2.5, 6, 15, h);
  return '';
}
// dónde se amarra el pelo (ahí van el moño o la ligita)
function amarresAv(peinado) {
  switch (peinado) {
    case 'colitas': return [{ x: 44, y: 150, s: 0.7 }, { x: 276, y: 150, s: 0.7 }];
    case 'colitas-altas': return [{ x: 66, y: 78, s: 0.65 }, { x: 254, y: 78, s: 0.65 }];
    case 'cola': return [{ x: 252, y: 98, s: 0.75 }];
    case 'cola-alta': return [{ x: 190, y: 66, s: 0.75 }];
    case 'cola-baja': return [{ x: 250, y: 206, s: 0.6 }];
    case 'tomate': return [{ x: 160, y: 66, s: 0.8 }];
    case 'moños-dobles': return [{ x: 98, y: 82, s: 0.6 }, { x: 222, y: 82, s: 0.6 }];
    case 'trenza': return [{ x: 272, y: 206, s: 0.6 }];
    case 'dos-trenzas': return [{ x: 48, y: 206, s: 0.55 }, { x: 272, y: 206, s: 0.55 }];
    default: return [];
  }
}
function moñoMili(x, y, s, c) {
  const o = oscurecerHex(c, 0.18);
  return `<g transform="translate(${x} ${y}) scale(${s})">` +
    `<path d="M-3 0 Q-18 -26 -32 -14 Q-38 0 -32 14 Q-18 26 -3 0 Z" fill="${c}"/>` +
    `<path d="M3 0 Q18 -26 32 -14 Q38 0 32 14 Q18 26 3 0 Z" fill="${c}"/>` +
    `<circle r="9" fill="${o}"/></g>`;
}
// pelo de atrás ya con su color y su posición
function peloAtrasAv(a) {
  const h = a.colorPelo, o = oscurecerHex(h, 0.18);
  const f = PEINADOS[a.peinado] || PEINADOS.corto;
  return PEINADOS_DE_MILI.has(a.peinado) ? `<g transform="${DESPLAZA_MILI}">${f(h, o)}</g>` : `<g fill="${h}">${f(h, o)}</g>`;
}
// lo que va por delante de la cara: flequillo (salvo mohicano / rapado) y trenzas
function peloDelanteCapa(a) {
  const conFlequillo = a.peinado !== 'mohicano' && a.peinado !== 'rapado';
  return (conFlequillo ? `<g transform="${DESPLAZA_MILI}">${flequilloSvg(a.flequillo, a.colorPelo)}</g>` : '') +
    `<g transform="${DESPLAZA_MILI}">${peloDelanteAv(a.peinado, a.colorPelo)}</g>`;
}
// moño (o la ligita del pelo) en cada amarre; sin amarres, el moño va arriba
function moñosAv(a) {
  const puntos = amarresAv(a.peinado);
  if (!a.moño) {
    return puntos.length ? `<g transform="${DESPLAZA_MILI}">${puntos.map((p) => `<ellipse cx="${p.x}" cy="${p.y}" rx="${9 * p.s}" ry="${6 * p.s}" fill="${oscurecerHex(a.colorPelo, 0.35)}"/>`).join('')}</g>` : '';
  }
  return puntos.length
    ? `<g transform="${DESPLAZA_MILI}">${puntos.map((p) => moñoMili(p.x, p.y, p.s, a.colorMoño)).join('')}</g>`
    : `<g fill="${a.colorMoño}">${moñoSvg()}</g>`;
}

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
  const peinadoRaw = PEINADO_ANTIGUO[raw.peinado] || raw.peinado;
  if (Object.prototype.hasOwnProperty.call(PEINADOS, peinadoRaw)) a.peinado = peinadoRaw;
  if (FLEQUILLOS_LISTA.some((f) => f.v === raw.flequillo)) a.flequillo = raw.flequillo;
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
  capa('pelo').innerHTML = peloAtrasAv(a);
  // el flequillo va por delante de la cara y no debe tapar los ojos al tocar
  let delante = capa('flequillo');
  if (!delante) {
    delante = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    delante.setAttribute('data-capa', 'flequillo');
    svg.insertBefore(delante, capa('arriba'));
  }
  delante.setAttribute('pointer-events', 'none');
  delante.innerHTML = peloDelanteCapa(a);
  const cuerpo = capa('cuerpo');
  if (cuerpo) cuerpo.innerHTML = cuerpoAvatar(a);
  // esta capa no debe tapar los ojos (se tocan para registrar el parche)
  const arriba = capa('arriba');
  arriba.setAttribute('pointer-events', 'none');
  arriba.innerHTML =
    lentesAv(a.lentes) +
    (a.aros ? arosAv() : '') +
    moñosAv(a) +
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
