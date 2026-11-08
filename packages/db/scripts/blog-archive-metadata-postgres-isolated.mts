/** Owned socket-only cluster. Never reads a configured database target. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { verifyPublicBlogArchiveHandlers } from '../../../apps/public/scripts/public-blog-archive-handlers.mjs';

if (process.argv.length > 2) throw Error('This test accepts no database target.');
const require = createRequire(import.meta.url);
const { createPostRepository, createSiteRepository } = require('../src/repositories/site-page-post.ts');
const { createBlogTaxonomyRepository } = require('../src/repositories/blog-taxonomy.ts');
const bin = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const name of ['initdb', 'pg_ctl', 'postgres']) assert(existsSync(join(bin, name)));
const root = mkdtempSync('/tmp/backy-blog-archive-'), data = join(root, 'cluster'), socket = join(root, 'socket');
const port = randomInt(20000, 60000), clients: pg.Pool[] = [], queries: string[] = [];
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !['DATABASE_URL', 'BACKY_DATABASE_URL'].includes(key)));
const run = (name: string, args: string[]) => execFileSync(join(bin, name), args, { env: environment, encoding: 'utf8', stdio: 'pipe', timeout: 30000 });
const pool = (user: string) => {
  const value = new pg.Pool({ host: socket, port, user, database: 'postgres', ssl: false, max: 1 });
  clients.push(value); return value;
};
const site = '00000000-0000-4000-8000-000000000001', foreign = '00000000-0000-4000-8000-000000000002';
const category = '20000000-0000-4000-8000-000000000001', tag = '30000000-0000-4000-8000-000000000001';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let checks = 0, bytes = 0;
try {
  mkdirSync(socket);
  run('initdb', ['-D', data, '-A', 'trust', '-U', 'archive_fixture', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-k ${socket} -p ${port} -c listen_addresses='' -c fsync=off`, '-w', 'start']);
  const owner = pool('archive_fixture');
  await owner.query('create table sites (id uuid primary key, slug text, is_published boolean, settings jsonb, theme jsonb)');
  await owner.query('create table blog_posts (id uuid primary key, site_id uuid, title text, slug text, excerpt text, status text, scheduled_at timestamptz, published_at timestamptz, updated_at timestamptz, meta jsonb, content jsonb)');
  for (const table of ['blog_categories', 'blog_tags']) await owner.query(`create table ${table} (id uuid primary key, site_id uuid, name text, slug text, description text)`);
  const heavy = 'PRIVATE_OWNER_'.repeat(160000);
  await owner.query('insert into sites values ($1,$2,true,$3,$3)', [site, 'site-slug', JSON.stringify({ owner: heavy })]);
  await owner.query('insert into blog_categories values ($1,$2,$3,$4,$5)', [category, site, 'Notes', 'notes', heavy]);
  await owner.query('insert into blog_tags values ($1,$2,$3,$4,$5)', [tag, site, 'C++', 'cpp', heavy]);
  for (let n=1;n<=18;n++) {
    const status=n===14||n===15?'scheduled':n===16?'draft':n===17?'archived':'published';
    const meta={categoryIds:n%2?[category]:[],tagIds:n%3?[tag]:[],originalPublishedAt:'2024-09-02',...(n===13?{privateOwnerState:heavy}:{})};
    await owner.query('insert into blog_posts values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [id(n),n===18?foreign:site,n===7?'Literal 100%_ completion':`Stored title ${n}`,`entry-${n}`,'Short excerpt',status,n===14?'2001-01-01T00:00:00Z':n===15?'2999-01-01T00:00:00Z':null,n===14?null:'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',JSON.stringify(meta),JSON.stringify({body:n===13?heavy:'Small fixture body'})]);
  }
  await owner.query('create role archive_reader login');
  await owner.query('grant select (id,slug,is_published) on sites to archive_reader');
  await owner.query('grant select (id,site_id,title,slug,excerpt,status,scheduled_at,published_at,updated_at,meta) on blog_posts to archive_reader');
  for (const table of ['blog_categories','blog_tags']) await owner.query(`grant select (id,site_id,name,slug) on ${table} to archive_reader`);
  const reader=pool('archive_reader'), db=drizzle(reader,{logger:{logQuery(query:string){queries.push(query);}}});
  for (const [table,column] of [['sites','settings'],['sites','theme'],['blog_posts','content'],['blog_categories','description'],['blog_tags','description']]) {
    await assert.rejects(()=>reader.query(`select ${column} from ${table}`),(error:any)=>error.code==='42501');checks++;
  }
  const sites=createSiteRepository(db),posts=createPostRepository(db),taxonomy=createBlogTaxonomyRepository(db);
  assert.deepEqual(await sites.getPublicationByIdOrSlug('site-slug'),{id:site,slug:'site-slug',isPublished:true});checks++;
  const terms=await taxonomy.listArchiveTerms(site);assert.equal(terms.categories[0].id,category);assert.equal(terms.tags[0].id,tag);assert.deepEqual(Object.keys(terms.tags[0]).sort(),['id','name','siteId','slug']);checks+=3;
  const input={siteId:site,asOf:'2026-10-21T00:00:00Z',limit:2,offset:0};
  const first=await posts.listPublicArchiveMetadata(input);assert.equal(first.pagination.total,14);assert.equal(first.pagination.hasMore,true);assert.deepEqual(first.items.map((r:any)=>r.id),[id(14),id(13)]);assert.equal(first.items[0].publishedAt,null);assert.equal(first.items[1].meta.originalPublishedAt,'2024-09-02');checks+=5;
  bytes=Buffer.byteLength(JSON.stringify(first));assert(bytes<3000);assert(!JSON.stringify(first).includes('PRIVATE_OWNER'));assert(first.items.every((r:any)=>!('content' in r)&&!('authorId' in r)));checks+=3;
  const next=await posts.listPublicArchiveMetadata({...input,offset:2});assert.deepEqual(next.items.map((r:any)=>r.id),[id(12),id(11)]);checks++;
  const empty=await posts.listPublicArchiveMetadata({...input,offset:20});assert.equal(empty.items.length,0);assert.equal(empty.pagination.total,14);assert.equal(empty.pagination.hasMore,false);checks+=3;
  const filtered=await posts.listPublicArchiveMetadata({...input,categoryId:category,tagId:tag,limit:100});assert.equal(filtered.pagination.total,5);assert(filtered.items.every((r:any)=>r.categoryIds.includes(category)&&r.tagIds.includes(tag)));checks+=2;
  const literal=await posts.listPublicArchiveMetadata({...input,search:'100%_'});assert.equal(literal.pagination.total,1);assert.equal(literal.items[0].id,id(7));checks+=2;
  assert.equal((await posts.listPublicArchiveMetadata({...input,asOf:'2000-01-01T00:00:00Z'})).pagination.total,13);checks++;
  await owner.query('update blog_posts set status=\'draft\' where id=$1',[id(13)]);assert.equal((await posts.listPublicArchiveMetadata(input)).pagination.total,13);checks++;
  const before=queries.length;await assert.rejects(()=>createPostRepository(db,'sqlite').listPublicArchiveMetadata(input));assert.equal(queries.length,before);checks++;
  for(const q of queries){assert(!/"content"|"settings"|"theme"|"description"|select\s+\*/i.test(q));checks++;if(/from "blog_posts"/.test(q)){assert(/where .*"site_id"/i.test(q));checks++;if(!/count\(\*\)/i.test(q)){assert(/limit /i.test(q));checks++;}}}
  assert(queries.some(q=>/offset /i.test(q)));checks++;
  await owner.query('update blog_posts set status=\'published\' where id=$1',[id(13)]);
  const api=await verifyPublicBlogArchiveHandlers({repositories:{sites,posts,blogTaxonomy:taxonomy},owner,siteId:site,categoryId:category,tagId:tag,queries});
  console.log(JSON.stringify({passed:true,api,checks,queries:queries.length,projectedTwoPostPageBytes:bytes,heavyOwnerAndBodyCharacters:heavy.length*2,bodyAndDescriptionColumnsDenied:true,actualPostgres:true,hostedRequests:0,boundary:'Actual source repository, SQL pagination/projections and local PostgreSQL. JSON result size is not a cloud billing measurement.'}));
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
  assert(/^\/tmp\/backy-blog-archive-[A-Za-z0-9]+$/.test(root));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  rmSync(root, { recursive: true, force: true });
}
