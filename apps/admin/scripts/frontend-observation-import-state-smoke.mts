import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=ts.createSourceFile('panel.tsx',readFileSync(new URL('../src/components/sites/FrontendCompatibilityPanel.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let initializer:ts.Expression|undefined;
function walk(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='importObservation')initializer=node.initializer;ts.forEachChild(node,walk);}walk(source);assert(initializer);
const js=ts.transpileModule('const importObservation = '+initializer.getText(source)+'; globalThis.handler=importObservation;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let observation='old rendered observation',report:unknown={old:true},error='',busy=false,sequence={current:0};
const context={sequence,siteId:'site-one',FRONTEND_OBSERVATION_MAX_BYTES:256,parseFrontendObservationFile:(raw:string)=>JSON.parse(raw),setObservationJson:(value:string)=>observation=value,setReport:(value:unknown)=>report=value,setError:(value:string)=>error=value,setMessage:()=>{},setBusy:(value:boolean)=>busy=value,handler:undefined as any};vm.runInNewContext(js,context);
for(const file of [{size:300,text:async()=>{throw Error('must not read oversized')}},{size:10,text:async()=>{throw Error('unreadable')}},{size:10,text:async()=>'{invalid'}]){observation='old rendered observation';report={old:true};await context.handler(file);assert.equal(observation,'');assert.equal(report,null);assert(error);assert.equal(busy,false);}
let release!:(value:string)=>void;const pending=new Promise<string>(resolve=>release=resolve);observation='old observation';const reading=context.handler({size:10,text:()=>pending});assert.equal(observation,'','Clear old evidence before awaiting file');sequence.current++;observation='new site evidence';release(JSON.stringify({complete:true,breakpoint:'desktop'}));await reading;assert.equal(observation,'new site evidence','Stale file read cannot replace current site evidence');
await context.handler({size:10,text:async()=>JSON.stringify({complete:true,breakpoint:'desktop'})});assert.equal(JSON.parse(observation).breakpoint,'desktop');
console.log('Observation import state PASS: actual production handler clears stale evidence on oversized/read/parse failure, before awaiting reads, and ignores obsolete completion. Hook setters simulated; full browser proof separate.');
