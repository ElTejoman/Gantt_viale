import { descifrar } from './cifrado.js';
import { normalizar, hoy } from './datos.js';
import { iniciarApp } from './app.js';

const CLAVE_SESION = 'gantt-clave';
const login = document.getElementById('login');
const form = document.getElementById('login-form');
const input = document.getElementById('login-clave');
const error = document.getElementById('login-error');
const boton = form.querySelector('button');

let payload = null;
async function obtenerPayload() {
  if (!payload) {
    const r = await fetch('tareas.enc.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('descarga');
    payload = await r.json();
  }
  return payload;
}

async function entrar(clave) {
  const datos = await descifrar(await obtenerPayload(), clave);
  try { sessionStorage.setItem(CLAVE_SESION, clave); } catch {}
  login.hidden = true;
  document.getElementById('app').hidden = false;
  iniciarApp(normalizar(datos, hoy()));
}

function mostrarError(msg) {
  error.textContent = msg;
  error.hidden = false;
  input.setAttribute('aria-invalid', 'true');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const clave = input.value;
  if (!clave) return mostrarError('Escribe la contraseña.');
  boton.disabled = true;
  boton.textContent = 'Abriendo…';
  error.hidden = true;
  try {
    await entrar(clave);
  } catch (err) {
    if (err?.message === 'descarga') mostrarError('No se pudo cargar el tablero. Revisa tu conexión y recarga la página.');
    else mostrarError('Contraseña incorrecta.');
    input.select();
  } finally {
    boton.disabled = false;
    boton.textContent = 'Entrar';
  }
});

input.addEventListener('input', () => {
  error.hidden = true;
  input.removeAttribute('aria-invalid');
});

(async () => {
  let guardada = null;
  try { guardada = sessionStorage.getItem(CLAVE_SESION); } catch {}
  if (guardada) {
    try {
      await entrar(guardada);
      return;
    } catch {
      try { sessionStorage.removeItem(CLAVE_SESION); } catch {}
    }
  }
  login.hidden = false;
  input.focus();
})();
