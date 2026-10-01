// juegos-peques.js — seis juegos más dentro de "Juegos con el parche"
// (js/juegos-parche.js les da el menú, los niveles, las estrellas y el tiempo),
// pensados para una niña de 4 años: piezas grandes, pocas cosas a la vez y
// nunca se pierde (si se equivoca, la pieza vuelve y sale una pista amable).
//   🧩 Rompecabezas   🃏 Memoria   🎨 Pintar   🔷 Encaja la forma
//   🌈 Encuentra el color   👤 ¿De quién es la sombra?
// Los personajes salen del juego de vestir (Juego.figura / Juego.inicial).
// Todo lo que se dibuja sale de listas fijas de este archivo o de Juego.

const JuegosPeques = (function () {
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const mezclar = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const figura = (id) => Juego.figura(id, Juego.inicial(id));
  const sacudir = (el) => { el.classList.remove('pq-no'); void el.offsetWidth; el.classList.add('pq-no'); };

  // Arrastrar o tocar: si se mueve más de 8px, un "fantasma" sigue al dedo y al
  // soltar se llama alSoltar(x, y); si no se movió, es un toque (alTocar()).
  function arrastrable(el, alSoltar, alTocar) {
    let ini = null;
    el.addEventListener('pointerdown', (e) => {
      ini = { x: e.clientX, y: e.clientY, id: e.pointerId, fantasma: null };
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* igual funciona */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (!ini || e.pointerId !== ini.id) return;
      if (!ini.fantasma && Math.hypot(e.clientX - ini.x, e.clientY - ini.y) > 8) {
        const r = el.getBoundingClientRect();
        ini.fantasma = el.cloneNode(true);
        ini.fantasma.classList.add('pq-fantasma');
        ini.fantasma.style.width = r.width + 'px'; ini.fantasma.style.height = r.height + 'px';
        document.body.appendChild(ini.fantasma);
        el.classList.add('pq-levantada');
      }
      if (ini.fantasma) { ini.fantasma.style.left = e.clientX + 'px'; ini.fantasma.style.top = e.clientY + 'px'; }
    });
    const fin = (e, cancelado) => {
      if (!ini || e.pointerId !== ini.id) return;
      const { fantasma } = ini; ini = null;
      el.classList.remove('pq-levantada');
      if (fantasma) { fantasma.remove(); if (!cancelado) alSoltar(e.clientX, e.clientY); }
      else if (!cancelado && alTocar) alTocar();
    };
    el.addEventListener('pointerup', (e) => fin(e, false));
    el.addEventListener('pointercancel', (e) => fin(e, true));
  }
  const bajo = (x, y, sel) => { const el = document.elementFromPoint(x, y); return el && el.closest(sel); };
  const limpiarFantasmas = () => document.querySelectorAll('.pq-fantasma').forEach((f) => f.remove());

  // Lo que elige el papá/mamá (cuántas cartas, cuántas piezas) queda guardado
  // en este dispositivo. Sin elección, se usa lo del nivel.
  const OPCIONES = 'ocuparche-jp-opciones';
  function opcion(clave) { try { return (JSON.parse(localStorage.getItem(OPCIONES)) || {})[clave] || null; } catch (e) { return null; } }
  function guardarOpcion(clave, v) {
    try { const o = JSON.parse(localStorage.getItem(OPCIONES)) || {}; o[clave] = v; localStorage.setItem(OPCIONES, JSON.stringify(o)); } catch (e) { /* sin guardar */ }
  }
  const selector = (titulo, valores, actual) => `<div class="pq-elegir" role="group" aria-label="${titulo}"><span>${titulo}:</span>` +
    valores.map((v) => `<button data-v="${v}"${v === actual ? ' class="activo"' : ''}>${v}</button>`).join('') + '</div>';
  // al tocar un número, se guarda y el juego vuelve a empezar con esa cantidad
  function alElegir(area, clave, reiniciar) {
    area.querySelector('.pq-elegir').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      guardarOpcion(clave, Number(b.dataset.v));
      reiniciar();
    });
  }

  // ================= 🧩 ROMPECABEZAS =================
  const PIEZAS = { 4: [2, 2], 6: [2, 3], 9: [3, 3], 12: [3, 4], 16: [4, 4] };
  function rompecabezas(area, nivel, ganar, aviso) {
    const elegido = PIEZAS[opcion('rompecabezas')] ? opcion('rompecabezas') : (nivel <= 2 ? 4 : nivel <= 5 ? 6 : 9);
    const [cols, filas] = PIEZAS[elegido];
    const p = pick(Juego.personajes());
    const fig = figura(p.id), W = 320, H = 440, cw = W / cols, ch = H / filas;
    const n = cols * filas;
    area.innerHTML = selector('Piezas', Object.keys(PIEZAS).map(Number), elegido) +
      `<p class="jp-consigna">Arma a <strong>${p.nombre}</strong>: lleva cada pieza a su lugar</p>` +
      '<div class="pz">' +
      `<div class="pz-tablero" id="pzT" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${filas},1fr)">` +
      `<svg class="pz-guia" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${fig}</svg>` +
      Array.from({ length: n }, (_, i) => `<div class="pz-hueco" data-i="${i}"></div>`).join('') + '</div>' +
      '<div class="pz-bandeja" id="pzB">' + mezclar([...Array(n).keys()]).map((i) =>
        `<button class="pz-pieza" data-i="${i}" style="aspect-ratio:${cw}/${ch};width:${n >= 12 ? 58 : 78}px" aria-label="Pieza"><svg viewBox="${(i % cols) * cw} ${Math.floor(i / cols) * ch} ${cw} ${ch}" preserveAspectRatio="none">${fig}</svg></button>`).join('') +
      '</div></div>';
    let puestas = 0, elegida = null, fin = false;
    function poner(pieza, hueco) {
      if (fin) return;
      if (!hueco || hueco.dataset.i !== pieza.dataset.i || hueco.firstChild) {
        sacudir(pieza); aviso('Esa pieza va en otro lugar 😊'); return;
      }
      hueco.appendChild(pieza.querySelector('svg'));
      hueco.classList.add('lleno');
      pieza.remove(); elegida = null; puestas++;
      if (puestas === n) { fin = true; area.querySelector('.pz-tablero').classList.add('listo'); setTimeout(() => ganar(`¡Armaste a ${p.nombre}! 🧩`), 700); }
    }
    area.querySelectorAll('.pz-pieza').forEach((pieza) => arrastrable(pieza,
      (x, y) => poner(pieza, bajo(x, y, '.pz-hueco')),
      () => { area.querySelectorAll('.pz-pieza').forEach((q) => q.classList.remove('elegida')); pieza.classList.add('elegida'); elegida = pieza; }));
    area.querySelector('#pzT').addEventListener('click', (e) => {
      const hueco = e.target.closest('.pz-hueco');
      if (hueco && elegida) poner(elegida, hueco);
    });
    alElegir(area, 'rompecabezas', () => { fin = true; limpiarFantasmas(); rompecabezas(area, nivel, ganar, aviso); });
    if (nivel === 1) aviso('Arrastra las piezas (o toca una pieza y después su lugar) 🧩');
    return () => { fin = true; limpiarFantasmas(); };
  }

  // ================= 🃏 MEMORIA =================
  const CARTAS = [4, 6, 8, 10, 12, 16];
  function memoria(area, nivel, ganar, aviso) {
    const elegido = CARTAS.includes(opcion('memoria')) ? opcion('memoria') : 2 * (nivel <= 2 ? 3 : nivel <= 4 ? 4 : nivel <= 7 ? 5 : 6);
    const pares = elegido / 2;
    const ids = mezclar(Juego.personajes().map((p) => p.id)).slice(0, pares);
    const cartas = mezclar(ids.concat(ids));
    area.innerHTML = selector('Cartas', CARTAS, elegido) +
      '<p class="jp-consigna">Da vuelta dos cartas y encuentra las <strong>parejas</strong></p>' +
      `<div class="mem" style="grid-template-columns:repeat(${elegido <= 4 ? 2 : elegido <= 6 ? 3 : 4},1fr)">` + cartas.map((id) =>
        `<button class="mem-carta" data-id="${id}" aria-label="Carta"><span class="mem-dorso">⭐</span><svg class="mem-cara" viewBox="22 18 276 276">${figura(id)}</svg></button>`).join('') + '</div>';
    let abiertas = [], hechas = 0, espera = null, fin = false;
    area.querySelector('.mem').addEventListener('click', (e) => {
      const c = e.target.closest('.mem-carta');
      if (!c || fin || espera || c.classList.contains('abierta')) return;
      c.classList.add('abierta');
      abiertas.push(c);
      if (abiertas.length < 2) return;
      const [a, b] = abiertas; abiertas = [];
      if (a.dataset.id === b.dataset.id) {
        a.classList.add('pareja'); b.classList.add('pareja'); hechas++;
        if (hechas === pares) { fin = true; setTimeout(() => ganar('¡Encontraste todas las parejas! 🃏'), 600); }
      } else {
        espera = setTimeout(() => { a.classList.remove('abierta'); b.classList.remove('abierta'); espera = null; }, 1000);
      }
    });
    alElegir(area, 'memoria', () => { fin = true; clearTimeout(espera); memoria(area, nivel, ganar, aviso); });
    if (nivel === 1) aviso('Toca dos cartas: si son iguales, ¡se quedan! 🃏');
    return () => { fin = true; clearTimeout(espera); };
  }

  // ================= 🎨 PINTAR =================
  // Cada dibujo: zonas para pintar (se tocan) + detalles que no se pintan.
  const DIBUJOS = [
    { n: 'la casita', z: ['<rect x="60" y="130" width="180" height="130"/>', '<path d="M40 136 L150 40 L260 136 Z"/>', '<rect x="128" y="190" width="44" height="70" rx="6"/>',
      '<rect x="80" y="160" width="36" height="36" rx="4"/>', '<rect x="184" y="160" width="36" height="36" rx="4"/>', '<rect x="196" y="56" width="24" height="46"/>', '<circle cx="262" cy="42" r="26"/>', '<rect x="10" y="260" width="280" height="30" rx="8"/>'],
      d: '<circle cx="164" cy="228" r="3.5" fill="#3a3540"/>' },
    { n: 'la flor', z: ['<circle cx="150" cy="70" r="30"/>', '<circle cx="202" cy="108" r="30"/>', '<circle cx="182" cy="166" r="30"/>', '<circle cx="118" cy="166" r="30"/>', '<circle cx="98" cy="108" r="30"/>',
      '<circle cx="150" cy="118" r="26"/>', '<rect x="143" y="190" width="14" height="60"/>', '<ellipse cx="116" cy="220" rx="28" ry="12" transform="rotate(-25 116 220)"/>', '<path d="M100 250 H200 L188 292 H112 Z"/>'], d: '' },
    { n: 'el pececito', z: ['<ellipse cx="140" cy="150" rx="90" ry="60"/>', '<path d="M224 150 L286 104 L286 196 Z"/>', '<path d="M120 94 Q150 60 180 96 Z"/>', '<path d="M120 206 Q150 240 180 204 Z"/>',
      '<path d="M130 94 Q112 150 130 206 L150 206 Q132 150 150 94 Z"/>', '<circle cx="50" cy="60" r="14"/>', '<circle cx="30" cy="100" r="9"/>'],
      d: '<circle cx="90" cy="136" r="10" fill="#3a3540"/><circle cx="86" cy="132" r="3" fill="#fff"/><path d="M62 166 Q72 176 84 168" fill="none" stroke="#3a3540" stroke-width="4" stroke-linecap="round"/>' },
    { n: 'la torta', z: ['<ellipse cx="150" cy="262" rx="130" ry="20"/>', '<rect x="54" y="170" width="192" height="84" rx="10"/>', '<rect x="54" y="120" width="192" height="50" rx="10"/>', '<path d="M50 124 Q150 94 250 124 L250 138 Q226 158 206 138 Q182 158 158 138 Q134 158 110 138 Q86 158 50 138 Z"/>',
      '<rect x="142" y="60" width="16" height="52" rx="4"/>', '<path d="M150 22 Q166 44 150 58 Q134 44 150 22 Z"/>', '<circle cx="96" cy="106" r="13"/>', '<circle cx="204" cy="106" r="13"/>'], d: '' },
    { n: 'la mariposa', z: ['<ellipse cx="96" cy="100" rx="62" ry="54"/>', '<ellipse cx="204" cy="100" rx="62" ry="54"/>', '<ellipse cx="106" cy="200" rx="46" ry="42"/>', '<ellipse cx="194" cy="200" rx="46" ry="42"/>',
      '<ellipse cx="150" cy="150" rx="16" ry="84"/>', '<circle cx="90" cy="96" r="18"/>', '<circle cx="210" cy="96" r="18"/>', '<circle cx="106" cy="204" r="14"/>', '<circle cx="194" cy="204" r="14"/>'],
      d: '<path d="M144 70 Q126 30 108 26 M156 70 Q174 30 192 26" fill="none" stroke="#3a3540" stroke-width="4" stroke-linecap="round"/>' },
    { n: 'el helado', z: ['<path d="M100 150 L200 150 L150 290 Z"/>', '<circle cx="150" cy="120" r="54"/>', '<circle cx="110" cy="90" r="40"/>', '<circle cx="190" cy="90" r="40"/>', '<circle cx="150" cy="44" r="22"/>'],
      d: '<path d="M116 180 L178 180 M126 214 L170 214 M136 246 L162 246" stroke="#3a3540" stroke-width="3"/>' },
  ];
  const PALETA = [
    '#e5412f', '#f28a2e', '#f2cf5b', '#56b04a', '#4aa3df', '#4a5fc2', '#9b6fd6', '#f28bb0', '#a8263a',
    '#f7a3a3', '#fbc58a', '#fff3a0', '#a8e0a0', '#a8d8f5', '#a3b1ec', '#d2b8f0', '#ffd1e3', '#c9961a',
    '#2f7d4a', '#3fb8b0', '#8a5a3a', '#d9a57c', '#9aa0a6', '#3a3540', '#ffffff',
  ];
  function pintar(area, nivel, ganar, aviso) {
    const dib = DIBUJOS[(nivel - 1) % DIBUJOS.length];
    let color = PALETA[rnd(8)], pintadas = 0, fin = false;
    area.innerHTML = `<p class="jp-consigna">Pinta <strong>${dib.n}</strong> con los colores que quieras</p>` +
      '<div class="pin-hoja"><svg viewBox="0 0 300 300" id="pinSvg">' +
      dib.z.map((z, i) => z.replace(/^<(\w+)/, `<$1 class="pin-zona" data-i="${i}" fill="#fff" stroke="#3a3540" stroke-width="4" stroke-linejoin="round"`)).join('') +
      `<g pointer-events="none">${dib.d}</g></svg></div>` +
      '<div class="pin-paleta">' + PALETA.map((c) => `<button class="pin-color${c === color ? ' activo' : ''}" data-c="${c}" style="--c:${c}" aria-label="Color"></button>`).join('') + '</div>';
    area.querySelector('.pin-paleta').addEventListener('click', (e) => {
      const b = e.target.closest('.pin-color');
      if (!b) return;
      color = b.dataset.c;
      area.querySelectorAll('.pin-color').forEach((x) => x.classList.toggle('activo', x === b));
    });
    area.querySelector('#pinSvg').addEventListener('pointerdown', (e) => {
      const z = e.target.closest('.pin-zona');
      if (!z || fin) return;
      if (!z.dataset.pintada) { z.dataset.pintada = '1'; pintadas++; }
      z.setAttribute('fill', color);
      z.classList.remove('pin-pop'); void z.getBoundingClientRect(); z.classList.add('pin-pop');
      if (pintadas === dib.z.length) { fin = true; setTimeout(() => ganar(`¡Qué lindo te quedó ${dib.n}! 🎨`), 900); }
    });
    if (nivel === 1) aviso('Elige un color abajo y toca una parte del dibujo 🎨');
    return () => { fin = true; };
  }

  // ================= 🔷 ENCAJA LA FORMA =================
  const FORMAS = {
    circulo: '<circle r="34"/>',
    cuadrado: '<rect x="-31" y="-31" width="62" height="62" rx="6"/>',
    triangulo: '<path d="M0 -36 L36 30 L-36 30 Z"/>',
    estrella: '<path d="M0 -38 L11 -12 L38 -12 L16 5 L24 32 L0 16 L-24 32 L-16 5 L-38 -12 L-11 -12 Z"/>',
    corazon: '<path d="M0 32 C-44 4 -34 -34 0 -16 C34 -34 44 4 0 32 Z"/>',
    rombo: '<path d="M0 -38 L30 0 L0 38 L-30 0 Z"/>',
    luna: '<path d="M10 -36 A36 36 0 1 0 10 36 A28 28 0 1 1 10 -36 Z"/>',
    hexagono: '<path d="M-18 -32 L18 -32 L36 0 L18 32 L-18 32 L-36 0 Z"/>',
  };
  const COL_FORMA = { circulo: '#e5412f', cuadrado: '#4a78c2', triangulo: '#56b04a', estrella: '#f2cf5b', corazon: '#f28bb0', rombo: '#9b6fd6', luna: '#f28a2e', hexagono: '#3fb8b0' };
  const svgForma = (f, fill) => `<svg viewBox="-42 -42 84 84"><g fill="${fill}" stroke="${fill === 'none' ? '#9a948a' : 'rgba(0,0,0,.2)'}" stroke-width="3" ${fill === 'none' ? 'stroke-dasharray="7 6"' : ''}>${FORMAS[f]}</g></svg>`;
  function formas(area, nivel, ganar, aviso) {
    const n = Math.min(6, 2 + nivel);
    const elegidas = mezclar(Object.keys(FORMAS)).slice(0, n);
    area.innerHTML = '<p class="jp-consigna">Lleva cada forma a su <strong>hueco</strong></p>' +
      '<div class="fo-huecos">' + mezclar(elegidas).map((f) => `<div class="fo-hueco" data-f="${f}">${svgForma(f, 'none')}</div>`).join('') + '</div>' +
      '<div class="fo-bandeja">' + mezclar(elegidas).map((f) => `<button class="fo-pieza" data-f="${f}" aria-label="Forma">${svgForma(f, COL_FORMA[f])}</button>`).join('') + '</div>';
    let puestas = 0, elegida = null, fin = false;
    function poner(pieza, hueco) {
      if (fin) return;
      if (!hueco || hueco.dataset.f !== pieza.dataset.f || hueco.classList.contains('lleno')) {
        sacudir(pieza); aviso('Esa forma no calza ahí, prueba en otro hueco 😊'); return;
      }
      hueco.innerHTML = svgForma(hueco.dataset.f, COL_FORMA[hueco.dataset.f]);
      hueco.classList.add('lleno');
      pieza.remove(); elegida = null; puestas++;
      if (puestas === n) { fin = true; setTimeout(() => ganar('¡Todas las formas en su lugar! 🔷'), 600); }
    }
    area.querySelectorAll('.fo-pieza').forEach((pieza) => arrastrable(pieza,
      (x, y) => poner(pieza, bajo(x, y, '.fo-hueco')),
      () => { area.querySelectorAll('.fo-pieza').forEach((q) => q.classList.remove('elegida')); pieza.classList.add('elegida'); elegida = pieza; }));
    area.querySelector('.fo-huecos').addEventListener('click', (e) => {
      const h = e.target.closest('.fo-hueco');
      if (h && elegida) poner(elegida, h);
    });
    if (nivel === 1) aviso('Arrastra cada forma a su hueco 🔷');
    return () => { fin = true; limpiarFantasmas(); };
  }

  // ================= 🌈 ENCUENTRA EL COLOR =================
  const COLORES = [
    { n: 'rojo', c: '#e5412f' }, { n: 'azul', c: '#4a78c2' }, { n: 'amarillo', c: '#f2cf5b' }, { n: 'verde', c: '#56b04a' },
    { n: 'rosado', c: '#f28bb0' }, { n: 'morado', c: '#9b6fd6' }, { n: 'naranjo', c: '#f28a2e' },
  ];
  const COSAS = [
    (c) => `<ellipse cx="0" cy="-8" rx="24" ry="30" fill="${c}"/><path d="M0 22 L-5 30 H5 Z" fill="${c}"/><path d="M0 30 Q6 44 -2 58" stroke="#888" stroke-width="2" fill="none"/><ellipse cx="-9" cy="-18" rx="6" ry="9" fill="#fff" opacity=".5"/>`,
    (c) => `<path d="M0 -32 L9 -10 L32 -10 L14 4 L20 28 L0 14 L-20 28 L-14 4 L-32 -10 L-9 -10 Z" fill="${c}"/>`,
    (c) => `<path d="M0 28 C-40 2 -30 -32 0 -14 C30 -32 40 2 0 28 Z" fill="${c}"/>`,
    (c) => `<circle r="28" fill="${c}"/><path d="M-28 0 H28 M0 -28 Q16 0 0 28" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/>`,
    (c) => [0, 72, 144, 216, 288].map((a) => `<circle cx="0" cy="-16" r="13" fill="${c}" transform="rotate(${a})"/>`).join('') + '<circle r="10" fill="#f6d26b"/>',
    (c) => `<ellipse cx="-4" cy="0" rx="26" ry="17" fill="${c}"/><path d="M20 0 L36 -14 L36 14 Z" fill="${c}"/><circle cx="-16" cy="-4" r="3.5" fill="#fff"/>`,
  ];
  function colores(area, nivel, ganar, aviso) {
    const nCol = Math.min(4, 2 + Math.floor((nivel - 1) / 2));
    const usados = mezclar(COLORES).slice(0, nCol), meta = usados[0];
    const buscar = Math.min(5, 2 + Math.floor((nivel + 1) / 2));
    const otros = Math.min(8, 3 + nivel);
    const items = [];
    for (let i = 0; i < buscar; i++) items.push({ col: meta, f: pick(COSAS) });
    for (let i = 0; i < otros; i++) items.push({ col: pick(usados.slice(1)), f: pick(COSAS) });
    const celdas = 16;
    const lugar = mezclar([...Array(celdas).keys()]).slice(0, items.length);
    area.innerHTML = `<p class="jp-consigna">Toca todo lo que sea <strong style="color:${meta.c}">${meta.n}</strong> <span class="jp-cuenta" id="coCuenta">0/${buscar}</span></p>` +
      '<div class="co-escena">' + Array.from({ length: celdas }, (_, k) => {
        const i = lugar.indexOf(k);
        if (i < 0) return '<div></div>';
        const it = items[i];
        return `<button class="co-cosa" data-si="${it.col === meta ? 1 : 0}" data-n="${it.col.n}" aria-label="Cosa ${it.col.n}"><svg viewBox="-40 -40 80 100">${it.f(it.col.c)}</svg></button>`;
      }).join('') + '</div>';
    let hechos = 0, fin = false;
    area.querySelector('.co-escena').addEventListener('click', (e) => {
      const b = e.target.closest('.co-cosa');
      if (!b || fin || b.classList.contains('bien')) return;
      if (b.dataset.si === '1') {
        b.classList.add('bien'); hechos++;
        area.querySelector('#coCuenta').textContent = hechos + '/' + buscar;
        if (hechos === buscar) { fin = true; setTimeout(() => ganar(`¡Encontraste todo lo ${meta.n}! 🌈`), 600); }
      } else { sacudir(b); aviso(`Ese es ${b.dataset.n} 😊 busca lo ${meta.n}`); }
    });
    return () => { fin = true; };
  }

  // ================= 👤 ¿DE QUIÉN ES LA SOMBRA? =================
  function sombras(area, nivel, ganar, aviso) {
    const rondas = 4, nOp = nivel <= 3 ? 3 : 4;
    const todos = Juego.personajes();
    const forma = (id) => { const p = todos.find((x) => x.id === id); return p.especie || Juego.inicial(id).peloEstilo || id; };
    let ronda = 0, fin = false;
    function nueva() {
      const meta = pick(todos);
      const ops = [meta];
      for (const c of mezclar(todos)) {
        if (ops.length >= nOp) break;
        if (ops.some((o) => forma(o.id) === forma(c.id))) continue; // sombras bien distintas
        ops.push(c);
      }
      area.innerHTML = `<p class="jp-consigna">¿De quién es esta <strong>sombra</strong>? <span class="jp-cuenta">${ronda + 1}/${rondas}</span></p>` +
        `<div class="so-sombra"><svg viewBox="0 -10 320 450">${figura(meta.id)}</svg></div>` +
        '<div class="so-ops">' + mezclar(ops).map((o) =>
          `<button class="so-op" data-id="${o.id}" aria-label="${o.nombre}"><svg viewBox="0 -10 320 450">${figura(o.id)}</svg><span>${o.nombre}</span></button>`).join('') + '</div>';
      area.querySelector('.so-ops').addEventListener('click', (e) => {
        const b = e.target.closest('.so-op');
        if (!b || fin) return;
        if (b.dataset.id !== meta.id) { sacudir(b); aviso('Mira bien la forma de la sombra 👀'); return; }
        b.classList.add('bien');
        area.querySelector('.so-sombra').classList.add('revelada');
        ronda++;
        if (ronda >= rondas) { fin = true; setTimeout(() => ganar('¡Reconociste todas las sombras! 👤'), 900); }
        else setTimeout(() => { if (!fin) nueva(); }, 1100);
      });
    }
    nueva();
    return () => { fin = true; };
  }

  return { rompecabezas, memoria, pintar, formas, colores, sombras };
})();
