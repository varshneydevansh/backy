import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createRequire}from'node:module';import vm from'node:vm';import ts from'typescript';import{NextRequest,NextResponse}from'next/server';
const require=createRequire(import.meta.url);const site={id:'fixture-site',slug:'fixture-slug',name:'Site'},product={id:'product',slug:'product',siteId:site.id,collectionId:'products',status:'published',values:{title:'Product'},createdAt:'2026-01-01',updatedAt:'2026-01-01'};
const orders=Array.from({length:205},(_,i)=>({id:'order-'+i,siteId:site.id,collectionId:'orders',slug:'order-'+i,status:'published',values:{paymentreference:'sub_'+i,items:[{productId:product.id,quantity:1,subscription:{enabled:true}}]},createdAt:'2026-01-01',updatedAt:'2026-01-01'}));
let reads=0,demo=false,deny=false;const repos={sites:{getById:async()=>site},collections:{getBySlug:async(_sid:string,slug:string)=>({id:slug,slug,name:slug}),getRecordById:async()=>product,listRecords:(input:any)=>{reads++;assert.equal(input.siteId,site.id);const limit=Math.min(input.limit||100,100),offset=input.offset||0;return{items:orders.slice(offset,offset+limit),pagination:{total:orders.length,limit,offset,hasMore:offset+limit<orders.length}}}}};
const mocks:any={'next/server':{NextResponse},'@/lib/adminAccess':{requireAdminAccess:async()=>deny?NextResponse.json({success:false},{status:403}):({session:{user:{id:'fixture'}}})},'@/lib/commerceCatalog':{PRODUCT_COLLECTION_SLUG:'products',productRecordToCommerceProduct:(v:any)=>({...v,title:'Product',sku:'fixture',subscription:{enabled:true}})},'@/lib/commentRepositorySupport':{resolveRepositorySite:async()=>site},'@/lib/backyStore':{getAdminSettings:()=>({}),getSiteByIdOrSlug:()=>site,getCollectionByIdOrSlug:(_site:string,slug:string)=>({id:slug,slug,name:slug}),getCollectionRecordByIdOrSlug:()=>product,listCollectionRecords:(_site:string,_collection:string,input:any)=>{const result=readPage({...input,siteId:_site,collectionId:_collection});return{records:result.items,pagination:result.pagination}}},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>demo,getRequiredDatabaseRepositories:async()=>repos}};
function load(relative:string):any{const module={exports:{}as any};const filename=new URL(relative,import.meta.url);vm.runInNewContext(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,process:{env:{}},URL,URLSearchParams,Headers,Date,console,require:(id:string)=>id in mocks?mocks[id]:id.startsWith('@/lib/')?load('../src/lib/'+id.slice('@/lib/'.length)+'.ts'):require(id)});return module.exports;}

const route=load('../src/app/api/admin/sites/[siteId]/commerce/products/[productId]/subscriptions/route.ts');
const originalRead=repos.collections.listRecords;
let readPage=originalRead;
repos.collections.listRecords=async(input:any)=>readPage(input) as any;
let checks=0;
async function get(){return route.GET(new NextRequest('http://fixture.invalid/'),{params:Promise.resolve({siteId:site.slug,productId:product.id})});}
for (const mode of [false,true]) {
 demo=mode;reads=0;readPage=originalRead;
 const response=await get();assert.equal(response.status,200);const body=await response.json();
 assert.match(response.headers.get('cache-control')||'',/no-store/);
 assert.equal(body.data.lifecycle.subscriptions.length,25,'Displayed top25 is separate from complete counts');
 assert.equal(body.data.lifecycle.summary.total,205);assert.equal(reads,3);checks++;
 for(const fault of ['empty-tail','duplicate','foreign-site','foreign-collection','drift','invalid-limit','read-failure']) {
  readPage=(input:any)=>{
   if(fault==='read-failure')throw Error('secret repository diagnostics');
   const result=structuredClone(originalRead(input));
   if(input.offset>0){
    if(fault==='empty-tail')result.items=[];
    if(fault==='duplicate')result.items[0]=orders[0];
    if(fault==='foreign-site')result.items[0].siteId='foreign';
    if(fault==='foreign-collection')result.items[0].collectionId='foreign';
    if(fault==='drift')result.pagination.total++;
    if(fault==='invalid-limit')result.pagination.limit=0;
   }
   return result;
  };
  const rejected=await get();assert.equal(rejected.status,503,fault+' demo='+mode);
  const rejectedBody=await rejected.json();assert.equal(rejectedBody.error.code,'ORDER_INVENTORY_INCOMPLETE');
  assert.equal(JSON.stringify(rejectedBody).includes('secret repository diagnostics'),false);
  assert.match(rejected.headers.get('cache-control')||'',/no-store/);checks++;
 }
 readPage=originalRead;deny=true;reads=0;
 assert.equal((await get()).status,403);assert.equal(reads,0);deny=false;checks++;
}
console.log('Commerce product complete inventory checks passed:'+checks+'; repository/demo adapters205orders, seven failures503, auth before reads. No provider/browser/SQL proof.');
