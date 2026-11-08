import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'examples/custom-frontend-next/src/lib/portable-rich-text.js');
const result = await build({
  absWorkingDir: root,
  entryPoints: ['apps/public/src/components/PortableRichTextContent.tsx'],
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
  alias: { '@backy-cms/core': path.join(root, 'packages/core/src/index.ts') },
  banner: { js: '"use client";\n// Generated from Backy shared/hosted renderer sources. Run scripts/generate-portable-rich-renderer.mjs.' },
});
const source = result.outputFiles[0].text;
if (process.argv.includes('--check')) {
  if (await fs.readFile(output, 'utf8') !== source) throw new Error('Portable rich renderer is stale; regenerate it.');
  console.log('Portable rich renderer matches the shared source.');
} else {
  await fs.writeFile(output, source);
  console.log('Generated self-contained portable rich renderer (React external; no unpublished package dependency).');
}
