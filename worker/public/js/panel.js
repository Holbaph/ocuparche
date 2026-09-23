// panel.js — panel de administrador de plataforma. Completamente aparte de
// app.js/core.js/avatar.js (que son de la app familiar) — solo comparte
// api.js y auth.js (el objeto Admin).

(function () {
  'use strict';

  const OVERLAYS = ['panelLoading', 'panelLoginPaso1', 'panelLoginPaso2', 'panelSinAcceso'];
  let toastTimer = null;
  let pendienteLogin = null; // id que devuelve el paso 1, se usa en el paso 2

  function showOverlay(id) {
    OVERLAYS.forEach(o => document.getElementById(o).classList.toggle('hidden', o !== id));
    document.getElementById('panelDashboard').classList.add('hidden');
  }
  function showDashboard() {
    OVERLAYS.forEach(o => document.getElementById(o).classList.add('hidden'));
    document.getElementById('panelDashboard').classList.remove('hidden');
  }
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ================= LOGIN EN DOS PASOS =================
  function wireLogin() {
    document.getElementById('btnP1').addEventListener('click', async () => {
      const email = document.getElementById('p1Email').value.trim();
      const password = document.getElementById('p1Password').value;
      const err = document.getElementById('p1Error');
      err.classList.add('hidden');
      try {
        const resp = await Admin.loginPaso1(email, password);
        pendienteLogin = resp.pendiente;
        document.getElementById('p2Codigo').value = '';
        document.getElementById('p2Setup').classList.toggle('hidden', !resp.configurarTotp);
        document.getElementById('p2Titulo').textContent = resp.configurarTotp ? 'Configura tu autenticador' : 'Código del autenticador';
        document.getElementById('p2Subtitulo').textContent = resp.configurarTotp
          ? 'Agrega la cuenta con la clave de abajo y después escribe el código que te muestre'
          : 'Abre tu app de autenticación y escribe el código de 6 dígitos';
        if (resp.configurarTotp) document.getElementById('p2Secreto').textContent = formatearSecreto(resp.secreto);
        showOverlay('panelLoginPaso2');
      } catch (e) {
        err.textContent = e.message || 'Correo o contraseña incorrectos';
        err.classList.remove('hidden');
      }
    });

    document.getElementById('btnP2').addEventListener('click', async () => {
      const codigo = document.getElementById('p2Codigo').value.trim();
      const err = document.getElementById('p2Error');
      err.classList.add('hidden');
      try {
        await Admin.loginPaso2(pendienteLogin, codigo);
        await arrancar();
      } catch (e) {
        err.textContent = e.message || 'Código incorrecto';
        err.classList.remove('hidden');
      }
    });

    document.getElementById('btnP2Volver').addEventListener('click', () => {
      pendienteLogin = null;
      showOverlay('panelLoginPaso1');
    });

    document.getElementById('btnSalirSinAcceso').addEventListener('click', async () => {
      await Auth.logout();
      showOverlay('panelLoginPaso1');
    });

    document.getElementById('btnLogout').addEventListener('click', async () => {
      await Auth.logout();
      showOverlay('panelLoginPaso1');
    });
  }

  // ================= ARRANQUE =================
  async function arrancar() {
    showOverlay('panelLoading');
    let sesion = null;
    try { sesion = await Auth.getSesionYPerfil(); } catch (e) { console.error(e); }

    if (!sesion) { showOverlay('panelLoginPaso1'); return; }
    if (!sesion.perfil.es_dueño) { showOverlay('panelSinAcceso'); return; }

    showDashboard();
    cargarTodo();
  }

  async function cargarTodo() {
    await Promise.all([cargarStats(), cargarSolicitudes(), cargarClientes(), cargarCodigos()]);
  }

  // ================= ESTADÍSTICAS =================
  async function cargarStats() {
    try {
      const stats = await Admin.estadisticas();
      if (!stats) return;
      document.getElementById('statClientes').textContent = stats.total_cuentas ?? '–';
      document.getElementById('statCompleto').textContent = stats.cuentas_completo ?? '–';
      document.getElementById('statAdmins').textContent = stats.total_admins ?? '–';
      document.getElementById('statUsers').textContent = stats.total_users ?? '–';
      document.getElementById('statPacientes').textContent = stats.total_pacientes ?? '–';
      document.getElementById('statRegistros').textContent = stats.total_registros ?? '–';
      document.getElementById('statCodigosLibres').textContent = stats.codigos_libres ?? '–';
    } catch (e) { console.error('No se pudieron cargar las estadísticas', e); }
  }

  // ================= CLIENTES =================
  async function cargarClientes() {
    try {
      const clientes = await Admin.listarClientes();
      const list = document.getElementById('clientesList');
      if (!clientes.length) { list.innerHTML = '<div class="empty-state">Todavía no hay clientes registrados.</div>'; return; }
      list.innerHTML = clientes.map(renderCliente).join('');
    } catch (e) { console.error('No se pudo cargar la lista de clientes', e); }
  }

  function renderCliente(c) {
    const fecha = c.created_at ? new Date(c.created_at).toLocaleDateString('es-CL') : '–';
    const plan = c.plan === 'completo' ? 'completo' : 'free';
    return '<div class="cliente-item" data-id="' + c.id + '">' +
      '<div class="c-top">' +
        '<span class="c-nombre">' + escapeHtml(c.admin_nombre || 'Sin nombre') + '</span>' +
        '<span class="c-plan ' + plan + '">' + plan + '</span>' +
      '</div>' +
      '<span class="c-meta">' + escapeHtml(c.admin_email || '') + '</span>' +
      '<span class="c-meta">' + c.num_personas + ' persona(s) · ' + c.num_pacientes + ' paciente(s) · alta ' + fecha + '</span>' +
      (c.codigo_usado ? '<span class="c-meta">Código de activación: <code>' + escapeHtml(c.codigo_usado) + '</code></span>' : '') +
      '<div class="c-botones">' +
        '<button class="add-toggle" data-act="avatares-toggle">🎨 Avatares</button>' +
        '<button class="add-toggle" style="color:var(--danger);border-color:var(--danger)" data-act="eliminar-cliente-toggle">🗑️ Eliminar</button>' +
      '</div>' +
      '<div class="c-avatares hidden"></div>' +
      '<div class="c-confirm hidden">' +
        '<p style="font-size:12.5px;color:var(--brand-dark);margin:8px 0">Esto borra la cuenta de <b>' + escapeHtml(c.admin_nombre || c.admin_email || '') + '</b> — sus hij@s, registros y personas invitadas — sin poder deshacerlo. ¿Seguro?</p>' +
        '<div class="s-acciones">' +
          '<button class="s-atender" data-act="eliminar-cliente-si">Sí, eliminar</button>' +
          '<button class="s-rechazar" data-act="eliminar-cliente-no">Cancelar</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function wireClientes() {
    document.getElementById('clientesList').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const item = e.target.closest('.cliente-item');
      const id = item.dataset.id;
      const act = btn.dataset.act;
      if (act === 'eliminar-cliente-toggle') {
        item.querySelector('.c-confirm').classList.toggle('hidden');
      } else if (act === 'eliminar-cliente-no') {
        item.querySelector('.c-confirm').classList.add('hidden');
      } else if (act === 'eliminar-cliente-si') {
        btn.disabled = true;
        try {
          await Admin.eliminarCuenta(id);
          showToast('Cuenta eliminada');
          await cargarClientes();
          await cargarStats();
        } catch (err) {
          showToast(err.message || 'No se pudo eliminar');
          btn.disabled = false;
        }
      } else if (act === 'avatares-toggle') {
        await toggleAvatares(item, id);
      }
    });
  }

  // ================= AVATARES (herramienta de soporte) =================
  // Deja ver y corregir el avatar de cualquier hij@ de cualquier cuenta —
  // sin vista previa de la carita (esto es una herramienta de soporte, no
  // la app), pero con los mismos selectores y paletas de siempre.
  const avatarEditores = {}; // pacienteId -> borrador en memoria

  async function toggleAvatares(item, cuentaId) {
    const cont = item.querySelector('.c-avatares');
    if (!cont.classList.contains('hidden')) { cont.classList.add('hidden'); return; }
    cont.classList.remove('hidden');
    if (cont.dataset.cargado) return;
    cont.innerHTML = '<p class="empty-state">Cargando…</p>';
    try {
      const pacientes = await Admin.listarPacientesDeCuenta(cuentaId);
      cont.innerHTML = pacientes.length
        ? pacientes.map(renderAvatarEditor).join('')
        : '<div class="empty-state">Esta cuenta no tiene hij@s.</div>';
      cont.dataset.cargado = '1';
      wireAvatarEditores(cont);
    } catch (err) {
      cont.innerHTML = '<div class="empty-state">No se pudo cargar</div>';
    }
  }

  function renderAvatarEditor(p) {
    const a = { ...avatarPorDefecto(p.avatar?.genero || 'niña'), ...(p.avatar || {}) };
    avatarEditores[p.id] = a;
    return '<div class="avatar-editor" data-pid="' + p.id + '">' +
      '<p class="s-nombre">' + escapeHtml(p.nombre) + '</p>' +
      '<div class="seg wrap" data-role="peinado">' +
        ['corto', 'largo', 'rizado', 'coleta'].map(v =>
          '<button type="button" data-val="' + v + '">' + v.charAt(0).toUpperCase() + v.slice(1) + '</button>'
        ).join('') +
      '</div>' +
      '<div class="swatch-row" data-role="pelo" style="margin-top:8px"></div>' +
      '<div class="seg" style="margin-top:8px">' +
        '<button type="button" data-role="mono-on">Con moño</button>' +
        '<button type="button" data-role="mono-off">Sin moño</button>' +
      '</div>' +
      '<div class="swatch-row" data-role="mono-color" style="margin-top:8px"></div>' +
      '<div class="swatch-row" data-role="ojos" style="margin-top:8px"></div>' +
      '<div class="swatch-row" data-role="ropa" style="margin-top:8px"></div>' +
      '<button class="btn-save small" style="margin-top:10px;width:100%" data-role="guardar">Guardar avatar</button>' +
    '</div>';
  }

  function pintarEditor(el, pid) {
    const a = avatarEditores[pid];
    el.querySelectorAll('[data-role="peinado"] button').forEach(b => b.classList.toggle('active', b.dataset.val === a.peinado));
    el.querySelector('[data-role="mono-on"]').classList.toggle('active', a.moño);
    el.querySelector('[data-role="mono-off"]').classList.toggle('active', !a.moño);
    const monoColorRow = el.querySelector('[data-role="mono-color"]');
    monoColorRow.style.opacity = a.moño ? '1' : '.4';
    monoColorRow.style.pointerEvents = a.moño ? 'auto' : 'none';
    crearSwatches(el.querySelector('[data-role="pelo"]'), PALETA_PELO, a.colorPelo, (c) => { a.colorPelo = c; pintarEditor(el, pid); });
    crearSwatches(monoColorRow, PALETA_MONO, a.colorMoño, (c) => { a.colorMoño = c; pintarEditor(el, pid); });
    crearSwatches(el.querySelector('[data-role="ojos"]'), PALETA_OJOS, a.colorOjos, (c) => { a.colorOjos = c; pintarEditor(el, pid); });
    crearSwatches(el.querySelector('[data-role="ropa"]'), PALETA_ROPA, a.colorRopa, (c) => { a.colorRopa = c; pintarEditor(el, pid); });
  }

  function wireAvatarEditores(container) {
    container.querySelectorAll('.avatar-editor').forEach((el) => {
      const pid = el.dataset.pid;
      pintarEditor(el, pid);
      el.querySelectorAll('[data-role="peinado"] button').forEach((b) => {
        b.addEventListener('click', () => { avatarEditores[pid].peinado = b.dataset.val; pintarEditor(el, pid); });
      });
      el.querySelector('[data-role="mono-on"]').addEventListener('click', () => { avatarEditores[pid].moño = true; pintarEditor(el, pid); });
      el.querySelector('[data-role="mono-off"]').addEventListener('click', () => { avatarEditores[pid].moño = false; pintarEditor(el, pid); });
      el.querySelector('[data-role="guardar"]').addEventListener('click', async () => {
        try {
          const guardado = await Admin.actualizarAvatarPaciente(pid, avatarEditores[pid]);
          avatarEditores[pid] = { ...avatarEditores[pid], ...guardado };
          pintarEditor(el, pid);
          showToast('Avatar actualizado');
        } catch (err) {
          showToast(err.message || 'No se pudo guardar');
        }
      });
    });
  }

  // ================= SOLICITUDES =================
  async function cargarSolicitudes() {
    try {
      const solicitudes = await Admin.listarSolicitudes();
      const pendientes = solicitudes.filter(s => s.estado === 'pendiente');
      const resto = solicitudes.filter(s => s.estado !== 'pendiente');

      const pendList = document.getElementById('solicitudesPendientes');
      pendList.innerHTML = pendientes.length
        ? pendientes.map(renderSolicitud).join('')
        : '<div class="empty-state">No hay solicitudes pendientes 🎉</div>';

      const histList = document.getElementById('solicitudesHistorial');
      histList.innerHTML = resto.length
        ? resto.map(renderSolicitud).join('')
        : '<div class="empty-state">Todavía no hay historial.</div>';
    } catch (e) { console.error('No se pudo cargar la cola de solicitudes', e); }
  }

  function renderSolicitud(s) {
    const fecha = s.created_at ? new Date(s.created_at).toLocaleDateString('es-CL') : '–';
    let acciones = '';
    if (s.estado === 'pendiente') {
      acciones = '<div class="s-acciones">' +
        '<button class="s-atender" data-act="atender" data-id="' + s.id + '">Generar y enviar</button>' +
        '<button class="s-rechazar" data-act="rechazar" data-id="' + s.id + '">Rechazar</button>' +
      '</div>';
    } else if (s.codigo) {
      acciones = '<span class="s-meta">Código: <code>' + escapeHtml(s.codigo) + '</code></span>';
    }
    return '<div class="solicitud-item">' +
      '<div class="s-top">' +
        '<span class="s-nombre">' + escapeHtml(s.nombre) + '</span>' +
        '<span class="s-estado ' + s.estado + '">' + s.estado + '</span>' +
      '</div>' +
      '<span class="s-meta">' + escapeHtml(s.email) + ' · ' + fecha + '</span>' +
      (s.nota ? '<span class="s-meta">' + escapeHtml(s.nota) + '</span>' : '') +
      acciones +
    '</div>';
  }

  function wireSolicitudes() {
    document.getElementById('agregarSolicitudToggle').addEventListener('click', () => {
      document.getElementById('agregarSolicitudForm').classList.toggle('hidden');
    });

    document.getElementById('solGuardar').addEventListener('click', async () => {
      const nombre = document.getElementById('solNombre').value.trim();
      const email = document.getElementById('solEmail').value.trim();
      const nota = document.getElementById('solNota').value.trim();
      if (!nombre || !email) { showToast('Escribe nombre y correo'); return; }
      try {
        await Admin.crearSolicitud(nombre, email, nota);
        document.getElementById('solNombre').value = '';
        document.getElementById('solEmail').value = '';
        document.getElementById('solNota').value = '';
        document.getElementById('agregarSolicitudForm').classList.add('hidden');
        showToast('Agregada a la cola');
        await cargarSolicitudes();
        await cargarStats();
      } catch (e) {
        showToast(e.message || 'No se pudo agregar');
      }
    });

    document.getElementById('solicitudesPendientes').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === 'atender') {
        btn.disabled = true;
        try {
          const { codigo, enviado } = await Admin.atenderSolicitud(id);
          showToast(enviado
            ? 'Código generado y enviado: ' + codigo
            : 'Código generado (' + codigo + ') pero el correo NO se pudo mandar — envíaselo tú a mano');
          await cargarSolicitudes();
          await cargarStats();
        } catch (err) {
          showToast(err.message || 'No se pudo generar el código');
          btn.disabled = false;
        }
      } else if (act === 'rechazar') {
        if (!confirm('¿Rechazar esta solicitud?')) return;
        try {
          await Admin.rechazarSolicitud(id);
          await cargarSolicitudes();
          await cargarStats();
        } catch (err) {
          showToast(err.message || 'No se pudo rechazar');
        }
      }
    });
  }

  // ================= GENERADOR DE CÓDIGOS SUELTOS =================
  async function cargarCodigos() {
    const codigos = await Auth.listarCodigos();
    const list = document.getElementById('codigosList');
    if (!codigos.length) { list.innerHTML = '<div class="empty-state">Aún no generas ningún código.</div>'; return; }
    list.innerHTML = codigos.map(c =>
      '<div class="codigo-item" data-id="' + c.id + '"><code>' + escapeHtml(c.codigo) + '</code>' +
      (c.nota ? '<span style="color:var(--ink-faint)">' + escapeHtml(c.nota) + '</span>' : '') +
      '<span class="estado ' + (c.usado ? 'usado' : 'libre') + '">' + (c.usado ? 'Usado' : 'Libre') + '</span>' +
      '<button class="codigo-del" data-act="del-codigo" title="Eliminar código">🗑️</button></div>'
    ).join('');
  }

  function wireGenerador() {
    document.getElementById('generarCodigoBtn').addEventListener('click', async () => {
      const nota = document.getElementById('notaCodigoInput').value.trim();
      try {
        const codigo = await Auth.generarCodigo(nota);
        document.getElementById('notaCodigoInput').value = '';
        await cargarCodigos();
        showToast('Código generado: ' + codigo);
      } catch (e) {
        showToast('No se pudo generar el código');
      }
    });

    document.getElementById('codigosList').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act="del-codigo"]');
      if (!btn) return;
      const item = e.target.closest('.codigo-item');
      const id = item.dataset.id;
      const usado = !!item.querySelector('.estado.usado');
      const pregunta = usado
        ? '¿Eliminar este código YA USADO? Se pierde el registro de qué cuenta lo canjeó.'
        : '¿Eliminar este código sin usar?';
      if (!confirm(pregunta)) return;
      try {
        await Admin.eliminarCodigo(id);
        await cargarCodigos();
      } catch (err) {
        showToast(err.message || 'No se pudo eliminar el código');
      }
    });
  }

  // Agrupa el secreto base32 de a 4 caracteres — mucho más fácil de leer y
  // transcribir a mano si hace falta.
  function formatearSecreto(secreto) {
    return (secreto || '').replace(/(.{4})/g, '$1 ').trim();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.addEventListener('unhandledrejection', (e) => {
    console.error('Promesa sin capturar:', e.reason);
    showToast('Ocurrió un error. Si el panel se ve pegado, recarga la página.');
  });

  function boot() {
    wireLogin();
    wireClientes();
    wireSolicitudes();
    wireGenerador();
    arrancar().catch((e) => {
      console.error(e);
      showOverlay('panelLoginPaso1');
    });
  }

  boot();
})();
