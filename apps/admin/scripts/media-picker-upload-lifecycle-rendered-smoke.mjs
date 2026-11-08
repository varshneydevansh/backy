import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Open the owned URL with CUA. This mounts the real picker; only its media API is synthetic.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const stylesDirectory = join(repository, 'apps/admin/dist/assets');
const stylesheet = existsSync(stylesDirectory) ? readdirSync(stylesDirectory).find(name => /^index-.*\.css$/.test(name)) : undefined;
const scratch = mkdtempSync(join(tmpdir(), 'backy-picker-upload-lifecycle-'));
let server;
let timer;
try {
  writeFileSync(join(scratch, 'media-api.ts'), `
export const fixture = { calls: [], pending: [], mode: 'hold', blocked: false, assetType:'image', selected: [], closes: 0, listCalls: [], browseScope: false, holdSite: '', listPending: [], selectionContexts: [] };
export const asset = (id, type='image') => ({ id, name:id, type, size:'4 B', sizeBytes:4, visibility:'public', scope:'global', scopeTargetId:null, tags:[], url:'data:image/png;base64,iVBORw0KGgo=', metadata:{} });
export async function listMediaLibrary(options) {
 fixture.listCalls.push({...options});
 if(fixture.browseScope) {
  const rows=Array.from({length:205},(_,n)=>({...asset(options.siteId+'-global-'+n),scope:'global',scopeTargetId:null}));
  rows[0]={...asset(options.siteId+'-current-page'),scope:'page',scopeTargetId:'page-a',targetPageIds:['page-a']};
  rows[1]={...asset(options.siteId+'-other-page'),scope:'page',scopeTargetId:'page-b',targetPageIds:['page-b']};
  rows[2]={...asset(options.siteId+'-other-post'),scope:'post',scopeTargetId:'post-b',targetPostIds:['post-b']};
  rows[3]={...asset(options.siteId+'-linked-global'),scope:'global',scopeTargetId:null,targetPageIds:['page-a']};
  rows[4]={...asset(options.siteId+'-missing-target'),scope:'page',scopeTargetId:null};
  rows[5]={...asset(options.siteId+'-private'),visibility:'private'};
  rows[6]=asset(options.siteId+'-audio','audio');
  if(fixture.holdSite===options.siteId)await new Promise(done=>fixture.listPending.push(done));
  const offset=options.offset||0,limit=options.limit||100;
  return {media:rows.slice(offset,offset+limit),pagination:{total:rows.length,offset,limit,hasMore:offset+limit<rows.length},uploadReadiness:{schemaVersion:'backy.media-upload-readiness.v1',state:'blocked',evidence:'configuration-only',blockingReasons:[{code:'MEDIA_SCANNER_CONFIGURATION_REQUIRED',message:'Synthetic configuration blocker.'}]}};
 }
 return {media:[{...asset(options.siteId+'-existing',fixture.assetType),scope:'page',scopeTargetId:options.siteId==='site-a'?'page-a':'page-b'}],pagination:{hasMore:false},uploadReadiness:{schemaVersion:'backy.media-upload-readiness.v1',state:fixture.blocked?'blocked':'admissible',evidence:'configuration-only',blockingReasons:fixture.blocked?[{code:'MEDIA_SCANNER_CONFIGURATION_REQUIRED',message:'Synthetic configuration blocker.'}]:[]}}; }
export const getDefaultMediaSiteId = () => 'site-a';
export const listMediaFolders = async () => [{id:'synthetic-folder',name:'Synthetic folder',parentId:null,path:'Synthetic folder'}];
export const getPublicMediaFileUrl = id => asset(id).url;
export async function createMediaFolder(name,siteId,input) {fixture.calls.push({operation:'folder',name,siteId,input});await new Promise(done=>fixture.pending.push(done));if(fixture.mode==='folder-error')throw Error('Synthetic late folder rejection');return{id:'created-folder',name,parentId:input.parentId,path:name};}
export async function uploadMedia(file, options) {
 fixture.calls.push({operation:'upload',name:file.name,options});
 if(fixture.mode==='hold') await new Promise(done=>fixture.pending.push(done));
 if(file.name==='fail.png') throw new TypeError('Failed to fetch');
 return {...asset(options.siteId+'-'+file.name),scope:options.scope,scopeTargetId:options.scopeTargetId,...(file.name==='warning.png'?{completionWarnings:['Synthetic saved follow-up']}: {})};
}
export async function replaceMedia(id,file,options) { fixture.calls.push({operation:'replace',name:file.name,options}); await new Promise(done=>fixture.pending.push(done)); if(fixture.mode==='replace-error')throw Error('Synthetic late replacement rejection'); return asset(id); }
export async function updateMedia(id,input,siteId) { fixture.calls.push({operation:'metadata',siteId,input}); await new Promise(done=>fixture.pending.push(done)); if(fixture.mode==='font-error')throw Error('Synthetic late font rejection'); return asset(id,'font'); }
`);
  writeFileSync(join(scratch, 'entry.tsx'), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MediaLibraryModal } from '@/components/editor/MediaLibraryModal';
import { useStore } from '@/stores/mockStore';
import { fixture, asset } from '@/lib/mediaApi';
const root=createRoot(document.getElementById('root'));
let checks=0;
const assert=(value,message)=>{if(!value)throw Error(message);checks++;};
const pause=()=>new Promise(done=>setTimeout(done,30));
const wait=async predicate=>{for(let n=0;n<200;n++){if(predicate())return;await new Promise(done=>setTimeout(done,10));}throw Error('Mounted picker fixture timed out');};
const node=id=>document.querySelector('[data-testid="'+id+'"]');
let props={};
function render(extra={}) { props={isOpen:true,mediaContext:{siteId:'site-a',scope:'page',targetId:'page-a'},allowedTypes:'image',initialTab:'upload',...extra}; flushSync(()=>root.render(<MediaLibraryModal {...props} onClose={()=>{fixture.closes++;render({...props,isOpen:false});}} onSelect={(item,options)=>{fixture.selected.push(item.id);fixture.selectionContexts.push({item,options,context:props.mediaContext});if(location.pathname==='/browse')document.getElementById('result').textContent=JSON.stringify({selectedMediaId:item.id,originalScope:item.scope,originalTarget:item.scopeTargetId,editorContext:props.mediaContext,selectionOptions:options,boundary:'Actual picker callback; synthetic media only'});}}/>)); }
function choose(names,inputId='media-upload-input') {const input=node(inputId);assert(input,'Actual file chooser exists');Object.defineProperty(input,'files',{configurable:true,value:names.map(name=>new File(['safe synthetic bytes'],name,{type:name.endsWith('.woff2')?'font/woff2':name.endsWith('.txt')?'text/plain':'image/png'}))});input.dispatchEvent(new Event('change',{bubbles:true}));}
async function reset(extra={}) {for(const done of fixture.pending.splice(0))done();flushSync(()=>root.render(null));await pause();fixture.calls=[];fixture.mode='hold';fixture.blocked=false;fixture.assetType=extra.allowedTypes==='font'?'font':'image';fixture.selected=[];fixture.selectionContexts=[];fixture.closes=0;useStore.setState({media:[]});render(extra);await wait(()=>useStore.getState().media.length===(fixture.browseScope?205:1));await pause();}
const release=()=>{for(const done of fixture.pending.splice(0))done();};
async function run() {
 try {
  if(__BACKY_PICKER_CASE__==='scope') {
    fixture.browseScope=true;fixture.listCalls=[];
    await reset({initialTab:'library'});
    const has=id=>Boolean(document.querySelector('[data-media-id="'+id+'"]'));
    assert(fixture.listCalls.length===3&&fixture.listCalls.map(call=>call.offset||0).join(',')==='0,100,200','Complete authorized site inventory loads all205 assets');
    assert(fixture.listCalls.every(call=>call.siteId==='site-a'&&!call.pageId&&!call.postId),'Browse query never prefilters by upload page/post');
    assert(node('media-library-scope-page').getAttribute('aria-pressed')==='true','Initial current page filter retained');
    assert(has('site-a-current-page')&&has('site-a-linked-global')&&!has('site-a-other-page')&&!has('site-a-missing-target'),'Exact current page includes global links but not unrelated or missing targets');
    assert(node('media-library-scope-post').disabled,'Opposite current post filter is disabled with guidance');
    node('media-library-scope-all').click();await pause();
    assert(node('media-library-scope-all').textContent.includes('All website files'),'All browsing label states its website boundary');
    assert(has('site-a-other-page')&&has('site-a-other-post')&&has('site-a-global-204'),'All website files contains other-page/post plus tail asset');
    assert(!has('site-a-audio'),'Allowed image type remains enforced across All');
    assert(document.querySelector('[data-media-id="site-a-private"]').disabled,'Private selection remains blocked in public field');
    assert(fixture.listCalls.length===3,'Scope switch uses complete snapshot without narrowing API query');
    node('media-library-tab-upload').click();await pause();
    assert(node('media-upload-input').disabled,'Scanner blocker remains enforced after broad browsing');
    node('media-library-tab-library').click();await pause();
    document.querySelector('[data-media-id="site-a-other-post"]').click();await pause();
    assert(fixture.selected.join(',')==='site-a-other-post'&&fixture.closes===1,'Other post asset inserts once through real selection callback');
    const selected=fixture.selectionContexts[0];
    assert(selected.context.siteId==='site-a'&&selected.context.scope==='page'&&selected.context.targetId==='page-a','Callback belongs to active current page upload context');
    assert(selected.item.id==='site-a-other-post'&&selected.item.scopeTargetId==='post-b'&&selected.item.targetPostIds[0]==='post-b','Reused media identity and original links survive selection unchanged');
    await reset({initialTab:'library',mediaContext:{siteId:'site-a',scope:'post',targetId:'post-b'}});
    assert(has('site-a-other-post')&&!has('site-a-current-page'),'Current post exact filter retains its own asset');
    assert(node('media-library-scope-page').disabled,'Opposite current page filter disabled in post editor');
    await reset({initialTab:'library',mediaContext:{siteId:'site-a',scope:'global'}});
    assert(node('media-library-scope-global').getAttribute('aria-pressed')==='true'&&!has('site-a-other-post'),'Global editor retains exact global default');
    assert(node('media-library-scope-page').disabled&&node('media-library-scope-post').disabled,'No target never enables wildcard page/post scopes');
    fixture.holdSite='site-held';render({initialTab:'library',mediaContext:{siteId:'site-held',scope:'page',targetId:'page-a'}});await wait(()=>fixture.listPending.length===1);
    fixture.holdSite='';render({initialTab:'library',mediaContext:{siteId:'site-b',scope:'page',targetId:'page-b'}});await wait(()=>useStore.getState().media[0]?.id==='site-b-current-page');
    node('media-library-scope-all').click();await pause();
    for(const done of fixture.listPending.splice(0))done();await pause();
    assert(useStore.getState().media.every(item=>item.id.startsWith('site-b-'))&&!has('site-held-other-post'),'Late old site inventory cannot replace current same-site snapshot');
    assert(has('site-b-other-page')&&has('site-b-other-post'),'Current All retains authorized site assets after late response');
    render({...props,canView:false});await pause();
    assert(!document.querySelector('[data-media-id]'),'Permission loss hides all cached scope results');
    assert(fixture.calls.length===0,'Browsing/reuse proof performs no uploads, replacement or metadata writes');
  }
  if(__BACKY_PICKER_CASE__==='all'){
  for(const [label,change] of [
   ['site',()=>render({...props,mediaContext:{siteId:'site-b',scope:'page',targetId:'page-b'}})],
   ['target',()=>render({...props,mediaContext:{siteId:'site-a',scope:'page',targetId:'page-b'}})],
   ['allowed type',()=>render({...props,allowedTypes:'video'})],
   ['scope',()=>render({...props,mediaContext:{siteId:'site-a',scope:'post',targetId:'post-a'}})],
   ['close',()=>render({...props,isOpen:false})],
   ['unmount',()=>flushSync(()=>root.render(null))],
  ]) {
   await reset();choose(['first.png','pending.png']);await wait(()=>fixture.pending.length===1);change();await pause();useStore.setState({media:[asset('current-workspace')]});release();await pause();release();await pause();
   assert(fixture.calls.length===1,label+': pending file must not start after picker context is lost');
   assert(useStore.getState().media.map(item=>item.id).join(',')==='current-workspace',label+': stale completion must not overwrite current inventory');
  }
  await reset();choose(['first.png','pending.png']);choose(['duplicate.png']);await wait(()=>fixture.pending.length===1);assert(fixture.calls.length===1,'Synchronous duplicate chooser events admit only one batch');
  render({...props,canCreate:false});await pause();release();await pause();assert(fixture.calls.length===1,'Permission loss stops pending dispatch');assert(document.querySelector('[data-upload-status="stopped"]'),'Permission loss retains unstarted result');
  await reset();choose(['first.png','pending.png']);await wait(()=>fixture.pending.length===1);fixture.blocked=true;render({...props,canView:false});await pause();render({...props,canView:true});await wait(()=>node('media-upload-configuration-status'));release();await pause();assert(fixture.calls.length===1,'Current configuration blocker stops pending dispatch');assert(document.querySelector('[data-upload-status="stopped"]'),'Configuration blocker retains unstarted result');
  await reset();choose(['first.png','pending.png']);await wait(()=>fixture.pending.length===1);const stop=Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Stop pending uploads');assert(stop,'Actual queue exposes stop pending');stop.click();await pause();release();await pause();assert(fixture.calls.length===1,'Stop pending does not start second file');assert(document.querySelector('[data-upload-status="saved"]'),'Admitted save remains saved');assert(document.querySelector('[data-upload-status="stopped"]'),'Pending file remains not started');assert(node('media-library-modal').dataset.activeTab==='library','Confirmed save returns to Library');assert(node('media-upload-queue'),'Results remain visible in Library');assert(node('media-library-modal').dataset.uploadProgressCompleted==='1','Legacy progress counts admitted completion');
  await reset();choose(['saved.png','fail.png','skip.txt','last.png']);await wait(()=>fixture.pending.length===1);useStore.setState({media:[asset('fresh-arrival')]});fixture.mode='immediate';release();await wait(()=>document.querySelectorAll('[data-upload-status="saved"]').length===2);await pause();assert(fixture.calls.length===3,'Accepted files dispatch once, skipped file does not dispatch');assert(document.querySelector('[data-upload-status="failed"]')?.textContent.includes('fail.png'),'Failed filename is explicit');assert(document.querySelector('[data-upload-status="skipped"]')?.textContent.includes('skip.txt'),'Skipped filename is explicit');assert(node('media-upload-queue').textContent.includes('Check the library before trying again'),'Ambiguous failure gives review-before-retry guidance');assert(useStore.getState().media.some(item=>item.id==='fresh-arrival'),'Completion merges current inventory');assert(fixture.calls.every(call=>call.options.scope==='page'&&call.options.scopeTargetId==='page-a'&&call.options.visibility==='public'&&call.options.folderId===null),'Original site/scope/target/defaults reach each request');assert(fixture.calls[0].options.metadata.imagePresentation.objectFit==='cover','Image insertion metadata is preserved');
  await reset();fixture.mode='immediate';choose(['warning.png']);await wait(()=>node('media-library-error')?.textContent.includes('Synthetic saved follow-up'));assert(document.querySelector('[data-upload-status="saved"]'),'Follow-up warning preserves confirmed saved status');assert(node('media-library-error').textContent.includes('Files were saved'),'Follow-up warning distinguishes saved record from retry');
  await reset({replaceAssetId:'site-a-existing'});choose(['replace.png'],'media-library-replace-input');await wait(()=>fixture.pending.length===1);render({...props,mediaContext:{siteId:'site-b',scope:'page',targetId:'page-b'}});await pause();useStore.setState({media:[asset('replacement-current')]});release();await pause();assert(fixture.selected.length===0,'Detached replacement cannot insert into old target');assert(fixture.closes===0,'Detached replacement cannot close new picker');assert(useStore.getState().media[0].id==='replacement-current','Detached replacement cannot overwrite new inventory');
  await reset({replaceAssetId:'site-a-existing'});choose(['replace.png'],'media-library-replace-input');await wait(()=>fixture.pending.length===1);render({...props,isOpen:false});render({...props,isOpen:true});await pause();fixture.mode='replace-error';release();await pause();assert(!node('media-library-error'),'Late rejected replacement cannot show error after close/reopen');assert(fixture.selected.length===0,'Close/reopen cannot adopt old replacement insertion');
  await reset({replaceAssetId:'site-a-existing'});choose(['replace.png'],'media-library-replace-input');await wait(()=>fixture.pending.length===1);useStore.setState({media:[asset('new-arrival')]});release();await wait(()=>fixture.selected.length===1);assert(fixture.closes===1,'Current replacement selects and closes exactly once');assert(useStore.getState().media.some(item=>item.id==='new-arrival'),'Current replacement merges current inventory');
  await reset({allowedTypes:'font',initialUploadFilter:'font'});node('media-upload-visibility').value='private';node('media-upload-visibility').dispatchEvent(new Event('change',{bubbles:true}));node('media-upload-folder').value='synthetic-folder';node('media-upload-folder').dispatchEvent(new Event('change',{bubbles:true}));await pause();const tagInput=node('media-upload-tags-input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(tagInput,'synthetic-tag');tagInput.dispatchEvent(new Event('input',{bubbles:true}));await pause();tagInput.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter'}));await pause();fixture.mode='immediate';choose(['Synthetic-Regular.woff2']);await wait(()=>fixture.calls.length===1);await pause();const font=fixture.calls[0].options;assert(font.visibility==='private'&&font.folderId==='synthetic-folder','Chosen visibility and folder reach upload');assert(font.fontFamily&&font.fontWeight==='400'&&font.fontStyle==='normal'&&font.fontFallback==='system-ui, sans-serif'&&font.fontDisplay==='swap','Existing font registration options reach upload');assert(font.tags.includes('font')&&font.tags.includes('synthetic-tag'),'Automatic font tag and chosen custom tag are preserved');
  }
  if(__BACKY_PICKER_CASE__==='all'||__BACKY_PICKER_CASE__==='font') {
    for(const [label,change] of [
      ['site',()=>render({...props,mediaContext:{siteId:'site-b',scope:'page',targetId:'page-b'}})],
      ['target',()=>render({...props,mediaContext:{siteId:'site-a',scope:'page',targetId:'page-b'}})],
      ['close',()=>render({...props,isOpen:false})],
      ['unmount',()=>flushSync(()=>root.render(null))],
    ]) {
      await reset({allowedTypes:'font',initialTab:'library'});
      document.querySelector('[data-media-id="site-a-existing"]').click();
      await wait(()=>fixture.pending.length===1);change();await pause();
      useStore.setState({media:[asset('font-current')]});release();await pause();
      assert(fixture.selected.length===0,label+': stale font completion must not insert');
      assert(fixture.closes===0,label+': stale font completion must not close current picker');
      assert(useStore.getState().media[0].id==='font-current',label+': stale font completion must not replace current inventory');
    }
    await reset({allowedTypes:'font',initialTab:'library'});const fontItem=document.querySelector('[data-media-id="site-a-existing"]');fontItem.click();fontItem.click();await wait(()=>fixture.pending.length===1);assert(fixture.calls.length===1,'Duplicate synchronous font selection admits one metadata write');useStore.setState({media:[asset('font-fresh')]});release();await wait(()=>fixture.selected.length===1);assert(fixture.closes===1,'Current font registration inserts and closes once');assert(useStore.getState().media.some(item=>item.id==='font-fresh'),'Current font registration merges current inventory');
    await reset({allowedTypes:'font',initialTab:'library'});document.querySelector('[data-media-id="site-a-existing"]').click();await wait(()=>fixture.pending.length===1);render({...props,mediaContext:{siteId:'site-b',scope:'page',targetId:'page-b'}});await pause();fixture.mode='font-error';release();await pause();assert(!node('media-library-error'),'Late font rejection cannot show error in current picker');
    await reset({allowedTypes:'font',initialTab:'library'});document.querySelector('[data-media-id="site-a-existing"]').click();await wait(()=>fixture.pending.length===1);render({...props,canView:false});await pause();release();await pause();assert(fixture.selected.length===0,'View permission loss suppresses font insertion');
  }
  if(__BACKY_PICKER_CASE__==='all'||__BACKY_PICKER_CASE__==='folder') {
    const startFolder=async()=>{const input=node('media-library-create-folder-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Owned folder');input.dispatchEvent(new Event('input',{bubbles:true}));await pause();node('media-library-create-folder').click();await wait(()=>fixture.pending.length===1);};
    for(const [label,change] of [
      ['site',()=>render({...props,mediaContext:{siteId:'site-b',scope:'page',targetId:'page-b'}})],
      ['target',()=>render({...props,mediaContext:{siteId:'site-a',scope:'page',targetId:'page-b'}})],
      ['close',()=>render({...props,isOpen:false})],
      ['unmount',()=>flushSync(()=>root.render(null))],
    ]) {
      await reset();await startFolder();change();await pause();release();await pause();
      assert(!document.querySelector('option[value="created-folder"]'),label+': stale folder completion must not change current folder list');
      assert(!node('media-library-modal')||node('media-library-modal').dataset.folderFilter!=='created-folder',label+': stale folder completion must not change current filter');
    }
    await reset();await startFolder();release();await wait(()=>node('media-upload-folder').value==='created-folder');assert(node('media-library-modal').dataset.folderFilter==='created-folder','Current folder creation selects new folder');assert(node('media-library-create-folder-name').value==='','Current folder creation clears entered name');
    await reset();await startFolder();render({...props,mediaContext:{siteId:'site-b',scope:'page',targetId:'page-b'}});await pause();fixture.mode='folder-error';release();await pause();assert(!node('media-library-error'),'Late folder rejection cannot show error in new picker');
    await reset();await startFolder();render({...props,canCreate:false});await pause();release();await pause();assert(!document.querySelector('option[value="created-folder"]'),'Create permission loss suppresses folder completion');
  }
  const result={ok:true,checks,boundary:'Real mounted React picker/effects/store/handlers; synthetic media API only. No backend scanner/storage, provider, production or page/blog persistence proof.'}; document.getElementById('result').textContent=JSON.stringify(result);await fetch('/result',{method:'POST',body:JSON.stringify(result)});
 }catch(error){const result={ok:false,checks,error:String(error.message)};document.getElementById('result').textContent=JSON.stringify(result);await fetch('/result',{method:'POST',body:JSON.stringify(result)});}
}
document.getElementById('run').onclick=run;
if(location.pathname==='/browse'){
 document.getElementById('run').hidden=true;fixture.browseScope=true;document.getElementById('browse').hidden=false;document.getElementById('browse').onclick=()=>reset({initialTab:'library'});void reset({initialTab:'library'});
}
if(location.pathname==='/interactive'){
 document.getElementById('run').hidden=true;
 document.getElementById('interactive').hidden=false;
 document.getElementById('start').onclick=async()=>{await reset();choose(['current.png','pending.png']);};
 document.getElementById('settle').onclick=release;
 document.getElementById('finish').onclick=async()=>{const statuses=Array.from(document.querySelectorAll('[data-upload-status]')).map(row=>row.getAttribute('data-upload-status'));const result={ok:statuses.join(',')==='saved,stopped',statuses,boundary:'CUA clicked real Stop pending uploads control; synthetic chooser/media transport; original admitted file confirmed saved.'};document.getElementById('result').textContent=JSON.stringify(result);await fetch('/result',{method:'POST',body:JSON.stringify(result)});};
}

`);
  await build({entryPoints:[join(scratch,'entry.tsx')],outfile:join(scratch,'bundle.js'),bundle:true,format:'esm',platform:'browser',jsx:'automatic',nodePaths:[join(repository,'node_modules')],define:{'process.env.NODE_ENV':'"development"',__BACKY_PICKER_CASE__:JSON.stringify(process.env.BACKY_PICKER_CASE||'all')},plugins:process.env.BACKY_PICKER_BASELINE_SOURCE?[{name:'owned-picker-baseline',setup(build){build.onLoad({filter:/MediaLibraryModal\.tsx$/},args=>({contents:readFileSync(resolve(process.env.BACKY_PICKER_BASELINE_SOURCE),'utf8'),loader:'tsx',resolveDir:dirname(args.path)}));}}]:[],alias:{'@/lib/mediaApi':join(scratch,'media-api.ts'),'@':resolve(repository,'apps/admin/src')}});
  let complete;
  const result=new Promise(done=>{complete=done;});
  server=createServer(async(request,response)=>{
    if(request.url==='/styles.css'&&stylesheet){response.setHeader('content-type','text/css');response.end(readFileSync(join(stylesDirectory,stylesheet)));}
    else if(request.url==='/bundle.js'){response.setHeader('content-type','text/javascript');response.end(readFileSync(join(scratch,'bundle.js')));}
    else if(request.url==='/result'&&request.method==='POST'){const chunks=[];for await(const chunk of request)chunks.push(chunk);response.end('received');complete(JSON.parse(Buffer.concat(chunks).toString()));}
    else{response.setHeader('content-type','text/html');response.end('<!doctype html><meta charset="utf-8"><title>Owned picker upload lifecycle</title><link rel="stylesheet" href="/styles.css"><div style="position:relative;z-index:10001;background:white;padding:8px"><span id="interactive" hidden><button id="start">Start synthetic held batch</button> · <button id="settle">Confirm current upload</button> · <button id="finish">Finish interaction proof</button></span><button id="browse" hidden>Reopen current page picker</button><button id="run">Run mounted picker checks</button><pre id="result">Ready</pre></div><div id="root"></div><script type="module" src="/bundle.js"></script>');}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  console.log(JSON.stringify({ready:true,url:`http://127.0.0.1:${server.address().port}`,boundary:'Open owned local fixture with CUA and press Run mounted picker checks.'}));
  timer=setTimeout(()=>complete({ok:false,error:'Owned fixture was not completed before timeout'}),300000);
  const proof=await result;console.log(JSON.stringify(proof));if(process.env.BACKY_PICKER_PROOF_PATH)writeFileSync(resolve(process.env.BACKY_PICKER_PROOF_PATH),JSON.stringify(proof,null,2)+'\n');assert(proof.ok,proof.error);if(process.env.BACKY_PICKER_KEEP_OPEN==='1'){clearTimeout(timer);await new Promise(done=>{process.once('SIGINT',done);process.once('SIGTERM',done);});}
}finally{clearTimeout(timer);server?.closeAllConnections();await new Promise(done=>server?server.close(done):done());rmSync(scratch,{recursive:true,force:true});}
