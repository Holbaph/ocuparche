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
        pendienteLogin = await Admin.loginPaso1(email, password);
        document.getElementById('p2Codigo').value = '';
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
      list.innerHTML = clientes.map(c => {
        const fecha = c.created_at ? new Date(c.created_at).toLocaleDateString('es-CL') : '–';
        const plan = c.plan === 'completo' ? 'completo' : 'free';
        return '<div class="cliente-item">' +
          '<div class="c-top">' +
            '<span class="c-nombre">' + escapeHtml(c.admin_nombre || 'Sin nombre') + '</span>' +
            '<span class="c-plan ' + plan + '">' + plan + '</span>' +
          '</div>' +
          '<span class="c-meta">' + escapeHtml(c.admin_email || '') + '</span>' +
          '<span class="c-meta">' + c.num_personas + ' persona(s) · ' + c.num_pacientes + ' paciente(s) · alta ' + fecha + '</span>' +
        '</div>';
      }).join('');
    } catch (e) { console.error('No se pudo cargar la lista de clientes', e); }
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
          const codigo = await Admin.atenderSolicitud(id);
          showToast('Código generado y enviado: ' + codigo);
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
      '<div class="codigo-item"><code>' + escapeHtml(c.codigo) + '</code>' +
      (c.nota ? '<span style="color:var(--ink-faint)">' + escapeHtml(c.nota) + '</span>' : '') +
      '<span class="estado ' + (c.usado ? 'usado' : 'libre') + '">' + (c.usado ? 'Usado' : 'Libre') + '</span></div>'
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
    wireSolicitudes();
    wireGenerador();
    arrancar().catch((e) => {
      console.error(e);
      showOverlay('panelLoginPaso1');
    });
  }

  boot();
})();
