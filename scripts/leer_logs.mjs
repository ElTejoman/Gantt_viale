// Lee commits y bitácoras de los proyectos (Intranet, Api, Automatización), asigna cada registro a una
// tarea del Gantt y escribe el árbol en data/arbol.json. Recuerda qué registros ya vio
// (data/logs_estado.json) para decir qué hay de nuevo en cada lectura.
//
// Uso:
//   node scripts/leer_logs.mjs          -> lee, actualiza el árbol y muestra el resumen por tarea
//   node scripts/leer_logs.mjs --hook   -> igual, pero imprime JSON para el hook de Claude Code
//   node scripts/leer_logs.mjs --sin-tarea -> lista lo que no se pudo asignar (para afinar reglas)

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_FUENTES = path.join(raiz, 'data', 'fuentes.json');
const RUTA_TAREAS = path.join(raiz, 'data', 'tareas.json');
export const RUTA_ARBOL = path.join(raiz, 'data', 'arbol.json');
const RUTA_ESTADO = path.join(raiz, 'data', 'logs_estado.json');

const RE_ID = /\b(?:AUT|DEM|PLA|DIS|MKT|RRHH|COM|INT|ENT)-\d+\b/;
const RE_CONVENCIONAL = /^([a-z]+)(?:\(([^)]+)\))?!?:\s*/i;
const ESTADO_EMOJI = { '🟢': 'produccion', '🟡': 'local', '⚪': 'sin_desarrollo' };

const sinTildes = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function limpiar(texto, max = 230) {
  let t = texto
    .replace(/\*\*/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+·\s+[0-9a-f]{7}(,\s*[0-9a-f]{7})*\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > max) t = t.slice(0, t.lastIndexOf(' ', max - 1) > 80 ? t.lastIndexOf(' ', max - 1) : max - 1) + '…';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------- fuentes ----------

function leerCommits(clave, repo, desde, ignorar) {
  if (!existsSync(path.join(repo.ruta, '.git'))) throw new Error(`${repo.nombre}: no es un repositorio git (${repo.ruta})`);
  const salida = execFileSync(
    'git',
    ['-C', repo.ruta, 'log', '--all', '--no-merges', `--since=${desde}`, '--format=%x1e%H%x1f%cs%x1f%s', '--name-only'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const vistos = new Set();
  const items = [];
  for (const bloque of salida.split('\x1e')) {
    if (!bloque.trim()) continue;
    const [cabecera, ...resto] = bloque.split('\n');
    const [hash, fecha, asunto] = cabecera.split('\x1f');
    if (!asunto || ignorar.some((re) => re.test(sinTildes(asunto)))) continue;
    const dedupe = `${fecha}|${asunto}`;
    if (vistos.has(dedupe)) continue; // el mismo commit copiado a otra rama (deploy/*)
    vistos.add(dedupe);
    const m = asunto.match(RE_CONVENCIONAL);
    items.push({
      clave: `${clave}:c:${hash}`,
      tipo: 'commit',
      repo: clave,
      fecha,
      ref: hash.slice(0, 7),
      scope: m?.[2] || null,
      asunto,
      texto: limpiar(asunto.replace(RE_CONVENCIONAL, '')),
      archivos: resto.map((l) => l.trim()).filter(Boolean),
    });
  }
  return items;
}

async function leerBitacora(b, repo, desde) {
  const ruta = path.join(repo.ruta, b.archivo);
  if (!existsSync(ruta)) return [];
  const lineas = (await readFile(ruta, 'utf8')).split(/\r?\n/);
  const items = [];
  let seccion = '';
  lineas.forEach((linea, n) => {
    if (b.formato === 'lista-por-seccion') {
      const h = linea.match(/^##\s+(.+)$/);
      if (h) return void (seccion = h[1].trim());
      const m = linea.match(/^-\s+(\d{4}-\d{2}-\d{2})\s+(🟢|🟡|⚪)?\s*(.+)$/u);
      if (!m || m[1] < desde) return;
      items.push({ clave: `${b.repo}:b:${m[1]}:${sinTildes(m[3]).slice(0, 80)}`, tipo: 'bitacora', repo: b.repo, fecha: m[1], estado: ESTADO_EMOJI[m[2]] || null, seccion, asunto: m[3], texto: limpiar(m[3]), linea: n + 1 });
    } else {
      const m = linea.match(/^##\s+(\d{4}-\d{2}-\d{2})(?:\/\d+)?\s+[—-]\s+(.+)$/);
      if (!m || m[1] < desde) return;
      items.push({ clave: `${b.repo}:b:${m[1]}:${sinTildes(m[2]).slice(0, 80)}`, tipo: 'bitacora', repo: b.repo, fecha: m[1], estado: null, seccion: 'api', asunto: m[2], texto: limpiar(m[2]), linea: n + 1 });
    }
  });
  return items;
}

async function leerPipeline(p, repo, desde) {
  const ruta = path.join(repo.ruta, p.archivo);
  if (!existsSync(ruta)) return [];
  const items = [];
  for (const linea of (await readFile(ruta, 'utf8')).split(/\r?\n/)) {
    if (!linea.trim()) continue;
    let r;
    try { r = JSON.parse(linea); } catch { continue; }
    const fecha = String(r.timestamp || '').slice(0, 10);
    if (!fecha || fecha < desde) continue;
    const falla = (r.validations && r.validations !== 'OK') || (r.status && !/^ok$/i.test(r.status)) || r.error;
    if (!falla) continue; // solo las corridas con problemas son noticia
    items.push({ clave: `${p.repo}:p:${r.timestamp}`, tipo: 'pipeline', repo: p.repo, fecha, tareaFija: p.tarea, asunto: 'pipeline', texto: `Corrida diaria del pipeline con problemas: ${r.error || r.validations || r.status}` });
  }
  return items;
}

// ---------- asignación ----------

function compilarReglas(reglas) {
  return reglas.map((r) => ({
    ...r,
    re: Object.fromEntries(['scope', 'texto', 'seccion', 'archivos'].filter((k) => r[k]).map((k) => [k, new RegExp(r[k], 'i')])),
  }));
}

function asignar(item, reglas, idsTareas) {
  if (item.tareaFija) return { tarea: item.tareaFija, por: 'fuente' };
  if (item.tipo === 'commit') {
    const id = item.asunto.match(RE_ID)?.[0];
    if (id && idsTareas.has(id)) return { tarea: id, por: 'id' };
  }
  const texto = sinTildes(item.asunto);
  for (const r of reglas) {
    if (r.repo && r.repo !== item.repo) continue;
    if (r.re.scope && !(item.scope && r.re.scope.test(sinTildes(item.scope)))) continue;
    if (r.re.seccion && !(item.seccion && r.re.seccion.test(sinTildes(item.seccion)))) continue;
    if (r.re.texto && !r.re.texto.test(texto)) continue;
    if (r.re.archivos && !(item.archivos || []).some((f) => r.re.archivos.test(f))) continue;
    if (r.tarea && !idsTareas.has(r.tarea)) continue;
    return r.tarea ? { tarea: r.tarea, por: 'regla' } : { proyecto: r.proyecto, por: 'regla' };
  }
  return null;
}

const resumirItem = (it, repos) => ({
  fecha: it.fecha,
  tipo: it.tipo,
  repo: repos[it.repo]?.nombre || it.repo,
  texto: it.texto,
  ...(it.estado ? { estado: it.estado } : {}),
  ...(it.ref ? { ref: it.ref } : {}),
});

// ---------- lectura completa ----------

// marcarVistos=false: actualiza el árbol pero no cambia qué cuenta como "nuevo" (lo usa el cifrado,
// para que el hook siga avisando de lo que nadie revisó todavía).
export async function leerLogs({ marcarVistos = true } = {}) {
  const fuentes = JSON.parse(await readFile(RUTA_FUENTES, 'utf8'));
  const datos = JSON.parse(await readFile(RUTA_TAREAS, 'utf8'));
  const ignorar = (fuentes.ignorar || []).map((s) => new RegExp(s, 'i'));
  const reglas = compilarReglas(fuentes.reglas || []);
  const idsTareas = new Map();
  for (const p of datos.proyectos) for (const t of p.tareas) idsTareas.set(t.id, { proyecto: p.id, nombre: t.nombre });

  const items = [];
  const resumenFuentes = {};
  const errores = [];
  for (const [clave, repo] of Object.entries(fuentes.repos)) {
    try {
      const c = leerCommits(clave, repo, fuentes.desde, ignorar);
      items.push(...c);
      resumenFuentes[clave] = { nombre: repo.nombre, commits: c.length, bitacora: 0 };
    } catch (e) {
      errores.push(e.message);
      resumenFuentes[clave] = { nombre: repo.nombre, commits: 0, bitacora: 0, error: e.message };
    }
  }
  for (const b of fuentes.bitacoras || []) {
    const bi = await leerBitacora(b, fuentes.repos[b.repo], fuentes.desde);
    items.push(...bi);
    resumenFuentes[b.repo].bitacora += bi.length;
  }
  if (fuentes.pipeline) {
    const pi = await leerPipeline(fuentes.pipeline, fuentes.repos[fuentes.pipeline.repo], fuentes.desde);
    items.push(...pi);
    resumenFuentes[fuentes.pipeline.repo].pipeline = pi.length;
  }

  // Más nuevo primero; dentro del mismo día se respeta el orden de origen (ya viene de nuevo a viejo).
  items.forEach((it, i) => (it.orden = i));
  items.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.orden - b.orden));

  const arbol = {
    generado: new Date().toISOString(),
    desde: fuentes.desde,
    hasta: items[0]?.fecha || null,
    fuentes: resumenFuentes,
    proyectos: {},
    sin_tarea: { total: 0, ultimos: [] },
  };
  for (const p of datos.proyectos) {
    arbol.proyectos[p.id] = { nombre: p.nombre, total: 0, commits: 0, bitacora: 0, general: { total: 0, ultimos: [] }, tareas: {} };
    for (const t of p.tareas) arbol.proyectos[p.id].tareas[t.id] = { nombre: t.nombre, total: 0, commits: 0, bitacora: 0, ultimaFecha: null, ultimos: [] };
  }

  const nuevos = [];
  const estadoPrevio = existsSync(RUTA_ESTADO) ? JSON.parse(await readFile(RUTA_ESTADO, 'utf8')) : null;
  const vistos = new Set(estadoPrevio?.vistos || []);

  for (const it of items) {
    const destino = asignar(it, reglas, idsTareas);
    it.destino = destino;
    const esCommit = it.tipo === 'commit';
    if (destino?.tarea) {
      const pid = idsTareas.get(destino.tarea).proyecto;
      const nodoP = arbol.proyectos[pid];
      const nodo = nodoP.tareas[destino.tarea];
      nodo.total++;
      nodoP.total++;
      esCommit ? (nodo.commits++, nodoP.commits++) : (nodo.bitacora++, nodoP.bitacora++);
      nodo.ultimaFecha ??= it.fecha;
      if (nodo.ultimos.length < 3) nodo.ultimos.push(resumirItem(it, fuentes.repos));
    } else if (destino?.proyecto && arbol.proyectos[destino.proyecto]) {
      const nodoP = arbol.proyectos[destino.proyecto];
      nodoP.total++;
      esCommit ? nodoP.commits++ : nodoP.bitacora++;
      nodoP.general.total++;
      if (nodoP.general.ultimos.length < 3) nodoP.general.ultimos.push(resumirItem(it, fuentes.repos));
    } else {
      arbol.sin_tarea.total++;
      if (arbol.sin_tarea.ultimos.length < 15) arbol.sin_tarea.ultimos.push(resumirItem(it, fuentes.repos));
    }
    if (estadoPrevio && !vistos.has(it.clave)) nuevos.push(it);
  }

  const primeraLectura = !estadoPrevio;
  await writeFile(RUTA_ARBOL, JSON.stringify(arbol, null, 2) + '\n');
  if (marcarVistos || primeraLectura) {
    await writeFile(
      RUTA_ESTADO,
      JSON.stringify({ ultimaLectura: arbol.generado, vistos: items.map((i) => i.clave) }) + '\n',
    );
  }

  return { arbol, nuevos, primeraLectura, lecturaAnterior: estadoPrevio?.ultimaLectura || null, errores, idsTareas, items };
}

// Versión compacta del árbol que viaja (cifrada) a la web: conteos y últimos 3 por tarea.
export function actividadParaWeb(arbol) {
  const tareas = {};
  const proyectos = {};
  for (const [pid, p] of Object.entries(arbol.proyectos)) {
    proyectos[pid] = { total: p.total, commits: p.commits, bitacora: p.bitacora };
    for (const [tid, t] of Object.entries(p.tareas)) {
      if (t.total) tareas[tid] = { total: t.total, commits: t.commits, bitacora: t.bitacora, ultimos: t.ultimos };
    }
  }
  return { hasta: arbol.hasta, desde: arbol.desde, proyectos, tareas };
}

// ---------- CLI ----------

function textoNuevos({ nuevos, idsTareas, lecturaAnterior, errores }, maximo = 8) {
  const lineas = [];
  if (errores.length) lineas.push(`Errores de lectura: ${errores.join(' | ')}`);
  if (!nuevos.length) {
    lineas.push(`Logs sin novedades desde la última lectura (${lecturaAnterior?.slice(0, 16).replace('T', ' ')} UTC).`);
    return lineas.join('\n');
  }
  const porDestino = {};
  for (const it of nuevos) {
    const k = it.destino?.tarea || (it.destino?.proyecto ? `proyecto ${it.destino.proyecto}` : 'SIN TAREA');
    (porDestino[k] ||= []).push(it);
  }
  lineas.push(`${nuevos.length} registros nuevos en los proyectos desde la última lectura:`);
  for (const [k, lista] of Object.entries(porDestino)) {
    const nombre = idsTareas.get(k)?.nombre;
    lineas.push(`- ${k}${nombre ? ` (${nombre})` : ''}: ${lista.length}`);
    for (const it of lista.slice(0, maximo)) lineas.push(`    · ${it.fecha} [${it.repo} ${it.tipo}] ${it.texto}`);
  }
  if (porDestino['SIN TAREA']) lineas.push('Hay registros sin tarea: revisar si corresponden a una tarea nueva o si falta una regla en data/fuentes.json.');
  return lineas.join('\n');
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esPrincipal) {
  const modoHook = process.argv.includes('--hook');
  try {
    const r = await leerLogs();
    if (modoHook) {
      const contexto = r.primeraLectura
        ? `Primera lectura de logs: ${r.items.length} registros indexados en data/arbol.json.`
        : textoNuevos(r);
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: `[Lectura automática de logs para el Gantt — data/arbol.json actualizado]\n${contexto}`,
          },
        }),
      );
    } else if (process.argv.includes('--sin-tarea')) {
      const sin = r.items.filter((i) => !i.destino);
      console.log(`${sin.length} registros sin tarea:`);
      for (const it of sin) console.log(`  ${it.fecha} [${it.repo} ${it.tipo}${it.scope ? ' ' + it.scope : ''}${it.seccion ? ' § ' + it.seccion : ''}] ${it.texto}`);
    } else {
      console.log(r.primeraLectura ? `Primera lectura: ${r.items.length} registros.` : textoNuevos(r));
      console.log('\nÁrbol por tarea (total · commits · bitácora · última fecha):');
      for (const [pid, p] of Object.entries(r.arbol.proyectos)) {
        console.log(`\n${p.nombre}  [${p.total}]${p.general.total ? `  (sin tarea específica: ${p.general.total})` : ''}`);
        for (const [tid, t] of Object.entries(p.tareas)) {
          console.log(`  ${tid.padEnd(7)} ${String(t.total).padStart(4)} · ${String(t.commits).padStart(3)} · ${String(t.bitacora).padStart(3)} · ${t.ultimaFecha || '—'}  ${t.nombre}`);
        }
      }
      console.log(`\nSin tarea: ${r.arbol.sin_tarea.total}  (ver con --sin-tarea)`);
    }
  } catch (e) {
    if (modoHook) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `[Lectura automática de logs] Falló: ${e.message}` } }));
    } else {
      console.error(`✖ ${e.message}`);
      process.exit(1);
    }
  }
}
