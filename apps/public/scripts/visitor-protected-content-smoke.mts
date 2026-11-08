import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import { memoryVisitorFixture } from './visitor-auth-smoke.mts';
const require = createRequire(import.meta.url);
function load(relative: string, mocks: Record<string, any> = {}) {
 const filename = fileURLToPath(new URL(relative, import.meta.url)), module = { exports: {} as any };
 vm.runInNewContext(ts.transpileModule(readFileSync(filename,'utf8'), { compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 } }).outputText,{ module,exports:module.exports,require:(id:string)=>id in mocks?mocks[id]:require(id),process,Buffer,URL,Date,console,fetch,AbortSignal,Request,Response,FormData,Uint8Array },{filename}); return module.exports;
}
export async function runProtectedContentProof(repositories: any, sites: any[], member: any, options: { websiteBridge?: (context: any) => Promise<void> } = {}) {
 let operatorChecks = 0;
 const runtime = { getRequiredDatabaseRepositories:async()=>repositories,shouldUseDemoStoreFallback:()=>false };
 const session = load('../src/lib/visitor-auth/session.ts');
 const provider = load('../src/lib/visitor-auth/provider.ts');
 const visitor = load('../src/lib/visitor-auth/routes.ts',{ '@/lib/repositoryRuntime':runtime,'./session':session,'./provider':provider });
 const contracts = load('../src/lib/publicContractResponse.ts');
 const access = {requireAdminAccess: async (request:any)=> { operatorChecks++; return request.headers.get('x-backy-admin-key') === 'fixture-operator' ? {} : NextResponse.json({error:'operator required'},{status:401}); }};
 const audience = load('../src/lib/publicFormAudienceAccess.ts',{'@/lib/visitor-auth/routes':visitor,'@/lib/adminAccess':access,'@/lib/publicContractResponse':contracts});
 const privacy = load('../src/lib/commentPrivacy.ts',{'./visitor-auth/routes':visitor,'./visitor-auth/session':session,'./backyStore':{}});
 const token = session.newVisitorToken(); assert(await repositories.visitorAccounts.createSession({ tokenHash:session.visitorTokenHash(token),siteId:member.siteId,memberId:member.id,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString() }));
 const cookie = `${session.visitorCookieName(member.siteId)}=${token}`;
 const [a,b] = sites;
 const request = (site:any=a, headers:any={}, body?:any) => new NextRequest(`http://backy.local/api/sites/${site.id}/forms/private/definition`,{method:body?'POST':'GET',headers:{origin:`https://site-${site===a?'a':'b'}.example.com`,...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
 let passed = 0;
 const check = async(name:string,action:()=>Promise<void>|void)=>{try{await action();passed++;}catch(error){throw new Error(`${name}: ${error}`);}};
 const form = {id:randomUUID(),siteId:a.id,isActive:true,audience:'authenticated',fields:[{key:'message',type:'text'}],settings:{}};
 if(repositories.forms?.create) Object.assign(form,(await repositories.forms.create({...form,name:'private-visitor-proof'})).item);
 const definition = load('../src/app/api/sites/[siteId]/forms/[formId]/definition/route.ts',{
  '@/lib/backyStore':{}, '@/lib/frontendDesignContract':{frontendDesignProvenanceFromMetadata:()=>undefined,frontendFormFieldKeyMapFromMetadata:()=>undefined}, '@/lib/publicContractResponse':contracts,'@/lib/publicFormAudienceAccess':audience,
  '@/lib/repositoryRuntime':{...runtime,getRequiredDatabaseRepositories:async()=>({...repositories,forms:{...repositories.forms,getById:async(siteId:string,id:string)=>siteId===a.id&&id===form.id?form:null},cacheInvalidations:{latestRevision:async()=>null}})},
 });
 const getDefinition=(headers:any={})=>definition.GET(request(a,headers),{params:Promise.resolve({siteId:a.id,formId:form.id})});
 await check('actual authenticated definition admits visitor and caches privately',async()=>{const response=await getDefinition({cookie});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(operatorChecks,0);});
 await check('operator key cannot substitute for visitor authenticated forms',async()=>{assert.equal((await getDefinition({'x-backy-admin-key':'fixture-operator'})).status,401);assert.equal(operatorChecks,0);});
 await check('wrong website membership is denied for authenticated forms',async()=>{const result=await audience.requirePublicFormAudienceAccess(request(b,{authorization:`Bearer ${token}`}), 'fixture', {...form,siteId:b.id},'submit');assert.equal(result.status,401);});
 await check('adminOnly form remains operator-owned',async()=>{assert.equal((await audience.requirePublicFormAudienceAccess(request(a,{cookie}),'fixture',{...form,audience:'adminOnly'},'submit')).status,401);assert.equal(await audience.requirePublicFormAudienceAccess(request(a,{'x-backy-admin-key':'fixture-operator'}),'fixture',{...form,audience:'adminOnly'},'submit'),null);assert.equal(operatorChecks,2);});
 await check('anonymous public form needs neither membership nor operator',async()=>{assert.equal(await audience.requirePublicFormAudienceAccess(request(),'fixture',{...form,audience:'public'},'submit'),null);});
 await check('visitor bearer is not a moderator private-read credential',()=>{assert.equal(privacy.hasCommentCredentials(request(a,{authorization:`Bearer ${token}`})),false);assert.equal(privacy.hasCommentCredentials(request(a,{'x-backy-admin-key':'fixture-operator'})),true);});
 await check('comment visitor identity is current and site-scoped',async()=>{const resolved=await privacy.resolveCommentVisitor(request(a,{cookie}),'fixture',a.id);assert.equal(resolved.id,member.id);assert.equal((await privacy.resolveCommentVisitor(request(b,{authorization:`Bearer ${token}`}), 'fixture',b.id)).status,401);assert.equal(await privacy.resolveCommentVisitor(request(a,{'x-backy-admin-key':'fixture-operator'}),'fixture',a.id),null);});
 const transport=load('../src/lib/formSubmissionTransport.ts');
 const uploadedBytes: Buffer[] = [], scannedBytes: Buffer[] = [];
 const storage = { upload: async (bytes: Buffer, metadata: any) => { uploadedBytes.push(Buffer.from(bytes)); assert.match(metadata.path, /^form-attachments\/sites\//); return { path: metadata.path, size: bytes.length }; }, delete: async () => {} };
 const attachments=load('../src/lib/formAttachments.ts',{'./formSubmissionTransport':transport,'./mediaSafety':{scanMediaUploadWithProviders: async (input: any) => { scannedBytes.push(Buffer.from(input.buffer)); }},'./mediaUploadPolicy':{ resolveMediaUploadPolicy: () => ({ quotaBytes: 128*1024*1024, maxUploadBytes: 4*1024*1024 }), isUploadAllowedByFileType: () => true, readMediaBillingLimit: () => ({ blocked: false }) },'./formAttachmentStorage':{getFormAttachmentStorage: async () => storage}});
 const pagination = load('../src/lib/collectionExportPagination.ts');
 const emptyPage = async (input: any) => ({ items: [], pagination: { total: 0, limit: input.limit, offset: input.offset, hasMore: false } });
 const submitted:any[]=[];
 const submitRepositories={...repositories,media: repositories.media || { list: emptyPage },settings:{get:async()=>({integrations:{notifications:{digestFrequency:'off'}}})},forms:{...repositories.forms,listSubmissions: repositories.forms?.listSubmissions || emptyPage,getById:async(siteId:string)=>siteId===a.id?form:null,createSubmission:async(input:any)=>{submitted.push(input);return repositories.forms?.createSubmission ? repositories.forms.createSubmission(input) : {item:{...input,id:randomUUID(),submittedAt:new Date().toISOString()}};}}};
 const submissionRoute=load('../src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts',{
  '@/lib/visitor-auth/routes':visitor,'@/lib/backyStore':{normalizeFormSubmissionValues:(_form:any,values:any)=>values,validateAndClassifyFormSubmission:()=>({ok:true,status:'pending',validation:[],spamFlags:[]})},
  '@/lib/frontendDesignContract':{frontendDesignProvenanceFromMetadata:()=>undefined,frontendFormFieldKeyMapFromMetadata:()=>undefined},'@/lib/commentRepositorySupport':{recordRepositoryInteractionEvent:async()=>{}},'@/lib/formEmailDelivery':{EmailDeliveryError:class extends Error{}},'@/lib/formCaptcha':{verifyFormCaptcha:async()=>({ok:true})},'@/lib/adminAccess':access,'@/lib/publicContractResponse':contracts,'@/lib/publicFormAudienceAccess':audience,'@/lib/collectionRecordValidation':{},'@/lib/repositoryRuntime':{...runtime,getRequiredDatabaseRepositories:async()=>submitRepositories},'@/lib/formAttachments':attachments,'@/lib/formAttachmentStorage':{FormAttachmentStorageError:class extends Error{}},'@/lib/mediaSafety':{MediaSafetyError:class extends Error{}},'@/lib/collectionExportPagination':pagination,
 });
 const submit=(headers:any)=>submissionRoute.POST(request(a,headers,{values:{message:'Private text'},visitorMemberId:'forged-member',userId:'forged-operator'}),{params:Promise.resolve({siteId:a.id,formId:form.id})});
 await check('actual authenticated form submit assigns current server member and ignores forged identity',async()=>{const response=await submit({cookie});assert.equal(response.status,201);assert.equal(submitted[0].visitorMemberId,member.id);assert.equal(submitted[0].userId,undefined);});
 await check('actual authenticated form submit rejects operator and anonymous access before persistence',async()=>{assert.equal((await submit({})).status,401);assert.equal((await submit({'x-backy-admin-key':'fixture-operator'})).status,401);assert.equal(submitted.length,1);});
 const bridgeTargets: any[] = [];
 for(const targetType of ['page','post']) {
  const targetId=randomUUID(), created:any[]=[];
  const policy=load('../src/lib/commentPolicy.ts');
  const scopedSite={...a,settings:{...a.settings,commentPolicy:{enabled:true,allowGuests:false,requireName:true,requireEmail:true,moderationMode:'manual'}}};
  const scopedRepositories={...repositories,[targetType==='page'?'pages':'posts']:{getById:async(siteId: string, id: string)=>siteId===a.id&&id===targetId?({id:targetId,siteId:a.id,status:'published'}):null},comments:{...repositories.comments,list: repositories.comments?.list || (async (input: any) => { const items = created.filter(item => item.status === 'approved'); return { items: items.slice(input.offset, input.offset+input.limit), pagination: { total: items.length, limit: input.limit, offset: input.offset, hasMore: input.offset+input.limit < items.length } }; }),create:async(input:any)=>{created.push(input);return repositories.comments?.create ? repositories.comments.create(input) : {item:{...input,id:randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}};}}};
  const route=load(`../src/app/api/sites/[siteId]/${targetType==='page'?'pages/[pageId]':'blog/[postId]'}/comments/route.ts`,{
   '@/lib/adminAccess':access,'@/lib/commentPrivacy':privacy,'@/lib/commentPolicy':policy,'@/lib/backyStore':{validateAndClassifyComment:()=>({ok:true,status:'pending',spamFlags:[]})},
   '@/lib/commentRepositorySupport':{resolveRepositorySite:async()=>scopedSite,recordRepositoryInteractionEvent:async()=>{}}, '@/lib/commentCaptcha':{verifyCommentCaptcha:async()=>null,commentCaptchaFailurePayload:()=>({})}, '@/lib/commentDelivery':{notifyCommentDelivery:async()=>{}}, '@/lib/publicContractResponse':contracts,'@/lib/repositoryRuntime':{...runtime,getRequiredDatabaseRepositories:async()=>scopedRepositories},
  });
  bridgeTargets.push({ targetType, targetId, route, site: scopedSite, created });
  const post=(headers:any,body:any)=>route.POST(request(a,headers,{content:'Verified visitor comment',authorName:'Forged name',authorEmail:'forged@example.com',visitorMemberId:'forged-id',userId:'forged-operator',...body}),{params:Promise.resolve({siteId:a.id,[targetType==='page'?'pageId':'postId']:targetId})});
  await check(`actual ${targetType} comment handler assigns verified identity and rejects forged author email`,async()=>{const response=await post({cookie},{});assert.equal(response.status,201);assert.equal(created[0].visitorMemberId,member.id);assert.equal(created[0].userId,null);assert.equal(created[0].authorEmail,member.email);assert.equal(created[0].authorName,member.displayName);const publicBody=await response.json();assert.equal(Object.hasOwn(publicBody.data.comment,'visitorMemberId'),false);assert.equal(Object.hasOwn(publicBody.data.comment,'authorEmail'),false);});
  await check(`actual ${targetType} comments requiring membership reject guests and operator substitutions`,async()=>{assert.equal((await post({},{})).status,403);assert.equal((await post({'x-backy-admin-key':'fixture-operator'},{})).status,403);assert.equal(created.length,1);});
 }
 if (options.websiteBridge) await options.websiteBridge({ a, b, member, cookie, token, form, definition, submissionRoute, visitor, targets: bridgeTargets, submitted, uploadedBytes, scannedBytes });
 console.log(`Visitor protected-content actual handler checks passed: ${passed}.`);return{passed};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const fixture=memoryVisitorFixture();const member=await fixture.repositories.visitorAccounts.enroll(fixture.sites[0].id,{issuer:'https://fixture/auth/v1',subject:'member',email:'member@example.com'},'Member');await runProtectedContentProof(fixture.repositories,fixture.sites,member);}
