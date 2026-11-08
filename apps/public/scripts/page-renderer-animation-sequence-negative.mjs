/** Private negative bundle removes only sequence projection; production source stays intact. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'../../..'),scratch=mkdtempSync(join(tmpdir(),'backy-hosted-animation-negative-')),out=join(scratch,'negative.cjs');
try{
 symlinkSync(join(root,'node_modules'),join(scratch,'node_modules'),'dir');let removed=false;
 await build({entryPoints:[join(import.meta.dirname,'page-renderer-animation-sequence-smoke.tsx')],outfile:out,bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:join(root,'apps/public/tsconfig.json'),logLevel:'silent',plugins:[{name:'remove-only-sequence-projection',setup(builder){builder.onLoad({filter:/\/PageRenderer\.tsx$/},args=>{
  const source=readFileSync(args.path,'utf8'),line='    ...(sequence ? { sequence } : {}),\n';assert.equal(source.split(line).length,2,'Sequence projection must be unique');removed=true;return{contents:source.replace(line,''),loader:'tsx'};
 });}}]});assert(removed);
 const result=spawnSync(process.execPath,['--import','tsx',out],{cwd:root,encoding:'utf8'}),log=(result.stdout||'')+(result.stderr||'');writeFileSync('/tmp/backy-hosted-animation-negative-control.log',log,{mode:0o600});
 assert(result.status!==0&&log.includes('Hosted PageRenderer must serialize the exact saved two-step sequence')&&log.includes('+ undefined'),'Actual hosted SSR regression must fail because sequence was stripped');
 console.log('Hosted sequence negative control passed: deleting only sequence serialization reproduces actual HTML loss; production source unchanged.');
}finally{rmSync(scratch,{recursive:true,force:true});}
