#!/usr/bin/env node
// Configuration proof only: generates a disposable public certificate, opens no database socket.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabaseAdapter } from '../dist/adapters/index.js';
import { resolveBackyDataRuntimeConfig } from '../dist/runtime-config.js';
import { Client } from 'pg';
const scratch=mkdtempSync('/tmp/backy-pg-ca-config-');
const env=Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL'].flatMap(key=>process.env[key]?[[key,process.env[key]]]:[]));
const opened=[];
try{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(scratch,'key.pem'),'-out',join(scratch,'ca.pem'),'-days','1','-subj','/CN=backy-owned-ca-config'],{env,stdio:'ignore',timeout:10000});
 const ca=readFileSync(join(scratch,'ca.pem'),'utf8').trim();
 const url='postgres://synthetic:synthetic-password@database.example.invalid:6543/proof?sslmode=require&application_name=owned-proof';
 const config=resolveBackyDataRuntimeConfig({POSTGRES_URL:url,BACKY_DATABASE_SSL_CA_PEM:ca});
 assert.equal(config.database.sslCaPem,ca);assert.equal(config.database.url,url);
 for(const mode of ['require','verify-ca','verify-full']){
  const configured=await createDatabaseAdapter({...config.database,url:url.replace('sslmode=require','sslmode='+mode)});opened.push(configured);
  const pool=configured.db.$client, parsed=new URL(pool.options.connectionString);
  assert.equal(parsed.hostname,'database.example.invalid');assert.equal(parsed.port,'6543');assert.equal(parsed.searchParams.get('application_name'),'owned-proof');assert.equal(parsed.searchParams.has('sslmode'),false);
  assert.equal(pool.options.ssl.ca,ca);assert.equal(pool.options.ssl.rejectUnauthorized,true);
  const native=new Client(pool.options);assert.equal(native.connectionParameters.ssl.ca,ca);assert.equal(native.connectionParameters.ssl.rejectUnauthorized,true);assert.equal(native.connectionParameters.ssl.checkServerIdentity,undefined);
  assert.equal(pool.totalCount,0,'Configuration test must not open a database socket');
 }
 const untouched=await createDatabaseAdapter({type:'postgres',url});opened.push(untouched);assert.equal(untouched.db.$client.options.connectionString,url);assert.equal(untouched.db.$client.options.ssl,undefined);
 const malformed=['','not a certificate','-----BEGIN CERTIFICATE-----\nbad-base64\n-----END CERTIFICATE-----',ca+'untrusted trailing input','x'.repeat(65537)];
 for(const sslCaPem of malformed)await assert.rejects(createDatabaseAdapter({type:'postgres',url,sslCaPem}),error=>/valid bounded PEM/.test(error.message)&&!error.message.includes('synthetic-password')&&!error.message.includes(sslCaPem||'cannot-match-empty'));
 for(const query of ['sslmode=disable','sslmode=allow','sslmode=prefer','sslmode=no-verify','sslmode=require&sslmode=disable','ssl=false','ssl=no-verify']){
  await assert.rejects(createDatabaseAdapter({type:'postgres',url:url.split('?')[0]+'?'+query,sslCaPem:ca}),/verified encrypted/);
 }
 for(const key of ['sslcert','sslkey','sslrootcert'])await assert.rejects(createDatabaseAdapter({type:'postgres',url:url+'&'+key+'=unread-owned-placeholder',sslCaPem:ca}),/conflicts with existing/);
 await assert.rejects(createDatabaseAdapter({type:'postgres',url:'invalid synthetic-password URL',sslCaPem:ca}),error=>/valid PostgreSQL/.test(error.message)&&!error.message.includes('synthetic-password'));
 assert.equal(resolveBackyDataRuntimeConfig({POSTGRES_URL:url}).database.sslCaPem,undefined);
 assert.deepEqual(resolveBackyDataRuntimeConfig({BACKY_DATA_MODE:'demo',BACKY_DATABASE_SSL_CA_PEM:ca}),{mode:'demo'});
 console.log('Postgres verified-CA config PASS: actual adapter/native parser preserve strict CA+hostname verification, encrypted modes and remaining URL params; invalid PEM/insecure modes/client-cert conflicts fail without values; absent CA preserves URI; no database socket opened.');
}catch(error){console.error('Verified CA configuration proof failed: '+String(error.message).split('\n')[0]);process.exitCode=1;}finally{await Promise.all(opened.map(adapter=>adapter.close()));rmSync(scratch,{recursive:true,force:true});}
