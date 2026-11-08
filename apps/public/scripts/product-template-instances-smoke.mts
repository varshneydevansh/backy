import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertTemplateInstanceContract } from './template-instances-contract.mts';
import { verifyProductTemplateInstances } from './product-template-instances-postgres-handlers.mjs';
const cwd=process.cwd(),scratch=mkdtempSync(join(tmpdir(),'backy-product-template-handlers-'));process.chdir(scratch);
try {
 const imported:any=await import('../src/lib/backyStore.ts'),store=imported.default||imported;
 for(const demo of [true,false]) {
  const site=store.createAdminSite({name:'Product fixture',slug:'product-fixture-'+demo});
  const collections:any={
   create:async(input:any)=>({item:store.createAdminCollection(input.siteId,input)}),getById:async(s:string,id:string)=>store.getCollectionByIdOrSlug(s,id,{includeUnpublished:true}),getBySlug:async(s:string,slug:string)=>store.getCollectionByIdOrSlug(s,slug,{includeUnpublished:true}),
   createRecord:async(input:any)=>({item:store.createAdminCollectionRecord(input.siteId,input.collectionId,input)}),updateRecord:async(s:string,c:string,id:string,input:any)=>({item:store.updateAdminCollectionRecord(s,c,id,input)}),getRecordById:async(s:string,c:string,id:string)=>store.getCollectionRecordByIdOrSlug(s,c,id,{includeUnpublished:true}),
   listRecords:async(input:any)=>{const r=store.listCollectionRecords(input.siteId,input.collectionId,input);return{items:r.records,pagination:r.pagination};},listProductDesignRevisions:async(...args:any[])=>store.listProductDesignRevisions(...args),getProductDesignRevision:async(...args:any[])=>store.getProductDesignRevision(...args),
   withRecordWriteLock:async(s:string,c:string,operation:any)=>operation(collections,await collections.getById(s,c),{media:{list:async()=>({items:[],pagination:{}}),update:async()=>({})}}),
  };
  const repos:any={collections,sites:{getById:async(id:string)=>store.getSiteByIdOrSlug(id),getBySlug:async(id:string)=>store.getSiteByIdOrSlug(id)},templateRevisions:{commitDesign:async(input:any)=>store.commitDemoFrontendDesign(input),list:async(input:any)=>store.listTemplateRevisions(input.siteId,input.templateId,input),get:async(s:string,t:string,id:string)=>store.getTemplateRevision(s,t,id)||store.getTemplateRevision(s,t,"template_revision_"+id)}};
  await verifyProductTemplateInstances({repositories:repos,competing:repos,site,store,demo,assertContract:assertTemplateInstanceContract});
 }
}finally{process.chdir(cwd);rmSync(scratch,{recursive:true,force:true});}

// Genuine central selected-site/module/role authorization; synthetic sessions and persistence only.
const assert=(await import('node:assert/strict')).default;
const {NextRequest}=await import('next/server');
const {fixture,networkCalls}=await import('./admin-access-test-fixtures.mts');
const {load}=await import('./collection-import-postgres-handlers.mjs');
const f=fixture({demo:false,actorRole:'admin'});
f.mocks['@/lib/admin-auth/sessionCookie'].getAdminSessionTokenFromRequest=(r:any)=>r.headers.get('x-backy-admin-session');
f.mocks['@/lib/admin-auth/sessionStore'].getAdminSessionWithPersistence=async(token:string)=>token?{token,user:f.actor}:null;
const grants=['sites.view','collections.view','commerce.view','collections.edit','commerce.edit'];
f.settings().auth.userSiteGrants=[{userId:f.actor.id,scope:{version:1,revision:1,mode:'selected-sites',grants:[{siteId:f.site.id,permissions:grants}],expiresAt:null}}];
const pm:any=load('../src/lib/templateInstanceProvenance.ts',{}),template:any={id:'product-auth',type:'product',version:1,content:{values:{design:{elements:[]}}}};
const revision:any={id:'11111111-1111-4111-8111-111111111111',siteId:f.site.id,templateId:template.id,snapshot:template,fingerprint:pm.templateInstanceFingerprint(template)};
f.site.settings={frontendDesign:{templates:[template]}} as any;
let inventories=0,writes=0;
f.repositories.collections={getBySlug:async()=>{inventories++;return null;},updateRecord:async()=>{writes++;}} as any;
const mocks:any={...f.mocks,'@/lib/templateHistory':{getRetainedTemplateRevision:async()=>revision}};
for(const [key,value] of Object.entries({...mocks}))if(key.startsWith('@/lib/'))mocks['./'+key.slice('@/lib/'.length)]=value;
const route:any=load('../src/app/api/admin/sites/[siteId]/templates/[templateId]/instances/route.ts',mocks);
async function authCall(siteId:string,action='review',auth=true,reviewVersion?:string){const response=await route.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${siteId}/templates/${template.id}/instances`,{method:'POST',headers:{'content-type':'application/json',...(auth?{'x-backy-admin-session':'synthetic-session'}:{})},body:JSON.stringify({targetType:'product',action,targetRevisionId:revision.id,selection:[],...(reviewVersion?{reviewVersion}:{})})}),{params:Promise.resolve({siteId,templateId:template.id})});return{status:response.status,body:await response.json()};}
assert.equal((await authCall(f.site.id,'review',false)).status,401);assert.equal((await authCall(f.otherSite.id)).status,403);assert.equal(inventories,0);
grants.splice(grants.indexOf('commerce.view'),1);assert.equal((await authCall(f.site.id)).status,403);assert.equal(inventories,0);grants.push('commerce.view');
const allowed=await authCall(f.site.id);assert.equal(allowed.status,200);assert.equal(allowed.body.data.scanned.products,0);
grants.splice(grants.indexOf('commerce.edit'),1);assert.equal((await authCall(f.site.id,'apply',true,allowed.body.data.reviewVersion)).status,403);grants.push('commerce.edit');
f.actor.role='viewer';assert.equal((await authCall(f.site.id,'apply',true,allowed.body.data.reviewVersion)).status,403);assert.equal(writes,0);assert.equal(networkCalls,0);
console.log('Product exact-route central auth passed11 checks: no page grants, both commerce/collection grants required, selected-site denial before inventory, viewer cannot edit, zero providers/writes.');
