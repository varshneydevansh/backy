/** Owned Unix-socket PostgreSQL only; no configured target or external transport. */
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/postgres-js';
import { createSiteRepository } from '../src/repositories/site-page-post.ts';
import { withVisitorProfilePostgres } from './visitor-profile-postgres-isolated.mts';
if(process.argv.length>2)throw Error('External database targets are not accepted.');
await withVisitorProfilePostgres(async({client,sites})=>{
 const queries:string[]=[];
 const repository=createSiteRepository(drizzle(client,{logger:{logQuery(query:string){queries.push(query);}}}) as any,'postgres');
 const site=sites[0],other=sites[1],padding='synthetic-review-data-'.repeat(60000);
 await client`UPDATE sites SET settings=settings || ${JSON.stringify({quotaSyntheticPadding:padding})}::jsonb WHERE id=${site.id}`;
 const full=await repository.getById(site.id);assert(full);assert.equal((full.settings as any).quotaSyntheticPadding,padding);assert.match(queries.at(-1)!,/"settings"/);
 const slim=await repository.getPublicationByIdOrSlug!(site.id);assert(slim);assert.deepEqual(Object.keys(slim).sort(),['id','isPublished','slug']);assert.deepEqual(slim,{id:site.id,slug:full.slug,isPublished:full.isPublished});
 const size={fullSiteJsonBytes:Buffer.byteLength(JSON.stringify(full)),publicationJsonBytes:Buffer.byteLength(JSON.stringify(slim))};assert(size.fullSiteJsonBytes>1000000);assert(size.publicationJsonBytes<200);
 assert.equal((await repository.getPublicationByIdOrSlug!(full.slug))!.id,site.id);
 await client`UPDATE sites SET is_published=false WHERE id=${site.id}`;assert.equal((await repository.getPublicationByIdOrSlug!(site.id))!.isPublished,false);
 await client`UPDATE sites SET is_published=true WHERE id=${site.id}`;assert.equal((await repository.getPublicationByIdOrSlug!(site.id))!.isPublished,true);
 assert.equal(await repository.getPublicationByIdOrSlug!('missing-owned-fixture'),null);assert.equal(await repository.getPublicationByIdOrSlug!('00000000-0000-4000-8000-000000000099'),null);
 // ID precedence even when a different row uses that UUID as its slug.
 await client`UPDATE sites SET slug=${site.id} WHERE id=${other.id}`;assert.equal((await repository.getPublicationByIdOrSlug!(site.id))!.id,site.id);
 await client`UPDATE sites SET slug='00000000-0000-4000-8000-000000000098' WHERE id=${other.id}`;assert.equal((await repository.getPublicationByIdOrSlug!('00000000-0000-4000-8000-000000000098'))!.id,other.id);
 const siteSelects=queries.slice(1);assert(siteSelects.length);for(const query of siteSelects){assert.doesNotMatch(query,/"settings"|"theme"|select \*/);assert.match(query,/select "id", "slug", "is_published"/);}
 console.log(JSON.stringify({ok:true,checks:10,...size,allSlimQueriesExcludeSettings:true,configuredTargetUsed:false,externalRequests:0,boundary:'Actual repository and PostgreSQL engine with owned Unix socket and synthetic large settings; logical JSON sizes, not provider wire or billing measurement'}));
});
