import * as THREE from 'three';
import { MESES, MESES_LARGO, DIAS, deDia, diaSemana, inicioMes, sumarMeses, inicioAnio } from './datos.js';

// Colores en sRGB tal cual vienen del CSS: sin conversión a espacio lineal.
THREE.ColorManagement.enabled = false;

export const FILA = 40;
const ALTO_BARRA = 16;
const ALTO_RESUMEN = 6;
const ALTO_RECURRENTE = 2;
const DIAMANTE = 10;

export const ESCALAS = { dia: 36, semana: 12, mes: 3.2 };
const PPD_MIN = 1.4;
const PPD_MAX = 90;
export const escalaDe = (ppd) => (ppd >= 20 ? 'dia' : ppd >= 6 ? 'semana' : 'mes');

const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Barra = rectángulo redondeado por SDF. Avance como relleno, rayado a 45° para fechas
// tentativas (tono sobre tono), desvanecido al final para tareas continuas y anillo para
// hover / selección / atraso.
const FRAG = /* glsl */ `
uniform vec2 uSize;
uniform float uRadius;
uniform vec3 uTrack;
uniform vec3 uFill;
uniform float uProgress;
uniform float uHatch;
uniform float uFade;
uniform float uRing;
uniform vec3 uRingColor;
uniform float uOpacity;
varying vec2 vUv;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float r = min(uRadius, min(uSize.x, uSize.y) * 0.5);
  float d = sdRoundBox(p, uSize * 0.5, r);
  float shape = 1.0 - smoothstep(-0.6, 0.6, d);
  if (shape <= 0.001) discard;

  float x = vUv.x * uSize.x;
  float pw = uProgress * uSize.x;
  float filled = uProgress > 0.0 ? 1.0 - smoothstep(pw - 0.6, pw + 0.6, x) : 0.0;
  vec3 col = mix(uTrack, uFill, filled);

  if (uHatch > 0.5) {
    float s = mod(p.x - p.y, 6.0);
    float line = smoothstep(0.0, 0.7, s) * (1.0 - smoothstep(1.5, 2.2, s));
    col = mix(col, mix(uTrack, uFill, 0.5), line * (1.0 - filled));
  }

  float ring = smoothstep(-2.4, -1.4, d) * uRing;
  col = mix(col, uRingColor, ring);

  float fade = uFade > 0.5 ? clamp((uSize.x - x) / max(uSize.x * 0.22, 1.0), 0.0, 1.0) : 1.0;
  gl_FragColor = vec4(col, shape * mix(0.25, 1.0, fade) * uOpacity);
}`;

function materialBarra() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSize: { value: new THREE.Vector2(1, 1) },
      uRadius: { value: 4 },
      uTrack: { value: new THREE.Color() },
      uFill: { value: new THREE.Color() },
      uProgress: { value: 0 },
      uHatch: { value: 0 },
      uFade: { value: 0 },
      uRing: { value: 0 },
      uRingColor: { value: new THREE.Color() },
      uOpacity: { value: 1 },
    },
  });
}

const materialPlano = (transparent = false) =>
  new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, transparent });

function crearLineas(maxSegmentos, orden) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxSegmentos * 6), 3));
  g.setDrawRange(0, 0);
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ depthTest: false, depthWrite: false, transparent: true }));
  l.frustumCulled = false;
  l.renderOrder = orden;
  l.userData.max = maxSegmentos;
  return l;
}

function escribirLineas(obj, segs) {
  const attr = obj.geometry.attributes.position;
  const arr = attr.array;
  const n = Math.min(segs.length / 4, obj.userData.max);
  for (let i = 0; i < n; i++) {
    arr[i * 6] = segs[i * 4];
    arr[i * 6 + 1] = segs[i * 4 + 1];
    arr[i * 6 + 2] = 0;
    arr[i * 6 + 3] = segs[i * 4 + 2];
    arr[i * 6 + 4] = segs[i * 4 + 3];
    arr[i * 6 + 5] = 0;
  }
  attr.needsUpdate = true;
  obj.geometry.setDrawRange(0, n * 2);
}

function crearTriangulos(max, orden) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 9), 3));
  g.setDrawRange(0, 0);
  const m = new THREE.Mesh(g, materialPlano(true));
  m.frustumCulled = false;
  m.renderOrder = orden;
  m.userData.max = max;
  return m;
}

function escribirTriangulos(obj, tris) {
  const attr = obj.geometry.attributes.position;
  const arr = attr.array;
  const n = Math.min(tris.length / 6, obj.userData.max);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      arr[i * 9 + k * 3] = tris[i * 6 + k * 2];
      arr[i * 9 + k * 3 + 1] = tris[i * 6 + k * 2 + 1];
      arr[i * 9 + k * 3 + 2] = 0;
    }
  }
  attr.needsUpdate = true;
  obj.geometry.setDrawRange(0, n * 3);
}

const leerCss = (estilos, nombre) => new THREE.Color(estilos.getPropertyValue(nombre).trim() || '#888888');
const facilidad = (t) => 1 - Math.pow(1 - t, 3);

function marcasDeTiempo(d0, d1, ppd) {
  const escala = escalaDe(ppd);
  const menores = [];
  const mayores = [];
  if (escala === 'dia') {
    for (let d = d0; d <= d1; d++) menores.push(d);
  } else if (escala === 'semana') {
    for (let d = d0 - ((diaSemana(d0) + 6) % 7); d <= d1; d += 7) menores.push(d);
  } else {
    for (let m = inicioMes(d0); m <= d1; m = sumarMeses(m, 1)) menores.push(m);
  }
  if (escala === 'mes') {
    for (let y = inicioAnio(d0); y <= d1; y = sumarMeses(y, 12)) mayores.push(y);
  } else {
    for (let m = inicioMes(d0); m <= d1; m = sumarMeses(m, 1)) mayores.push(m);
  }
  return { escala, menores, mayores };
}

export class VistaGantt {
  constructor({ host, cabecera, desplazador, alPasar, alActivar, alCambiarEscala }) {
    this.host = host;
    this.cabecera = cabecera;
    this.desplazador = desplazador;
    this.alPasar = alPasar;
    this.alActivar = alActivar;
    this.alCambiarEscala = alCambiarEscala;

    this.W = 1;
    this.H = 1;
    this.vista = { inicio: 0, ppd: ESCALAS.semana };
    this.meta = { ppd: ESCALAS.semana, inicio: null, ancla: null };
    this.items = [];
    this.porId = new Map();
    this.idxPasar = -1;
    this.idSel = null;
    this.diaHoy = 0;
    this.escala = null;
    this.sucio = true;
    this.animando = false;
    this.ultimo = performance.now();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.touchAction = 'none';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(this.canvas);

    this.escena = new THREE.Scene();
    this.camara = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
    this.plano = new THREE.PlaneGeometry(1, 1);
    this.dinamico = new THREE.Group();
    this.escena.add(this.dinamico);

    this.crearCapas();
    this.eventos();
    new ResizeObserver(() => this.redimensionar()).observe(host);
    this.redimensionar();
    this.renderer.setAnimationLoop((t) => this.cuadro(t));
  }

  crearCapas() {
    const e = this.escena;
    this.matGrupo = materialPlano();
    this.matFinde = materialPlano();
    this.finde = new THREE.InstancedMesh(this.plano, this.matFinde, 800);
    this.finde.count = 0;
    this.finde.frustumCulled = false;
    this.finde.renderOrder = 1;
    this.bandaPasar = new THREE.Mesh(this.plano, materialPlano());
    this.bandaPasar.renderOrder = 2;
    this.bandaSel = new THREE.Mesh(this.plano, materialPlano());
    this.bandaSel.renderOrder = 2;
    this.lineasMenores = crearLineas(1200, 3);
    this.lineasMayores = crearLineas(200, 3);
    this.lineasDep = crearLineas(600, 5);
    this.flechasDep = crearTriangulos(200, 5);
    this.lineaHoy = new THREE.Mesh(this.plano, materialPlano(true));
    this.lineaHoy.renderOrder = 20;
    e.add(this.finde, this.bandaPasar, this.bandaSel, this.lineasMenores, this.lineasMayores, this.lineasDep, this.flechasDep, this.lineaHoy);
  }

  // ---------- datos ----------

  iniciar({ diaHoy, escala = 'semana' }) {
    this.diaHoy = diaHoy;
    this.vista.ppd = this.meta.ppd = ESCALAS[escala];
    this.vista.inicio = diaHoy - (this.W * 0.18) / this.vista.ppd;
    this.sucio = true;
  }

  establecerFilas(filas) {
    for (const it of this.items) {
      for (const m of [it.barra, ...(it.marcas || [])]) m.material.dispose();
    }
    this.dinamico.clear();
    this.porId.clear();

    const ahora = performance.now();
    this.items = filas.map((fila, i) => {
      const it = { fila, i, t0: ahora + Math.min(i, 30) * 14 };
      if (fila.tipo === 'grupo') {
        it.banda = new THREE.Mesh(this.plano, this.matGrupo);
        it.banda.renderOrder = 0;
        this.dinamico.add(it.banda);
      } else {
        this.porId.set(fila.tarea.id, it);
        it.marcas = fila.tarea.marcas.map(() => {
          const m = new THREE.Mesh(this.plano, materialBarra());
          m.rotation.z = Math.PI / 4;
          m.renderOrder = 7;
          m.material.uniforms.uRadius.value = 1.5;
          this.dinamico.add(m);
          return m;
        });
      }
      it.barra = new THREE.Mesh(this.plano, materialBarra());
      it.barra.renderOrder = 6;
      this.dinamico.add(it.barra);
      return it;
    });
    this.aplicarColores();
  }

  aplicarColores() {
    const css = getComputedStyle(document.documentElement);
    const c = (n) => leerCss(css, n);
    this.colores = {
      superficie: c('--surface'),
      tinta: c('--ink'),
      atraso: c('--st-atrasada'),
      bordePendiente: c('--bar-pendiente-ring'),
      recurrente: c('--gantt-rec'),
      marca: c('--sum-fill'),
      resumen: { pista: c('--sum-track'), relleno: c('--sum-fill') },
      estados: Object.fromEntries(
        ['pendiente', 'en_curso', 'bloqueada', 'terminada'].map((k) => [k, { pista: c(`--bar-${k}-track`), relleno: c(`--bar-${k}-fill`) }]),
      ),
    };
    this.renderer.setClearColor(this.colores.superficie, 1);
    this.matGrupo.color.copy(c('--gantt-group'));
    this.matFinde.color.copy(c('--gantt-weekend'));
    this.bandaPasar.material.color.copy(c('--gantt-hover'));
    this.bandaSel.material.color.copy(c('--gantt-sel'));
    this.lineasMenores.material.color.copy(c('--gantt-grid'));
    this.lineasMayores.material.color.copy(c('--gantt-grid-strong'));
    this.lineasDep.material.color.copy(c('--gantt-dep'));
    this.flechasDep.material.color.copy(c('--gantt-dep'));
    this.lineaHoy.material.color.copy(c('--gantt-today'));

    for (const it of this.items) {
      const u = it.barra.material.uniforms;
      if (it.fila.tipo === 'grupo') {
        u.uTrack.value.copy(this.colores.resumen.pista);
        u.uFill.value.copy(this.colores.resumen.relleno);
        u.uProgress.value = (it.fila.proyecto.avance ?? 0) / 100;
        u.uRadius.value = 3;
        continue;
      }
      const t = it.fila.tarea;
      const est = this.colores.estados[t.estado];
      if (t.tipo === 'recurrente') {
        u.uTrack.value.copy(this.colores.recurrente);
        u.uFill.value.copy(this.colores.recurrente);
        u.uProgress.value = 0;
        u.uRadius.value = 1;
        for (const m of it.marcas) {
          const um = m.material.uniforms;
          um.uTrack.value.copy(est.relleno);
          um.uFill.value.copy(est.relleno);
        }
      } else {
        u.uTrack.value.copy(est.pista);
        u.uFill.value.copy(est.relleno);
        u.uProgress.value = t.tipo === 'continua' ? 0 : t.avance / 100;
        u.uRadius.value = 4;
      }
      u.uHatch.value = t.tentativa ? 1 : 0;
      u.uFade.value = t.tipo === 'continua' ? 1 : 0;
    }
    this.sucio = true;
  }

  // ---------- navegación ----------

  establecerEscala(nombre) {
    const xHoy = (this.diaHoy + 0.5 - this.vista.inicio) * this.vista.ppd;
    const ancla = xHoy > 0 && xHoy < this.W ? xHoy : this.W / 2;
    this.zoom(ESCALAS[nombre], ancla);
  }

  zoom(ppd, anclaPx, inmediato = false) {
    ppd = Math.min(PPD_MAX, Math.max(PPD_MIN, ppd));
    const dia = this.vista.inicio + anclaPx / this.vista.ppd;
    this.meta.ppd = ppd;
    this.meta.ancla = { dia, px: anclaPx };
    this.meta.inicio = null;
    if (inmediato || sinMovimiento.matches) {
      this.vista.ppd = ppd;
      this.vista.inicio = dia - anclaPx / ppd;
    }
    this.sucio = true;
  }

  irAHoy() {
    this.irADia(this.diaHoy, 0.25);
  }

  irADia(dia, fraccion = 0.15) {
    this.meta.ancla = null;
    this.meta.inicio = dia - (this.W * fraccion) / this.meta.ppd;
    this.sucio = true;
  }

  revelar(tarea) {
    const x0 = (tarea.inicio - this.vista.inicio) * this.vista.ppd;
    const x1 = (tarea.fin + 1 - this.vista.inicio) * this.vista.ppd;
    if (x0 < 0 || x1 > this.W) {
      if (x1 - x0 > this.W) this.irADia(tarea.inicio, 0.05);
      else this.irADia(tarea.inicio, 0.2);
    }
  }

  terminarZoom() {
    if (this.meta.ancla) this.vista.inicio = this.meta.ancla.dia - this.meta.ancla.px / this.meta.ppd;
    this.vista.ppd = this.meta.ppd;
    this.meta.ancla = null;
    this.meta.inicio = null;
  }

  desplazarX(dx) {
    this.terminarZoom();
    this.vista.inicio += dx / this.vista.ppd;
    this.sucio = true;
  }

  establecerPasar(idx) {
    if (idx !== this.idxPasar) {
      this.idxPasar = idx;
      this.sucio = true;
    }
  }

  establecerSeleccion(id) {
    this.idSel = id;
    this.sucio = true;
  }

  invalidar() {
    this.sucio = true;
  }

  // ---------- eventos ----------

  posicionLocal(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  impacto(mx, my) {
    const idx = Math.floor((my + this.desplazador.scrollTop) / FILA);
    const it = this.items[idx];
    if (!it || my < 0 || mx < 0 || mx > this.W) return null;
    const X = (d) => (d - this.vista.inicio) * this.vista.ppd;
    let x0, x1;
    if (it.fila.tipo === 'grupo') {
      x0 = X(it.fila.proyecto.inicio);
      x1 = X(it.fila.proyecto.fin + 1);
    } else {
      x0 = X(it.fila.tarea.inicio);
      x1 = X(it.fila.tarea.fin + 1);
    }
    const sobreBarra = mx >= x0 - 6 && mx <= Math.max(x1, x0 + 4) + 6;
    return { idx, fila: it.fila, sobreBarra };
  }

  eventos() {
    const el = this.canvas;
    const punteros = new Map();
    let arrastre = null;
    let pellizco = null;

    const distancia = () => {
      const [a, b] = [...punteros.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (punteros.size === 1) {
        arrastre = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, movido: false };
      } else if (punteros.size === 2) {
        arrastre = null;
        pellizco = { d: distancia(), ppd: this.vista.ppd };
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (punteros.has(e.pointerId)) punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pellizco && punteros.size === 2) {
        const [a, b] = [...punteros.values()];
        const r = el.getBoundingClientRect();
        this.zoom(pellizco.ppd * (distancia() / pellizco.d), (a.x + b.x) / 2 - r.left, true);
        return;
      }
      if (arrastre) {
        if (!arrastre.movido && Math.hypot(e.clientX - arrastre.x, e.clientY - arrastre.y) > 4) {
          arrastre.movido = true;
          el.classList.add('arrastrando');
          this.alPasar?.(null, e);
        }
        if (arrastre.movido) {
          this.desplazarX(-(e.clientX - arrastre.lx));
          this.desplazador.scrollTop -= e.clientY - arrastre.ly;
          arrastre.lx = e.clientX;
          arrastre.ly = e.clientY;
        }
        return;
      }
      if (e.pointerType === 'mouse') {
        const p = this.posicionLocal(e);
        const hit = this.impacto(p.x, p.y);
        this.establecerPasar(hit ? hit.idx : -1);
        el.style.cursor = hit && (hit.sobreBarra || hit.fila.tipo === 'grupo') ? 'pointer' : '';
        this.alPasar?.(hit, e);
      }
    });

    const soltar = (e) => {
      punteros.delete(e.pointerId);
      if (punteros.size < 2) pellizco = null;
      if (arrastre && !arrastre.movido && e.type === 'pointerup') {
        const p = this.posicionLocal(e);
        const hit = this.impacto(p.x, p.y);
        if (hit) this.alActivar?.(hit);
      }
      if (punteros.size === 0) {
        arrastre = null;
        el.classList.remove('arrastrando');
      }
    };
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse' || arrastre) return;
      this.establecerPasar(-1);
      this.alPasar?.(null, e);
    });

    this.host.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const f = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.H : 1;
        if (e.ctrlKey || e.metaKey) {
          const p = this.posicionLocal(e);
          this.zoom(this.meta.ppd * Math.exp(-e.deltaY * f * 0.0025), p.x);
          return;
        }
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        if (dx) this.desplazarX(dx * f);
        if (dy) this.desplazador.scrollTop += dy * f;
        this.alPasar?.(null, e);
      },
      { passive: false },
    );

    this.host.addEventListener('keydown', (e) => {
      const paso = (this.W * 0.2) / this.vista.ppd;
      const acciones = {
        ArrowLeft: () => this.irADia(this.vista.inicio - paso, 0),
        ArrowRight: () => this.irADia(this.vista.inicio + paso, 0),
        ArrowUp: () => (this.desplazador.scrollTop -= FILA),
        ArrowDown: () => (this.desplazador.scrollTop += FILA),
        '+': () => this.zoom(this.meta.ppd * 1.4, this.W / 2),
        '=': () => this.zoom(this.meta.ppd * 1.4, this.W / 2),
        '-': () => this.zoom(this.meta.ppd / 1.4, this.W / 2),
      };
      if (acciones[e.key]) {
        e.preventDefault();
        acciones[e.key]();
      }
    });
  }

  redimensionar() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.W = w;
    this.H = h;
    this.renderer.setSize(w, h);
    this.camara.right = w;
    this.camara.bottom = -h;
    this.camara.updateProjectionMatrix();
    this.sucio = true;
  }

  // ---------- render ----------

  cuadro(t) {
    const dt = Math.min((t - this.ultimo) / 1000, 0.1);
    this.ultimo = t;
    const k = sinMovimiento.matches ? 1 : 1 - Math.exp(-dt * 14);
    const v = this.vista, m = this.meta;
    let moviendo = false;

    if (Math.abs(m.ppd - v.ppd) > 1e-4) {
      v.ppd += (m.ppd - v.ppd) * k;
      if (Math.abs(m.ppd - v.ppd) < 1e-3) v.ppd = m.ppd;
      if (m.ancla) v.inicio = m.ancla.dia - m.ancla.px / v.ppd;
      moviendo = true;
    } else if (m.ancla) {
      m.ancla = null;
    }
    if (m.inicio != null) {
      v.inicio += (m.inicio - v.inicio) * k;
      if (Math.abs(m.inicio - v.inicio) < 1e-3) {
        v.inicio = m.inicio;
        m.inicio = null;
      }
      moviendo = true;
    }

    if (!moviendo && !this.sucio && !this.animando) return;
    this.animando = this.componer(t);
    this.renderer.render(this.escena, this.camara);
    this.pintarCabecera();
    this.sucio = false;

    const escala = escalaDe(v.ppd);
    if (escala !== this.escala) {
      this.escala = escala;
      this.alCambiarEscala?.(escala);
    }
  }

  componer(ahora) {
    const { inicio, ppd } = this.vista;
    const W = this.W, H = this.H;
    const sy = this.desplazador.scrollTop;
    const X = (d) => (d - inicio) * ppd;
    const d0 = Math.floor(inicio) - 1;
    const d1 = Math.ceil(inicio + W / ppd) + 1;
    let animando = false;

    // Rejilla
    const marcas = marcasDeTiempo(d0, d1, ppd);
    this.marcas = marcas;
    const segMenores = [];
    for (const d of marcas.menores) {
      const x = Math.round(X(d)) + 0.5;
      segMenores.push(x, 0, x, -H);
    }
    escribirLineas(this.lineasMenores, segMenores);
    const segMayores = [];
    for (const d of marcas.mayores) {
      const x = Math.round(X(d)) + 0.5;
      segMayores.push(x, 0, x, -H);
    }
    escribirLineas(this.lineasMayores, segMayores);

    // Fines de semana
    let n = 0;
    if (ppd >= 8) {
      const mat = new THREE.Matrix4();
      for (let d = d0; d <= d1 && n < 800; d++) {
        const w = diaSemana(d);
        if (w !== 0 && w !== 6) continue;
        mat.makeScale(ppd, H, 1).setPosition(X(d) + ppd / 2, -H / 2, 0);
        this.finde.setMatrixAt(n++, mat);
      }
      this.finde.instanceMatrix.needsUpdate = true;
    }
    this.finde.count = n;

    // Filas y barras
    const centroY = (i) => -(i * FILA - sy + FILA / 2);
    for (const it of this.items) {
      const top = it.i * FILA - sy;
      const visible = top > -FILA && top < H;
      const cy = centroY(it.i);
      const g = sinMovimiento.matches ? 1 : facilidad(Math.min(1, Math.max(0, (ahora - it.t0) / 420)));
      if (g < 1) animando = true;

      if (it.banda) {
        it.banda.visible = visible;
        it.banda.position.set(W / 2, cy, 0);
        it.banda.scale.set(W, FILA, 1);
      }

      let x0, x1, h;
      const u = it.barra.material.uniforms;
      if (it.fila.tipo === 'grupo') {
        x0 = X(it.fila.proyecto.inicio);
        x1 = X(it.fila.proyecto.fin + 1);
        h = ALTO_RESUMEN;
        u.uRing.value = 0;
      } else {
        const t = it.fila.tarea;
        x0 = X(t.inicio);
        x1 = X(t.fin + 1);
        h = t.tipo === 'recurrente' ? ALTO_RECURRENTE : ALTO_BARRA;
        const sel = t.id === this.idSel;
        const pasar = it.i === this.idxPasar;
        if (sel) { u.uRing.value = 1; u.uRingColor.value.copy(this.colores.tinta); }
        else if (t.atrasada) { u.uRing.value = 1; u.uRingColor.value.copy(this.colores.atraso); }
        else if (pasar) { u.uRing.value = 0.6; u.uRingColor.value.copy(this.colores.tinta); }
        else if (t.estado === 'pendiente') { u.uRing.value = 1; u.uRingColor.value.copy(this.colores.bordePendiente); }
        else u.uRing.value = 0;

        it.marcas.forEach((mesh, k) => {
          const mx = X(t.marcas[k] + 0.5);
          const s = DIAMANTE * g;
          mesh.visible = visible && mx > -DIAMANTE && mx < W + DIAMANTE && s > 0.5;
          mesh.position.set(mx, cy, 0);
          mesh.scale.set(s, s, 1);
          mesh.material.uniforms.uSize.value.set(s, s);
          mesh.material.uniforms.uRing.value = sel || pasar ? 1 : 0;
          mesh.material.uniforms.uRingColor.value.copy(this.colores.tinta);
        });
      }
      const w = Math.max(x1 - x0, 3) * g;
      it.barra.visible = visible && x0 + w > -10 && x0 < W + 10 && w > 0.5;
      it.barra.position.set(x0 + w / 2, cy, 0);
      it.barra.scale.set(w, h, 1);
      u.uSize.value.set(w, h);
    }

    // Bandas de hover y selección
    const pasar = this.items[this.idxPasar];
    this.bandaPasar.visible = !!pasar;
    if (pasar) {
      this.bandaPasar.position.set(W / 2, centroY(pasar.i), 0);
      this.bandaPasar.scale.set(W, FILA, 1);
    }
    const sel = this.idSel ? this.porId.get(this.idSel) : null;
    this.bandaSel.visible = !!sel;
    if (sel) {
      this.bandaSel.position.set(W / 2, centroY(sel.i), 0);
      this.bandaSel.scale.set(W, FILA, 1);
    }

    // Hoy
    const xh = X(this.diaHoy + 0.5);
    this.lineaHoy.visible = xh > -2 && xh < W + 2;
    this.lineaHoy.position.set(xh, -H / 2, 0);
    this.lineaHoy.scale.set(1.5, H, 1);

    // Dependencias (fin -> inicio)
    const segs = [];
    const tris = [];
    for (const it of this.items) {
      if (it.fila.tipo !== 'tarea') continue;
      const t = it.fila.tarea;
      for (const pre of t.dependeDe) {
        const ip = this.porId.get(pre.id);
        if (!ip) continue;
        const xs = X(pre.fin + 1) + 1;
        const ys = centroY(ip.i);
        const xe = X(t.inicio) - 1;
        const ye = centroY(it.i);
        const gap = 7;
        if (xe - xs >= gap * 2) {
          const xm = xs + gap;
          segs.push(xs, ys, xm, ys, xm, ys, xm, ye, xm, ye, xe, ye);
        } else {
          const ym = ys + (ye < ys ? -FILA / 2 : FILA / 2);
          segs.push(xs, ys, xs + gap, ys, xs + gap, ys, xs + gap, ym, xs + gap, ym, xe - gap, ym, xe - gap, ym, xe - gap, ye, xe - gap, ye, xe, ye);
        }
        tris.push(xe + 0.5, ye, xe - 5, ye + 3.5, xe - 5, ye - 3.5);
      }
    }
    escribirLineas(this.lineasDep, segs);
    escribirTriangulos(this.flechasDep, tris);

    return animando;
  }

  pintarCabecera() {
    const { inicio, ppd } = this.vista;
    const X = (d) => (d - inicio) * ppd;
    const { escala, menores, mayores } = this.marcas;
    let htmlMayor = '';
    mayores.forEach((d, i) => {
      const siguiente = i + 1 < mayores.length ? mayores[i + 1] : escala === 'mes' ? sumarMeses(d, 12) : sumarMeses(d, 1);
      const x = Math.max(X(d), 0);
      const ancho = X(siguiente) - x - 8;
      if (ancho < 24) return;
      const f = deDia(d);
      const texto = escala === 'mes' ? f.getUTCFullYear() : `${MESES_LARGO[f.getUTCMonth()]} ${f.getUTCFullYear()}`;
      htmlMayor += `<span class="tl-mayor" style="transform:translateX(${x}px);max-width:${ancho}px">${texto}</span>`;
    });

    let htmlMenor = '';
    for (const d of menores) {
      const x = X(d);
      const f = deDia(d);
      if (escala === 'dia') {
        const w = diaSemana(d);
        const clase = `tl-dia${w === 0 || w === 6 ? ' es-finde' : ''}${d === this.diaHoy ? ' es-hoy' : ''}`;
        const texto = ppd >= 30 ? `${DIAS[w]} ${f.getUTCDate()}` : `${f.getUTCDate()}`;
        htmlMenor += `<span class="${clase}" style="transform:translateX(${x}px);width:${ppd}px">${texto}</span>`;
      } else if (escala === 'semana') {
        const ancho = ppd * 7;
        if (ancho < 30) continue;
        const texto = ancho >= 56 ? `${f.getUTCDate()} ${MESES[f.getUTCMonth()]}` : `${f.getUTCDate()}`;
        htmlMenor += `<span class="tl-menor" style="transform:translateX(${x + 6}px)">${texto}</span>`;
      } else {
        if (ppd * 28 < 30) continue;
        htmlMenor += `<span class="tl-menor" style="transform:translateX(${x + 6}px)">${MESES[f.getUTCMonth()]}</span>`;
      }
    }

    const xh = X(this.diaHoy + 0.5);
    const hoy = escala !== 'dia' && xh > -20 && xh < this.W + 20 ? `<span class="tl-hoy" style="transform:translateX(${xh}px)">Hoy</span>` : '';
    this.cabecera.innerHTML = `<div class="tl-fila-mayor">${htmlMayor}</div><div class="tl-fila-menor">${htmlMenor}${hoy}</div>`;
  }
}
