# Instrucciones para Claude

Gantt de seguimiento de tareas que el dueño del repo comparte con su jefe. Sitio estático en `site/` (Three.js r170 incluido en `site/vendor`, sin npm ni build). Se publica en Netlify en cada push a `main`. El repo es **público**.

## Cuando el usuario da una actualización de tareas

1. Edita `data/tareas.json` (está en .gitignore: nunca forzar su commit).
2. Actualiza `"actualizado"` con la fecha de hoy.
3. Por cada avance, agrega una entrada en `actualizaciones` (`fecha`, `nota` y `avance` si aplica) y ajusta `estado` / `avance` / `checklist` / `conteo`.
4. Cuando el usuario confirme una fecha, quita `"tentativa": true`.
5. Corre `npm run cifrar`: valida el archivo y regenera `site/tareas.enc.json`. Corrige cualquier error que reporte.
6. Haz commit solo de `site/tareas.enc.json` (y del código si cambió). Pregunta antes de hacer push.

## Lectura automática de logs (antes de cualquier cambio)

- Un hook `UserPromptSubmit` (en `.claude/settings.local.json`) corre `scripts/leer_logs.mjs --hook` en cada mensaje del usuario: lee commits y bitácoras de los proyectos, actualiza `data/arbol.json` y me pasa como contexto los **registros nuevos** desde la última lectura, por tarea. Si aparece algo "SIN TAREA", proponer al usuario si es tarea nueva o falta una regla.
- `data/arbol.json`: proyecto → tarea → total, commits, entradas de bitácora y últimos 3. `data/logs_estado.json` guarda qué registros ya se vieron. Las reglas de asignación están en `data/fuentes.json` (orden importa; gana la primera; un ID en el commit manda).
- `npm run cifrar` vuelve a leer los logs (sin marcarlos como vistos) y cifra cada tarea con su conteo y sus 3 últimos registros, que la web muestra en el panel.
- `npm run logs` muestra el árbol; `npm run logs:sin-tarea` lo que no se pudo asignar.
- Todo lo de `data/` es privado (gitignored). Las rutas y el mapa tarea → evidencia están en `CLAUDE.local.md`. Los commits del usuario llevan el ID de la tarea (`DEM-1: …`) desde el 2026-11-11.

## Reglas

- Nunca escribas la contraseña ni datos de tareas en texto plano en archivos versionados (README, código, commits).
- La contraseña está en `.env.local` (GANTT_PASSWORD).
- Verifica cambios visuales con `node scripts/servir.mjs` (puerto 5288) y Playwright en Python.
