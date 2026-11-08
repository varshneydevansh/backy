import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {NextRequest,NextResponse} from 'next/server';
const require=createRequire(import.meta.url),core=require('@backy-cms/core');
const site={id:'fixture-site',slug:'fixture-slug',name:'Forms',settings:core.DEFAULT_SITE_SETTINGS};
const forms=Array.from({length:205},(_,i)=>({id:'form-'+i,siteId:site.id,name:'Form '+i,title:'Form '+i,isActive:true,audience:'public',fields:[{key:'consent',type:'checkbox',label:'Consent'}],createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'}));
const submissions=Array.from({length:10005},(_,i)=>({id:'submission-'+i,siteId:site.id,formId:'form-204',status:'pending',values:{consent:true},submittedAt:'2026-10-05T00:00:00Z'}));
const contacts=Array.from({length:10005},(_,i)=>({id:'contact-'+i,siteId:site.id,formId:'form-204',status:'new',sourceValues:{consent:true},createdAt:'2026-10-05T00:00:00Z',updatedAt:'2026-10-05T00:00:00Z'}));
let reads=0,denied=0,fault='',mutations=0,demo=false;
const page=(items:any[],input:any)=>({items:items.slice(input.offset||0,(input.offset||0)+Math.min(input.limit||100,100)),pagination:{total:items.length,limit:Math.min(input.limit||100,100),offset:input.offset||0,hasMore:(input.offset||0)+Math.min(input.limit||100,100)<items.length}});
function inventoryPage(items:any[],input:any) {
 const result=page(items,input);
 if (fault==='read-error') throw Error('private database detail');
 if (input.offset >= 100) {
  if(fault==='empty')result.items=[];
  if(fault==='duplicate')result.items[0]={...items[0]};
  if(fault==='foreign')result.items[0]={...result.items[0],siteId:'foreign-site'};
  if(fault==='drift')result.pagination.total++;
 }
 if(fault==='bad-limit')result.pagination.limit=0;
 return result;
}
const repositories={sites:{getById:async(id:string)=>{reads++;return id===site.id?site:null},getBySlug:async(id:string)=>id===site.slug?site:null,update:async(id:string,input:any)=>{assert.equal(id,site.id);mutations++;return{item:{...site,settings:input.settings}}}},forms:{list:async(input:any)=>{reads++;assert.equal(input.siteId,site.id);return inventoryPage(forms,input)},listSubmissions:async(input:any)=>inventoryPage(submissions,input),listContacts:async(input:any)=>inventoryPage(contacts,input)}};
const mocks:any={'next/server':{NextResponse},'@backy-cms/core':core,'@/lib/adminAccess':{requireAdminAccess:async(_r:any,id:string,input:any)=>{assert.equal(input.permission,'forms.view');return denied?NextResponse.json({success:false,requestId:id,error:{code:'DENIED',message:'Denied'}},{status:denied}):{session:{user:{id:'fixture-owner'}}}}},'@/lib/backyStore':{getSiteByIdOrSlug:(id:string)=>id===site.id||id===site.slug?site:null,listFormsBySite:()=>forms,listFormContacts:(id:string,input:any)=>{const result=inventoryPage(contacts.filter(v=>v.formId===id),input);return{contacts:result.items,pagination:result.pagination};},listFormSubmissions:(id:string,input:any)=>{const result=inventoryPage(submissions.filter(v=>v.formId===id),input);return{data:result.items,pagination:result.pagination};},updateAdminSite:(id:string,input:any)=>{assert.equal(id,site.id);mutations++;return{...site,settings:input.settings};}},'@/lib/adminAudit':{recordAdminAudit:async()=>({})},'@/lib/adminFormFieldPolicy':{},'@/lib/adminFormCollectionTargetPolicy':{},'@/lib/frontendDesignContract':{},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>demo,getRequiredDatabaseRepositories:async()=>repositories}};
const helperModule=await import('../src/lib/formsInventory');
mocks['@/lib/formsInventory']=(helperModule as any).default || helperModule;
function load(file:string){const source=readFileSync(new URL('../src/app/api/admin/sites/[siteId]/forms/'+file+'/route.ts',import.meta.url),'utf8');const module={exports:{} as any};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:(id:string)=>id in mocks?mocks[id]:id.startsWith('@/lib/')?{}:require(id),URL,Date,process,console});return module.exports;}
let checks=0;const failures:string[]=[];
for(const leaf of ['', 'analytics','contact-segments']){const handler=load(leaf);for(const code of [401,403]){denied=code;const before=reads;assert.equal((await handler.GET(new NextRequest('http://fixture.invalid/'+leaf),{params:Promise.resolve({siteId:site.slug})})).status,code);assert.equal(reads,before);checks+=2;}denied=0;
const query=leaf==='contact-segments'?'?formId=form-204':'';const response=await handler.GET(new NextRequest('http://fixture.invalid/'+leaf+query),{params:Promise.resolve({siteId:site.slug})});const result=await response.json();try{assert.equal(response.status,200);if(leaf===''){assert.equal(result.data.forms.length,205);assert.equal(result.data.pagination.hasMore,false);}else if(leaf==='analytics'){assert.equal(result.data.analytics.summary.forms,205);assert.equal(result.data.analytics.summary.submissions,10005);assert.equal(result.data.analytics.leads.summary.contacts,10005);assert(result.data.analytics.forms.some((f:any)=>f.formId==='form-204'));}else{assert.equal(result.data.formId,'form-204');assert.equal(result.data.analytics.summary.contacts,10005);}checks++;}catch(error){failures.push(leaf+': '+String(error));}}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('Forms inventory contract checks passed: '+checks);

for(const leaf of ['', 'analytics','contact-segments']) for(const problem of ['empty','duplicate','foreign','drift','bad-limit','read-error']) {
 fault=problem;const response=await load(leaf).GET(new NextRequest('http://fixture.invalid/'+leaf+(leaf==='contact-segments'?'?formId=form-204':'')),{params:Promise.resolve({siteId:site.slug})});
 assert.equal(response.status,503,leaf+' '+problem);const result=await response.json();assert.equal(result.error.code,'FORMS_INVENTORY_INCOMPLETE');assert.match(response.headers.get('cache-control')||'',/no-store/);assert.ok(!JSON.stringify(result).includes('private database detail'));checks+=4;
}
fault='';console.log('Forms complete inventory and fail-closed checks PASS: '+checks+';205 forms and10005 contacts/submissions, tail form found, bad/foreign/duplicate/drifting inventory503, early authorization. Adapter fixture, no provider/served browser proof.');

(site as any).settings={...core.DEFAULT_SITE_SETTINGS,contacts:{...core.DEFAULT_SITE_SETTINGS.contacts,savedLists:[{id:'tail-list',name:'Tail',filters:{query:'Form 204',formId:'all',status:'all',quality:'all'},createdAt:'2026-10-05T00:00:00Z',updatedAt:'2026-10-05T00:00:00Z'}]}};
const lists=load('contact-lists');
let listResponse=await lists.GET(new NextRequest('http://fixture.invalid/contact-lists'),{params:Promise.resolve({siteId:site.slug})});
assert.equal(listResponse.status,200);assert.equal((await listResponse.json()).data.lists[0].matchedCount,10005);
const listRequest=()=>new NextRequest('http://fixture.invalid/contact-lists',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Complete tail',filters:{query:'Form 204'}})});
mocks['@/lib/adminAccess'].requireAdminAccess=async()=>({session:{user:{id:'fixture-owner'}}});
listResponse=await lists.POST(listRequest(),{params:Promise.resolve({siteId:site.slug})});assert.equal(listResponse.status,201);assert.equal((await listResponse.json()).data.lists.find((v:any)=>v.name==='Complete tail').matchedCount,10005);
for(const problem of ['empty','duplicate','foreign','drift','bad-limit','read-error']) {
 fault=problem;const before=mutations;listResponse=await lists.POST(listRequest(),{params:Promise.resolve({siteId:site.slug})});assert.equal(listResponse.status,503);assert.equal(mutations,before,'Incomplete inventory must deny saved-list writes');assert.match(listResponse.headers.get('cache-control')||'',/no-store/);checks+=3;
}
fault='';console.log('Contact list full-tail matching and precommit fault admission PASS; totalchecks '+checks);

demo=true;
for(const leaf of ['analytics','contact-segments','contact-lists']) {
 const response=await load(leaf).GET(new NextRequest('http://fixture.invalid/'+leaf+(leaf==='contact-segments'?'?formId=form-204':'')),{params:Promise.resolve({siteId:site.slug})});assert.equal(response.status,200);const body=await response.json();
 if(leaf==='analytics'){assert.equal(body.data.analytics.summary.submissions,10005);assert.equal(body.data.analytics.leads.summary.contacts,10005);}else if(leaf==='contact-segments')assert.equal(body.data.analytics.summary.contacts,10005);else assert.equal(body.data.lists[0].matchedCount,10005);
 checks++;
}
fault='foreign';const beforeDemoWrite=mutations;const rejected=await load('contact-lists').POST(listRequest(),{params:Promise.resolve({siteId:site.slug})});assert.equal(rejected.status,503);assert.equal(mutations,beforeDemoWrite);fault='';demo=false;console.log('Actual demo-handler adapter pagination and no-write fault checks PASS; combined '+checks+' checks. Demo persistence and browser workflows are separate.');
