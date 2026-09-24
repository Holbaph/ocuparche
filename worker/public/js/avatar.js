// avatar.js — personalización de apariencia por paciente: peinado, color de
// pelo, moño y su color, color de ojos, y color de ropa (el cuerpo
// completo, no solo la cara). El avatar se guarda como JSON junto al
// paciente; acá vive todo lo visual: las paletas y cómo dibujar cada
// peinado dentro del mismo monito SVG que ya existe en el HTML.

const PALETA_PELO = ['#2b2420', '#6b4a34', '#9c6b3f', '#d9b26a', '#b5532c', '#9a9a9a', '#e29ac2'];
const PALETA_OJOS = ['#8b5e3c', '#4a3222', '#5c8a5c', '#5b8fae', '#8a94a3', '#a67b4f'];
const PALETA_MONO = ['#c96f8f', '#5b8fae', '#e0b23c', '#9b6fb0', '#c9525a', '#5c9a72'];
const PALETA_ROPA = ['#e1673f', '#2f6e73', '#5b8fae', '#e0b23c', '#9b6fb0', '#5c9a72', '#c9525a'];

const AVATAR_POR_DEFECTO = {
  niña: { genero: 'niña', peinado: 'largo', colorPelo: '#6b4a34', moño: true, colorMoño: '#c96f8f', colorOjos: '#8b5e3c', colorRopa: '#c9525a' },
  niño: { genero: 'niño', peinado: 'corto', colorPelo: '#2b2420', moño: false, colorMoño: '#c96f8f', colorOjos: '#8b5e3c', colorRopa: '#5b8fae' },
};

function avatarPorDefecto(genero) {
  return { ...(AVATAR_POR_DEFECTO[genero] || AVATAR_POR_DEFECTO.niña) };
}

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

// g: 'f' solo niñas, 'm' solo niños, sin g = los dos
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

// Pinta un avatar dentro del monito que ya está en el DOM (uno solo a la
// vez — el del paciente que se está viendo). El cuerpo (piernas, brazos,
// torso) ya está dibujado en el HTML; acá solo se le pone color a la ropa,
// igual que se le pone color al pelo, los ojos y el moño.
function aplicarAvatar(avatar) {
  const a = { ...avatarPorDefecto('niña'), ...(avatar || {}) };
  const hairBack = document.getElementById('hairBack');
  const bowLayer = document.getElementById('bowLayer');
  const peinadoFn = PEINADOS[a.peinado] || PEINADOS.corto;
  hairBack.innerHTML = `<g fill="${a.colorPelo}">${peinadoFn()}</g>`;
  bowLayer.innerHTML = a.moño ? `<g fill="${a.colorMoño}">${moñoSvg()}</g>` : '';
  document.querySelectorAll('.iris-circle').forEach(el => el.setAttribute('fill', a.colorOjos));
  document.querySelectorAll('.ropa-fill').forEach(el => el.setAttribute('fill', a.colorRopa));
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
