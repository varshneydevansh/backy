import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { memoryVisitorFixture } from './visitor-auth-smoke.mts';
const require = createRequire(import.meta.url);
function load(path: string, mocks: Record<string, any> = {}, fetcher = fetch, env = process.env, globals: Record<string, any> = {}) {
 const filename = fileURLToPath(new URL(path, import.meta.url)), module = { exports: {} as any };
 vm.runInNewContext(ts.transpileModule(readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:(id:string)=>id in mocks?mocks[id]:require(id),process:{env},Buffer,TextDecoder,URL,URLSearchParams,Headers,Date,fetch:fetcher,AbortSignal,setTimeout,clearTimeout,console:{warn(){}},...globals},{filename});return module.exports;
}
export async function runVisitorPkceProof(repositories: any, sites: any[]) {
 const [a,b] = sites, origin = a.settings.visitorAccounts.allowedOrigins[0], redirect = a.settings.visitorAccounts.returnUrls[0];
 const deliveries: any[] = [], calls: any[] = [], codes = new Map<string,any>(); let puts = 0, sequence = 0, providerFailed = false;
 const server = createServer(async(req,res)=>{
  let raw=''; for await(const chunk of req) raw+=chunk; const body=raw?JSON.parse(raw):{}; calls.push({path:req.url,body});let status=200,value:any={};
  if(providerFailed){status=503;value={secret:'private-provider-error'};}
  else if(req.url?.startsWith('/auth/v1/signup') || req.url?.startsWith('/auth/v1/recover')) {
   assert.equal(body.code_challenge_method,'s256');assert.match(body.code_challenge,/^[A-Za-z0-9_-]{43}$/);
   const code=`code-${++sequence}`, url=new URL(new URL(req.url,'http://provider').searchParams.get('redirect_to')!);url.searchParams.set('code',code);
   const identity={id:body.email==='operator@example.com'?'operator-subject':'provider-'+body.email,email:body.email,email_confirmed_at:'2026-01-01T00:00:00Z'};
   codes.set(code,{challenge:body.code_challenge,identity,used:false});deliveries.push({code,url,body});
  } else if(req.url==='/auth/v1/token?grant_type=pkce') {
   const flow=codes.get(body.auth_code);
   if(!flow || flow.used || createHash('sha256').update(body.code_verifier||'').digest('base64url')!==flow.challenge){status=400;value={secret:'wrong-verifier'};}
   else{flow.used=true;value={access_token:'token-'+body.auth_code,refresh_token:'never-return-refresh',user:{id:'untrusted-client-claim'}};}
  } else if(req.url==='/auth/v1/user'){
   const code=String(req.headers.authorization).replace('Bearer token-',''),flow=codes.get(code);
   if(!flow){status=401;}else if(req.method==='PUT'){puts++;value=flow.identity;}else value=flow.identity;
  } else status=404;
  res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address!=='string');
 const old={...process.env};process.env.NODE_ENV='test';process.env.BACKY_SUPABASE_URL=`http://127.0.0.1:${address.port}`;process.env.BACKY_SUPABASE_ANON_KEY='pkce-fixture-anon';
 try {
  const provider=load('../src/lib/visitor-auth/provider.ts'),session=load('../src/lib/visitor-auth/session.ts');
  const helpers=load('../src/lib/visitor-auth/routes.ts',{'@/lib/repositoryRuntime':{getRequiredDatabaseRepositories:async()=>repositories},'./provider':provider,'./session':session});
  const routes=Object.fromEntries(['register','callback','recovery','reset-password','session'].map(op=>[op,load(`../src/app/api/sites/[siteId]/visitor-auth/${op}/route.ts`,{'@/lib/visitor-auth/routes':helpers})]));
  async function send(op:string,body:any,site=a,requestOrigin=origin,raw?:string){const method=op==='session'?'GET':'POST';return routes[op][method](new NextRequest(`https://backy.example/api/sites/${site.id}/visitor-auth/${op}`,{method,headers:{origin:requestOrigin,'content-type':'application/json'},...(method==='POST'?{body:raw??JSON.stringify(body)}:{})}),{params:Promise.resolve({siteId:site.id})});}
  const callback=(delivery:any)=>({code:delivery.code,state:delivery.url.searchParams.get('backyVisitorState'),returnUrl:redirect});
  const start=async(email='pkce@example.com')=>{assert.equal((await send('register',{email,password:'test-correct-password',returnUrl:redirect,authFlow:'pkce',displayName:'PKCE member'})).status,202);return deliveries.at(-1);};
  const signup=await start();assert.equal(signup.url.searchParams.get('backySiteId'),a.id);assert.equal(signup.url.searchParams.get('backyVisitorFlow'),'signup');
  let count=calls.length;assert.equal((await send('callback',callback(signup),b,b.settings.visitorAccounts.allowedOrigins[0])).status,400);assert.equal((await send('callback',callback(signup),a,'https://evil.example')).status,403);assert.equal(calls.length,count);
  assert.equal((await send('callback',{...callback(signup),verifier:'client-verifier'})).status,400);
  assert.equal((await send('callback',{...callback(signup),code:'bad code'})).status,400);
  assert.equal((await send('callback',{},a,origin,JSON.stringify(callback(signup)).replace('"code":','"code":"hidden","code":'))).status,400);
  const enrolled=await send('callback',callback(signup));assert.equal(enrolled.status,200);assert.match(enrolled.headers.get('set-cookie')!,/HttpOnly/);const payload=await enrolled.json();assert.equal(payload.data.member.email,'pkce@example.com');assert.equal(payload.data.member.displayName,'PKCE member');assert.doesNotMatch(JSON.stringify(payload),/verifier|refresh|provider-|token-|pkce-fixture/);assert.equal((await send('callback',callback(signup))).status,401);
  const replay=await start('parallel@example.com');const outcomes=await Promise.all([send('callback',callback(replay)),send('callback',callback(replay))]);assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,401]);
  // Independent flows do not overwrite the first verifier.
  const first=await start('overlap1@example.com'),second=await start('overlap2@example.com');assert.equal((await send('callback',callback(first))).status,200);assert.equal((await send('callback',callback(second))).status,200);
  const failed=await start('failed@example.com');providerFailed=true;assert.equal((await send('callback',callback(failed))).status,503);providerFailed=false;assert.equal((await send('callback',callback(failed))).status,401);
  const unconfirmed=await start('unconfirmed@example.com');codes.get(unconfirmed.code).identity.email_confirmed_at=null;assert.equal((await send('callback',callback(unconfirmed))).status,401);
  const operator=await start('becomes-operator@example.com');codes.get(operator.code).identity.email='operator@example.com';assert.equal((await send('callback',callback(operator))).status,401);
  const recover=async()=>{assert.equal((await send('recovery',{email:'pkce@example.com',returnUrl:redirect,authFlow:'pkce'})).status,202);return deliveries.at(-1);};
  const recovery=await recover();assert.equal(recovery.url.searchParams.get('backyVisitorFlow'),'recovery');assert.equal((await send('callback',callback(recovery))).status,401);assert.equal((await send('reset-password',{...callback(signup),password:'updated-correct-password'})).status,401);count=puts;
  assert.equal((await send('reset-password',{...callback(recovery),accessToken:'token-forgery',password:'updated-correct-password'})).status,400);
  const reset=await send('reset-password',{...callback(recovery),password:'updated-correct-password'});assert.equal(reset.status,200);assert.equal(puts,count+1);assert.match(reset.headers.get('set-cookie')!,/Max-Age=0/);assert.doesNotMatch(await reset.text(),/token-|verifier|refresh/);assert.equal((await send('reset-password',{...callback(recovery),password:'updated-correct-password'})).status,401);
  const cookie=enrolled.headers.get('set-cookie')!.split(';')[0];assert.equal((await routes.session.GET(new NextRequest(`https://backy.example/api/sites/${a.id}/visitor-auth/session`,{headers:{origin,cookie}}),{params:Promise.resolve({siteId:a.id})})).status,401);
  count=deliveries.length;const missing=await send('recovery',{email:'unknown@example.com',returnUrl:redirect,authFlow:'pkce'}),existing=await send('recovery',{email:'pkce@example.com',returnUrl:redirect,authFlow:'pkce'});assert.deepEqual(await missing.json(),await existing.json());assert.equal(deliveries.length,count+1);
  const adapter=repositories.visitorAccounts.pkce;delete repositories.visitorAccounts.pkce;count=calls.length;try {assert.equal((await send('register',{email:'unavailable@example.com',password:'test-correct-password',returnUrl:redirect,authFlow:'pkce'})).status,503);assert.equal((await send('recovery',{email:'unknown@example.com',returnUrl:redirect,authFlow:'pkce'})).status,503);assert.equal(calls.length,count);}finally{repositories.visitorAccounts.pkce=adapter;}
  // Actual checked website BFF forwards code/state, fixes return URL, selects PKCE, and lifts only the site cookie.
  const frontendEnv={...process.env,BACKY_VISITOR_FRONTEND_ORIGIN:origin,BACKY_VISITOR_RETURN_URL:redirect};
  const bridgeFetch=async(input:string,init:RequestInit)=>{if(input.endsWith('/agent-handoff'))return Response.json({success:true,data:{site:{id:a.id},handoff:{visitorAccounts:{schemaVersion:'backy.site-visitor-accounts.v1',policy:{...a.settings.visitorAccounts,configurationValid:true}}}}});const op=new URL(input).pathname.split('/').at(-1)!;return send(op,JSON.parse(String(init.body||'{}')));};
  const bff=load('../../../examples/custom-frontend-next/src/lib/visitor-bff.ts',{'./backy':{backyConfig:{apiBaseUrl:'https://backy.example/api',siteId:a.id}}},bridgeFetch as any,frontendEnv);
  const website=async(op:string,body:any)=>bff.handleWebsiteAccount(new NextRequest(origin+'/api/backy-account/'+op,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}),op);
  assert.equal((await website('register',{email:'bff@example.com',password:'test-correct-password'})).status,202);const mail=deliveries.at(-1);
  const account=load('../../../examples/custom-frontend-next/src/lib/account.tsx');const parsed=account.consumeVisitorCallback(mail.url.toString(),a.id);assert.equal(parsed.operation,'callback');assert.equal(parsed.accessToken,'');assert.equal(account.consumeVisitorCallback(mail.url.toString(),b.id).operation,null);assert.equal(account.consumeVisitorCallback(mail.url.toString()+'&code=duplicate',a.id).operation,null);
  const webResponse=await website('callback',{code:parsed.code,state:parsed.state});assert.equal(webResponse.status,200);assert.match(webResponse.headers.get('set-cookie')!,/HttpOnly/);assert.doesNotMatch(await webResponse.text(),/token-|verifier|refresh/);
  assert.equal((await website('recovery',{email:'bff@example.com'})).status,202);const parsedRecovery=account.consumeVisitorCallback(deliveries.at(-1).url.toString(),a.id);assert.equal(parsedRecovery.operation,'reset-password');assert.equal((await website('reset-password',{code:parsedRecovery.code,state:parsedRecovery.state,password:'bff-new-password'})).status,200);
  function mount(callbackUrl: string) {
   const hooks:any[]=[];let cursor=0,effects:Array<()=>void>=[];const events:string[]=[],requests:any[]=[];
   const react={...React,useState(initial:any){const i=cursor++;hooks[i]??={value:initial};return[hooks[i].value,(value:any)=>hooks[i].value=value];},useRef(initial:any){const i=cursor++;hooks[i]??={value:{current:initial}};return hooks[i].value;},useEffect(fn:()=>void,deps:any[]){const i=cursor++;if(!hooks[i]||!deps.every((d,j)=>Object.is(d,hooks[i].deps[j]))){hooks[i]={deps};effects.push(fn);}}};
   const location=new URL(callbackUrl),uiFetch=async(url:string,init:RequestInit)=>{events.push('network');const completion=website(url.split('/').at(-1)!,JSON.parse(String(init.body||'{}')));requests.push({url,init,completion});return completion;};
   const source=load('../../../examples/custom-frontend-next/src/lib/account.tsx',{'react':react},uiFetch as any,frontendEnv,{FormData:class{constructor(readonly form:any){}has(key:string){return key in this.form.fields;}get(key:string){return this.form.fields[key];}},window:{location:{href:location.href,search:location.search,hash:location.hash,pathname:location.pathname},history:{replaceState:()=>events.push('scrub')}}});
   const render=()=>{cursor=0;effects=[];const tree=source.BackyAccount({siteId:a.id,registrationEnabled:true});for(const effect of effects)effect();return tree;};
   const find=(tree:any):any=>{if(!tree||typeof tree!=='object')return;if(tree.type==='form'&&tree.props['aria-label']==='Set new password')return tree;for(const child of React.Children.toArray(tree.props?.children)){const found=find(child);if(found)return found;}};
   return {render,find,events,requests};
  }
  assert.equal((await website('register',{email:'mounted@example.com',password:'test-correct-password'})).status,202);const mounted=mount(deliveries.at(-1).url.toString());mounted.render();await mounted.requests[0].completion;await new Promise(resolve=>setImmediate(resolve));assert.equal(mounted.events[0],'scrub');assert.equal(mounted.requests[0].url,'/api/backy-account/callback');assert.doesNotMatch(String(mounted.requests[0].init.body),/accessToken|verifier|refresh/);assert.match(renderToStaticMarkup(mounted.render()),/Signed in as/);
  assert.equal((await website('recovery',{email:'mounted@example.com'})).status,202);const mountedReset=mount(deliveries.at(-1).url.toString());mountedReset.render();const resetTree=mountedReset.render();assert.equal(mountedReset.events[0],'scrub');assert.equal(mountedReset.requests.length,0);assert.doesNotMatch(renderToStaticMarkup(resetTree),/code-[0-9]|bkv_|token-/);
  const passwordInput={value:'mounted-new-password'};await mountedReset.find(resetTree).props.onSubmit({preventDefault(){},currentTarget:{fields:{password:'mounted-new-password'},reset(){},querySelectorAll(){return[passwordInput];}}});assert.equal(passwordInput.value,'');assert.equal(mountedReset.requests[0].url,'/api/backy-account/reset-password');assert.doesNotMatch(String(mountedReset.requests[0].init.body),/accessToken|verifier|refresh/);assert.match(renderToStaticMarkup(mountedReset.render()),/Password updated|Sign in/);
  const failedReset=mount(deliveries.at(-1).url.toString());failedReset.render();const failedResetTree=failedReset.render();await failedReset.find(failedResetTree).props.onSubmit({preventDefault(){},currentTarget:{fields:{password:'mounted-new-password'},reset(){},querySelectorAll(){return[{value:'mounted-new-password'}];}}});assert.match(renderToStaticMarkup(failedReset.render()),/Request a new recovery email/);assert.doesNotMatch(renderToStaticMarkup(failedReset.render()),/code-[0-9]|bkv_|token-/);
  console.log('Visitor PKCE actual route/provider HTTP/BFF/callback checks passed: confirmation, recovery, replay/concurrent replay, overlap, scope, malformed/duplicate input, unavailable persistence/provider, unconfirmed/operator identity and secret-safe output.');
 } finally {for(const key of ['NODE_ENV','BACKY_SUPABASE_URL','BACKY_SUPABASE_ANON_KEY'])if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
export function pkceMemoryFixture() {
 const fixture=memoryVisitorFixture(),flows:any[]=[];
 (fixture.repositories.visitorAccounts as any).pkce={
  create:async(flow:any)=>{flows.push(flow);},
  consume:async(siteId:string,stateHash:string,origin:string,returnUrl:string,purpose:string)=>{const index=flows.findIndex(f=>f.siteId===siteId&&f.stateHash===stateHash&&f.origin===origin&&f.returnUrl===returnUrl&&f.purpose===purpose&&Date.parse(f.expiresAt)>Date.now());if(index<0)return null;return flows.splice(index,1)[0];},
 } as any;
 return {...fixture,flows};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const fixture=pkceMemoryFixture();await runVisitorPkceProof(fixture.repositories,fixture.sites);}
