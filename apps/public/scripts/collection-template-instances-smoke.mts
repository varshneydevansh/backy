import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyCollectionTemplateInstances} from './collection-template-instances-postgres-handlers.mjs';
import {assertTemplateInstanceContract} from './template-instances-contract.mts';
import {assertCollectionDesignContract} from './collection-template-contract-validation.mts';
const cwd=process.cwd(),scratch=mkdtempSync(join(tmpdir(),'backy-collection-template-handlers-'));process.chdir(scratch);
try{
 const imported:any=await import('../src/lib/backyStore.ts'),store=imported.default||imported,site=store.createAdminSite({name:'Collection template fixture',slug:'collection-template-fixture'});
 const collections:any={getById:async(siteId:string,id:string)=>store.getCollectionByIdOrSlug(siteId,id,{includeUnpublished:true}),update:async(siteId:string,id:string,input:any)=>({item:store.updateAdminCollection(siteId,id,input)}),listCollectionDesignRevisions:async(...args:any[])=>store.listCollectionDesignRevisions(...args)};
 await verifyCollectionTemplateInstances({repositories:{collections,sites:{getById:async(id:string)=>store.getSiteByIdOrSlug(id)}},site,store,demo:true,assertContract:assertTemplateInstanceContract,assertDesignContract:assertCollectionDesignContract});
}finally{process.chdir(cwd);rmSync(scratch,{recursive:true,force:true});}

// Actual central authorization with synthetic selected-site operator sessions.
const assert=(await import('node:assert/strict')).default,{NextRequest}=await import('next/server'),{fixture,networkCalls}=await import('./admin-access-test-fixtures.mts'),{load}=await import('./collection-import-postgres-handlers.mjs');
const f=fixture({demo:false,actorRole:'admin'});
f.mocks['@/lib/admin-auth/sessionCookie'].getAdminSessionTokenFromRequest=(request:any)=>request.headers.get('x-backy-admin-session');
f.mocks['@/lib/admin-auth/sessionStore'].getAdminSessionWithPersistence=async(token:string)=>token?{token,user:f.actor}:null;
const grants=['sites.view','collections.view','collections.edit'];
f.settings().auth.userSiteGrants=[{userId:f.actor.id,scope:{version:1,revision:1,mode:'selected-sites',grants:[{siteId:f.site.id,permissions:grants}],expiresAt:null}}];
const pin:any=load('../src/lib/templateInstanceProvenance.ts',{}),design:any=load('../src/lib/frontendDesignContract.ts',{}),template={id:'collection-auth',name:'Auth collection',type:'collection',version:1,content:{fields:[{id:'title-field',key:'title',label:'Title',type:'text'}]}},contract=design.normalizeFrontendDesignContract({templates:[template]});
const baseline=design.buildFrontendCollectionTemplateBaseline(contract,template),instance=pin.pinTemplateInstance(template,baseline,'collection');
const revision={id:'11111111-1111-4111-8111-111111111111',siteId:f.site.id,templateId:template.id,snapshot:template,fingerprint:pin.templateInstanceFingerprint(template)};
f.site.settings={frontendDesign:contract} as any;
let inventories=0,writes=0;const collection:any={id:'22222222-2222-4222-8222-222222222222',siteId:f.site.id,name:'Auth collection',slug:'entries',status:'draft',fields:template.content.fields,permissions:{publicRead:true,publicCreate:false},metadata:{frontendTemplateInstance:instance}};
f.repositories.collections={list:async()=>{inventories++;return{items:[collection],pagination:{total:1,offset:0,limit:100,hasMore:false}};},getById:async()=>collection,listCollectionDesignRevisions:async()=>[],update:async()=>{writes++;}} as any;
const mocks:any={...f.mocks,'@/lib/templateHistory':{getRetainedTemplateRevision:async()=>revision}};for(const[key,value]of Object.entries({...mocks}))if(key.startsWith('@/lib/'))mocks['./'+key.slice('@/lib/'.length)]=value;
const route:any=load('../src/app/api/admin/sites/[siteId]/templates/[templateId]/instances/route.ts',mocks),historyRoute:any=load('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/design-versions/route.ts',mocks),restoreRoute:any=load('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/design-versions/[revisionId]/restore/route.ts',mocks);
async function authCall(siteId:string,action='review',auth=true,reviewVersion?:string){const response=await route.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${siteId}/templates/${template.id}/instances`,{method:'POST',headers:{'content-type':'application/json',...(auth?{'x-backy-admin-session':'synthetic-session'}:{})},body:JSON.stringify({targetType:'collection',action,targetRevisionId:revision.id,selection:[{type:'collection',id:collection.id}],...(reviewVersion?{reviewVersion}:{})})}),{params:Promise.resolve({siteId,templateId:template.id})});return{status:response.status,body:await response.json()};}
assert.equal((await authCall(f.site.id,'review',false)).status,401);assert.equal((await authCall(f.otherSite.id)).status,403);assert.equal(inventories,0);
grants.splice(grants.indexOf('collections.view'),1);assert.equal((await authCall(f.site.id)).status,403);assert.equal(inventories,0);grants.push('collections.view');
const allowed=await authCall(f.site.id);assert.equal(allowed.status,200,JSON.stringify(allowed.body));assert.equal(allowed.body.data.scanned.collections,1);
grants.splice(grants.indexOf('collections.edit'),1);assert.equal((await authCall(f.site.id,'apply',true,allowed.body.data.reviewVersion)).status,403);grants.push('collections.edit');
collection.slug='products';assert.equal((await authCall(f.site.id)).status,403);grants.push('commerce.view');const commerce=await authCall(f.site.id);assert.equal(commerce.status,200);assert.equal((await authCall(f.site.id,'apply',true,commerce.body.data.reviewVersion)).status,403);grants.push('commerce.configure');assert.equal((await authCall(f.site.id,'apply',true,commerce.body.data.reviewVersion)).status,503); // no guarded capability: never falls back to an unguarded write
const historyRequest=()=>new NextRequest(`http://fixture.invalid/api/admin/sites/${f.site.id}/collections/${collection.id}/design-versions`,{headers:{'x-backy-admin-session':'synthetic-session'}});
grants.splice(grants.indexOf('commerce.view'),1);assert.equal((await historyRoute.GET(historyRequest(),{params:Promise.resolve({siteId:f.site.id,collectionId:collection.id})})).status,403);grants.push('commerce.view');assert.equal((await historyRoute.GET(historyRequest(),{params:Promise.resolve({siteId:f.site.id,collectionId:collection.id})})).status,200);
grants.splice(grants.indexOf('commerce.configure'),1);const restoreRequest=new NextRequest(`http://fixture.invalid/api/admin/sites/${f.site.id}/collections/${collection.id}/design-versions/${revision.id}/restore`,{method:'POST',headers:{'content-type':'application/json','x-backy-admin-session':'synthetic-session'},body:JSON.stringify({expectedVersion:commerce.body.data.targets[0].contentFingerprint?'collection-v1:'+'0'.repeat(64):''})});assert.equal((await restoreRoute.POST(restoreRequest,{params:Promise.resolve({siteId:f.site.id,collectionId:collection.id,revisionId:revision.id})})).status,403);
f.actor.role='viewer';assert.equal((await authCall(f.site.id,'apply',true,commerce.body.data.reviewVersion)).status,403);assert.equal(writes,0);assert.equal(networkCalls,0);
console.log('Collection exact-route central authorization passed18 checks: selected-site/view/edit and products commerce.view/configure; no provider/write.');
