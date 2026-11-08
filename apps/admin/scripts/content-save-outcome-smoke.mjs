import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSync, transformSync } from 'esbuild';
import vm from 'node:vm';
const compiled=buildSync({entryPoints:[new URL('../src/lib/adminContentApi.ts',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'browser',define:{'import.meta.env':'{}'},logLevel:'silent'}).outputFiles[0].text;
const module={exports:{}},warnings=['CONTENT_CACHE_INVALIDATION_PENDING','CONTENT_AUDIT_PENDING','CONTENT_WEBHOOK_DELIVERY_PENDING'];
const row={id:'item',siteId:'site',title:'Committed title',slug:'fixture',status:'draft',updatedAt:'2026-01-01T00:00:00.001Z',content:{elements:[],metadata:{nested:{zero:0,no:false}}},meta:{kept:true}};
let calls=0,legacy=false,conflict=false;
vm.runInNewContext(compiled,{module,exports:module.exports,console,URL,Headers,Request,Response,fetch:async(url,init)=>{
 calls++;assert.equal(init.method,'PATCH');assert.equal(JSON.parse(init.body).expectedUpdatedAt,'base');
 if(conflict)return Response.json({success:false,error:{code:url.includes('/pages/')?'PAGE_VERSION_CONFLICT':'BLOG_VERSION_CONFLICT',message:'Reload before saving',details:{reloadRequired:true}}},{status:409});
 return Response.json({success:true,data:{[url.includes('/pages/')?'page':'post']:row,...(legacy?{}:{completionWarnings:[...warnings,'PRIVATE_UNKNOWN_DIAGNOSTIC',warnings[0]]})}});
}});
const api=module.exports,input={title:'Committed title',expectedUpdatedAt:'base'};
for(const [outcome,compat,key] of [['updatePageWithOutcome','updatePage','page'],['updateBlogPostWithOutcome','updateBlogPost','post']]){
 const saved=await api[outcome]('site','item',input);assert.deepEqual(Array.from(saved.completionWarnings),warnings);assert.equal(saved[key].title,row.title);assert.deepEqual(JSON.parse(saved[key].content),row.content);assert(!('completionWarnings' in saved[key]));assert(!('completionWarnings' in saved[key].meta));
 const old=await api[compat]('site','item',input);assert.equal(old.title,row.title);assert(!('completionWarnings' in old));
 legacy=true;assert.equal((await api[outcome]('site','item',input)).completionWarnings.length,0);legacy=false;
 conflict=true;await assert.rejects(api[outcome]('site','item',input),error=>error.code.endsWith('VERSION_CONFLICT')&&error.details.reloadRequired);conflict=false;
}
assert.equal(calls,8,'Exactly one request per save; committed/conflicting saves never replay');
assert.equal(api.formatContentSaveWarnings([]),null);
assert.equal(api.formatContentSaveWarnings(warnings),'Saved. Follow-up work needs attention: cache refresh, audit history, webhook delivery.');
assert(!api.formatContentSaveWarnings(['PRIVATE_UNKNOWN_DIAGNOSTIC']));
// Source wiring is kept separate from transport proof; served editor notice is a later gate.
for(const [file,helper,result] of [['pages.$pageId.edit.tsx','updatePageWithOutcome','saveOutcome.page'],['blog.$postId.tsx','updateBlogPostWithOutcome','saveOutcome.post']]){
 const source=readFileSync(new URL('../src/routes/'+file,import.meta.url),'utf8');assert(source.includes('await '+helper+'('));assert(source.includes(result));assert(source.includes('setSaveWarning(formatContentSaveWarnings(saveOutcome.completionWarnings))'));
}
// Execute the production page save callback, rather than duplicating its notice
// lifecycle. Auxiliary route state/serialization and transport are controlled;
// this proves route state transitions, not a served browser or backend save.
const pageSource=readFileSync(new URL('../src/routes/pages.$pageId.edit.tsx',import.meta.url),'utf8');
const saveStart=pageSource.indexOf('  const handleSave = async (');
const saveEnd=pageSource.indexOf('  const reloadLatestPage = async',saveStart);
assert(saveStart>=0&&saveEnd>saveStart,'Actual page save callback extraction boundary');
const routeCode=transformSync(pageSource.slice(saveStart,saveEnd)+'\nglobalThis.actualPageSave = handleSave;',{loader:'tsx',format:'cjs'}).code;
let notice='Page saved and revision snapshot recorded.',saveWarning=null,saveConflict=null,finishSave;
const routeContext={
 isPageEditorSaveBusy:false,canEditPage:true,isUsingLocalPageCopy:false,canPublishPage:true,
 initialCanvasSize:{width:1200,height:900},page:{id:'item',status:'draft',lastUpdated:'base'},siteId:'site',pageId:'item',
 initialCustomCSS:'',initialCustomJS:'',initialThemeTokenRefs:{},initialDesignAssets:{},initialDesignInteractions:{},initialDesignSeo:{},initialDesignDataBindings:{},initialEditableMap:{},initialDesignMetadata:{},
 editPageDeniedMessage:'Editing denied',localPageCopyDisabledMessage:'Local copy cannot save',publishPageDeniedMessage:'Publishing denied',publishDisabledReason:null,
 validatePageSettings:()=>null,serializeCanvasContent:elements=>JSON.stringify({elements}),parseSerializedContent:JSON.parse,
 updatePageWithOutcome:()=>new Promise((resolve,reject)=>{finishSave={resolve,reject};}),
 AdminContentApiError:api.AdminContentApiError,isRecord:value=>!!value&&typeof value==='object',
 formatContentSaveWarnings:api.formatContentSaveWarnings,
 setWorkflowNotice:value=>{notice=value;},setSaveWarning:value=>{saveWarning=value;},setSaveConflict:value=>{saveConflict=value;},
 setPage:()=>{},setRouteCheckPages:()=>{},setRouteCheckSiteId:()=>{},updatePage:()=>{},setCurrentCanvasElements:()=>{},setCurrentCanvasSize:()=>{},loadPageReadiness:()=>{},
};
vm.runInNewContext(routeCode,routeContext);
const routeSettings={title:'Fixture',slug:'fixture',status:'draft',meta:{}};
let pending=routeContext.actualPageSave([],routeSettings);
assert.equal(notice,null,'Previous success is cleared before the current save completes');
finishSave.resolve({page:row,completionWarnings:[]});await pending;
assert.equal(notice,'Page saved and revision snapshot recorded.','Only a completed save announces success');
pending=routeContext.actualPageSave([],routeSettings);
assert.equal(notice,null,'A subsequent save cannot retain the preceding acknowledgement');
finishSave.reject(new api.AdminContentApiError('Reload before saving',{expectedUpdatedAt:'base',currentUpdatedAt:'other'},'PAGE_VERSION_CONFLICT'));
await assert.rejects(pending,error=>error.code==='PAGE_VERSION_CONFLICT');
assert.equal(notice,null,'Conflict cannot coexist with an old save-success notice');
assert.equal(saveConflict.currentUpdatedAt,'other');assert.match(saveWarning,/Reload the latest backend copy/);
notice='Page saved and revision snapshot recorded.';pending=routeContext.actualPageSave([],routeSettings);
finishSave.reject(new Error('Synthetic backend failure'));await assert.rejects(pending,/Synthetic backend failure/);
assert.equal(notice,null);assert.match(saveWarning,/Changes were not persisted/);
notice='Page saved and revision snapshot recorded.';routeContext.isPageEditorSaveBusy=true;
await assert.rejects(routeContext.actualPageSave([],routeSettings),/Wait for the page load/);
assert.equal(notice,null,'A rejected save attempt also clears the obsolete acknowledgement');
// Execute the shared editor's actual save callback across committed renders.
// Controlled I/O and timers expose callback-token races without backend mocks
// purporting to prove database admission or browser lifecycle behavior.
const canvasSource=readFileSync(process.env.BACKY_CANVAS_SAVE_SOURCE_FILE || new URL('../src/components/editor/CanvasEditor.tsx',import.meta.url),'utf8');
const canvasStart=canvasSource.indexOf('  const handleSaveWrapper = useCallback('),canvasEnd=canvasSource.indexOf('  const handleSettingsSave =',canvasStart);
assert(canvasStart>=0&&canvasEnd>canvasStart);
const canvasSaveSource=canvasSource.slice(canvasStart,canvasEnd);
const canvasSaveCode=transformSync(canvasSaveSource+'\nglobalThis.save = handleSaveWrapper;',{loader:'tsx'}).code;
const work=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function saveFixture(){
 const writes=[],timers=new Map(),state={},first=work(),layoutEffects=[];let timerId=0,renderCount=0;
 const refs={};for(const name of ['saveInFlightRef','queuedManualSaveRef','manualSaveRequestedRef'])refs[name]={current:false};
 Object.assign(refs,{activeSaveModeRef:{current:null},changeSequenceRef:{current:1},autosaveTimeoutRef:{current:null},elementsRef:{current:['current geometry']},queuedManualSaveSettingsRef:{current:undefined},queuedManualReplayTimeoutRef:{current:null},currentSaveCallbackRef:{current:null},saveReplayContextRef:{current:'A'},saveReplayGenerationRef:{current:0},editorSaveMountedRef:{current:true}});
 const clear=id=>timers.delete(id);
 function render(token,scope='A',settings={title:token}){
  const effects=[],context={...refs,saveReplayContext:scope,canEdit:true,isParentPersistence:false,hasUnsavedChanges:true,editDisabledReason:'denied',normalizedSaveOwnerLabel:'page',pageSettings:settings,canvasSourceSize:{width:token==='v1'?1200:640,height:900},
   validateSettings:()=>null,useCallback:fn=>fn,useLayoutEffect:(fn,deps)=>effects.push({fn,deps}),clearTimeout:clear,Error,Date,Promise,console:{error:()=>{}},
   window:{setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:clear},
   onSave:async(elements,nextSettings,size)=>{writes.push({token,settings:nextSettings,size,elements});if(renderCount===1&&writes.length===1)await first.promise;},
  };
  for(const name of new Set([...canvasSaveSource.matchAll(/\b(set[A-Z]\w*)\(/g)].map(m=>m[1])))context[name]=value=>{state[name]=value;};
  renderCount++;vm.runInNewContext(canvasSaveCode,context);
  const changed=effects.flatMap((effect,index)=>!layoutEffects[index]||effect.deps.some((dep,i)=>dep!==layoutEffects[index].deps[i])?[{...effect,index}]:[]);
  for(const effect of changed)layoutEffects[effect.index]?.dispose?.();
  for(const effect of changed)layoutEffects[effect.index]={deps:effect.deps,dispose:effect.fn()};
  return context;
 }
 return {render,first,writes,state,timers,refs,unmount:()=>{for(const effect of layoutEffects)effect.dispose?.();refs.editorSaveMountedRef.current=false;},tick:async()=>{for(const [id,fn]of [...timers]){timers.delete(id);fn();}for(let i=0;i<12;i++)await Promise.resolve();}};
}
const saveCase=name=>!process.env.BACKY_CANVAS_SAVE_PROOF_CASE||process.env.BACKY_CANVAS_SAVE_PROOF_CASE===name;
if(saveCase('latest')){
 const f=saveFixture(),old=f.render('v1'),saving=old.save(undefined,true);await old.save();
 f.render('v2');f.first.resolve();await saving;await f.tick();
 assert.equal(f.writes.length,2);assert.equal(f.writes[1].token,'v2','Queued manual save uses the committed callback with the newest author token');
 assert.equal(f.writes[1].size.width,640,'Queued save uses current canvas size');assert.equal(f.writes[1].settings.title,'v2','Without override, queued save uses current settings');
}
if(saveCase('override')){
 const f=saveFixture(),old=f.render('v1'),saving=old.save(undefined,true),override={title:'Intentional manual override'};await old.save(override);
 f.render('v2');f.first.resolve();await saving;await f.tick();assert.equal(f.writes[1].settings,override,'Explicit queued manual settings are retained');
}
if(saveCase('failure'))for(const message of ['Version conflict','Unknown transport outcome']){
 const f=saveFixture(),old=f.render('v1'),saving=old.save(undefined,true);await old.save();f.render('v2');f.first.reject(new Error(message));await saving;await f.tick();
 assert.equal(f.writes.length,1,'Failed autosave must never replay a queued manual write');assert.equal(f.timers.size,0);assert.equal(f.state.setSaveStatus,'error');assert.equal(f.state.setHasUnsavedChanges,true);
}
if(saveCase('unmount'))for(const afterTimer of [false,true]){
 const f=saveFixture(),old=f.render('v1'),saving=old.save(undefined,true);await old.save();f.render('v2');
 if(afterTimer){f.first.resolve();await saving;f.unmount();}else{f.unmount();f.first.resolve();await saving;}
 await f.tick();assert.equal(f.writes.length,1,'Unmount cancels both pending and scheduled replay');
}
if(saveCase('context'))for(const afterTimer of [false,true]){
 const f=saveFixture(),old=f.render('v1'),saving=old.save(undefined,true);await old.save();
 if(afterTimer){f.first.resolve();await saving;}
 f.render('v2','B');f.render('v3','A');
 if(!afterTimer){f.first.resolve();await saving;}
 await f.tick();assert.equal(f.writes.length,1,'A departed context cannot replay even after returning to the same document/site');
}
if(saveCase('autosave-effect')){
 const effectStart=canvasSource.indexOf('  useEffect(() => {\n    if (!hasUnsavedChanges || isSaving || isParentPersistence');
 const effectEnd=canvasSource.indexOf('\n  useEffect(',effectStart+10);
 const markStart=canvasSource.indexOf('  const markChanges = useCallback('),markEnd=canvasSource.indexOf('\n  const ',markStart+10);
 assert(effectStart>=0&&effectEnd>effectStart&&markStart>=0&&markEnd>markStart);
 const effectCode=transformSync(canvasSource.slice(effectStart,effectEnd),{loader:'tsx'}).code;
 const markSource=canvasSource.slice(markStart,markEnd),markCode=transformSync(markSource+'\nglobalThis.edit = markChanges;',{loader:'tsx'}).code;
 for(const message of ['Version conflict','Unknown transport outcome']){
  const f=saveFixture(),old=f.render('v1'),saving=old.save(undefined,true);f.first.reject(new Error(message));await saving;
  const current=f.render('v2');let cleanup;
  const effectContext={...current,hasUnsavedChanges:true,isSaving:false,isParentPersistence:false,saveStatus:f.state.setSaveStatus,EDITOR_AUTOSAVE_DELAY_MS:2000,handleSaveWrapper:current.save,useEffect:fn=>{cleanup=fn();},isCanvasMutationDisabled:false};
  vm.runInNewContext(effectCode,effectContext);assert.equal(f.timers.size,0,'Conflict/uncertain failure does not restart the automatic timer');
  // The actual markChanges callback admits a new author edit, preserving normal autosave.
  for(const name of new Set([...markSource.matchAll(/\b(set[A-Z]\w*)\(/g)].map(m=>m[1])))effectContext[name]=value=>{f.state[name]=typeof value==='function'?value(f.state[name]||0):value;};
  vm.runInNewContext(markCode,effectContext);effectContext.edit();assert.equal(f.state.setSaveStatus,'dirty');
  effectContext.saveStatus=f.state.setSaveStatus;vm.runInNewContext(effectCode,effectContext);
  assert.equal(f.timers.size,1,'New author edit restores the automatic timer');await f.tick();assert.equal(f.writes.length,2);
  cleanup?.();
  const retry=saveFixture(),failed=retry.render('v1'),attempt=failed.save(undefined,true);retry.first.reject(new Error(message));await attempt;
  const manual=retry.render('v2');await manual.save();assert.equal(retry.writes.length,2,'Explicit manual retry is available after a failed autosave');
 }
}
console.log('Content save outcomes PASS: adapter warnings/stale409, route notice lifecycle; actual shared editor queued replay uses latest callback/size/settings, retains manual override and cancels after failure/unmount/context change. Backend/browser persistence remain separate.');
