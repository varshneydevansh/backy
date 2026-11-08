// Actual editor fixture, without API/provider writes. Use CUA for browser interaction.
// A core snapshot prevents unrelated concurrent source edits from reloading the journey.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { buildSync } from 'esbuild';
import { mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const scratch = mkdtempSync(join(tmpdir(), 'backy-motion-browser-'));
// Vite also owns process signals; retain cleanup when its handler exits first.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
let server;
try {
  symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir');
  execFileSync(join(root, 'node_modules/.bin/tailwindcss'), [
    '-c', 'apps/admin/tailwind.config.js', '-i', 'apps/admin/src/index.css',
    '-o', join(scratch, 'proof.css'), '--content', 'apps/admin/src/**/*.{ts,tsx}',
  ], { cwd: root, stdio: 'pipe' });
  buildSync({ entryPoints: [join(root, 'packages/core/src/index.ts')],
    outfile: join(scratch, 'core.mjs'), bundle: true, format: 'esm',
    platform: 'browser', logLevel: 'silent' });
  writeFileSync(join(scratch, 'index.html'), `<!doctype html><html><head>
    <title>Actual Canvas animation acceptance</title><link rel="stylesheet" href="/proof.css">
    </head><body><div id="root"></div><script type="module"
    src="/@fs/${root}/apps/admin/scripts/canvas-animation-runtime-fixture.tsx"></script></body></html>`);
  server = await createServer({ configFile: false, root: scratch, plugins: [react()],
    resolve: { alias: { '@': join(root, 'apps/admin/src'), '@backy-cms/core': join(scratch, 'core.mjs') },
      dedupe: ['react', 'react-dom', 'gsap'] }, define: { 'process.env': '{}' },
    server: { host: '127.0.0.1', port: 5182, strictPort: true, fs: { allow: [root, scratch] } } });
  await server.listen();
  console.log(JSON.stringify({ ready: true, url: 'http://127.0.0.1:5182', scratch,
    boundary: 'actual editor and GSAP; disposable local save; no API/provider proof' }));
  await new Promise(resolve => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve); });
} finally {
  await server?.close();
  rmSync(scratch, { recursive: true, force: true });
}
