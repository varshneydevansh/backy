/** Remove only the saved-design branch in a private bundle; never rewrite runtime source. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'../../..'),scratch=mkdtempSync(join(tmpdir(),'backy-render-negative-')),out=join(scratch,'negative.mts');
try {
 symlinkSync(join(root,'node_modules'),join(scratch,'node_modules'),'dir');let replaced=false;
 await build({entryPoints:[join(import.meta.dirname,'collection-authored-design-render-smoke.mts')],outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',tsconfig:join(root,'apps/public/tsconfig.json'),logLevel:'silent',banner:{js:"import {createRequire as fixtureCreateRequire} from 'node:module';const require=fixtureCreateRequire(import.meta.url);"},plugins:[{name:'remove-saved-collection-design-only',setup(builder){builder.onLoad({filter:/\/renderPayload\.ts$/},args=>{
  let source=readFileSync(args.path,'utf8');const start=source.indexOf('  // The collection owns the saved instance design.'),end=source.indexOf('  const template = collectionFrontendDesignTemplate(site, collection);',start);
  assert(start>=0&&end>start,'Negative guard location missing');source=source.slice(0,start)+source.slice(end);replaced=true;return {contents:source,loader:'ts'};
 });}}]});
 assert(replaced,'Negative branch was not removed');
 const result=spawnSync(process.execPath,['--import','tsx',out],{cwd:root,encoding:'utf8'}),log=(result.stdout||'')+(result.stderr||'');
 writeFileSync('/tmp/backy-collection-render-negative-control.log',log,{mode:0o600});
 assert(result.status!==0&&log.includes('Saved restored v1 must render rather than registry v2')&&log.includes('720 !== 640'),'Negative runtime must fail on restored v1 versus registry v2 geometry');
 console.log('Collection render negative control passed: removing only saved-design precedence reproduced actual handler720!==640; runtime source unchanged.');
} finally {rmSync(scratch,{recursive:true,force:true});}
