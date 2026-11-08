/** Owned socket-only cluster. Never reads a configured database target. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
import {verifyEditorCanvasSources} from '../../../apps/public/scripts/editor-canvas-sources-handlers.mjs';
import { drizzle } from 'drizzle-orm/node-postgres';

if (process.argv.length > 2) throw Error('This test accepts no database target.');
const require = createRequire(import.meta.url);
const { createPageRepository, createSiteRepository } = require('../src/repositories/site-page-post.ts');
const bin = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const name of ['initdb', 'pg_ctl', 'postgres']) assert(existsSync(join(bin, name)));
const root = mkdtempSync('/tmp/backy-canvas-sources-'), data = join(root, 'cluster'), socket = join(root, 'socket');
const port = randomInt(20000, 60000), clients: pg.Pool[] = [], queries: string[] = [];
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !['DATABASE_URL', 'BACKY_DATABASE_URL'].includes(key)));
const run = (name: string, args: string[]) => execFileSync(join(bin, name), args, { env: environment, encoding: 'utf8', stdio: 'pipe', timeout: 30000 });
const pool = (user: string) => {
  const value = new pg.Pool({ host: socket, port, user, database: 'postgres', ssl: false, max: 1 });
  clients.push(value); return value;
};
const site='00000000-0000-4000-8000-000000000001',foreign='00000000-0000-4000-8000-000000000002';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let checks=0;
try {
 mkdirSync(socket);run('initdb',['-D',data,'-A','trust','-U','sources_fixture','--no-locale','--encoding=UTF8']);
 run('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-o',`-k ${socket} -p ${port} -c listen_addresses='' -c fsync=off`,'-w','start']);
 const owner=pool('sources_fixture');
 await owner.query('create table sites (id uuid primary key,slug text,team_id uuid,settings jsonb,theme jsonb)');
 await owner.query('create table pages (id uuid primary key,site_id uuid,title text,slug text,status text,updated_at timestamptz,meta jsonb,content jsonb,description text)');
 const privateOwner='PRIVATE_OWNER_'.repeat(160000);
 await owner.query('insert into sites values ($1,$2,$1,$3,$3),($4,$1,$4,$3,$3)',[site,'site-slug',JSON.stringify({privateOwner}),foreign]);
 for(let n=1;n<=123;n++)await owner.query('insert into pages values ($1,$2,$3,$4,$5,now(),$6,$6,$7)',[id(n),n===123?foreign:site,n===1?'Literal 100%_ source':`Private source ${n}`,`source-${n}`,n===121?'archived':n%3===0?'scheduled':n%2===0?'published':'draft',JSON.stringify({privateOwner:n===1?privateOwner:'other'}),'PRIVATE_DESCRIPTION']);
 await owner.query('create role sources_reader login');await owner.query('grant select(id,slug,team_id) on sites to sources_reader');await owner.query('grant select(id,site_id,title,slug,status,updated_at) on pages to sources_reader');
 const reader=pool('sources_reader');
 for(const[table,column]of [['sites','settings'],['sites','theme'],['pages','content'],['pages','meta'],['pages','description']]){await assert.rejects(()=>reader.query(`select ${column} from ${table}`),(error:any)=>error.code==='42501');checks++;}
 const db=drizzle(reader,{logger:{logQuery(query:string){queries.push(query);}}}),sites=createSiteRepository(db),pages=createPageRepository(db);
 assert.equal((await sites.getAccessScopeByIdOrSlug(site)).id,site);checks++;
 const first=await pages.listCanvasSourceMetadata({siteId:site,limit:50,offset:0});assert.equal(first.items.length,50);assert.equal(first.pagination.total,121);assert.equal(first.pagination.hasMore,true);assert(first.items.every((p:any)=>p.status!=='archived'&&p.siteId===site));checks+=4;
 const second=await pages.listCanvasSourceMetadata({siteId:site,limit:50,offset:50});assert.equal(second.items.length,50);assert(!second.items.some((row:any)=>first.items.some((other:any)=>other.id===row.id)));checks+=2;
 const found=await pages.listCanvasSourceMetadata({siteId:site,search:'100%_'});assert.equal(found.items.length,1);assert.equal(found.items[0].id,id(1));assert.equal(found.items[0].status,'draft');assert.equal(Object.keys(found.items[0]).length,5);checks+=4;
 assert.equal((await pages.listCanvasSourceMetadata({siteId:site,offset:999})).items.length,0);checks++;
 const before=queries.length;await assert.rejects(()=>createPageRepository(db,'sqlite').listCanvasSourceMetadata({siteId:site}));assert.equal(queries.length,before);checks++;
 const api=await verifyEditorCanvasSources({repositories:{sites,pages},owner,siteId:site,pageId:id(1),queries});
 for(const q of queries){assert(!/"content"|"meta"|"description"|"settings"|"theme"|select\s+\*/i.test(q));checks++;if(q.includes('from "pages"')){assert(q.includes('"site_id"')&&q.includes('"status"'));checks++;if(!q.includes('count(*)')){assert(q.includes('limit '));checks++;}}}
 console.log(JSON.stringify({passed:true,checks,api,queryCount:queries.length,firstMetadataWindowBytes:Buffer.byteLength(JSON.stringify(first)),privateOwnerCharacters:privateOwner.length,ownerColumnsDenied:true,actualPostgres:true,hostedRequests:0,boundary:'Local result sizes, not provider billing measurements.'}));
} finally {
 await Promise.allSettled(clients.map(client=>client.end()));
 assert(/^\/tmp\/backy-canvas-sources-[A-Za-z0-9]+$/.test(root));
 if(existsSync(join(data,'postmaster.pid')))run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
 rmSync(root,{recursive:true,force:true});
}
