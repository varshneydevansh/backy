#!/usr/bin/env node
// Always creates its own socket-only cluster. Never reads a configured database URL.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadMediaFixture} from '../../../apps/public/scripts/media-storage-recovery-fixture.mts';
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

if(process.argv.slice(2).some(value=>value!=='--expect-known-backup-race'))throw Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-site-duplication-postgres-');
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
  assert(/^\/tmp\/backy-site-duplication-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
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



 const sqlA=connection('duplicate-writer-a'),sqlB=connection('duplicate-writer-b'),owner=connection('duplicate-owner'),monitor=connection('duplicate-monitor'),a=bundle(sqlA),b=bundle(sqlB);
 const team=(await a.teams.create({name:'Disposable duplication team',slug:'duplication-team',ownerId:null})).item,site=(await a.sites.create({teamId:team.id,name:'Source',slug:'source',status:'published'})).item;
 const ids=Array.from({length:103},()=>randomUUID()).sort();
 for(let i=0;i<ids.length;i++)await owner`INSERT INTO pages(id,site_id,title,slug,content,meta,status,parent_id) VALUES(${ids[i]},${site.id},${'Page '+i},${'page-'+i},'{"elements":[{"id":"kept","props":{"formId":"authored-reference","extra":{"nested":[1,2]}}}],"canvas":{"futureGeometry":"kept"}}'::jsonb,${owner.json({parentPageId:null,opaque:{retained:true}})},'published',null)`;
 await owner`UPDATE pages SET parent_id=${ids[102]},meta=${owner.json({parentPageId:ids[102],opaque:{retained:true}})} WHERE id=${ids[0]}`;
 await owner`UPDATE sites SET settings=${owner.json({...site.settings,authoredExtension:{kept:true},navigation:{primary:[{pageId:ids[0],unknown:{kept:true},children:[{pageId:ids[102]}]}]}})} WHERE id=${site.id}`;
 let checks=0;
 // A late insert failure occurs after a complete first batch. Neither site nor pages survive.
 await owner.unsafe(`CREATE FUNCTION duplication_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.site_id <> '${site.id}' AND NEW.slug='page-102' THEN RAISE EXCEPTION 'owned late insert failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER duplication_fail_insert BEFORE INSERT ON pages FOR EACH ROW EXECUTE FUNCTION duplication_fail_insert();`);
 await assert.rejects(()=>a.siteDuplication!.duplicate({sourceSiteId:site.id,slug:'late-failure'}));assert.equal((await owner`SELECT count(*)::int n FROM sites WHERE slug='late-failure'`)[0].n,0);assert.equal((await owner`SELECT count(*)::int n FROM pages`)[0].n,103);checks+=3;
 await owner.unsafe('DROP TRIGGER duplication_fail_insert ON pages; DROP FUNCTION duplication_fail_insert();');
 await owner.unsafe(`CREATE FUNCTION duplication_fail_parent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.site_id <> '${site.id}' AND NEW.parent_id IS NOT NULL THEN RAISE EXCEPTION 'owned parent failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER duplication_fail_parent BEFORE UPDATE ON pages FOR EACH ROW EXECUTE FUNCTION duplication_fail_parent();`);
 await assert.rejects(()=>a.siteDuplication!.duplicate({sourceSiteId:site.id,slug:'parent-failure'}));assert.equal((await owner`SELECT count(*)::int n FROM sites WHERE slug='parent-failure'`)[0].n,0);assert.equal((await owner`SELECT count(*)::int n FROM pages`)[0].n,103);checks+=3;
 await owner.unsafe('DROP TRIGGER duplication_fail_parent ON pages; DROP FUNCTION duplication_fail_parent();');
 const result=await a.siteDuplication!.duplicate({sourceSiteId:'source',slug:'complete-copy'}),rows=await owner`SELECT * FROM pages WHERE site_id=${result.site.id}`,first=rows.find(row=>row.slug==='page-0')!,last=rows.find(row=>row.slug==='page-102')!;
 assert.equal(rows.length,103);assert.equal(first.parent_id,last.id);assert.equal(first.meta.parentPageId,last.id);assert.equal(first.content.canvas.futureGeometry,'kept');assert.equal(first.content.elements[0].props.formId,'authored-reference');assert.equal(result.site.settings.navigation.primary[0].pageId,first.id);assert.equal(result.site.settings.navigation.primary[0].children[0].pageId,last.id);assert.equal(result.site.settings.authoredExtension.kept,true);assert(rows.every(row=>row.status==='draft'));assert.equal((await owner`SELECT parent_id FROM pages WHERE id=${ids[0]}`)[0].parent_id,ids[102]);assert.equal(result.concurrencyBoundary,'postgres-table-locks');checks+=11;
 // The independent ordinary writer waits while duplicate admission owns the full inventory.
 const gate=431122;await owner`SELECT pg_advisory_lock(${gate})`;
 await owner.unsafe(`CREATE FUNCTION duplication_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.site_id <> '${site.id}' AND NEW.slug='page-0' THEN PERFORM pg_advisory_xact_lock(${gate}); END IF; RETURN NEW; END $$; CREATE TRIGGER duplication_hold BEFORE INSERT ON pages FOR EACH ROW EXECUTE FUNCTION duplication_hold();`);
 const copying=a.siteDuplication!.duplicate({sourceSiteId:site.id,slug:'held-copy'});await waitForBlocked('duplicate-writer-a');
 const author=Promise.all([sqlB`INSERT INTO pages(site_id,title,slug) VALUES(${site.id},'Concurrent new source','late-source')`,sqlB`UPDATE pages SET title='Concurrent authored title' WHERE id=${ids[0]}`]);await waitForBlocked('duplicate-writer-b');await owner`SELECT pg_advisory_unlock(${gate})`;const held=await copying;await author;
 assert.equal(held.pagesCopied,103);assert.equal((await owner`SELECT title FROM pages WHERE site_id=${held.site.id} AND slug='page-0'`)[0].title,'Page 0');assert.equal((await owner`SELECT title FROM pages WHERE id=${ids[0]}`)[0].title,'Concurrent authored title');checks+=2;assert.equal((await owner`SELECT count(*)::int n FROM pages WHERE site_id=${site.id}`)[0].n,104);assert.equal((await owner`SELECT count(*)::int n FROM pages WHERE site_id=${held.site.id} AND slug='late-source'`)[0].n,0);checks+=3;
 await owner.unsafe('DROP TRIGGER duplication_hold ON pages; DROP FUNCTION duplication_hold();');
 const fresh=await a.siteDuplication!.duplicate({sourceSiteId:site.id,slug:'fresh-copy'});assert.equal(fresh.pagesCopied,104);assert.equal((await owner`SELECT title FROM pages WHERE site_id=${fresh.site.id} AND slug='page-0'`)[0].title,'Concurrent authored title');checks+=2;
 const slugs=await Promise.all([a.siteDuplication!.duplicate({sourceSiteId:site.id,slug:'shared-slug'}),b.siteDuplication!.duplicate({sourceSiteId:site.id,slug:'shared-slug'})]);assert.equal(new Set(slugs.map(value=>value.site.slug)).size,2);checks++;
 await assert.rejects(()=>a.sites.create({teamId:team.id,name:'Slug conflict',slug:'shared-slug'}),(error:any)=>error.code==='SITE_SLUG_CONFLICT');checks++;
 const mixedSlug=await Promise.allSettled([a.sites.create({teamId:team.id,name:'Normal mixed slug',slug:'mixed-slug'}),b.siteDuplication!.duplicate({sourceSiteId:site.id,slug:'mixed-slug'})]);const committedMixed=await owner`SELECT id,slug FROM sites WHERE slug='mixed-slug' OR slug='mixed-slug-2'`;assert.equal(committedMixed.length,mixedSlug.filter(value=>value.status==='fulfilled').length);assert.equal(new Set(committedMixed.map(row=>row.slug)).size,committedMixed.length);assert.equal(mixedSlug.filter(value=>value.status==='rejected').every((value:any)=>value.reason.code==='SITE_SLUG_CONFLICT'),true);checks+=3;
 const route=loadMediaFixture('../src/app/api/admin/sites/[siteId]/duplicate/route.ts',{'@backy-cms/core':createRequire(import.meta.url)('../../core/dist/index.js'),'@/lib/backyStore':{},'@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:null}}})},'@/lib/adminAudit':{recordAdminAudit:async()=>{throw Error('Owned postcommit audit failure');}},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>a}});
 const call=()=>route.POST(new NextRequest('http://fixture.invalid/api/admin/sites/'+site.id+'/duplicate',{method:'POST',body:JSON.stringify({slug:'actual-route-copy'})}),{params:Promise.resolve({siteId:site.id})});const response=await call();assert.equal(response.status,201);assert((await response.json()).data.completionWarnings.includes('SITE_DUPLICATION_AUDIT_PENDING'));checks+=2;
 const count=(await owner`SELECT count(*)::int n FROM sites`)[0].n;await owner`INSERT INTO platform_settings(id,integrations) VALUES('default',${owner.json({commerce:{siteLimit:count+1,overageMode:'block'}})}) ON CONFLICT(id) DO UPDATE SET integrations=EXCLUDED.integrations`;
 const quota=await Promise.allSettled([a.sites.create({teamId:team.id,name:'Normal race',slug:'normal-race'}),b.siteDuplication!.duplicate({sourceSiteId:site.id,slug:'quota-race'})]);assert.equal(quota.filter(value=>value.status==='fulfilled').length,1);assert.equal((quota.find(value=>value.status==='rejected') as PromiseRejectedResult).reason.code,'BILLING_SITE_LIMIT');assert.equal((await owner`SELECT count(*)::int n FROM sites`)[0].n,count+1);checks+=3;const denied=await call();assert.equal(denied.status,402,'Actual CJS handler must retain typed ESM repository quota denial');assert.equal((await denied.json()).error.code,'BILLING_SITE_LIMIT');checks+=2;
 // A reviewed backup job must also recheck quota at final commit after another creator consumes the slot.
 await owner`UPDATE platform_settings SET integrations='{}'::jsonb WHERE id='default'`;const graph=await a.siteBackups!.snapshot(site.id,async graph=>graph),map=new Map<string,string>([[site.id,randomUUID()]]);for(const name of SITE_BACKUP_TABLES)for(const row of graph.tables[name])map.set(String(row.id),randomUUID());const draft=prepareSiteBackupDraft(graph,map,{name:'Quota recovery',slug:'quota-recovery',teamId:team.id,actorId:null}),job=await a.siteBackups!.createJob({sourceSiteId:site.id,targetSiteId:String(draft.site.id),files:[],storageIdentity:'b'.repeat(64)});
 const before=(await owner`SELECT count(*)::int n FROM sites`)[0].n;await owner`UPDATE platform_settings SET integrations=${owner.json({commerce:{siteLimit:before+1,overageMode:'block'}})} WHERE id='default'`;await a.sites.create({teamId:team.id,name:'Final slot',slug:'final-slot'});
 let exceeded=false;try{await a.siteBackups!.commit(job.id,site.id,draft);exceeded=true;}catch(error){assert.equal((error as any).code,'BILLING_SITE_LIMIT');}if(process.argv.includes('--expect-known-backup-race')){assert(exceeded,'Expected confirmed backup quota bypass');console.log('CONFIRMED: pending backup commit exceeds quota after ordinary creator consumes final slot.');}else{assert.equal(exceeded,false,'Backup final commit must recheck mixed-writer quota');assert.equal((await owner`SELECT count(*)::int n FROM sites`)[0].n,before+1);assert.equal((await a.siteBackups!.getJob(site.id,job.id))!.state,'pending');checks+=3;}
 await owner`UPDATE platform_settings SET integrations='{}'::jsonb WHERE id='default'`;const evidenceSite=(await a.sites.create({teamId:team.id,name:'Journal evidence',slug:'journal-evidence'})).item;
 const attemptId=randomUUID();await owner`INSERT INTO comment_delivery_attempts(id,site_id,comment_id,kind,channel,target,request_id,state) VALUES(${attemptId},${evidenceSite.id},${randomUUID()},'comment-status','email','mailto:private@example.invalid','owned-lifecycle','uncertain')`;
 const deliveryGuard=loadMediaFixture('../src/lib/siteCommentDeliveryLifecycle.ts',{'./demoCommentDeliveryJournal':{demoCommentDeliveryJournal:{}},'@backy-cms/core':createRequire(import.meta.url)('../../core/dist/index.js')});assert.equal((await deliveryGuard.siteCommentDeliveryDeletionResponse(evidenceSite.id,a,'owned-lifecycle')).status,409);let fkError:any;try{await a.sites.delete(evidenceSite.id);}catch(error){fkError=error;}assert.equal(fkError.cause?.code||fkError.code,'23503');assert.equal(deliveryGuard.siteCommentDeliveryDeletionErrorResponse(fkError,'owned-lifecycle').status,409);assert.equal((await owner`SELECT count(*)::int n FROM sites WHERE id=${evidenceSite.id}`)[0].n,1);assert.equal((await owner`SELECT count(*)::int n FROM comment_delivery_attempts WHERE id=${attemptId}`)[0].n,1);assert.equal((await owner`SELECT count(*)::int n FROM pages WHERE site_id=${site.id}`)[0].n,104);assert.equal((await owner`SELECT count(*)::int n FROM comment_delivery_attempts WHERE site_id=${result.site.id}`)[0].n,0);checks+=7;
 const unsupported=createDatabaseRepositories({adapter:{type:'sqlite',db:drizzle(sqlA,{schema}),isConnected:async()=>true,close:async()=>{}}});await assert.rejects(()=>unsupported.siteDuplication!.duplicate({sourceSiteId:site.id}),(error:any)=>error.code==='SITE_CREATION_UNAVAILABLE');await assert.rejects(()=>unsupported.sites.create({teamId:team.id,name:'Unsupported normal',slug:'unsupported-normal'}),(error:any)=>error.code==='SITE_CREATION_UNAVAILABLE');checks+=2;
 console.log(`PASS ${checks} actual isolated PostgreSQL duplication rollback/hierarchy/author phantom/slug/mixed normal-create quota checks; actual emitted repositories, no configured database/provider.`);
 async function waitForBlocked(name:string){for(let attempt=0;attempt<100;attempt++){if((await monitor`SELECT 1 FROM pg_stat_activity WHERE application_name=${name} AND wait_event_type='Lock'`).length)return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Expected independent writer to wait on admission');}
}finally{await cleanup();}
