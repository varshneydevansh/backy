// Owned served acceptance fixture: actual demo persistence and HTTP handlers;
// synthetic operator credential only. Browser interactions use CUA.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { buildSync } from 'esbuild';
import { mkdtempSync,symlinkSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve,join } from 'node:path';
import { NextRequest } from 'next/server';
const root=resolve(import.meta.dirname,'../../..'),cwd=process.cwd(),scratch=mkdtempSync('/tmp/backy-comment-delivery-browser-'),port=5189,origin=`http://127.0.0.1:${port}`;
process.once('exit',()=>rmSync(scratch,{recursive:true,force:true}));
process.chdir(scratch);process.env.BACKY_DATA_MODE='demo';process.env.NODE_ENV='test';process.env.BACKY_ADMIN_API_KEY='owned-synthetic-comment-operator';
const unwrap=(m:any)=>m.default||m;
const store:any=unwrap(await import('../src/lib/backyStore.ts'));
const site=store.getSiteByIdOrSlug('site-demo');
store.updateAdminSite(site.id,{status:'published',isPublished:true,settings:{commentPolicy:{enabled:true,moderationMode:'manual',allowGuests:true,allowReplies:true,enableReports:true,captcha:{enabled:false},requireEmail:false,blockedTerms:[]}}});
const page=store.listAdminPages(site.id)[0];store.updateAdminPage(site.id,page.id,{status:'published'});
const seed=(content:string,status='pending',parentId:string|null=null)=>store.createComment({siteId:site.id,targetType:'page',targetId:page.id,content,authorName:'Synthetic visitor',authorEmail:'author@example.invalid',status,parentId});
const pending=seed('Acceptance pending root'),nested=seed('Acceptance nested child','approved',pending.id),deep=seed('Acceptance nested grandchild','approved',nested.id),reported=seed('Acceptance reportable root','approved'),block=seed('Acceptance block author','pending');
const journal=unwrap(await import('../src/lib/demoCommentDeliveryJournal.ts')).demoCommentDeliveryJournal;
const attemptInput={siteId:site.id,commentId:pending.id,kind:'comment-status',channel:'webhook',target:origin+'/fixture/webhook',requestId:'owned-delivery-seed',reason:'approved',actor:'synthetic-owner'};
const failedAttempt=await journal.admit(attemptInput);await journal.settle(site.id,failedAttempt.id,{state:'failed',statusCode:503,errorCode:'PROVIDER_REJECTED'});
const uncertainAttempt=await journal.admit(attemptInput);await journal.settle(site.id,uncertainAttempt.id,{state:'uncertain',errorCode:'PROVIDER_COMPLETION_UNKNOWN'});
const pendingAttempt=await journal.admit(attemptInput);
const entries:any[]=[
 [/^\/api\/sites\/site-demo\/comments\/delivery-attempts$/,unwrap(await import('../src/app/api/sites/[siteId]/comments/delivery-attempts/route.ts'))],
 [/^\/api\/sites\/site-demo\/comments\/([^/]+)\/delivery-retry$/,unwrap(await import('../src/app/api/sites/[siteId]/comments/[commentId]/delivery-retry/route.ts')),'commentId'],
 [/^\/api\/sites\/site-demo\/comments$/,unwrap(await import('../src/app/api/sites/[siteId]/comments/route.ts'))],
 [/^\/api\/sites\/site-demo\/comments\/analytics$/,unwrap(await import('../src/app/api/sites/[siteId]/comments/analytics/route.ts'))],
 [/^\/api\/sites\/site-demo\/comments\/blocklist$/,unwrap(await import('../src/app/api/sites/[siteId]/comments/blocklist/route.ts'))],
 [/^\/api\/sites\/site-demo\/comments\/([^/]+)\/report$/,unwrap(await import('../src/app/api/sites/[siteId]/comments/[commentId]/report/route.ts')),'commentId'],
 [/^\/api\/sites\/site-demo\/comments\/([^/]+)$/,unwrap(await import('../src/app/api/sites/[siteId]/comments/[commentId]/route.ts')),'commentId'],
 [/^\/api\/sites\/site-demo\/pages\/([^/]+)\/comments$/,unwrap(await import('../src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts')),'pageId'],
 [/^\/api\/sites\/site-demo\/events$/,unwrap(await import('../src/app/api/sites/[siteId]/events/route.ts'))],
];
const events:any[]=[];let failingWebhook=false,server:any;
const evidence=()=>({boundary:'Actual current admin UI, actual HTTP handlers and durable demo store. Synthetic site-demo operator credential; no real provider or PostgreSQL browser proof.',ids:{pending:pending.id,nested:nested.id,deep:deep.id,reported:reported.id,block:block.id,page:page.id},deliveryAttempts:JSON.parse(readFileSync(join(scratch,'data/backy/private-comment-delivery/attempts.json'),'utf8')),seedAttemptIds:{failed:failedAttempt.id,uncertain:uncertainAttempt.id,pending:pendingAttempt.id},comments:JSON.parse(readFileSync(join(scratch,'data/backy/interactions.json'),'utf8')).comments,events});
try{
 symlinkSync(join(root,'node_modules'),join(scratch,'node_modules'),'dir');
 execFileSync(join(root,'node_modules/.bin/tailwindcss'),['-c','apps/admin/tailwind.config.js','-i','apps/admin/src/index.css','-o',join(scratch,'proof.css'),'--content','apps/admin/src/**/*.{ts,tsx}'],{cwd:root,stdio:'pipe'});
 buildSync({entryPoints:[join(root,'packages/core/src/index.ts')],outfile:join(scratch,'core.mjs'),bundle:true,format:'esm',platform:'browser',logLevel:'silent'});
 writeFileSync(join(scratch,'index.html'),`<!doctype html><html><head><title>Actual comments management acceptance</title><link rel="stylesheet" href="/proof.css"></head><body><div id="root"></div><script type="module" src="/@fs/${root}/apps/admin/scripts/comment-delivery-runtime-fixture.tsx"></script></body></html>`);
 server=await createServer({configFile:false,root:scratch,plugins:[react(),{name:'actual-comments-http',configureServer(vite:any){vite.middlewares.use(async(req:any,res:any,next:any)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/fixture/login'){res.setHeader('set-cookie','backy_comment_fixture=owned; HttpOnly; SameSite=Strict; Path=/');res.end('{}');return;}
  if(url.pathname==='/fixture/webhook'){events.push({kind:'owned-webhook',status:failingWebhook?503:200});res.statusCode=failingWebhook?503:200;res.end('{}');return;}
  if(url.pathname==='/fixture/fail-delivery'){failingWebhook=true;store.updateAdminSettings({integrations:{notifications:{webhookUrl:origin+'/fixture/webhook',digestFrequency:'immediate',email:{comments:false,commentModeration:false}}}});res.end('{}');return;}
  if(url.pathname==='/fixture/report'){const request=new NextRequest(origin+`/api/sites/site-demo/comments/${reported.id}/report`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reason:'spam'})});const entry=entries.find(e=>e[2]==='commentId'&&e[0].source.includes('report'));const response=await entry[1].POST(request,{params:Promise.resolve({siteId:'site-demo',commentId:reported.id})});events.push({kind:'public-report',status:response.status,body:await response.clone().json()});res.statusCode=response.status;res.end(await response.text());return;}
  if(url.pathname==='/fixture/evidence'){res.setHeader('content-type','application/json');res.end(JSON.stringify(evidence()));return;}
  if(!url.pathname.startsWith('/api/'))return next();
  try{
   if(url.pathname.endsWith('/permissions')){res.setHeader('content-type','application/json');res.end(JSON.stringify({success:true,data:{permissions:{userId:'synthetic-comments-owner',role:'owner',status:'active',canSignIn:true,summary:{allowed:5,total:5,blockedByStatus:false},groups:[{key:'comments',permissions:['comments.view','comments.manage','comments.configure','activity.export','sites.configure'].map(key=>({key,label:key,allowed:true,source:'role',capability:key.split('.')[1]}))}]}}}));return;}
   let readData:any;
   if(url.pathname==='/api/admin/sites/site-demo')readData={site:store.getSiteByIdOrSlug('site-demo')};
   if(url.pathname==='/api/admin/sites/site-demo/pages'){const pages=store.listAdminPages('site-demo');readData={pages,pagination:{total:pages.length,limit:100,offset:0,hasMore:false}};}
   if(url.pathname==='/api/admin/sites/site-demo/blog')readData={posts:[],pagination:{total:0,limit:100,offset:0,hasMore:false}};
   if(url.pathname==='/api/admin/audit-logs')readData={logs:[],pagination:{total:0,limit:100,offset:0,hasMore:false}};
   if(readData){res.setHeader('content-type','application/json');res.end(JSON.stringify({success:true,data:readData}));return;}
   const entry=entries.find(e=>e[0].test(url.pathname));if(!entry||!entry[1][req.method]){res.statusCode=404;res.end('{}');return;}
   const match=url.pathname.match(entry[0]),headers=new Headers(req.headers as any);
   if((req.headers.cookie||'').includes('backy_comment_fixture=owned'))headers.set('x-backy-admin-key',process.env.BACKY_ADMIN_API_KEY!);
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new NextRequest(url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
   const response=await entry[1][req.method](request,{params:Promise.resolve({siteId:'site-demo',...(entry[2]?{[entry[2]]:match![1]}:{})})});
   const body=await response.clone().json().catch(()=>null);events.push({kind:'actual-handler',method:req.method,path:url.pathname,status:response.status,body});
   res.statusCode=response.status;response.headers.forEach((v:string,k:string)=>res.setHeader(k,v));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error(error);res.statusCode=500;res.end(JSON.stringify({error:'Owned fixture error'}));}
 });}}],resolve:{alias:{'@':join(root,'apps/admin/src'),'@backy-cms/core':join(scratch,'core.mjs')},dedupe:['react','react-dom']},define:{'process.env':'{}','import.meta.env.VITE_BACKY_ADMIN_API_BASE_URL':JSON.stringify(origin+'/api/admin')},server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[root,scratch]}}});
 await server.listen();console.log(JSON.stringify({ready:true,url:origin+'/comments?siteId=site-demo',scratch,ids:evidence().ids}));
 await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});
 writeFileSync('/tmp/backy-comment-delivery-browser-proof.json',JSON.stringify(evidence(),null,2));
}finally{await server?.close();process.chdir(cwd);rmSync(scratch,{recursive:true,force:true});}
