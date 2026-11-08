import assert from 'node:assert/strict';
import {load} from './collection-import-postgres-handlers.mjs';
export async function verifyCollectionTemplatePublicProjection({repositories,site,store,demo,mocks,request,unpack}){
 let checks=0;
 const sentinel='PRIVATE_COLLECTION_BASELINE_SENTINEL',recordSentinel='PRIVATE_PRODUCT_BASELINE_SENTINEL';
 const fields=[{id:'title',key:'title',label:'Title',type:'text'},{id:'business-version',key:'expectedVersion',label:'Business version',type:'text'}];
 const collectionInput={name:'Public fixture',slug:'collection-public-proof',status:'published',routePattern:'/collection-public-proof/:slug',listRoutePattern:'/collection-public-proof',fields,permissions:{publicRead:true,publicCreate:false},metadata:{frontendTemplateInstance:{sentinel},frontendTemplateHistory:{sentinel},frontendDesignUnknown:{nested:[false,0]},authored:{nested:[false,0]}}};
 const values={title:'Current published title',expectedVersion:'Authored business version',expectedRecord:{unknown:[false,0]},frontendTemplateInstance:{sentinel:recordSentinel},frontendDesignUnknown:{nested:[false,0]},extension:{nested:[false,0]}};
 let collection,record;
 if(demo){store.updateAdminSite(site.id,{isPublished:true,status:'published'});collection=store.createAdminCollection(site.id,collectionInput);record=store.createAdminCollectionRecord(site.id,collection.id,{slug:'entry',status:'published',values});}
 else{await repositories.sites.update(site.id,{isPublished:true});collection=(await repositories.collections.create({siteId:site.id,...collectionInput})).item;record=(await repositories.collections.createRecord({siteId:site.id,collectionId:collection.id,slug:'entry',status:'published',values})).item;}
 const publicMocks={...mocks,'@/lib/backyStore':{...mocks['@/lib/backyStore'],getSiteNavigation:mocks['@/lib/backyStore'].getSiteNavigation||(()=>({primary:[],footer:[]}))},'@/lib/publicContractResponse':{publicContractJson:(body,options)=>mocks['next/server'].NextResponse.json(body,{status:options.status||200})}};
 publicMocks['./backyStore']=publicMocks['@/lib/backyStore'];
 const paths=['../src/app/api/sites/[siteId]/collections/route.ts','../src/app/api/sites/[siteId]/collections/[collectionId]/route.ts','../src/app/api/sites/[siteId]/collections/[collectionId]/records/route.ts','../src/app/api/sites/[siteId]/collections/[collectionId]/records/route.ts','../src/app/api/sites/[siteId]/render/route.ts'];
 const routes=paths.map(path=>load(path,publicMocks));
 for(const [index,suffix]of [[0,'collections'],[1,`collections/${collection.id}`],[2,`collections/${collection.id}/records`],[3,`collections/${collection.id}/records?slug=entry`],[4,'render?path=/collection-public-proof'],[4,'render?path=/collection-public-proof/entry']]){
 const response=await unpack(await routes[index].GET(request(`/api/sites/${site.id}/${suffix}`,'GET'),{params:Promise.resolve({siteId:site.id,collectionId:collection.id,recordId:record.id})}));
 assert.equal(response.status,200,suffix+': '+JSON.stringify(response.body));const serialized=JSON.stringify(response.body);assert(!serialized.includes(sentinel));assert(!serialized.includes(recordSentinel));checks+=3;
 if(index===2||index===3||index===4){assert(serialized.includes('Current published title'));assert(serialized.includes('Authored business version'));assert(serialized.includes('"nested":[false,0]'));checks+=3;}
 }
 const fresh=demo?store.getCollectionByIdOrSlug(site.id,collection.id,{includeUnpublished:true}):await repositories.collections.getById(site.id,collection.id),freshRecord=demo?store.getCollectionRecordByIdOrSlug(site.id,collection.id,record.id,{includeUnpublished:true}):await repositories.collections.getRecordById(site.id,collection.id,record.id);
 assert.equal(fresh.metadata.frontendTemplateInstance.sentinel,sentinel);assert.equal(freshRecord.values.frontendTemplateInstance.sentinel,recordSentinel);checks+=2;
 console.log(`Collection/product public actual ${demo?'demo':'native'} list/detail/records/render projection passed ${checks}; private sentinel absent, current published values/false/zero retained, persisted provenance unchanged.`);return checks;
}
