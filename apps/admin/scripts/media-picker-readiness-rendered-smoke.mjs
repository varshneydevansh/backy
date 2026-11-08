import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const scratch = mkdtempSync(join(tmpdir(), 'backy-picker-readiness-'));
let server;
let timer;
try {
  writeFileSync(join(scratch, 'media-api.ts'), `
export const fixture = { calls: [], mutations: 0, selected: 0, mode: 'blocked', release: undefined, held: false };
export const asset = { id: 'existing-image', name: 'Existing image', type: 'image', size: '70 B', sizeBytes: 70, visibility: 'public', scope: 'global', scopeTargetId: null, tags: [], url: 'data:image/png;base64,iVBORw0KGgo=', metadata: {} };
const blocked = { schemaVersion:'backy.media-upload-readiness.v1',state:'blocked',evidence:'configuration-only',blockingReasons:[{code:'MEDIA_SCANNER_CONFIGURATION_REQUIRED',message:'Uploads unavailable. Ask a site owner to configure upload scanning. Existing media remains available.'}] };
export async function listMediaLibrary(options) {
 fixture.calls.push({ siteId: options.siteId, offset: options.offset || 0 });
 const mode = fixture.mode;
 if (mode === 'held') { fixture.held = true; await new Promise(done => { fixture.release = done; }); }
 const readiness = mode === 'owner-static' ? {...blocked,state:'admissible',blockingReasons:[],scanPolicy:{mode:'owner-static',malwareScanned:false}} : mode === 'admissible' ? {...blocked,state:'admissible',blockingReasons:[]} : blocked;
 return {media: options.offset ? [] : [asset], pagination:{total:1,offset:options.offset || 0,limit:100,hasMore:!options.offset && mode === 'blocked'}, ...(options.offset || mode === 'unknown' ? {} : { uploadReadiness: readiness })};
}
export const getDefaultMediaSiteId = () => 'site-a';
export const listMediaFolders = async () => [];
export const getPublicMediaFileUrl = () => asset.url;
export const createMediaFolder = async () => { throw Error('Unexpected folder write'); };
export const uploadMedia = async () => { fixture.mutations++; throw Error('Unexpected binary upload'); };
export const replaceMedia = async () => { fixture.mutations++; throw Error('Unexpected binary replacement'); };
export const updateMedia = async () => { throw Error('Unexpected metadata write'); };
`);
  writeFileSync(join(scratch, 'entry.tsx'), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MediaLibraryModal } from '@/components/editor/MediaLibraryModal';
import { useStore } from '@/stores/mockStore';
import { fixture } from '@/lib/mediaApi';
const root = createRoot(document.getElementById('root'));
let checks = 0;
const assert = (value, message) => { if (!value) throw Error(message); checks++; };
const wait = async predicate => { for(let n=0;n<200;n++){ if(predicate())return; await new Promise(done=>setTimeout(done,10)); } throw Error('Rendered fixture timed out'); };
const node = id => document.querySelector('[data-testid="'+id+'"]');
function render(siteId='site-a', tab='upload', canCreate=true) { flushSync(()=>root.render(<MediaLibraryModal isOpen onClose={()=>{}} onSelect={()=>{fixture.selected++;}} mediaContext={{siteId,scope:'global'}} allowedTypes="image" initialTab={tab} canCreate={canCreate} replaceAssetId="existing-image" showCanvasInsertionControls={false}/>)); }
function attemptChange(input) { Object.defineProperty(input, 'files', {configurable:true,value:[new File(['harmless'], 'owned.png', {type:'image/png'})]}); input.dispatchEvent(new Event('change',{bubbles:true})); }
(async()=>{
 try {
  useStore.setState({media:[]}); render();
  await wait(()=>node('media-upload-configuration-status') && !node('media-library-modal')?.getAttribute('data-loading'));
  assert(fixture.calls.some(call=>call.offset===100), 'Actual picker paginated the library');
  assert(node('media-upload-input').disabled, 'Configured blocker disables actual chooser');
  assert(node('media-library-replace-input').disabled, 'Configured blocker disables actual replacement chooser');
  assert(node('media-upload-configuration-status').getAttribute('role')==='status', 'Configuration reason is accessible');
  assert(!node('media-upload-scan-policy-notice'), 'Blocked readiness does not claim owner upload admission');
  assert(node('media-library-action-status').textContent.includes('Upload unavailable'), 'Existing action status describes blocked upload');
  const transfer = new DataTransfer(); transfer.items.add(new File(['harmless'],'owned.png',{type:'image/png'}));
  node('media-upload-dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  attemptChange(node('media-upload-input')); attemptChange(node('media-library-replace-input'));
  await new Promise(done=>setTimeout(done,20)); assert(fixture.mutations===0, 'Chooser/drop/replacement guards prevent API binary mutation calls');
  const libraryTab = node('media-library-tab-library');
  assert(libraryTab && !libraryTab.disabled, 'Library remains available'); libraryTab.click();
  await wait(()=>document.querySelector('[data-media-id="existing-image"]'));
  const item = document.querySelector('[data-media-id="existing-image"]');
  assert(!item.disabled, 'Existing image remains selectable'); item.click();
  await wait(()=>fixture.selected===1); assert(fixture.selected===1, 'Existing image selection callback runs');
  fixture.mode='owner-static'; render('site-owner');
  await wait(()=>node('media-upload-scan-policy-notice'));
  node('media-library-tab-upload')?.click(); await wait(()=>node('media-upload-input'));
  assert(node('media-upload-scan-policy-notice').textContent.includes('Owner uploads use basic file checks. Antivirus scanning is not enabled. Visitor file uploads remain unavailable without a scanner.'), 'Owner policy notice explains both owner checks and visitor scanner requirements');
  assert(node('media-upload-scan-policy-notice').getAttribute('role')==='status', 'Owner policy notice is accessible');
  assert(!node('media-upload-input').disabled && !node('media-library-replace-input').disabled, 'Admitted owner policy enables actual upload and replacement choosers');
  render('site-owner', 'upload', false);
  assert(node('media-upload-input').disabled && node('media-library-replace-input').disabled, 'Owner policy must not override create permission');
  attemptChange(node('media-upload-input')); attemptChange(node('media-library-replace-input'));
  await new Promise(done=>setTimeout(done,20)); assert(fixture.mutations===0, 'Admission must preserve handler permission guards');
  fixture.mode='admissible'; render('site-scanned');
  await wait(()=>fixture.calls.some(call=>call.siteId==='site-scanned') && !node('media-upload-scan-policy-notice'));
  assert(!node('media-upload-scan-policy-notice'), 'Admission without owner policy removes the antivirus-disabled notice');
  fixture.mode='unknown'; render('site-b');
  await wait(()=>fixture.calls.some(call=>call.siteId==='site-b') && !node('media-upload-configuration-status'));
  node('media-library-tab-upload')?.click();
  await wait(()=>node('media-upload-input')); assert(!node('media-upload-input').disabled, 'Missing metadata keeps compatible upload admission without claiming provider health');
  assert(!node('media-upload-scan-policy-notice'), 'Owner policy notice cannot carry over to a site with unknown readiness');
  fixture.mode='held'; render('site-held'); await wait(()=>fixture.held);
  fixture.mode='unknown'; render('site-current'); await wait(()=>fixture.calls.some(call=>call.siteId==='site-current'));
  await new Promise(done=>setTimeout(done,20)); fixture.release(); await new Promise(done=>setTimeout(done,20));
  assert(!node('media-upload-configuration-status'), 'Late blocked response from old site cannot apply to current site');
  assert(!node('media-upload-input').disabled, 'Old site blocker does not disable current site chooser');
  assert(!document.body.textContent.includes('Provider verified'), 'UI does not claim provider verification');
  const result={ok:true,checks,boundary:'Actual React DOM picker/effects/controls/handlers with fixture media API responses. No auth, backend scanner, provider or styling proof.'};
  document.getElementById('result').textContent=JSON.stringify(result); await fetch('/result',{method:'POST',body:JSON.stringify(result)});
 } catch(error) { const result={ok:false,checks,error:String(error.message)}; document.getElementById('result').textContent=JSON.stringify(result); await fetch('/result',{method:'POST',body:JSON.stringify(result)}); }
})();
`);
  buildSync({ entryPoints: [join(scratch, 'entry.tsx')], outfile: join(scratch, 'bundle.js'), bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', nodePaths: [join(repository, 'node_modules')], define: { 'process.env.NODE_ENV': '"development"' }, alias: { '@/lib/mediaApi': join(scratch, 'media-api.ts'), '@': resolve(repository, 'apps/admin/src') } });
  let complete;
  const result = new Promise(done => { complete = done; });
  server = createServer(async (request, response) => {
    if (request.url === '/bundle.js') { response.setHeader('content-type','text/javascript'); response.end(readFileSync(join(scratch,'bundle.js'))); }
    else if (request.url === '/result' && request.method === 'POST') { const chunks=[]; for await(const chunk of request) chunks.push(chunk); const value=JSON.parse(Buffer.concat(chunks).toString()); response.end('received'); complete(value); }
    else { response.setHeader('content-type','text/html'); response.end('<!doctype html><meta charset="utf-8"><title>Owned media readiness smoke</title><pre id="result">Running actual picker readiness checks…</pre><div id="root"></div><script type="module" src="/bundle.js"></script>'); }
  });
  await new Promise(done => server.listen(0,'127.0.0.1',done));
  console.log(JSON.stringify({ready:true,url:`http://127.0.0.1:${server.address().port}`,boundary:'Open owned URL to execute actual React DOM test; synthetic media API only.'}));
  timer=setTimeout(()=>complete({ok:false,error:'Owned browser smoke was not opened before timeout'}),300000);
  const proof=await result; console.log(JSON.stringify(proof)); assert(proof.ok, proof.error);
} finally { clearTimeout(timer); await new Promise(done => server ? server.close(done) : done()); rmSync(scratch,{recursive:true,force:true}); }
