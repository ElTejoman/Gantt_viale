import { VistaGantt, FILA } from './gantt.js';
import { ESTADOS, TIPOS, FILTROS, construirFilas, contar, fmt, fmtRango } from './datos.js';
import { iconos } from './iconos.js';

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const icoEstado = (estado) => `<span class="st st-${estado}">${iconos[estado]}</span>`;
const icoAtraso = `<span class="st st-atrasada" title="Atrasada">${iconos.atrasada}</span>`;

function metaTarea(t) {
  if (t.tipo === 'continua') return 'Continua';
  if (t.tipo === 'recurrente') return 'Mensual';
  return `${t.avance}%`;
}

export function iniciarApp(datos) {
  const estado = {
    filtro: 'todas',
    consulta: '',
    colapsados: new Set(datos.proyectos.filter((p) => p.colapsado).map((p) => p.id)),
    sel: null,
    filas: [],
    panel: null,
  };
  const lista = $('#lado-lista');
  const interior = $('#lado-interior');
  const tooltip = $('#tooltip');
  const panel = $('#panel');
  let elementosFila = [];
  let ultimoFoco = null;

  document.title = datos.titulo;
  $('#titulo').textContent = datos.titulo;
  $('#actualizado').textContent = `Actualizado el ${fmt(datos.actualizado, true)}`;

  const vista = new VistaGantt({
    host: $('#tl-lienzo'),
    cabecera: $('#tl-cabecera'),
    desplazador: lista,
    alPasar: (hit, e) => {
      marcarPasar(hit ? hit.idx : -1);
      if (hit && hit.sobreBarra && e) mostrarTooltip(hit.fila, e.clientX, e.clientY);
      else ocultarTooltip();
    },
    alActivar: (hit) => activar(hit.fila),
    alCambiarEscala: (esc) => {
      for (const b of document.querySelectorAll('[data-escala]')) b.setAttribute('aria-pressed', String(b.dataset.escala === esc));
    },
  });
  vista.iniciar({ diaHoy: datos.hoy, escala: 'semana' });

  // ---------- resumen ----------

  function pintarResumen() {
    const n = contar(datos.tareas);
    const g = datos.avanceGlobal ?? 0;
    $('#avance-global').textContent = `${g}%`;
    $('#avance-medidor').style.width = `${g}%`;
    $('#avance-sub').textContent = `${datos.conPlazo} tareas con plazo`;
    $('#filtros').innerHTML = Object.entries(FILTROS)
      .map(
        ([k, f]) =>
          `<button class="filtro" data-filtro="${k}" aria-pressed="${estado.filtro === k}">${
            f.icono ? `<span class="st st-${f.icono}">${iconos[f.icono]}</span>` : ''
          }<span>${f.etiqueta}</span><b>${n[k]}</b></button>`,
      )
      .join('');
  }

  $('#filtros').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    estado.filtro = estado.filtro === b.dataset.filtro && b.dataset.filtro !== 'todas' ? 'todas' : b.dataset.filtro;
    pintarResumen();
    pintarFilas();
  });

  let temporizador;
  $('#buscar').addEventListener('input', (e) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      estado.consulta = e.target.value;
      pintarFilas();
    }, 120);
  });

  // ---------- filas ----------

  function pintarFilas() {
    estado.filas = construirFilas(datos.proyectos, estado);
    interior.style.height = `${estado.filas.length * FILA + 48}px`;
    if (!estado.filas.length) {
      interior.innerHTML = `<div class="vacio"><p>Ninguna tarea coincide con este filtro.</p><button class="btn" data-accion="limpiar">Ver todas las tareas</button></div>`;
    } else {
      interior.innerHTML = estado.filas
        .map((f, i) => {
          if (f.tipo === 'grupo') {
            const p = f.proyecto;
            return `<button class="fila fila-grupo" data-idx="${i}" aria-expanded="${!f.colapsado}">
              ${iconos.chevron}<span class="g-nombre">${esc(p.nombre)}</span><span class="g-cuenta">${f.visibles}</span>
              <span class="g-avance">${p.avance == null ? '—' : `${p.avance}%`}</span></button>`;
          }
          const t = f.tarea;
          return `<button class="fila fila-tarea${t.id === estado.sel ? ' es-sel' : ''}" data-idx="${i}">
            ${icoEstado(t.estado)}<span class="t-nombre">${esc(t.nombre)}</span>${t.atrasada ? icoAtraso : ''}
            ${t.actividad ? `<span class="t-reg" title="${t.actividad.total} registros en los proyectos">${t.actividad.total}</span>` : ''}
            <span class="t-meta">${metaTarea(t)}</span></button>`;
        })
        .join('');
    }
    elementosFila = [...interior.querySelectorAll('.fila')];
    vista.establecerFilas(estado.filas);
  }

  function marcarPasar(idx) {
    for (const el of interior.querySelectorAll('.es-pasar')) el.classList.remove('es-pasar');
    if (idx >= 0) elementosFila[idx]?.classList.add('es-pasar');
  }

  function activar(fila, desdeLista = false) {
    if (fila.tipo === 'grupo') {
      const id = fila.proyecto.id;
      estado.colapsados.has(id) ? estado.colapsados.delete(id) : estado.colapsados.add(id);
      pintarFilas();
      if (desdeLista) interior.querySelector(`[data-idx="${estado.filas.findIndex((f) => f.tipo === 'grupo' && f.proyecto.id === id)}"]`)?.focus();
      return;
    }
    abrirTarea(fila.tarea.id);
  }

  interior.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="limpiar"]')) {
      estado.filtro = 'todas';
      estado.consulta = '';
      $('#buscar').value = '';
      pintarResumen();
      pintarFilas();
      return;
    }
    const b = e.target.closest('.fila');
    if (b) activar(estado.filas[+b.dataset.idx], true);
  });
  interior.addEventListener('mouseover', (e) => {
    const b = e.target.closest('.fila');
    vista.establecerPasar(b ? +b.dataset.idx : -1);
  });
  interior.addEventListener('mouseleave', () => vista.establecerPasar(-1));
  lista.addEventListener('scroll', () => vista.invalidar(), { passive: true });

  // ---------- tooltip ----------

  function mostrarTooltip(fila, x, y) {
    let html;
    if (fila.tipo === 'grupo') {
      const p = fila.proyecto;
      html = `<p class="tt-eyebrow">Proyecto</p><p class="tt-nombre">${esc(p.nombre)}</p>
        <p class="tt-linea">${fmtRango(p.inicio, p.fin)}</p>
        <p class="tt-linea">${p.tareas.length} tareas · avance ${p.avance == null ? '—' : `${p.avance}%`}</p>
        ${p.actividad?.total ? `<p class="tt-linea">${p.actividad.total} registros en los proyectos</p>` : ''}`;
    } else {
      const t = fila.tarea;
      html = `<p class="tt-eyebrow">${esc(t.proyectoNombre)}</p><p class="tt-nombre">${esc(t.nombre)}</p>
        <p class="tt-linea">${fmtRango(t.inicio, t.fin)} · ${t.habiles} días hábiles</p>
        <p class="tt-linea">${icoEstado(t.estado)}${ESTADOS[t.estado]}${t.tipo === 'tarea' ? ` · ${t.avance}%` : ` · ${TIPOS[t.tipo]}`}</p>
        ${t.atrasada ? `<p class="tt-linea tt-atraso">${icoAtraso}Atrasada ${t.diasAtraso} ${t.diasAtraso === 1 ? 'día' : 'días'}</p>` : ''}
        ${t.actividad ? `<p class="tt-linea">${t.actividad.total} registros · último ${fmt(t.actividad.ultimos[0].dia)}</p>` : ''}
        ${t.tentativa ? '<p class="tt-nota">Fecha tentativa</p>' : ''}`;
    }
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    const r = tooltip.getBoundingClientRect();
    const px = x + 16 + r.width > innerWidth - 8 ? x - r.width - 16 : x + 16;
    const py = y + 16 + r.height > innerHeight - 8 ? y - r.height - 12 : y + 16;
    tooltip.style.transform = `translate(${Math.max(8, px)}px, ${Math.max(8, py)}px)`;
  }
  const ocultarTooltip = () => (tooltip.hidden = true);

  // ---------- panel lateral ----------

  function abrirPanel(html, etiqueta) {
    if (panel.hidden) ultimoFoco = document.activeElement;
    $('#panel-cuerpo').innerHTML = html;
    panel.setAttribute('aria-label', etiqueta);
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('abierto'));
    $('#panel-cuerpo').scrollTop = 0;
    $('#panel-cerrar').focus({ preventScroll: true });
  }

  function cerrarPanel() {
    if (panel.hidden) return;
    panel.classList.remove('abierto');
    panel.hidden = true;
    estado.sel = null;
    estado.panel = null;
    vista.establecerSeleccion(null);
    for (const el of interior.querySelectorAll('.es-sel')) el.classList.remove('es-sel');
    ultimoFoco?.focus?.({ preventScroll: true });
  }

  function abrirTarea(id) {
    const t = datos.porId.get(id);
    if (!t) return;
    estado.sel = id;
    estado.panel = 'tarea';
    vista.establecerSeleccion(id);
    for (const el of interior.querySelectorAll('.es-sel')) el.classList.remove('es-sel');

    let idx = estado.filas.findIndex((f) => f.tipo === 'tarea' && f.tarea.id === id);
    if (idx < 0) {
      // La tarea está oculta por filtro o grupo colapsado: mostrarla.
      estado.filtro = 'todas';
      estado.consulta = '';
      $('#buscar').value = '';
      estado.colapsados.delete(t.proyectoId);
      pintarResumen();
      pintarFilas();
      idx = estado.filas.findIndex((f) => f.tipo === 'tarea' && f.tarea.id === id);
    }
    const el = elementosFila[idx];
    el?.classList.add('es-sel');
    const top = idx * FILA;
    if (top < lista.scrollTop || top + FILA > lista.scrollTop + lista.clientHeight) {
      lista.scrollTo({ top: Math.max(0, top - lista.clientHeight / 3), behavior: 'smooth' });
    }
    vista.revelar(t);

    const pct = t.tipo === 'tarea' ? `<span class="p-pct">${t.avance}%</span>` : '';
    const hechos = t.checklist?.filter((c) => c.hecho).length ?? 0;
    abrirPanel(
      `<p class="eyebrow">${esc(t.proyectoNombre)}</p>
      <h2 id="panel-titulo">${esc(t.nombre)}</h2>
      <div class="p-estado"><span class="chip">${icoEstado(t.estado)}${ESTADOS[t.estado]}</span>${
        t.atrasada ? `<span class="chip chip-atraso">${icoAtraso}Atrasada ${t.diasAtraso} ${t.diasAtraso === 1 ? 'día' : 'días'}</span>` : ''
      }${pct}</div>
      ${t.tipo === 'tarea' ? `<div class="medidor medidor-grande"><i class="m-${t.estado}" style="width:${t.avance}%"></i></div>` : ''}
      <dl class="datos">
        <div><dt>Inicio</dt><dd>${fmt(t.inicio, true)}</dd></div>
        <div><dt>Fin</dt><dd>${fmt(t.fin, true)}</dd></div>
        <div><dt>Duración</dt><dd>${t.habiles} días hábiles</dd></div>
        <div><dt>Tipo</dt><dd>${TIPOS[t.tipo]}</dd></div>
      </dl>
      ${t.tentativa ? '<p class="nota-tentativa"><span class="trama"></span>Las fechas son tentativas y pueden ajustarse.</p>' : ''}
      ${t.detalle ? `<section><h3>Detalle</h3><p>${esc(t.detalle)}</p></section>` : ''}
      ${
        t.conteo
          ? `<section><h3>Progreso</h3><p class="conteo"><b>${t.conteo.hecho}</b> de ${t.conteo.total} ${esc(t.conteo.unidad || 'ítems')}</p></section>`
          : ''
      }
      ${
        t.checklist?.length
          ? `<section><h3>Checklist <span class="h3-meta">${hechos} de ${t.checklist.length}</span></h3><ul class="checklist">${t.checklist
              .map((c) => `<li class="${c.hecho ? 'hecho' : ''}">${c.hecho ? iconos.check : iconos.vacio}<span>${esc(c.texto)}</span></li>`)
              .join('')}</ul></section>`
          : ''
      }
      ${
        t.dependeDe.length
          ? `<section><h3>Depende de</h3><ul class="deps">${t.dependeDe
              .map((d) => `<li><button class="enlace" data-ir="${esc(d.id)}">${icoEstado(d.estado)}${esc(d.nombre)}</button></li>`)
              .join('')}</ul></section>`
          : ''
      }
      ${seccionActividad(t)}
      <section><h3>Bitácora</h3>${
        t.actualizaciones.length
          ? `<ol class="bitacora">${t.actualizaciones
              .map(
                (a) =>
                  `<li><time>${fmt(a.dia, true)}</time><p>${esc(a.nota)}</p>${a.avance != null ? `<span class="b-avance">${a.avance}%</span>` : ''}</li>`,
              )
              .join('')}</ol>`
          : '<p class="tenue">Sin actualizaciones todavía.</p>'
      }</section>`,
      t.nombre,
    );
  }

  function seccionActividad(t) {
    const a = t.actividad;
    if (!a) {
      return datos.actividadHasta
        ? '<section><h3>Actividad en los proyectos</h3><p class="tenue">Sin registros en los proyectos todavía.</p></section>'
        : '';
    }
    const tipo = { commit: 'Commit', bitacora: 'Bitácora', pipeline: 'Pipeline' };
    return `<section><h3>Actividad en los proyectos <span class="h3-meta">${a.total}</span></h3>
      <p class="act-resumen">${a.commits} ${a.commits === 1 ? 'commit' : 'commits'} · ${a.bitacora} ${a.bitacora === 1 ? 'entrada' : 'entradas'} de bitácora</p>
      <ol class="actividad">${a.ultimos
        .map(
          (u) => `<li><div class="act-meta"><time>${fmt(u.dia, true)}</time><span class="act-fuente">${esc(u.repo)} · ${tipo[u.tipo] || u.tipo}</span>${
            u.estado === 'local' ? '<span class="act-local">solo en local</span>' : ''
          }</div><p>${esc(u.texto)}</p></li>`,
        )
        .join('')}</ol>
      ${a.total > a.ultimos.length ? `<p class="tenue act-pie">Últimos ${a.ultimos.length} de ${a.total}.</p>` : ''}</section>`;
  }

  function abrirBitacora() {
    estado.panel = 'bitacora';
    const entradas = datos.tareas
      .flatMap((t) => t.actualizaciones.map((a) => ({ ...a, tarea: t })))
      .sort((a, b) => b.dia - a.dia);
    abrirPanel(
      `<p class="eyebrow">Todas las tareas</p><h2 id="panel-titulo">Bitácora</h2>
      ${
        entradas.length
          ? `<ol class="bitacora bitacora-global">${entradas
              .map(
                (a) => `<li><time>${fmt(a.dia, true)}</time>
                  <button class="enlace" data-ir="${esc(a.tarea.id)}">${icoEstado(a.tarea.estado)}${esc(a.tarea.nombre)}</button>
                  <p>${esc(a.nota)}</p>${a.avance != null ? `<span class="b-avance">${a.avance}%</span>` : ''}</li>`,
              )
              .join('')}</ol>`
          : '<p class="tenue">Aún no hay actualizaciones registradas. Cada avance aparecerá aquí con su fecha.</p>'
      }`,
      'Bitácora',
    );
  }

  $('#panel-cuerpo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ir]');
    if (b) abrirTarea(b.dataset.ir);
  });
  $('#panel-cerrar').addEventListener('click', cerrarPanel);

  // ---------- barra superior ----------

  for (const b of document.querySelectorAll('[data-escala]')) b.addEventListener('click', () => vista.establecerEscala(b.dataset.escala));
  $('#btn-hoy').addEventListener('click', () => vista.irAHoy());
  $('#btn-bitacora').addEventListener('click', abrirBitacora);

  const temaOscuro = matchMedia('(prefers-color-scheme: dark)');
  const temaEfectivo = () => document.documentElement.dataset.theme || (temaOscuro.matches ? 'dark' : 'light');
  const pintarBotonTema = () => {
    const oscuro = temaEfectivo() === 'dark';
    $('#btn-tema').innerHTML = oscuro ? iconos.sol : iconos.luna;
    $('#btn-tema').setAttribute('aria-label', oscuro ? 'Usar tema claro' : 'Usar tema oscuro');
    $('#btn-tema').title = oscuro ? 'Tema claro' : 'Tema oscuro';
  };
  $('#btn-tema').addEventListener('click', () => {
    const nuevo = temaEfectivo() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nuevo;
    try { localStorage.setItem('tema', nuevo); } catch {}
    pintarBotonTema();
    vista.aplicarColores();
  });
  temaOscuro.addEventListener('change', () => {
    pintarBotonTema();
    vista.aplicarColores();
  });
  pintarBotonTema();

  $('#btn-salir').innerHTML = iconos.salir;
  $('#btn-salir').addEventListener('click', () => {
    try { sessionStorage.removeItem('gantt-clave'); } catch {}
    location.reload();
  });
  $('#icono-buscar').innerHTML = iconos.buscar;
  $('#panel-cerrar').innerHTML = iconos.cerrar;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!tooltip.hidden) ocultarTooltip();
      cerrarPanel();
      return;
    }
    if (e.target.closest('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const atajos = { d: 'dia', s: 'semana', m: 'mes' };
    if (atajos[e.key]) vista.establecerEscala(atajos[e.key]);
    else if (e.key === 'h') vista.irAHoy();
    else if (e.key === '/') {
      e.preventDefault();
      $('#buscar').focus();
    }
  });

  pintarResumen();
  pintarFilas();
}
