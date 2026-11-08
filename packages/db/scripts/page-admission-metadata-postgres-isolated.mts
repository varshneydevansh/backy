/** Owned socket-only database. This runner accepts no configured database target. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { verifyPublicPageAdmissionHandlers } from '../../../apps/public/scripts/public-page-admission-handlers.mjs';
if (process.argv.length > 2) throw Error('No database target accepted');
const require = createRequire(import.meta.url);
const { createPageRepository, createSiteRepository } = require('../src/repositories/site-page-post.ts');
const bin = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const name of ['initdb','pg_ctl','postgres']) assert(existsSync(join(bin,name)));
const root = mkdtempSync('/tmp/backy-page-admission-'), data = join(root,'cluster'), socket = join(root,'socket');
const port=randomInt(20000,60000), clients:pg.Pool[]=[],queries:string[]=[];
const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')&&!['DATABASE_URL','BACKY_DATABASE_URL'].includes(key)));
const run=(name:string,args:string[])=>execFileSync(join(bin,name),args,{env:environment,encoding:'utf8',stdio:'pipe',timeout:30000});
const pool=(user:string)=>{const value=new pg.Pool({host:socket,port,user,database:'postgres',ssl:false,max:1});clients.push(value);return value;};
const site='00000000-0000-4000-8000-000000000001',foreign='00000000-0000-4000-8000-000000000002';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let checks=0;
try {
 mkdirSync(socket);run('initdb',['-D',data,'-A','trust','-U','admission_fixture','--no-locale','--encoding=UTF8']);
 run('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-o',`-k ${socket} -p ${port} -c listen_addresses='' -c fsync=off`,'-w','start']);
 const owner=pool('admission_fixture');
 await owner.query('create table sites (id uuid primary key, slug text, is_published boolean, settings jsonb, theme jsonb)');
 await owner.query('create table pages (id uuid primary key,site_id uuid,slug text,status text,scheduled_at timestamptz,parent_id uuid,is_homepage boolean,updated_at timestamptz,content jsonb,meta jsonb,title text,description text)');
 const heavy='PRIVATE_OWNER_STATE_'.repeat(160000);
 const settings={frontendDesign:{heavy},navigation:{heavy},localization:{defaultLocale:'en',localeStrategy:'none',locales:[{code:'en',default:true,private:heavy}]},redirectRules:[]};
 await owner.query('insert into sites values ($1,$2,true,$3,$4)',[site,'site-slug',JSON.stringify(settings),JSON.stringify({heavy})]);
 await owner.query('insert into sites values ($1,$2,true,\'{}\',\'{}\')',[foreign,site]);
 async function insert(n:number,slug:string,status='published',parent:string|null=null,home=false,scheduled:string|null=null,siteId=site){
  await owner.query('insert into pages values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$10)',[id(n),siteId,slug,status,scheduled,parent,home,'2026-01-01T00:00:00Z',JSON.stringify({heavy}),heavy]);
 }
 await insert(1,'writing');await insert(2,'parent','draft');await insert(3,'child','published',id(2));
 await insert(4,'missing-child','published',id(999));await insert(5,'later','scheduled',null,false,'2999-01-01T00:00:00Z');
 await insert(6,'due','scheduled',null,false,'2001-01-01T00:00:00Z');await insert(7,'front','draft',null,true);
 await insert(8,'index');await insert(9,'foreign','published',null,false,null,foreign);
 await insert(10,'loop-a','published',id(11));await insert(11,'loop-b','published',id(10));
 await insert(12,'parent/child');
 // Enough rows to require true SQL pagination on Home discovery.
 for(let n=20;n<126;n++) await owner.query('insert into pages (id,site_id,slug,status,is_homepage,updated_at) values ($1,$2,$3,\'draft\',false,now())',[id(n),site,`draft-${n}`]);
 await owner.query('create role admission_reader login');
 await owner.query('grant select (id,slug,is_published,settings) on sites to admission_reader');
 await owner.query('grant select (id,site_id,slug,status,scheduled_at,parent_id,is_homepage,updated_at) on pages to admission_reader');
 const reader=pool('admission_reader');
 for(const [table,column] of [['sites','theme'],['pages','content'],['pages','meta'],['pages','title'],['pages','description']]){await assert.rejects(()=>reader.query(`select ${column} from ${table}`),(error:any)=>error.code==='42501');checks++;}
 const db=drizzle(reader,{logger:{logQuery(query:string){queries.push(query);}}}),sites=createSiteRepository(db),pages=createPageRepository(db);
 const routeSite=await sites.getRouteMetadataByIdOrSlug(site);
 assert.equal(routeSite.id,site);assert.equal(routeSite.slug,'site-slug');assert(!JSON.stringify(routeSite).includes('PRIVATE'));checks+=3;
 const one=await pages.getRouteMetadataBySlug(site,'writing');assert.equal(one.id,id(1));assert(!JSON.stringify(one).includes('PRIVATE'));assert(!('meta' in one)&&!('content' in one)&&!('title' in one));checks+=3;
 assert.equal(await pages.getRouteMetadataById(site,id(9)),null);checks++;
 const window=await pages.listRouteMetadata({siteId:site,includeUnpublished:true,status:'all',limit:2,offset:2});assert.equal(window.items.length,2);assert(window.pagination.total>100);checks+=2;
 await assert.rejects(()=>pages.listRouteMetadata({siteId:site,status:'published'}));checks++;
 const before=queries.length;await assert.rejects(()=>createSiteRepository(db,'sqlite').getRouteMetadataByIdOrSlug(site));assert.equal(queries.length,before);checks++;
 const api=await verifyPublicPageAdmissionHandlers({repositories:{sites,pages},owner,siteId:site,pageId:id(1),id,queries});
 for(const q of queries){assert(!/"content"|"meta"|"theme"|"title"|"description"|select\s+\*/i.test(q));checks++;if(q.includes('from "pages"')){assert(q.includes('"site_id"'));checks++;if(!q.includes('count(*)')){assert(q.includes('limit '));checks++;}}}
 assert(queries.some(q=>q.includes('offset ')));checks++;
 console.log(JSON.stringify({passed:true,checks,api,queryCount:queries.length,siteRoutingBytes:Buffer.byteLength(JSON.stringify(routeSite)),sourceHeavyCharacters:heavy.length,bodyTitleMetaThemeColumnsDenied:true,actualPostgres:true,hostedRequests:0,boundary:'Local SQL result sizes, not provider transfer measurements.'}));
} finally {
 await Promise.allSettled(clients.map(client=>client.end()));
 if(existsSync(join(data,'postmaster.pid')))run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
 assert(/^\/tmp\/backy-page-admission-[A-Za-z0-9]+$/.test(root));rmSync(root,{recursive:true,force:true});
}
