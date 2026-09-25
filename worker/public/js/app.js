// app.js — arranque, pantallas de acceso, multi-paciente y toda la
// interacción de la app. Habla con la API propia (worker/), ya no Supabase.
(function () {
  "use strict";

  // ---------- estado ----------
  let perfil = null;         // { id, cuenta_id, email, nombre, role, es_dueño }
  let cuenta = null;         // { id, plan, activado_en }
  let pacientes = [];        // [{id, nombre}]
  let pacienteActualId = null;
  let entries = {};          // fecha -> registro (del paciente actual)
  let personasCache = {};
  let pendingDelete = null;
  let realtimeConn = null;   // { cerrar() }
  let duracionMinutos = 120;
  let timerTick = null;
  let trat = tratamientoPorDefecto(); // indicaciones del oftalmólogo, premio y control (plan completo)
  let juegoMinutos = 20;      // minutos de juego por día (0 = sin límite) — del paciente actual

  // El correo de recuperación/invitación trae #reset=TOKEN o #invite=TOKEN.
  let authTokenMode = null;  // 'reset' | 'invite' | null
  let authToken = null;
  {
    const hash = location.hash.slice(1);
    const params = new URLSearchParams(hash);
    if (params.has('reset')) { authTokenMode = 'reset'; authToken = params.get('reset'); }
    else if (params.has('invite')) { authTokenMode = 'invite'; authToken = params.get('invite'); }
  }
  let irSignupAlAbrir = location.search.includes('signup=1');

  // ---------- overlays de acceso ----------
  const OVERLAYS = ['authLoading', 'authLogin', 'authSignup', 'authForgot', 'authSetPassword'];
  function showOverlay(id) {
    OVERLAYS.forEach(o => document.getElementById(o).classList.toggle('hidden', o !== id));
    document.getElementById('app').classList.add('hidden');
  }
  function showApp() {
    OVERLAYS.forEach(o => document.getElementById(o).classList.add('hidden'));
    document.getElementById('app').classList.remove('hidden');
  }

  function setBadge(mode) {
    const badge = document.getElementById('syncBadge'), txt = document.getElementById('syncText');
    if (mode === 'ok') { badge.classList.remove('local'); txt.textContent = 'Sincronizado'; }
    else { badge.classList.add('local'); txt.textContent = 'Reconectando…'; }
  }

  let toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function esPlanCompleto() { return cuenta && cuenta.plan === 'completo'; }

  // ================= LOGIN / SIGNUP / RECUPERACIÓN =================
  function wireLogin() {
    document.getElementById('btnLogin').addEventListener('click', async () => {
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const err = document.getElementById('loginError');
      err.classList.add('hidden');
      if (!email || !password) { err.textContent = 'Completa correo y contraseña.'; err.classList.remove('hidden'); return; }
      try {
        await Auth.login(email, password);
        await arrancarSesion();
      } catch (e) {
        err.textContent = e.message || 'Correo o contraseña incorrectos.';
        err.classList.remove('hidden');
      }
    });

    document.getElementById('btnIrOlvide').addEventListener('click', () => showOverlay('authForgot'));
    document.getElementById('btnVolverLogin').addEventListener('click', () => showOverlay('authLogin'));
    document.getElementById('btnIrSignup').addEventListener('click', (e) => { e.preventDefault(); showOverlay('authSignup'); });
    document.getElementById('btnVolverLoginDesdeSignup').addEventListener('click', () => showOverlay('authLogin'));

    document.getElementById('btnSignup').addEventListener('click', async () => {
      const nombre = document.getElementById('signupNombre').value.trim();
      const email = document.getElementById('signupEmail').value.trim();
      const password = document.getElementById('signupPassword').value;
      const err = document.getElementById('signupError');
      err.classList.add('hidden');
      if (!nombre || !email || !password) { err.textContent = 'Completa todos los campos.'; err.classList.remove('hidden'); return; }
      if (password.length < 8) { err.textContent = 'La contraseña debe tener al menos 8 caracteres.'; err.classList.remove('hidden'); return; }
      try {
        await Auth.registrarse(email, password, nombre);
        await arrancarSesion();
      } catch (e) {
        err.textContent = (e.message || '').includes('ya tiene una cuenta') ? 'Ese correo ya tiene una cuenta.' : (e.message || 'No se pudo crear la cuenta.');
        err.classList.remove('hidden');
      }
    });

    document.getElementById('btnEnviarRecuperacion').addEventListener('click', async () => {
      const email = document.getElementById('forgotEmail').value.trim();
      const err = document.getElementById('forgotError');
      err.classList.add('hidden');
      if (!email) { err.textContent = 'Escribe tu correo.'; err.classList.remove('hidden'); return; }
      try {
        await Auth.pedirRecuperacion(email);
        showToast('Si el correo tiene cuenta, te llegará un enlace');
        showOverlay('authLogin');
      } catch (e) {
        err.textContent = 'No se pudo enviar el enlace. Intenta de nuevo.';
        err.classList.remove('hidden');
      }
    });

    document.getElementById('btnGuardarPassword').addEventListener('click', async () => {
      const p1 = document.getElementById('newPassword').value;
      const p2 = document.getElementById('newPassword2').value;
      const err = document.getElementById('setPasswordError');
      err.classList.add('hidden');
      if (p1.length < 8) { err.textContent = 'La contraseña debe tener al menos 8 caracteres.'; err.classList.remove('hidden'); return; }
      if (p1 !== p2) { err.textContent = 'Las contraseñas no coinciden.'; err.classList.remove('hidden'); return; }
      try {
        if (authTokenMode === 'invite') await Auth.aceptarInvitacion(authToken, p1);
        else await Auth.fijarContrasenaConToken(authToken, p1);
        history.replaceState(null, '', location.pathname);
        authTokenMode = null; authToken = null;
        await arrancarSesion();
      } catch (e) {
        err.textContent = e.message || 'No se pudo guardar la contraseña. Intenta de nuevo.';
        err.classList.remove('hidden');
      }
    });

    document.getElementById('btnLogout').addEventListener('click', async () => {
      pararRealtime();
      if (timerTick) { clearInterval(timerTick); timerTick = null; }
      Juego.cerrar();
      await Auth.logout();
      perfil = null; cuenta = null; pacientes = []; entries = {};
      showOverlay('authLogin');
    });
  }

  // ================= SESIÓN =================
  async function arrancarSesion() {
    showOverlay('authLoading');

    if (authTokenMode) {
      document.getElementById('setPasswordMuted').textContent = authTokenMode === 'invite'
        ? '¡Bienvenid@! Elige tu contraseña para empezar.'
        : 'Elige una contraseña nueva para tu cuenta.';
      showOverlay('authSetPassword');
      return;
    }

    const sesion = await Auth.getSesionYPerfil();
    if (!sesion) {
      showOverlay(irSignupAlAbrir ? 'authSignup' : 'authLogin');
      irSignupAlAbrir = false;
      return;
    }
    perfil = sesion.perfil;
    cuenta = sesion.cuenta;

    renderCuenta();
    showApp();

    // Antes, si cualquiera de estos pasos fallaba (por ejemplo cargarPaciente),
    // la excepción quedaba sin capturar y la app se veía "pegada" a medio
    // cargar, sin decir nada — ahora cada paso avisa con un toast y los
    // siguientes pasos igual se intentan.
    try {
      pacientes = await Pacientes.listar();
    } catch (e) {
      pacientes = [];
      showToast('No se pudieron cargar tus hij@s. Revisa tu conexión y recarga la página.');
    }

    if (!pacientes.length) {
      document.getElementById('noPacientes').classList.remove('hidden');
      document.getElementById('conPacientes').classList.add('hidden');
    } else {
      document.getElementById('noPacientes').classList.add('hidden');
      document.getElementById('conPacientes').classList.remove('hidden');
      const recordado = localStorage.getItem('ocuparche_paciente_' + perfil.cuenta_id);
      pacienteActualId = pacientes.find(p => p.id === recordado) ? recordado : pacientes[0].id;
      renderPatientTabs();
      try {
        await cargarPaciente(pacienteActualId);
      } catch (e) {
        console.error('cargarPaciente falló', e);
        showToast('Algo falló al cargar el historial. Recarga la página.');
      }
    }

    try {
      await cargarPersonas();
    } catch (e) {
      console.error('cargarPersonas falló', e);
    }
    renderGatingPlan();
  }

  function renderCuenta() {
    document.getElementById('avatarIniciales').textContent = Utils.iniciales(perfil.nombre);
    document.getElementById('accountName').textContent = perfil.nombre;
    const roleEl = document.getElementById('accountRole');
    roleEl.textContent = perfil.role === 'admin' ? 'Administradora/or' : 'Con acceso';
    roleEl.classList.toggle('admin', perfil.role === 'admin');
    const badge = document.getElementById('planBadge');
    badge.textContent = esPlanCompleto() ? '✓ Plan completo' : 'Plan gratis';
    badge.className = 'plan-badge ' + (esPlanCompleto() ? 'completo' : 'free');
  }

  // ================= PACIENTES =================
  function renderPatientTabs() {
    const wrap = document.getElementById('patientTabs');
    wrap.innerHTML = '';
    pacientes.forEach(p => {
      const b = document.createElement('button');
      b.className = 'patient-tab' + (p.id === pacienteActualId ? ' active' : '');
      b.textContent = p.nombre;
      b.addEventListener('click', () => { if (p.id !== pacienteActualId) cambiarPaciente(p.id); });
      wrap.appendChild(b);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'patient-tab add';
    addBtn.textContent = '+ Agregar';
    addBtn.addEventListener('click', onClickAgregarPaciente);
    wrap.appendChild(addBtn);
  }

  function onClickAgregarPaciente() {
    if (!esPlanCompleto() && pacientes.length >= 1) {
      showToast('Agregar más de un hij@ es parte del plan completo');
      return;
    }
    document.getElementById('addPacienteForm').classList.add('show');
    document.getElementById('pacienteNombreInput').value = '';
    document.getElementById('pacienteNombreInput').focus();
  }
  document.getElementById('btnPrimerPaciente').addEventListener('click', () => {
    document.getElementById('noPacientes').classList.add('hidden');
    document.getElementById('conPacientes').classList.remove('hidden');
    renderPatientTabs();
    document.getElementById('addPacienteForm').classList.add('show');
  });
  document.getElementById('pacienteCancel').addEventListener('click', () => {
    document.getElementById('addPacienteForm').classList.remove('show');
  });

  let nuevoGenero = 'niña';
  document.querySelectorAll('#generoSeg button').forEach(b => {
    b.addEventListener('click', () => {
      nuevoGenero = b.dataset.val;
      document.querySelectorAll('#generoSeg button').forEach(x => x.classList.toggle('active', x === b));
    });
  });

  document.getElementById('pacienteSave').addEventListener('click', async () => {
    const nombre = document.getElementById('pacienteNombreInput').value.trim();
    if (!nombre) { showToast('Escribe un nombre'); return; }
    try {
      const nuevo = await Pacientes.crear(nombre, avatarPorDefecto(nuevoGenero));
      pacientes.push(nuevo);
      document.getElementById('addPacienteForm').classList.remove('show');
      document.getElementById('noPacientes').classList.add('hidden');
      document.getElementById('conPacientes').classList.remove('hidden');
      renderPatientTabs();
      await cambiarPaciente(nuevo.id);
      showToast('¡Agregad@!');
    } catch (e) {
      showToast((e.message || '').includes('plan_gratis_limite_pacientes')
        ? 'El plan gratis permite 1 solo hij@ — activa el plan completo para agregar más'
        : 'No se pudo agregar, intenta de nuevo');
    }
  });

  // ================= PERSONALIZAR APARIENCIA =================
  // Igual que en Ojitos de Mili: arriba del panel hay una vista previa fija del
  // personaje (una copia del de la pantalla principal) que se va actualizando
  // a cada toque, así se ve cómo va quedando sin tener que cerrar el panel. El
  // de la pantalla principal solo cambia al tocar Guardar.
  let avatarBorrador = null;
  let avTab = 'general';
  const avatarScrim = document.getElementById('avatarScrim'), avatarSheet = document.getElementById('avatarSheet');
  const AV_TABS = [
    { id: 'general', n: '👧 Género y peinado' },
    { id: 'pelo', n: '🎨 Pelo y ojos', premium: true },
    { id: 'cuerpo', n: '🧍 Cuerpo', premium: true },
    { id: 'ropa', n: '👕 Ropa', premium: true },
    { id: 'accesorios', n: '🧢 Accesorios', premium: true },
  ];
  function abrirAvatarSheet() {
    avatarSheet.scrollTop = 0;
    avatarSheet.classList.add('show'); avatarScrim.classList.add('show');
  }
  function cerrarAvatarSheet() {
    avatarSheet.classList.remove('show'); avatarScrim.classList.remove('show');
  }

  // Copia el monito de la pantalla principal a la vista previa (sin ids, sin
  // el aro que se marca al pasar el mouse y sin parches puestos).
  function prepararPreview() {
    const principal = document.querySelector('svg.face:not(.face-preview)');
    const pv = document.getElementById('avatarPreview');
    pv.innerHTML = principal.innerHTML;
    pv.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
    pv.querySelectorAll('.ring, .hit, .eye-patch').forEach(e => e.remove());
    pv.querySelectorAll('.eye').forEach(e => {
      e.classList.remove('patched');
      ['role', 'tabindex', 'aria-label'].forEach(a => e.removeAttribute(a));
    });
  }
  function pintarBorrador() { aplicarAvatar(avatarBorrador, document.getElementById('avatarPreview')); }
  function cambioAvatar() { pintarBorrador(); renderPickersAvatar(); }

  function renderTabsAvatar() {
    const completo = esPlanCompleto();
    document.getElementById('avatarTabs').innerHTML = AV_TABS.map(t =>
      '<button type="button" role="tab" data-tab="' + t.id + '"' + (t.id === avTab ? ' class="active"' : '') + '>' +
      t.n + (t.premium && !completo ? ' 🔒' : '') + '</button>'
    ).join('');
  }
  // Plan gratis: solo género y peinado — las demás pestañas muestran el
  // aviso del plan completo (y el servidor también lo exige).
  function mostrarPaneAvatar() {
    const t = AV_TABS.find(x => x.id === avTab);
    const bloqueado = !!t.premium && !esPlanCompleto();
    document.querySelectorAll('.av-pane').forEach(p => p.classList.toggle('hidden', bloqueado || p.dataset.pane !== avTab));
    document.getElementById('avatarUpsell').classList.toggle('hidden', !bloqueado);
  }
  document.getElementById('avatarTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    avTab = b.dataset.tab;
    renderTabsAvatar(); mostrarPaneAvatar();
  });

  function renderPickersAvatar() {
    // Peinados: solo los que le corresponden a niñas o a niños.
    const genero = avatarBorrador.genero === 'niño' ? 'niño' : 'niña';
    document.getElementById('peinadoSeg').innerHTML = peinadosDe(genero).map(p =>
      '<button type="button" data-val="' + p.v + '"' + (p.v === avatarBorrador.peinado ? ' class="active"' : '') + '>' + p.n + '</button>'
    ).join('');
    document.getElementById('flequilloSeg').innerHTML = FLEQUILLOS_LISTA.map(f =>
      '<button type="button" data-val="' + f.v + '"' + (f.v === avatarBorrador.flequillo ? ' class="active"' : '') + '>' + f.n + '</button>'
    ).join('');
    document.querySelectorAll('#generoAvatarSeg button').forEach(b => b.classList.toggle('active', b.dataset.val === genero));
    // el moño es cosa de niñas
    document.getElementById('monoBlock').classList.toggle('hidden', genero === 'niño');
    document.getElementById('monoOn').classList.toggle('active', avatarBorrador.moño);
    document.getElementById('monoOff').classList.toggle('active', !avatarBorrador.moño);
    document.getElementById('colorMonoSwatches').style.opacity = avatarBorrador.moño ? '1' : '.4';
    document.getElementById('colorMonoSwatches').style.pointerEvents = avatarBorrador.moño ? 'auto' : 'none';
    crearSwatches(document.getElementById('colorPeloSwatches'), PALETA_PELO, avatarBorrador.colorPelo, (c) => { avatarBorrador.colorPelo = c; cambioAvatar(); });
    crearSwatches(document.getElementById('colorMonoSwatches'), PALETA_MONO, avatarBorrador.colorMoño, (c) => { avatarBorrador.colorMoño = c; cambioAvatar(); });
    crearSwatches(document.getElementById('colorOjosSwatches'), PALETA_OJOS, avatarBorrador.colorOjos, (c) => { avatarBorrador.colorOjos = c; cambioAvatar(); });
    crearSwatches(document.getElementById('colorRopaSwatches'), PALETA_ROPA, avatarBorrador.colorRopa, (c) => { avatarBorrador.colorRopa = c; cambioAvatar(); });
    // cuerpo, ropa, gorros, joyas… son del plan completo
    const grupos = { avExtrasCuerpo: 'cuerpo', avExtrasRopa: 'ropa', avExtrasAccesorios: 'accesorios' };
    Object.keys(grupos).forEach(id => {
      const cont = document.getElementById(id);
      if (esPlanCompleto()) renderControlesExtra(cont, avatarBorrador, cambioAvatar, grupos[id]);
      else cont.innerHTML = '';
    });
  }

  document.getElementById('btnPersonalizar').addEventListener('click', () => {
    const p = pacienteActual();
    if (!p) return;
    avatarBorrador = normalizarAvatar(p.avatar);
    document.getElementById('avatarNombre').value = p.nombre;
    avTab = 'general';
    prepararPreview();
    renderPickersAvatar();
    pintarBorrador();
    renderTabsAvatar(); mostrarPaneAvatar();
    document.getElementById('eliminarPacienteNombre').textContent = p.nombre;
    document.getElementById('eliminarPacienteConfirm').classList.add('hidden');
    abrirAvatarSheet();
  });
  document.getElementById('flequilloSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-val]');
    if (!b) return;
    avatarBorrador.flequillo = b.dataset.val; cambioAvatar();
  });
  document.getElementById('peinadoSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-val]');
    if (!b) return;
    avatarBorrador.peinado = b.dataset.val; cambioAvatar();
  });
  // Cambiar de niña a niño (o al revés): el peinado, el moño y los colores
  // de base pasan a los de ese género; en el plan completo se conservan los
  // colores que ya había elegido.
  document.getElementById('generoAvatarSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-val]');
    if (!b || b.dataset.val === avatarBorrador.genero) return;
    const g = b.dataset.val;
    const base = avatarPorDefecto(g);
    const previo = avatarBorrador;
    avatarBorrador = esPlanCompleto()
      ? { ...previo, genero: g, peinado: base.peinado, flequillo: base.flequillo, moño: base.moño, ropa: base.ropa, pantalon: base.pantalon }
      : { ...base };
    cambioAvatar();
  });
  document.getElementById('monoOn').addEventListener('click', () => { avatarBorrador.moño = true; cambioAvatar(); });
  document.getElementById('monoOff').addEventListener('click', () => { avatarBorrador.moño = false; cambioAvatar(); });

  function cancelarAvatar() { cerrarAvatarSheet(); }
  document.getElementById('closeAvatar').addEventListener('click', cancelarAvatar);
  document.getElementById('avatarCancelar').addEventListener('click', cancelarAvatar);
  avatarScrim.addEventListener('click', cancelarAvatar);
  document.getElementById('avatarGuardar').addEventListener('click', async () => {
    const p = pacienteActual();
    if (!p) return;
    const nombre = document.getElementById('avatarNombre').value.trim();
    if (!nombre) { showToast('El nombre no puede quedar vacío'); return; }
    try {
      await Pacientes.actualizarAvatar(p.id, avatarBorrador);
      p.avatar = avatarBorrador;
      if (nombre !== p.nombre) {
        await Pacientes.renombrar(p.id, nombre);
        p.nombre = nombre;
        renderPatientTabs();
      }
      aplicarAvatar(p.avatar);
      showToast('¡Guardado!');
      cerrarAvatarSheet();
    } catch (e) {
      showToast('No se pudo guardar, intenta de nuevo');
    }
  });

  document.getElementById('eliminarPacienteToggle').addEventListener('click', () => {
    document.getElementById('eliminarPacienteConfirm').classList.remove('hidden');
  });
  document.getElementById('eliminarPacienteNo').addEventListener('click', () => {
    document.getElementById('eliminarPacienteConfirm').classList.add('hidden');
  });
  document.getElementById('eliminarPacienteSi').addEventListener('click', async () => {
    const p = pacienteActual();
    if (!p) return;
    const btn = document.getElementById('eliminarPacienteSi');
    btn.disabled = true; btn.textContent = 'Eliminando…';
    try {
      await Pacientes.eliminar(p.id);
      pacientes = pacientes.filter(x => x.id !== p.id);
      cerrarAvatarSheet();
      showToast(p.nombre + ' fue eliminad@');

      if (!pacientes.length) {
        pararRealtime();
        if (timerTick) { clearInterval(timerTick); timerTick = null; }
        pacienteActualId = null;
        document.getElementById('noPacientes').classList.remove('hidden');
        document.getElementById('conPacientes').classList.add('hidden');
      } else if (pacienteActualId === p.id) {
        await cambiarPaciente(pacientes[0].id);
      } else {
        renderPatientTabs();
      }
    } catch (e) {
      showToast('No se pudo eliminar, intenta de nuevo');
    } finally {
      btn.disabled = false; btn.textContent = 'Sí, eliminar';
    }
  });

  async function cambiarPaciente(id) {
    pacienteActualId = id;
    localStorage.setItem('ocuparche_paciente_' + perfil.cuenta_id, id);
    renderPatientTabs();
    await cargarPaciente(id);
  }

  function pacienteActual() { return pacientes.find(p => p.id === pacienteActualId) || null; }

  async function cargarPaciente(id) {
    pararRealtime();
    aplicarAvatar((pacienteActual() || {}).avatar);
    try {
      entries = await DB.cargarRegistros(id);
      setBadge('ok');
    } catch (e) {
      entries = {};
      setBadge('down');
    }
    await cargarConfigPaciente(id, true);
    actualizarDuracionHint(duracionMinutos);
    if (esPlanCompleto()) {
      try {
        juegoMinutos = await Config.obtenerJuegoMinutos(id);
        document.getElementById('juegoMinutosInput').value = juegoMinutos;
        renderJuegoHint();
      } catch (e) { /* se queda con el valor por defecto */ }
    }
    renderAll();
    suscribirRealtime(id);
    if (!timerTick) timerTick = setInterval(renderTimer, 30000);
  }

  // Duración del parche + indicaciones, premio y control del paciente. `rellenar`:
  // volver a llenar el formulario (no se hace cuando el cambio llega en vivo desde
  // otro dispositivo, para no pisar lo que se esté escribiendo).
  async function cargarConfigPaciente(id, rellenar) {
    const cfg = await Config.obtener(id);
    duracionMinutos = cfg.duracion_minutos;
    trat = { ...tratamientoPorDefecto(), ...(esPlanCompleto() && cfg.tratamiento ? cfg.tratamiento : {}) };
    if (rellenar) {
      document.getElementById('duracionInput').value = duracionMinutos;
      rellenarFormTratamiento();
    }
  }

  function pararRealtime() {
    if (realtimeConn) { realtimeConn.cerrar(); realtimeConn = null; }
  }
  function suscribirRealtime(pacienteId) {
    realtimeConn = DB.suscribirRegistros(pacienteId, async () => {
      try {
        entries = await DB.cargarRegistros(pacienteId);
        if (esPlanCompleto()) await cargarConfigPaciente(pacienteId, false);
        renderAll(); setBadge('ok');
      }
      catch (e) { setBadge('down'); }
    });
  }

  // ================= GATING POR PLAN =================
  function renderGatingPlan() {
    const completo = esPlanCompleto();
    document.getElementById('timerLockedNote').classList.toggle('hidden', completo);
    document.getElementById('timerCard').classList.toggle('locked', !completo);
    document.getElementById('duracionBloque').classList.toggle('hidden', !completo);
    document.getElementById('duracionUpsell').classList.toggle('hidden', completo);

    document.getElementById('tratamientoBloque').classList.toggle('hidden', !completo);
    document.getElementById('tratamientoUpsell').classList.toggle('hidden', completo);
    document.getElementById('addFinBloque').classList.toggle('hidden', !completo);
    document.getElementById('informeBloque').classList.toggle('hidden', !completo);
    document.getElementById('informeUpsell').classList.toggle('hidden', completo);
    document.getElementById('juegoBloque').classList.toggle('hidden', !completo);
    document.getElementById('juegoUpsell').classList.toggle('hidden', completo);
    document.getElementById('openJuego').classList.toggle('hidden', !completo);
    document.getElementById('juegoUpsellPrincipal').classList.toggle('hidden', completo);

    const puedeInvitar = completo && perfil.role === 'admin';
    document.getElementById('inviteForm').classList.toggle('hidden', !puedeInvitar);
    document.getElementById('inviteUpsell').classList.toggle('hidden', completo || perfil.role !== 'admin');

    document.getElementById('cuentaFreeBloque').classList.toggle('hidden', completo || perfil.role !== 'admin');
    document.getElementById('cuentaCompletoBloque').classList.toggle('hidden', !completo);

    renderTimer();
  }

  // ================= TOQUE DE OJOS =================
  function wireEye(el, side) {
    function act() { onEyeTap(side); }
    el.addEventListener('click', act);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
  }
  async function onEyeTap(side) {
    if (!pacienteActualId) return;
    const id = Utils.todayId();
    const current = entries[id];
    if (current && current.ojo === side) {
      showToast('Ya registrado hoy en el ojo ' + Utils.label(side).toLowerCase());
      return;
    }
    const horaISO = new Date().toISOString();
    try {
      await DB.guardarRegistro(pacienteActualId, id, side, horaISO);
      entries[id] = { fecha: id, ojo: side, hora: horaISO, registradoPor: perfil.id };
      renderAll();
      const fueraDeIndicacion = esPlanCompleto() && trat.indicacion_ojo !== 'alternar' && trat.indicacion_ojo !== side;
      showToast('Registrado: ojo ' + Utils.label(side).toLowerCase() + ' a las ' + Utils.fmtTime(horaISO) +
        (fueraDeIndicacion ? ' — ojo: el oftalmólogo indicó el ' + trat.indicacion_ojo : ''));
    } catch (e) {
      showToast('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    }
  }

  // ================= RENDER =================
  function renderToday() {
    const today = new Date();
    document.getElementById('statusDate').textContent = 'Hoy, ' + Utils.fmtLong(today);
    const id = Utils.todayId();
    const rec = entries[id];
    const line = document.getElementById('statusLine');
    const hint = document.getElementById('hintChip');
    const undo = document.getElementById('undoBtn');
    document.getElementById('eyeDerecho').classList.toggle('patched', !!rec && rec.ojo === 'derecho');
    document.getElementById('eyeIzquierdo').classList.toggle('patched', !!rec && rec.ojo === 'izquierdo');

    // "Se sacó el parche": tiempo real de uso (plan completo)
    const sacar = document.getElementById('sacarBtn');
    sacar.classList.toggle('hidden', !(esPlanCompleto() && rec));
    sacar.classList.toggle('hecho', !!(rec && rec.horaFin));
    sacar.textContent = rec && rec.horaFin ? '↩ Deshacer «se sacó el parche»' : '🧢 Se sacó el parche';

    if (rec) {
      const autor = personasCache[rec.registradoPor];
      line.innerHTML = '🩹 <span class="pill ' + rec.ojo + '">' + Utils.label(rec.ojo) + '</span> · puesto a las ' + Utils.fmtTime(rec.hora) +
        (autor ? '<span class="status-by">Registrado por ' + Utils.esc(autor.nombre) + '</span>' : '');
      if (rec.horaFin) {
        line.insertAdjacentHTML('beforeend', '<span class="status-by">🧢 Se sacó a las ' + Utils.fmtTime(rec.horaFin) + ' · lo usó ' + duracionTxt(usoMs(rec)) + '</span>');
      }
      hint.innerHTML = '';
      undo.classList.remove('hidden');
    } else {
      line.innerHTML = '<span class="status-empty">Aún no registras el parche de hoy</span>';
      undo.classList.add('hidden');
      const ids = Object.keys(entries).filter(k => k !== id).sort();
      const last = ids.length ? entries[ids[ids.length - 1]] : null;
      if (esPlanCompleto() && !diaIndicado(today)) {
        hint.innerHTML = '<span class="hint-chip">😴 Hoy es día de descanso según la indicación — no hace falta parche</span>';
      } else if (esPlanCompleto() && trat.indicacion_ojo !== 'alternar') {
        hint.innerHTML = '<span class="hint-chip">🩺 Según el oftalmólogo, hoy toca el ojo ' + trat.indicacion_ojo + '</span>';
      } else if (last) {
        const suggestion = last.ojo === 'derecho' ? 'izquierdo' : 'derecho';
        hint.innerHTML = '<span class="hint-chip">💡 La última vez fue ojo ' + last.ojo + ' — hoy probablemente toca ' + suggestion + '</span>';
      } else {
        hint.innerHTML = '<span class="hint-chip">Toca un ojito para registrar el parche de hoy</span>';
      }
    }
  }

  function computeStats() {
    const e = Tratamiento.estadisticas(entries, confT());
    return { total: e.total, countD: e.countD, countI: e.countI, streak: e.racha, constancia: e.constancia };
  }

  function renderStats() {
    const s = computeStats();
    document.getElementById('statRacha').textContent = s.streak;
    document.getElementById('statTotal').textContent = s.total;
    document.getElementById('statConst').textContent = s.constancia + '%';

    const bar = document.getElementById('balanceBar');
    const totalSide = s.countD + s.countI;
    const pD = totalSide ? Math.round(100 * s.countD / totalSide) : 50;
    bar.innerHTML = '<div style="background:var(--brand);width:' + pD + '%"></div><div style="background:var(--teal);width:' + (100 - pD) + '%"></div>';
    document.getElementById('balDerechoLbl').textContent = 'Derecho ' + s.countD;
    document.getElementById('balIzquierdoLbl').textContent = 'Izquierdo ' + s.countI;
  }

  function renderCalendar() {
    const grid = document.getElementById('calGrid');
    grid.innerHTML = '';
    const todayD = new Date();
    const diasDesdeLunes = (todayD.getDay() + 6) % 7;
    const lunesActual = new Date(todayD);
    lunesActual.setDate(lunesActual.getDate() - diasDesdeLunes);
    const inicioGrilla = new Date(lunesActual);
    inicioGrilla.setDate(inicioGrilla.getDate() - 21);

    for (let i = 0; i < 28; i++) {
      const d = new Date(inicioGrilla);
      d.setDate(d.getDate() + i);
      const div = document.createElement('div');
      if (d > todayD) {
        div.className = 'cal-cell blank';
      } else {
        const id = Utils.dateId(d);
        const rec = entries[id];
        const descanso = !rec && !diaIndicado(d);
        div.className = 'cal-cell' + (rec ? ' ' + rec.ojo : '') + (id === Utils.todayId() ? ' today' : '') + (descanso ? ' libre' : '');
        div.textContent = d.getDate();
        div.title = Utils.fmtShort(d) + (rec ? ' · ' + Utils.label(rec.ojo) + ' · ' + Utils.fmtTime(rec.hora) + (rec.horaFin ? ' · usó ' + duracionTxt(usoMs(rec)) : '') : descanso ? ' · día libre de parche' : ' · sin registro');
      }
      grid.appendChild(div);
    }
  }

  function renderList() {
    const list = document.getElementById('list');
    const ids = Object.keys(entries).sort().reverse();
    if (!ids.length) {
      list.innerHTML = '<div class="empty-state"><span class="big">🩹</span>Aún no hay registros.<br>¡Toca un ojito para comenzar hoy!</div>';
      return;
    }
    list.innerHTML = '';
    ids.forEach(id => {
      const rec = entries[id];
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.id = id;
      if (pendingDelete === id) {
        row.classList.add('confirm');
        row.innerHTML =
          '<span class="side-dot ' + rec.ojo + '"></span>' +
          '<div class="txt"><div class="d1">¿Eliminar ' + Utils.fmtShort(Utils.parseId(id)) + '?</div></div>' +
          '<div class="confirm-actions"><button class="yes-del" data-act="yes">Sí</button><button class="no-del" data-act="no">No</button></div>';
      } else {
        const autor = personasCache[rec.registradoPor];
        row.innerHTML =
          '<span class="side-dot ' + rec.ojo + '"></span>' +
          '<div class="txt"><div class="d1">' + Utils.fmtShort(Utils.parseId(id)) + ' · ' + Utils.label(rec.ojo) + '</div>' +
          '<div class="d2">' + Utils.fmtTime(rec.hora) + (rec.horaFin ? ' · usó ' + duracionTxt(usoMs(rec)) : '') + (autor ? ' · ' + Utils.esc(autor.nombre) : '') + '</div></div>' +
          '<button class="del" data-act="del" title="Eliminar">🗑</button>';
      }
      list.appendChild(row);
    });
  }

  function renderAll() { renderToday(); renderStats(); renderCalendar(); renderList(); renderTimer(); renderTratamiento(); }

  // ================= TEMPORIZADOR =================
  function actualizarDuracionHint(minutos) {
    const h = Math.floor(minutos / 60), m = minutos % 60;
    const partes = [];
    if (h) partes.push(h + (h === 1 ? ' hora' : ' horas'));
    if (m || !h) partes.push(m + ' min');
    document.getElementById('duracionHint').textContent = 'Ahora mismo: ' + partes.join(' ');
  }

  function renderTimer() {
    const card = document.getElementById('timerCard');
    const text = document.getElementById('timerText');
    const sandTop = document.getElementById('sandTop');
    const sandBottom = document.getElementById('sandBottom');

    if (!esPlanCompleto()) {
      card.classList.add('idle'); card.classList.remove('done');
      sandTop.setAttribute('y', 26); sandTop.setAttribute('height', 110);
      sandBottom.setAttribute('y', 254); sandBottom.setAttribute('height', 0);
      text.textContent = 'El temporizador es parte del plan completo';
      return;
    }

    const rec = entries[Utils.todayId()];
    if (!rec) {
      card.classList.add('idle'); card.classList.remove('done');
      sandTop.setAttribute('y', 26); sandTop.setAttribute('height', 110);
      sandBottom.setAttribute('y', 254); sandBottom.setAttribute('height', 0);
      text.textContent = 'Cuando registres el parche, aquí vas a ver cuánto falta ⏳';
      return;
    }

    if (rec.horaFin) {
      card.classList.remove('idle'); card.classList.add('done');
      sandTop.setAttribute('y', 136); sandTop.setAttribute('height', 0);
      sandBottom.setAttribute('y', 144); sandBottom.setAttribute('height', 110);
      text.textContent = '🧢 Se sacó el parche a las ' + Utils.fmtTime(rec.horaFin) + ' · lo usó ' + duracionTxt(usoMs(rec)) + ' ✅';
      return;
    }

    const duracionMs = duracionMinutos * 60000;
    const transcurrido = Date.now() - new Date(rec.hora).getTime();
    const fraccion = Math.max(0, Math.min(1, transcurrido / duracionMs));

    const topApexY = 136, topStartY = 26;
    const nivelTop = topStartY + (topApexY - topStartY) * fraccion;
    sandTop.setAttribute('y', nivelTop);
    sandTop.setAttribute('height', Math.max(0, topApexY - nivelTop));

    const botApexY = 144, botStartY = 254;
    const nivelBot = botStartY - (botStartY - botApexY) * fraccion;
    sandBottom.setAttribute('y', Math.max(botApexY, nivelBot));
    sandBottom.setAttribute('height', Math.max(0, botStartY - nivelBot));

    if (fraccion >= 1) {
      card.classList.remove('idle'); card.classList.add('done');
      text.textContent = '¡Ya se puede sacar el parche! 🎉';
    } else {
      card.classList.remove('idle', 'done');
      const restanteMin = Math.max(1, Math.ceil((duracionMs - transcurrido) / 60000));
      const h = Math.floor(restanteMin / 60), m = restanteMin % 60;
      let frase;
      if (h > 0 && m > 0) frase = 'Falta' + (h > 1 || m > 0 ? 'n' : '') + ' ' + h + (h === 1 ? ' hora' : ' horas') + ' y ' + m + ' min';
      else if (h > 0) frase = 'Falta' + (h > 1 ? 'n' : '') + ' ' + h + (h === 1 ? ' hora' : ' horas');
      else frase = 'Falta' + (restanteMin > 1 ? 'n' : '') + ' ' + restanteMin + ' min';
      text.textContent = '⏳ ' + frase + ' para sacarle el parche';
    }
  }

  document.getElementById('duracionInput').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    if (v > 0) actualizarDuracionHint(v);
  });
  document.getElementById('duracionSave').addEventListener('click', async () => {
    const v = parseInt(document.getElementById('duracionInput').value, 10);
    if (!v || v <= 0) { showToast('Escribe un número de minutos válido'); return; }
    try {
      await Config.guardarDuracionMinutos(pacienteActualId, v);
      duracionMinutos = v;
      actualizarDuracionHint(v);
      renderTimer();
      showToast('Duración guardada');
    } catch (e) {
      showToast('No se pudo guardar: ' + (e.message || 'intenta de nuevo'));
    }
  });

  // ================= JUEGO DE VESTIR (js/juego.js) — plan completo =================
  document.getElementById('openJuego').addEventListener('click', () => {
    if (!pacienteActualId) return;
    Juego.abrir({
      pacienteId: pacienteActualId, minutosDia: juegoMinutos, toast: showToast,
      // los avatares de todos los hij@s de la cuenta aparecen como personajes
      hijos: pacientes.map(p => ({ id: p.id, nombre: p.nombre, avatar: p.avatar })),
      // el ojo con parche de hoy (para ponérselo en las fotos)
      parcheHoy: (entries[Utils.todayId()] || {}).ojo,
    });
  });

  function renderJuegoHint() {
    const quedan = Juego.minutosRestantesHoy(juegoMinutos);
    document.getElementById('juegoMinutosHint').textContent = quedan === Infinity
      ? 'Sin límite (0 minutos = se puede jugar todo lo que quiera).'
      : 'Hoy le quedan ' + quedan + ' min de juego en este dispositivo. Al acabarse, el juego se cierra solo hasta mañana. 0 = sin límite.';
  }

  document.getElementById('juegoMinutosSave').addEventListener('click', async () => {
    const v = parseInt(document.getElementById('juegoMinutosInput').value, 10);
    if (isNaN(v) || v < 0) { showToast('Escribe un número de minutos válido (0 = sin límite)'); return; }
    if (!pacienteActualId) return;
    try {
      await Config.guardarJuegoMinutos(pacienteActualId, v);
      juegoMinutos = v;
      renderJuegoHint();
      showToast('Tiempo de juego guardado');
    } catch (e) {
      showToast('No se pudo guardar: ' + (e.message || 'intenta de nuevo'));
    }
  });

  document.getElementById('juegoMasTiempo').addEventListener('click', () => {
    Juego.darMasTiempo();
    renderJuegoHint();
    showToast('Listo, la cuenta de hoy empieza de nuevo');
  });

  // Pide un segundo toque para confirmar, igual que dentro del juego.
  let confirmarResetTodos = null;
  document.getElementById('juegoResetTodos').addEventListener('click', async () => {
    const b = document.getElementById('juegoResetTodos');
    if (!confirmarResetTodos) {
      b.textContent = '¿Seguro? Toca otra vez para restablecer';
      confirmarResetTodos = setTimeout(() => { confirmarResetTodos = null; b.textContent = b.dataset.txt; }, 3000);
      return;
    }
    clearTimeout(confirmarResetTodos); confirmarResetTodos = null;
    b.textContent = b.dataset.txt;
    try {
      await Juego.restablecerTodos();
      showToast('Todos los personajes quedaron en blanco');
    } catch (e) {
      showToast('No se pudo restablecer: ' + (e.message || 'intenta de nuevo'));
    }
  });

  // ================= AVISOS (push) =================
  async function refrescarEstadoAvisos() {
    const btn = document.getElementById('pushToggle');
    const hint = document.getElementById('pushHint');
    if (!esPlanCompleto()) return;
    if (!Push.soportado()) {
      btn.classList.add('hidden');
      hint.textContent = 'Los avisos automáticos todavía no están configurados en esta app.';
      return;
    }
    if (!Push.instalada()) {
      btn.classList.add('hidden');
      hint.textContent = 'Para recibir avisos, primero agrega esta app a tu pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ese ícono.';
      return;
    }
    btn.classList.remove('hidden');
    const suscrito = await Push.estaSuscrito();
    btn.classList.toggle('active', suscrito);
    btn.textContent = suscrito ? '🔔 Avisos activados en este dispositivo' : '🔔 Activar avisos en este dispositivo';
    hint.textContent = suscrito ? 'Toca el botón para desactivarlos en este dispositivo.' : '';
  }
  document.getElementById('pushToggle').addEventListener('click', async () => {
    const btn = document.getElementById('pushToggle');
    btn.disabled = true;
    try {
      if (btn.classList.contains('active')) { await Push.desactivar(); showToast('Avisos desactivados en este dispositivo'); }
      else { await Push.activar(); showToast('¡Avisos activados!'); }
    } catch (e) {
      showToast(e.message || 'No se pudo cambiar los avisos');
    } finally {
      btn.disabled = false;
      refrescarEstadoAvisos();
    }
  });

  // ================= PERSONAS / INVITAR =================
  async function cargarPersonas() {
    const personas = await Auth.listarPersonas();
    personasCache = {};
    personas.forEach(p => { personasCache[p.id] = p; });
    const list = document.getElementById('peopleList');
    list.innerHTML = personas.map(p =>
      '<div class="person-row"><span class="p-name">' + Utils.esc(p.nombre) + '</span>' +
      (p.role === 'admin' ? '<span class="badge-admin">Admin</span>' : '') +
      '</div>'
    ).join('');
    renderToday(); renderList();
  }

  document.getElementById('inviteSend').addEventListener('click', async () => {
    const email = document.getElementById('inviteEmail').value.trim();
    const nombre = document.getElementById('inviteNombre').value.trim();
    const err = document.getElementById('inviteError');
    err.classList.add('hidden');
    if (!email) { err.textContent = 'Escribe un correo.'; err.classList.remove('hidden'); return; }
    const btn = document.getElementById('inviteSend');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await Auth.invitarPersona(email, nombre);
      document.getElementById('inviteEmail').value = '';
      document.getElementById('inviteNombre').value = '';
      showToast('Invitación enviada a ' + email);
      await cargarPersonas();
    } catch (e) {
      err.textContent = e.message || 'No se pudo invitar, intenta de nuevo';
      err.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Enviar invitación';
    }
  });

  // ================= CÓDIGO DE ACTIVACIÓN =================
  document.getElementById('codigoSend').addEventListener('click', async () => {
    const codigo = document.getElementById('codigoInput').value.trim();
    const err = document.getElementById('codigoError');
    err.classList.add('hidden');
    if (!codigo) { err.textContent = 'Escribe el código.'; err.classList.remove('hidden'); return; }
    try {
      await Auth.canjearCodigo(codigo);
      const sesion = await Auth.getSesionYPerfil();
      if (sesion) cuenta = sesion.cuenta;
      renderCuenta();
      renderGatingPlan();
      showToast('¡Plan completo activado! 🎉');
      document.getElementById('codigoInput').value = '';
    } catch (e) {
      err.textContent = e.message || 'Código inválido';
      err.classList.remove('hidden');
    }
  });

  // El panel de administrador de plataforma (estadísticas, clientes,
  // solicitudes, generador de códigos) vive aparte en panel.html/panel.js —
  // no se mezcla con la app familiar.

  // ================= interacciones del historial =================
  document.getElementById('list').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const row = e.target.closest('.row');
    const id = row.dataset.id;
    const act = btn.dataset.act;
    if (act === 'del') { pendingDelete = id; renderList(); }
    else if (act === 'no') { pendingDelete = null; renderList(); }
    else if (act === 'yes') {
      pendingDelete = null;
      DB.eliminarRegistro(pacienteActualId, id)
        .then(() => { delete entries[id]; renderAll(); })
        .catch(() => showToast('No se pudo eliminar, intenta de nuevo'));
    }
  });

  document.getElementById('undoBtn').addEventListener('click', () => {
    const id = Utils.todayId();
    DB.eliminarRegistro(pacienteActualId, id)
      .then(() => { delete entries[id]; renderAll(); showToast('Registro de hoy eliminado'); })
      .catch(() => showToast('No se pudo deshacer, intenta de nuevo'));
  });

  const sheet = document.getElementById('sheet'), scrim = document.getElementById('scrim');
  function openSheet() { sheet.classList.add('show'); scrim.classList.add('show'); }
  function closeSheet() { sheet.classList.remove('show'); scrim.classList.remove('show'); }
  document.getElementById('openHistory').addEventListener('click', () => { openSheet(); refrescarEstadoAvisos(); });
  document.getElementById('closeHistory').addEventListener('click', closeSheet);
  scrim.addEventListener('click', closeSheet);

  const addForm = document.getElementById('addForm'), addToggle = document.getElementById('addToggle');
  let chosenSide = 'derecho';
  addToggle.addEventListener('click', () => {
    const showing = addForm.classList.toggle('show');
    if (showing) {
      document.getElementById('addDate').value = Utils.todayId();
      const now = new Date();
      document.getElementById('addTime').value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }
  });
  document.getElementById('addCancel').addEventListener('click', () => addForm.classList.remove('show'));
  addForm.querySelectorAll('.seg button').forEach(b => {
    b.addEventListener('click', () => {
      chosenSide = b.dataset.side;
      addForm.querySelectorAll('.seg button').forEach(x => x.classList.toggle('active', x === b));
    });
  });
  document.getElementById('addSave').addEventListener('click', async () => {
    const dateVal = document.getElementById('addDate').value;
    const timeVal = document.getElementById('addTime').value || '09:00';
    if (!dateVal) { showToast('Elige una fecha'); return; }
    const iso = new Date(dateVal + 'T' + timeVal + ':00').toISOString();
    const finVal = esPlanCompleto() ? document.getElementById('addFin').value : '';
    const finIso = finVal ? new Date(dateVal + 'T' + finVal + ':00').toISOString() : null;
    if (finIso && new Date(finIso) <= new Date(iso)) { showToast('La hora en que se sacó debe ser después de la hora en que se puso'); return; }
    try {
      await DB.guardarRegistro(pacienteActualId, dateVal, chosenSide, iso);
      entries[dateVal] = { fecha: dateVal, ojo: chosenSide, hora: iso, horaFin: null, registradoPor: perfil.id };
      if (finIso) {
        await DB.sacarParche(pacienteActualId, dateVal, finIso);
        entries[dateVal].horaFin = finIso;
      }
      document.getElementById('addFin').value = '';
      renderAll();
      addForm.classList.remove('show');
      showToast('Registro guardado');
    } catch (e) { showToast('No se pudo guardar, intenta de nuevo'); }
  });

  // ================= CONTROL DEL TRATAMIENTO (plan completo) =================
  // Portado de Ojitos de Mili: tiempo real de uso, indicación del oftalmólogo
  // (qué ojo y qué días), premio por constancia, próximo control y resumen semanal.
  function tratamientoPorDefecto() {
    return {
      indicacion_ojo: 'alternar', indicacion_dias: [0, 1, 2, 3, 4, 5, 6], premio_meta: null, premio_texto: null,
      control_fecha: null, control_hora: null, control_detalle: null, control_preguntas: null, resumen_activo: 1,
    };
  }
  function diaIndicado(d) { return trat.indicacion_dias.includes(d.getDay()); }
  function usoMs(rec) { return rec && rec.horaFin ? new Date(rec.horaFin) - new Date(rec.hora) : 0; }
  function duracionTxt(ms) {
    const min = Math.max(1, Math.round(ms / 60000));
    const h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min';
  }
  // Config del tratamiento en el formato de js/tratamiento.js (cuentas y informe).
  function confT() { return Tratamiento.desdeApi(trat, duracionMinutos); }

  function durCorta(min) {
    min = Math.round(min);
    const h = Math.floor(min / 60), m = min % 60;
    return h ? h + 'h' + (m ? String(m).padStart(2, '0') : '') : m + 'm';
  }

  // Premio de la semana, próximo control y gráfico "Esta semana".
  function renderTratamiento() {
    const $ = (id) => document.getElementById(id);
    const completo = esPlanCompleto() && !!pacienteActualId;
    const conf = confT();

    // --- premio por constancia (tarjeta de la pantalla principal) ---
    const card = $('premioCard');
    const p = completo ? Tratamiento.premio(entries, conf) : null;
    if (!p) card.classList.add('hidden');
    else {
      card.classList.remove('hidden');
      card.classList.toggle('logrado', p.logrado);
      const texto = Utils.esc(p.texto);
      const dias = p.dias.map((x) => '<span class="pr-dia' + (x.rec ? ' hecho' : '') + (x.futuro ? ' futuro' : '') + (!x.indicado ? ' libre' : '') + (x.hoy ? ' hoy' : '') + '">' +
        '<i>' + (x.rec ? '⭐' : '') + '</i><b>' + x.corto + '</b></span>').join('');
      card.innerHTML =
        '<div class="pr-titulo">' + (p.logrado ? '🎉 ¡Lo lograste! Ganó: ' + texto : '🏆 Premio de la semana: ' + texto) + '</div>' +
        '<div class="pr-sub">' + (p.logrado ? p.hechos + ' días con parche esta semana 💖' : p.hechos + ' de ' + p.meta + ' días · ¡faltan' + (p.faltan > 1 ? ' ' : ' ') + p.faltan + '!') + '</div>' +
        '<div class="pr-dias">' + dias + '</div>';
    }

    // --- próximo control ---
    const b = $('controlCard');
    const c = completo ? Tratamiento.control(conf) : null;
    if (!c) b.classList.add('hidden');
    else {
      b.classList.remove('hidden');
      b.classList.toggle('pronto', c.dias <= 1);
      b.textContent = '👁️ Control con el oftalmólogo ' + c.cuando + ' · ' + c.fecha;
    }

    // --- esta semana (gráfico del historial) ---
    const dias = Tratamiento.semana(entries, conf);
    const tope = Math.max(conf.duracion * 1.25, ...dias.map(x => (x.uso ? x.uso.min : 0)));
    const meta = Math.round(100 * conf.duracion / tope);
    $('semanaGraf').innerHTML = dias.map((x) => {
      const min = x.uso ? x.uso.min : 0;
      const cls = 'sem-dia' + (x.hoy ? ' hoy' : '') + (!x.indicado ? ' libre' : '') + (x.futuro ? ' futuro' : '') +
        (x.rec ? ' ' + x.rec.ojo : '') + (x.uso && x.uso.estimado ? ' estimado' : '') + (x.uso && x.uso.enCurso ? ' encurso' : '');
      const etq = x.rec ? durCorta(min) : (!x.indicado ? 'libre' : (x.futuro || x.hoy ? '' : '—'));
      return '<div class="' + cls + '"><div class="sem-barra"><i style="bottom:' + meta + '%"></i><span style="height:' + Math.round(100 * min / tope) + '%"></span></div>' +
        '<b>' + x.corto + '</b><small>' + etq + '</small></div>';
    }).join('');
    const indicados = dias.filter(x => x.indicado && !x.futuro).length;
    const hechos = dias.filter(x => x.rec && x.indicado).length;
    const total = dias.reduce((sum, x) => sum + (x.uso ? x.uso.min : 0), 0);
    const estimados = dias.filter(x => x.uso && x.uso.estimado).length;
    $('semanaResumen').textContent = hechos + ' de ' + indicados + ' días hasta hoy · ' + Tratamiento.fmtDur(total) + ' con el parche' +
      (estimados ? ' (' + estimados + ' día' + (estimados > 1 ? 's' : '') + ' sin hora de sacado: se estimó la duración indicada)' : '') + '.';
  }

  function rellenarFormTratamiento() {
    const $ = (id) => document.getElementById(id);
    document.querySelectorAll('#indOjoSeg button').forEach(b => b.classList.toggle('active', b.dataset.val === trat.indicacion_ojo));
    document.querySelectorAll('#indDiasSeg button').forEach(b => b.classList.toggle('active', trat.indicacion_dias.includes(Number(b.dataset.dia))));
    $('premioMeta').value = trat.premio_meta ? String(trat.premio_meta) : '';
    $('premioTextoInput').value = trat.premio_texto || '';
    $('controlFechaInput').value = trat.control_fecha || '';
    $('controlHoraInput').value = trat.control_hora || '';
    $('controlDetalleInput').value = trat.control_detalle || '';
    $('controlPreguntasInput').value = trat.control_preguntas || '';
    $('resumenActivo').checked = trat.resumen_activo !== 0;
  }

  document.getElementById('indOjoSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-val]');
    if (b) document.querySelectorAll('#indOjoSeg button').forEach(x => x.classList.toggle('active', x === b));
  });
  document.getElementById('indDiasSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-dia]');
    if (b) b.classList.toggle('active');
  });
  document.getElementById('tratamientoGuardar').addEventListener('click', async () => {
    if (!pacienteActualId) return;
    const $ = (id) => document.getElementById(id);
    const ojoBtn = document.querySelector('#indOjoSeg button.active');
    const dias = [...document.querySelectorAll('#indDiasSeg button.active')].map(b => Number(b.dataset.dia));
    if (!dias.length) { showToast('Marca al menos un día de la semana'); return; }
    const nuevo = {
      indicacion_ojo: ojoBtn ? ojoBtn.dataset.val : 'alternar',
      indicacion_dias: dias,
      premio_meta: $('premioMeta').value ? Number($('premioMeta').value) : null,
      premio_texto: $('premioTextoInput').value.trim() || null,
      control_fecha: $('controlFechaInput').value || null,
      control_hora: $('controlHoraInput').value || null,
      control_detalle: $('controlDetalleInput').value.trim() || null,
      control_preguntas: $('controlPreguntasInput').value.trim() || null,
      resumen_activo: $('resumenActivo').checked ? 1 : 0,
    };
    try {
      await Config.guardarTratamiento(pacienteActualId, nuevo);
      trat = nuevo;
      renderAll();
      showToast('Tratamiento guardado');
    } catch (e) { showToast(e.message || 'No se pudo guardar, intenta de nuevo'); }
  });

  document.getElementById('sacarBtn').addEventListener('click', async () => {
    const id = Utils.todayId();
    const rec = entries[id];
    if (!rec || !pacienteActualId) return;
    const nueva = rec.horaFin ? null : new Date().toISOString();
    try {
      await DB.sacarParche(pacienteActualId, id, nueva);
      rec.horaFin = nueva;
      renderAll();
      showToast(nueva ? 'Anotado: se sacó el parche a las ' + Utils.fmtTime(nueva) : 'Listo, sigue con el parche puesto');
    } catch (e) { showToast(e.message || 'No se pudo guardar, intenta de nuevo'); }
  });

  document.getElementById('controlCard').addEventListener('click', () => {
    openSheet(); refrescarEstadoAvisos();
    setTimeout(() => document.getElementById('tratamientoSeccion').scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  });

  // --- informe para el doctor ---
  let informeActual = null;
  document.getElementById('infVer').addEventListener('click', () => {
    if (!pacienteActualId) return;
    const dias = parseInt(document.getElementById('infPeriodo').value, 10) || 28;
    const desde = new Date(); desde.setDate(desde.getDate() - (dias - 1));
    informeActual = Tratamiento.informe(entries, confT(), Utils.dateId(desde), Utils.todayId(), (pacienteActual() || {}).nombre);
    document.getElementById('infHoja').innerHTML = informeActual.html;
    document.getElementById('informe').classList.remove('hidden');
    document.body.classList.add('con-informe');
  });
  document.getElementById('infCerrar').addEventListener('click', () => {
    document.getElementById('informe').classList.add('hidden');
    document.body.classList.remove('con-informe');
  });
  document.getElementById('infImprimir').addEventListener('click', () => window.print());
  document.getElementById('infCompartir').addEventListener('click', async () => {
    if (!informeActual) return;
    try {
      if (navigator.share) { await navigator.share({ title: informeActual.titulo, text: informeActual.texto }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(informeActual.texto); showToast('Informe copiado: pégalo en WhatsApp o en un correo'); }
    catch (e) { showToast('No se pudo compartir: usa "PDF"'); }
  });

  // ================= arranque =================
  // Red de seguridad: cualquier error que se nos haya escapado de un try/catch
  // ya no queda mudo — al menos avisa con un toast, en vez de dejar la app
  // "pegada" sin ninguna pista de qué pasó.
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Promesa sin capturar:', e.reason);
    showToast('Ocurrió un error. Si la app se ve pegada, recarga la página.');
  });
  window.addEventListener('error', (e) => {
    console.error('Error sin capturar:', e.error || e.message);
  });

  async function boot() {
    wireLogin();
    wireEye(document.getElementById('eyeDerecho'), 'derecho');
    wireEye(document.getElementById('eyeIzquierdo'), 'izquierdo');
    try {
      await arrancarSesion();
    } catch (e) {
      console.error('arrancarSesion falló', e);
      showToast('No se pudo cargar la app. Recarga la página.');
      showOverlay('authLogin');
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
