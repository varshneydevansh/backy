#!/usr/bin/env node
// Always creates its own socket-only cluster. Never reads a configured database URL.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt, randomUUID, createHash } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../dist/schema/index.js';
import { createDatabaseRepositories } from '../dist/repositories/index.js';
import { BackyReusableSectionConflictError, BackyReusableSectionPropagationConflictError } from '../../core/dist/index.mjs';

if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-reusable-cas-postgres-');
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
  assert(/^\/tmp\/backy-reusable-cas-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], 'Stopping owned temporary cluster');
  assert(!existsSync(join(data, 'postmaster.pid')), 'Owned cluster still running; its directory was retained');
  rmSync(clusterRoot, { recursive: true, force: true });
 })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
const connection = (name) => {
 const client = postgres({ host: socket, port, username, database: 'postgres', max: 1, connect_timeout: 5, connection: { application_name: name }, onnotice() {} });
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

 const owner = connection('backy-reusable-cas-lock-holder'), monitor = connection('backy-reusable-cas-monitor'), sqlA = connection('backy-reusable-cas-writer-a'), sqlB = connection('backy-reusable-cas-writer-b');
 await Promise.all([owner`SELECT 1`, monitor`SELECT 1`, sqlA`SELECT 1`, sqlB`SELECT 1`]);
 const [identity] = await owner`SELECT current_user, current_database(), current_setting('listen_addresses') AS listeners, current_setting('data_directory') AS directory`;
 assert.equal(identity.current_user, username); assert.equal(identity.current_database, 'postgres'); assert.equal(identity.listeners, ''); assert.equal(identity.directory, data);
 const a = bundle(sqlA), b = bundle(sqlB);
 let checks = 0;
 const team = (await a.teams.create({ name: 'Disposable CAS team', slug: 'cas-team', ownerId: null })).item;
 const site = (await a.sites.create({ teamId: team.id, name: 'Disposable CAS site', slug: 'cas-site', status: 'draft' })).item;
 const base = { siteId: site.id, name: 'Original', slug: 'original', content: { elements: [{ id: 'root-a', type: 'container', children: [{ id: 'nested', type: 'heading', props: { content: 'Exact', extension: { keep: true } }, animation: { from: { x: 0 }, to: { x: 20 } }, responsive: { mobile: { width: 320 } } }] }, { id: 'root-b', type: 'button', props: { label: 'Second root' } }], extension: { keep: true }, customCSS: '.keep{}' }, metadata: { reusableSection: { version: 1 }, extension: { keep: true } } };
 const item = (await a.reusableSections.create(base)).item;
 async function waitForBlocked(name) {
   const deadline = Date.now() + 5000;
   while (Date.now() < deadline) { const [result] = await monitor`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name=${name} AND wait_event_type='Lock'`; if (result.count > 0) return; await new Promise(resolve => setTimeout(resolve, 20)); }
   throw Error('Expected section writer did not reach row lock');
 }
 let locked, release;
 const acquired = new Promise(resolve => { locked = resolve; }), released = new Promise(resolve => { release = resolve; });
 const authorContent = { ...item.content, extension: { authorWinner: true } };
 const hold = owner.begin(async tx => { await tx`SET LOCAL session_replication_role = 'replica'`; await tx`SELECT id FROM reusable_sections WHERE id=${item.id} FOR UPDATE`; locked(); await released; await tx`UPDATE reusable_sections SET content=${tx.json(authorContent)} WHERE id=${item.id}`; });
 await acquired;
 const stale = a.reusableSections.update(site.id, item.id, { name: 'Stale writer', expectedSection: item }).then(() => ({ ok: true }), error => ({ error }));
 await waitForBlocked('backy-reusable-cas-writer-a'); release(); await hold;
 const outcome = await stale; assert(outcome.error instanceof BackyReusableSectionConflictError); checks++;
 const fresh = await a.reusableSections.getById(site.id, item.id);
 assert.equal(fresh.updatedAt, item.updatedAt, 'Same timestamp content race is still a conflict'); assert.deepEqual(fresh.content.extension, { authorWinner: true }); checks++;
 const pair = await Promise.allSettled([a.reusableSections.update(site.id, item.id, { name: 'Winner A', expectedSection: fresh }), b.reusableSections.update(site.id, item.id, { name: 'Winner B', expectedSection: fresh })]);
 assert.equal(pair.filter(result => result.status === 'fulfilled').length, 1); assert(pair.find(result => result.status === 'rejected').reason instanceof BackyReusableSectionConflictError); checks++;
 let current = await a.reusableSections.getById(site.id, item.id);
 const reordered = JSON.parse(JSON.stringify(current, (key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value));
 current = (await a.reusableSections.update(site.id, item.id, { name: 'Reordered snapshot accepted', expectedSection: reordered })).item;
 assert.deepEqual(current.content.elements, base.content.elements); checks++;
 await assert.rejects(a.reusableSections.update(randomUUID(), item.id, { name: 'Cross site', expectedSection: current }), BackyReusableSectionConflictError); checks++;
 const createOperation = slug => ({ type: 'create', input: { ...base, slug, name: slug } });
 await assert.rejects(a.reusableSections.applyBatch(site.id, [createOperation('new-before-late-conflict'), createOperation('original')]));
 assert.equal(await a.reusableSections.getBySlug(site.id, 'new-before-late-conflict'), null); checks++;
 await assert.rejects(a.reusableSections.applyBatch(site.id, [{ type: 'update', sectionId: item.id, input: { name: 'Rollback this update', expectedSection: current } }, createOperation('original')]));
 assert.deepEqual(await a.reusableSections.getById(site.id, item.id), current); checks++;
 await assert.rejects(a.reusableSections.applyBatch(site.id, [createOperation('new-before-stale-update'), { type: 'update', sectionId: item.id, input: { name: 'Stale import', expectedSection: fresh } }]), BackyReusableSectionConflictError);
 assert.equal(await a.reusableSections.getBySlug(site.id, 'new-before-stale-update'), null); checks++;
 const foreign = { ...createOperation('foreign'), input: { ...base, siteId: randomUUID(), slug: 'foreign' } };
 await assert.rejects(a.reusableSections.applyBatch(site.id, [foreign]), BackyReusableSectionConflictError); checks++;
 const imported = await a.reusableSections.applyBatch(site.id, [createOperation('imported-a'), { type: 'update', sectionId: item.id, input: { name: 'Atomic import update', expectedSection: current, metadata: { ...current.metadata, reusableSection: { version: 2 } } } }]);
 assert.equal(imported.length, 2); assert.deepEqual(imported[0].content, base.content); assert.deepEqual(imported[1].content.elements, base.content.elements); checks++;

 // Actual cross-repository serializable propagation: source + complete inventory + revisions.
 const propSite = (await a.sites.create({ teamId: team.id, name: 'Propagation site', slug: 'prop-site', status: 'draft' })).item;
 const propSource = (await a.reusableSections.create({ ...base, siteId: propSite.id, slug: 'prop-source' })).item;
 const content = { elements: [{ id: 'linked', type: 'heading', props: { content: 'Old authored heading', reusableSection: { sectionId: propSource.id, mode: 'synced' } } }], extension: { preserve: true } };
 const pageOne = (await a.pages.create({ siteId: propSite.id, title: 'Page one', slug: 'page-one', status: 'draft', content })).item;
 const postOne = (await a.posts.create({ siteId: propSite.id, title: 'Post one', slug: 'post-one', status: 'draft', content })).item;
 const products = (await a.collections.create({ siteId: propSite.id, name: 'Products', slug: 'products', fields: [] })).item;
 const product = (await a.collections.createRecord({ siteId: propSite.id, collectionId: products.id, slug: 'product-one', status: 'draft', values: { title: 'Product', price: 42, extension: { preserve: true }, frontendDesignElements: content.elements } })).item;
 async function propagationInput() {
   const source = await a.reusableSections.getById(propSite.id, propSource.id);
   const pages = (await a.pages.list({siteId:propSite.id,status:'all',includeUnpublished:true,limit:100})).items;
   const posts = (await a.posts.list({siteId:propSite.id,status:'all',includeUnpublished:true,limit:100})).items;
   const records = (await a.collections.listRecords({siteId:propSite.id,collectionId:products.id,status:'all',includeUnpublished:true,limit:100})).items;
   const inventory=[...pages.map(p=>({type:'page',id:p.id,updatedAt:p.updatedAt,content:p.content})),...posts.map(p=>({type:'post',id:p.id,updatedAt:p.updatedAt,content:p.content})),...records.map(p=>({type:'product',id:p.id,collectionId:p.collectionId,updatedAt:p.updatedAt,values:p.values}))];
   return {source,scope:{targetType:'all',includeProducts:true,productCollectionId:products.id},inventory,mutations:inventory.map(expected=>({expected,...(expected.type==='product'?{values:{...expected.values,frontendDesignElements:[{id:'linked',type:'heading',props:{content:'Refreshed'}}]}}:{content:{...expected.content,elements:[{id:'linked',type:'heading',props:{content:'Refreshed'}}]}})}))};
 }
 let propInput=await propagationInput();
 await owner`CREATE FUNCTION assert_serializable_propagation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('transaction_isolation') <> 'serializable' THEN RAISE EXCEPTION 'not serializable'; END IF; RETURN NEW; END; $$`;
 await owner`CREATE TRIGGER assert_prop_serializable BEFORE UPDATE ON pages FOR EACH ROW EXECUTE FUNCTION assert_serializable_propagation()`;
 await a.reusableSections.applyPropagation(propSite.id,propInput);
 assert.equal((await a.pages.getById(propSite.id,pageOne.id)).content.elements[0].props.content,'Refreshed');
 assert.equal((await a.posts.getById(propSite.id,postOne.id)).content.elements[0].props.content,'Refreshed');
 const productAfter=(await a.collections.getRecordById(propSite.id,products.id,product.id));assert.equal(productAfter.values.price,42);assert.deepEqual(productAfter.values.extension,{preserve:true});checks++;
 const pageHistory=await a.contentWorkflows.listRevisions({siteId:propSite.id,targetType:'page',targetId:pageOne.id});assert.equal(pageHistory.items.length,1);assert.deepEqual(pageHistory.items[0].snapshot.content,JSON.parse(JSON.stringify(propInput.inventory.find(t=>t.type==='page').content)));checks++;
 const postHistory=await a.contentWorkflows.listRevisions({siteId:propSite.id,targetType:'post',targetId:postOne.id});assert.equal(postHistory.items.length,1);checks++;
 await owner`DROP TRIGGER assert_prop_serializable ON pages`; await owner`DROP FUNCTION assert_serializable_propagation()`;
 // A late production repository write error rolls back earlier content and its new revision.
 propInput=await propagationInput();const beforePage=await a.pages.getById(propSite.id,pageOne.id);const beforeProduct=await a.collections.getRecordById(propSite.id,products.id,product.id);
 await owner`CREATE FUNCTION reject_prop_post_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned late write fixture'; END; $$`;
 await owner`CREATE TRIGGER reject_prop_post BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE FUNCTION reject_prop_post_write()`;
 await assert.rejects(a.reusableSections.applyPropagation(propSite.id,propInput));
 assert.deepEqual(await a.pages.getById(propSite.id,pageOne.id),beforePage);assert.deepEqual(await a.collections.getRecordById(propSite.id,products.id,product.id),beforeProduct);assert.equal((await a.contentWorkflows.listRevisions({siteId:propSite.id,targetType:'page',targetId:pageOne.id})).items.length,1);checks++;
 await owner`DROP TRIGGER reject_prop_post ON blog_posts`;await owner`DROP FUNCTION reject_prop_post_write()`;
 // Inventory additions and removals invalidate reviewed apply without touching any target.
 propInput=await propagationInput();const extra=(await b.pages.create({siteId:propSite.id,title:'Late addition',slug:'late-addition',status:'draft',content})).item;
 await assert.rejects(a.reusableSections.applyPropagation(propSite.id,propInput),BackyReusableSectionPropagationConflictError);assert.deepEqual(await a.pages.getById(propSite.id,pageOne.id),beforePage);checks++;
 propInput=await propagationInput();await b.pages.delete(propSite.id,extra.id);await assert.rejects(a.reusableSections.applyPropagation(propSite.id,propInput),BackyReusableSectionPropagationConflictError);checks++;
 // Full source semantics and full product values are protected even with unchanged timestamps.
 propInput=await propagationInput();await owner.begin(async tx=>{await tx`SET LOCAL session_replication_role='replica'`;await tx`UPDATE content_collection_records SET values=jsonb_set(values,'{price}','99'::jsonb) WHERE id=${product.id}`;});
 await assert.rejects(a.reusableSections.applyPropagation(propSite.id,propInput),BackyReusableSectionPropagationConflictError);assert.equal((await a.collections.getRecordById(propSite.id,products.id,product.id)).values.price,99);checks++;
 propInput=await propagationInput();await b.reusableSections.update(propSite.id,propSource.id,{name:'Source author winner'});await assert.rejects(a.reusableSections.applyPropagation(propSite.id,propInput),BackyReusableSectionPropagationConflictError);checks++;
 // Independent author wins a blocked row race; serializable apply aborts its entire transaction.
 propInput=await propagationInput();let propLocked,propRelease;const propAcquired=new Promise(resolve=>{propLocked=resolve}),propReleased=new Promise(resolve=>{propRelease=resolve});
 const authorHold=owner.begin(async tx=>{await tx`SELECT id FROM pages WHERE id=${pageOne.id} FOR UPDATE`;propLocked();await propReleased;await tx`UPDATE pages SET content=jsonb_set(content,'{extension}','{"authorWinner":true}'::jsonb) WHERE id=${pageOne.id}`;});
 await propAcquired;const blockedApply=a.reusableSections.applyPropagation(propSite.id,propInput).then(()=>({ok:true}),error=>({error}));await waitForBlocked('backy-reusable-cas-writer-a');propRelease();await authorHold;
 assert((await blockedApply).error instanceof BackyReusableSectionPropagationConflictError);assert.deepEqual((await a.pages.getById(propSite.id,pageOne.id)).content.extension,{authorWinner:true});assert.equal((await a.contentWorkflows.listRevisions({siteId:propSite.id,targetType:'page',targetId:pageOne.id})).items.length,1);checks++;
 // A new target cannot enter the selected tenant while apply holds its site admission lock.
 // Site foreign keys acquire KEY SHARE; the owned apply site FOR UPDATE blocks insertion.
 propInput=await propagationInput();let sourceLocked,sourceRelease;const sourceAcquired=new Promise(resolve=>{sourceLocked=resolve}),sourceReleased=new Promise(resolve=>{sourceRelease=resolve});
 const sourceHold=owner.begin(async tx=>{await tx`SELECT id FROM reusable_sections WHERE id=${propSource.id} FOR UPDATE`;sourceLocked();await sourceReleased;});
 await sourceAcquired;const admittedApply=a.reusableSections.applyPropagation(propSite.id,propInput);await waitForBlocked('backy-reusable-cas-writer-a');
 let insertedDuringApply=false;const lateInsert=b.pages.create({siteId:propSite.id,title:'Admission ordered target',slug:'admission-ordered',status:'draft',content}).then(result=>{insertedDuringApply=true;return result.item;});
 await waitForBlocked('backy-reusable-cas-writer-b');assert.equal(insertedDuringApply,false);sourceRelease();await sourceHold;await admittedApply;const admittedPage=await lateInsert;assert.equal(insertedDuringApply,true);checks++;
 assert.equal((await a.pages.getById(propSite.id,pageOne.id)).content.elements[0].props.content,'Refreshed');await b.pages.delete(propSite.id,admittedPage.id);checks++;
 await assert.rejects(a.reusableSections.applyPropagation(randomUUID(),await propagationInput()),BackyReusableSectionPropagationConflictError);checks++;
 const unsupported=createDatabaseRepositories({adapter:{db:drizzle(sqlB,{schema}),type:'sqlite'}});await assert.rejects(unsupported.reusableSections.applyPropagation(propSite.id,await propagationInput()),e=>e.code==='REUSABLE_SECTION_PROPAGATION_UNAVAILABLE');checks++;
 console.log(`Reusable section isolated PostgreSQL passed ${checks} checks: ${migrations.length} migrations; actual scoped repository, two independent writers/row lock, same-timestamp content conflict, stable JSON, late unique failure full rollback, stale update full rollback, full create/update composition; serializable cross-document propagation/revisions, late error rollback, source/product same-timestamp conflict, inventory add/remove, author row race, unsupported adapter and cross-site denial. No configured database/provider touched.`);
} finally { await cleanup(); }
