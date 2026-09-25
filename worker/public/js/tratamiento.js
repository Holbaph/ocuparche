// tratamiento.js — las cuentas del tratamiento para los padres (sin tocar la
// pantalla; eso lo hace js/app.js). Portado de Ojitos de Mili:
//   - la indicación del oftalmólogo: qué ojo se tapa (siempre el mismo o
//     alternando), cuántos minutos y qué días de la semana;
//   - el tiempo real de uso de cada día (desde que se puso hasta que se sacó);
//   - la constancia y la racha contando SOLO los días indicados (un día libre
//     no corta la racha);
//   - el premio por constancia de la semana (de lunes a domingo);
//   - el informe para el doctor (HTML para imprimir y texto para compartir).
// Los textos que escriben los padres (premio, control) se muestran siempre
// escapados (Utils.esc) o con textContent.

const Tratamiento = (function () {
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DIAS_CORTOS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
  const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0]; // de lunes a domingo
  const esc = (s) => Utils.esc(s);

  const DEFECTO = {
    ojo: 'alternar', dias: [0, 1, 2, 3, 4, 5, 6], duracion: 120,
    premioMeta: null, premioTexto: '',
    controlFecha: null, controlHora: null, controlDetalle: '', controlPreguntas: '',
    resumenActivo: true,
  };

  // Lo que devuelve la API (GET /api/config -> tratamiento) + la duración del parche
  // -> config validada, con valores por defecto.
  function desdeApi(t, duracionMin) {
    const c = { ...DEFECTO };
    if (duracionMin > 0) c.duracion = duracionMin;
    if (!t) return c;
    if (['alternar', 'derecho', 'izquierdo'].includes(t.indicacion_ojo)) c.ojo = t.indicacion_ojo;
    if (Array.isArray(t.indicacion_dias)) {
      const d = [...new Set(t.indicacion_dias.map(Number).filter((n) => n >= 0 && n <= 6))];
      if (d.length) c.dias = d.sort();
    }
    if (t.premio_meta >= 1 && t.premio_meta <= 7) c.premioMeta = t.premio_meta;
    c.premioTexto = typeof t.premio_texto === 'string' ? t.premio_texto : '';
    if (typeof t.control_fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.control_fecha)) c.controlFecha = t.control_fecha;
    if (typeof t.control_hora === 'string' && /^\d{2}:\d{2}/.test(t.control_hora)) c.controlHora = t.control_hora.slice(0, 5);
    c.controlDetalle = typeof t.control_detalle === 'string' ? t.control_detalle : '';
    c.controlPreguntas = typeof t.control_preguntas === 'string' ? t.control_preguntas : '';
    c.resumenActivo = t.resumen_activo !== 0;
    return c;
  }

  const esIndicado = (conf, d) => conf.dias.includes(d.getDay());
  const sumarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const soloFecha = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  function lunesDe(d) { return sumarDias(soloFecha(d), -((d.getDay() + 6) % 7)); }

  function fmtDur(min) {
    min = Math.max(0, Math.round(min));
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + ' min';
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }
  function textoDias(conf) {
    if (conf.dias.length === 7) return 'todos los días';
    const orden = ORDEN_SEMANA.filter((d) => conf.dias.includes(d));
    if (orden.length === 6 && !conf.dias.includes(0)) return 'de lunes a sábado';
    if (orden.length === 5 && !conf.dias.includes(0) && !conf.dias.includes(6)) return 'de lunes a viernes';
    return orden.map((d) => DIAS[d]).join(', ');
  }
  function textoIndicacion(conf) {
    const ojo = conf.ojo === 'alternar' ? 'alternando los ojos' : 'tapar el ojo ' + conf.ojo;
    return `${ojo[0].toUpperCase() + ojo.slice(1)}, ${fmtDur(conf.duracion)} al día, ${textoDias(conf)}`;
  }

  // Minutos de uso de un registro: con hora de sacado, lo real; si es hoy y
  // sigue puesto, lo que va; si no se anotó, se estima con la duración indicada.
  function uso(rec, conf, ahora) {
    ahora = ahora || Date.now();
    const ini = new Date(rec.hora).getTime();
    if (rec.horaFin) return { min: Math.max(0, (new Date(rec.horaFin).getTime() - ini) / 60000), estimado: false, enCurso: false };
    if (rec.fecha === Utils.todayId()) {
      const va = Math.max(0, (ahora - ini) / 60000);
      if (va < conf.duracion) return { min: va, estimado: false, enCurso: true };
    }
    return { min: conf.duracion, estimado: true, enCurso: false };
  }

  // qué ojo toca hoy (o si hoy es día libre)
  function sugerencia(conf, entries) {
    const hoy = new Date();
    if (!esIndicado(conf, hoy)) return { libre: true, texto: 'Hoy es día libre de parche según la indicación 🎈' };
    if (conf.ojo !== 'alternar') return { ojo: conf.ojo, texto: `Según la indicación, hoy toca tapar el ojo ${conf.ojo}` };
    const ids = Object.keys(entries).filter((k) => k !== Utils.todayId()).sort();
    const ultimo = ids.length ? entries[ids[ids.length - 1]] : null;
    if (!ultimo) return { texto: 'Toca un ojito para registrar el parche de hoy' };
    const ojo = ultimo.ojo === 'derecho' ? 'izquierdo' : 'derecho';
    return { ojo, texto: `La última vez fue el ojo ${ultimo.ojo}: hoy toca el ${ojo}` };
  }

  // constancia (% de días indicados con parche desde el primer registro) y
  // racha (días indicados seguidos con parche; hoy cuenta si ya se puso)
  function estadisticas(entries, conf) {
    const ids = Object.keys(entries).sort();
    let countD = 0, countI = 0;
    ids.forEach((id) => { if (entries[id].ojo === 'derecho') countD++; else countI++; });
    let racha = 0;
    let d = soloFecha(new Date());
    if (!entries[Utils.dateId(d)]) d = sumarDias(d, -1);
    for (let guardia = 0; guardia < 800; guardia++, d = sumarDias(d, -1)) {
      if (entries[Utils.dateId(d)]) racha++;
      else if (esIndicado(conf, d)) break;
    }
    let constancia = 0;
    if (ids.length) {
      let indicados = 0, hechos = 0;
      for (let x = Utils.parseId(ids[0]), hoy = soloFecha(new Date()); x <= hoy; x = sumarDias(x, 1)) {
        const hay = !!entries[Utils.dateId(x)];
        if (esIndicado(conf, x)) { indicados++; if (hay) hechos++; }
      }
      constancia = indicados ? Math.min(100, Math.round(100 * hechos / indicados)) : 100;
    }
    return { total: ids.length, countD, countI, racha, constancia };
  }

  // los 7 días de una semana (lunes a domingo) con su registro y uso
  function semana(entries, conf, ref) {
    const lunes = lunesDe(ref || new Date()), hoy = soloFecha(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const d = sumarDias(lunes, i), id = Utils.dateId(d), rec = entries[id] || null;
      return { d, id, corto: DIAS_CORTOS[d.getDay()], indicado: esIndicado(conf, d), futuro: d > hoy, hoy: id === Utils.todayId(), rec, uso: rec ? uso(rec, conf) : null };
    });
  }

  // premio de esta semana
  function premio(entries, conf) {
    if (!conf.premioMeta) return null;
    const dias = semana(entries, conf);
    const hechos = dias.filter((x) => x.rec).length;
    return { meta: conf.premioMeta, texto: conf.premioTexto || 'un premio', hechos, logrado: hechos >= conf.premioMeta, faltan: Math.max(0, conf.premioMeta - hechos), dias };
  }

  // próximo control: cuántos días faltan (null si no hay o ya pasó)
  function control(conf) {
    if (!conf.controlFecha) return null;
    const f = Utils.parseId(conf.controlFecha), hoy = soloFecha(new Date());
    const dias = Math.round((f - hoy) / 86400000);
    if (dias < 0) return null;
    const cuando = dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`;
    const fecha = Utils.fmtLong(f) + (conf.controlHora ? ', ' + Utils.fmtTime('2000-01-01T' + conf.controlHora + ':00') : '');
    return { dias, cuando, fecha };
  }

  // ================= INFORME PARA EL DOCTOR =================
  function informe(entries, conf, desdeId, hastaId, nombre) {
    nombre = nombre || 'tu hij@';
    const desde = Utils.parseId(desdeId), hasta = Utils.parseId(hastaId);
    const filas = [];
    let indicados = 0, hechos = 0, minTotal = 0, completos = 0, cortos = 0, estimados = 0, extra = 0, d = 0, i = 0;
    for (let x = desde; x <= hasta; x = sumarDias(x, 1)) {
      const id = Utils.dateId(x), rec = entries[id], ind = esIndicado(conf, x);
      if (ind) indicados++;
      if (rec) {
        const u = uso(rec, conf);
        if (ind) hechos++; else extra++;
        minTotal += u.min;
        if (u.estimado) estimados++;
        else if (!u.enCurso && u.min < conf.duracion - 5) cortos++;
        if (!u.enCurso && !u.estimado && u.min >= conf.duracion - 5) completos++;
        if (rec.ojo === 'derecho') d++; else i++;
        filas.push({ x, rec, u, ind });
      } else if (ind) filas.push({ x, rec: null, ind });
    }
    const pct = indicados ? Math.round(100 * hechos / indicados) : 0;
    const conParche = hechos + extra;
    const promedio = conParche ? minTotal / conParche : 0;
    const periodo = `${Utils.fmtLong(desde)} al ${Utils.fmtLong(hasta)}`;
    const ctrl = control(conf);
    const preguntas = conf.controlPreguntas.split('\n').map((s) => s.trim()).filter(Boolean);

    // semanas (lunes a domingo) dentro del período
    const semanas = [];
    for (let l = lunesDe(desde); l <= hasta; l = sumarDias(l, 7)) {
      let ind = 0, hec = 0, min = 0;
      for (let k = 0; k < 7; k++) {
        const x = sumarDias(l, k);
        if (x < desde || x > hasta) continue;
        const rec = entries[Utils.dateId(x)];
        if (esIndicado(conf, x)) { ind++; if (rec) hec++; }
        if (rec) min += uso(rec, conf).min;
      }
      semanas.push({ l, ind, hec, min });
    }

    const texto = [
      `🩹 Informe del parche de ${nombre}`,
      `Período: ${periodo}`,
      `Indicación: ${textoIndicacion(conf)}`,
      `Días con parche: ${hechos} de ${indicados} días indicados (${pct}%)` + (extra ? ` + ${extra} día(s) extra` : ''),
      `Tiempo total: ${fmtDur(minTotal)} · promedio ${fmtDur(promedio)} por día (meta ${fmtDur(conf.duracion)})`,
      `Días con el tiempo completo: ${completos} · días más cortos: ${cortos}` + (estimados ? ` · días sin hora de sacado (estimados): ${estimados}` : ''),
      `Ojo tapado: derecho ${d} · izquierdo ${i}`,
      ...(preguntas.length ? ['', 'Preguntas para el control:', ...preguntas.map((p) => '• ' + p)] : []),
    ].join('\n');

    const fila = (f) => {
      if (!f.rec) return `<tr class="falta"><td>${esc(Utils.fmtShort(f.x))}</td><td colspan="3">Sin parche</td></tr>`;
      const fin = f.rec.horaFin ? Utils.fmtTime(f.rec.horaFin) : (f.u.enCurso ? 'puesto' : '—');
      return `<tr><td>${esc(Utils.fmtShort(f.x))}${f.ind ? '' : ' <small>(extra)</small>'}</td><td>${Utils.label(f.rec.ojo)}</td>` +
        `<td>${Utils.fmtTime(f.rec.hora)} → ${fin}</td><td>${fmtDur(f.u.min)}${f.u.estimado ? ' <small>(est.)</small>' : ''}</td></tr>`;
    };
    const html =
      `<header class="inf-cab"><h1>🩹 Informe del parche de ${esc(nombre)}</h1><p>${esc(periodo)}</p></header>` +
      `<p class="inf-ind"><strong>Indicación:</strong> ${esc(textoIndicacion(conf))}</p>` +
      '<div class="inf-cifras">' +
      `<div><b>${pct}%</b><span>constancia<br>${hechos} de ${indicados} días</span></div>` +
      `<div><b>${fmtDur(minTotal)}</b><span>tiempo total</span></div>` +
      `<div><b>${fmtDur(promedio)}</b><span>promedio por día<br>(meta ${fmtDur(conf.duracion)})</span></div>` +
      `<div><b>${completos}</b><span>días completos<br>${cortos} más cortos</span></div>` +
      '</div>' +
      `<p class="inf-nota">Ojo tapado: derecho ${d} · izquierdo ${i}` + (extra ? ` · ${extra} día(s) con parche fuera de la indicación` : '') +
      (estimados ? ` · ${estimados} día(s) sin hora de sacado: se estimó la duración indicada` : '') + '</p>' +
      '<h2>Por semana</h2><table class="inf-tabla"><thead><tr><th>Semana del</th><th>Días</th><th>Tiempo</th></tr></thead><tbody>' +
      semanas.map((s) => `<tr><td>${esc(Utils.fmtShort(s.l))}</td><td>${s.ind ? s.hec + ' de ' + s.ind : '—'}</td><td>${fmtDur(s.min)}</td></tr>`).join('') +
      '</tbody></table>' +
      '<h2>Día a día</h2><table class="inf-tabla"><thead><tr><th>Día</th><th>Ojo</th><th>Horario</th><th>Uso</th></tr></thead><tbody>' +
      filas.map(fila).join('') + '</tbody></table>' +
      (ctrl || preguntas.length ? '<h2>Próximo control</h2>' +
        (ctrl ? `<p>${esc(ctrl.fecha)}${conf.controlDetalle ? ' · ' + esc(conf.controlDetalle) : ''}</p>` : '') +
        (preguntas.length ? '<ul class="inf-preg">' + preguntas.map((p) => `<li>${esc(p)}</li>`).join('') + '</ul>' : '') : '') +
      `<footer class="inf-pie">Hecho con Ocuparche el ${esc(new Date().toLocaleDateString('es-CL'))}. Los días sin hora de sacado se estiman con la duración indicada.</footer>`;
    return { html, texto, titulo: 'Informe del parche de ' + nombre };
  }

  return { DIAS_CORTOS, ORDEN_SEMANA, desdeApi, esIndicado, fmtDur, textoIndicacion, uso, sugerencia, estadisticas, semana, premio, control, informe, lunesDe };
})();
