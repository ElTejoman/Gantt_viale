// Levanta el sitio en segundo plano si el puerto está libre: node scripts/servir_fondo.mjs [puerto]
// Lo usa el hook SessionStart de Claude Code para que el Gantt quede siempre en localhost.
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const puerto = Number(process.argv[2]) || 5288;
const ocupado = await new Promise((resolver) => {
  const s = net.connect(puerto, '127.0.0.1');
  s.once('connect', () => { s.destroy(); resolver(true); });
  s.once('error', () => resolver(false));
});

if (ocupado) {
  console.log(`Sitio local ya disponible en http://localhost:${puerto}`);
} else {
  const servir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'servir.mjs');
  const hijo = spawn(process.execPath, [servir, String(puerto)], { detached: true, stdio: 'ignore', windowsHide: true });
  hijo.unref();
  console.log(`Sitio local levantado en http://localhost:${puerto} (segundo plano)`);
}
