// Valida data/tareas.json y lo cifra en site/tareas.enc.json (AES-GCM + PBKDF2).
// Uso:
//   node scripts/cifrar.mjs              -> valida y cifra
//   node scripts/cifrar.mjs --descifrar  -> regenera data/tareas.json desde el archivo cifrado
// La contraseña se lee de GANTT_PASSWORD (variable de entorno o archivo .env.local).

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { leerLogs, actividadParaWeb, RUTA_ARBOL } from './leer_logs.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_DATOS = path.join(raiz, 'data', 'tareas.json');
const RUTA_CIFRADO = path.join(raiz, 'site', 'tareas.enc.json');
const RUTA_ENV = path.join(raiz, '.env.local');
const ITERACIONES = 310000;

const ESTADOS = ['pendiente', 'en_curso', 'bloqueada', 'terminada'];
const TIPOS = ['tarea', 'continua', 'recurrente'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function leerPassword() {
  if (process.env.GANTT_PASSWORD) return process.env.GANTT_PASSWORD;
  if (existsSync(RUTA_ENV)) {
    const txt = await readFile(RUTA_ENV, 'utf8');
    const linea = txt.split(/\r?\n/).find((l) => l.trim().startsWith('GANTT_PASSWORD='));
    if (linea) return linea.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  }
  fallar('Falta la contraseña. Crea .env.local con la línea GANTT_PASSWORD=tu_contraseña');
}

function fallar(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function fechaValida(s) {
  if (typeof s !== 'string' || !FECHA.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function validar(datos) {
  const errores = [];
  if (!Array.isArray(datos.proyectos)) return ['"proyectos" debe ser una lista'];
  if (datos.actualizado && !fechaValida(datos.actualizado)) errores.push('"actualizado" no es una fecha AAAA-MM-DD');
  const idsProyecto = new Set();
  const idsTarea = new Set();
  const dependencias = [];
  for (const p of datos.proyectos) {
    const ctx = `Proyecto ${p.id ?? '(sin id)'}`;
    if (!p.id || !p.nombre) errores.push(`${ctx}: requiere "id" y "nombre"`);
    if (idsProyecto.has(p.id)) errores.push(`${ctx}: id repetido`);
    idsProyecto.add(p.id);
    if (!Array.isArray(p.tareas)) { errores.push(`${ctx}: "tareas" debe ser una lista`); continue; }
    for (const t of p.tareas) {
      const c = `Tarea ${t.id ?? '(sin id)'}`;
      if (!t.id || !t.nombre) errores.push(`${c}: requiere "id" y "nombre"`);
      if (idsTarea.has(t.id)) errores.push(`${c}: id repetido`);
      idsTarea.add(t.id);
      if (!fechaValida(t.inicio)) errores.push(`${c}: "inicio" inválido (${t.inicio})`);
      if (!fechaValida(t.fin)) errores.push(`${c}: "fin" inválido (${t.fin})`);
      if (fechaValida(t.inicio) && fechaValida(t.fin) && t.fin < t.inicio) errores.push(`${c}: "fin" es anterior a "inicio"`);
      if (t.plan && !(fechaValida(t.plan.inicio) && fechaValida(t.plan.fin) && t.plan.fin >= t.plan.inicio)) errores.push(`${c}: "plan" debe ser { inicio, fin } con fechas AAAA-MM-DD`);
      if (t.estado && !ESTADOS.includes(t.estado)) errores.push(`${c}: estado "${t.estado}" no es uno de ${ESTADOS.join(', ')}`);
      if (t.tipo && !TIPOS.includes(t.tipo)) errores.push(`${c}: tipo "${t.tipo}" no es uno de ${TIPOS.join(', ')}`);
      if (t.avance != null && (typeof t.avance !== 'number' || t.avance < 0 || t.avance > 100)) errores.push(`${c}: "avance" debe ser un número entre 0 y 100`);
      if (t.conteo && !(t.conteo.total > 0 && t.conteo.hecho >= 0 && t.conteo.hecho <= t.conteo.total)) errores.push(`${c}: "conteo" inválido`);
      if (t.checklist && !Array.isArray(t.checklist)) errores.push(`${c}: "checklist" debe ser una lista`);
      for (const a of t.actualizaciones ?? []) {
        if (!fechaValida(a.fecha)) errores.push(`${c}: actualización con fecha inválida (${a.fecha})`);
        if (!a.nota) errores.push(`${c}: actualización sin "nota"`);
      }
      for (const d of t.depende ?? []) dependencias.push([t.id, d]);
    }
  }
  for (const [t, d] of dependencias) if (!idsTarea.has(d)) errores.push(`Tarea ${t}: depende de "${d}", que no existe`);
  errores.push(...validarReuniones(datos, idsTarea));
  return errores;
}

const ESTADOS_PENDIENTE = ['abierto', 'cumplido', 'descartado'];

// Reuniones: { id: "R-AAAA-MM-DD[-n]", fecha, titulo, participantes[], acuerdos[], pendientes[] }
// pendiente: { id: "<reunión>#n", texto, responsable ("yo" u otro nombre), estado, fecha?, tarea?, bloquea?, cierre? }
function validarReuniones(datos, idsTarea) {
  const errores = [];
  const reuniones = datos.reuniones ?? [];
  if (!Array.isArray(reuniones)) return ['"reuniones" debe ser una lista'];
  const idsReunion = new Set();
  for (const r of reuniones) {
    const c = `Reunión ${r.id ?? '(sin id)'}`;
    if (!/^R-\d{4}-\d{2}-\d{2}(-\d+)?$/.test(r.id || '')) errores.push(`${c}: el id debe ser R-AAAA-MM-DD (o R-AAAA-MM-DD-2)`);
    if (idsReunion.has(r.id)) errores.push(`${c}: id repetido`);
    idsReunion.add(r.id);
    if (!fechaValida(r.fecha)) errores.push(`${c}: "fecha" inválida (${r.fecha})`);
    if (!r.titulo) errores.push(`${c}: requiere "titulo"`);
    if (r.participantes && !Array.isArray(r.participantes)) errores.push(`${c}: "participantes" debe ser una lista`);
    if (r.acuerdos && !Array.isArray(r.acuerdos)) errores.push(`${c}: "acuerdos" debe ser una lista`);
    const idsPend = new Set();
    for (const p of r.pendientes ?? []) {
      const cp = `${c}, pendiente ${p.id ?? '(sin id)'}`;
      if (!p.id || !p.id.startsWith(`${r.id}#`)) errores.push(`${cp}: el id debe ser "${r.id}#n"`);
      if (idsPend.has(p.id)) errores.push(`${cp}: id repetido`);
      idsPend.add(p.id);
      if (!p.texto) errores.push(`${cp}: requiere "texto"`);
      if (!p.responsable) errores.push(`${cp}: requiere "responsable" ("yo" o el nombre de quien lo debe)`);
      if (!ESTADOS_PENDIENTE.includes(p.estado)) errores.push(`${cp}: estado "${p.estado}" no es uno de ${ESTADOS_PENDIENTE.join(', ')}`);
      if (p.fecha != null && !fechaValida(p.fecha)) errores.push(`${cp}: "fecha" inválida (${p.fecha})`);
      for (const k of ['tarea', 'bloquea']) if (p[k] != null && !idsTarea.has(p[k])) errores.push(`${cp}: "${k}" apunta a ${p[k]}, que no existe`);
      if (p.estado !== 'abierto' && !(p.cierre && fechaValida(p.cierre.fecha))) errores.push(`${cp}: un pendiente cerrado requiere "cierre": { fecha, nota }`);
    }
  }
  for (const p of datos.proyectos) {
    for (const t of p.tareas ?? []) {
      for (const o of t.origen ?? []) if (!idsReunion.has(o)) errores.push(`Tarea ${t.id}: "origen" apunta a ${o}, que no existe`);
    }
  }
  return errores;
}

const b64 = (buf) => Buffer.from(buf).toString('base64');
const deB64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

async function derivarClave(password, salt, iteraciones) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iteraciones, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function descifrarArchivo(password) {
  const payload = JSON.parse(await readFile(RUTA_CIFRADO, 'utf8'));
  const clave = await derivarClave(password, deB64(payload.salt), payload.iter);
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(payload.iv) }, clave, deB64(payload.data));
  return new TextDecoder().decode(plano);
}

async function cifrar() {
  const password = await leerPassword();
  let texto;
  try { texto = await readFile(RUTA_DATOS, 'utf8'); } catch { fallar(`No existe ${path.relative(raiz, RUTA_DATOS)}. Usa --descifrar para regenerarlo.`); }
  let datos;
  try { datos = JSON.parse(texto); } catch (e) { fallar(`tareas.json no es JSON válido: ${e.message}`); }
  const errores = validar(datos);
  if (errores.length) fallar(`Revisa tareas.json:\n  - ${errores.join('\n  - ')}`);

  // Antes de cifrar, se leen los logs de los proyectos para que cada tarea lleve su actividad.
  let actividad = null;
  try {
    const { arbol, errores } = await leerLogs({ marcarVistos: false });
    actividad = actividadParaWeb(arbol);
    for (const e of errores) console.warn(`⚠ ${e}`);
    console.log(`✔ Logs leídos hasta ${arbol.hasta} (${Object.keys(actividad.tareas).length} tareas con actividad, ${arbol.sin_tarea.total} registros sin tarea)`);
  } catch (e) {
    if (existsSync(RUTA_ARBOL)) {
      actividad = actividadParaWeb(JSON.parse(await readFile(RUTA_ARBOL, 'utf8')));
      console.warn(`⚠ No se pudieron leer los logs (${e.message}); se usa el último árbol guardado.`);
    } else {
      console.warn(`⚠ No se pudieron leer los logs (${e.message}); se cifra sin actividad.`);
    }
  }

  const plano = JSON.stringify(actividad ? { ...datos, actividad } : datos);
  const nTareas = datos.proyectos.reduce((n, p) => n + p.tareas.length, 0);

  if (existsSync(RUTA_CIFRADO)) {
    try {
      if ((await descifrarArchivo(password)) === plano) {
        console.log(`✔ Sin cambios: ${nTareas} tareas en ${datos.proyectos.length} proyectos.`);
        return;
      }
    } catch { /* contraseña distinta o archivo corrupto: se vuelve a cifrar */ }
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clave = await derivarClave(password, salt, ITERACIONES);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, new TextEncoder().encode(plano));
  const payload = { v: 1, iter: ITERACIONES, salt: b64(salt), iv: b64(iv), data: b64(data) };
  await writeFile(RUTA_CIFRADO, JSON.stringify(payload) + '\n');
  console.log(`✔ ${nTareas} tareas en ${datos.proyectos.length} proyectos cifradas en ${path.relative(raiz, RUTA_CIFRADO)}`);
}

async function descifrar() {
  const password = await leerPassword();
  let plano;
  try { plano = await descifrarArchivo(password); } catch { fallar('No se pudo descifrar: la contraseña no coincide o el archivo no existe.'); }
  const datos = JSON.parse(plano);
  delete datos.actividad; // se regenera desde los logs en cada cifrado
  await writeFile(RUTA_DATOS, JSON.stringify(datos, null, 2) + '\n');
  console.log(`✔ Regenerado ${path.relative(raiz, RUTA_DATOS)}`);
}

if (process.argv.includes('--descifrar')) await descifrar();
else await cifrar();
