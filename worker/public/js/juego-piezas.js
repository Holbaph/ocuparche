// juego-piezas.js — piezas de dibujo compartidas por el "Jugar a vestir"
// (js/juego.js): utilidades de color y las partes del cuerpo que no
// dependen de qué personaje sea (pelo de base, cara, zapatos, moño,
// collet, flor). Portado de Ojitos de Mili (js/mili.js, funciones
// reutilizables — nada de la personalización de Mili en sí, eso es de esa
// app, no de esta).

const JuegoPiezas = (function () {
  // ---------- colores ----------
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function hex(r, g, b) { return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join(''); }
  function mezclar(a, b, t) { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  function oscurecer(c, t) { return mezclar(c, '#000000', t); }
  function aclarar(c, t) { return mezclar(c, '#ffffff', t); }
  function esClaro(c) { const [r, g, b] = rgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62; }
  function contraste(c) { return esClaro(c) ? oscurecer(c, 0.3) : aclarar(c, 0.7); }

  // ---------- piezas ----------
  // Dónde se amarra el pelo, para poner ahí el moño / collet / flor.
  function amarres(estilo) {
    if (estilo === 'colitas') return [{ x: 44, y: 150, s: 0.7 }, { x: 276, y: 150, s: 0.7 }];
    if (estilo === 'cola') return [{ x: 252, y: 98, s: 0.75 }];
    if (estilo === 'tomate') return [{ x: 160, y: 66, s: 0.8 }];
    return [];
  }

  function peloAtras(ap) {
    const h = ap.peloColor;
    const casquete = `<path d="M35.6 200 A128 128 0 1 1 284.4 200 Z" fill="${h}"/>`;
    switch (ap.peloEstilo) {
      case 'melena':
        return `<path d="M30 172 A130 130 0 0 1 290 172 L292 262 Q278 278 256 268 L64 268 Q42 278 28 262 Z" fill="${h}"/>`;
      case 'largo':
        return `<path d="M30 172 A130 130 0 0 1 290 172 L298 306 Q302 342 270 340 Q246 326 232 300 L88 300 Q74 326 50 340 Q18 342 22 306 Z" fill="${h}"/>`;
      case 'colitas':
        return casquete +
          `<ellipse cx="30" cy="200" rx="22" ry="50" transform="rotate(16 30 200)" fill="${h}"/>` +
          `<ellipse cx="290" cy="200" rx="22" ry="50" transform="rotate(-16 290 200)" fill="${h}"/>`;
      case 'cola':
        return casquete + `<path d="M250 90 Q318 104 308 196 Q302 240 276 258 Q290 204 274 152 Q264 120 240 106 Z" fill="${h}"/>`;
      case 'tomate':
        return casquete + `<circle cx="160" cy="40" r="28" fill="${h}"/>`;
      default:
        return casquete;
    }
  }

  function flequillo(ap) {
    const h = ap.peloColor, o = oscurecer(h, 0.25);
    return `<path d="M42 152 A121 121 0 0 1 278 152 Q266 118 238 106 Q220 122 196 104 Q176 120 160 102 Q144 120 124 104 Q100 122 82 106 Q54 118 42 152 Z" fill="${h}"/>` +
      `<path d="M160 62 Q150 82 146 100 M120 70 Q106 88 100 104 M200 70 Q214 88 220 104" fill="none" stroke="${o}" stroke-width="2.5" stroke-linecap="round" opacity=".45"/>`;
  }

  function moño(x, y, s, c) {
    const o = oscurecer(c, 0.18);
    return `<g transform="translate(${x} ${y}) scale(${s})">` +
      `<path d="M-3 0 Q-18 -26 -32 -14 Q-38 0 -32 14 Q-18 26 -3 0 Z" fill="${c}"/>` +
      `<path d="M3 0 Q18 -26 32 -14 Q38 0 32 14 Q18 26 3 0 Z" fill="${c}"/>` +
      `<circle r="9" fill="${o}"/></g>`;
  }

  function collet(x, y, s, c) {
    const o = oscurecer(c, 0.2);
    const bolitas = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      bolitas.push({ cx: x + Math.cos(a) * 15 * s, cy: y + Math.sin(a) * 8 * s, atras: Math.sin(a) < 0 });
    }
    return bolitas.sort((a, b) => (b.atras - a.atras))
      .map((b) => `<circle cx="${b.cx.toFixed(1)}" cy="${b.cy.toFixed(1)}" r="${(7.5 * s).toFixed(1)}" fill="${c}" stroke="${o}" stroke-width="1"/>`)
      .join('');
  }

  function flor(x, y, s, c) {
    let petalos = '';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      petalos += `<circle cx="${(Math.cos(a) * 10).toFixed(1)}" cy="${(Math.sin(a) * 10).toFixed(1)}" r="8" fill="${c}"/>`;
    }
    return `<g transform="translate(${x} ${y}) scale(${s})">${petalos}<circle r="6" fill="#f6d26b"/></g>`;
  }

  // ap.rasgos = { pecas, pestanas, cejas: 'marcadas' } (para parecerse a cada personaje)
  function cara(ap) {
    const rasgos = ap.rasgos || {};
    const linea = oscurecer(ap.piel, 0.12);
    const rubor = mezclar(ap.piel, '#ee6f6f', 0.45);
    const marcadas = rasgos.cejas === 'marcadas';
    const ceja = oscurecer(ap.peloColor, marcadas ? 0.25 : 0.1);
    const gCeja = marcadas ? 7 : 4;
    const pecas = rasgos.pecas
      ? [[82, 204], [92, 198], [100, 208], [88, 214], [106, 200], [238, 204], [228, 198], [220, 208], [232, 214], [214, 200]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="${oscurecer(ap.piel, 0.3)}" opacity=".6"/>`).join('')
      : '';
    return `<circle cx="160" cy="176" r="118" fill="${ap.piel}" stroke="${linea}" stroke-width="2"/>` +
      `<ellipse cx="94" cy="212" rx="19" ry="11" fill="${rubor}" opacity="${marcadas ? '.3' : '.55'}"/>` +
      `<ellipse cx="226" cy="212" rx="19" ry="11" fill="${rubor}" opacity="${marcadas ? '.3' : '.55'}"/>` + pecas +
      `<path d="M92 130 q20 -14 40 -2" fill="none" stroke="${ceja}" stroke-width="${gCeja}" stroke-linecap="round" opacity=".75"/>` +
      `<path d="M188 128 q20 -12 40 2" fill="none" stroke="${ceja}" stroke-width="${gCeja}" stroke-linecap="round" opacity=".75"/>` +
      `<path d="M158 168 q-4 20 -10 26 q6 6 14 2" fill="none" stroke="${linea}" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M136 232 q24 22 48 0" fill="none" stroke="#c9607a" stroke-width="6" stroke-linecap="round"/>`;
  }

  function zapato(cx, ap) {
    const c = ap.zapatosColor, o = oscurecer(c, 0.25), l = aclarar(c, 0.45);
    switch (ap.zapatos) {
      case 'zapatillas':
        return `<path d="M${cx - 14} 432 L${cx - 14} 421 Q${cx - 14} 411 ${cx} 411 Q${cx + 14} 411 ${cx + 14} 421 L${cx + 14} 432 Z" fill="${c}"/>` +
          `<rect x="${cx - 15}" y="428" width="30" height="5" rx="2.5" fill="#f7f5f2" stroke="${o}" stroke-width=".8"/>` +
          `<path d="M${cx - 5} 417 L${cx + 5} 417 M${cx - 5} 421.5 L${cx + 5} 421.5" stroke="#f7f5f2" stroke-width="1.8" stroke-linecap="round"/>`;
      case 'botitas':
        return `<path d="M${cx - 12} 392 L${cx + 12} 392 L${cx + 13} 424 Q${cx + 14} 433 ${cx + 7} 433 L${cx - 7} 433 Q${cx - 14} 433 ${cx - 13} 424 Z" fill="${c}"/>` +
          `<rect x="${cx - 13.5}" y="389" width="27" height="8" rx="3.5" fill="${l}"/>` +
          `<rect x="${cx - 13}" y="430" width="26" height="3.5" rx="1.5" fill="${o}"/>`;
      case 'sandalias':
        return `<ellipse cx="${cx}" cy="428" rx="11" ry="5" fill="${ap.piel}"/>` +
          `<rect x="${cx - 13}" y="429" width="26" height="4" rx="2" fill="${o}"/>` +
          `<path d="M${cx - 10} 427 L${cx + 10} 419 M${cx - 10} 419 L${cx + 10} 427" stroke="${c}" stroke-width="3.2" stroke-linecap="round"/>`;
      default: // balerinas
        return `<path d="M${cx - 12} 433 L${cx - 12} 426 Q${cx} 419 ${cx + 12} 426 L${cx + 12} 433 Z" fill="${c}"/>` +
          `<circle cx="${cx}" cy="424" r="2.6" fill="${l}"/>`;
    }
  }

  return {
    color: { oscurecer, aclarar, mezclar, contraste },
    piezas: { peloAtras, flequillo, cara, zapato, moño, collet, flor, amarres },
  };
})();
