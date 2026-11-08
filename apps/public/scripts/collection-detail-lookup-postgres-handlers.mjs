// Runs only against the owned disposable native PostgreSQL fixture.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {load} from './collection-import-postgres-handlers.mjs';

export async function verifyCollectionDetailLookup({repositories,site,foreignSiteId,sql,mocks,request,unpack}) {
 let checks=0;
 const actual=repositories.collections;
 const collection=(await actual.create({siteId:site.id,name:'Slug lookup fixture',slug:'collection-detail-slug-proof',status:'published',fields:[{id:'title',key:'title',label:'Owner title',type:'text'}],permissions:{publicRead:true,publicCreate:false},metadata:{authored:{retained:[false,0,null]}}})).item;
 await repositories.sites.update(foreignSiteId,{isPublished:true});
 const route=load('../src/app/api/sites/[siteId]/collections/[collectionId]/route.ts',{...mocks,'@/lib/publicContractResponse':{publicContractJson:(body,options)=>mocks['next/server'].NextResponse.json(body,{status:options.status||200})}});
 const detail=async(identifier,siteIdentifier=site.id)=>unpack(await route.GET(request(`/api/sites/${siteIdentifier}/collections/${identifier}`,'GET'),{params:Promise.resolve({siteId:siteIdentifier,collectionId:identifier})}));
 // Record the actual public failure first in the unguarded negative control.
 const slug=await detail(collection.slug);
 assert.equal(slug.status,200,'Native collection slug detail must reach slug fallback instead of UUID SQL/500');checks++;
 for(const siteIdentifier of [site.id,site.slug])for(const identifier of [collection.id,collection.slug]){
  const result=await detail(identifier,siteIdentifier);
  assert.equal(result.status,200);assert.equal(result.body.data.collection.id,collection.id);assert.deepEqual(result.body.data.collection.metadata.authored,{retained:[false,0,null]});checks+=3;
 }
 assert.equal((await actual.getById(site.id,collection.id)).id,collection.id);checks++;
 for(const [siteIdentifier,identifier]of [[site.id,collection.slug],[site.id,'not-a-uuid'],['not-a-site-uuid',collection.id],[site.id,randomUUID()],[foreignSiteId,collection.id]]){
  assert.equal(await actual.getById(siteIdentifier,identifier),null);checks++;
 }
 assert.equal((await actual.getBySlug(site.id,collection.slug)).id,collection.id);assert.equal(await actual.getBySlug(foreignSiteId,collection.slug),null);checks+=2;
 for(const [siteIdentifier,identifier]of [[site.id,'missing-collection-slug'],[site.id,randomUUID()],[foreignSiteId,collection.id],[foreignSiteId,collection.slug]]){
  const result=await detail(identifier,siteIdentifier);
  assert.equal(result.status,404);assert.equal(result.body.error.code,'COLLECTION_NOT_FOUND');assert.equal(result.body.data,undefined);checks+=3;
 }
 const source=await actual.getById(site.id,collection.id);assert.deepEqual(source.metadata.authored,{retained:[false,0,null]});checks++;
 const uuidSlug=randomUUID(),uuidSlugCollection=(await actual.create({siteId:site.id,name:'UUID slug fixture',slug:uuidSlug,status:'published',fields:collection.fields,permissions:collection.permissions,metadata:collection.metadata})).item;
 assert.equal(await actual.getById(site.id,uuidSlug),null);assert.equal((await actual.getBySlug(site.id,uuidSlug)).id,uuidSlugCollection.id);const byUuidSlug=await detail(uuidSlug);assert.equal(byUuidSlug.status,200);assert.equal(byUuidSlug.body.data.collection.id,uuidSlugCollection.id);checks+=4;
 // PostgreSQL UUID syntax also accepts nil and newer UUID versions; admission is syntactic.
 for(const identifier of ['00000000-0000-0000-0000-000000000000','00000000-0000-7000-8000-000000000001']){
  await sql`UPDATE content_collections SET id=${identifier} WHERE id=${uuidSlugCollection.id}`;
  assert.equal((await actual.getById(site.id,identifier)).id,identifier);const result=await detail(identifier);assert.equal(result.status,200);assert.equal(result.body.data.collection.id,identifier);checks+=3;
  await sql`UPDATE content_collections SET id=${uuidSlugCollection.id} WHERE id=${identifier}`;
 }
 console.log(`Collection detail native repository/actual HTTP lookup passed ${checks}: ID and slug, canonical site/alias, malformed/missing identifiers and cross-site 404; authored metadata retained.`);
 return checks;
}
