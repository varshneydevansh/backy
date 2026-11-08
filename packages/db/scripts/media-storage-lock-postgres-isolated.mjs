#!/usr/bin/env node
// Always creates its own socket-only cluster. Never reads a configured database URL.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt, randomUUID, createHash } from 'node:crypto';
import postgres from 'postgres';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';

if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-media-lock-postgres-');
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
  assert(/^\/tmp\/backy-media-lock-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], 'Stopping owned temporary cluster');
  assert(!existsSync(join(data, 'postmaster.pid')), 'Owned cluster still running; its directory was retained');
  rmSync(clusterRoot, { recursive: true, force: true });
 })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
const connection = (name) => {
 const client = postgres({ host: socket, port, username, database: 'postgres', max: 3, connect_timeout: 5, connection: { application_name: name }, onnotice() {} });
 clients.push(client); return client;
};
const sourceBundle=join(repositoryRoot,'packages/db/scripts/.media-lock-proof-'+randomUUID()+'.mjs');
try {
 run('initdb', ['-D', data, '--username', username, '--encoding', 'UTF8', '--no-locale', '--auth=trust'], 'Initializing owned cluster');
 mkdirSync(socket);
 run('pg_ctl', ['-D', data, '-l', log, '-o', `-k ${socket} -p ${port} -h ''`, '-w', '-t', '15', 'start'], 'Starting owned cluster');
 await build({entryPoints:[join(repositoryRoot,'packages/db/src/repositories/media.ts')],outfile:sourceBundle,bundle:true,platform:'node',format:'esm',packages:'external'});
 const {createMediaRepository}=await import(pathToFileURL(sourceBundle).href);
 const a=createMediaRepository(drizzle(connection('media-lock-a')),'postgres');
 const b=createMediaRepository(drizzle(connection('media-lock-b')),'postgres');
 let release,entered;const admission=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 const first=a.withStorageMutationLock('site-a',async()=>{entered();await hold;return 'committed';});
 await admission;
 await assert.rejects(b.withStorageMutationLock('site-a',async()=>assert.fail('Busy callback ran')),error=>error.code==='MEDIA_STORAGE_MUTATION_BUSY');
 assert.equal(await b.withStorageMutationLock('site-b',async()=>42),42);
 release();assert.equal(await first,'committed');
 assert.equal(await b.withStorageMutationLock('site-a',async()=>7),7);
 await assert.rejects(a.withStorageMutationLock('site-a',async()=>{throw Error('injected provider failure');}),/injected provider failure/);
 assert.equal(await b.withStorageMutationLock('site-a',async()=>8),8);
 const sharedClient=connection('bounded-shared-pool'),shared=createMediaRepository(drizzle(sharedClient),'postgres');
 let releasePool;const poolHold=new Promise(r=>releasePool=r);let entrants=0,allEntered;const bothEntered=new Promise(r=>allEntered=r);
 const work=()=>async()=>{assert.equal((await sharedClient`select 1 as ok`)[0].ok,1);entrants++;if(entrants===2)allEntered();await poolHold;};
 const heldA=shared.withStorageMutationLock('pool-site-a',work()),heldB=shared.withStorageMutationLock('pool-site-b',work());await bothEntered;
 await assert.rejects(shared.withStorageMutationLock('pool-site-c',async()=>assert.fail('Pool admission exceeded bound')),error=>error.code==='MEDIA_STORAGE_MUTATION_BUSY');
 releasePool();await Promise.all([heldA,heldB]);assert.equal(await shared.withStorageMutationLock('pool-site-c',async()=>9),9);
 await assert.rejects(createMediaRepository(drizzle(connection('unsupported')),'sqlite').withStorageMutationLock('site-a',async()=>assert.fail('Unsupported callback ran')),error=>error.code==='MEDIA_STORAGE_LOCK_UNAVAILABLE');
 console.log('Actual PostgreSQL media guard PASS: independent clients deny same-site admission, allow other sites, release after success/failure, bound per-adapter admission while callback queries retain pool capacity, and refuse unsupported providers. Byte-write route behavior is separately verified.');
} catch(error){console.error(error);process.exitCode=1;}
finally{rmSync(sourceBundle,{force:true});await cleanup();console.log('Owned socket-only cluster stopped and removed; no configured database was used.');}
