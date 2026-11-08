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
import { createRequire } from 'node:module';
const {drizzle}=createRequire(new URL('../../../packages/db/package.json',import.meta.url))('drizzle-orm/postgres-js');
import * as schema from '../../../packages/db/src/schema/index.ts';
import { createDatabaseRepositories } from '../../../packages/db/src/repositories/factory.ts';
import { loadMediaFixture } from '../../../apps/public/scripts/media-storage-recovery-fixture.mts';

if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { symlinkSync } from 'node:fs';
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-newsletter-http-postgres-');
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
  assert(/^\/tmp\/backy-newsletter-http-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'], 'Stopping owned temporary cluster');
  assert(!existsSync(join(data, 'postmaster.pid')), 'Owned cluster still running; its directory was retained');
  rmSync(clusterRoot, { recursive: true, force: true });
 })();
}
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

 const client=connection('newsletter-http'),repositories=bundle(client),origin='http://127.0.0.1:5242',proofPath='/tmp/backy-newsletter-campaign-http-proof.json';let server:any;
 const scratch=mkdtempSync('/tmp/backy-newsletter-http-ui-'),requests:any[]=[],transport:any[]=[];let stopFixture!:()=>void;const stopped=new Promise<void>(resolve=>{stopFixture=resolve;});
 const team=(await repositories.teams.create({name:'Synthetic team',slug:'newsletter-http-team',ownerId:null})).item;
 const site=(await repositories.sites.create({teamId:team.id,name:'Synthetic publication',slug:'newsletter-http-site',status:'draft'})).item;
 const form=(await repositories.forms.create({siteId:site.id,name:'Synthetic newsletter',fields:[],isActive:true})).item;
 await repositories.forms.createContact({siteId:site.id,formId:form.id,name:'Synthetic reader',email:'recipient@example.test',phone:null,notes:null,status:'new',sourceValues:{},newsletterSubscriptionStatus:'subscribed',newsletterConsent:true,newsletterConsentText:'Synthetic explicit consent',newsletterSubscribedAt:new Date().toISOString()});
 const env={BACKY_NEWSLETTER_SITE_POLICY:JSON.stringify({[site.id]:{enabled:true,providerApproved:true,oneClickDkimVerified:true,postalAddress:'Synthetic fixture address',publicBaseUrl:'https://fixture.example.test',maxRecipients:40}}),BACKY_NEWSLETTER_DAILY_LIMIT:'40',BACKY_NEWSLETTER_UNSUBSCRIBE_SECRET:'synthetic-secret-with-more-than-32-chars'};
 const mocks:any={'@/lib/adminAccess':{requireAdminAccess:async(_request:any,_id:string,options:any)=>({session:{user:{id:'fixture-owner'}},fixturePermissions:options})},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>repositories},'@/lib/emailSenderPolicy':{isPlainEmailSenderAddress:(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)},'@/lib/formEmailDelivery':{getEmailDeliveryConfig:()=>({provider:'smtp',from:'fixture@example.test',smtp:{host:'smtp.fixture.invalid',port:465,secure:true,user:'fixture@example.test',password:'synthetic-never-live-password'}}),sendEmailMessage:async(_config:any,message:any)=>{transport.push({siteId:message.siteId,deliveryId:message.requestId,recipientCount:1,unsubscribeHeader:Boolean(message.headers['List-Unsubscribe']),outcome:'synthetic-250'});return {statusCode:250};}}};
 mocks['@/lib/newsletterCampaignDelivery']=loadMediaFixture('../src/lib/newsletterCampaignDelivery.ts',mocks,{env});mocks['@/lib/newsletterCampaignRoutes']=loadMediaFixture('../src/lib/newsletterCampaignRoutes.ts',mocks,{env});
 const routes=['','/[campaignId]','/[campaignId]/send','/[campaignId]/schedule','/[campaignId]/cancel','/[campaignId]/process','/[campaignId]/feedback'].map(suffix=>({pattern:new RegExp('^/api/admin/sites/([^/]+)/newsletter/campaigns'+suffix.replace('[campaignId]','([^/]+)')+'$'),module:loadMediaFixture('../src/app/api/admin/sites/[siteId]/newsletter/campaigns'+suffix+'/route.ts',mocks,{env})}));
 try {
  symlinkSync(join(repositoryRoot,'node_modules'),join(scratch,'node_modules'),'dir');
  execFileSync(join(repositoryRoot,'node_modules/.bin/tailwindcss'),['-c','apps/admin/tailwind.config.js','-i','apps/admin/src/index.css','-o',join(scratch,'proof.css'),'--content','apps/admin/src/components/newsletter/**/*.{ts,tsx},apps/admin/scripts/newsletter-campaign-http-runtime-fixture.tsx'],{cwd:repositoryRoot,stdio:'pipe'});
  writeFileSync(join(scratch,'index.html'),`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Newsletter joined acceptance</title><link rel="stylesheet" href="/proof.css"></head><body><div id="root" data-site-id="${site.id}" data-form-id="${form.id}"></div><script type="module" src="/@fs/${repositoryRoot}/apps/admin/scripts/newsletter-campaign-http-runtime-fixture.tsx"></script></body></html>`);
  server=await createViteServer({configFile:false,root:scratch,plugins:[react(),{name:'actual-newsletter-handlers',configureServer(vite:any){vite.middlewares.use(async(req:any,res:any,next:any)=>{
   const url=new URL(req.url,origin);if(url.pathname==='/fixture/stop'&&req.method==='POST'){res.end('Fixture stopping');stopFixture();return;}const route=routes.find(route=>route.pattern.test(url.pathname));if(!route)return next();
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString(),matched=url.pathname.match(route.pattern)!;
   try {if(!route.module[req.method]){res.statusCode=405;return res.end();}const response=await route.module[req.method](new NextRequest(url,{method:req.method,headers:req.headers,...(body?{body}:{})}),{params:Promise.resolve({siteId:decodeURIComponent(matched[1]),campaignId:matched[2]?decodeURIComponent(matched[2]):undefined})});
    requests.push({method:req.method,path:url.pathname,status:response.status});writeFileSync(proofPath,JSON.stringify({boundary:'Actual React desk/client -> actual route handlers -> owned migrated PostgreSQL -> synthetic SMTP only. Admin authentication is a synthetic fixture context.',requests,transport},null,2),{mode:0o600});res.statusCode=response.status;response.headers.forEach((v:string,k:string)=>res.setHeader(k,v));return res.end(Buffer.from(await response.arrayBuffer()));
   }catch(error){res.statusCode=500;res.setHeader('content-type','application/json');return res.end(JSON.stringify({success:false,error:{message:'Fixture handler failed.'}}));}
  });}}],resolve:{alias:{'@':join(repositoryRoot,'apps/admin/src')},dedupe:['react','react-dom']},define:{'import.meta.env.VITE_BACKY_ADMIN_API_BASE_URL':JSON.stringify(origin+'/api/admin')},server:{host:'127.0.0.1',port:5242,strictPort:true,fs:{allow:[repositoryRoot,scratch]}}});
  await server.listen();console.log(JSON.stringify({ready:true,url:origin,proofPath,siteId:site.id,formId:form.id}));process.once('SIGTERM',stopFixture);process.once('SIGINT',stopFixture);await stopped;
 }finally{await server?.close();rmSync(scratch,{recursive:true,force:true});}
}finally{await cleanup();}
