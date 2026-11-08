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
import * as schema from '../src/schema/index.ts';
import { createDatabaseRepositories } from '../src/repositories/factory.ts';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const Ajv2020=createRequire(new URL('../../../apps/public/package.json',import.meta.url))('ajv/dist/2020.js').default;
import { loadMediaFixture } from '../../../apps/public/scripts/media-storage-recovery-fixture.mts';

if (process.argv.length > 2) throw new Error('This test accepts no database target arguments.');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binaryDirectory = process.env.BACKY_POSTGRES_BIN_DIR || '/opt/homebrew/bin';
for (const binary of ['initdb', 'pg_ctl', 'psql', 'postgres']) assert(existsSync(join(binaryDirectory, binary)), `Missing local PostgreSQL binary: ${binary}`);
const clusterRoot = mkdtempSync('/tmp/backy-newsletter-postgres-');
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
  assert(/^\/tmp\/backy-newsletter-postgres-[A-Za-z0-9]+$/.test(clusterRoot));
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

 const sqlA=connection('newsletter-a'),sqlB=connection('newsletter-b'),owner=connection('newsletter-owner'),a=bundle(sqlA),b=bundle(sqlB);
 const team=(await a.teams.create({name:'Synthetic team',slug:'newsletter-team',ownerId:null})).item;
 const site=(await a.sites.create({teamId:team.id,name:'Synthetic newsletter',slug:'newsletter-site',status:'draft'})).item,foreign=(await a.sites.create({teamId:team.id,name:'Foreign',slug:'newsletter-foreign',status:'draft'})).item;
 const form=(await a.forms.create({siteId:site.id,name:'newsletter',fields:[],isActive:true})).item;
 const secondForm=(await a.forms.create({siteId:site.id,name:'newsletter-second',fields:[],isActive:true})).item;
 const createContact=async(email:string,changes:any={},fid=form.id,sid=site.id)=>(await a.forms.createContact({siteId:sid,formId:fid,name:null,email,phone:null,notes:null,status:'new',sourceValues:{},newsletterSubscriptionStatus:'subscribed',newsletterConsent:true,newsletterConsentText:'Synthetic explicit reader consent',newsletterSubscribedAt:new Date().toISOString(),...changes})).item;
 await createContact('reader@example.test');await createContact('reader@example.test',{},secondForm.id);
 await createContact('no-consent@example.test',{newsletterConsent:null});await createContact('missing-evidence@example.test',{newsletterConsentText:null});
 await createContact('<wrapped@example.test>');await createContact('trailing@example.test@');await createContact('bad@example..test');await createContact('x'.repeat(65)+'@example.test');
 await createContact('archived@example.test',{status:'archived'});await createContact('pending@example.test',{newsletterSubscriptionStatus:'pending'});await createContact('bounced@example.test',{newsletterSubscriptionStatus:'bounced'});
 await createContact('duplicate-held@example.test');await createContact('duplicate-held@example.test',{newsletterSubscriptionStatus:'unsubscribed'},secondForm.id);
 await createContact(' Reader@example.test ',{newsletterConsent:false},secondForm.id); // conflicting evidence must defeat positive duplicate
 let checks=0;
 const draft={subject:'Synthetic issue',text:'Local fixture only. No external email.',formId:form.id},repo=a.newsletterCampaigns!,other=b.newsletterCampaigns!;
 let campaign=await repo.create(site.id,draft,'campaign-key-first',null);assert(!('requestKey' in campaign));assert(!('requestHash' in campaign));checks+=2;
 assert.equal((await other.create(site.id,draft,'campaign-key-first',null)).id,campaign.id);await assert.rejects(repo.create(site.id,{...draft,text:'Changed'},'campaign-key-first',null),(e:any)=>e.code==='NEWSLETTER_REQUEST_CONFLICT');checks+=2;
 await assert.rejects(repo.queue(site.id,campaign.id,1,null,40),(e:any)=>e.code==='NEWSLETTER_NO_RECIPIENTS');checks++;
 await owner`DELETE FROM form_contacts WHERE site_id=${site.id} AND newsletter_consent=false`;
 campaign=await repo.queue(site.id,campaign.id,1,null,40);assert.equal(campaign.recipientCount,1);checks++;
 await assert.rejects(other.queue(site.id,campaign.id,campaign.version,null,40),(e:any)=>e.code==='NEWSLETTER_ALREADY_QUEUED');await assert.rejects(repo.update(site.id,campaign.id,draft,campaign.version),(e:any)=>e.code==='NEWSLETTER_DRAFT_LOCKED');checks+=2;
 assert.equal(await repo.detail(foreign.id,campaign.id),null);await assert.rejects(repo.cancel(foreign.id,campaign.id,campaign.version),(e:any)=>e.code==='NEWSLETTER_CAMPAIGN_NOT_FOUND');checks+=2;
 const claimed=await Promise.all([repo.claim(site.id,campaign.id,40),other.claim(site.id,campaign.id,40)]);assert.equal(claimed.filter(Boolean).length,1);checks++;
 const delivery=claimed.find(Boolean)!.delivery;await repo.settle(site.id,delivery.id,'accepted');assert.equal((await repo.detail(site.id,campaign.id))!.campaign.state,'completed');checks++;
 await assert.rejects(repo.settle(site.id,delivery.id,'accepted'),(e:any)=>e.code==='NEWSLETTER_OUTCOME_CONFLICT');checks++;
 await repo.feedback(site.id,delivery.id,'bounced','synthetic-bounce');await other.feedback(site.id,delivery.id,'bounced','synthetic-bounce');await repo.feedback(site.id,delivery.id,'delivered','late-delivered');assert.equal((await repo.detail(site.id,campaign.id))!.deliveries[0].state,'bounced');checks++;
 await repo.feedback(site.id,delivery.id,'complained','synthetic-complaint');await repo.suppressByDelivery(site.id,delivery.id,'unsubscribed','synthetic-unsub');assert.equal((await repo.detail(site.id,campaign.id))!.deliveries[0].state,'complained');const held=await owner`SELECT reason FROM newsletter_suppressions WHERE site_id=${site.id}`;assert.equal(held[0].reason,'complained');checks+=2;
 await assert.rejects(repo.feedback(site.id,delivery.id,'delivered','synthetic-bounce'),(e:any)=>e.code==='NEWSLETTER_EVENT_CONFLICT');checks++;
 await owner`DELETE FROM form_contacts WHERE site_id=${site.id} AND lower(trim(email))='reader@example.test'`;await createContact('reader@example.test');
 let suppressed=await repo.create(site.id,draft,'campaign-key-suppressed',null);await assert.rejects(repo.queue(site.id,suppressed.id,1,null,40),(e:any)=>e.code==='NEWSLETTER_NO_RECIPIENTS');checks++;
 const newContact=await createContact('scheduled@example.test'),future=new Date(Date.now()+60000).toISOString();
 let scheduled=await repo.create(site.id,draft,'campaign-key-schedule',null);scheduled=await repo.queue(site.id,scheduled.id,1,future,40);assert.equal(await repo.claim(site.id,scheduled.id,40),null);assert(!(await repo.due(10)).find(x=>x.id===scheduled.id));checks+=2;
 scheduled=await repo.cancel(site.id,scheduled.id,scheduled.version);assert.equal((await repo.detail(site.id,scheduled.id))!.deliveries[0].state,'cancelled');checks++;
 let rechecked=await repo.create(site.id,draft,'campaign-key-rechecked',null);rechecked=await repo.queue(site.id,rechecked.id,1,null,40);await a.forms.updateContact(site.id,newContact.id,{newsletterSubscriptionStatus:'unsubscribed'});assert.equal(await repo.claim(site.id,rechecked.id,40),null);assert.equal((await repo.detail(site.id,rechecked.id))!.deliveries[0].state,'suppressed');checks+=2;
 await a.forms.updateContact(site.id,newContact.id,{newsletterSubscriptionStatus:'subscribed'});
 let interrupted=await repo.create(site.id,draft,'campaign-key-interrupted',null);interrupted=await repo.queue(site.id,interrupted.id,1,null,40);await owner`UPDATE newsletter_dispatch_gate SET next_at=now()-interval '1 minute'`;const crash=await repo.claim(site.id,interrupted.id,40);assert(crash);await owner`UPDATE newsletter_deliveries SET updated_at=now()-interval '11 minutes' WHERE id=${crash.delivery.id}`;assert.equal(await repo.claim(site.id,interrupted.id,40),null);assert.equal((await repo.detail(site.id,interrupted.id))!.deliveries[0].state,'uncertain');checks+=3;
 let limited=await repo.create(site.id,draft,'campaign-key-limited',null);limited=await repo.queue(site.id,limited.id,1,null,40);await owner`UPDATE newsletter_dispatch_gate SET count=40,next_at=now()-interval '1 minute'`;assert.equal(await repo.claim(site.id,limited.id,40),null);checks++;
 await owner`UPDATE newsletter_dispatch_gate SET day='2000-01-01',count=40,next_at=now()-interval '1 minute'`;const reset=await repo.claim(site.id,limited.id,40);assert(reset);await repo.settle(site.id,reset.delivery.id,'uncertain');const budget=await owner`SELECT count FROM newsletter_dispatch_gate`;assert.equal(budget[0].count,1);checks+=2;

 // Global pacing and budget are atomic across distinct sites, not merely one campaign lock.
 const foreignForm=(await a.forms.create({siteId:foreign.id,name:'newsletter',fields:[],isActive:true})).item;
 await createContact('foreign-reader@example.test',{},foreignForm.id,foreign.id);
 let mainBudget=await repo.create(site.id,draft,'campaign-budget-main',null);mainBudget=await repo.queue(site.id,mainBudget.id,1,null,40);
 let foreignBudget=await repo.create(foreign.id,{...draft,formId:foreignForm.id},'campaign-budget-foreign',null);foreignBudget=await repo.queue(foreign.id,foreignBudget.id,1,null,40);
 await owner`UPDATE newsletter_dispatch_gate SET day=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD'),count=39,next_at=now()-interval '1 minute'`;
 const raced=await Promise.all([repo.claim(site.id,mainBudget.id,40),other.claim(foreign.id,foreignBudget.id,40)]);assert.equal(raced.filter(Boolean).length,1);const racedBudget=await owner`SELECT count FROM newsletter_dispatch_gate`;assert.equal(racedBudget[0].count,40);checks+=2;
 for(const item of raced.filter(Boolean))await repo.settle(item!.campaign.siteId,item!.delivery.id,'accepted');
 await owner`UPDATE newsletter_dispatch_gate SET count=0,next_at=now()-interval '1 minute'`;
 const largeForm=(await a.forms.create({siteId:site.id,name:'newsletter-large',fields:[],isActive:true})).item;
 for(let i=0;i<101;i++)await createContact('large-'+i+'@example.test',{},largeForm.id);
 const large=await repo.create(site.id,{...draft,formId:largeForm.id},'campaign-large-refusal',null);
 await assert.rejects(repo.queue(site.id,large.id,1,null,100),(e:any)=>e.code==='NEWSLETTER_AUDIENCE_TOO_LARGE');assert.equal((await repo.detail(site.id,large.id))!.deliveries.length,0);checks+=2;
 const inflightForm=(await a.forms.create({siteId:site.id,name:'newsletter-inflight',fields:[],isActive:true})).item;
 await createContact('inflight-one@example.test',{},inflightForm.id);await createContact('inflight-two@example.test',{},inflightForm.id);
 let inflight=await repo.create(site.id,{...draft,formId:inflightForm.id},'campaign-inflight-cancel',null);inflight=await repo.queue(site.id,inflight.id,1,null,40);
 await owner`UPDATE newsletter_dispatch_gate SET next_at=now()-interval '1 minute'`;
 const admitted=await repo.claim(site.id,inflight.id,40);assert(admitted);inflight=await repo.cancel(site.id,inflight.id,admitted.campaign.version);
 await repo.settle(site.id,admitted.delivery.id,'accepted');const cancelledDetail=(await repo.detail(site.id,inflight.id))!;assert.equal(cancelledDetail.campaign.state,'cancelled');assert.equal(cancelledDetail.counts.cancelled,1);assert.equal(cancelledDetail.counts.accepted,1);checks+=4;
 await owner`UPDATE newsletter_dispatch_gate SET next_at=now()-interval '1 minute'`;
 for(const role of ['anon','authenticated'])for(const table of ['newsletter_campaigns','newsletter_deliveries','newsletter_suppressions','newsletter_feedback_events','newsletter_dispatch_gate']){const privileges=await owner`SELECT has_table_privilege(${role},${'public.'+table},'SELECT') AS allowed`;assert.equal(privileges[0].allowed,false);checks++;}
 // Actual HTTP handlers with actual durable repo and synthetic transport; every env value is isolated.
 let sends=0,denied=0,transportThrows=false,transportStatus=250,lastMessage:any=null;
 const env:any={BACKY_NEWSLETTER_SITE_POLICY:JSON.stringify({[site.id]:{enabled:true,providerApproved:true,oneClickDkimVerified:true,postalAddress:'Synthetic fixture address',publicBaseUrl:'https://fixture.example.test',maxRecipients:40}}),BACKY_NEWSLETTER_DAILY_LIMIT:'40',BACKY_NEWSLETTER_UNSUBSCRIBE_SECRET:'synthetic-secret-with-more-than-32-chars',BACKY_NEWSLETTER_WORKER_SECRET:'synthetic-worker-key-with-more-than-32-chars',BACKY_NEWSLETTER_FEEDBACK_SECRET:'synthetic-feedback-key-with-more-than-32-chars'};
 const config={provider:'smtp',from:'fixture@example.test',smtp:{host:'smtp.fixture.invalid',port:465,secure:true,user:'fixture@example.test',password:'synthetic-placeholder'}};
 const mocks:any={'@/lib/adminAccess':{requireAdminAccess:async(_r:any,_id:any,options:any)=>denied?NextResponse.json({success:false,error:{code:'DENIED'}},{status:denied}):{session:{user:{id:'fixture-owner'}}}},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>a},'@/lib/emailSenderPolicy':{isPlainEmailSenderAddress:(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)},'@/lib/formEmailDelivery':{getEmailDeliveryConfig:()=>config,sendEmailMessage:async(_config:any,message:any)=>{sends++;lastMessage=message;if(transportThrows)throw Error('private synthetic provider response');return {statusCode:transportStatus};}}};
 mocks['@/lib/newsletterCampaignDelivery']=loadMediaFixture('../src/lib/newsletterCampaignDelivery.ts',mocks,{env});mocks['@/lib/newsletterCampaignRoutes']=loadMediaFixture('../src/lib/newsletterCampaignRoutes.ts',mocks,{env});
 const load=(path:string)=>loadMediaFixture('../src/app/api/'+path,mocks,{env});
 const collection=load('admin/sites/[siteId]/newsletter/campaigns/route.ts'),detailRoute=load('admin/sites/[siteId]/newsletter/campaigns/[campaignId]/route.ts'),sendRoute=load('admin/sites/[siteId]/newsletter/campaigns/[campaignId]/send/route.ts'),processRoute=load('admin/sites/[siteId]/newsletter/campaigns/[campaignId]/process/route.ts'),unsubscribe=load('sites/[siteId]/newsletter/unsubscribe/route.ts'),feedback=load('sites/[siteId]/newsletter/feedback/route.ts'),worker=load('internal/newsletter/process/route.ts');
 const call=(route:any,method:string,body:any={},id='',sid=site.slug,extra:any={})=>route[method](new NextRequest('http://fixture.invalid/api/admin/sites/'+sid+'/newsletter/campaigns/'+id,{method,headers:{'content-type':'application/json','idempotency-key':'campaign-handler-key',...extra},...(method!=='GET'?{body:JSON.stringify(body)}:{})}),{params:Promise.resolve({siteId:sid,campaignId:id})});
 let response=await call(collection,'POST',draft),json=await response.json();assert.equal(response.status,201,JSON.stringify(json));const handlerCampaign=json.data.campaign;checks++;
 const original=await call(collection,'POST',draft);assert.equal((await original.json()).data.campaign.id,handlerCampaign.id);checks++;
 response=await call(sendRoute,'POST',{version:handlerCampaign.version},handlerCampaign.id);assert.equal(response.status,202);assert.equal(sends,0);checks+=2;
 for(denied of [401,403]){response=await call(processRoute,'POST',{},handlerCampaign.id);assert.equal(response.status,denied);assert.equal(sends,0);checks+=2;}denied=0;
 env.BACKY_NEWSLETTER_SITE_POLICY='{}';response=await call(processRoute,'POST',{},handlerCampaign.id);assert.equal(response.status,503);assert.equal(sends,0);checks+=2;
 env.BACKY_NEWSLETTER_SITE_POLICY=JSON.stringify({[site.id]:{enabled:true,providerApproved:true,oneClickDkimVerified:true,postalAddress:'Synthetic fixture address',publicBaseUrl:'https://fixture.example.test',maxRecipients:40}});
 await owner`UPDATE newsletter_dispatch_gate SET next_at=now()-interval '1 minute'`;
 response=await call(processRoute,'POST',{},handlerCampaign.id);json=await response.json();assert.equal(json.data.state,'accepted');assert.equal(sends,1);assert(lastMessage.text.includes('Unsubscribe: https://fixture.example.test/api/sites/'));assert.equal(lastMessage.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');checks+=4;
 await call(processRoute,'POST',{},handlerCampaign.id);assert.equal(sends,1);checks++;
 const token=new URL(lastMessage.headers['List-Unsubscribe'].slice(1,-1)).searchParams.get('token')!;
 response=await unsubscribe.GET(new NextRequest('https://fixture.example.test?token='+encodeURIComponent(token)),{params:Promise.resolve({siteId:site.id})});assert.equal(response.status,200);assert(!(await owner`SELECT email FROM newsletter_suppressions WHERE site_id=${site.id}`).some(r=>r.email==='scheduled@example.test'));checks+=2;
 response=await unsubscribe.POST(new NextRequest('https://fixture.example.test?token='+encodeURIComponent(token),{method:'POST',body:'List-Unsubscribe=One-Click'}),{params:Promise.resolve({siteId:site.id})});assert.equal(response.status,200);response=await unsubscribe.POST(new NextRequest('https://fixture.example.test?token='+encodeURIComponent(token),{method:'POST',body:'List-Unsubscribe=One-Click'}),{params:Promise.resolve({siteId:site.id})});assert.equal(response.status,200);checks+=2;
 response=await unsubscribe.POST(new NextRequest('https://fixture.example.test?token='+encodeURIComponent(token),{method:'POST',body:''}),{params:Promise.resolve({siteId:foreign.id})});assert.equal(response.status,400);checks++;
 const handlerDelivery=json.data.deliveryId,raw=JSON.stringify({siteId:site.id,deliveryId:handlerDelivery,eventId:'synthetic-bridge-event',state:'complained'}),timestamp=String(Math.floor(Date.now()/1000)),signature='sha256='+createHmac('sha256',env.BACKY_NEWSLETTER_FEEDBACK_SECRET).update(timestamp+'.'+raw).digest('hex');
 const feedbackRequest=(signatureValue=signature,time=timestamp)=>new NextRequest('http://fixture.invalid',{method:'POST',body:raw,headers:{'x-backy-feedback-timestamp':time,'x-backy-feedback-signature':signatureValue}});
 assert.equal((await feedback.POST(feedbackRequest('sha256='+'0'.repeat(64)),{params:Promise.resolve({siteId:site.id})})).status,401);assert.equal((await feedback.POST(feedbackRequest(signature,'1000000000'),{params:Promise.resolve({siteId:site.id})})).status,401);checks+=2;
 assert.equal((await feedback.POST(feedbackRequest(),{params:Promise.resolve({siteId:site.id})})).status,200);assert.equal((await feedback.POST(feedbackRequest(),{params:Promise.resolve({siteId:site.id})})).status,200);assert.equal((await repo.detail(site.id,handlerCampaign.id))!.deliveries[0].state,'complained');checks+=3;
 assert.equal((await worker.POST(new NextRequest('http://fixture.invalid',{method:'POST'}))).status,401);assert.equal((await worker.POST(new NextRequest('http://fixture.invalid',{method:'POST',headers:{authorization:'Bearer '+env.BACKY_NEWSLETTER_WORKER_SECRET}}))).status,200);checks+=2;
 // Provider uncertainty remains held and is not retried by repeated invocations.
 await createContact('uncertain@example.test');let uncertain=await repo.create(site.id,draft,'campaign-handler-uncertain',null);uncertain=await repo.queue(site.id,uncertain.id,1,null,40);await owner`UPDATE newsletter_dispatch_gate SET next_at=now()-interval '1 minute'`;transportThrows=true;
 response=await call(processRoute,'POST',{},uncertain.id);json=await response.json();assert.equal(json.data.state,'uncertain');await call(processRoute,'POST',{},uncertain.id);assert.equal(sends,2);assert(!JSON.stringify(json).includes('private'));checks+=3;
 const read=await call(detailRoute,'GET',{},uncertain.id);assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'no-store');checks+=2;

 // Exact source provenance + real contact fence blocks provider execution after selected-member erasure.
 const privacyForm=(await a.forms.create({siteId:site.id,name:'newsletter-privacy',fields:[],isActive:true})).item;
 const member=await a.visitorAccounts!.enroll(site.id,{issuer:'https://identity.fixture.invalid',subject:'synthetic-newsletter-reader',email:'privacy-fenced@example.test'},'Synthetic reader');
 const source=(await a.forms.createSubmission({siteId:site.id,formId:privacyForm.id,values:{},status:'pending',visitorMemberId:member.id})).item;
 const contact=await createContact('privacy-fenced@example.test',{sourceSubmissionId:source.id},privacyForm.id);
 const provenance=await owner`SELECT member_id FROM form_contact_contributors WHERE site_id=${site.id} AND contact_id=${contact.id} AND submission_id=${source.id}`;assert.equal(provenance[0]?.member_id,member.id);checks++;
 let fenced=await repo.create(site.id,{...draft,formId:privacyForm.id},'campaign-handler-fenced',null);fenced=await repo.queue(site.id,fenced.id,1,null,40);
 await owner`INSERT INTO visitor_privacy_fences(site_id,member_id) VALUES (${site.id},${member.id})`;
 await owner`UPDATE newsletter_dispatch_gate SET next_at=now()-interval '1 minute'`;
 const beforeFence=sends;response=await call(processRoute,'POST',{},fenced.id);json=await response.json();assert.equal(json.data.state,'failed');assert.equal(sends,beforeFence);assert.equal((await repo.detail(site.id,fenced.id))!.deliveries[0].errorCode,'VISITOR_PRIVACY_FENCED');await call(processRoute,'POST',{},fenced.id);assert.equal(sends,beforeFence);checks+=4;
 const nativeFollowup=a.forms.withContactFollowup;a.forms.withContactFollowup=undefined;response=await call(processRoute,'POST',{},fenced.id);assert.equal(response.status,503);assert.equal(sends,beforeFence);a.forms.withContactFollowup=nativeFollowup;checks+=2;
 // Schema parity: actual DTOs satisfy advertised shapes and no secret values reach readiness.
 const openapi=loadMediaFixture('../src/lib/newsletterCampaignOpenApi.ts',{}),ajv=new Ajv2020({strict:false,validateFormats:false});
 for(const [name,value] of Object.entries(openapi.newsletterCampaignSchemas))ajv.addSchema(value,'#/components/schemas/'+name);
 assert(ajv.getSchema('#/components/schemas/NewsletterCampaign')!(handlerCampaign));assert(ajv.getSchema('#/components/schemas/NewsletterCampaignEnvelope')!(await read.json()));assert(!JSON.stringify(mocks['@/lib/newsletterCampaignDelivery'].newsletterCampaignConfig(site.id).readiness).includes('synthetic-placeholder'));checks+=3;
 assert.equal(openapi.newsletterCampaignPaths(site.id)['/api/admin/sites/'+site.id+'/newsletter/campaigns'].post.operationId,'createAdminNewsletterCampaign');checks++;
 console.log(`Newsletter campaign fixture passed ${checks} assertions; actual handlers + owned PostgreSQL + synthetic SMTP only (${sends} fixture sends, no network provider requests).`);
} finally { await cleanup(); }
