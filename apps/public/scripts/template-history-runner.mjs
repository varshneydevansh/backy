import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

// Public .ts handlers are otherwise interpreted as CommonJS by tsx because
// this Next app is not an ESM package. Bundle the actual integration graph as
// ESM so its import-only dependencies remain imports. Each graph is bundled
// once, retaining repository/session singleton hooks and every assertion.
const directory = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
for (const fixture of ['template-history-smoke.mts', 'template-history-demo-smoke.mts']) {
 // Keep the file next to the original test: its import.meta.url source reads
 // use ../src and must retain that relative location.
 const output = join(directory, '.template-history-' + randomUUID() + '.mjs');
 try {
  const result = await build({ entryPoints: [join(directory, fixture)], bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external',
   tsconfig: join(directory, '../tsconfig.json'), outfile: output, write: false, sourcemap: 'inline',
   banner: { js: 'import { createRequire as createFixtureRequire } from "node:module"; const require = createFixtureRequire(import.meta.url);' },
   // Next exposes extensionless CommonJS subpaths; native Node ESM needs the
   // resolved file. Keep one external Next implementation for instanceof checks.
   plugins: [{ name: 'native-next-subpaths', setup(builder) {
    builder.onResolve({ filter: /^next\// }, args => ({ path: require.resolve(args.path), external: true }));
   } }],
   // The existing fixtures intentionally accept both namespace/default wrappers.
   logOverride: { 'import-is-undefined': 'silent' },
  });
  writeFileSync(output, result.outputFiles[0].contents);
  const child = spawnSync(process.execPath, [output], { stdio: 'inherit', cwd: join(directory, '..'), env: process.env });
  if (child.error) throw child.error;
  if (child.status !== 0) { process.exitCode = child.status || 1; break; }
 } finally { rmSync(output, { force: true }); }
}
