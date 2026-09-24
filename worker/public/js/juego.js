// juego.js — "Jugar a vestir": elegir un personaje y cambiarle la ropa, los
// zapatos, el peinado, el color de pelo, los ojos y los accesorios,
// arrastrando (o tocando) las prendas del armario. Solo plan completo.
//
// Portado de Ojitos de Mili (js/juego.js), adaptado a Ocuparche:
// - Sin el personaje "Mili" (era la propia app familiar de esa otra app) —
//   acá el guardarropa es por paciente, no por cuenta.
// - Sin la función de sacarse una foto (js/camara.js de Mili) — queda
//   pendiente si se pide más adelante.
// - Los personajes son dibujos propios, en el mismo estilo simple de
//   formas geométricas que el resto de Ocuparche, inspirados en Huntrix,
//   Frozen y Moana (no son imágenes oficiales).
// - Cada cambio se guarda solo: al instante en este dispositivo
//   (localStorage, por paciente) y, un segundo después, en el servidor
//   (configuracion.juego), así la ropa queda igual en todos los
//   dispositivos de la cuenta.
// - El tiempo de juego por día se configura en Historial → Juego de vestir
//   (configuracion.juego_minutos_dia). Se cuenta por dispositivo, por
//   paciente y por día.
//
// Reutiliza las piezas de dibujo de js/juego-piezas.js (misma geometría:
// cabeza en (160,176) de radio 118, ojos en (112,168) y (208,168), viewBox
// 0 0 320 440).

const Juego = (function () {
  const { oscurecer, aclarar, contraste } = JuegoPiezas.color;
  const P = JuegoPiezas.piezas;

  // ---------- colores ----------
  const C = {
    rosado: '#e88fae', fucsia: '#d0487e', rojo: '#d9534f', burdeo: '#8e2c48', naranjo: '#f0a04b',
    amarillo: '#f2cf5b', dorado: '#e2b64a', verde: '#6fbf73', menta: '#8fd8c4', celeste: '#7cc4ea',
    hielo: '#bfe6f5', azul: '#4a78c2', mezclilla: '#5b7fb0', mezclillaClara: '#8fb0d6', lila: '#b392d6',
    morado: '#7e57c2', blanco: '#f7f5f2', crema: '#f3e3c3', gris: '#9aa0a6', negro: '#3a3540',
    cafe: '#8a5a3a', plateado: '#c9ced6', turquesa: '#3fb8b0', azulOscuro: '#2f4a7a',
  };
  const NOMBRE_COLOR = {};
  Object.keys(C).forEach((k) => { NOMBRE_COLOR[C[k]] = k.replace(/([A-Z])/g, ' $1').toLowerCase(); });
  NOMBRE_COLOR[C.mezclilla] = 'mezclilla'; NOMBRE_COLOR[C.mezclillaClara] = 'mezclilla clara';
  NOMBRE_COLOR[C.azulOscuro] = 'azul oscuro';

  const COLORES_PELO = [
    { c: '#1f1a1c', n: 'Negro' }, { c: '#4a3222', n: 'Castaño oscuro' }, { c: '#6b4428', n: 'Castaño' },
    { c: '#a8744a', n: 'Castaño claro' }, { c: '#d9b46a', n: 'Rubio' }, { c: '#f1e6c8', n: 'Rubio platinado' },
    { c: '#b5522b', n: 'Pelirrojo' }, { c: '#8e2c48', n: 'Burdeo' }, { c: '#6a3fa0', n: 'Morado' },
    { c: '#e88fae', n: 'Rosado' }, { c: '#4a78c2', n: 'Azul' }, { c: '#8fd8c4', n: 'Menta' },
    { c: '#e8c66a', n: 'Dorado' }, { c: '#d2432f', n: 'Rojo' }, { c: '#c9432a', n: 'Cobrizo' },
  ];
  const COLORES_OJOS = [
    { c: '#8b5e3c', n: 'Café' }, { c: '#3a2a22', n: 'Café oscuro' }, { c: '#c79a3a', n: 'Ámbar' },
    { c: '#5f8a4c', n: 'Verde' }, { c: '#4f7fb5', n: 'Azul' }, { c: '#7d8a93', n: 'Gris' }, { c: '#7e57c2', n: 'Morado' },
  ];
  // g: 'f' = solo niñas, 'm' = solo niños, sin g = para los dos.
  const PEINADOS = [
    { v: 'largo', n: 'Pelo largo', g: 'f' }, { v: 'melena', n: 'Melena', g: 'f' }, { v: 'corto', n: 'Cortito' },
    { v: 'trenza', n: 'Trenza', g: 'f' }, { v: 'dos-trenzas', n: 'Dos trenzas', g: 'f' }, { v: 'cola-alta', n: 'Cola alta', g: 'f' },
    { v: 'cola', n: 'Cola al lado', g: 'f' }, { v: 'colitas', n: 'Dos colitas', g: 'f' }, { v: 'tomate', n: 'Tomate' },
    { v: 'crespo', n: 'Crespo' }, { v: 'muy-largo', n: 'Larguísimo', g: 'f' }, { v: 'cola-baja', n: 'Cola larga', g: 'f' },
    { v: 'bob', n: 'Bob', g: 'f' }, { v: 'ondas', n: 'Ondas largas', g: 'f' }, { v: 'chongos', n: 'Dos chongos', g: 'f' },
    { v: 'rulos-cortos', n: 'Rulitos' },
    { v: 'mohicano', n: 'Mohicano', g: 'm' }, { v: 'copete', n: 'Copete', g: 'm' }, { v: 'lado', n: 'Peinado de lado', g: 'm' },
    { v: 'melenita', n: 'Melenita', g: 'm' }, { v: 'rapado', n: 'Rapado', g: 'm' },
  ];
  // ¿Sirve este elemento (peinado, prenda) para este género?
  function paraGenero(g, generoItem) { return !generoItem || generoItem === g; }

  // ---------- armario: qué prendas hay y en qué colores ----------
  const TIPOS = {
    arriba: { polera: 'Polera', 'manga-larga': 'Polera manga larga', top: 'Top', poleron: 'Polerón', blusa: 'Blusa bordada', 'top-concha': 'Top de conchitas', camisa: 'Camisa', futbol: 'Camiseta de fútbol', rayas: 'Polera a rayas', tirantes: 'Polera de tirantes', sweater: 'Sweater', crop: 'Top corto',
      'heroe-rayo': 'Traje de héroe (rayo)', 'heroe-estrella': 'Traje de héroe (estrella)', 'heroe-escudo': 'Traje de héroe (escudo)', 'heroe-corazon': 'Traje de héroe (corazón)' },
    abajo: { jeans: 'Jeans', falda: 'Falda', short: 'Short', 'falda-larga': 'Falda larga', bombacho: 'Pantalón bombacho', 'cola-sirena': 'Cola de sirena', buzo: 'Buzo', bermuda: 'Bermuda', calzas: 'Calzas' },
    vestido: { vestido: 'Vestido', 'vestido-largo': 'Vestido largo', 'vestido-princesa': 'Vestido de princesa', 'vestido-tutu': 'Vestido de tutú', 'vestido-flores': 'Vestido de flores', 'vestido-verano': 'Vestido de verano', 'vestido-fiesta': 'Vestido de fiesta', overol: 'Overol de jeans' },
    encima: { chaqueta: 'Chaqueta', capa: 'Capa', chaleco: 'Chaleco', abrigo: 'Abrigo largo' },
    zapatos: { zapatillas: 'Zapatillas', botas: 'Botas', botines: 'Botines', balerinas: 'Balerinas', sandalias: 'Sandalias', mocasines: 'Mocasines', tacos: 'Zapatos de fútbol' },
    cabeza: { moño: 'Moño', collet: 'Collet', tiara: 'Tiara', flor: 'Flor', cintillo: 'Cintillo', gorro: 'Jockey', 'jockey-plano': 'Jockey plano', casco: 'Casco', corona: 'Corona', 'gorro-lana': 'Gorro de lana', sombrero: 'Sombrero', boina: 'Boina' },
    cara: { lentes: 'Lentes de sol', 'lentes-corazon': 'Lentes de corazón', 'lentes-redondos': 'Lentes redondos', antifaz: 'Antifaz de héroe' },
    cuello: { cadena: 'Cadena', collar: 'Collar de perlas', bufanda: 'Bufanda' },
    muneca: { reloj: 'Reloj', pulsera: 'Pulsera', guantes: 'Guantes' },
    orejas: { aros: 'Aros', argollas: 'Argollas' },
  };
  // Con estos, las botas van "metidas" (por encima del pantalón).
  const PANTALONES = ['jeans', 'bombacho', 'buzo', 'calzas'];
  // Cada prenda: [tipo, colores, g] — g: 'f' solo niñas, 'm' solo niños, sin g = los dos.
  const ARMARIO = {
    arriba: [
      ['polera', [C.rosado, C.blanco, C.celeste, C.amarillo, C.negro, C.rojo, C.verde]],
      ['manga-larga', [C.lila, C.rojo, C.verde, C.blanco, C.azul]],
      ['rayas', [C.celeste, C.rojo, C.negro, C.verde]],
      ['poleron', [C.lila, C.gris, C.rosado, C.celeste, C.negro, C.rojo, C.azulOscuro]],
      ['top', [C.negro, C.rojo, C.rosado, C.crema, C.morado, C.turquesa], 'f'],
      ['blusa', [C.blanco, C.rosado, C.amarillo], 'f'],
      ['top-concha', [C.morado, C.lila, C.rosado], 'f'],
      ['tirantes', [C.blanco, C.rosado, C.negro, C.celeste, C.amarillo]],
      ['sweater', [C.crema, C.rojo, C.lila, C.azul, C.gris, C.verde]],
      ['crop', [C.negro, C.rosado, C.blanco, C.turquesa], 'f'],
      ['heroe-rayo', [C.amarillo, C.rojo, C.azul, C.blanco]],
      ['heroe-estrella', [C.azul, C.rojo, C.morado, C.verde]],
      ['heroe-escudo', [C.azul, C.negro, C.rojo]],
      ['heroe-corazon', [C.rosado, C.morado, C.rojo, C.turquesa]],
      ['camisa', [C.blanco, C.celeste, C.verde, C.amarillo, C.azulOscuro, C.rojo], 'm'],
      ['futbol', [C.rojo, C.azul, C.amarillo, C.blanco, C.verde], 'm'],
    ],
    abajo: [
      ['jeans', [C.mezclilla, C.mezclillaClara, C.negro]],
      ['short', [C.negro, C.mezclilla, C.rosado, C.blanco, C.azul]],
      ['falda', [C.rosado, C.negro, C.rojo, C.celeste, C.morado], 'f'],
      ['falda-larga', [C.rojo, C.verde, C.lila, C.azul, C.turquesa], 'f'],
      ['bombacho', [C.turquesa, C.rosado, C.lila], 'f'],
      ['cola-sirena', [C.turquesa, C.verde, C.lila], 'f'],
      ['calzas', [C.negro, C.azul, C.rojo, C.morado, C.gris, C.rosado]],
      ['buzo', [C.gris, C.negro, C.azulOscuro, C.rojo], 'm'],
      ['bermuda', [C.crema, C.mezclilla, C.verde, C.negro], 'm'],
    ],
    vestido: [
      ['vestido', [C.rosado, C.amarillo, C.celeste, C.rojo], 'f'],
      ['vestido-largo', [C.hielo, C.morado, C.rosado, C.verde, C.azulOscuro], 'f'],
      ['vestido-princesa', [C.verde, C.rosado, C.amarillo, C.celeste, C.dorado, C.lila], 'f'],
      ['vestido-tutu', [C.rosado, C.lila, C.celeste, C.blanco, C.amarillo], 'f'],
      ['vestido-flores', [C.amarillo, C.celeste, C.rosado, C.menta], 'f'],
      ['vestido-verano', [C.amarillo, C.celeste, C.blanco, C.rosado], 'f'],
      ['vestido-fiesta', [C.rojo, C.negro, C.morado, C.dorado], 'f'],
      ['overol', [C.mezclilla, C.mezclillaClara, C.negro, C.rosado]],
    ],
    encima: [
      ['chaqueta', [C.negro, C.morado, C.rojo, C.mezclilla, C.verde]],
      ['capa', [C.hielo, C.rojo, C.morado, C.azul, C.negro, C.amarillo]],
      ['abrigo', [C.crema, C.negro, C.rojo, C.azulOscuro]],
      ['chaleco', [C.azulOscuro, C.naranjo, C.gris, C.verde], 'm'],
    ],
    zapatos: [
      ['zapatillas', [C.blanco, C.rosado, C.negro, C.rojo, C.azul]],
      ['botas', [C.negro, C.cafe, C.blanco]],
      ['botines', [C.cafe, C.rosado]],
      ['sandalias', [C.cafe, C.rosado]],
      ['balerinas', [C.celeste, C.negro, C.rosado, C.dorado, C.plateado, C.turquesa], 'f'],
      ['mocasines', [C.negro, C.cafe, C.azulOscuro], 'm'],
      ['tacos', [C.negro, C.rojo, C.azul, C.verde], 'm'],
    ],
    cabeza: [
      ['cintillo', [C.negro, C.rosado, C.dorado, C.celeste]],
      ['corona', [C.dorado, C.plateado, C.rosado]],
      ['gorro-lana', [C.rojo, C.azul, C.negro, C.verde, C.amarillo]],
      ['moño', [C.rosado, C.rojo, C.celeste, C.morado], 'f'],
      ['collet', [C.amarillo, C.rosado, C.lila], 'f'],
      ['tiara', [C.dorado, C.plateado], 'f'],
      ['flor', [C.rojo, C.blanco, C.rosado, C.amarillo], 'f'],
      ['gorro', [C.rojo, C.azul, C.negro, C.verde, C.amarillo, C.blanco]],
      ['jockey-plano', [C.negro, C.blanco, C.rojo, C.azul, C.morado]],
      ['sombrero', [C.crema, C.cafe, C.negro, C.rosado]],
      ['boina', [C.rojo, C.negro, C.azulOscuro, C.crema]],
      ['casco', [C.amarillo, C.blanco, C.rojo, C.azul], 'm'],
    ],
    cara: [
      ['lentes', [C.negro, C.rosado]],
      ['lentes-redondos', [C.verde, C.negro, C.rosado]],
      ['antifaz', [C.negro, C.rojo, C.azul, C.morado, C.dorado]],
      ['lentes-corazon', [C.rojo, C.rosado], 'f'],
    ],
    cuello: [
      ['cadena', [C.dorado, C.plateado]],
      ['bufanda', [C.rojo, C.azul, C.amarillo, C.negro, C.verde]],
      ['collar', [C.blanco, C.rosado, C.dorado, C.turquesa], 'f'],
    ],
    muneca: [
      ['reloj', [C.negro, C.dorado, C.plateado, C.rojo, C.azul]],
      ['pulsera', [C.rosado, C.dorado, C.turquesa, C.morado]],
      ['guantes', [C.rojo, C.negro, C.azul, C.blanco, C.amarillo]],
    ],
    orejas: [
      ['aros', [C.dorado, C.plateado, C.rosado], 'f'],
      ['argollas', [C.dorado, C.plateado, C.negro], 'f'],
    ],
  };

  // Tonos de piel y formas de cuerpo que se pueden elegir.
  const PIELES = [
    { c: '#fde6d4', n: 'Muy clara' }, { c: '#fbe3ce', n: 'Clara' }, { c: '#f1c9a5', n: 'Clara cálida' },
    { c: '#dfa77c', n: 'Media' }, { c: '#c98e64', n: 'Canela' }, { c: '#b97d52', n: 'Morena' },
    { c: '#8a5634', n: 'Morena oscura' }, { c: '#5e3a24', n: 'Oscura' },
  ];
  const CUERPOS = [
    { v: 'delgado', n: 'Delgado', e: '🧍' }, { v: 'normal', n: 'Normal', e: '🧍' }, { v: 'fuerte', n: 'Fuerte', e: '💪' },
  ];
  const ESCALA_CUERPO = { delgado: 0.86, normal: 1, fuerte: 1.16 };

  const CATEGORIAS = [
    { id: 'arriba', e: '👚', n: 'Poleras' }, { id: 'abajo', e: '👖', n: 'Jeans y faldas' },
    { id: 'vestido', e: '👗', n: 'Vestidos y overol' }, { id: 'encima', e: '🧥', n: 'Chaquetas' },
    { id: 'zapatos', e: '👟', n: 'Zapatos' }, { id: 'peinado', e: '💇', n: 'Peinado' },
    { id: 'pelo', e: '🎨', n: 'Color de pelo' }, { id: 'ojos', e: '👀', n: 'Ojos' },
    { id: 'cabeza', e: '🧢', n: 'Gorros y accesorios' }, { id: 'cara', e: '🕶️', n: 'Lentes' },
    { id: 'cuello', e: '📿', n: 'Cadenas y cuello' }, { id: 'muneca', e: '⌚', n: 'Relojes y pulseras' },
    { id: 'orejas', e: '💎', n: 'Aros' }, { id: 'cuerpo', e: '🧍', n: 'Cuerpo' }, { id: 'piel', e: '🧑', n: 'Tono de piel' },
  ];
  const PRENDAS = ['arriba', 'abajo', 'vestido', 'encima', 'zapatos', 'cabeza', 'cara', 'cuello', 'muneca', 'orejas'];

  // ---------- personajes (dibujos propios, inspirados en…) ----------
  const PERSONAJES = [
    {
      id: 'rumi', nombre: 'Rumi', grupo: 'Huntrix', piel: '#e9c3a0', ojos: '#c79a3a', peloEstilo: 'trenza', peloColor: '#6a3fa0',
      ropa: { arriba: { t: 'top', c: C.negro }, abajo: { t: 'jeans', c: C.negro }, encima: { t: 'chaqueta', c: C.morado }, zapatos: { t: 'botas', c: C.negro } },
    },
    {
      id: 'mira', nombre: 'Mira', grupo: 'Huntrix', piel: '#f0cfb0', ojos: '#3a2a22', peloEstilo: 'largo', peloColor: '#8e2c48',
      ropa: { arriba: { t: 'top', c: C.rojo }, abajo: { t: 'falda', c: C.negro }, encima: { t: 'chaqueta', c: C.negro }, zapatos: { t: 'botas', c: C.negro } },
    },
    {
      id: 'zoey', nombre: 'Zoey', grupo: 'Huntrix', piel: '#f3d2b5', ojos: '#3a2a22', peloEstilo: 'cola-alta', peloColor: '#1f1a1c',
      ropa: { arriba: { t: 'poleron', c: C.lila }, abajo: { t: 'short', c: C.negro }, zapatos: { t: 'zapatillas', c: C.blanco }, cara: { t: 'lentes-corazon', c: C.rosado } },
    },
    {
      id: 'elsa', nombre: 'Elsa', grupo: 'Frozen', piel: '#fbe6da', ojos: '#4f7fb5', peloEstilo: 'trenza', peloColor: '#f1e6c8',
      ropa: { vestido: { t: 'vestido-largo', c: C.hielo }, encima: { t: 'capa', c: C.hielo }, zapatos: { t: 'balerinas', c: C.celeste } },
    },
    {
      id: 'anna', nombre: 'Anna', grupo: 'Frozen', piel: '#fbe0cc', ojos: '#4f7fb5', peloEstilo: 'dos-trenzas', peloColor: '#b5522b',
      ropa: { vestido: { t: 'vestido-princesa', c: C.verde }, zapatos: { t: 'balerinas', c: C.negro } },
    },
    {
      id: 'moana', nombre: 'Moana', grupo: 'Moana', piel: '#a86b45', ojos: '#3a2a22', peloEstilo: 'crespo', peloColor: '#1f1a1c',
      ropa: { arriba: { t: 'top', c: C.crema }, abajo: { t: 'falda-larga', c: C.rojo }, cabeza: { t: 'flor', c: C.rojo } },
    },
    {
      id: 'rapunzel', nombre: 'Rapunzel', grupo: 'Enredados', piel: '#fbe3ce', ojos: '#5f8a4c', peloEstilo: 'muy-largo', peloColor: '#e8c66a',
      ropa: { vestido: { t: 'vestido-princesa', c: C.lila }, cabeza: { t: 'flor', c: C.rosado } },
    },
    {
      id: 'ariel', nombre: 'Ariel', grupo: 'La Sirenita', piel: '#fbe6da', ojos: '#4f7fb5', peloEstilo: 'largo', peloColor: '#d2432f',
      ropa: { arriba: { t: 'top-concha', c: C.morado }, abajo: { t: 'cola-sirena', c: C.turquesa } },
    },
    {
      id: 'bella', nombre: 'Bella', grupo: 'La Bella y la Bestia', piel: '#f6d7bd', ojos: '#8b5e3c', peloEstilo: 'largo', peloColor: '#6b4428',
      ropa: { vestido: { t: 'vestido-princesa', c: C.dorado }, zapatos: { t: 'balerinas', c: C.dorado } },
    },
    {
      id: 'cenicienta', nombre: 'Cenicienta', grupo: 'Cenicienta', piel: '#fbe6da', ojos: '#4f7fb5', peloEstilo: 'tomate', peloColor: '#e8c66a',
      ropa: { vestido: { t: 'vestido-princesa', c: C.celeste }, cabeza: { t: 'cintillo', c: C.celeste }, zapatos: { t: 'balerinas', c: C.plateado } },
    },
    {
      id: 'mirabel', nombre: 'Mirabel', grupo: 'Encanto', piel: '#b97d52', ojos: '#4a3222', peloEstilo: 'crespo', peloColor: '#1f1a1c',
      ropa: { arriba: { t: 'blusa', c: C.blanco }, abajo: { t: 'falda-larga', c: C.azul }, zapatos: { t: 'balerinas', c: C.negro }, cara: { t: 'lentes-redondos', c: C.verde } },
    },
    {
      id: 'merida', nombre: 'Mérida', grupo: 'Valiente', piel: '#fbe3ce', ojos: '#4f7fb5', peloEstilo: 'crespo', peloColor: '#c9432a',
      ropa: { vestido: { t: 'vestido-largo', c: C.azulOscuro } },
    },
    {
      id: 'tiana', nombre: 'Tiana', grupo: 'La princesa y el sapo', piel: '#8a5634', ojos: '#4a3222', peloEstilo: 'tomate', peloColor: '#1f1a1c',
      ropa: { vestido: { t: 'vestido-largo', c: C.verde }, cabeza: { t: 'tiara', c: C.dorado } },
    },
    {
      id: 'jasmine', nombre: 'Jasmine', grupo: 'Aladdín', piel: '#c98e64', ojos: '#4a3222', peloEstilo: 'cola-baja', peloColor: '#1f1a1c',
      ropa: { arriba: { t: 'top', c: C.turquesa }, abajo: { t: 'bombacho', c: C.turquesa }, cabeza: { t: 'cintillo', c: C.dorado }, zapatos: { t: 'balerinas', c: C.turquesa } },
    },
    // ---------- más pensados para niños: superhéroes, rescate, espacio ----------
    {
      id: 'max', nombre: 'Max', grupo: 'Superhéroes', piel: '#f0cfb0', ojos: '#4a3222', peloEstilo: 'corto', peloColor: '#1f1a1c',
      ropa: { arriba: { t: 'polera', c: C.rojo }, abajo: { t: 'jeans', c: C.azul }, encima: { t: 'capa', c: C.rojo }, zapatos: { t: 'zapatillas', c: C.rojo }, cara: { t: 'antifaz', c: C.azul } },
    },
    {
      id: 'nico', nombre: 'Nico', grupo: 'Superhéroes', piel: '#dfa77c', ojos: '#5f8a4c', peloEstilo: 'corto', peloColor: '#4a3222',
      ropa: { arriba: { t: 'polera', c: C.negro }, abajo: { t: 'jeans', c: C.negro }, encima: { t: 'capa', c: C.morado }, zapatos: { t: 'zapatillas', c: C.negro }, cara: { t: 'antifaz', c: C.morado } },
    },
    {
      id: 'vera', nombre: 'Vera', grupo: 'Superhéroes', piel: '#fbe0cc', ojos: '#4f7fb5', peloEstilo: 'cola-alta', peloColor: '#d2432f',
      ropa: { arriba: { t: 'polera', c: C.celeste }, abajo: { t: 'jeans', c: C.negro }, encima: { t: 'capa', c: C.celeste }, zapatos: { t: 'botas', c: C.negro }, cara: { t: 'antifaz', c: C.celeste } },
    },
    {
      id: 'dante', nombre: 'Dante', grupo: 'Superhéroes', piel: '#8a5634', ojos: '#4a3222', peloEstilo: 'corto', peloColor: '#1f1a1c',
      ropa: { arriba: { t: 'polera', c: C.amarillo }, abajo: { t: 'jeans', c: C.negro }, encima: { t: 'capa', c: C.negro }, zapatos: { t: 'botas', c: C.amarillo }, cara: { t: 'antifaz', c: C.negro } },
    },
    {
      id: 'leo', nombre: 'Leo', grupo: 'Equipo de rescate', piel: '#f1c9a5', ojos: '#4f7fb5', peloEstilo: 'corto', peloColor: '#6b4428',
      ropa: { arriba: { t: 'poleron', c: C.celeste }, abajo: { t: 'jeans', c: C.mezclilla }, zapatos: { t: 'zapatillas', c: C.celeste } },
    },
    {
      id: 'teo', nombre: 'Teo', grupo: 'Equipo de rescate', piel: '#e9c3a0', ojos: '#8b5e3c', peloEstilo: 'corto', peloColor: '#b5522b',
      ropa: { arriba: { t: 'poleron', c: C.rojo }, abajo: { t: 'jeans', c: C.negro }, zapatos: { t: 'botas', c: C.negro } },
    },
    {
      id: 'santi', nombre: 'Santi', grupo: 'Espacial', piel: '#dfa77c', ojos: '#7d8a93', peloEstilo: 'corto', peloColor: '#2b2420',
      ropa: { arriba: { t: 'manga-larga', c: C.blanco }, abajo: { t: 'jeans', c: C.gris }, encima: { t: 'chaqueta', c: C.azulOscuro }, zapatos: { t: 'botas', c: C.gris } },
    },
    {
      id: 'bruno', nombre: 'Bruno', grupo: 'Dinosaurios', piel: '#b97d52', ojos: '#5f8a4c', peloEstilo: 'crespo', peloColor: '#1f1a1c',
      ropa: { arriba: { t: 'polera', c: C.verde }, abajo: { t: 'short', c: C.mezclilla }, zapatos: { t: 'zapatillas', c: C.verde } },
    },
    // ---------- más niñas ----------
    {
      id: 'lola', nombre: 'Lola', grupo: 'Bailarinas', piel: '#f6d7bd', ojos: '#5f8a4c', peloEstilo: 'chongos', peloColor: '#6b4428',
      ropa: { vestido: { t: 'vestido-tutu', c: C.rosado }, zapatos: { t: 'balerinas', c: C.rosado } },
    },
    {
      id: 'sofi', nombre: 'Sofi', grupo: 'Colegio', piel: '#e9c3a0', ojos: '#4a3222', peloEstilo: 'bob', peloColor: '#1f1a1c',
      ropa: { arriba: { t: 'polera', c: C.blanco }, abajo: { t: 'falda', c: C.azulOscuro }, zapatos: { t: 'zapatillas', c: C.blanco } },
    },
    {
      id: 'luna', nombre: 'Luna', grupo: 'Aventureras', piel: '#c98e64', ojos: '#4a3222', peloEstilo: 'ondas', peloColor: '#8e2c48',
      ropa: { arriba: { t: 'rayas', c: C.turquesa }, abajo: { t: 'jeans', c: C.mezclilla }, zapatos: { t: 'zapatillas', c: C.amarillo }, cabeza: { t: 'flor', c: C.amarillo } },
    },
    {
      id: 'flor', nombre: 'Flor', grupo: 'Primavera', piel: '#fbe3ce', ojos: '#5f8a4c', peloEstilo: 'colitas', peloColor: '#d9b46a',
      ropa: { vestido: { t: 'vestido-flores', c: C.amarillo }, cabeza: { t: 'collet', c: C.rosado }, zapatos: { t: 'sandalias', c: C.rosado } },
    },
    {
      id: 'isa', nombre: 'Isa', grupo: 'Científicas', piel: '#dfa77c', ojos: '#7d8a93', peloEstilo: 'cola-alta', peloColor: '#2b2420',
      ropa: { arriba: { t: 'manga-larga', c: C.blanco }, abajo: { t: 'falda-larga', c: C.verde }, zapatos: { t: 'botines', c: C.cafe }, cara: { t: 'lentes-redondos', c: C.negro } },
    },
    // ---------- más niños ----------
    {
      id: 'tomas', nombre: 'Tomás', grupo: 'Fútbol', piel: '#f1c9a5', ojos: '#4a3222', peloEstilo: 'copete', peloColor: '#4a3222',
      ropa: { arriba: { t: 'futbol', c: C.rojo }, abajo: { t: 'short', c: C.blanco }, zapatos: { t: 'tacos', c: C.negro } },
    },
    {
      id: 'mateo', nombre: 'Mateo', grupo: 'Exploradores', piel: '#dfa77c', ojos: '#5f8a4c', peloEstilo: 'lado', peloColor: '#6b4428',
      ropa: { arriba: { t: 'camisa', c: C.verde }, abajo: { t: 'bermuda', c: C.crema }, zapatos: { t: 'botas', c: C.cafe }, cabeza: { t: 'gorro', c: C.verde } },
    },
    {
      id: 'sami', nombre: 'Sami', grupo: 'Skaters', piel: '#e9c3a0', ojos: '#7d8a93', peloEstilo: 'melenita', peloColor: '#a8744a',
      ropa: { arriba: { t: 'poleron', c: C.negro }, abajo: { t: 'buzo', c: C.gris }, zapatos: { t: 'zapatillas', c: C.rojo }, cabeza: { t: 'gorro-lana', c: C.azul } },
    },
    {
      id: 'joaco', nombre: 'Joaco', grupo: 'Constructores', piel: '#b97d52', ojos: '#4a3222', peloEstilo: 'rapado', peloColor: '#1f1a1c',
      ropa: { arriba: { t: 'camisa', c: C.amarillo }, abajo: { t: 'jeans', c: C.mezclilla }, encima: { t: 'chaleco', c: C.naranjo }, zapatos: { t: 'botas', c: C.cafe }, cabeza: { t: 'casco', c: C.amarillo } },
    },
    {
      id: 'kai', nombre: 'Kai', grupo: 'Rockeros', piel: '#8a5634', ojos: '#4a3222', peloEstilo: 'mohicano', peloColor: '#6a3fa0',
      ropa: { arriba: { t: 'rayas', c: C.negro }, abajo: { t: 'jeans', c: C.negro }, encima: { t: 'chaqueta', c: C.negro }, zapatos: { t: 'zapatillas', c: C.rojo } },
    },
    {
      id: 'simon', nombre: 'Simón', grupo: 'Príncipes', piel: '#fbe3ce', ojos: '#4f7fb5', peloEstilo: 'rulos-cortos', peloColor: '#d9b46a',
      ropa: { arriba: { t: 'camisa', c: C.azulOscuro }, abajo: { t: 'jeans', c: C.negro }, encima: { t: 'capa', c: C.rojo }, zapatos: { t: 'mocasines', c: C.negro }, cabeza: { t: 'corona', c: C.dorado } },
    },
    // ---------- más superhéroes: hombres y mujeres ----------
    {
      id: 'rayo', nombre: 'Rayo', grupo: 'Superhéroes', piel: '#f1c9a5', ojos: '#4a3222', peloEstilo: 'copete', peloColor: '#d9b46a',
      ropa: { arriba: { t: 'heroe-rayo', c: C.amarillo }, abajo: { t: 'calzas', c: C.rojo }, encima: { t: 'capa', c: C.rojo }, zapatos: { t: 'botas', c: C.rojo }, cara: { t: 'antifaz', c: C.rojo }, muneca: { t: 'guantes', c: C.rojo } },
    },
    {
      id: 'titan', nombre: 'Titán', grupo: 'Superhéroes', piel: '#b97d52', ojos: '#4a3222', peloEstilo: 'rapado', peloColor: '#1f1a1c', cuerpo: 'fuerte',
      ropa: { arriba: { t: 'heroe-estrella', c: C.verde }, abajo: { t: 'calzas', c: C.negro }, encima: { t: 'capa', c: C.negro }, zapatos: { t: 'botas', c: C.negro }, muneca: { t: 'guantes', c: C.negro } },
    },
    {
      id: 'capitan', nombre: 'Capitán', grupo: 'Superhéroes', piel: '#fbe3ce', ojos: '#4f7fb5', peloEstilo: 'lado', peloColor: '#d9b46a', cuerpo: 'fuerte',
      ropa: { arriba: { t: 'heroe-escudo', c: C.azul }, abajo: { t: 'calzas', c: C.azul }, zapatos: { t: 'botas', c: C.rojo }, muneca: { t: 'guantes', c: C.rojo } },
    },
    {
      id: 'kuro', nombre: 'Kuro', grupo: 'Superhéroes', piel: '#dfa77c', ojos: '#3a2a22', peloEstilo: 'rapado', peloColor: '#1f1a1c', cuerpo: 'delgado',
      ropa: { arriba: { t: 'heroe-escudo', c: C.negro }, abajo: { t: 'calzas', c: C.negro }, zapatos: { t: 'botas', c: C.negro }, cara: { t: 'antifaz', c: C.negro }, cuello: { t: 'bufanda', c: C.rojo } },
    },
    {
      id: 'halcon', nombre: 'Halcón', grupo: 'Superhéroes', piel: '#8a5634', ojos: '#4a3222', peloEstilo: 'corto', peloColor: '#1f1a1c',
      ropa: { arriba: { t: 'heroe-estrella', c: C.azul }, abajo: { t: 'calzas', c: C.gris }, encima: { t: 'capa', c: C.azul }, zapatos: { t: 'botas', c: C.blanco }, cara: { t: 'antifaz', c: C.dorado }, cuello: { t: 'cadena', c: C.dorado } },
    },
    {
      id: 'nova', nombre: 'Nova', grupo: 'Superhéroes', piel: '#fbe0cc', ojos: '#7e57c2', peloEstilo: 'cola-alta', peloColor: '#6a3fa0',
      ropa: { arriba: { t: 'heroe-corazon', c: C.morado }, abajo: { t: 'calzas', c: C.negro }, encima: { t: 'capa', c: C.morado }, zapatos: { t: 'botas', c: C.negro }, cara: { t: 'antifaz', c: C.morado }, muneca: { t: 'pulsera', c: C.dorado } },
    },
    {
      id: 'aura', nombre: 'Aura', grupo: 'Superhéroes', piel: '#f6d7bd', ojos: '#4f7fb5', peloEstilo: 'ondas', peloColor: '#e88fae',
      ropa: { arriba: { t: 'heroe-corazon', c: C.rosado }, abajo: { t: 'calzas', c: C.rosado }, encima: { t: 'capa', c: C.azul }, zapatos: { t: 'botas', c: C.blanco }, orejas: { t: 'aros', c: C.dorado } },
    },
    {
      id: 'flecha', nombre: 'Flecha', grupo: 'Superhéroes', piel: '#c98e64', ojos: '#5f8a4c', peloEstilo: 'trenza', peloColor: '#4a3222',
      ropa: { arriba: { t: 'heroe-estrella', c: C.verde }, abajo: { t: 'calzas', c: C.negro }, zapatos: { t: 'botas', c: C.cafe }, cabeza: { t: 'gorro', c: C.verde }, muneca: { t: 'guantes', c: C.verde } },
    },
    {
      id: 'mariposa', nombre: 'Mariposa', grupo: 'Superhéroes', piel: '#fbe6da', ojos: '#5f8a4c', peloEstilo: 'colitas', peloColor: '#d2432f',
      ropa: { arriba: { t: 'heroe-corazon', c: C.turquesa }, abajo: { t: 'calzas', c: C.rosado }, encima: { t: 'capa', c: C.morado }, zapatos: { t: 'botas', c: C.blanco }, cara: { t: 'antifaz', c: C.morado }, orejas: { t: 'aros', c: C.dorado } },
    },
    {
      id: 'tormenta', nombre: 'Tormenta', grupo: 'Superhéroes', piel: '#8a5634', ojos: '#4f7fb5', peloEstilo: 'muy-largo', peloColor: '#f1e6c8',
      ropa: { arriba: { t: 'heroe-rayo', c: C.blanco }, abajo: { t: 'calzas', c: C.gris }, encima: { t: 'capa', c: C.hielo }, zapatos: { t: 'botas', c: C.blanco }, cuello: { t: 'cadena', c: C.plateado } },
    },
  ];

  // Género de cada personaje: 'f' niña, 'm' niño. Filtra qué ropa y peinados
  // se le ofrecen — a un niño solo le salen cosas de niño, y viceversa.
  const HOMBRES = ['max', 'nico', 'dante', 'leo', 'teo', 'santi', 'bruno', 'tomas', 'mateo', 'sami', 'joaco', 'kai', 'simon', 'rayo', 'titan', 'capitan', 'kuro', 'halcon'];
  PERSONAJES.forEach((p) => { p.g = HOMBRES.indexOf(p.id) >= 0 ? 'm' : 'f'; });

  function personaje(id) { return PERSONAJES.find((p) => p.id === id) || PERSONAJES[0]; }

  // "En blanco": sin ropa ni accesorios, con su peinado y ojos originales.
  function enBlanco(id) {
    const p = personaje(id);
    const st = { ojos: p.ojos, peloEstilo: p.peloEstilo, peloColor: p.peloColor, piel: p.piel, cuerpo: p.cuerpo || 'normal' };
    PRENDAS.forEach((k) => { st[k] = null; });
    return st;
  }
  function inicial(id) { return { ...enBlanco(id), ...personaje(id).ropa }; }

  // Lo guardado viene del servidor (compartido entre dispositivos) y se
  // mete en el SVG: se valida todo (solo colores #rrggbb y prendas/
  // peinados conocidos).
  const HEX = /^#[0-9a-f]{6}$/i;
  function normalizar(id, raw) {
    const st = inicial(id);
    if (!raw || typeof raw !== 'object') return st;
    if (HEX.test(raw.ojos || '')) st.ojos = raw.ojos;
    if (HEX.test(raw.peloColor || '')) st.peloColor = raw.peloColor;
    if (HEX.test(raw.piel || '')) st.piel = raw.piel;
    if (CUERPOS.some((c) => c.v === raw.cuerpo)) st.cuerpo = raw.cuerpo;
    if (PEINADOS.some((p) => p.v === raw.peloEstilo)) st.peloEstilo = raw.peloEstilo;
    PRENDAS.forEach((k) => {
      const v = raw[k];
      if (v === null) st[k] = null;
      else if (v && TIPOS[k][v.t] && HEX.test(v.c || '')) st[k] = { t: v.t, c: v.c };
    });
    return st;
  }

  // ================= DIBUJO =================
  const TORSO = 'M120 284 L200 284 Q210 296 212 312 L212 350 L108 350 L108 312 Q110 296 120 284 Z';
  // Piernas del pantalón centradas sobre los pies (x 142 y 178).
  const PANTALON = 'M110 342 L210 342 L198 424 L162 424 L160 380 L158 424 L122 424 Z';

  function mangas(tipo, c) {
    if (tipo === 'corta') return `<ellipse cx="118" cy="298" rx="15" ry="13" fill="${c}"/><ellipse cx="202" cy="298" rx="15" ry="13" fill="${c}"/>`;
    if (tipo === 'globo') return `<ellipse cx="116" cy="298" rx="20" ry="16" fill="${c}"/><ellipse cx="204" cy="298" rx="20" ry="16" fill="${c}"/>`;
    if (tipo === 'larga' || tipo === 'velo') {
      const op = tipo === 'velo' ? ' opacity=".75"' : '';
      return `<g${op}><path d="M118 298 L103 354 M202 298 L217 354" stroke="${c}" stroke-width="18" stroke-linecap="round"/>` +
        `<ellipse cx="118" cy="298" rx="14" ry="12" fill="${c}"/><ellipse cx="202" cy="298" rx="14" ry="12" fill="${c}"/></g>`;
    }
    return '';
  }

  // Cada prenda devuelve { svg, manga } — la manga se dibuja encima de los brazos.
  function prenda(cat, p) {
    const c = p.c, o = oscurecer(c, 0.18), d = contraste(c);
    switch (cat + ':' + p.t) {
      case 'arriba:polera':
        return {
          svg: `<path d="${TORSO}" fill="${c}"/>` +
            `<path d="M160 306 l4 8.5 9.5 1 -7 6.5 2 9.5 -8.5 -5 -8.5 5 2 -9.5 -7 -6.5 9.5 -1z" fill="${d}"/>`,
          manga: mangas('corta', c),
        };
      case 'arriba:manga-larga':
        return { svg: `<path d="${TORSO}" fill="${c}"/><path d="M110 344 L210 344" stroke="${o}" stroke-width="4"/>`, manga: mangas('larga', c) };
      case 'arriba:top':
        return {
          svg: `<path d="M122 290 L198 290 Q206 302 208 314 L208 326 L112 326 L112 314 Q114 302 122 290 Z" fill="${c}"/>` +
            `<path d="M126 292 L122 282 M194 292 L198 282" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`,
          manga: '',
        };
      case 'arriba:poleron':
        return {
          svg: `<path d="M116 284 L204 284 Q214 296 216 314 L216 356 L104 356 L104 314 Q106 296 116 284 Z" fill="${c}"/>` +
            `<path d="M134 334 L186 334 L190 352 L130 352 Z" fill="${o}"/>` +
            `<path d="M150 292 L148 316 M170 292 L172 316" stroke="${d}" stroke-width="2.5" stroke-linecap="round"/>`,
          manga: mangas('larga', c),
        };
      case 'arriba:blusa': {
        const flores = [[136, 296, '#e8578a'], [148, 304, '#f2cf5b'], [160, 298, '#3fb8b0'], [172, 304, '#f2cf5b'], [184, 296, '#e8578a']]
          .map(([x, y, col]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${col}"/><circle cx="${x}" cy="${y}" r="1.3" fill="#fff"/>`).join('');
        return { svg: `<path d="${TORSO}" fill="${c}"/>` + flores, manga: mangas('globo', c) };
      }
      case 'arriba:top-concha': {
        const concha = (x, g) => `<path d="M${x - 15} 306 Q${x} 288 ${x + 15} 306 Q${x + 12} 320 ${x} 320 Q${x - 12} 320 ${x - 15} 306 Z" fill="${c}" transform="rotate(${g} ${x} 306)"/>` +
          `<path d="M${x} 294 L${x} 318 M${x - 8} 297 L${x - 5} 318 M${x + 8} 297 L${x + 5} 318" stroke="${o}" stroke-width="1.4" transform="rotate(${g} ${x} 306)"/>`;
        return {
          svg: `<path d="M140 296 L124 284 M180 296 L196 284" stroke="${c}" stroke-width="4" stroke-linecap="round"/>` + concha(143, -8) + concha(177, 8),
          manga: '',
        };
      }
      case 'abajo:jeans':
        return {
          svg: `<path d="${PANTALON}" fill="${c}"/>` +
            `<path d="M160 344 L160 378 M116 352 Q128 358 140 352 M180 352 Q192 358 204 352 M123 416 L157 416 M163 416 L197 416" fill="none" stroke="${aclarar(c, 0.35)}" stroke-width="1.6" stroke-dasharray="3 3"/>`,
        };
      case 'abajo:bombacho':
        return {
          svg: `<path d="M108 342 L212 342 Q230 384 204 414 L198 426 L164 426 L160 382 L156 426 L122 426 L116 414 Q90 384 108 342 Z" fill="${c}"/>` +
            `<rect x="121" y="416" width="38" height="10" rx="4" fill="${o}"/><rect x="161" y="416" width="38" height="10" rx="4" fill="${o}"/>` +
            `<path d="M108 348 L212 348" stroke="${o}" stroke-width="6"/>`,
        };
      case 'abajo:cola-sirena': {
        const escamas = [];
        for (let y = 356; y <= 404; y += 12) {
          for (let x = 122 + ((y / 12) % 2) * 8; x <= 198; x += 16) escamas.push(`M${x - 7} ${y} Q${x} ${y + 8} ${x + 7} ${y}`);
        }
        return {
          svg: `<path d="M112 342 L208 342 Q216 382 194 410 L184 420 Q214 424 230 446 Q196 440 160 430 Q124 440 90 446 Q106 424 136 420 L126 410 Q104 382 112 342 Z" fill="${c}"/>` +
            `<path d="${escamas.join(' ')}" fill="none" stroke="${aclarar(c, 0.4)}" stroke-width="1.6" opacity=".8"/>` +
            `<path d="M136 420 Q160 426 184 420" fill="none" stroke="${o}" stroke-width="3"/>`,
        };
      }
      case 'abajo:falda':
        return { svg: `<path d="M106 342 L214 342 L236 388 Q160 402 84 388 Z" fill="${c}"/><path d="M106 346 L214 346" stroke="${o}" stroke-width="5"/>` };
      case 'abajo:short':
        return { svg: `<path d="M108 340 L212 340 L214 378 L166 378 L160 362 L154 378 L106 378 Z" fill="${c}"/>` };
      case 'abajo:falda-larga':
        return {
          svg: `<path d="M106 342 L214 342 L230 416 Q160 428 90 416 Z" fill="${c}"/>` +
            `<path d="M96 396 Q160 408 224 396" fill="none" stroke="${d}" stroke-width="6"/>` +
            `<path d="M94 406 Q160 418 226 406" fill="none" stroke="${o}" stroke-width="3" stroke-dasharray="6 5"/>`,
        };
      case 'vestido:vestido':
        return {
          svg: `<path d="M122 284 L198 284 Q206 300 210 318 L236 388 Q160 404 84 388 L110 318 Q114 300 122 284 Z" fill="${c}"/>` +
            `<path d="M110 322 Q160 332 210 322" fill="none" stroke="${d}" stroke-width="7" stroke-linecap="round"/>`,
          manga: mangas('corta', c),
        };
      case 'vestido:vestido-largo': {
        const brillos = [[132, 350], [184, 364], [150, 394], [206, 402], [114, 408], [170, 414], [196, 336]]
          .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="#fff" opacity=".85"/>`).join('');
        return {
          svg: `<path d="M122 284 L198 284 Q206 300 208 318 L240 418 Q160 430 80 418 L112 318 Q114 300 122 284 Z" fill="${c}"/>` +
            `<path d="M120 300 L200 300" stroke="${aclarar(c, 0.5)}" stroke-width="3" opacity=".7"/>` + brillos,
          manga: mangas('velo', aclarar(c, 0.35)),
        };
      }
      case 'vestido:vestido-princesa':
        return {
          svg: `<path d="M112 322 L208 322 Q252 360 248 404 Q160 420 72 404 Q68 360 112 322 Z" fill="${c}"/>` +
            `<path d="M96 380 Q160 394 224 380" fill="none" stroke="${o}" stroke-width="3" opacity=".6"/>` +
            `<path d="M124 284 L196 284 L204 326 L116 326 Z" fill="${o}"/>` +
            `<path d="M140 296 L180 296 M142 306 L178 306 M144 316 L176 316" stroke="${aclarar(c, 0.6)}" stroke-width="2"/>`,
          manga: mangas('globo', c),
        };
      case 'encima:chaqueta':
        return {
          svg: `<path d="M116 286 L148 290 L144 358 L104 358 L104 314 Q106 298 116 286 Z" fill="${c}"/>` +
            `<path d="M204 286 L172 290 L176 358 L216 358 L216 314 Q214 298 204 286 Z" fill="${c}"/>` +
            `<path d="M130 288 L148 290 L138 312 Z M190 288 L172 290 L182 312 Z" fill="${o}"/>` +
            `<circle cx="206" cy="330" r="2.6" fill="${d}"/>`,
          manga: mangas('larga', c),
        };
      case 'encima:capa':
        return { atras: `<path d="M118 288 L202 288 L252 432 Q160 444 68 432 Z" fill="${c}" opacity=".88"/>`, svg: '' };

      // ---- prendas nuevas ----
      case 'arriba:camisa': {
        const botones = [312, 326, 340].map((y) => `<circle cx="160" cy="${y}" r="2.3" fill="${d}"/>`).join('');
        return {
          svg: `<path d="${TORSO}" fill="${c}"/>` +
            `<path d="M160 298 L160 350" stroke="${o}" stroke-width="1.6"/>` + botones +
            `<path d="M146 284 L160 302 L174 284 L168 281 L160 291 L152 281 Z" fill="${d}"/>`,
          manga: mangas('corta', c),
        };
      }
      case 'arriba:futbol':
        return {
          svg: `<path d="${TORSO}" fill="${c}"/>` +
            `<path d="M146 284 L160 300 L174 284" fill="none" stroke="${d}" stroke-width="4" stroke-linecap="round"/>` +
            `<text x="160" y="336" text-anchor="middle" font-size="30" font-weight="800" font-family="Baloo 2, sans-serif" fill="${d}">10</text>`,
          manga: mangas('corta', c),
        };
      case 'arriba:rayas':
        return {
          svg: `<path d="${TORSO}" fill="${c}"/>` +
            `<path d="M111 300 L209 300 M110 316 L210 316 M110 332 L210 332 M110 346 L210 346" stroke="${d}" stroke-width="5" opacity=".6"/>`,
          manga: mangas('corta', c),
        };
      case 'abajo:buzo':
        return {
          svg: `<path d="${PANTALON}" fill="${c}"/>` +
            `<path d="M110 344 L210 344" stroke="${o}" stroke-width="7"/>` +
            `<path d="M118 356 L124 414 M202 356 L196 414" stroke="${d}" stroke-width="2.5" opacity=".7"/>` +
            `<rect x="122" y="414" width="36" height="9" rx="3" fill="${o}"/><rect x="162" y="414" width="36" height="9" rx="3" fill="${o}"/>`,
        };
      case 'abajo:bermuda':
        return {
          svg: `<path d="M108 340 L212 340 L214 396 L166 396 L160 374 L154 396 L106 396 Z" fill="${c}"/>` +
            `<path d="M108 346 L212 346" stroke="${o}" stroke-width="5"/>` +
            `<path d="M112 388 L154 388 M166 388 L208 388" stroke="${o}" stroke-width="2" stroke-dasharray="3 3"/>`,
        };
      case 'vestido:vestido-tutu':
        return {
          svg: `<path d="M122 284 L198 284 Q206 300 208 320 L112 320 Q114 300 122 284 Z" fill="${c}"/>` +
            `<path d="M126 292 L122 282 M194 292 L198 282" stroke="${c}" stroke-width="5" stroke-linecap="round"/>` +
            `<path d="M100 324 L220 324 L252 376 Q160 398 68 376 Z" fill="${aclarar(c, 0.3)}" opacity=".92"/>` +
            `<path d="M108 330 L212 330 L242 378 Q160 396 78 378 Z" fill="${c}" opacity=".95"/>` +
            `<path d="M116 322 Q160 332 204 322" fill="none" stroke="${d}" stroke-width="6" stroke-linecap="round"/>` +
            `<path d="M86 370 Q160 392 234 370" fill="none" stroke="${o}" stroke-width="2" stroke-dasharray="4 4" opacity=".6"/>`,
          manga: '',
        };
      case 'vestido:vestido-flores': {
        const fl = [[136, 340, '#fff'], [176, 352, '#e8578a'], [150, 372, '#f2cf5b'], [196, 380, '#fff'], [120, 380, '#e8578a'], [166, 304, '#fff'], [140, 318, '#f2cf5b']]
          .map(([x, y, col]) => `<circle cx="${x}" cy="${y}" r="4.6" fill="${col}"/><circle cx="${x}" cy="${y}" r="1.6" fill="${o}"/>`).join('');
        return {
          svg: `<path d="M122 284 L198 284 Q206 300 210 318 L236 388 Q160 404 84 388 L110 318 Q114 300 122 284 Z" fill="${c}"/>` + fl,
          manga: mangas('corta', c),
        };
      }
      case 'encima:chaleco':
        return {
          svg: `<path d="M120 286 L150 292 L146 352 L110 352 L110 314 Q112 296 120 286 Z" fill="${c}"/>` +
            `<path d="M200 286 L170 292 L174 352 L210 352 L210 314 Q208 296 200 286 Z" fill="${c}"/>` +
            `<path d="M136 288 L150 292 L140 314 Z M184 288 L170 292 L180 314 Z" fill="${o}"/>` +
            `<circle cx="152" cy="326" r="2.4" fill="${d}"/><circle cx="152" cy="340" r="2.4" fill="${d}"/>` +
            `<path d="M116 330 L140 330 M180 330 L204 330" stroke="${o}" stroke-width="2"/>`,
          manga: '',
        };
      case 'encima:abrigo':
        return {
          svg: `<path d="M114 286 L150 290 L148 392 L98 392 L102 314 Q104 296 114 286 Z" fill="${c}"/>` +
            `<path d="M206 286 L170 290 L172 392 L222 392 L218 314 Q216 296 206 286 Z" fill="${c}"/>` +
            `<path d="M128 288 L150 290 L136 316 Z M192 288 L170 290 L184 316 Z" fill="${o}"/>` +
            `<circle cx="146" cy="330" r="2.6" fill="${d}"/><circle cx="146" cy="352" r="2.6" fill="${d}"/><circle cx="146" cy="374" r="2.6" fill="${d}"/>`,
          manga: mangas('larga', c),
        };
      case 'arriba:heroe-rayo':
      case 'arriba:heroe-estrella':
      case 'arriba:heroe-escudo':
      case 'arriba:heroe-corazon': {
        const emblema = {
          'heroe-rayo': `<path d="M168 298 L146 322 L158 322 L152 340 L178 316 L164 316 Z" fill="${d}"/>`,
          'heroe-estrella': `<path d="M160 298 l6.5 13.5 14.5 2 -10.5 10 2.5 14.5 -13 -7 -13 7 2.5 -14.5 -10.5 -10 14.5 -2z" fill="${d}"/>`,
          'heroe-escudo': `<path d="M140 300 L180 300 L180 318 Q180 332 160 340 Q140 332 140 318 Z" fill="${d}"/><path d="M160 306 L160 334" stroke="${o}" stroke-width="3"/>`,
          'heroe-corazon': `<path d="M160 338 L138 316 A11 11 0 0 1 160 308 A11 11 0 0 1 182 316 Z" fill="${d}"/>`,
        }[p.t];
        return {
          svg: `<path d="${TORSO}" fill="${c}"/>` + emblema +
            `<rect x="108" y="342" width="104" height="8" fill="${o}"/><rect x="153" y="340" width="14" height="12" rx="2" fill="${d}"/>`,
          manga: mangas('larga', c),
        };
      }
      case 'arriba:tirantes':
        return {
          svg: `<path d="M120 292 L200 292 Q210 300 212 312 L212 350 L108 350 L108 312 Q110 300 120 292 Z" fill="${c}"/>` +
            `<path d="M136 294 L134 280 M184 294 L186 280" stroke="${c}" stroke-width="8" stroke-linecap="round"/>`,
          manga: '',
        };
      case 'arriba:sweater':
        return {
          svg: `<path d="${TORSO}" fill="${c}"/><rect x="108" y="342" width="104" height="8" fill="${o}"/>` +
            `<path d="M148 284 Q160 298 172 284" fill="none" stroke="${o}" stroke-width="5" stroke-linecap="round"/>` +
            `<path d="M124 300 L124 336 M196 300 L196 336" stroke="${o}" stroke-width="2" opacity=".35"/>`,
          manga: mangas('larga', c),
        };
      case 'arriba:crop':
        return {
          svg: `<path d="M124 290 L196 290 Q204 300 206 308 L206 322 L114 322 L114 308 Q116 300 124 290 Z" fill="${c}"/>` +
            `<path d="M128 292 L124 282 M192 292 L196 282" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`,
          manga: mangas('corta', c),
        };
      case 'abajo:calzas':
        return {
          svg: `<path d="${PANTALON}" fill="${c}"/><path d="M160 344 L160 380" stroke="${o}" stroke-width="2"/>` +
            `<path d="M110 344 L210 344" stroke="${o}" stroke-width="5"/>`,
        };
      case 'vestido:vestido-verano':
        return {
          svg: `<path d="M124 290 L196 290 Q204 304 208 320 L232 394 Q160 410 88 394 L112 320 Q116 304 124 290 Z" fill="${c}"/>` +
            `<path d="M138 292 L136 280 M182 292 L184 280" stroke="${c}" stroke-width="6" stroke-linecap="round"/>` +
            `<path d="M114 332 Q160 344 206 332" fill="none" stroke="${aclarar(c, 0.55)}" stroke-width="6"/>` +
            `<circle cx="140" cy="366" r="3.4" fill="#fff" opacity=".8"/><circle cx="176" cy="378" r="3.4" fill="#fff" opacity=".8"/><circle cx="196" cy="360" r="3.4" fill="#fff" opacity=".8"/>`,
          manga: '',
        };
      case 'vestido:vestido-fiesta': {
        const lentejuelas = [[132, 330], [150, 348], [176, 336], [196, 352], [120, 356], [166, 362], [206, 340]]
          .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#fff" opacity=".85"/>`).join('');
        return {
          svg: `<path d="M122 284 L198 284 Q206 300 210 318 L240 372 Q160 388 80 372 L110 318 Q114 300 122 284 Z" fill="${c}"/>` +
            `<path d="M110 322 Q160 334 210 322" fill="none" stroke="${d}" stroke-width="6" stroke-linecap="round"/>` + lentejuelas,
          manga: mangas('corta', c),
        };
      }
      case 'vestido:overol':
        return {
          svg: `<path d="${TORSO}" fill="#f4f1ee"/><path d="${PANTALON}" fill="${c}"/>` +
            `<rect x="130" y="304" width="60" height="44" rx="5" fill="${c}"/>` +
            `<path d="M138 306 L124 284 M182 306 L196 284" stroke="${c}" stroke-width="8" stroke-linecap="round"/>` +
            `<circle cx="140" cy="312" r="3" fill="${o}"/><circle cx="180" cy="312" r="3" fill="${o}"/>` +
            `<rect x="146" y="322" width="28" height="14" rx="3" fill="${o}" opacity=".5"/>` +
            `<path d="M160 350 L160 378" stroke="${o}" stroke-width="1.6"/>`,
          manga: mangas('corta', '#f4f1ee'),
        };
      default:
        return { svg: '' };
    }
  }

  // Joyas y detalles que van sobre el cuerpo: cadenas, relojes, aros…
  function joya(cat, acc) {
    if (!acc) return '';
    const c = acc.c, o = oscurecer(c, 0.3), l = aclarar(c, 0.5);
    if (cat === 'cuello') {
      if (acc.t === 'cadena') {
        return `<path d="M130 290 Q160 332 190 290" fill="none" stroke="${c}" stroke-width="4.5" stroke-dasharray="7 3" stroke-linecap="round"/>` +
          `<circle cx="160" cy="324" r="8" fill="${c}" stroke="${o}" stroke-width="1.5"/><circle cx="160" cy="324" r="3" fill="${l}"/>`;
      }
      if (acc.t === 'collar') {
        let perlas = '';
        for (let i = 0; i <= 10; i++) {
          const t = i / 10, u = 1 - t;
          perlas += `<circle cx="${(u * u * 128 + 2 * t * u * 160 + t * t * 192).toFixed(1)}" cy="${(u * u * 290 + 2 * t * u * 336 + t * t * 290).toFixed(1)}" r="4.6" fill="${c}" stroke="${o}" stroke-width="1"/>`;
        }
        return perlas;
      }
      if (acc.t === 'bufanda') {
        return `<path d="M112 288 Q160 316 208 288 L210 306 Q160 334 110 306 Z" fill="${c}"/>` +
          `<path d="M176 316 L186 362 L166 366 L160 320 Z" fill="${o}"/>` +
          `<path d="M118 296 Q160 322 202 296" fill="none" stroke="${l}" stroke-width="2" stroke-dasharray="4 4" opacity=".7"/>`;
      }
    }
    if (cat === 'muneca') {
      if (acc.t === 'reloj') {
        return `<rect x="91" y="349" width="20" height="13" rx="3" fill="#2a2740"/>` +
          `<circle cx="101" cy="355.5" r="6.4" fill="${c}" stroke="${o}" stroke-width="1.4"/><circle cx="101" cy="355.5" r="4" fill="#fff"/>` +
          `<path d="M101 355.5 L101 352.5 M101 355.5 L103.6 357" stroke="#2a2740" stroke-width="1.2" stroke-linecap="round"/>`;
      }
      if (acc.t === 'pulsera') {
        return `<rect x="91" y="352" width="20" height="6.5" rx="3.2" fill="${c}" stroke="${o}" stroke-width="1"/>` +
          `<rect x="209" y="352" width="20" height="6.5" rx="3.2" fill="${c}" stroke="${o}" stroke-width="1"/>`;
      }
      if (acc.t === 'guantes') {
        return `<circle cx="101" cy="366" r="12" fill="${c}"/><circle cx="219" cy="366" r="12" fill="${c}"/>` +
          `<rect x="90" y="350" width="22" height="9" rx="3.5" fill="${o}"/><rect x="208" y="350" width="22" height="9" rx="3.5" fill="${o}"/>`;
      }
    }
    if (cat === 'orejas') {
      if (acc.t === 'aros') {
        return [46, 274].map((x) => `<circle cx="${x}" cy="206" r="5" fill="${c}" stroke="${o}" stroke-width="1"/><path d="M${x} 211 L${x} 220" stroke="${c}" stroke-width="2"/><circle cx="${x}" cy="224" r="4.2" fill="${l}" stroke="${c}" stroke-width="1.4"/>`).join('');
      }
      if (acc.t === 'argollas') {
        return [46, 274].map((x) => `<circle cx="${x}" cy="216" r="10" fill="none" stroke="${c}" stroke-width="3.4"/>`).join('');
      }
    }
    return '';
  }

  // metidas = botas sobre un pantalón: caña más ancha, que tapa la basta.
  function zapatos(z, piel, metidas) {
    if (!z) return `<ellipse cx="142" cy="429" rx="10" ry="5" fill="${piel}"/><ellipse cx="178" cy="429" rx="10" ry="5" fill="${piel}"/>`;
    if (z.t === 'botas') {
      const o = oscurecer(z.c, 0.25), l = aclarar(z.c, 0.18);
      if (metidas) {
        return [[117, 158.5, 130, 154], [161.5, 203, 166, 190]].map(([x1, x2, p1, p2]) =>
          `<path d="M${x1} 398 L${x2} 398 L${p2 + 1} 424 Q${p2 + 2} 433 ${p2 - 5} 433 L${p1 + 5} 433 Q${p1 - 2} 433 ${p1 - 1} 424 Z" fill="${z.c}"/>` +
          `<rect x="${x1 - 1}" y="394" width="${x2 - x1 + 2}" height="8" rx="3.5" fill="${l}"/>` +
          `<rect x="${p1 - 1}" y="430" width="${p2 - p1 + 2}" height="3.5" rx="1.5" fill="${o}"/>`
        ).join('');
      }
      return [142, 178].map((cx) =>
        `<path d="M${cx - 12} 384 L${cx + 12} 384 L${cx + 13} 424 Q${cx + 14} 433 ${cx + 7} 433 L${cx - 7} 433 Q${cx - 14} 433 ${cx - 13} 424 Z" fill="${z.c}"/>` +
        `<rect x="${cx - 13.5}" y="381" width="27" height="8" rx="3.5" fill="${l}"/>` +
        `<rect x="${cx - 13}" y="430" width="26" height="3.5" rx="1.5" fill="${o}"/>`
      ).join('');
    }
    if (z.t === 'mocasines') {
      const o = oscurecer(z.c, 0.25);
      return [142, 178].map((cx) =>
        `<path d="M${cx - 13} 433 L${cx - 13} 420 Q${cx} 411 ${cx + 13} 420 L${cx + 13} 433 Z" fill="${z.c}"/>` +
        `<rect x="${cx - 14}" y="430" width="28" height="4" rx="2" fill="${o}"/>` +
        `<path d="M${cx - 6} 421 Q${cx} 417 ${cx + 6} 421" fill="none" stroke="${o}" stroke-width="2"/>`
      ).join('');
    }
    if (z.t === 'tacos') {
      const o = oscurecer(z.c, 0.3);
      return [142, 178].map((cx) =>
        `<path d="M${cx - 14} 431 L${cx - 14} 420 Q${cx - 14} 410 ${cx} 410 Q${cx + 14} 410 ${cx + 14} 420 L${cx + 14} 431 Z" fill="${z.c}"/>` +
        `<rect x="${cx - 15}" y="428" width="30" height="5" rx="2" fill="#2a2740"/>` +
        `<rect x="${cx - 12}" y="432" width="5" height="4" fill="#2a2740"/><rect x="${cx + 7}" y="432" width="5" height="4" fill="#2a2740"/>` +
        `<path d="M${cx - 6} 416 L${cx + 6} 416 M${cx - 6} 421 L${cx + 6} 421" stroke="${o}" stroke-width="1.8" stroke-linecap="round"/>`
      ).join('');
    }
    const ap = { zapatos: z.t === 'botines' ? 'botitas' : z.t, zapatosColor: z.c, piel };
    return P.zapato(142, ap) + P.zapato(178, ap);
  }

  // Peinados que no están en el set base: trenzas, cola alta y crespo.
  function peloAtras(st) {
    const h = st.peloColor;
    if (st.peloEstilo === 'crespo') {
      let s = `<path d="M24 190 A136 136 0 0 1 296 190 L296 316 Q160 350 24 316 Z" fill="${h}"/>`;
      for (let a = -25; a <= 205; a += 23) {
        const r = (a * Math.PI) / 180;
        s += `<circle cx="${(160 + 146 * Math.cos(r)).toFixed(1)}" cy="${(196 - 150 * Math.sin(r)).toFixed(1)}" r="30" fill="${h}"/>`;
      }
      [[36, 300], [284, 300], [60, 330], [260, 330]].forEach(([x, y]) => { s += `<circle cx="${x}" cy="${y}" r="28" fill="${h}"/>`; });
      return s;
    }
    if (st.peloEstilo === 'muy-largo') {
      const o = oscurecer(h, 0.18);
      return `<path d="M30 172 A130 130 0 0 1 290 172 L300 330 Q308 414 274 438 L46 438 Q12 414 20 330 Z" fill="${h}"/>` +
        `<path d="M36 250 Q30 330 50 420 M284 250 Q290 330 270 420" fill="none" stroke="${o}" stroke-width="3" opacity=".5"/>`;
    }
    if (st.peloEstilo === 'cola-baja') {
      const o = oscurecer(h, 0.3);
      return `<path d="M35.6 200 A128 128 0 1 1 284.4 200 Z" fill="${h}"/>` +
        `<path d="M250 196 Q302 236 296 312 Q292 372 270 424 Q256 364 250 304 Q244 252 232 214 Z" fill="${h}"/>` +
        [260, 318, 376].map((y, i) => `<ellipse cx="${277 - i * 3}" cy="${y}" rx="${12 - i * 2}" ry="4" fill="${o}"/>`).join('');
    }
    if (st.peloEstilo === 'cola-alta') {
      return `<path d="M35.6 200 A128 128 0 1 1 284.4 200 Z" fill="${h}"/>` +
        `<path d="M176 52 Q252 18 294 90 Q320 162 290 254 Q282 182 258 132 Q234 92 190 82 Z" fill="${h}"/>`;
    }
    const casquete = `<path d="M35.6 200 A128 128 0 1 1 284.4 200 Z" fill="${h}"/>`;
    if (st.peloEstilo === 'bob') {
      return `<path d="M30 172 A130 130 0 0 1 290 172 L290 234 Q286 254 262 252 L58 252 Q34 254 30 234 Z" fill="${h}"/>`;
    }
    if (st.peloEstilo === 'ondas') {
      const o = oscurecer(h, 0.18);
      return `<path d="M30 172 A130 130 0 0 1 290 172 L298 252 Q282 274 298 298 Q306 324 284 344 Q268 314 250 302 L70 302 Q52 314 36 344 Q14 324 22 298 Q38 274 22 252 Z" fill="${h}"/>` +
        `<path d="M40 250 Q34 290 46 330 M280 250 Q286 290 274 330" fill="none" stroke="${o}" stroke-width="3" opacity=".45"/>`;
    }
    if (st.peloEstilo === 'chongos') {
      return casquete + `<circle cx="80" cy="72" r="30" fill="${h}"/><circle cx="240" cy="72" r="30" fill="${h}"/>`;
    }
    if (st.peloEstilo === 'rulos-cortos') {
      let s = casquete;
      for (let a = -10; a <= 190; a += 20) {
        const r = (a * Math.PI) / 180;
        s += `<circle cx="${(160 + 124 * Math.cos(r)).toFixed(1)}" cy="${(184 - 124 * Math.sin(r)).toFixed(1)}" r="22" fill="${h}"/>`;
      }
      return s + `<circle cx="160" cy="70" r="40" fill="${h}"/>`;
    }
    if (st.peloEstilo === 'mohicano') {
      return `<path d="M35.6 200 A128 128 0 1 1 284.4 200 Z" fill="${h}" opacity=".3"/>` +
        `<path d="M126 92 L134 22 L148 70 L160 8 L172 70 L186 22 L194 92 Z" fill="${h}"/>`;
    }
    if (st.peloEstilo === 'copete') {
      return casquete + `<path d="M96 116 Q104 40 176 34 Q244 36 250 108 Q214 74 160 80 Q118 84 96 116 Z" fill="${h}"/>` +
        `<ellipse cx="190" cy="48" rx="56" ry="24" transform="rotate(-14 190 48)" fill="${h}"/>`;
    }
    if (st.peloEstilo === 'lado') {
      return casquete + `<path d="M46 126 Q120 20 262 96 Q274 112 276 132 Q220 78 160 84 Q96 88 46 126 Z" fill="${h}"/>`;
    }
    if (st.peloEstilo === 'melenita') {
      return casquete + `<path d="M36 172 L26 246 Q46 236 62 246 L70 178 Z" fill="${h}"/><path d="M284 172 L294 246 Q274 236 258 246 L250 178 Z" fill="${h}"/>`;
    }
    if (st.peloEstilo === 'rapado') {
      return `<path d="M35.6 200 A128 128 0 1 1 284.4 200 Z" fill="${h}" opacity=".32"/>`;
    }
    return P.peloAtras({ peloEstilo: st.peloEstilo, peloColor: h });
  }

  // El flequillo de adelante no va con el mohicano ni con la cabeza rapada.
  function flequilloDe(st, ap) {
    if (st.peloEstilo === 'mohicano' || st.peloEstilo === 'rapado') return '';
    return P.flequillo(ap);
  }

  function trenza(x0, dx, largo, grosor, h) {
    const o = oscurecer(h, 0.2);
    let s = '';
    for (let i = 0; i < largo; i++) {
      const cx = x0 + dx * i, cy = 216 + i * 22, rx = grosor - i * 0.8;
      s += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="14" transform="rotate(${i % 2 ? 22 : -22} ${cx} ${cy})" fill="${h}" stroke="${o}" stroke-width="1.2"/>`;
    }
    const fx = x0 + dx * largo, fy = 216 + largo * 22 - 4;
    return s + `<path d="M${fx - 7} ${fy} Q${fx} ${fy + 26} ${fx + 7} ${fy} Z" fill="${h}"/>` +
      `<ellipse cx="${fx}" cy="${fy - 2}" rx="7" ry="4.5" fill="${o}"/>`;
  }

  // Lo que cae por delante del cuerpo (las trenzas).
  function peloDelante(st) {
    if (st.peloEstilo === 'trenza') return trenza(274, -3, 7, 18, st.peloColor);
    if (st.peloEstilo === 'dos-trenzas') return trenza(46, 2.5, 6, 15, st.peloColor) + trenza(274, -2.5, 6, 15, st.peloColor);
    return '';
  }

  function amarres(estilo) {
    if (estilo === 'cola-alta') return [{ x: 190, y: 66, s: 0.75 }];
    if (estilo === 'cola-baja') return [{ x: 250, y: 206, s: 0.6 }];
    if (estilo === 'trenza') return [{ x: 272, y: 206, s: 0.6 }];
    if (estilo === 'dos-trenzas') return [{ x: 48, y: 206, s: 0.55 }, { x: 272, y: 206, s: 0.55 }];
    if (estilo === 'chongos') return [{ x: 80, y: 74, s: 0.7 }, { x: 240, y: 74, s: 0.7 }];
    return P.amarres(estilo);
  }

  function cabeza(acc, st) {
    if (!acc) return '';
    const c = acc.c, puntos = amarres(st.peloEstilo);
    switch (acc.t) {
      case 'moño': return puntos.length ? puntos.map((p) => P.moño(p.x, p.y, p.s, c)).join('') : P.moño(160, 46, 1, c);
      case 'collet':
        if (puntos.length) return puntos.map((p) => P.collet(p.x, p.y, p.s + 0.2, c)).join('');
        return `<path d="M160 54 Q138 22 148 10 Q157 28 160 30 Q163 28 172 10 Q182 22 160 54 Z" fill="${st.peloColor}"/>` + P.collet(160, 52, 1, c);
      case 'flor': return puntos.length ? puntos.map((p) => P.flor(p.x, p.y, p.s, c)).join('') : P.flor(222, 72, 1, c);
      case 'cintillo': return `<path d="M42 140 A124 124 0 0 1 278 140" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"/>`;
      case 'gorro':
        return `<path d="M72 118 Q72 44 160 38 Q248 44 248 118 Z" fill="${c}"/>` +
          `<ellipse cx="160" cy="120" rx="96" ry="13" fill="${oscurecer(c, 0.25)}"/>` +
          `<circle cx="160" cy="40" r="6" fill="${oscurecer(c, 0.25)}"/>` +
          `<path d="M160 40 L160 116" stroke="${oscurecer(c, 0.15)}" stroke-width="2" opacity=".6"/>`;
      case 'jockey-plano':
        return `<path d="M74 116 Q74 50 160 46 Q246 50 246 116 Z" fill="${c}"/>` +
          `<path d="M52 114 Q160 98 268 114 L276 128 Q160 114 44 128 Z" fill="${oscurecer(c, 0.25)}"/>` +
          `<circle cx="160" cy="48" r="5" fill="${oscurecer(c, 0.25)}"/><path d="M160 50 L160 106" stroke="${oscurecer(c, 0.15)}" stroke-width="2" opacity=".5"/>`;
      case 'sombrero':
        return `<ellipse cx="160" cy="100" rx="136" ry="22" fill="${c}"/>` +
          `<path d="M94 100 Q98 30 160 26 Q222 30 226 100 Z" fill="${c}"/>` +
          `<rect x="94" y="80" width="132" height="14" fill="${oscurecer(c, 0.3)}"/>`;
      case 'boina':
        return `<ellipse cx="150" cy="66" rx="90" ry="34" transform="rotate(-8 150 66)" fill="${c}"/>` +
          `<ellipse cx="150" cy="66" rx="90" ry="34" transform="rotate(-8 150 66)" fill="none" stroke="${oscurecer(c, 0.2)}" stroke-width="2"/>` +
          `<circle cx="164" cy="30" r="6" fill="${oscurecer(c, 0.25)}"/>`;
      case 'casco':
        return `<path d="M62 124 Q62 36 160 32 Q258 36 258 124 Z" fill="${c}"/>` +
          `<rect x="50" y="116" width="220" height="15" rx="7" fill="${oscurecer(c, 0.25)}"/>` +
          `<path d="M160 33 L160 116 M132 40 L134 116 M188 40 L186 116" stroke="${aclarar(c, 0.35)}" stroke-width="5" opacity=".6"/>`;
      case 'corona':
        return `<path d="M108 76 L116 36 L138 58 L160 26 L182 58 L204 36 L212 76 Q160 66 108 76 Z" fill="${c}" stroke="${oscurecer(c, 0.25)}" stroke-width="2"/>` +
          `<circle cx="160" cy="52" r="5" fill="#e8578a"/><circle cx="124" cy="60" r="3.5" fill="#7cc4ea"/><circle cx="196" cy="60" r="3.5" fill="#7cc4ea"/>`;
      case 'gorro-lana':
        return `<path d="M74 112 Q74 46 160 40 Q246 46 246 112 Z" fill="${c}"/>` +
          `<rect x="68" y="98" width="184" height="24" rx="11" fill="${oscurecer(c, 0.2)}"/>` +
          `<path d="M84 100 L84 120 M104 100 L104 120 M124 100 L124 120 M144 100 L144 120 M164 100 L164 120 M184 100 L184 120 M204 100 L204 120 M224 100 L224 120" stroke="${oscurecer(c, 0.35)}" stroke-width="2" opacity=".5"/>` +
          `<circle cx="160" cy="38" r="15" fill="${aclarar(c, 0.35)}"/>`;
      case 'tiara':
        return `<path d="M118 76 L126 46 L142 64 L160 34 L178 64 L194 46 L202 76 Q160 66 118 76 Z" fill="${c}" stroke="${oscurecer(c, 0.25)}" stroke-width="1.5"/>` +
          `<circle cx="160" cy="54" r="4.5" fill="#e8578a"/><circle cx="127" cy="60" r="3" fill="#7cc4ea"/><circle cx="193" cy="60" r="3" fill="#7cc4ea"/>`;
      default: return '';
    }
  }

  function cara(acc) {
    if (!acc) return '';
    const c = acc.c, o = oscurecer(c, 0.3);
    const patillas = `<path d="M82 158 L46 148 M238 158 L274 148" stroke="${o}" stroke-width="4" stroke-linecap="round"/>`;
    if (acc.t === 'lentes-redondos') {
      return patillas +
        `<circle cx="112" cy="168" r="31" fill="#fff" fill-opacity=".12" stroke="${c}" stroke-width="5"/>` +
        `<circle cx="208" cy="168" r="31" fill="#fff" fill-opacity=".12" stroke="${c}" stroke-width="5"/>` +
        `<path d="M143 164 Q160 154 177 164" fill="none" stroke="${c}" stroke-width="5"/>`;
    }
    if (acc.t === 'lentes-corazon') {
      const corazon = (x, y) => `<path d="M${x} ${y + 18} L${x - 24} ${y - 4} A12 12 0 0 1 ${x} ${y - 14} A12 12 0 0 1 ${x + 24} ${y - 4} Z" fill="${c}" opacity=".92" stroke="${o}" stroke-width="2.5" stroke-linejoin="round"/>`;
      return patillas + corazon(112, 168) + corazon(208, 168) +
        `<path d="M136 160 Q160 152 184 160" fill="none" stroke="${o}" stroke-width="4"/>`;
    }
    if (acc.t === 'antifaz') {
      // el clásico antifaz de superhéroe: una sola pieza que cubre los dos
      // ojos con un hueco en el puente de la nariz, amarrado atrás.
      return `<path d="M70 138 Q92 128 118 140 Q128 146 140 140 L148 150 Q160 156 172 150 L180 140 Q192 146 202 140 Q228 128 250 138 Q244 168 214 172 Q186 176 168 158 Q160 152 152 158 Q134 176 106 172 Q76 168 70 138 Z" fill="${c}" opacity=".95" stroke="${o}" stroke-width="2"/>` +
        `<path d="M60 140 Q40 130 34 112 M260 140 Q280 130 286 112" stroke="${o}" stroke-width="4" stroke-linecap="round" opacity=".85"/>`;
    }
    return patillas +
      `<rect x="80" y="146" width="64" height="44" rx="18" fill="${c}" opacity=".94" stroke="${o}" stroke-width="3"/>` +
      `<rect x="176" y="146" width="64" height="44" rx="18" fill="${c}" opacity=".94" stroke="${o}" stroke-width="3"/>` +
      `<path d="M144 160 Q160 152 176 160" fill="none" stroke="${o}" stroke-width="4"/>` +
      `<path d="M92 156 L104 152 M188 156 L200 152" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>`;
  }

  function ojos(color) {
    return [112, 208].map((x) =>
      `<circle cx="${x}" cy="168" r="27" fill="#fff"/><circle cx="${x}" cy="168" r="13" fill="${color}"/>` +
      `<circle cx="${x}" cy="168" r="5.5" fill="#2a2740"/><circle cx="${x - 5}" cy="163" r="3" fill="#fff"/>`
    ).join('');
  }

  function figura(id, st) {
    const piel = st.piel || personaje(id).piel;
    const ap = { piel, peloColor: st.peloColor };
    const partes = {};
    ['vestido', 'arriba', 'abajo', 'encima'].forEach((k) => { if (st[k]) partes[k] = prenda(k, st[k]); });

    // Piernas y zapatos van debajo de la ropa (así la falda o el vestido tapan
    // la caña de las botas). Solo con pantalón las botas van "metidas", encima.
    // La cola de sirena tapa piernas y pies.
    const abajo = partes.vestido ? null : st.abajo;
    const esOverol = !!st.vestido && st.vestido.t === 'overol';
    const sirena = !!abajo && abajo.t === 'cola-sirena';
    const conPantalon = (!!abajo && PANTALONES.includes(abajo.t)) || esOverol;
    const botasMetidas = conPantalon && !!st.zapatos && st.zapatos.t === 'botas';

    // ---- el cuerpo (se ensancha o se afina según la forma elegida) ----
    let c = '';
    if (partes.encima && partes.encima.atras) c += partes.encima.atras;
    c += `<rect x="146" y="264" width="28" height="44" rx="12" fill="${piel}"/>`; // cuello
    if (!sirena) {
      // piernas con forma (más anchas arriba, más finas abajo)
      c += `<path d="M128 362 L153 362 Q152 398 149 430 L137 430 Q130 398 128 362 Z" fill="${piel}"/>` +
        `<path d="M167 362 L192 362 Q190 398 183 430 L171 430 Q168 398 167 362 Z" fill="${piel}"/>`;
      if (!botasMetidas) c += zapatos(st.zapatos, piel);
    }
    c += `<path d="${TORSO}" fill="${piel}"/>`;

    // ropa (o la ropa interior blanca si no tiene nada puesto)
    const blanco = '#f4f1ee';
    if (partes.vestido) c += partes.vestido.svg;
    else {
      c += partes.abajo ? partes.abajo.svg : `<path d="M110 338 L210 338 L210 362 L166 362 L160 356 L154 362 L110 362 Z" fill="${blanco}"/>`;
      c += partes.arriba ? partes.arriba.svg
        : `<path d="M126 292 L194 292 L200 342 L120 342 Z" fill="${blanco}"/><path d="M130 294 L126 284 M190 294 L194 284" stroke="${blanco}" stroke-width="5" stroke-linecap="round"/>`;
    }
    if (botasMetidas) c += zapatos(st.zapatos, piel, true);
    if (partes.encima) c += partes.encima.svg;

    // brazos y mangas (la chaqueta tapa las mangas de lo de abajo)
    c += `<path d="M118 298 L102 362 M202 298 L218 362" stroke="${piel}" stroke-width="15" stroke-linecap="round"/>` +
      `<circle cx="101" cy="367" r="10" fill="${piel}"/><circle cx="219" cy="367" r="10" fill="${piel}"/>`;
    const deArriba = partes.vestido || partes.arriba;
    const mangaEncima = partes.encima && partes.encima.manga;
    if (deArriba && deArriba.manga && !mangaEncima) c += deArriba.manga; // la chaqueta las tapa
    if (mangaEncima) c += mangaEncima;

    // cadenas, relojes, guantes…
    c += joya('cuello', st.cuello) + joya('muneca', st.muneca);

    const k = ESCALA_CUERPO[st.cuerpo] || 1;
    const cuerpo = k === 1 ? c : `<g transform="translate(160 0) scale(${k} 1) translate(-160 0)">${c}</g>`;

    return peloAtras(st) + cuerpo +
      peloDelante(st) + P.cara(ap) + ojos(st.ojos) + flequilloDe(st, ap) + joya('orejas', st.orejas) + cabeza(st.cabeza, st) + cara(st.cara);
  }

  // Ícono de cada cosa del armario (la prenda sola, recortada con el viewBox).
  const CAJAS = {
    arriba: '94 270 132 96', abajo: '78 334 164 114', vestido: '66 274 188 170', encima: '62 272 196 172',
    zapatos: '120 366 80 72', cabeza: '86 4 208 100', cara: '40 134 240 72', peinado: '-4 4 328 356',
    cuello: '100 270 120 100', muneca: '70 336 180 50', orejas: '20 186 280 56',
  };
  function icono(cat, valor, st, id) {
    let dentro = '', caja = CAJAS[cat] || '0 0 320 440';
    if (cat === 'pelo' || cat === 'piel') return `<span class="jcolor" style="background:${valor}"></span>`;
    if (cat === 'cuerpo') { const cu = CUERPOS.find((x) => x.v === valor); return `<span class="jtxt">${cu.e}<br>${cu.n}</span>`; }
    if (cat === 'ojos') return `<svg viewBox="78 134 68 68"><circle cx="112" cy="168" r="30" fill="#fff" stroke="#ddd" stroke-width="2"/><circle cx="112" cy="168" r="15" fill="${valor}"/><circle cx="112" cy="168" r="6" fill="#2a2740"/><circle cx="107" cy="163" r="3.5" fill="#fff"/></svg>`;
    if (cat === 'peinado') {
      const s2 = { ...st, peloEstilo: valor };
      const ap = { piel: st.piel || personaje(id).piel, peloColor: st.peloColor };
      dentro = peloAtras(s2) + peloDelante(s2) + P.cara(ap) + ojos(st.ojos) + flequilloDe(s2, ap);
    } else if (cat === 'zapatos') {
      dentro = zapatos(valor, '#f1c9a5');
      if (valor.t === 'botas') caja = '120 362 80 76';
    } else if (cat === 'cabeza') {
      const s2 = { peloEstilo: 'melena', peloColor: '#b9a597' };
      dentro = cabeza(valor, s2);
      caja = { moño: '122 14 76 64', collet: '124 2 72 70', tiara: '110 28 100 54', flor: '194 44 56 56', cintillo: '30 40 260 110', gorro: '62 24 196 112', 'jockey-plano': '40 30 240 110', sombrero: '20 10 280 130', boina: '56 20 210 90', casco: '44 24 232 112', corona: '96 18 128 66', 'gorro-lana': '60 20 200 112' }[valor.t] || caja;
    } else if (cat === 'cara') {
      dentro = cara(valor);
    } else if (cat === 'cuello' || cat === 'muneca' || cat === 'orejas') {
      dentro = joya(cat, valor);
      caja = {
        cadena: '116 284 88 56', collar: '118 284 84 56', bufanda: '104 282 112 90',
        reloj: '84 344 34 24', pulsera: '82 346 156 20', guantes: '82 346 156 40',
        aros: '32 198 28 40', argollas: '30 202 32 30',
      }[valor.t] || caja;
    } else {
      const pr = prenda(cat, valor);
      dentro = (pr.atras || '') + pr.svg + (pr.manga || '');
    }
    return `<svg viewBox="${caja}" preserveAspectRatio="xMidYMid meet">${dentro}</svg>`;
  }

  // ================= ESTADO Y GUARDADO =================
  let pacienteId = null;    // paciente actual — el armario se guarda por hij@
  let estados = {};         // id de personaje -> estado
  let actual = 'rumi';
  let cat = 'arriba';
  let filtroG = 'todos';    // qué personajes se muestran: 'todos', 'f' niñas, 'm' niños, 'h' superhéroes
  let guardarTimer = null;
  let toast = () => {};

  function localKey() { return 'ocuparche-juego-' + pacienteId; }
  function usoKey() { return 'ocuparche-juego-uso-' + pacienteId; }

  function leerLocal() {
    try {
      const j = JSON.parse(localStorage.getItem(localKey()));
      if (j && j.personajes) return j;
    } catch (e) {}
    return null;
  }
  function aplicarGuardado(j) {
    estados = {};
    PERSONAJES.forEach((p) => { estados[p.id] = normalizar(p.id, j && j.personajes && j.personajes[p.id]); });
    if (j && PERSONAJES.some((p) => p.id === j.actual)) actual = j.actual;
    else actual = PERSONAJES[0].id;
  }
  function paquete() { return { personajes: estados, actual }; }

  // La copia local lleva "pendiente: true" mientras no se haya podido subir
  // al servidor (p. ej. sin internet). Así, al abrir, lo local no se pisa
  // con una copia remota más vieja: se sube lo local en vez de bajar lo
  // remoto.
  let version = 0; // sube con cada cambio hecho en este dispositivo
  function guardarLocal(pendiente) {
    try { localStorage.setItem(localKey(), JSON.stringify({ ...paquete(), pendiente })); } catch (e) {}
  }

  function guardar() {
    version++;
    guardarLocal(true);
    clearTimeout(guardarTimer);
    guardarTimer = setTimeout(guardarRemoto, 1000);
  }
  async function guardarRemoto() {
    clearTimeout(guardarTimer); guardarTimer = null;
    const v = version;
    try {
      await Config.guardarJuego(pacienteId, paquete());
      if (v === version) guardarLocal(false); // si hubo otro cambio mientras subía, sigue pendiente
    } catch (e) { /* queda pendiente en este dispositivo; se sube en el próximo cambio o al abrir */ }
  }

  // ---------- tiempo de juego (por día, por paciente, en este dispositivo) ----------
  let minutosDia = 20;
  let tick = null;
  function uso() {
    const hoy = Utils.todayId();
    try {
      const u = JSON.parse(localStorage.getItem(usoKey()));
      if (u && u.fecha === hoy && typeof u.seg === 'number') return u;
    } catch (e) {}
    return { fecha: hoy, seg: 0 };
  }
  function guardarUso(u) { try { localStorage.setItem(usoKey(), JSON.stringify(u)); } catch (e) {} }
  function segundosRestantes() { return minutosDia > 0 ? Math.max(0, minutosDia * 60 - uso().seg) : Infinity; }

  function renderReloj() {
    const el = document.getElementById('juegoReloj');
    const r = segundosRestantes();
    if (r === Infinity) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.textContent = '⏱ ' + Math.floor(r / 60) + ':' + String(Math.floor(r % 60)).padStart(2, '0');
    el.classList.toggle('poco', r <= 60);
  }

  function empezarReloj() {
    clearInterval(tick);
    renderReloj();
    tick = setInterval(() => {
      if (document.hidden) return;
      const u = uso(); u.seg += 1; guardarUso(u);
      renderReloj();
      if (segundosRestantes() <= 0) terminarTiempo();
    }, 1000);
  }

  function terminarTiempo() {
    clearInterval(tick); tick = null;
    guardarRemoto();
    document.getElementById('juegoFin').classList.remove('hidden');
  }

  // ================= PANTALLA =================
  const $ = (id) => document.getElementById(id);

  function renderPersonajes() {
    $('juegoPersonajes').innerHTML = listaVisible().map((p) =>
      `<button class="jpersonaje${p.id === actual ? ' activo' : ''}" data-id="${p.id}" aria-label="${p.nombre}">` +
      `<svg viewBox="22 18 276 276">${figura(p.id, estados[p.id])}</svg><span>${p.nombre}</span></button>`
    ).join('');
  }

  function renderEscenario(pop) {
    const svg = $('juegoSvg');
    svg.innerHTML = figura(actual, estados[actual]);
    const p = personaje(actual);
    $('juegoNombre').textContent = p.nombre;
    $('juegoGrupo').textContent = p.grupo === p.nombre ? '' : p.grupo;
    if (pop) { svg.classList.remove('pop'); void svg.getBoundingClientRect(); svg.classList.add('pop'); }
  }

  function generoActual() { return personaje(actual).g; }

  // La lista de personajes no depende del género del niño que juega: cualquiera
  // puede vestir a cualquiera. Los superhéroes van primero.
  function visibleEnLista(p) {
    if (filtroG === 'todos') return true;
    if (filtroG === 'h') return p.grupo === 'Superhéroes';
    return p.g === filtroG;
  }
  function listaVisible() {
    const l = PERSONAJES.filter(visibleEnLista);
    return filtroG === 'todos' ? l.filter((p) => p.grupo === 'Superhéroes').concat(l.filter((p) => p.grupo !== 'Superhéroes')) : l;
  }

  // Categorías que tienen algo para el género del personaje (a un niño no le
  // sale "Vestidos", por ejemplo).
  function categoriasVisibles() {
    const g = generoActual();
    return CATEGORIAS.filter((c) => {
      if (['pelo', 'ojos', 'cuerpo', 'piel'].indexOf(c.id) >= 0) return true;
      if (c.id === 'peinado') return PEINADOS.some((p) => paraGenero(g, p.g));
      return ARMARIO[c.id].some((it) => paraGenero(g, it[2]));
    });
  }
  function asegurarCategoria() {
    if (!categoriasVisibles().some((c) => c.id === cat)) cat = 'arriba';
  }

  function renderGenero() {
    document.querySelectorAll('#juegoGenero button').forEach((b) => b.classList.toggle('activo', b.dataset.g === filtroG));
  }

  function renderCats() {
    asegurarCategoria();
    $('juegoCats').innerHTML = categoriasVisibles().map((c) =>
      `<button data-cat="${c.id}"${c.id === cat ? ' class="activo"' : ''}><span>${c.e}</span>${c.n}</button>`
    ).join('');
  }

  // Lista de cosas de la categoría actual: [{ key, valor, nombre, puesto }]
  function itemsDeCategoria() {
    const st = estados[actual];
    const g = generoActual();
    if (cat === 'peinado') return PEINADOS.filter((p) => paraGenero(g, p.g)).map((p) => ({ key: 'peinado|' + p.v, valor: p.v, nombre: p.n, puesto: st.peloEstilo === p.v }));
    if (cat === 'piel') return PIELES.map((p) => ({ key: 'piel|' + p.c, valor: p.c, nombre: 'Piel ' + p.n.toLowerCase(), puesto: st.piel === p.c }));
    if (cat === 'cuerpo') return CUERPOS.map((p) => ({ key: 'cuerpo|' + p.v, valor: p.v, nombre: 'Cuerpo ' + p.n.toLowerCase(), puesto: st.cuerpo === p.v }));
    if (cat === 'pelo') return COLORES_PELO.map((p) => ({ key: 'pelo|' + p.c, valor: p.c, nombre: 'Pelo ' + p.n.toLowerCase(), puesto: st.peloColor === p.c }));
    if (cat === 'ojos') return COLORES_OJOS.map((p) => ({ key: 'ojos|' + p.c, valor: p.c, nombre: 'Ojos ' + p.n.toLowerCase(), puesto: st.ojos === p.c }));
    const out = [];
    ARMARIO[cat].filter((it) => paraGenero(g, it[2])).forEach(([t, colores]) => colores.forEach((c) => {
      const puesto = !!st[cat] && st[cat].t === t && st[cat].c === c;
      out.push({ key: cat + '|' + t + '|' + c, valor: { t, c }, nombre: TIPOS[cat][t] + ' ' + (NOMBRE_COLOR[c] || ''), puesto });
    }));
    return out;
  }

  function renderItems() {
    const st = estados[actual];
    $('juegoItems').innerHTML = itemsDeCategoria().map((it) =>
      `<button class="jitem${it.puesto ? ' puesto' : ''}" data-key="${it.key}" title="${it.nombre}" aria-label="${it.nombre}">` +
      icono(cat, it.valor, st, actual) + '</button>'
    ).join('');
  }

  function valorDeKey(key) {
    const [c, a, b] = key.split('|');
    if (c === 'peinado' || c === 'pelo' || c === 'ojos' || c === 'piel' || c === 'cuerpo') return { cat: c, valor: a };
    return { cat: c, valor: { t: a, c: b } };
  }

  function equipar(key) {
    const { cat: c, valor } = valorDeKey(key);
    const st = estados[actual];
    if (c === 'peinado') st.peloEstilo = valor;
    else if (c === 'pelo') st.peloColor = valor;
    else if (c === 'ojos') st.ojos = valor;
    else if (c === 'piel') st.piel = valor;
    else if (c === 'cuerpo') st.cuerpo = valor;
    else {
      const igual = st[c] && st[c].t === valor.t && st[c].c === valor.c;
      st[c] = igual ? null : valor; // tocar lo que ya tiene puesto, se lo saca
      if (!igual && c === 'vestido') { st.arriba = null; st.abajo = null; }
      if (!igual && (c === 'arriba' || c === 'abajo')) st.vestido = null;
    }
    renderEscenario(true); renderItems(); renderPersonajes();
    guardar();
  }

  // ---------- arrastrar prendas hasta el personaje ----------
  let arrastre = null;
  let sinClick = false;
  function sobreEscenario(e) {
    const r = $('juegoEscenario').getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }
  function limpiarArrastre() {
    if (arrastre && arrastre.fantasma) arrastre.fantasma.remove();
    $('juegoEscenario').classList.remove('sobre');
    arrastre = null;
  }

  function cablear() {
    $('juegoSalir').addEventListener('click', cerrar);
    $('juegoFinOk').addEventListener('click', cerrar);

    $('juegoPersonajes').addEventListener('click', (e) => {
      const b = e.target.closest('.jpersonaje');
      if (!b) return;
      actual = b.dataset.id;
      renderPersonajes(); renderEscenario(true); renderCats(); renderItems();
      guardar();
    });

    $('juegoGenero').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-g]');
      if (!b || b.dataset.g === filtroG) return;
      filtroG = b.dataset.g;
      // si el personaje actual no entra en este grupo, pasa al primero que sí
      if (!visibleEnLista(personaje(actual))) actual = listaVisible()[0].id;
      renderGenero(); renderPersonajes(); renderEscenario(true); renderCats(); renderItems();
      $('juegoPersonajes').scrollLeft = 0;
      guardar();
    });

    $('juegoCats').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-cat]');
      if (!b) return;
      cat = b.dataset.cat;
      renderCats(); renderItems();
      $('juegoItems').scrollLeft = 0;
    });

    // "En blanco" y "Original" piden un segundo toque para confirmar (a
    // prueba de dedos chicos): cambian toda la ropa del personaje de una vez.
    function conConfirmacion(id, accion) {
      const b = $(id), txt = b.querySelector('.ja-txt');
      let espera = null;
      const volver = () => { clearTimeout(espera); espera = null; txt.textContent = b.dataset.txt; b.classList.remove('confirmar'); };
      b.addEventListener('click', () => {
        if (!espera) {
          txt.textContent = '¿Seguro?';
          b.classList.add('confirmar');
          espera = setTimeout(volver, 3000);
          return;
        }
        volver();
        accion();
        renderEscenario(true); renderItems(); renderPersonajes();
        guardar();
      });
    }
    conConfirmacion('juegoReset', () => { estados[actual] = enBlanco(actual); });
    conConfirmacion('juegoOriginal', () => { estados[actual] = inicial(actual); });

    const items = $('juegoItems');
    items.addEventListener('click', (e) => {
      if (sinClick) return;
      const b = e.target.closest('.jitem');
      if (b) equipar(b.dataset.key);
    });
    items.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.jitem');
      if (!b) return;
      arrastre = { key: b.dataset.key, boton: b, x0: e.clientX, y0: e.clientY, pid: e.pointerId, mouse: e.pointerType === 'mouse', fantasma: null };
    });
    document.addEventListener('pointermove', (e) => {
      if (!arrastre || e.pointerId !== arrastre.pid) return;
      const dx = e.clientX - arrastre.x0, dy = e.clientY - arrastre.y0;
      if (!arrastre.fantasma) {
        // con el dedo, moverse de lado es para recorrer el armario; hacia arriba, para arrastrar
        const empezar = arrastre.mouse ? Math.hypot(dx, dy) > 6 : (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx));
        if (!empezar) return;
        const f = arrastre.boton.cloneNode(true);
        f.classList.add('fantasma');
        $('juego').appendChild(f);
        arrastre.fantasma = f;
      }
      e.preventDefault();
      const f = arrastre.fantasma;
      f.style.left = (e.clientX - f.offsetWidth / 2) + 'px';
      f.style.top = (e.clientY - f.offsetHeight / 2) + 'px';
      $('juegoEscenario').classList.toggle('sobre', sobreEscenario(e));
    }, { passive: false });
    document.addEventListener('pointerup', (e) => {
      if (!arrastre || e.pointerId !== arrastre.pid) return;
      if (arrastre.fantasma) {
        if (sobreEscenario(e)) equipar(arrastre.key);
        sinClick = true; setTimeout(() => { sinClick = false; }, 60);
      }
      limpiarArrastre();
    });
    document.addEventListener('pointercancel', limpiarArrastre);
  }

  // ================= API =================
  let cableado = false;

  async function abrir(opts) {
    if (!cableado) { cablear(); cableado = true; }
    toast = opts.toast || toast;
    pacienteId = opts.pacienteId;
    minutosDia = opts.minutosDia;

    const local = leerLocal();
    aplicarGuardado(local);
    filtroG = 'todos';
    $('juegoFin').classList.add('hidden');
    $('juego').classList.remove('hidden');
    document.body.classList.add('jugando');
    renderGenero(); renderPersonajes(); renderEscenario(false); renderCats(); renderItems();

    if (segundosRestantes() <= 0) { terminarTiempo(); return; }
    empezarReloj();

    // Si quedaron cambios de este dispositivo sin subir, se suben (no se pisan).
    if (local && local.pendiente) { guardarRemoto(); return; }

    // Si no, lo del servidor manda (puede venir de otro celular), salvo que
    // alguien haya empezado a jugar mientras llegaba: eso no se pisa.
    const v = version;
    const remoto = await Config.obtenerJuego(pacienteId);
    if (remoto && v === version && !$('juego').classList.contains('hidden')) {
      aplicarGuardado(remoto);
      guardarLocal(false);
      renderGenero(); renderPersonajes(); renderEscenario(false); renderCats(); renderItems();
    }
  }

  function cerrar() {
    clearInterval(tick); tick = null;
    limpiarArrastre();
    if (guardarTimer) guardarRemoto();
    $('juego').classList.add('hidden');
    document.body.classList.remove('jugando');
  }

  function minutosRestantesHoy(min) {
    if (!(min > 0)) return Infinity;
    return Math.max(0, Math.ceil((min * 60 - uso().seg) / 60));
  }
  function darMasTiempo() { guardarUso({ fecha: Utils.todayId(), seg: 0 }); }

  async function restablecerTodos() {
    estados = {};
    PERSONAJES.forEach((p) => { estados[p.id] = enBlanco(p.id); });
    version++;
    guardarLocal(true);
    await guardarRemoto();
  }

  return { abrir, cerrar, minutosRestantesHoy, darMasTiempo, restablecerTodos, figura };
})();
