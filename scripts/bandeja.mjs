// Bandeja de tareas nuevas que llegan desde el formulario de n8n.
//
// n8n guarda cada envío del formulario. Este script los trae a data/bandeja.json
// (privado), le confirma a n8n que ya están guardados aquí para que los suelte,
// y deja la lista de "pendientes de organizar" para que Claude los pase a
// data/tareas.json en la siguiente conversación.
//
// Uso:
//   node scripts/bandeja.mjs                     -> trae lo nuevo y muestra la bandeja
//   node scripts/bandeja.mjs --token             -> genera N8N_BANDEJA_TOKEN en .env.local (si falta) y lo muestra
//   node scripts/bandeja.mjs --organizada B-… DEM-7   -> marca un pendiente como organizado en esa tarea
//   node scripts/bandeja.mjs --descartar B-… "motivo" -> lo saca de pendientes sin crear tarea
//
// Configuración en .env.local:
//   N8N_BANDEJA_URL=https://<tu-instancia>/webhook     (base de los webhooks de n8n)
//   N8N_BANDEJA_TOKEN=<token>                          (el mismo valor de la credencial Header Auth en n8n)

import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_ENV = path.join(raiz, '.env.local');
export const RUTA_BANDEJA = path.join(raiz, 'data', 'bandeja.json');
const CABECERA = 'X-Gantt-Token';
const ESPERA_MS = 6000;

async function leerEnv() {
  const env = {};
  if (existsSync(RUTA_ENV)) {
    for (const l of (await readFile(RUTA_ENV, 'utf8')).split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return {
    url: (process.env.N8N_BANDEJA_URL || env.N8N_BANDEJA_URL || '').replace(/\/+$/, ''),
    token: process.env.N8N_BANDEJA_TOKEN || env.N8N_BANDEJA_TOKEN || '',
  };
}

async function leerBandeja() {
  if (!existsSync(RUTA_BANDEJA)) return { pendientes: [], organizadas: [] };
  const b = JSON.parse(await readFile(RUTA_BANDEJA, 'utf8'));
  return { pendientes: b.pendientes || [], organizadas: b.organizadas || [] };
}

async function guardarBandeja(b) {
  await writeFile(RUTA_BANDEJA, JSON.stringify({ actualizado: new Date().toISOString(), ...b }, null, 2) + '\n');
}

async function pedir(url, opciones) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ESPERA_MS);
  try {
    const r = await fetch(url, { ...opciones, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'n8n no respondió a tiempo' : e.message);
  } finally {
    clearTimeout(t);
  }
}

function limpio(v, max = 2000) {
  return typeof v === 'string' ? v.trim().slice(0, max) : v == null ? '' : String(v).slice(0, max);
}

// Trae lo nuevo de n8n y lo guarda en data/bandeja.json. Nunca lanza: devuelve el error en el resultado.
export async function traerBandeja() {
  const { url, token } = await leerEnv();
  const bandeja = await leerBandeja();
  const res = { configurada: Boolean(url && token), nuevas: [], pendientes: bandeja.pendientes, error: null };
  if (!res.configurada) return res;

  try {
    const r = await pedir(`${url}/gantt-bandeja`, { headers: { [CABECERA]: token } });
    const lista = Array.isArray(r?.pendientes) ? r.pendientes : [];
    const conocidas = new Set([...bandeja.pendientes, ...bandeja.organizadas].map((p) => p.id));
    for (const p of lista) {
      if (!p?.id || conocidas.has(p.id)) continue;
      const item = {
        id: limpio(p.id, 80),
        tipo: p.tipo === 'reunion' ? 'reunion' : 'tarea',
        recibido: limpio(p.recibido, 40),
        tarea: limpio(p.tarea, 300),
        proyecto: limpio(p.proyecto, 80),
        detalle: limpio(p.detalle),
        fecha: limpio(p.fecha, 10),
        prioridad: limpio(p.prioridad, 20),
      };
      if (item.tipo === 'reunion') {
        item.tareaRelacionada = limpio(p.tarea_relacionada, 80);
        item.participantes = limpio(p.participantes, 300);
        item.acuerdos = limpio(p.acuerdos, 6000);
        item.pendientes = limpio(p.pendientes, 6000);
      }
      bandeja.pendientes.push(item);
      res.nuevas.push(item);
      conocidas.add(item.id);
    }
    if (res.nuevas.length) await guardarBandeja(bandeja);
    // Solo después de guardarlas aquí se le dice a n8n que las suelte.
    if (lista.length) {
      await pedir(`${url}/gantt-bandeja-ok`, {
        method: 'POST',
        headers: { [CABECERA]: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: lista.map((p) => p.id).filter(Boolean) }),
      });
    }
  } catch (e) {
    res.error = e.message;
  }
  res.pendientes = bandeja.pendientes;
  return res;
}

export function textoBandeja(res) {
  if (!res.configurada) return '';
  const lineas = [];
  if (res.error) lineas.push(`Bandeja de n8n: no se pudo consultar (${res.error}). Se muestra lo ya guardado.`);
  if (!res.pendientes.length) {
    if (!res.error) lineas.push('Bandeja de n8n: sin tareas nuevas por organizar.');
    return lineas.join('\n');
  }
  lineas.push(
    `Bandeja de n8n: ${res.pendientes.length} envío(s) por organizar en data/tareas.json` +
      (res.nuevas.length ? ` (${res.nuevas.length} recién llegado(s))` : '') +
      ':',
  );
  const lista = (txt) => txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const p of res.pendientes) {
    if (p.tipo === 'reunion') {
      lineas.push(`- ${p.id} · REUNIÓN del ${p.fecha || '?'} · ${p.tarea} [con: ${p.participantes || '?'}${p.proyecto ? ` · proyecto: ${p.proyecto}` : ''}${p.tareaRelacionada ? ` · tarea: ${p.tareaRelacionada}` : ''}]`);
      for (const a of lista(p.acuerdos || '')) lineas.push(`    acuerdo: ${a.slice(0, 300)}`);
      for (const q of lista(p.pendientes || '')) lineas.push(`    pendiente: ${q.slice(0, 300)}`);
      if (p.detalle) lineas.push(`    notas: ${p.detalle.replace(/\s+/g, ' ').slice(0, 400)}`);
      continue;
    }
    const extra = [p.proyecto && `proyecto: ${p.proyecto}`, p.fecha && `para: ${p.fecha}`, p.prioridad && `prioridad: ${p.prioridad}`]
      .filter(Boolean)
      .join(' · ');
    lineas.push(`- ${p.id} · ${p.recibido?.slice(0, 10) || ''} · ${p.tarea}${extra ? ` [${extra}]` : ''}`);
    if (p.detalle) lineas.push(`    detalle: ${p.detalle.replace(/\s+/g, ' ').slice(0, 300)}`);
  }
  lineas.push('Organizarlas según CLAUDE.md ("Bandeja de tareas desde n8n" y "Reuniones") y marcarlas con `node scripts/bandeja.mjs --organizada <id> <ID-tarea o ID-reunión>`.');
  return lineas.join('\n');
}

async function mover(id, cambios) {
  const b = await leerBandeja();
  const i = b.pendientes.findIndex((p) => p.id === id);
  if (i < 0) throw new Error(`No hay un pendiente con id ${id}`);
  const [p] = b.pendientes.splice(i, 1);
  b.organizadas.push({ ...p, ...cambios, organizado: new Date().toISOString().slice(0, 10) });
  await guardarBandeja(b);
  return p;
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esPrincipal) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === '--token') {
      const { token } = await leerEnv();
      if (token) {
        console.log(`Ya existe N8N_BANDEJA_TOKEN en .env.local:\n\n  ${token}\n`);
      } else {
        const nuevo = randomBytes(24).toString('base64url');
        await appendFile(RUTA_ENV, `${existsSync(RUTA_ENV) ? '\n' : ''}N8N_BANDEJA_TOKEN=${nuevo}\n`);
        console.log(`Token creado y guardado en .env.local:\n\n  ${nuevo}\n`);
      }
      console.log(`En n8n crea una credencial "Header Auth" con Name = ${CABECERA} y Value = ese token.`);
    } else if (args[0] === '--organizada') {
      if (!args[1] || !args[2]) throw new Error('Uso: --organizada <id-bandeja> <ID-tarea>');
      const p = await mover(args[1], { tareaId: args[2] });
      console.log(`✔ "${p.tarea}" quedó organizada como ${args[2]}.`);
    } else if (args[0] === '--descartar') {
      if (!args[1]) throw new Error('Uso: --descartar <id-bandeja> "motivo"');
      const p = await mover(args[1], { descartada: args.slice(2).join(' ') || true });
      console.log(`✔ "${p.tarea}" salió de la bandeja sin crear tarea.`);
    } else {
      const res = await traerBandeja();
      if (!res.configurada) {
        console.log('La bandeja no está configurada: faltan N8N_BANDEJA_URL y/o N8N_BANDEJA_TOKEN en .env.local.');
      } else {
        console.log(textoBandeja(res) || 'Bandeja vacía.');
      }
    }
  } catch (e) {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  }
}
