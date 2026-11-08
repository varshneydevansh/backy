/** Actual hosted and checked starter React receivers; deterministic hook/message harness, no browser. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {load} from './collection-import-postgres-handlers.mjs';
const require=createRequire(import.meta.url),protocol='backy.interactive-component.v1',key='fixture.recovery',version='1.0.0';
let checks=0;
function receiver(relative,name){const hooks=[],listeners=new Set(),sent=[];let cursor=0,pendingEffects=[];const frame={postMessage(payload){sent.push(payload)}};const window={location:{origin:'http://fixture.invalid'},setTimeout:()=>1,clearTimeout(){},addEventListener(type,callback){if(type==='message')listeners.add(callback)},removeEventListener(type,callback){if(type==='message')listeners.delete(callback)},fetch:async()=>new Response('{}')};
 const same=(left,right)=>left&&right&&left.length===right.length&&left.every((value,index)=>Object.is(value,right[index]));
 const react={...React,useState(initial){const index=cursor++;hooks[index]??={value:typeof initial==='function'?initial():initial};return[hooks[index].value,next=>{hooks[index].value=typeof next==='function'?next(hooks[index].value):next}]},useRef(initial){const index=cursor++;hooks[index]??={value:{current:initial===null?{contentWindow:frame}:initial}};return hooks[index].value},useMemo(callback,deps){const index=cursor++;if(!same(hooks[index]?.deps,deps))hooks[index]={deps,value:callback()};return hooks[index].value},useCallback(callback,deps){return this.useMemo(()=>callback,deps)},useEffect(callback,deps){const index=cursor++;if(!same(hooks[index]?.deps,deps)){hooks[index]?.cleanup?.();hooks[index]={deps};pendingEffects.push(()=>{hooks[index].cleanup=callback()})}}};
 // Named hook functions are called unbound by transpiled React source.
 react.useCallback=(callback,deps)=>react.useMemo(()=>callback,deps);
 const exports={},compiled=ts.transpileModule(readFileSync(new URL(relative,import.meta.url),'utf8')+`\nexports.fixtureReceiver=${name};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(compiled,{exports,module:{exports},window,URL,console,fetch:window.fetch,require:id=>id==='react'?react:id==='./BackyDataFigure'?{BackyDataFigure:()=>null}:id==='../lib/publicInteractiveComponentMetadata'?load('../src/lib/publicInteractiveComponentMetadata.ts',{}):require(id)});
 const element={id:'recovery-frame',type:'codeComponent',componentKey:key,version,props:{componentKey:key,version,count:0,sandboxUrl:`/api/sites/fixture-site/interactive-components/${key}/${version}/sandbox`},fallback:{title:'Retained authored fallback',text:'Failure summary remains readable.'},renderCapabilities:{hydrationMode:'sandbox-iframe'}};
 const props=name==='SandboxedCodeComponentFrame'?{element,fallback:element.fallback,componentKey:key,version,src:element.props.sandboxUrl,renderCapabilities:element.renderCapabilities,siteId:'fixture-site'}:{element,siteId:'fixture-site',publicApiBaseUrl:'http://fixture.invalid/api'};
 const render=()=>{cursor=0;pendingEffects=[];const value=exports.fixtureReceiver(props);for(const effect of pendingEffects)effect();return value};
 const dispatch=(type,patch={},source=frame)=>{const event={source,data:{type,protocol,componentKey:key,version,...patch}};for(const callback of [...listeners])callback(event);return render()};
 return{render,dispatch,frame,sent,listeners,props};}
for(const [relative,name]of [['../src/components/InteractiveComponentContent.tsx','SandboxedCodeComponentFrame'],['../../../examples/custom-frontend-next/src/lib/interactive.tsx','BackyInteractiveComponent'],['../../../examples/custom-frontend-next/src/lib/portable-rich-text.js','SandboxedCodeComponentFrame']]){
 const fixture=receiver(relative,name);fixture.render();fixture.dispatch('backy.interactive-component.ready');
 let output=fixture.dispatch('backy.interactive-component.error',{message:'Synthetic update rejected'});assert.equal(output.props['data-backy-sandbox-runtime-error'],'Synthetic update rejected');checks++;
 output=fixture.dispatch('backy.interactive-component.resize',{height:500});assert.equal(output.props['data-backy-sandbox-runtime-error'],'Synthetic update rejected','A resize during a failing update is not success');checks++;
 output=fixture.dispatch('backy.interactive-component.ready');assert.equal(output.props['data-backy-sandbox-runtime-error'],'Synthetic update rejected','Readiness before mount/update completion cannot hide failure');checks++;
 output=fixture.dispatch('backy.interactive-component.rendered',{version:'other-version'});assert.equal(output.props['data-backy-sandbox-runtime-error'],'Synthetic update rejected','Other version success cannot clear this error');checks++;
 output=fixture.dispatch('backy.interactive-component.rendered',{componentKey:''});assert.equal(output.props['data-backy-sandbox-runtime-error'],'Synthetic update rejected','Completion requires exact component identity');checks++;
 output=fixture.dispatch('backy.interactive-component.rendered',{version:''});assert.equal(output.props['data-backy-sandbox-runtime-error'],'Synthetic update rejected','Completion requires exact version');checks++;
 output=fixture.dispatch('backy.interactive-component.rendered',{protocol:'foreign.protocol'});assert.equal(output.props['data-backy-sandbox-runtime-error'],'Synthetic update rejected','Other protocol success cannot hide failure');checks++;
 output=fixture.dispatch('backy.interactive-component.rendered',{},{});assert.equal(output.props['data-backy-sandbox-runtime-error'],'Synthetic update rejected','Other window success cannot hide failure');checks++;
 const before=fixture.sent.length;
 output=fixture.dispatch('backy.interactive-component.rendered');assert.equal(output.props['data-backy-sandbox-runtime-error'],undefined,`${name}: confirmed successful update must clear the preceding visible runtime error`);checks++;
 assert.equal(fixture.sent.length,before,'Completion must not send another init and create an update/ready loop');checks++;
 assert.equal(output.props.children[1]||null,null,'Successful completion removes the outer error/fallback presentation');checks++;
 if(name==='BackyInteractiveComponent'){assert.equal(output.props.children[0].props.style.display,'block','Successful completion shows the previously hidden portable frame');checks++;}
 output=fixture.dispatch('backy.interactive-component.error',{message:'Second update rejected'});assert.equal(output.props['data-backy-sandbox-runtime-error'],'Second update rejected','Later failures retain their diagnostic/fallback');checks++;
 const child=Array.isArray(output.props.children)?output.props.children:[output.props.children];assert(child.some(node=>node),'Renderer remains mounted with fallback/error presentation');checks++;
}
console.log(`Executable widget actual hosted, generated rich portable and starter React recovery receivers passed ${checks} assertions: failure→success clears stale error without init replay; readiness/resize/foreign identity cannot hide failure; later failure remains visible.`);
