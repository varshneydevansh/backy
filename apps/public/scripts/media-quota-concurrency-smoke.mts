import { installActualMediaRecovery } from './media-storage-recovery-fixture.mts';
import { mkdtempSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { File } from 'node:buffer';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';

const require = createRequire(import.meta.url);
function load(relative: string, mocks: Record<string, any>, fixtureProcess: any = process) {
  const filename = fileURLToPath(new URL(relative, import.meta.url)), compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, Headers, URL, URLSearchParams, Buffer, File, FormData, process: fixtureProcess, console: { error() {} }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith('@/') ? (() => { throw Error('Missing fixture dependency ' + id); })() : require(id) }, { filename }); return module.exports;
}
const inventoryImport = await import('../src/lib/mediaInventory'); const inventory: any = inventoryImport.default || inventoryImport;
const scope = load('../src/lib/mediaScope.ts', {}), responsive = load('../src/lib/mediaResponsive.ts', {}), organization = load('../src/lib/publicMediaResource.ts', { '@/lib/mediaScope': scope, '@/lib/mediaResponsive': responsive });
const policy = load('../src/lib/mediaUploadPolicy.ts', {}, { ...process, env: {} });
const storageMutation = load('../src/lib/mediaStorageMutation.ts', {});
const site:any={id:'quota-proof',slug:'quota-proof',settings:{},isPublished:true};
const settings={integrations:{storage:{workspaceStorageLimitMb:1,maxFileSizeMb:2}}};
const rows:any[]=[];let scans=0,writes=0;let unblock:()=>void;
const barrier=new Promise<void>(resolve=>{unblock=resolve});
let activeLock=false;
const repositories:any={sites:{getById:async()=>site,getBySlug:async()=>site},settings:{get:async()=>settings},media:{withStorageMutationLock:async(_site:any,run:any)=>{if(activeLock)throw Object.assign(Error('busy'),{code:'MEDIA_STORAGE_MUTATION_BUSY'});activeLock=true;try{return await run();}finally{activeLock=false;}},list:async(p:any)=>({items:rows.slice(),pagination:{total:rows.length,limit:p.limit,offset:p.offset,hasMore:false}}),listFolders:async()=>[],create:async(input:any)=>{const item={...input,id:'asset-'+rows.length,sizeBytes:input.size,metadata:input.metadata,createdAt:new Date().toISOString()};rows.push(item);return{item};}}};
const mocks:any={'@/lib/mediaStorageMutation':storageMutation,'@/lib/backyStore':{},'@/lib/mediaInventory':inventory,'@/lib/mediaScope':scope,'@/lib/publicMediaResource':organization,'@/lib/mediaUploadPolicy':policy,'@/lib/mediaSafety':{MediaSafetyError:class extends Error{},scanMediaUploadWithProviders:async()=>{scans++;if(scans===2)unblock();await barrier;return{status:'clean'};}},'@/lib/mediaStorage':{getMediaStoragePath:({siteId,storedFilename}:any)=>`sites/${siteId}/${storedFilename}`,getMediaStorageAdapter:async()=>({provider:'local',upload:async(buffer:any,input:any)=>{writes++;return{path:input.path,url:'/fixture/'+writes,size:buffer.length};}})},'@/lib/mediaTransformGeneration':{generatedTransformBytes:()=>0},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>repositories},'@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:'synthetic-owner'}}})},'@/lib/adminAudit':{recordAdminAudit:async()=>({})},'@/lib/cacheInvalidation':{recordSiteCacheInvalidation:async()=>({})},'@/lib/siteWebhookDelivery':{deliverSiteWebhooks:async()=>[]}};
const recoveryDirectory=mkdtempSync('/tmp/backy-media-quota-recovery-');
installActualMediaRecovery(mocks,repositories,recoveryDirectory);
try {
const route=load('../src/app/api/admin/sites/[siteId]/media/route.ts',mocks);
async function upload(name:string){const data=new FormData();data.set('file',new File([Buffer.alloc(700000)],name,{type:'application/pdf'}));const response=await route.POST(new NextRequest('http://fixture.invalid/api/admin/sites/quota-proof/media',{method:'POST',body:data}),{params:Promise.resolve({siteId:site.id})});if(response.status===503)unblock();return{status:response.status,body:await response.json()};}
const responses=await Promise.all([upload('first.pdf'),upload('second.pdf')]);
const total=rows.reduce((sum,row)=>sum+row.sizeBytes,0);
console.log(JSON.stringify({evidence:'actual POST handler with deterministic concurrent scanner barrier; repository/storage adapters, not real DB/provider',statuses:responses.map(r=>r.status),storedBytes:total,quotaBytes:1048576,storageWrites:writes},null,2));
assert.equal(responses.filter(r=>r.status===201).length,1);assert.equal(responses.filter(r=>r.status===503&&r.body.error.code==='MEDIA_STORAGE_MUTATION_BUSY').length,1);assert.ok(total<=1048576);
const retry=await upload('retry.pdf');assert.equal(retry.status,413);assert.equal(writes,1);assert.equal(rows.length,1);console.log('One admitted writer, retryable busy503, then definitive quota413; guard route wiring via adapter fixture, not PostgreSQL locking proof.');

const unavailable=await storageMutation.withMediaStorageMutation({} as any,site.id,'safe-request',async()=>assert.fail('Unavailable repository ran a storage operation'));
assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).error.code,'MEDIA_STORAGE_LOCK_UNAVAILABLE');assert.equal(unavailable.headers.get('cache-control'),'no-store');
let releaseDemo:any,enteredDemo:any;const demoEntered=new Promise(r=>enteredDemo=r),demoHold=new Promise(r=>releaseDemo=r);
const demoFirst=storageMutation.withMediaStorageMutation(null,'demo-a','safe-request',async()=>{enteredDemo();await demoHold;return 42;});await demoEntered;
const busyDemo=await storageMutation.withMediaStorageMutation(null,'demo-a','safe-request',async()=>assert.fail('Concurrent demo writer admitted'));assert.equal(busyDemo.status,503);assert.equal(busyDemo.headers.get('retry-after'),'1');
assert.equal(await storageMutation.withMediaStorageMutation(null,'demo-b','safe-request',async()=>7),7);releaseDemo();assert.equal(await demoFirst,42);
await assert.rejects(storageMutation.withMediaStorageMutation(null,'demo-a','safe-request',async()=>{throw Error('fixture provider failure');}),/fixture provider failure/);
assert.equal(await storageMutation.withMediaStorageMutation(null,'demo-a','safe-request',async()=>8),8);
console.log('Actual shared guard: fail-closed missing repository capability, no-store/retry headers, demo site isolation and release after failure PASS. Demo protection is explicitly process-local.');

} finally { rmSync(recoveryDirectory,{recursive:true,force:true}); }
