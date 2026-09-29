// cocina.js — 🍰 "Cocinita", uno de los "Juegos con el parche"
// (js/juegos-parche.js le da el menú, los niveles, las estrellas y el tiempo).
//
// Un personaje del juego de vestir hace un pedido (un dibujo + la lista) y hay
// que prepararlo igual: elegir la salsa, la cobertura o el cono, apilar capas
// en el orden justo y poner la cantidad exacta de cada ingrediente. Cada cosa
// se arrastra desde la bandeja al plato (o se toca y se pone sola); tocando un
// ingrediente ya puesto, se saca.
//
// Nueve platos se van turnando (pizza, pastel, helado, hamburguesa, cupcake,
// brocheta, panqueques, dona, ensalada) y los niveles no tienen fin, pero la
// dificultad está pensada para una niña de 4 años: sube de a poco y tiene tope
// (hasta 3 tipos de ingrediente, 4 de cada uno, 4 capas y pocas cosas para
// confundir). La lista del pedido se ve siempre. Todo hace trabajar la vista fina.
//
// Todo lo que se dibuja sale de listas fijas de este archivo (nada viene de la
// base de datos), así que se puede armar el SVG como texto sin riesgo.

const Cocina = (function () {
  const oscuro = (c, t) => JuegoPiezas.color.oscurecer(c, t);
  const claro = (c, t) => JuegoPiezas.color.aclarar(c, t);
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const mezclar = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const entre = (v, a, b) => Math.max(a, Math.min(b, v));
  // azar "con semilla": el dibujo del pedido sale siempre igual
  function semilla(s) {
    return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ================= INGREDIENTES =================
  // tipo 'pieza' (se reparte encima), 'capa' (una por categoría: salsa,
  // cobertura…) o 'pila' (se apila en orden: capas de hamburguesa, bolas…).
  const I = {};
  const pieza = (id, n, p, d, o) => { I[id] = { id, tipo: 'pieza', n, p, d, ...(o || {}) }; };
  const capa = (id, cat, n, col, o) => { I[id] = { id, tipo: 'capa', cat, n, col, ...(o || {}) }; };
  const piso = (id, n, col, o) => { I[id] = { id, tipo: 'pila', n, col, ...(o || {}) }; };

  const chispas = '<g stroke-width="3.2" stroke-linecap="round">' +
    [[-8, -4, 30, '#e8578a'], [4, -7, -40, '#7cc4ea'], [9, 3, 70, '#f2cf5b'], [-3, 5, -10, '#6fbf73'], [-10, 6, 55, '#b392d6'], [2, -1, 15, '#fff']]
      .map(([x, y, r, c]) => `<line x1="${x - 3}" y1="${y}" x2="${x + 3}" y2="${y}" stroke="${c}" transform="rotate(${r} ${x} ${y})"/>`).join('') + '</g>';
  const estrellaD = (r, c) => { let p = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p += (i ? 'L' : 'M') + (Math.cos(a) * rr).toFixed(1) + ' ' + (Math.sin(a) * rr).toFixed(1); } return `<path d="${p}Z" fill="${c}" stroke="${oscuro(c, 0.2)}" stroke-width="1.2" stroke-linejoin="round"/>`; };
  const corazonD = (c) => `<path d="M0 10 C-14 1 -11 -11 0 -5 C11 -11 14 1 0 10 Z" fill="${c}" stroke="${oscuro(c, 0.2)}" stroke-width="1.2"/>`;
  const fresaD = '<path d="M0 12 Q-12 3 -9 -5 Q0 -9 9 -5 Q12 3 0 12 Z" fill="#e0344a" stroke="#b5243a" stroke-width="1"/><path d="M-7 -6 L-4 -11 L-1 -7 L2 -11 L4 -7 L7 -9 L6 -5 Z" fill="#4c9a3f"/><g fill="#f7e27a"><circle cx="-4" cy="0" r="1"/><circle cx="3" cy="-1" r="1"/><circle cx="0" cy="5" r="1"/><circle cx="-2" cy="-4" r="0.9"/><circle cx="5" cy="4" r="0.9"/></g>';
  const arandanoD = '<circle r="8" fill="#3f4fa0"/><circle cx="-3" cy="-3" r="2" fill="#7d8ad6"/><path d="M-2.5 -6.5 L0 -4 L2.5 -6.5" stroke="#232d66" stroke-width="1.4" fill="none"/>';

  // --- salados ---
  pieza('pepperoni', 'Pepperoni', 'pepperonis', '<circle r="13" fill="#c8322a" stroke="#9e231d" stroke-width="2"/><circle cx="-4" cy="-3" r="2.4" fill="#e8705f"/><circle cx="5" cy="2" r="2" fill="#e8705f"/><circle cx="-1" cy="6" r="1.7" fill="#9e231d"/><circle cx="4" cy="-6" r="1.5" fill="#9e231d"/>');
  pieza('champinon', 'Champiñón', 'champiñones', '<path d="M-13 2 Q-13 -13 0 -13 Q13 -13 13 2 Z" fill="#d8c3a5" stroke="#a88e6c" stroke-width="1.6"/><path d="M-5 1 h10 v9 q0 3 -3 3 h-4 q-3 0 -3 -3 Z" fill="#eadcc6" stroke="#a88e6c" stroke-width="1.6"/>');
  pieza('aceituna', 'Aceituna negra', 'aceitunas negras', '<circle r="9" fill="#2e2a2b"/><circle r="4" fill="#fdf6ec"/><circle cx="-4" cy="-4" r="1.6" fill="#6b6466"/>');
  pieza('aceitunaVerde', 'Aceituna verde', 'aceitunas verdes', '<circle r="9" fill="#7a8f2e"/><circle r="4" fill="#d24a3a"/><circle cx="-4" cy="-4" r="1.6" fill="#a7bb5a"/>');
  pieza('pimenton', 'Pimentón', 'pimentones', '<path d="M-12 3 A12 12 0 0 1 12 3" fill="none" stroke="#2f7d2e" stroke-width="7" stroke-linecap="round"/><path d="M-12 3 A12 12 0 0 1 12 3" fill="none" stroke="#56b04a" stroke-width="3.5" stroke-linecap="round"/>');
  pieza('pina', 'Piña', 'piñas', '<path d="M0 -12 L12 9 L-12 9 Z" fill="#f5d04a" stroke="#d9a92a" stroke-width="1.8" stroke-linejoin="round"/><path d="M-5 4 L5 4 M-2 -2 L2 -2" stroke="#e3b93a" stroke-width="1.4"/>');
  pieza('jamon', 'Jamón', 'jamones', '<rect x="-12" y="-10" width="24" height="20" rx="5" fill="#f2a7a7" stroke="#d98080" stroke-width="1.8"/><path d="M-6 -3 Q0 -6 6 -2" stroke="#fbd0d0" stroke-width="2" fill="none"/>');
  pieza('albahaca', 'Albahaca', 'hojas de albahaca', '<path d="M-13 4 Q0 -14 13 -4 Q0 14 -13 4 Z" fill="#4c9a3f" stroke="#2f6e2a" stroke-width="1"/><path d="M-10 3 Q0 0 10 -3" stroke="#2f6e2a" stroke-width="1.2" fill="none"/>');
  pieza('tomatito', 'Tomate cherry', 'tomates cherry', '<circle r="11" fill="#e5412f"/><circle r="7.5" fill="#f36f5c"/><g fill="#f7e27a"><circle cx="-3" cy="-2" r="1.4"/><circle cx="3" cy="-1" r="1.4"/><circle cx="0" cy="3.5" r="1.4"/></g>');
  pieza('choclo', 'Choclo', 'choclos', '<g fill="#f7cf3d" stroke="#d9a92a" stroke-width="1.1"><ellipse cx="-6" cy="1" rx="4.2" ry="5.2"/><ellipse cx="3" cy="-5" rx="4.2" ry="5.2"/><ellipse cx="4" cy="5" rx="4.2" ry="5.2"/></g>');
  pieza('cebolla', 'Cebolla morada', 'cebollas moradas', '<circle r="11" fill="none" stroke="#9b4f96" stroke-width="3.2"/><circle r="6" fill="none" stroke="#c48fc0" stroke-width="2.4"/>');
  pieza('pepino', 'Pepino', 'pepinos', '<circle r="12" fill="#3f8a3a"/><circle r="10" fill="#d8efb5"/><g fill="#9cc77a"><circle cx="-3" cy="-2" r="1.3"/><circle cx="3" cy="-2" r="1.3"/><circle cx="0" cy="3" r="1.3"/></g>');
  pieza('zanahoria', 'Zanahoria', 'zanahorias', '<circle r="10" fill="#f28a2e" stroke="#d96f1a" stroke-width="1.5"/><circle r="4.5" fill="#f7a95a"/>');
  pieza('huevo', 'Huevo duro', 'huevos duros', '<ellipse rx="13" ry="10" fill="#fdfbf5" stroke="#ddd6c8" stroke-width="1.4"/><circle r="5.5" fill="#f5c330"/>');
  pieza('cruton', 'Crutón', 'crutones', '<rect x="-8" y="-8" width="16" height="16" rx="3" fill="#d9a55a" stroke="#b07e3a" stroke-width="1.6" transform="rotate(12)"/><circle cx="-2" cy="-2" r="1.3" fill="#b07e3a"/>');
  pieza('rabanito', 'Rabanito', 'rabanitos', '<circle r="10" fill="#d9336b"/><circle r="7" fill="#fbeef2"/><circle cx="-1.5" cy="-1.5" r="1" fill="#f3b3c8"/>');
  pieza('palta', 'Palta', 'paltas', '<path d="M0 -13 Q10 -8 10 2 Q10 13 0 13 Q-10 13 -10 2 Q-10 -8 0 -13 Z" fill="#b8d66a" stroke="#4d6b27" stroke-width="2.4"/><path d="M0 -7 Q6 -3 6 3 Q6 9 0 9" fill="none" stroke="#d6e79a" stroke-width="2"/>');
  // --- dulces ---
  pieza('fresa', 'Frutilla', 'frutillas', fresaD);
  pieza('cereza', 'Cereza', 'cerezas', '<path d="M1 -4 Q3 -14 10 -15" stroke="#4c7a2f" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="0" cy="3" r="9" fill="#c81d3a"/><circle cx="-3" cy="0" r="2.6" fill="#f08a9c"/>');
  pieza('vela', 'Vela', 'velas', '<rect x="-3.5" y="-14" width="7" height="22" rx="2" fill="#7cc4ea" stroke="#4a90c2" stroke-width="1"/><path d="M-3.5 -9 L3.5 -12 M-3.5 -2 L3.5 -5 M-3.5 5 L3.5 2" stroke="#fff" stroke-width="1.6"/><path d="M0 -24 Q5 -18 0 -15 Q-5 -18 0 -24" fill="#f6a93b"/><path d="M0 -21 Q2 -18 0 -16.5 Q-2 -18 0 -21" fill="#fde28a"/>');
  pieza('chispitas', 'Chispitas', 'chispitas', chispas);
  pieza('arandano', 'Arándano', 'arándanos', arandanoD);
  pieza('estrella', 'Estrella de azúcar', 'estrellas', estrellaD(11, '#f6d26b'));
  pieza('corazon', 'Corazón de azúcar', 'corazones', corazonD('#f28bb0'));
  pieza('frambuesa', 'Frambuesa', 'frambuesas', '<g fill="#e0457a" stroke="#b5305f" stroke-width="0.8">' + [[-4, -4], [4, -4], [0, 0], [-5, 3], [5, 3], [0, 7], [-1, -7]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6"/>`).join('') + '</g>');
  pieza('chocolatito', 'Chocolate', 'chocolates', '<rect x="-9" y="-9" width="18" height="18" rx="3" fill="#6b3f2a" stroke="#4e2a18" stroke-width="1.6" transform="rotate(8)"/><path d="M-3 -8 V8 M-9 0 H9" stroke="#4e2a18" stroke-width="1.2" transform="rotate(8)"/>');
  pieza('galleta', 'Barquillo', 'barquillos', '<g transform="rotate(-25)"><rect x="-3.5" y="-16" width="7" height="30" rx="2" fill="#e8b86a" stroke="#b9853a" stroke-width="1.3"/><path d="M-3.5 -10 L3.5 -12 M-3.5 -3 L3.5 -5 M-3.5 4 L3.5 2" stroke="#b9853a" stroke-width="1"/></g>');
  pieza('perla', 'Perla de azúcar', 'perlas', '<circle r="5.5" fill="#e8e8f0" stroke="#b9b9c9" stroke-width="1"/><circle cx="-1.8" cy="-1.8" r="1.8" fill="#fff"/>');
  pieza('platano', 'Plátano', 'plátanos', '<circle r="10" fill="#f7eab0" stroke="#e3c96a" stroke-width="2.4"/><g fill="#c9b36a"><circle cx="-2" cy="-1" r="1"/><circle cx="2" cy="-1" r="1"/><circle cx="0" cy="2" r="1"/></g>');
  pieza('mantequilla', 'Mantequilla', 'mantequillas', '<rect x="-9" y="-7" width="18" height="14" rx="3" fill="#fbe38a" stroke="#e3c24a" stroke-width="1.6"/><rect x="-6" y="-5" width="7" height="3" rx="1.5" fill="#fff6c9"/>');

  // --- frutas de la brocheta (se apilan en orden, a lo largo del palito) ---
  piso('bFrutilla', 'Frutilla', '#e0344a', { d: `<g transform="scale(1.35)">${fresaD}</g>` });
  piso('bPlatano', 'Plátano', '#f7eab0', { d: '<circle r="14" fill="#f7eab0" stroke="#e3c96a" stroke-width="3"/><g fill="#c9b36a"><circle cx="-3" cy="-2" r="1.4"/><circle cx="3" cy="-2" r="1.4"/><circle cx="0" cy="3" r="1.4"/></g>' });
  piso('bUvaVerde', 'Uva verde', '#9bd46a', { d: '<ellipse rx="11" ry="13" fill="#9bd46a" stroke="#6aa84f" stroke-width="1.5"/><ellipse cx="-4" cy="-5" rx="3" ry="4" fill="#d3f0a8"/>' });
  piso('bUvaMorada', 'Uva morada', '#7b3f8f', { d: '<ellipse rx="11" ry="13" fill="#7b3f8f" stroke="#55266a" stroke-width="1.5"/><ellipse cx="-4" cy="-5" rx="3" ry="4" fill="#b98acb"/>' });
  piso('bKiwi', 'Kiwi', '#8fcf4a', { d: '<circle r="15" fill="#8a6a3a"/><circle r="13" fill="#8fcf4a"/><circle r="5" fill="#f3f7d0"/>' + Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5; return `<circle cx="${(Math.cos(a) * 8).toFixed(1)}" cy="${(Math.sin(a) * 8).toFixed(1)}" r="1.1" fill="#2a2a1a"/>`; }).join('') });
  piso('bPina', 'Piña', '#f5d04a', { d: '<rect x="-13" y="-13" width="26" height="26" rx="4" fill="#f5d04a" stroke="#d9a92a" stroke-width="2"/><path d="M-13 -4 H13 M-13 5 H13 M-4 -13 V13 M5 -13 V13" stroke="#e3b93a" stroke-width="1.2"/>' });
  piso('bArandano', 'Arándano', '#3f4fa0', { d: `<g transform="scale(1.3)">${arandanoD}</g>` });
  piso('bMelon', 'Melón', '#f6a95b', { d: '<rect x="-13" y="-13" width="26" height="26" rx="6" fill="#f6a95b" stroke="#e08a3a" stroke-width="2"/><rect x="-8" y="-9" width="9" height="5" rx="2.5" fill="#fbc68e"/>' });
  piso('bSandia', 'Sandía', '#e8475a', { d: '<path d="M-15 -11 L15 -11 L0 15 Z" fill="#e8475a" stroke="#c32d42" stroke-width="1.5" stroke-linejoin="round"/><rect x="-16" y="-15" width="32" height="5" rx="2.5" fill="#4c9a3f"/><g fill="#2a2a1a"><ellipse cx="-5" cy="-4" rx="1.3" ry="2"/><ellipse cx="4" cy="-4" rx="1.3" ry="2"/><ellipse cx="0" cy="3" rx="1.3" ry="2"/></g>' });

  // --- capas (se elige una por categoría) ---
  const CATS = {
    salsa: { n: 'Salsa', f: 'la salsa' }, queso: { n: 'Queso', f: 'el queso' },
    cobertura: { n: 'Cobertura', f: 'la cobertura' }, recipiente: { n: 'Cono o vaso', f: 'el cono o el vaso' },
    salsaHelado: { n: 'Salsa', f: 'la salsa' }, pan: { n: 'Pan', f: 'el pan' },
    pirotin: { n: 'Pirotín', f: 'el pirotín' }, crema: { n: 'Crema', f: 'la crema' },
    almibar: { n: 'Salsa', f: 'la salsa' }, glaseado: { n: 'Glaseado', f: 'el glaseado' },
  };
  capa('salTomate', 'salsa', 'Salsa de tomate', '#d9442f'); capa('pesto', 'salsa', 'Pesto', '#5f9a3a');
  capa('salBlanca', 'salsa', 'Salsa blanca', '#f1e8d4'); capa('bbq', 'salsa', 'Salsa BBQ', '#7a3522');
  capa('mozzarella', 'queso', 'Mozzarella', '#faf0c2'); capa('cheddar', 'queso', 'Cheddar', '#f2b33d');
  capa('cobChoco', 'cobertura', 'De chocolate', '#5a321f', { sab: 'chocolate' }); capa('cobFruti', 'cobertura', 'De frutilla', '#f58fb0', { sab: 'frutilla' });
  capa('cobVaini', 'cobertura', 'De vainilla', '#fff3d6', { sab: 'vainilla' }); capa('cobMenta', 'cobertura', 'De menta', '#9fe0c0', { sab: 'menta' });
  capa('cobArand', 'cobertura', 'De arándano', '#9aa3ec', { sab: 'arándano' });
  capa('cono', 'recipiente', 'Cono', '#e0a45c'); capa('vaso', 'recipiente', 'Vaso', '#f28cb1');
  capa('salChoco', 'salsaHelado', 'Chocolate', '#4e2a18'); capa('salFruti', 'salsaHelado', 'Frutilla', '#d8324a');
  capa('salManjar', 'salsaHelado', 'Manjar', '#b8702e');
  capa('panClasico', 'pan', 'Pan clásico', '#e0a14f'); capa('panSesamo', 'pan', 'Pan con sésamo', '#d9953f');
  capa('panIntegral', 'pan', 'Pan integral', '#a8703d');
  capa('pirRosa', 'pirotin', 'Rosado', '#f28cb1'); capa('pirCeleste', 'pirotin', 'Celeste', '#7cc4ea');
  capa('pirAmarillo', 'pirotin', 'Amarillo', '#f2cf5b'); capa('pirLila', 'pirotin', 'Lila', '#b392d6'); capa('pirVerde', 'pirotin', 'Verde', '#6fbf73');
  capa('creFruti', 'crema', 'De frutilla', '#f7a8c0', { sab: 'frutilla' }); capa('creChoco', 'crema', 'De chocolate', '#6b3f2a', { sab: 'chocolate' });
  capa('creVaini', 'crema', 'De vainilla', '#fff3d6', { sab: 'vainilla' }); capa('creMenta', 'crema', 'De menta', '#a6e3cb', { sab: 'menta' });
  capa('creArand', 'crema', 'De arándano', '#a39ae0', { sab: 'arándano' });
  capa('miel', 'almibar', 'Miel', '#e8a52a'); capa('almChoco', 'almibar', 'Chocolate', '#4e2a18');
  capa('almFruti', 'almibar', 'Frutilla', '#d8324a'); capa('almManjar', 'almibar', 'Manjar', '#b8702e');
  capa('glaFruti', 'glaseado', 'De frutilla', '#f7a8c0', { sab: 'frutilla' }); capa('glaChoco', 'glaseado', 'De chocolate', '#5a321f', { sab: 'chocolate' });
  capa('glaVaini', 'glaseado', 'De vainilla', '#fff3d6', { sab: 'vainilla' }); capa('glaMenta', 'glaseado', 'De menta', '#a6e3cb', { sab: 'menta' });
  capa('glaArand', 'glaseado', 'De arándano', '#a39ae0', { sab: 'arándano' }); capa('glaLimon', 'glaseado', 'De limón', '#f6e27a', { sab: 'limón' });

  // --- pisos (se apilan en orden) ---
  piso('bizChoco', 'Bizcocho de chocolate', '#6b3f2a', { h: 34, sab: 'chocolate' }); piso('bizVaini', 'Bizcocho de vainilla', '#f1d59a', { h: 34, sab: 'vainilla' });
  piso('bizFruti', 'Bizcocho de frutilla', '#f3a7b9', { h: 34, sab: 'frutilla' }); piso('bizMenta', 'Bizcocho de menta', '#a9e0c6', { h: 34, sab: 'menta' });
  piso('bizArand', 'Bizcocho de arándano', '#a8aee8', { h: 34, sab: 'arándano' });
  piso('relCrema', 'Relleno de crema', '#fffaf0', { h: 10, relleno: true }); piso('relMerme', 'Relleno de mermelada', '#d8324a', { h: 10, relleno: true });
  piso('relManjar', 'Relleno de manjar', '#b8702e', { h: 10, relleno: true });
  piso('bolaFruti', 'Frutilla', '#f6a1b8', { sab: 'frutilla' }); piso('bolaChoco', 'Chocolate', '#7a4a2e', { sab: 'chocolate' });
  piso('bolaVaini', 'Vainilla', '#fbf0cf', { sab: 'vainilla' }); piso('bolaMenta', 'Menta', '#a6e3cb', { sab: 'menta' });
  piso('bolaArand', 'Arándano', '#a39ae0', { sab: 'arándano' }); piso('bolaLimon', 'Limón', '#f6e27a', { sab: 'limón' });
  piso('bolaManjar', 'Manjar', '#d49a55', { sab: 'manjar' });
  piso('hCarne', 'Carne', '#6b3a24', { h: 24 }); piso('hQueso', 'Queso', '#f5c342', { h: 8 });
  piso('hLechuga', 'Lechuga', '#7cc452', { h: 12 }); piso('hTomate', 'Tomate', '#e2432f', { h: 10 });
  piso('hCebolla', 'Cebolla', '#c48fc0', { h: 8 }); piso('hPepinillo', 'Pepinillos', '#6aa84f', { h: 8 });
  piso('hHuevo', 'Huevo', '#fdfbf5', { h: 12 }); piso('hTocino', 'Tocino', '#c9544a', { h: 9 });
  piso('panq', 'Panqueque', '#e8b86a', { h: 16 }); piso('panqChoco', 'Panqueque de chocolate', '#8a5a3a', { h: 16 });
  piso('panqArand', 'Panqueque de arándano', '#e2b06a', { h: 16, puntos: '#3f4fa0' });

  // ================= PLATOS =================
  // vista 'arriba' (se ve desde arriba), 'frente' (se apila) o 'palito'.
  const PLATOS = {
    pizza: { n: 'Pizza', e: '🍕', g: 'a', vista: 'arriba', capas: ['salsa', 'queso'], piezas: ['pepperoni', 'champinon', 'aceituna', 'aceitunaVerde', 'pimenton', 'pina', 'jamon', 'albahaca', 'tomatito', 'choclo', 'cebolla'], maxTotal: 16, maxCada: 7 },
    pastel: { n: 'Pastel', e: '🎂', g: 'o', vista: 'frente', capas: ['cobertura'], pila: ['bizChoco', 'bizVaini', 'bizFruti', 'bizMenta', 'bizArand', 'relCrema', 'relMerme', 'relManjar'], pilaMin: 2, pilaMax: 6, pilaN: 'pisos', uno: ['piso', 0], piezas: ['fresa', 'cereza', 'vela', 'chispitas', 'arandano', 'estrella', 'corazon', 'frambuesa', 'chocolatito'], maxTotal: 7, maxCada: 5 },
    helado: { n: 'Helado', e: '🍦', g: 'o', vista: 'frente', capas: ['recipiente', 'salsaHelado'], pila: ['bolaFruti', 'bolaChoco', 'bolaVaini', 'bolaMenta', 'bolaArand', 'bolaLimon', 'bolaManjar'], pilaMin: 1, pilaMax: 4, pilaN: 'bolas', uno: ['bola', 1], piezas: ['cereza', 'chispitas', 'galleta', 'estrella', 'corazon', 'arandano'], maxTotal: 4, maxCada: 3 },
    hamburguesa: { n: 'Hamburguesa', e: '🍔', g: 'a', vista: 'frente', capas: ['pan'], pila: ['hCarne', 'hQueso', 'hLechuga', 'hTomate', 'hCebolla', 'hPepinillo', 'hHuevo', 'hTocino'], pilaMin: 2, pilaMax: 8, pilaN: 'capas', uno: ['capa', 1], piezas: [] },
    cupcake: { n: 'Cupcake', e: '🧁', g: 'o', vista: 'frente', capas: ['pirotin', 'crema'], piezas: ['cereza', 'chispitas', 'estrella', 'corazon', 'fresa', 'arandano', 'perla'], maxTotal: 6, maxCada: 4 },
    brocheta: { n: 'Brocheta de frutas', e: '🍓', g: 'a', vista: 'palito', capas: [], pila: ['bFrutilla', 'bPlatano', 'bUvaVerde', 'bUvaMorada', 'bKiwi', 'bPina', 'bArandano', 'bMelon', 'bSandia'], pilaMin: 3, pilaMax: 8, pilaN: 'frutas', uno: ['fruta', 1], piezas: [] },
    panqueques: { n: 'Panqueques', e: '🥞', g: 'os', vista: 'frente', capas: ['almibar'], pila: ['panq', 'panqChoco', 'panqArand'], pilaMin: 2, pilaMax: 7, pilaN: 'panqueques', uno: ['panqueque', 0], piezas: ['fresa', 'arandano', 'platano', 'frambuesa', 'mantequilla', 'chispitas'], maxTotal: 6, maxCada: 4 },
    dona: { n: 'Dona', e: '🍩', g: 'a', vista: 'arriba', capas: ['glaseado'], piezas: ['chispitas', 'estrella', 'corazon', 'perla', 'chocolatito', 'fresa'], maxTotal: 12, maxCada: 6 },
    ensalada: { n: 'Ensalada', e: '🥗', g: 'a', vista: 'arriba', capas: [], piezas: ['tomatito', 'pepino', 'zanahoria', 'choclo', 'huevo', 'cruton', 'aceituna', 'rabanito', 'palta'], maxTotal: 18, maxCada: 7 },
  };
  const ORDEN = ['pizza', 'pastel', 'helado', 'hamburguesa', 'cupcake', 'brocheta', 'panqueques', 'dona', 'ensalada'];
  const capasDe = (cat) => Object.values(I).filter((x) => x.tipo === 'capa' && x.cat === cat).map((x) => x.id);

  // ================= DIBUJO =================
  const PLATO_BG = '#f4f1ec';
  function onda(cx, cy, r, amp, n, fase) {
    let d = '';
    for (let i = 0; i <= 72; i++) {
      const a = i / 72 * Math.PI * 2, rr = r + amp * Math.sin(a * n + (fase || 0));
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1);
    }
    return d + 'Z';
  }
  const QUESO = (() => { const r = semilla(7), out = []; for (let i = 0; i < 16; i++) { const a = r() * Math.PI * 2, d = 78 * Math.sqrt(r()); out.push([160 + Math.cos(a) * d, 150 + Math.sin(a) * d, 13 + r() * 10, 9 + r() * 8, r() * 180]); } return out; })();

  function dPieza(pz, x, y, i, nuevo) {
    const attr = i == null ? '' : ` class="coc-pz" data-i="${i}"`;
    return `<g${attr} transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${pz.rot | 0}) scale(${pz.s.toFixed(2)})"><g${nuevo ? ' class="coc-pop"' : ''}>${I[pz.id].d}</g></g>`;
  }
  // zona donde van las piezas (vista desde arriba): [radio mínimo, radio máximo]
  const ZONA = { pizza: [0, 90], dona: [60, 90], ensalada: [0, 100] };

  // dónde queda "arriba" en los platos de frente (para poner la decoración)
  function superficie(pid, st) {
    const alto = (ids) => ids.reduce((s, id) => s + (I[id].h || 0), 0);
    if (pid === 'pastel') { const y = 262 - alto(st.pila); return { x0: 72, x1: 248, y: y - (st.capas.cobertura ? 8 : 0) }; }
    if (pid === 'panqueques') return { x0: 92, x1: 228, y: 262 - alto(st.pila) };
    if (pid === 'helado') {
      const borde = st.capas.recipiente === 'vaso' ? 206 : 196;
      if (!st.pila.length) return { x0: 138, x1: 182, y: borde };
      return { x0: 136, x1: 184, y: borde - 20 - (st.pila.length - 1) * 40 - 36 };
    }
    if (pid === 'cupcake') return { x0: 116, x1: 204, y: st.capas.crema ? 122 : 176, curva: !!st.capas.crema };
    return { x0: 80, x1: 240, y: 262 };
  }

  function dibujar(pid, st, o) {
    o = o || {};
    const P = PLATOS[pid];
    const piezasSvg = () => st.piezas.map((pz, i) => {
      const ii = o.mini ? null : i, nuevo = !o.mini && i === o.nuevo;
      if (P.vista === 'arriba') return dPieza(pz, pz.x, pz.y, ii, nuevo);
      const sup = superficie(pid, st);
      const x = sup.x0 + pz.u * (sup.x1 - sup.x0);
      const y = sup.y - 8 * pz.s + (pz.j || 0) + (sup.curva ? Math.abs(pz.u - 0.5) * 56 : 0);
      return dPieza(pz, x, y, ii, nuevo);
    }).join('');
    let s = '';
    if (P.vista === 'arriba') {
      s += `<circle cx="160" cy="150" r="142" fill="${PLATO_BG}" stroke="#ddd6cc" stroke-width="3"/><circle cx="160" cy="150" r="128" fill="none" stroke="#e8e2d8" stroke-width="2"/>`;
      if (pid === 'pizza') {
        s += '<circle cx="160" cy="150" r="120" fill="#d9a553"/><circle cx="160" cy="150" r="109" fill="#ecc57b"/>';
        if (st.capas.salsa) s += `<path d="${onda(160, 150, 101, 2.5, 17)}" fill="${I[st.capas.salsa].col}"/>`;
        if (st.capas.queso) { const c = I[st.capas.queso].col; s += QUESO.map(([x, y, rx, ry, r]) => `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" transform="rotate(${r.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${c}" stroke="${oscuro(c, 0.08)}" stroke-width="1"/>`).join(''); }
      } else if (pid === 'dona') {
        s += '<circle cx="160" cy="150" r="112" fill="#cf8f4a"/><circle cx="160" cy="150" r="104" fill="#e0a760"/>';
        if (st.capas.glaseado) { const c = I[st.capas.glaseado].col; s += `<path d="${onda(160, 150, 97, 5, 11)}" fill="${c}" stroke="${oscuro(c, 0.12)}" stroke-width="1.5"/><path d="M92 118 A76 76 0 0 1 150 76" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="7" stroke-linecap="round"/>`; }
        s += `<circle cx="160" cy="150" r="50" fill="#e0a760"/><circle cx="160" cy="150" r="40" fill="${PLATO_BG}" stroke="#cf8f4a" stroke-width="3"/>`;
      } else if (pid === 'ensalada') {
        s += '<circle cx="160" cy="150" r="126" fill="#fff" stroke="#8fc2e6" stroke-width="7"/>';
        s += `<path d="${onda(160, 150, 110, 6, 13)}" fill="#8fcf6a"/><path d="${onda(160, 150, 90, 5, 9, 1)}" fill="#a8dc80"/>`;
        s += '<g stroke="#6aa84f" stroke-width="2" fill="none" stroke-linecap="round"><path d="M95 120 Q120 110 135 125"/><path d="M190 90 Q210 100 215 120"/><path d="M120 200 Q140 185 160 195"/><path d="M200 180 Q220 190 225 210"/></g>';
      }
      return s + piezasSvg();
    }
    if (P.vista === 'palito') {
      s += `<ellipse cx="160" cy="196" rx="152" ry="30" fill="${PLATO_BG}" stroke="#ddd6cc" stroke-width="3"/><ellipse cx="160" cy="192" rx="120" ry="18" fill="none" stroke="#e8e2d8" stroke-width="2"/>`;
      s += '<path d="M14 150 L28 146 H306 V154 H28 Z" fill="#c79a5b" stroke="#a87c42" stroke-width="1.5"/>';
      s += st.pila.map((id, i) => `<g transform="translate(${42 + i * 36} 150) scale(1.18)">${I[id].d}</g>`).join('');
      return s;
    }
    // ---------- de frente ----------
    s += `<ellipse cx="160" cy="268" rx="142" ry="21" fill="${PLATO_BG}" stroke="#ddd6cc" stroke-width="3"/>`;
    let y = 262;
    if (pid === 'pastel') {
      st.pila.forEach((id) => {
        const L = I[id], h = L.h;
        if (L.relleno) s += `<rect x="58" y="${y - h}" width="204" height="${h}" rx="4" fill="${L.col}" stroke="${oscuro(L.col, 0.12)}" stroke-width="1.2"/>`;
        else s += `<rect x="55" y="${y - h}" width="210" height="${h}" rx="9" fill="${L.col}" stroke="${oscuro(L.col, 0.2)}" stroke-width="2"/>` +
          [72, 108, 150, 196, 236].map((x, k) => `<circle cx="${x}" cy="${y - h / 2 + (k % 2 ? 5 : -5)}" r="2" fill="${oscuro(L.col, 0.15)}"/>`).join('');
        y -= h;
      });
      if (st.capas.cobertura) {
        const c = I[st.capas.cobertura].col, base = st.pila.length ? y : 262;
        s += `<rect x="51" y="${base - 8}" width="218" height="20" rx="10" fill="${c}" stroke="${oscuro(c, 0.15)}" stroke-width="1.5"/>` +
          [[70, 18], [98, 10], [126, 24], [158, 14], [188, 22], [218, 12], [246, 18]].map(([x, l]) => `<rect x="${x - 7}" y="${base + 2}" width="14" height="${l}" rx="7" fill="${c}"/>`).join('');
      }
    } else if (pid === 'hamburguesa') {
      const pan = st.capas.pan && I[st.capas.pan];
      if (pan) { s += `<path d="M60 ${y - 26} H260 V${y - 14} Q260 ${y} 244 ${y} H76 Q60 ${y} 60 ${y - 14} Z" fill="${pan.col}" stroke="${oscuro(pan.col, 0.2)}" stroke-width="2"/>`; y -= 26; }
      st.pila.forEach((id) => { s += capaHamburguesa(id, y); y -= I[id].h; });
      if (pan) {
        s += `<path d="M58 ${y} Q58 ${y - 64} 160 ${y - 64} Q262 ${y - 64} 262 ${y} Z" fill="${pan.col}" stroke="${oscuro(pan.col, 0.2)}" stroke-width="2"/><path d="M92 ${y - 34} Q120 ${y - 54} 160 ${y - 55}" stroke="#fff" stroke-opacity=".35" stroke-width="6" fill="none" stroke-linecap="round"/>`;
        const semillas = [[110, 30], [138, 44], [168, 48], [196, 40], [222, 26], [126, 18], [182, 24], [152, 32]];
        if (st.capas.pan === 'panSesamo') s += semillas.map(([x, d]) => `<ellipse cx="${x}" cy="${y - d}" rx="4" ry="2.3" fill="#fff8e0" transform="rotate(${(x % 40) - 20} ${x} ${y - d})"/>`).join('');
        if (st.capas.pan === 'panIntegral') s += semillas.map(([x, d]) => `<circle cx="${x + 5}" cy="${y - d + 4}" r="1.8" fill="#6b4428"/>`).join('');
      }
    } else if (pid === 'panqueques') {
      st.pila.forEach((id) => {
        const L = I[id];
        s += `<rect x="70" y="${y - 16}" width="180" height="16" rx="8" fill="${L.col}" stroke="${oscuro(L.col, 0.22)}" stroke-width="2"/><path d="M84 ${y - 12} H236" stroke="${claro(L.col, 0.3)}" stroke-width="2.5" stroke-linecap="round"/>`;
        if (L.puntos) s += [96, 130, 170, 210].map((x, k) => `<circle cx="${x}" cy="${y - 7 + (k % 2) * 2}" r="2.6" fill="${L.puntos}"/>`).join('');
        y -= 16;
      });
      if (st.capas.almibar && st.pila.length) {
        const c = I[st.capas.almibar].col;
        s += `<path d="M76 ${y + 2} Q160 ${y - 10} 244 ${y + 2} L244 ${y + 6} Q236 ${y + 30} 228 ${y + 8} Q206 ${y + 14} 190 ${y + 10} Q180 ${y + 38} 170 ${y + 10} Q140 ${y + 14} 118 ${y + 10} Q110 ${y + 26} 100 ${y + 10} Q84 ${y + 12} 76 ${y + 6} Z" fill="${c}" fill-opacity=".92"/>`;
      }
    } else if (pid === 'helado') {
      const rec = st.capas.recipiente;
      const borde = rec === 'vaso' ? 206 : 196;
      if (rec === 'cono') s += '<path d="M122 196 L198 196 L160 286 Z" fill="#e0a45c" stroke="#b9803a" stroke-width="2" stroke-linejoin="round"/><path d="M131 214 L186 214 M140 236 L178 236 M149 258 L170 258 M136 204 L172 270 M184 204 L148 270" stroke="#c98f48" stroke-width="1.6"/>';
      if (rec === 'vaso') s += '<path d="M112 206 L208 206 L196 284 L124 284 Z" fill="#f28cb1" stroke="#d96a93" stroke-width="2" stroke-linejoin="round"/><path d="M110 206 H210" stroke="#d96a93" stroke-width="5" stroke-linecap="round"/><circle cx="140" cy="244" r="5" fill="#fff" opacity=".6"/><circle cx="178" cy="258" r="4" fill="#fff" opacity=".6"/>';
      st.pila.forEach((id, k) => {
        const c = I[id].col, cy = borde - 20 - k * 40;
        s += `<circle cx="160" cy="${cy}" r="38" fill="${c}" stroke="${oscuro(c, 0.15)}" stroke-width="2"/>` +
          [-28, -14, 0, 14, 28].map((dx) => `<circle cx="${160 + dx}" cy="${cy + 30 - Math.abs(dx) * 0.35}" r="9" fill="${c}"/>`).join('') +
          `<ellipse cx="146" cy="${cy - 16}" rx="10" ry="6" fill="#fff" opacity=".35"/>`;
      });
      if (st.capas.salsaHelado && st.pila.length) {
        const c = I[st.capas.salsaHelado].col, cy = borde - 20 - (st.pila.length - 1) * 40;
        s += `<path d="M125 ${cy - 10} Q160 ${cy - 48} 195 ${cy - 10} Q192 ${cy + 12} 186 ${cy - 4} Q176 ${cy + 20} 168 ${cy - 6} Q160 ${cy + 4} 150 ${cy - 6} Q142 ${cy + 18} 134 ${cy - 4} Q128 ${cy + 6} 125 ${cy - 10} Z" fill="${c}" fill-opacity=".94"/>`;
      }
    } else if (pid === 'cupcake') {
      const pir = st.capas.pirotin && I[st.capas.pirotin];
      s += '<path d="M100 190 Q160 150 220 190 Z" fill="#c98b4f" stroke="#a36a34" stroke-width="2"/>';
      if (pir) s += `<path d="M100 190 L220 190 L206 272 L114 272 Z" fill="${pir.col}" stroke="${oscuro(pir.col, 0.2)}" stroke-width="2" stroke-linejoin="round"/>` +
        [116, 132, 148, 164, 180, 196].map((x) => `<path d="M${x} 192 L${x + (x - 160) * -0.08} 270" stroke="${oscuro(pir.col, 0.15)}" stroke-width="2"/>`).join('');
      if (st.capas.crema) {
        const c = I[st.capas.crema].col, b = oscuro(c, 0.12);
        s += [[160, 180, 72, 18], [160, 160, 58, 16], [160, 142, 44, 14], [160, 127, 28, 11]].map(([x, yy, rx, ry]) => `<ellipse cx="${x}" cy="${yy}" rx="${rx}" ry="${ry}" fill="${c}" stroke="${b}" stroke-width="1.5"/>`).join('') +
          `<path d="M150 120 Q160 100 170 120 Z" fill="${c}" stroke="${b}" stroke-width="1.5"/><path d="M118 166 Q140 176 170 170" stroke="#fff" stroke-opacity=".4" stroke-width="4" fill="none" stroke-linecap="round"/>`;
      }
    }
    return s + piezasSvg();
  }

  function capaHamburguesa(id, y) {
    const L = I[id], c = L.col;
    switch (id) {
      case 'hCarne': return `<rect x="64" y="${y - 24}" width="192" height="24" rx="12" fill="${c}" stroke="#4e2a18" stroke-width="2"/>` + [90, 130, 170, 214].map((x, k) => `<ellipse cx="${x}" cy="${y - 12 + (k % 2 ? 4 : -3)}" rx="6" ry="2.5" fill="#4e2a18"/>`).join('');
      case 'hQueso': return `<path d="M56 ${y - 8} H264 V${y} L242 ${y + 14} L222 ${y} H162 L142 ${y + 17} L122 ${y} H60 Z" fill="${c}" stroke="#d9a02a" stroke-width="1.5" stroke-linejoin="round"/>`;
      case 'hLechuga': { let d = `M50 ${y - 5}`; for (let x = 50; x < 270; x += 20) d += ` Q${x + 10} ${y - 17} ${x + 20} ${y - 5}`; d += ` L270 ${y + 2}`; for (let x = 270; x > 50; x -= 20) d += ` Q${x - 10} ${y + 10} ${x - 20} ${y + 2}`; return `<path d="${d}Z" fill="${c}" stroke="#4c9a3f" stroke-width="1.5"/>`; }
      case 'hTomate': return [66, 162].map((x) => `<rect x="${x}" y="${y - 10}" width="92" height="10" rx="5" fill="${c}" stroke="#b52d1f" stroke-width="1.5"/><rect x="${x + 8}" y="${y - 7}" width="76" height="4" rx="2" fill="#f36f5c"/>`).join('');
      case 'hCebolla': return `<rect x="70" y="${y - 8}" width="180" height="8" rx="4" fill="${c}" stroke="#9b4f96" stroke-width="1.5"/>` + [100, 150, 200].map((x) => `<path d="M${x - 14} ${y - 4} Q${x} ${y - 9} ${x + 14} ${y - 4}" stroke="#fbeef9" stroke-width="1.5" fill="none"/>`).join('');
      case 'hPepinillo': return [80, 120, 160, 200, 240].map((x) => `<ellipse cx="${x}" cy="${y - 4}" rx="17" ry="5" fill="${c}" stroke="#3f7a2e" stroke-width="1.5"/>`).join('');
      case 'hHuevo': return `<path d="M72 ${y} Q66 ${y - 12} 96 ${y - 12} H224 Q254 ${y - 12} 248 ${y} Z" fill="${c}" stroke="#ddd6c8" stroke-width="1.5"/><ellipse cx="160" cy="${y - 8}" rx="16" ry="6" fill="#f5b82e" stroke="#e39a16" stroke-width="1.2"/>`;
      case 'hTocino': { let d = `M58 ${y - 4}`; for (let x = 58; x < 262; x += 34) d += ` Q${x + 17} ${y - 12} ${x + 34} ${y - 4}`; return `<path d="${d}" stroke="${c}" stroke-width="9" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#f2a09a" stroke-width="2.5" fill="none" stroke-linecap="round"/>`; }
    }
    return '';
  }

  // ---------- íconos de la bandeja (viewBox -20 -20 40 40) ----------
  function icono(id) {
    const x = I[id], c = x.col;
    if (x.d) return x.tipo === 'pila' ? `<g transform="scale(1.05)">${x.d}</g>` : `<g transform="scale(1.25)">${x.d}</g>`;
    if (x.tipo === 'capa') {
      const bol = `<path d="M-16 -1 H16 A16 13 0 0 1 -16 -1 Z" fill="#fff" stroke="#cfc6b8" stroke-width="1.6"/><ellipse cx="0" cy="-1" rx="16" ry="5" fill="${c}" stroke="${oscuro(c, 0.15)}" stroke-width="1"/>`;
      switch (x.cat) {
        case 'salsa': case 'salsaHelado': case 'almibar': return bol;
        case 'queso': return `<path d="M-15 8 L15 8 L15 -2 L-15 -10 Z" fill="${c}" stroke="${oscuro(c, 0.2)}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="-4" cy="2" r="2.2" fill="${oscuro(c, 0.12)}"/><circle cx="7" cy="3" r="1.6" fill="${oscuro(c, 0.12)}"/>`;
        case 'cobertura': case 'crema': return `<ellipse cx="0" cy="9" rx="15" ry="5" fill="${c}" stroke="${oscuro(c, 0.15)}"/><ellipse cx="0" cy="2" rx="11" ry="5" fill="${c}" stroke="${oscuro(c, 0.15)}"/><ellipse cx="0" cy="-5" rx="7" ry="4" fill="${c}" stroke="${oscuro(c, 0.15)}"/><path d="M-3 -8 Q0 -16 3 -8 Z" fill="${c}" stroke="${oscuro(c, 0.15)}"/>`;
        case 'glaseado': return `<circle r="15" fill="#e0a760"/><path d="${onda(0, 0, 13, 1.3, 9)}" fill="${c}"/><circle r="5.5" fill="#e0a760"/><circle r="4" fill="#fff"/>`;
        case 'pirotin': return `<path d="M-15 -9 H15 L11 13 H-11 Z" fill="${c}" stroke="${oscuro(c, 0.2)}" stroke-width="1.6" stroke-linejoin="round"/><path d="M-8 -8 L-6 12 M0 -8 V12 M8 -8 L6 12" stroke="${oscuro(c, 0.15)}" stroke-width="1.4"/>`;
        case 'recipiente': return id === 'cono'
          ? '<path d="M-11 -10 H11 L0 17 Z" fill="#e0a45c" stroke="#b9803a" stroke-width="1.6" stroke-linejoin="round"/><path d="M-8 -3 L5 11 M8 -3 L-5 11" stroke="#c98f48" stroke-width="1.3"/>'
          : '<path d="M-14 -9 H14 L10 15 H-10 Z" fill="#f28cb1" stroke="#d96a93" stroke-width="1.6" stroke-linejoin="round"/><circle cx="-3" cy="4" r="2.2" fill="#fff" opacity=".6"/>';
        case 'pan': return `<path d="M-16 4 Q-16 -14 0 -14 Q16 -14 16 4 Z" fill="${c}" stroke="${oscuro(c, 0.2)}" stroke-width="1.6"/><rect x="-16" y="6" width="32" height="8" rx="4" fill="${c}" stroke="${oscuro(c, 0.2)}" stroke-width="1.6"/>` +
          (id === 'panSesamo' ? '<g fill="#fff8e0"><ellipse cx="-6" cy="-6" rx="2" ry="1.2"/><ellipse cx="3" cy="-9" rx="2" ry="1.2"/><ellipse cx="8" cy="-3" rx="2" ry="1.2"/></g>' : '') +
          (id === 'panIntegral' ? '<g fill="#6b4428"><circle cx="-5" cy="-5" r="1.2"/><circle cx="4" cy="-8" r="1.2"/><circle cx="7" cy="-2" r="1.2"/></g>' : '');
      }
    }
    // pisos sin dibujo propio
    if (/^bola/.test(id)) return `<circle cy="-2" r="13" fill="${c}" stroke="${oscuro(c, 0.15)}" stroke-width="1.6"/>` + [-9, 0, 9].map((dx) => `<circle cx="${dx}" cy="10" r="4" fill="${c}"/>`).join('') + '<ellipse cx="-5" cy="-7" rx="4" ry="2.5" fill="#fff" opacity=".4"/>';
    if (x.relleno) return `<rect x="-16" y="-10" width="32" height="8" rx="4" fill="#f1d59a" stroke="#d6b574"/><rect x="-16" y="-2" width="32" height="6" rx="3" fill="${c}" stroke="${oscuro(c, 0.15)}"/><rect x="-16" y="4" width="32" height="8" rx="4" fill="#f1d59a" stroke="#d6b574"/>`;
    if (/^biz/.test(id)) return `<rect x="-16" y="-9" width="32" height="18" rx="5" fill="${c}" stroke="${oscuro(c, 0.2)}" stroke-width="1.6"/><circle cx="-7" cy="-1" r="1.4" fill="${oscuro(c, 0.15)}"/><circle cx="6" cy="2" r="1.4" fill="${oscuro(c, 0.15)}"/>`;
    if (/^panq/.test(id)) return `<ellipse cx="0" cy="4" rx="16" ry="6" fill="${oscuro(c, 0.1)}"/><ellipse cx="0" cy="0" rx="16" ry="6" fill="${c}" stroke="${oscuro(c, 0.2)}" stroke-width="1.4"/>` + (x.puntos ? `<circle cx="-5" cy="0" r="1.8" fill="${x.puntos}"/><circle cx="6" cy="1" r="1.8" fill="${x.puntos}"/>` : '');
    switch (id) {
      case 'hCarne': return `<ellipse rx="16" ry="8" fill="${c}" stroke="#4e2a18" stroke-width="1.6"/><ellipse cx="-5" cy="-1" rx="3" ry="1.4" fill="#4e2a18"/><ellipse cx="6" cy="2" rx="3" ry="1.4" fill="#4e2a18"/>`;
      case 'hQueso': return `<rect x="-13" y="-13" width="26" height="26" rx="2" fill="${c}" stroke="#d9a02a" stroke-width="1.6" transform="rotate(8)"/>`;
      case 'hLechuga': return `<path d="${onda(0, 0, 13, 2.5, 8)}" fill="${c}" stroke="#4c9a3f" stroke-width="1.4"/><path d="M-8 4 Q0 -2 8 -6" stroke="#4c9a3f" stroke-width="1.4" fill="none"/>`;
      case 'hTomate': return `<circle r="14" fill="${c}" stroke="#b52d1f" stroke-width="1.6"/><circle r="9" fill="#f36f5c"/><g fill="#f7e27a"><circle cx="-3" cy="-3" r="1.5"/><circle cx="4" cy="-1" r="1.5"/><circle cx="-1" cy="4" r="1.5"/></g>`;
      case 'hCebolla': return `<circle r="14" fill="none" stroke="#9b4f96" stroke-width="3"/><circle r="9" fill="none" stroke="${c}" stroke-width="2.5"/><circle r="4.5" fill="none" stroke="${c}" stroke-width="2"/>`;
      case 'hPepinillo': return [-8, 1, 10].map((dx, k) => `<ellipse cx="${dx}" cy="${k % 2 ? -4 : 4}" rx="7" ry="5" fill="${c}" stroke="#3f7a2e" stroke-width="1.3"/>`).join('');
      case 'hHuevo': return `<path d="M-16 2 Q-16 -12 -2 -11 Q14 -14 15 1 Q16 13 0 12 Q-15 13 -16 2 Z" fill="${c}" stroke="#ddd6c8" stroke-width="1.4"/><circle cx="0" cy="0" r="6" fill="#f5b82e"/>`;
      case 'hTocino': return `<path d="M-16 4 Q-8 -8 0 2 Q8 12 16 -2" stroke="${c}" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M-16 4 Q-8 -8 0 2 Q8 12 16 -2" stroke="#f2a09a" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    }
    return `<rect x="-15" y="-7" width="30" height="14" rx="6" fill="${c}"/>`;
  }
  const svgIcono = (id, clase) => `<svg class="${clase || ''}" viewBox="-20 -20 40 40" aria-hidden="true">${icono(id)}</svg>`;

  // ================= NIVELES =================
  function nombreDe(pid, r) {
    const P = PLATOS[pid];
    const tipos = Object.keys(r.piezas);
    const sab = (ids) => [...new Set(ids.map((id) => I[id].sab).filter(Boolean))];
    const y = (l) => (l.length > 1 ? l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1] : l[0]);
    const min = (id) => I[id].n.toLowerCase();
    switch (pid) {
      case 'pizza':
        if (tipos.includes('pina') && tipos.includes('jamon')) return 'Pizza hawaiana';
        if (r.capas.salsa === 'pesto') return 'Pizza verde' + (tipos.length ? ' con ' + min(tipos[0]) : '');
        return tipos.length ? 'Pizza de ' + y(tipos.slice(0, 2).map(min)) : 'Pizza de queso';
      case 'pastel': { const s = sab(r.pila); return 'Pastel de ' + y(s.length ? s : ['vainilla']); }
      case 'helado': return 'Helado de ' + y(sab(r.pila));
      case 'hamburguesa': return 'Hamburguesa con ' + y([...new Set(r.pila)].slice(0, 2).map(min));
      case 'cupcake': return 'Cupcake ' + I[r.capas.crema].n.toLowerCase();
      case 'panqueques': return 'Panqueques con ' + I[r.capas.almibar].n.toLowerCase();
      case 'dona': return 'Dona ' + I[r.capas.glaseado].n.toLowerCase();
      case 'ensalada': return 'Ensalada de ' + y(tipos.slice(0, 2).map(min));
      default: return P.n;
    }
  }

  function receta(nivel) {
    const pid = ORDEN[(nivel - 1) % ORDEN.length];
    const P = PLATOS[pid];
    const r = { plato: pid, capas: {}, pila: [], piezas: {} };
    P.capas.forEach((cat) => { r.capas[cat] = pick(capasDe(cat)); });
    if (P.pila) {
      // pensado para una niña de 4 años: pocas capas, que crecen de a poco
      const largo = entre(P.pilaMin + Math.floor((nivel - 1) / 9), P.pilaMin, Math.min(P.pilaMax, 4));
      if (pid === 'brocheta' && nivel >= 12 && Math.random() < 0.6) {
        // una serie que se repite (frutilla, plátano, frutilla, plátano…)
        const patron = mezclar(P.pila).slice(0, nivel >= 30 ? 3 : 2);
        for (let i = 0; i < largo; i++) r.pila.push(patron[i % patron.length]);
      } else if (pid === 'pastel') {
        const biz = P.pila.filter((id) => !I[id].relleno), rel = P.pila.filter((id) => I[id].relleno);
        const pisos = entre(2 + Math.floor((nivel - 1) / 18), 2, 3);
        for (let i = 0; i < pisos; i++) {
          if (i && nivel >= 20) r.pila.push(pick(rel));
          r.pila.push(pick(biz));
        }
      } else if (pid === 'hamburguesa') {
        const opciones = mezclar(P.pila.filter((id) => id !== 'hCarne'));
        r.pila.push('hCarne');
        for (let i = 1; i < largo; i++) r.pila.push(nivel >= 20 && i === largo - 1 && Math.random() < 0.5 ? 'hCarne' : opciones[i - 1]);
        r.pila = mezclar(r.pila);
      } else {
        for (let i = 0; i < largo; i++) r.pila.push(pick(P.pila));
      }
    }
    if (P.piezas.length) {
      const tipos = entre(1 + Math.floor((nivel - 1) / 9), 1, Math.min(3, P.piezas.length));
      const maxC = Math.min(P.maxCada, 4, 2 + Math.floor((nivel - 1) / 9));
      let total = 0;
      mezclar(P.piezas).slice(0, tipos).forEach((id) => {
        const n = Math.min(1 + rnd(maxC), P.maxTotal - total);
        if (n > 0) { r.piezas[id] = n; total += n; }
      });
    }
    r.nombre = nombreDe(pid, r);
    return r;
  }

  // ================= EL JUEGO =================
  // area: donde se dibuja; nivel; ganar(texto); aviso(texto) (de juegos-parche)
  function jugar(area, nivel, ganar, aviso) {
    const r = receta(nivel);
    const pid = r.plato, P = PLATOS[pid];
    const escala = Math.max(0.92, 1 - (nivel - 1) * 0.004);
    const sinLista = false; // la lista del pedido siempre a la vista
    let st = { capas: {}, pila: [], piezas: [] };
    let historial = [], nuevo = -1, fin = false;

    // la receta dibujada (el pedido), con las piezas repartidas siempre igual
    const azarMeta = semilla(nivel * 7919 + 13);
    const meta = { capas: { ...r.capas }, pila: r.pila.slice(), piezas: [] };
    Object.keys(r.piezas).forEach((id) => { for (let k = 0; k < r.piezas[id]; k++) meta.piezas.push(nuevaPieza(id, meta.piezas, null, azarMeta)); });

    // bandeja: lo que pide la receta + cosas parecidas para confundir
    const trampas = Math.min(3, 1 + Math.floor((nivel - 1) / 6));
    const secciones = [];
    P.capas.forEach((cat) => {
      const todas = capasDe(cat);
      const ops = mezclar([r.capas[cat], ...mezclar(todas.filter((x) => x !== r.capas[cat])).slice(0, nivel < 6 ? 1 : 2)]);
      secciones.push({ titulo: CATS[cat].n, ids: ops });
    });
    if (P.pila) {
      const pedidos = [...new Set(r.pila)];
      const extra = mezclar(P.pila.filter((id) => !pedidos.includes(id))).slice(0, trampas);
      const ids = pedidos.concat(extra);
      secciones.push({ titulo: P.pilaN[0].toUpperCase() + P.pilaN.slice(1) + ' (en orden)', ids: nivel >= 5 ? mezclar(ids) : ids });
    }
    if (P.piezas.length) {
      const pedidos = Object.keys(r.piezas);
      const extra = mezclar(P.piezas.filter((id) => !pedidos.includes(id))).slice(0, trampas);
      const ids = pedidos.concat(extra);
      secciones.push({ titulo: pid === 'ensalada' || pid === 'pizza' ? 'Ingredientes' : 'Decoración', ids: nivel >= 5 ? mezclar(ids) : ids });
    }

    const cliente = pick(Juego.personajes());
    const listo = { a: 'lista', o: 'listo', os: 'listos' }[P.g];
    area.innerHTML =
      '<div class="coc">' +
      '<div class="coc-pedido">' +
      `<svg class="coc-cliente" viewBox="20 36 280 280" aria-hidden="true">${Juego.figura(cliente.id, Juego.inicial(cliente.id))}</svg>` +
      `<div class="coc-pedido-txt"><small>Pedido de ${cliente.nombre}</small><strong>${P.e} ${r.nombre}</strong><div class="coc-lista" id="cocLista"></div></div>` +
      `<button class="coc-meta" id="cocMeta" aria-label="Ver el pedido en grande"><svg viewBox="0 0 320 300">${dibujar(pid, meta, { mini: true })}</svg><span>🔍</span></button>` +
      '</div>' +
      '<div class="coc-mesa"><svg id="cocPlato" viewBox="0 0 320 300" aria-label="Tu plato"></svg></div>' +
      '<div class="coc-acciones"><button id="cocDeshacer">↩ Deshacer</button><button id="cocBorrar">🗑 De nuevo</button>' +
      `<button id="cocListo" class="coc-listo">✅ ¡${listo[0].toUpperCase() + listo.slice(1)}!</button></div>` +
      '<div class="coc-bandeja" id="cocBandeja">' + secciones.map((sec) =>
        `<div class="coc-sec">${sec.titulo}</div><div class="coc-fila">` + sec.ids.map((id) =>
          `<button class="coc-ing" data-id="${id}" aria-label="${I[id].n}">${svgIcono(id)}<span>${I[id].n}</span></button>`).join('') + '</div>').join('') + '</div>' +
      `<div class="coc-grande hidden" id="cocGrande"><svg viewBox="0 0 320 300">${dibujar(pid, meta, { mini: true })}</svg><p>Así lo pidió ${cliente.nombre}. Toca para volver.</p></div>` +
      '</div>';
    const $ = (id) => area.querySelector('#' + id);
    const plato = $('cocPlato');

    // ---------- lista del pedido ----------
    function chips() {
      const out = [];
      Object.keys(r.capas).forEach((cat) => out.push(`<span class="coc-chip" data-id="${r.capas[cat]}">${svgIcono(r.capas[cat])}${I[r.capas[cat]].n}</span>`));
      r.pila.forEach((id, i) => out.push(`<span class="coc-chip" data-id="${id}" title="${I[id].n}"><b>${i + 1}</b>${svgIcono(id)}</span>`));
      Object.keys(r.piezas).forEach((id) => out.push(`<span class="coc-chip" data-id="${id}" data-n="${r.piezas[id]}" title="${I[id].n}">${svgIcono(id)}× ${r.piezas[id]}</span>`));
      return out.join('');
    }
    let verLista = null;
    function pintarLista() {
      const el = $('cocLista');
      if (!sinLista) { el.innerHTML = chips(); return; }
      el.innerHTML = '<button class="coc-verlista" id="cocVerLista">👀 Mira bien el dibujo · ver lista</button>';
    }
    pintarLista();
    area.querySelector('.coc-lista').addEventListener('click', (e) => {
      if (!e.target.closest('#cocVerLista')) return;
      $('cocLista').innerHTML = chips();
      clearTimeout(verLista); verLista = setTimeout(pintarLista, 3500);
    });

    // ---------- pintar ----------
    function pintar() {
      plato.innerHTML = dibujar(pid, st, { nuevo });
      area.querySelectorAll('.coc-ing').forEach((b) => {
        const x = I[b.dataset.id];
        b.classList.toggle('activo', x.tipo === 'capa' && st.capas[x.cat] === x.id);
      });
    }

    // ---------- poner y sacar ----------
    function guardar() { historial.push(JSON.parse(JSON.stringify(st))); if (historial.length > 60) historial.shift(); }
    function nuevaPieza(id, lista, punto, azar) {
      const A = azar || Math.random;
      const s = escala * (0.92 + A() * 0.16), rot = (A() - 0.5) * (P.vista === 'arriba' ? 360 : 30);
      if (P.vista === 'arriba') {
        const [r0, r1] = ZONA[pid];
        const dentro = (x, y) => { const dx = x - 160, dy = y - 150, d = Math.hypot(dx, dy) || 1; const dd = entre(d, r0, r1); return { x: 160 + dx / d * dd, y: 150 + dy / d * dd }; };
        if (punto) return { id, s, rot, ...dentro(punto.x, punto.y) };
        let mejor = null, lejos = -1;
        for (let k = 0; k < 18; k++) {
          const a = A() * Math.PI * 2, d = Math.sqrt(r0 * r0 + A() * (r1 * r1 - r0 * r0));
          const c = { x: 160 + Math.cos(a) * d, y: 150 + Math.sin(a) * d };
          const m = lista.reduce((mm, p) => Math.min(mm, Math.hypot(p.x - c.x, p.y - c.y)), 999);
          if (m > lejos) { lejos = m; mejor = c; }
        }
        return { id, s, rot, ...mejor };
      }
      const j = (A() - 0.5) * 6;
      if (punto) { const sup = superficie(pid, st); return { id, s, rot, j, u: entre((punto.x - sup.x0) / (sup.x1 - sup.x0), 0.04, 0.96) }; }
      let mejor = 0.5, lejos = -1;
      for (let k = 0; k < 14; k++) {
        const u = 0.06 + A() * 0.88;
        const m = lista.reduce((mm, p) => Math.min(mm, Math.abs(p.u - u)), 9);
        if (m > lejos) { lejos = m; mejor = u; }
      }
      return { id, s, rot, j, u: mejor };
    }
    function poner(id, punto) {
      if (fin) return;
      const x = I[id];
      if (x.tipo === 'capa') {
        if (st.capas[x.cat] === id) return;
        guardar(); st.capas[x.cat] = id; nuevo = -1;
      } else if (x.tipo === 'pila') {
        if (st.pila.length >= P.pilaMax + 1) { aviso('¡Ya no cabe más! 😅'); return; }
        guardar(); st.pila.push(id); nuevo = -1;
      } else {
        if (st.piezas.length >= 30) { aviso('¡Ya no cabe más! 😅'); return; }
        guardar(); st.piezas.push(nuevaPieza(id, st.piezas, punto)); nuevo = st.piezas.length - 1;
      }
      pintar();
    }
    function sacarPieza(i) {
      if (fin || !st.piezas[i]) return;
      guardar(); st.piezas.splice(i, 1); nuevo = -1; pintar();
    }
    plato.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('.coc-pz');
      if (g) sacarPieza(Number(g.dataset.i));
    });
    $('cocDeshacer').addEventListener('click', () => { if (!historial.length || fin) return; st = historial.pop(); nuevo = -1; pintar(); });
    $('cocBorrar').addEventListener('click', () => { if (fin) return; guardar(); st = { capas: {}, pila: [], piezas: [] }; nuevo = -1; pintar(); });
    $('cocMeta').addEventListener('click', () => $('cocGrande').classList.remove('hidden'));
    $('cocGrande').addEventListener('click', () => $('cocGrande').classList.add('hidden'));

    // ---------- revisar ----------
    const ORD = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno'];
    function revisar() {
      for (const cat of Object.keys(r.capas)) {
        if (!st.capas[cat]) return `Falta ${CATS[cat].f} 👀`;
        if (st.capas[cat] !== r.capas[cat]) return `Mira bien ${CATS[cat].f}: no es ${I[st.capas[cat]].n.toLowerCase()} 👀`;
      }
      if (P.pila) {
        const d = r.pila.length - st.pila.length;
        if (d > 0) return `Faltan ${P.pilaN}: tienen que ser ${r.pila.length} 👀`;
        if (d < 0) return `Sobran ${P.pilaN}: tienen que ser ${r.pila.length} 👀`;
        const i = r.pila.findIndex((id, k) => st.pila[k] !== id);
        if (i >= 0) {
          const [cosa, fem] = P.uno;
          const ord = fem ? ORD[i].replace(/r$/, 'ra').replace(/o$/, 'a') : ORD[i];
          return `Revisa el orden: ${fem ? 'la' : 'el'} ${ord} ${cosa} ${pid === 'brocheta' ? '(de izquierda a derecha)' : '(de abajo hacia arriba)'} no es igual 👀`;
        }
      }
      const tengo = {};
      st.piezas.forEach((p) => { tengo[p.id] = (tengo[p.id] || 0) + 1; });
      for (const id of Object.keys(r.piezas)) {
        const d = r.piezas[id] - (tengo[id] || 0);
        if (d > 0) return `Te falta${d > 1 ? 'n' : ''} ${d} ${d > 1 ? I[id].p : I[id].n.toLowerCase()} 👀`;
        if (d < 0) return `Sobra${d < -1 ? 'n' : ''} ${-d} ${d < -1 ? I[id].p : I[id].n.toLowerCase()} 👀`;
      }
      for (const id of Object.keys(tengo)) if (!r.piezas[id]) return `Este pedido no lleva ${I[id].p} 👀`;
      return null;
    }
    $('cocListo').addEventListener('click', () => {
      if (fin) return;
      const falta = revisar();
      if (falta) { aviso(falta); plato.classList.remove('coc-no'); void plato.getBoundingClientRect(); plato.classList.add('coc-no'); return; }
      fin = true;
      plato.classList.add('coc-si');
      setTimeout(() => ganar(`¡${r.nombre} ${listo}! ${cliente.nombre} está feliz 😋`), 650);
    });

    // ---------- arrastrar desde la bandeja (o tocar) ----------
    let arr = null;
    function soltarFantasma() { if (arr && arr.fantasma) arr.fantasma.remove(); arr = null; }
    const bandeja = $('cocBandeja');
    bandeja.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.coc-ing');
      if (!b || fin) return;
      arr = { id: b.dataset.id, x0: e.clientX, y0: e.clientY, fantasma: null, pid: e.pointerId, btn: b };
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* sigue igual */ }
    });
    bandeja.addEventListener('pointermove', (e) => {
      if (!arr || e.pointerId !== arr.pid) return;
      if (!arr.fantasma && Math.hypot(e.clientX - arr.x0, e.clientY - arr.y0) > 8) {
        arr.fantasma = document.createElement('div');
        arr.fantasma.className = 'coc-fantasma';
        arr.fantasma.innerHTML = svgIcono(arr.id);
        document.body.appendChild(arr.fantasma);
      }
      if (arr.fantasma) { arr.fantasma.style.left = e.clientX + 'px'; arr.fantasma.style.top = e.clientY + 'px'; }
    });
    bandeja.addEventListener('pointerup', (e) => {
      if (!arr || e.pointerId !== arr.pid) return;
      const { id, fantasma } = arr;
      soltarFantasma();
      if (!fantasma) { poner(id); return; }
      const rc = plato.getBoundingClientRect();
      if (e.clientX < rc.left || e.clientX > rc.right || e.clientY < rc.top || e.clientY > rc.bottom) return;
      const p = plato.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      const q = p.matrixTransform(plato.getScreenCTM().inverse());
      poner(id, { x: q.x, y: q.y });
    });
    bandeja.addEventListener('pointercancel', soltarFantasma);

    pintar();
    if (nivel === 1) aviso('Arrastra (o toca) los ingredientes para preparar el pedido 👩‍🍳');
    return () => { fin = true; clearTimeout(verLista); soltarFantasma(); };
  }

  return { jugar, PLATOS, receta };
})();
