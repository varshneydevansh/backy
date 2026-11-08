import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import * as contractModule from '../src/lib/siteMailboxManagementOpenApi.ts';
const { siteMailboxManagementSchemas, siteMailboxManagementPaths } = (contractModule as any).default || contractModule;
const contract = new Ajv2020({ strict: false, validateFormats: false });
contract.addSchema({ components: { schemas: siteMailboxManagementSchemas } }, 'mailbox-management');
const operations = siteMailboxManagementPaths('{siteId}');
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NextRequest } from 'next/server';
import { fixture } from './admin-access-test-fixtures.mts';
import { loadMediaFixture } from './media-storage-recovery-fixture.mts';
const password = 'SyntheticPass123!', token = 'synthetic-account-token-never-live';
const binding = { id: 'email-domain', siteId: 'site-fixture', domain: 'example.test', orderId: 'OR-fixture', dashboardUrl: 'https://hpanel.hostinger.com/emails/example.test' };
const mailboxBinding = { id: 'existing', siteId: 'site-fixture', address: 'existing@example.test', mailboxId: 'AC-fixture' };
const meta = (total: number) => ({ current_page: 1, per_page: 100, total });
const order = { id: 'OR-fixture', domain: { id: 'DO-fixture', name: 'example.test' }, status: 'active', is_trial: false, seats: 2, has_pending_upgrade: false, plan: { name: 'hostinger_free' } };
const plan = { name: 'hostinger_free', domain: { mailbox_quota: 2, alias_quota: 5 }, mailbox: { alias_quota: 3 } };
const mailbox = { id: 'AC-fixture', address: 'existing@example.test', status: 'active' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let checks = 0;
for (const demo of [true, false]) {
 const directory = mkdtempSync(join(tmpdir(), 'backy-mail-management-'));
 const env: Record<string,string> = { BACKY_HOSTINGER_ACCOUNT_API_TOKEN: token, BACKY_HOSTINGER_MAIL_MANAGEMENT_BINDINGS: JSON.stringify([binding, { ...binding, id: 'other-domain', siteId: 'other-site', domain: 'other.test', orderId: 'OR-other', dashboardUrl: 'https://hpanel.hostinger.com/emails/other.test' }]), BACKY_HOSTINGER_MAILBOX_BINDINGS: JSON.stringify([mailboxBinding]) };
 const f = fixture({ demo, actorRole: 'owner', env }), calls: { url: string; init: RequestInit }[] = [], responses: (Response|Error)[] = [];
 const globals = { setTimeout, clearTimeout, AbortSignal, TextDecoder, fetch: async (input: unknown, init: RequestInit = {}) => { assert(String(input).startsWith('https://developers.hostinger.com/api/mail/v1/')); calls.push({ url: String(input), init }); const response = responses.shift(); assert(response, 'Unexpected synthetic management request'); if (response instanceof Error) throw response; return response; } };
 const coreSend = loadMediaFixture('../../../packages/core/src/site-mailbox.ts',{}, {env},globals), coreManagement = loadMediaFixture('../../../packages/core/src/site-mailbox-management.ts',{'@/lib/site-mailbox':coreSend},{env},globals);
 const mocks:Record<string,any>={...f.mocks,'@backy-cms/core':{...coreSend,...coreManagement},'@/lib/hostingerMailManagement':loadMediaFixture('../src/lib/hostingerMailManagement.ts',{}, {env},globals),'@/lib/emailSenderPolicy':loadMediaFixture('../src/lib/emailSenderPolicy.ts',{}, {env})};
 mocks['@/lib/siteMailboxes']=loadMediaFixture('../src/lib/siteMailboxes.ts',mocks,{env},globals);
 const journal=loadMediaFixture('../src/lib/demoMailboxManagementJournal.ts',mocks,{env,cwd:()=>directory},globals);mocks['@/lib/demoMailboxManagementJournal']=journal;if(!demo)(f.repositories as any).mailboxManagement=journal.demoMailboxManagementJournal;
 const helper=loadMediaFixture('../src/lib/siteMailboxManagement.ts',mocks,{env},globals);mocks['@/lib/siteMailboxManagement']=helper;
 const route=loadMediaFixture('../src/app/api/admin/sites/[siteId]/settings/mailbox-management/[managementBindingId]/mailboxes/route.ts',mocks,{env},globals);
 let counter=0;const payload=(patch:Record<string,unknown>={})=>({idempotencyKey:`synthetic-manage-${++counter}`,localPart:'newbox',password,...patch});
 const snapshot=(patch:Record<string,unknown>={})=>responses.push(json({data:[{...order,...patch}],meta:meta(1)}),json(plan),json({data:[mailbox],meta:meta(1)}),json({data:[],meta:meta(0)}));
 async function call(operation='mailboxes',input:unknown=payload(),options:{headers?:Record<string,string>;siteId?:string;bindingId?:string;raw?:string;query?:string}={}){
  const method=operation==='handoff'||operation==='attempts'?'GET':'POST';
  const request=new NextRequest(`http://fixture.invalid/api/admin/sites/site-fixture/settings/mailbox-management${operation==='handoff'?'':`/${options.bindingId||binding.id}/${operation}`}${options.query||''}`,{method,headers:{cookie:'backy_admin_session=synthetic',origin:'http://fixture.invalid','content-type':'application/json',...options.headers},...(method==='POST'?{body:options.raw??JSON.stringify(operation==='inspect'?{}:input)}:{})});
  const context={params:Promise.resolve({siteId:options.siteId||f.site.id,managementBindingId:options.bindingId||binding.id})};
  const response=operation==='handoff'?await helper.siteMailboxManagementRoute(request,context):operation==='mailboxes'?await route.POST(request,context):await helper.siteMailboxManagementActionRoute(request,context,operation);
  const body=await response.json();
  if(response.status===200){const path='/api/admin/sites/{siteId}/settings/mailbox-management'+(operation==='handoff'?'':`/{managementBindingId}/${operation}`),ref=operations[path][method.toLowerCase()].responses['200'].content['application/json'].schema.$ref,validate=contract.compile({$ref:'mailbox-management'+ref});assert(validate(body),contract.errorsText(validate.errors));}
  assert(!JSON.stringify(body).includes(password));assert(!JSON.stringify(body).includes(token));assert(!JSON.stringify(body).includes('OR-fixture'));assert(!JSON.stringify(body).includes('AC-fixture'));return{response,body};
 }
 const deny=async(input:unknown,status:number,options:Parameters<typeof call>[2]={})=>{const before=calls.length,result=await call('mailboxes',input,options);assert.equal(result.response.status,status,JSON.stringify(result.body));assert.equal(calls.length,before);checks++;};
 try{
  await deny(payload(),401,{headers:{cookie:''}});await deny(payload(),403,{headers:{authorization:'Bearer denied'}});await deny(payload(),403,{headers:{origin:'https://foreign.invalid'}});f.actor.role='admin';await deny(payload(),403);f.actor.role='owner';
  f.mocks['@/lib/backyStore'].updateAdminUserPermissionOverrides(f.actor.id,{'settings.configure':'deny'});await deny(payload(),403);f.settings().auth.userPermissionOverrides=[];
  await deny(payload(),404,{bindingId:'other-domain'});await deny(payload(),404,{siteId:'missing'});await deny(payload(),400,{query:'?orderId=OR-other'});
  for(const input of[payload({localPart:'bad..name'}),payload({password:'bad'}),payload({orderId:'OR-other'}),payload({apiToken:'rejected'})])await deny(input,400);
  await deny({},400,{raw:'{"idempotencyKey":"synthetic-duplicate","localPart":"newbox","password":"SyntheticPass123!","pass\\u0077ord":"changed"}'});
  let result=await call('handoff');assert.equal(result.body.data.nativeProvisioning,true);assert.equal(result.body.data.managementAuthorityVerified,false);assert.equal(result.body.data.domains.length,1);checks++;
  delete env.BACKY_HOSTINGER_ACCOUNT_API_TOKEN;result=await call('handoff');assert.equal(result.body.data.nativeProvisioning,false);await deny(payload(),503);env.BACKY_HOSTINGER_ACCOUNT_API_TOKEN=token;checks++;
  snapshot();result=await call('inspect');assert.equal(result.body.data.authorityVerified,true);assert.equal(result.body.data.remainingMailboxes,1);assert.equal(result.body.data.aliasTargets[0].id,'existing');checks++;
  const create=payload();snapshot();responses.push(json({id:'AC-created',address:'newbox@example.test',status:'active'},201));result=await call('mailboxes',create);assert.equal(result.body.data.providerCreated,true);assert.equal(result.body.data.attempt.state,'accepted');assert.equal(result.body.data.inboxBindingCreated,false);assert.equal(calls.at(-1)!.url,'https://developers.hostinger.com/api/mail/v1/orders/OR-fixture/mailboxes');assert.deepEqual(JSON.parse(calls.at(-1)!.init.body as string),{local_part:'newbox',password});checks++;
  const before=calls.length;result=await call('mailboxes',{...create,password:'DifferentPass123!'});assert.equal(result.body.data.replayed,true);assert.equal(calls.length,before);await deny({...create,localPart:'different'},409);checks++;
  const alias={idempotencyKey:'synthetic-alias-key',localPart:'info',targetBindingId:'existing'};snapshot();responses.push(json({id:'AA-created',address:'info@example.test',is_active:true,mailbox:{id:mailbox.id,address:mailbox.address}},201));result=await call('aliases',alias);assert.equal(result.body.data.attempt.state,'accepted');assert.equal(calls.at(-1)!.url,'https://developers.hostinger.com/api/mail/v1/mailboxes/AC-fixture/aliases');assert.deepEqual(JSON.parse(calls.at(-1)!.init.body as string),{local_part:'info'});checks++;
  const beforeTarget=calls.length;result=await call('aliases',{...alias,idempotencyKey:'synthetic-foreign-target',targetBindingId:'foreign'});assert.equal(result.response.status,404);assert.equal(calls.length,beforeTarget);checks++;
  snapshot({seats:1});result=await call('mailboxes',payload());assert.equal(result.body.data.attempt.state,'rejected');assert(!calls.at(-1)!.init.method?.includes('POST'));checks++;
  responses.push(json({data:[{...order,plan:{name:'hostinger_paid'}}],meta:meta(1)}));result=await call('mailboxes',payload());assert.equal(result.body.data.attempt.state,'rejected');assert.equal(result.body.data.attempt.statusCode,409);checks++;
  responses.push(json({data:[{...order,domain:{name:'foreign.test'}}],meta:meta(1)}));result=await call('mailboxes',payload());assert.equal(result.body.data.attempt.state,'rejected');checks++;
  const unknown=payload();snapshot();responses.push(Error('sensitive upstream secret'));result=await call('mailboxes',unknown);assert.equal(result.body.data.attempt.state,'uncertain');assert.equal(result.body.data.automaticRetry,false);const beforeUnknown=calls.length;await call('mailboxes',unknown);assert.equal(calls.length,beforeUnknown);checks++;
  snapshot();responses.push(json({error:password},422));result=await call('mailboxes',payload());assert.equal(result.body.data.attempt.state,'rejected');checks++;
  snapshot();responses.push(json({id:'wrong',address:'foreign.test',status:'active'},201));result=await call('mailboxes',payload());assert.equal(result.body.data.attempt.state,'uncertain');checks++;
  result=await call('attempts');assert(result.body.data.attempts.length>=8);assert(!JSON.stringify(result.body).includes('fingerprint'));const persisted=readFileSync(join(directory,'data/backy/private-mailbox-management/attempts.json'),'utf8');assert(!persisted.includes(password));assert(!persisted.includes('DifferentPass123!'));assert(!persisted.includes(token));checks++;
  const same={siteId:f.site.id,bindingId:binding.id,idempotencyKey:'synthetic-concurrent-management',fingerprint:'a'.repeat(64),operation:'alias',address:'parallel@example.test',targetBindingId:'existing'};const concurrent=await Promise.all([journal.demoMailboxManagementJournal.admit(same),journal.demoMailboxManagementJournal.admit(same)]);assert.equal(concurrent.filter(row=>row.admitted).length,1);checks++;
  assert.equal(responses.length,0);assert(calls.every(row=>row.init.cache==='no-store'&&row.init.redirect==='error'));assert(!calls.some(row=>/purchase|upgrade|billing|password|api-tokens/.test(row.url)));checks++;
 }finally{rmSync(directory,{recursive:true,force:true});}
}
console.log(JSON.stringify({ok:true,checks,boundary:'Actual Owner handlers, account API adapter and durable scoped private journal; synthetic current free-plan fixtures only. No real provider calls, provisioning, credentials, purchases or DNS mutations.'}));
