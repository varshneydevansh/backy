/** Real saved routes + central admission + adapter, synthetic loopback provider only. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {NextRequest,NextResponse} from 'next/server';
import {fixture} from './admin-access-test-fixtures.mts';
import {loadMediaFixture} from './media-storage-recovery-fixture.mts';
import {assertSiteMailboxAttachmentContractBody,assertSiteMailboxAttachmentDownload} from './site-mailbox-attachment-contract.mts';

const token='PRIVATE_SYNTHETIC_PROVIDER_TOKEN',rawFilename='../private/unsafe\r\n.html';
const bindings=[{id:'primary',siteId:'site-fixture',mailboxId:'mailbox/primary',address:'primary@example.test'},{id:'foreign',siteId:'other-site',mailboxId:'mailbox/foreign',address:'foreign@example.test'}];
const attachment={id:'opaque/part?1',filename:rawFilename,contentType:'text/html',sizeBytes:3,inline:true,contentId:'PRIVATE_CONTENT_ID',downloadUrl:'https://private-arbitrary.invalid/secrets',token};
const message={uid:8,path:'INBOX',date:'2026-10-11T00:00:00Z',flags:[],unseen:true,size:10,subject:'Private subject',from:null,to:[],attachments:[attachment],html:'PRIVATE_ACTIVE_HTML'};
let checks=0;
const check=(condition:unknown,message:string)=>{assert.ok(condition,message);checks++;};
const providerCalls:{path:string;accept:string;authorization:string}[]=[];
let mode='ok';
const provider=createServer((req,res)=>{
 providerCalls.push({path:req.url!,accept:req.headers.accept||'',authorization:req.headers.authorization||''});
 if(req.url==='/api/v1/me'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({data:{mailboxes:bindings.map(binding=>({resourceId:binding.mailboxId,address:binding.address}))}}));}
 if(req.url?.endsWith('/messages/8')){
  res.setHeader('content-type','application/json');
  if(mode==='metadata-stall'){res.flushHeaders();return;}
  if(mode==='metadata-big'){return res.end('x'.repeat(1048577));}
  if(mode==='metadata-redirect'){res.writeHead(302,{location:'https://private-arbitrary.invalid/secrets'});return res.end();}
  if(mode==='metadata-json'){return res.end('{"private":"'+token+'"');}
  let data:any=structuredClone(message);
  if(mode==='foreign-uid')data.uid=9;if(mode==='foreign-folder')data.path='OTHER';if(mode==='duplicate')data.attachments.push(attachment);
  if(mode==='count')data.attachments=Array.from({length:101},()=>attachment);
  if(mode==='bad-id')data.attachments[0].id='bad\u0085id';
  if(mode==='bad-mime')data.attachments[0].contentType='text/html\r\nPrivate: secret';
  if(mode==='bad-size')data.attachments[0].sizeBytes=1.5;
  if(mode==='bad-inline')data.attachments[0].inline='true';
  if(mode==='bad-filename')data.attachments[0].filename='x'.repeat(1025);
  if(mode==='oversized')data.attachments[0].sizeBytes=3145729;
  if(mode==='zero')data.attachments[0].sizeBytes=0;
  if(mode==='unicode')data.attachments[0].filename='../../Résumé 😀.pdf';
  if(mode==='nested')data.path='INBOX/Archive?x=1';
  return res.end(JSON.stringify({data}));
 }
 if(req.url?.endsWith('/attachments/opaque%2Fpart%3F1')){
  if(mode==='binary-redirect'){res.writeHead(302,{location:'https://private-arbitrary.invalid/secrets'});return res.end();}
  if(mode==='provider-rate'){res.writeHead(429,{'content-type':'application/json'});return res.end(JSON.stringify({error:token}));}
  if(mode==='provider-error'){res.writeHead(403,{'content-type':'application/json'});return res.end(JSON.stringify({error:token}));}
  res.setHeader('content-type',mode==='binary-mime'?'text/html':'application/octet-stream');
  if(mode==='binary-length'){res.setHeader('content-length','4');return res.end('DATA');}
  if(mode==='binary-large-length'){res.setHeader('content-length','3145729');res.flushHeaders();return;}
  if(mode==='binary-encoding')res.setHeader('content-encoding','gzip');
  if(mode==='binary-short')return res.end('X');
  if(mode==='binary-long'){res.write('DATA');return res.end();}
  if(mode==='binary-stall'){res.setHeader('content-length','3');res.flushHeaders();res.write('X');return;}
  if(mode==='zero'){res.setHeader('content-length','0');return res.end();}
  res.setHeader('content-length','3');return res.end(new Uint8Array([0,255,42]));
 }
 res.writeHead(404);res.end('unexpected fixture path');
});
await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));const providerBase='http://127.0.0.1:'+(provider.address()as any).port;
const env:Record<string,string|undefined>={BACKY_HOSTINGER_MAIL_API_TOKEN:token,BACKY_HOSTINGER_MAILBOX_BINDINGS:JSON.stringify(bindings)};
const f=fixture({actorRole:'owner',env});
const fetchProvider:typeof fetch=async(input,init)=>{const source=new URL(String(input));assert.equal(source.origin,'https://api.mail.hostinger.com');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');check(Boolean(init?.signal),'Provider request has abort signal');return fetch(providerBase+source.pathname+source.search,init);};
const globals={fetch:fetchProvider,setTimeout,clearTimeout,AbortSignal,AbortController,TextDecoder};
const hostinger=loadMediaFixture('../src/lib/hostingerMail.ts',{}, {env},globals);
const policy=loadMediaFixture('../src/lib/emailSenderPolicy.ts',{}, {env});
const mocks={...f.mocks,'@/lib/hostingerMail':hostinger,'@/lib/emailSenderPolicy':policy};
const mailbox=loadMediaFixture('../src/lib/siteMailboxes.ts',mocks,{env},globals);mocks['@/lib/siteMailboxes']=mailbox;
const helper=loadMediaFixture('../src/lib/siteMailboxAttachments.ts',mocks,{env},globals);mocks['@/lib/siteMailboxAttachments']=helper;
const inventory=loadMediaFixture('../src/app/api/admin/sites/[siteId]/settings/mailboxes/[bindingId]/messages/[uid]/attachments/route.ts',mocks,{env},globals);
const download=loadMediaFixture('../src/app/api/admin/sites/[siteId]/settings/mailboxes/[bindingId]/messages/[uid]/attachments/[attachmentId]/download/route.ts',mocks,{env},globals);
const app=createServer(async(req,res)=>{try{const url=new URL(req.url!,'http://'+req.headers.host),parts=url.pathname.split('/');const headers=new Headers();for(const[key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const request=new NextRequest(url,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});const params={siteId:decodeURIComponent(parts[4]),bindingId:decodeURIComponent(parts[7]),uid:decodeURIComponent(parts[9]),...(parts[11]?{attachmentId:decodeURIComponent(parts[11])}:{})};const response:NextResponse=parts[11]?await download.POST(request,{params:Promise.resolve(params)}):await inventory.GET(request,{params:Promise.resolve(params)});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('fixture failed');}});
await new Promise<void>(resolve=>app.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+(app.address()as any).port;
env.BACKY_ADMIN_TRUSTED_ORIGINS=base;
async function call(action='inventory',options:any={}){
 const url=`${base}/api/admin/sites/${encodeURIComponent(options.site||f.site.id)}/settings/mailboxes/${encodeURIComponent(options.binding||'primary')}/messages/${encodeURIComponent(options.uid||'8')}/attachments${action==='download'?'/'+encodeURIComponent(options.id||attachment.id)+'/download':''}${options.query??(action==='inventory'?'?folder=INBOX':'')}`;
 const response=await fetch(url,{method:action==='download'?'POST':'GET',headers:{cookie:'backy_admin_session=synthetic-cookie',origin:base,'content-type':'application/json',...options.headers},...(action==='download'?{body:options.raw??JSON.stringify(options.body??{folder:'INBOX'})}:{})});
 for(const[name,value]of [['cache-control','private, no-store'],['x-content-type-options','nosniff'],['referrer-policy','no-referrer']])check(response.headers.get(name)===value,'Private response header '+name);
 const bytes=new Uint8Array(await response.arrayBuffer());const binary=response.status===200&&action==='download';const body=binary?undefined:JSON.parse(new TextDecoder().decode(bytes));if(body){assertSiteMailboxAttachmentContractBody(response.status,body,action==='download');check(!/PRIVATE_|private-arbitrary/.test(JSON.stringify(body)),'Provider/private fields never reflected');}else assertSiteMailboxAttachmentDownload(response,bytes);return{response,bytes,body};
}
const effects=()=>JSON.stringify({...f.effects,persistence:[]});
async function deny(action:string,status:number,options:any={}){const before=providerCalls.length,beforeEffects=effects();const result=await call(action,options);check(result.response.status===status,`Exact denial ${status}: ${JSON.stringify(result.body)}`);check(providerCalls.length===before,'Denial before provider access');check(effects()===beforeEffects,'Denied request has no writes/usage');}
try{
 let result=await call();check(result.response.status===200,'Actual attachment metadata GET');assert.deepEqual(result.body.data.attachments,[{id:attachment.id,filename:'unsafe.html',contentType:'text/html',sizeBytes:3,inline:true}]);check(true,'Strict sanitized metadata projection');check(!JSON.stringify(result.body).includes('contentId'),'Content ID not exposed');
 result=await call('download');check(result.response.status===200,'Actual binary POST: '+JSON.stringify(result.body));assert.deepEqual(result.bytes,new Uint8Array([0,255,42]));check(true,'Decoded binary preserved');check(result.response.headers.get('content-type')==='application/octet-stream','Active metadata MIME never rendered');check(result.response.headers.get('content-length')==='3','Exact decoded length');check(result.response.headers.get('content-disposition')===`attachment; filename="unsafe.html"; filename*=UTF-8''unsafe.html`,'Force safe filename download');check(Boolean(result.response.headers.get('x-request-id')),'Safe download request ID');check(result.response.headers.get('content-security-policy')?.includes('sandbox'),'Sandbox downloaded content');
 check(providerCalls.some(call=>call.path==='/api/v1/mailboxes/mailbox%2Fprimary/folders/INBOX/messages/8/attachments/opaque%2Fpart%3F1'),'Fixed exact encoded provider path');check(providerCalls.every(call=>call.authorization==='Bearer '+token),'Exact synthetic token');check(providerCalls.at(-1)?.accept==='application/octet-stream, application/json','Binary provider Accept contract');
 for(const action of ['inventory','download']){
  for(const header of ['authorization','x-backy-admin-session','x-backy-admin-key','x-api-key'])await deny(action,403,{headers:{[header]:''}});
  await deny(action,401,{headers:{cookie:''}});await deny(action,404,{binding:'foreign'});await deny(action,404,{binding:'absent'});await deny(action,404,{site:'absent'});await deny(action,400,{uid:'9007199254740992'});await deny(action,400,{uid:'-1'});
  for(const role of ['admin','editor','viewer']){f.actor.role=role as any;await deny(action,403);}f.actor.role='owner';
  f.actor.status='suspended';await deny(action,403);f.actor.status='active';
  for(const permission of ['sites.view','settings.view']){f.mocks['@/lib/backyStore'].updateAdminUserPermissionOverrides(f.actor.id,{[permission]:'deny'});await deny(action,403);f.settings().auth.userPermissionOverrides=[];}
 }
 for(const origin of ['','https://foreign.invalid'])await deny('download',403,{headers:{origin}});
 for(const query of ['', '?folder=INBOX&folder=OTHER','?folder=..','?folder=%C2%85','?folder=INBOX&mailboxId=foreign'])await deny('inventory',400,{query});
 for(const options of [{body:{folder:'INBOX',url:'https://private-arbitrary.invalid'}},{raw:'{"folder":"INBOX","fo\\u006cder":"OTHER"}'},{body:{folder:'..'}},{body:{folder:'INBOX\u0085'}},{raw:'x'.repeat(8193)},{raw:new Uint8Array([255])},{headers:{'content-type':'text/plain'}},{query:'?folder=INBOX'},{id:'bad\u007fid'},{id:'x'.repeat(513)}])await deny('download',400,options);
 const directBefore=providerCalls.length;const noBody=new NextRequest(base+'/api/admin/sites/site-fixture/settings/mailboxes/primary/messages/8/attachments?folder=INBOX',{headers:{cookie:'backy_admin_session=synthetic-cookie','content-length':'1'}});check((await inventory.GET(noBody,{params:Promise.resolve({siteId:f.site.id,bindingId:'primary',uid:'8'})})).status===400,'GET declared body denied');const dot=new NextRequest(base+'/api/admin/sites/site-fixture/settings/mailboxes/primary/messages/8/attachments/safe/download',{method:'POST',headers:{cookie:'backy_admin_session=synthetic-cookie',origin:base,'content-type':'application/json'},body:'{\"folder\":\"INBOX\"}'});check((await download.POST(dot,{params:Promise.resolve({siteId:f.site.id,bindingId:'primary',uid:'8',attachmentId:'..'})})).status===400,'Dot attachment identity denied before body/provider');check(providerCalls.length===directBefore,'Malformed native identities and body do not reach provider');
 const originalSession=f.mocks['@/lib/admin-auth/sessionStore'].getAdminSessionWithPersistence;f.mocks['@/lib/admin-auth/sessionStore'].getAdminSessionWithPersistence=async()=>null;await deny('download',401);f.mocks['@/lib/admin-auth/sessionStore'].getAdminSessionWithPersistence=originalSession;
 let bodyCancelled=false;const stalledRequest=new NextRequest(base+'/api/admin/sites/site-fixture/settings/mailboxes/primary/messages/8/attachments/safe/download',{method:'POST',headers:{cookie:'backy_admin_session=synthetic-cookie',origin:base,'content-type':'application/json'},body:new ReadableStream({start(){},cancel(){bodyCancelled=true;return new Promise(()=>{});}}),duplex:'half'}as any);const bodyStart=Date.now(),bodyBefore=providerCalls.length;const bodyResponse=await download.POST(stalledRequest,{params:Promise.resolve({siteId:f.site.id,bindingId:'primary',uid:'8',attachmentId:attachment.id})});check(bodyResponse.status===400&&bodyCancelled&&Date.now()-bodyStart<6500,'Stalled request body returns under deadline without awaiting cancellation');check(providerCalls.length===bodyBefore,'Stalled client request never reaches provider');
 result=await call('download',{id:'missing'});check(result.response.status===404,'Absent metadata ID refuses binary fetch');
 for(const bad of ['foreign-uid','foreign-folder','duplicate','count','bad-id','bad-mime','bad-size','bad-inline','bad-filename','metadata-big','metadata-json','metadata-redirect']){mode=bad;const before=providerCalls.length;result=await call('download');check(result.response.status===502,'Malformed metadata fails '+bad);check(providerCalls.length===before+2,'Metadata failure never starts attachment read');}
 mode='oversized';const beforeOversized=providerCalls.length;result=await call('download');check(result.response.status===413&&providerCalls.length===beforeOversized+2,'Oversize metadata refuses byte retrieval');
 for(const bad of ['binary-mime','binary-length','binary-short','binary-long','binary-encoding','binary-redirect','binary-large-length','provider-error','provider-rate']){mode=bad;result=await call('download');check(result.response.status===(bad==='provider-rate'?429:bad==='binary-large-length'?413:502),'Binary failure safe '+bad);}
 mode='zero';result=await call('download');check(result.response.status===200&&result.bytes.byteLength===0,'Zero-byte attachments supported');
 mode='unicode';result=await call('download');check(result.response.status===200&&result.response.headers.get('content-disposition')?.includes("filename*=UTF-8''R%C3%A9sum%C3%A9"),'Bounded Unicode filename encoded');
 mode='nested';result=await call('inventory',{query:'?folder='+encodeURIComponent('INBOX/Archive?x=1')});check(result.response.status===200&&providerCalls.at(-1)?.path==='/api/v1/mailboxes/mailbox%2Fprimary/folders/INBOX%2FArchive%3Fx%3D1/messages/8','Nested folder encoded as one opaque segment per official SDK');
 for(const slow of ['metadata-stall','binary-stall']){mode=slow;const start=Date.now();result=await call('download');check(result.response.status===502,'Stalled provider fails safely '+slow);check(Date.now()-start<17000,'Whole provider operation deadline '+slow);}
 const start=Date.now();await assert.rejects(()=>hostinger.listHostingerMailAttachments({apiToken:token,from:bindings[0].address,mailboxId:bindings[0].mailboxId},{folder:'INBOX',uid:8},async()=>new Promise<Response>(()=>{})),(error:any)=>error.reason==='network-error');check(Date.now()-start<17000,'Independent deadline survives fetch ignoring abort');
 let lateCalls=0;const lateFetch:typeof fetch=async()=>{lateCalls++;if(lateCalls===1){await new Promise(resolve=>setTimeout(resolve,9000));return new Response(JSON.stringify({data:{mailboxes:[{resourceId:bindings[0].mailboxId,address:bindings[0].address}]}}));}if(lateCalls===2)return new Response(new ReadableStream({start(controller){setTimeout(()=>{controller.enqueue(new TextEncoder().encode(JSON.stringify({data:message})));controller.close();},7000);}}));throw Error('No provider request may start after deadline');};
 await assert.rejects(()=>hostinger.downloadHostingerMailAttachment({apiToken:token,from:bindings[0].address,mailboxId:bindings[0].mailboxId},{folder:'INBOX',uid:8,attachmentId:attachment.id},lateFetch),(error:any)=>error.reason==='network-error');await new Promise(resolve=>setTimeout(resolve,1700));check(lateCalls===2,'Metadata settling after operation deadline cannot dispatch binary fetch even if fetch ignores abort');
 check(!providerCalls.some(call=>call.path.includes('/text')||call.path.includes('/send')),'No marks-seen text/send endpoint calls');check(f.effects.writes===4&&f.effects.audits===0&&f.effects.credentials===0&&f.effects.deliveries===0&&f.effects.sessionUpdates===0,'Only four deliberate fixture policy setup writes; no handler writes/usage/audit/provider sends');check(inventory.POST===undefined&&download.GET===undefined,'Saved routes expose only explicit methods');
 console.log(JSON.stringify({ok:true,checks,mode:'actual-native-http-and-loopback-provider',maxDownloadBytes:3145728,providerDeadlineMs:15000,realProviderCalls:0,sends:0,storedMutations:0}));
}finally{app.closeAllConnections();provider.closeAllConnections();await Promise.all([new Promise<void>(resolve=>app.close(()=>resolve())),new Promise<void>(resolve=>provider.close(()=>resolve()))]);}
