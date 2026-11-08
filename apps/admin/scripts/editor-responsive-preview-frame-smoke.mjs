// Bundle the real TSX graph as production Vite does; the source packages mix CJS/ESM.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname,resolve,join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const scratch=mkdtempSync(join(root,'.responsive-preview-frame-proof-'));
try {
 const result=await build({absWorkingDir:root,entryPoints:['apps/admin/scripts/editor-responsive-preview-frame-smoke.tsx'],tsconfig:'apps/admin/tsconfig.json',bundle:true,sourcemap:'inline',write:false,platform:'node',format:'cjs',target:'node22',jsx:'automatic',loader:{'.css':'empty'},external:['react','react/jsx-runtime','react-dom/server'],define:{'import.meta.url':JSON.stringify(new URL('./editor-responsive-preview-frame-smoke.tsx',import.meta.url).href),'import.meta.env':'{}'}});
 const entry=join(scratch,'proof.cjs');writeFileSync(entry,result.outputFiles[0].text);
 const run=spawnSync(process.execPath,['--enable-source-maps',entry],{cwd:root,env:{...process.env,NODE_ENV:'production'},encoding:'utf8',timeout:30000});
 assert.equal(run.status,0,run.stdout+'\n'+run.stderr);process.stdout.write(run.stdout);
} finally {rmSync(scratch,{recursive:true,force:true});}
