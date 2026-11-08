#!/usr/bin/env node
// Always creates its own socket-only cluster. Never reads a configured database URL.
import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../dist/schema/index.js';
import { createDatabaseRepositories } from '../dist/repositories/index.js';
import {prepareSiteBackupDraft,SITE_BACKUP_TABLES,SiteBackupError} from '@backy-cms/core';

if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-site-backup-postgres-');
const data = join(clusterRoot, 'cluster'), socket = join(clusterRoot, 'socket'), log = join(clusterRoot, 'postgres.log');
const port = randomInt(20000, 60000), username = 'backy_fixture', clients = [];
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !['DATABASE_URL', 'BACKY_DATABASE_URL'].includes(key)));
// Postgres.js also reads PG* defaults directly. Clear them inside this test process only.
for (const key of Object.keys(process.env)) if (key.startsWith('PG') || ['DATABASE_URL', 'BACKY_DATABASE_URL'].includes(key)) delete process.env[key];
let cleanupPromise;
function run(binary, args, label) {
 try { return execFileSync(join(binaryDirectory, binary), args, { env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 8 * 1024 * 1024 }); }
 catch (error) { throw new Error(`${label}: ${String(error.stderr || error.message).trim().split('\n').slice(-3).join(' ')}`); }
}
function cleanup() {
 return cleanupPromise ||= (async () => {
  await Promise.allSettled(clients.map(client => client.end({ timeout: 2 })));
  // The only directory we may stop/remove was created by this invocation.
  assert(/^\/tmp\/backy-site-backup-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], 'Stopping owned temporary cluster');
  assert(!existsSync(join(data, 'postmaster.pid')), 'Owned cluster still running; its directory was retained');
  rmSync(clusterRoot, { recursive: true, force: true });
 })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
const connection = (name) => {
 const client = postgres({ host: socket, port, username, database: 'postgres', max: 5, connect_timeout: 5, connection: { application_name: name }, onnotice() {} });
 clients.push(client); return client;
};
const bundle = client => createDatabaseRepositories({ adapter: { type: 'postgres', db: drizzle(client, { schema }), isConnected: async () => true, close: async () => {} } });
try {
 run('initdb', ['-D', data, '--username', username, '--encoding', 'UTF8', '--no-locale', '--auth-local', 'trust', '--auth-host', 'reject'], 'Initializing owned temporary cluster');
 mkdirSync(socket, { mode: 0o700 });
 writeFileSync(join(data, 'postgresql.auto.conf'), `listen_addresses = ''\nunix_socket_directories = '${socket}'\nport = ${port}\nmax_connections = 20\n`);
 run('pg_ctl', ['-D', data, '-l', log, '-w', '-t', '15', 'start'], 'Starting owned socket-only cluster');
 const psql = ['-X', '--no-password', '-h', socket, '-p', String(port), '-U', username, '-d', 'postgres', '--set', 'ON_ERROR_STOP=1'];
 run('psql', [...psql, '-c', `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;`], 'Bootstrapping isolated Supabase role/auth fixtures');
 const migrations = readdirSync(join(repositoryRoot, 'supabase/migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort();
 for (const migration of migrations) run('psql', [...psql, '-f', join(repositoryRoot, 'supabase/migrations', migration)], `Applying actual ${migration}`);
 assert(migrations.includes('015_template_revision_history.sql'));
 assert(migrations.includes('016_explicit_operator_profile_provisioning.sql'));


 const sqlA=connection('backup-writer-a'),sqlB=connection('backup-writer-b'),owner=connection('backup-owner'),monitor=connection('backup-monitor'),a=bundle(sqlA),b=bundle(sqlB);
 const team=(await a.teams.create({name:'Disposable recovery team',slug:'backup-team',ownerId:null})).item,site=(await a.sites.create({teamId:team.id,name:'Backup source',slug:'backup-source',status:'published'})).item,other=(await a.sites.create({teamId:team.id,name:'Other source',slug:'backup-other',status:'draft'})).item;
 assert(migrations.includes('020_site_backup_restore_jobs.sql'));
 await owner`INSERT INTO pages(site_id,title,slug,content,status) SELECT ${site.id},'Page '||n,'page-'||n,'{"elements":[{"id":"kept-element","unknown":{"nested":[1,2,3],"password":"authored-private"}}]}'::jsonb,'published' FROM generate_series(1,103) n`;
 const page=(await owner`SELECT id FROM pages WHERE site_id=${site.id} ORDER BY slug LIMIT 1`)[0].id,post=randomUUID(),collection=randomUUID(),record=randomUUID(),form=randomUUID(),submission=randomUUID(),member=randomUUID(),media=randomUUID();
 await owner`INSERT INTO blog_posts(id,site_id,title,slug,content,status) VALUES(${post},${site.id},'Post','post','[{"type":"paragraph","unknown":{"retained":true},"children":[{"text":"Article"}]}]'::jsonb,'published')`;
 await owner`INSERT INTO blog_categories(site_id,name,slug) VALUES(${site.id},'Category','category')`;await owner`INSERT INTO blog_tags(site_id,name,slug) VALUES(${site.id},'Tag','tag')`;
 await owner`INSERT INTO media(id,site_id,filename,original_name,mime_type,size_bytes,url,metadata) VALUES(${media},${site.id},'linked.png','linked.png','image/png',10,'https://external.example.invalid/linked.png','{"opaque":{"kept":true}}')`;
 await owner`INSERT INTO media_folders(site_id,name) VALUES(${site.id},'Folder')`;await owner`INSERT INTO media_versions(site_id,media_id,filename,original_name,mime_type,size_bytes,url) VALUES(${site.id},${media},'linked-old.png','linked-old.png','image/png',10,'https://external.example.invalid/linked-old.png')`;
 await owner`INSERT INTO content_collections(id,site_id,name,slug,status) VALUES(${collection},${site.id},'Products','products','published')`;await owner`INSERT INTO content_collection_records(id,site_id,collection_id,slug,status,values) VALUES(${record},${site.id},${collection},'product','published','{"private":"retained","nested":[{"extra":true}]}'::jsonb)`;
 await owner`INSERT INTO site_visitors(id,site_id,provider_issuer,provider_subject,email,display_name) VALUES(${member},${site.id},'provider-fixture','subject-fixture','visitor@example.invalid','Visitor name')`;
 await owner`INSERT INTO form_definitions(id,site_id,page_id,post_id,name,notification_email) VALUES(${form},${site.id},${page},${post},'Contact','destination@example.invalid')`;
 await owner`INSERT INTO form_submissions(id,site_id,form_id,visitor_member_id,values) VALUES(${submission},${site.id},${form},${member},'{"email":"private@example.invalid","unknown":{"kept":true}}')`;
 await owner`INSERT INTO form_contacts(site_id,form_id,source_submission_id,email,source_values) VALUES(${site.id},${form},${submission},'private@example.invalid','{"private":"contact"}')`;
 await owner`INSERT INTO reusable_sections(site_id,name,slug,content) VALUES(${site.id},'Header','header','{"elements":[{"id":"kept-header","unknown":{"retained":true}}]}')`;
 await owner`INSERT INTO interactive_components(site_id,component_key,display_name,version,status,review_status,runtime,dependency_metadata) VALUES(${site.id},'custom.proof','Proof','1','active','approved','{"sandboxUrl":"https://old.example.invalid"}','{"source":"retained source"}')`;
 await owner`INSERT INTO content_revisions(site_id,target_type,target_id,snapshot) VALUES(${site.id},'page',${page},'{"content":{"opaque":{"retained":true}}}')`;
 await owner`INSERT INTO template_revisions(site_id,template_id,fingerprint,snapshot,source,operation) VALUES(${site.id},'header',${'a'.repeat(64)},'{"id":"header","content":{"opaque":{"kept":true}}}','fixture','save')`;
 await owner`INSERT INTO comments(site_id,target_type,target_id,content,author_name,visitor_member_id) VALUES(${site.id},'page',${page},'Retained comment','Visitor name',${member})`;
 await owner`INSERT INTO comment_blocklist(id,site_id,type,value,reason) VALUES(${randomUUID()},${site.id},'email','blocked@example.invalid','retained moderation reason')`;
 await owner`INSERT INTO pages(site_id,title,slug) VALUES(${other.id},'Foreign','foreign')`;
 for(let i=0;i<101;i++)await owner`INSERT INTO media_folders(site_id,name) VALUES(${site.id},${'Folder '+i})`;
 const repository=a.siteBackups!,otherRepository=b.siteBackups!;let checks=0;
 let graph=await repository.snapshot(site.id,async graph=>graph);assert.equal(graph.tables.pages.length,103);assert.equal(Object.keys(graph.tables).length,SITE_BACKUP_TABLES.length);assert.equal(graph.tables.siteVisitors.length,1);assert.equal(graph.tables.comments.length,1);assert.equal(graph.tables.formContacts[0].email,'private@example.invalid');assert(!Object.values(graph.tables).flat().some(row=>row.siteId!==site.id));checks+=6;
 let release!:(value?:unknown)=>void,entered!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve),held=repository.snapshot(site.id,async snapshot=>{entered();await new Promise(resolve=>release=resolve);return snapshot;});await ready;
 const late=sqlB`INSERT INTO pages(site_id,title,slug) VALUES(${site.id},'Late page','late-page')`;
 const latePromise=Promise.resolve(late);await waitForBlocked('backup-writer-b');release();assert.equal((await held).tables.pages.length,103);await latePromise;graph=await repository.snapshot(site.id,async graph=>graph);assert.equal(graph.tables.pages.length,104);checks+=2;
 await owner`UPDATE pages SET parent_id=${graph.tables.pages[103].id} WHERE id=${graph.tables.pages[0].id}`;await owner`UPDATE media_folders SET parent_id=${graph.tables.mediaFolders[101].id} WHERE id=${graph.tables.mediaFolders[0].id}`;graph=await repository.snapshot(site.id,async graph=>graph);
 function draft(slug:string){const map=new Map<string,string>([[site.id,randomUUID()]]);for(const name of SITE_BACKUP_TABLES)for(const row of graph.tables[name])map.set(String(row.id),randomUUID());return prepareSiteBackupDraft(graph,map,{name:'Recovered',slug,teamId:team.id,actorId:null});}
 async function job(next:any){return repository.createJob({sourceSiteId:site.id,targetSiteId:next.site.id,files:[],storageIdentity:'b'.repeat(64)});}
 let next=draft('rollback-draft'),pending=await job(next);const broken=structuredClone(next);delete broken.tables.commentBlocklist[0].value;
 await assert.rejects(()=>repository.commit(pending.id,site.id,broken),(error:any)=>(error.cause?.code||error.code)==='23502');assert.equal((await owner`SELECT count(*)::int n FROM sites WHERE id=${next.site.id}`)[0].n,0);assert.equal((await repository.getJob(site.id,pending.id))!.state,'pending');assert.equal((await owner`SELECT count(*)::int n FROM pages WHERE site_id=${site.id}`)[0].n,104);checks+=4;
 await repository.commit(pending.id,site.id,next);const reopened=await otherRepository.snapshot(String(next.site.id),async graph=>graph);assert.equal(reopened.tables.pages.length,104);assert.equal(reopened.tables.pages.find(row=>row.id===next.tables.pages[0].id)!.parentId,next.tables.pages[0].parentId);checks++;assert.equal(reopened.tables.mediaFolders.find(row=>row.id===next.tables.mediaFolders[0].id)!.parentId,next.tables.mediaFolders[0].parentId);checks++;assert.equal(reopened.site.isPublished,false);assert.equal(reopened.tables.pages[0].status,'draft');assert.equal(reopened.tables.formDefinitions[0].isActive,false);assert.equal(reopened.tables.formDefinitions[0].notificationEmail,null);assert.equal(reopened.tables.siteVisitors[0].status,'removed');assert.equal(reopened.tables.siteVisitors[0].providerIssuer,'backy:archived-attribution');assert.equal(reopened.tables.interactiveComponents[0].reviewStatus,'draft');assert.deepEqual(reopened.tables.pages[0].content,next.tables.pages[0].content);assert.equal((await repository.getJob(site.id,pending.id))!.state,'committed');assert.equal(await repository.getJob(other.id,pending.id),null);checks+=11;
 const one=draft('same-reviewed-slug'),two=draft('same-reviewed-slug'),j1=await job(one),j2=await job(two);const outcomes=await Promise.allSettled([repository.commit(j1.id,site.id,one),otherRepository.commit(j2.id,site.id,two)]);assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal((await owner`SELECT count(*)::int n FROM sites WHERE slug='same-reviewed-slug'`)[0].n,1);checks+=2;
 const fileJob=await repository.createJob({sourceSiteId:site.id,targetSiteId:randomUUID(),storageIdentity:'b'.repeat(64),files:[{namespace:'media',path:`sites/${site.id}/proof.txt`,filename:'proof.txt',mimeType:'text/plain',bytes:1,sha256:'c'.repeat(64),writeState:'planned'}]});
 await assert.rejects(()=>otherRepository.recordFileState(other.id,fileJob.id,0,'writing'));assert.equal((await repository.getJob(site.id,fileJob.id))!.files[0].writeState,'planned');await assert.rejects(()=>repository.recordFileState(site.id,fileJob.id,0,'stored'));checks+=3;
 await repository.recordFileState(site.id,fileJob.id,0,'writing');assert.equal((await otherRepository.getJob(site.id,fileJob.id))!.files[0].writeState,'writing');await otherRepository.recordFileState(site.id,fileJob.id,0,'stored');assert.equal((await repository.getJob(site.id,fileJob.id))!.files[0].writeState,'stored');await assert.rejects(()=>repository.recordFileState(site.id,fileJob.id,0,'writing'));checks+=3;
 await repository.settle(site.id,fileJob.id,0);await repository.pruneSettled(other.id);assert((await repository.getJob(site.id,fileJob.id)));await repository.pruneSettled(site.id);assert.equal(await otherRepository.getJob(site.id,fileJob.id),null);checks+=2;
 const lockReady=new Promise<void>(resolve=>entered=resolve),locking=repository.withJobLock(site.id,pending.id,async()=>{entered();await new Promise(resolve=>release=resolve);});await lockReady;await assert.rejects(()=>otherRepository.withJobLock(site.id,pending.id,async()=>{}),(error:any)=>error.code==='SITE_BACKUP_BUSY');release();await locking;checks++;
 await assert.rejects(()=>owner`DELETE FROM sites WHERE id=${site.id}`,(error:any)=>error.code==='23503');checks++;
 await assert.rejects(()=>owner.begin(async tx=>{await tx`SET LOCAL ROLE anon`;await tx`SELECT * FROM site_backup_restore_jobs`;}),(error:any)=>error.code==='42501');checks++;
 console.log(`PASS ${checks} actual PostgreSQL whole-site snapshot/phantom lock/late rollback/new-ID reopen/scoped-job/RLS/concurrency checks; owned socket-only cluster, all20 migrations. No providers.`);
 async function waitForBlocked(name:string){for(let attempt=0;attempt<100;attempt++){const rows=await monitor`SELECT wait_event_type FROM pg_stat_activity WHERE application_name=${name} AND wait_event_type='Lock'`;if(rows.length)return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Expected independent writer to wait on table admission');}
}finally{await cleanup();}
