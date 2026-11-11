# Instrucciones para Claude

Gantt de seguimiento de tareas que el dueño del repo comparte con su jefe. Sitio estático en `site/` (Three.js r170 incluido en `site/vendor`, sin npm ni build). Se publica en Netlify en cada push a `main`. El repo es **público**.

## Cuando el usuario da una actualización de tareas

1. Edita `data/tareas.json` (está en .gitignore: nunca forzar su commit).
2. Actualiza `"actualizado"` con la fecha de hoy.
3. Por cada avance, agrega una entrada en `actualizaciones` (`fecha`, `nota` y `avance` si aplica) y ajusta `estado` / `avance` / `checklist` / `conteo`.
4. Cuando el usuario confirme una fecha, quita `"tentativa": true`.
5. Corre `npm run cifrar`: valida el archivo y regenera `site/tareas.enc.json`. Corrige cualquier error que reporte.
6. Haz commit solo de `site/tareas.enc.json` (y del código si cambió). Pregunta antes de hacer push.

## Reglas

- Nunca escribas la contraseña ni datos de tareas en texto plano en archivos versionados (README, código, commits).
- La contraseña está en `.env.local` (GANTT_PASSWORD).
- Verifica cambios visuales con `node scripts/servir.mjs` (puerto 5288) y Playwright en Python.
