// Actual handlers + private owned demo persistence; CUA performs UI actions.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { buildSync } from 'esbuild';
import { mkdtempSync,symlinkSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve,join } from 'node:path';
import { NextRequest } from 'next/server';
const root=resolve(import.meta.dirname,'../../..'),cwd=process.cwd(),scratch=mkdtempSync('/tmp/backy-form-delivery-browser-'),port=5190,origin=`http://127.0.0.1:${port}`;
process.once('exit',()=>rmSync(scratch,{recursive:true,force:true}));process.chdir(scratch);process.env.BACKY_DATA_MODE='demo';process.env.NODE_ENV='test';delete process.env.BACKY_ADMIN_API_KEY;delete process.env.BACKY_ADMIN_SECRET_KEY;
const unwrap=(m:any)=>m.default||m,store:any=unwrap(await import('../src/lib/backyStore.ts')),sessions:any=unwrap(await import('../src/lib/admin-auth/sessionStore.ts'));
const site=store.createAdminSite({id:'forms-acceptance',name:'Owned Forms acceptance',slug:'forms-acceptance',status:'published'}),other=store.createAdminSite({id:'forms-denied',name:'Other isolated site',slug:'forms-denied',status:'published'});
const owner=store.createAdminUser({id:'forms-synthetic-owner',email:'owner@fixture.invalid',fullName:'Synthetic Forms owner',role:'owner',status:'active'}),operator=store.createAdminUser({id:'forms-synthetic-scoped',email:'operator@fixture.invalid',fullName:'Synthetic scoped operator',role:'admin',status:'active'});
const scopeRecord={userId:operator.id,scope:{version:1,revision:1,mode:'selected-sites',grants:[{siteId:site.id,permissions:['sites.view','sites.configure','forms.view','forms.create','forms.manage','forms.export','collections.view','pages.view']}],expiresAt:null}};store.updateAdminSettings({deliveryMode:'inbox',integrations:{notifications:{digestFrequency:'off'},storage:{provider:'local'}}});
store.commitAdminOperatorSiteGrant({userId:operator.id,expectedRecords:[],record:scopeRecord});
const scopeModule:any=unwrap(await import('../src/lib/adminOperatorSiteScope.ts'));if(scopeModule.operatorSiteScopeFromAuth(store.getAdminSettings().auth,operator.id)?.mode!=='selected-sites')throw new Error('Synthetic fixture scope policy was not persisted or valid');
const ownerSession=sessions.createAdminSessionForExternalUser(owner,'supabase',{sessionTimeoutMinutes:120}),operatorSession=sessions.createAdminSessionForExternalUser(operator,'supabase',{sessionTimeoutMinutes:120});
const form=store.createAdminForm({id:'shared-form',siteId:site.id,name:'Acceptance inbox and consent',title:'Acceptance inbox and consent',isActive:true,audience:'public',moderationMode:'manual',fields:[{key:'email',label:'Email',type:'email'},{key:'message',label:'Message',type:'textarea'},{key:'consent',label:'Consent',type:'checkbox'}],consentSettings:{retentionDays:1,deleteAfterDays:1,exportIncludesIp:false},notificationWebhook:origin+'/fixture/provider',contactShare:{enabled:false},settings:{}});
const contactForm=store.createAdminForm({id:'import-contacts',siteId:site.id,name:'Acceptance contact import',title:'Acceptance contact import',fields:[{key:'name',label:'Name',type:'text'},{key:'email',label:'Email',type:'email'}],contactShare:{enabled:true,emailField:'email',nameField:'name'},settings:{}});
const foreign=store.createAdminForm({id:'shared-form',siteId:other.id,name:'Private other site',title:'Private other site',fields:[{key:'message',label:'Message',type:'text'}],settings:{}});
const seeded:any[]=[store.createFormSubmission({siteId:site.id,formId:form.id,values:{email:'synthetic@example.invalid',message:'Durable retry source',consent:true},status:'pending'})];
const journal:any=unwrap(await import('../src/lib/demoFormDeliveryJournal.ts')).demoFormDeliveryJournal;
const input={siteId:site.id,formId:form.id,submissionId:seeded[0].id,kind:'form-submission',channel:'webhook',target:origin+'/fixture/provider',requestId:'synthetic-seed',reason:'pending',actor:owner.id};
const failed=await journal.admit(input);await journal.settle(site.id,failed.id,{state:'failed',statusCode:503,errorCode:'PROVIDER_REJECTED'});
const uncertain=await journal.admit(input);await journal.settle(site.id,uncertain.id,{state:'uncertain',errorCode:'PROVIDER_COMPLETION_UNKNOWN'});
const pending=await journal.admit(input);
const interactions=join(scratch,'data/backy/interactions.json');
writeFileSync(join(scratch,'contacts.csv'),'name,email,phone,notes\nAcceptance Imported One,one@example.invalid,+15550101,Owned CSV record\nAcceptance Imported Two,two@example.invalid,+15550102,Owned CSV record\n');
const definitions:any[]=[
 ['admin/sites/([^/]+)/forms/([^/]+)/delivery-attempts','admin/sites/[siteId]/forms/[formId]/delivery-attempts',['siteId','formId']],
 ['admin/sites/([^/]+)/forms/([^/]+)/submissions/([^/]+)/webhook-retry','admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/webhook-retry',['siteId','formId','submissionId']],
 ['admin/sites/([^/]+)/forms/([^/]+)/submissions/([^/]+)/email-retry','admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/email-retry',['siteId','formId','submissionId']],
 ['sites/([^/]+)/forms/([^/]+)/submissions','sites/[siteId]/forms/[formId]/submissions',['siteId','formId']],
 ['admin/sites/([^/]+)/forms','admin/sites/[siteId]/forms',['siteId']],
 ['admin/sites/([^/]+)/forms/analytics','admin/sites/[siteId]/forms/analytics',['siteId']],
 ['admin/sites/([^/]+)/forms/contact-lists','admin/sites/[siteId]/forms/contact-lists',['siteId']],
 ['admin/sites/([^/]+)/forms/contact-segments','admin/sites/[siteId]/forms/contact-segments',['siteId']],
 ['admin/sites/([^/]+)/forms/attachment-cleanup','admin/sites/[siteId]/forms/attachment-cleanup',['siteId']],
 ['admin/sites/([^/]+)/forms/([^/]+)/submissions/([^/]+)','admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]',['siteId','formId','submissionId']],
 ['admin/sites/([^/]+)/forms/([^/]+)/submissions','admin/sites/[siteId]/forms/[formId]/submissions',['siteId','formId']],
 ['admin/sites/([^/]+)/forms/([^/]+)/consent-retention','admin/sites/[siteId]/forms/[formId]/consent-retention',['siteId','formId']],
 ['admin/sites/([^/]+)/forms/([^/]+)/contacts/import','admin/sites/[siteId]/forms/[formId]/contacts/import',['siteId','formId']],
 ['admin/sites/([^/]+)/forms/([^/]+)/contacts/consent-retention','admin/sites/[siteId]/forms/[formId]/contacts/consent-retention',['siteId','formId']],
 ['admin/sites/([^/]+)/forms/([^/]+)/contacts','admin/sites/[siteId]/forms/[formId]/contacts',['siteId','formId']],
 ['admin/sites/([^/]+)/forms/([^/]+)','admin/sites/[siteId]/forms/[formId]',['siteId','formId']],
 ['admin/sites/([^/]+)/frontend-design','admin/sites/[siteId]/frontend-design',['siteId']],
 ['admin/sites/([^/]+)/collections','admin/sites/[siteId]/collections',['siteId']],
 ['admin/sites/([^/]+)','admin/sites/[siteId]',['siteId']],
 ['admin/audit-logs','admin/audit-logs',[]],
 ['admin/users/([^/]+)/permissions','admin/users/[userId]/permissions',['userId']],
 ['sites/([^/]+)/events','sites/[siteId]/events',['siteId']],
];
const entries=[];for(const [path,module,params]of definitions)entries.push({pattern:new RegExp('^/api/'+path+'$'),module:unwrap(await import('../src/app/api/'+module+'/route.ts')),params});
const events:any[]=[];let server:any;
const evidence=()=>({boundary:'Actual current Forms/Contacts UI, actual canonical HTTP handlers, shared admin session/site admission, private durable journal + owned HTTP provider. Synthetic operator sessions; no real provider arrival or production proof.',siteId:site.id,otherSiteId:other.id,formId:form.id,contactFormId:contactForm.id,tailSubmissionId:seeded[0].id,seedAttemptIds:{failed:failed.id,uncertain:uncertain.id,pending:pending.id},attempts:JSON.parse(readFileSync(join(scratch,'data/backy/private-form-delivery/attempts.json'),'utf8')),events,interactions:JSON.parse(readFileSync(interactions,'utf8'))});
try{
 symlinkSync(join(root,'node_modules'),join(scratch,'node_modules'),'dir');execFileSync(join(root,'node_modules/.bin/tailwindcss'),['-c','apps/admin/tailwind.config.js','-i','apps/admin/src/index.css','-o',join(scratch,'proof.css'),'--content','apps/admin/src/**/*.{ts,tsx}'],{cwd:root,stdio:'pipe'});
 buildSync({entryPoints:[join(root,'packages/core/src/index.ts')],outfile:join(scratch,'core.mjs'),bundle:true,format:'esm',platform:'browser',logLevel:'silent'});
 writeFileSync(join(scratch,'index.html'),`<!doctype html><html><head><title>Actual Forms management acceptance</title><link rel="stylesheet" href="/proof.css"></head><body><div id="root"></div><script type="module" src="/@fs/${root}/apps/admin/scripts/form-delivery-runtime-fixture.tsx"></script></body></html>`);
 server=await createServer({configFile:false,root:scratch,plugins:[react(),{name:'actual-forms-http',configureServer(vite:any){vite.middlewares.use(async(req:any,res:any,next:any)=>{
 const url=new URL(req.url,origin);
 if(url.pathname==='/fixture/provider'){events.push({kind:'owned-provider',method:req.method,status:200});res.statusCode=200;res.end('{}');return;}
 if(url.pathname==='/fixture/login'){const restricted=url.searchParams.get('mode')==='restricted';res.setHeader('set-cookie',`backy_admin_session=${restricted?operatorSession.token:ownerSession.token}; HttpOnly; SameSite=Strict; Path=/`);res.end('{}');return;}
 if(url.pathname==='/fixture/evidence'){res.setHeader('content-type','application/json');res.end(JSON.stringify(evidence()));return;}
 if(!url.pathname.startsWith('/api/'))return next();
 try{const entry=entries.find(e=>e.pattern.test(url.pathname));if(!entry||!entry.module[req.method]){res.statusCode=404;res.end(JSON.stringify({success:false,error:{message:'Owned fixture has no route '+url.pathname}}));return;}
 const match=url.pathname.match(entry.pattern),chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new NextRequest(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
 const response=await entry.module[req.method](request,{params:Promise.resolve(Object.fromEntries(entry.params.map((key:string,index:number)=>[key,match![index+1]])))});
 const body=await response.clone().json().catch(()=>null);events.push({method:req.method,path:url.pathname,status:response.status,body});res.statusCode=response.status;response.headers.forEach((v:string,k:string)=>res.setHeader(k,v));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error(error);res.statusCode=500;res.end(JSON.stringify({success:false,error:{message:'Owned fixture failed'}}));}
 });}}],resolve:{alias:{'@':join(root,'apps/admin/src'),'@backy-cms/core':join(scratch,'core.mjs')},dedupe:['react','react-dom']},define:{'process.env':'{}','import.meta.env.VITE_BACKY_ADMIN_API_BASE_URL':JSON.stringify(origin+'/api/admin'),'import.meta.env.VITE_BACKY_PUBLIC_API_BASE_URL':JSON.stringify(origin+'/api')},server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[root,scratch]}}});
 await server.listen();console.log(JSON.stringify({ready:true,url:origin+'/forms?siteId='+site.id+'&formId='+form.id,scratch,csv:join(scratch,'contacts.csv'),formId:form.id,tail:seeded[0].id}));
 await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});writeFileSync('/tmp/backy-form-delivery-browser-proof.json',JSON.stringify(evidence(),null,2));
}finally{await server?.close();process.chdir(cwd);rmSync(scratch,{recursive:true,force:true});}
