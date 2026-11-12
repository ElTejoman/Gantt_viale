# Gantt de seguimiento de tareas

Tablero Gantt interactivo (Three.js) para dar seguimiento a mis tareas. Es un sitio estático sin backend que se publica en Netlify en cada push a `main`.

## Cómo está armado

```
data/tareas.json       Datos en texto plano. NO se sube a git (el repo es público).
.env.local             GANTT_PASSWORD=...  NO se sube a git.
scripts/cifrar.mjs     Valida tareas.json y lo cifra en site/tareas.enc.json
scripts/servir.mjs     Servidor local para revisar el sitio
site/                  Lo que publica Netlify
  tareas.enc.json      Datos cifrados (AES-GCM 256 + PBKDF2). Este sí se sube.
  js/gantt.js          Motor del Gantt en Three.js (shader propio para las barras)
  js/app.js            Interfaz: lista, filtros, panel de detalle, bitácora
  vendor/              Three.js r170
```

La contraseña nunca está en el repo ni en el sitio publicado. Sin ella, `tareas.enc.json` no se puede leer.

## Actividad de los proyectos

`scripts/leer_logs.mjs` lee los commits y bitácoras de los proyectos fuente, asigna cada registro a una tarea con las reglas de `data/fuentes.json` (privado) y arma `data/arbol.json`. Al cifrar, cada tarea lleva su número de registros y los últimos 3, que la web muestra en el panel de detalle. Pon el ID de la tarea en tus commits (`DEM-6: …`) para que se asignen solos.

## Bandeja de tareas (n8n)

Para anotar una tarea nueva o una reunión desde cualquier lado (celular incluido) hay un formulario en n8n. Cada envío queda en una bandeja dentro de n8n; `scripts/bandeja.mjs` la trae a `data/bandeja.json` (privado) y le avisa a n8n que ya la tiene. En la siguiente sesión, Claude la organiza en el Gantt.

El flujo se llama **Gantt · Bandeja de tareas** en n8n y guarda los envíos en la Data Table *Gantt bandeja de tareas* (estado `nuevo` → `recibido`). Sus dos webhooks (`gantt-bandeja` y `gantt-bandeja-ok`) piden la cabecera `X-Gantt-Token`.

Instalación (una sola vez):

1. `npm run bandeja:token` genera un token y lo guarda en `.env.local`.
2. En n8n, crea una credencial *Header Auth* con Name `X-Gantt-Token` y Value igual al token. Asígnala a los dos webhooks y activa el flujo.
3. En `.env.local` pon `N8N_BANDEJA_URL=https://<tu-instancia-n8n>/webhook`.
4. `npm run bandeja` comprueba la conexión.

Formulario: `https://<tu-instancia-n8n>/form/gantt-nueva-tarea`. La primera página pregunta si es una **tarea nueva** o una **reunión** y el proyecto; la segunda pide los datos de cada una.

- Tarea: nombre, detalle, para cuándo y prioridad.
- Reunión: fecha, tema, con quién, tarea relacionada (opcional), acuerdos y pendientes (uno por línea; "Nombre: …" si lo debe otra persona; `[ID]` al final si va a una tarea distinta de la relacionada) y notas. Sus pendientes crean o enlazan tareas por sí solos.

Las reuniones quedan en `reuniones` de `tareas.json`. Cada pendiente se enlaza a una tarea (o crea una) y se cierra cuando un commit o un log lo cumple.

## Actualizar tareas

1. Edita `data/tareas.json`.
2. `npm run cifrar` valida el archivo y genera `site/tareas.enc.json`.
3. Haz commit y push. Netlify publica en 1 o 2 minutos.

Para verlo en local: `npm run dev` y abre http://localhost:5288

Si pierdes `data/tareas.json`, regenéralo desde la versión cifrada con `npm run descifrar`. Necesitas `.env.local`.

## Formato de una tarea

```json
{
  "id": "DEM-1",
  "nombre": "Integrar Incidencias",
  "inicio": "2026-11-16",
  "fin": "2026-11-27",
  "estado": "en_curso",
  "avance": 40,
  "tentativa": false,
  "tipo": "tarea",
  "depende": ["DEM-0"],
  "detalle": "Texto libre",
  "checklist": [{ "texto": "Subtarea", "hecho": true }],
  "conteo": { "hecho": 3, "total": 10, "unidad": "observaciones" },
  "actualizaciones": [{ "fecha": "2026-11-18", "nota": "Qué se hizo", "avance": 40 }]
}
```

- `estado`: `pendiente` · `en_curso` · `bloqueada` · `terminada`
- `tipo`: `tarea` (con plazo, cuenta para el avance global) · `continua` · `recurrente` (marca cada fin de mes)
- Si no pones `avance`, se calcula desde `checklist` o `conteo`.
- Una tarea con plazo se marca **atrasada** automáticamente si pasó su fecha de fin y no está terminada.

## Netlify (una sola vez)

1. Netlify → *Add new site* → *Import an existing project* → GitHub → `ElTejoman/Gantt_viale`.
2. Deja vacío el *build command*. El directorio de publicación es `site` (ya viene en `netlify.toml`).
3. *Deploy*. Desde ahí, cada push a `main` se publica solo.
