/** Actual starter BFF + account component behavior; no browser/provider credentials. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url), origin='https://website.fixture', siteId='canonical-site', token='bkv_'+'a'.repeat(43), cookieName='backy_visitor_'+createHash('sha256').update(siteId).digest('hex').slice(0,16);
let enabled=true, configurationValid=true, profileAdvertised=true, wrongMember=false, upstreamFailure=0;
let profilePath:string|undefined,profileMethod:string|undefined,invalidMemberDate=false,suspendedMember=false;
let persistedName='Original name';
const calls:any[]=[];
const member=()=>({id:'member-fixture',siteId:wrongMember?'foreign-site':siteId,email:'member@fixture.invalid',displayName:persistedName,status:suspendedMember?'suspended':'active',createdAt:invalidMemberDate?{token:'PRIVATE_TOKEN'}:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z',providerSubject:'PRIVATE_SUBJECT',role:'owner',rawToken:'PRIVATE_TOKEN'});
const env={NODE_ENV:'production',BACKY_VISITOR_FRONTEND_ORIGIN:origin,BACKY_VISITOR_RETURN_URL:origin+'/account'};
const fetchFixture=async(input:string,init:RequestInit)=>{
  const url=new URL(input);calls.push({url,init});assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');
  if(url.pathname.endsWith('/agent-handoff'))return Response.json({success:true,data:{site:{id:siteId},handoff:{visitorAccounts:{schemaVersion:'backy.site-visitor-accounts.v1',endpoints:profileAdvertised?{profile:profilePath||`/api/sites/${siteId}/visitor-auth/profile`}:{},methods:profileAdvertised?{profile:profileMethod||'PATCH'}:{},policy:{enabled,configurationValid,registrationEnabled:false,allowedOrigins:[origin],returnUrls:[origin+'/account']}}}}});
  const headers=new Headers(init.headers);assert.equal(headers.get('origin'),origin);for(const name of ['cookie','authorization','x-backy-admin-key','x-provider-token'])assert.equal(headers.get(name),null);
  if(headers.get('x-backy-visitor-session')!==token)return Response.json({success:false,error:{code:'VISITOR_SESSION_REQUIRED',message:'PRIVATE_SUBJECT'}},{status:401});
  if(upstreamFailure)return Response.json({success:false,error:{code:'VISITOR_PROFILE_UNAVAILABLE',message:'PRIVATE_TOKEN provider secret'}},{status:upstreamFailure});
  if(url.pathname.endsWith('/profile')){assert.equal(init.method,'PATCH');const body=JSON.parse(String(init.body));assert.deepEqual(Object.keys(body),['displayName']);persistedName=body.displayName;}
  const result=Response.json({success:true,data:{member:member(),providerSubject:'PRIVATE_SUBJECT',rawToken:'PRIVATE_TOKEN',expiresAt:'PRIVATE_TOKEN'}});result.headers.append('set-cookie','backy_admin_session=PRIVATE_TOKEN; Path=/');return result;
};
function load(path:string,mocks:Record<string,unknown>={},extras:Record<string,unknown>={}){
 const filename=new URL('../'+path,import.meta.url).pathname,module={exports:{} as any};
 const compiled=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(compiled,{module,exports:module.exports,require:(id:string)=>id in mocks?mocks[id]:require(id),fetch:fetchFixture,process:{env},Buffer,URL,URLSearchParams,Headers,Response,Date,AbortSignal,console,...extras},{filename});return module.exports;
}
const bff=load('examples/custom-frontend-next/src/lib/visitor-bff.ts',{'./backy':{backyConfig:{apiBaseUrl:'https://backy.fixture/api',siteId:'configured-slug'}}});
const route=load('examples/custom-frontend-next/src/app/api/backy-account/[operation]/route.ts',{'../../../../lib/visitor-bff':bff});
let checks=0;
const check=(condition:unknown,message:string)=>{assert.ok(condition,message);checks++;};
async function call(body:unknown,options:{method?:string;headers?:Record<string,string>;raw?:string}={}){
 const method=options.method||'PATCH';const request=new NextRequest(origin+'/api/backy-account/profile',{method,headers:{origin,'content-type':'application/json',cookie:`${cookieName}=${token}; backy_admin_session=PRIVATE_OPERATOR; other_visitor=PRIVATE_OTHER`,'authorization':'Bearer PRIVATE_OPERATOR','x-backy-admin-key':'PRIVATE_OPERATOR','x-backy-visitor-session':'PRIVATE_FORGERY',...options.headers},...(method==='GET'?{}:{body:options.raw??JSON.stringify(body)})});
 return typeof route[method]==='function'?route[method](request,{params:Promise.resolve({operation:'profile'})}):bff.handleWebsiteAccount(request,'profile');
}
// Fails against the previous actual BFF (404) before the profile wiring is added.
const first=await call({displayName:'  Updated name  '});
assert.equal(first.status,200,'Actual checked starter profile PATCH must update the visitor display name');checks++;
check(persistedName==='Updated name','Bridge trims before forwarding');
check(new Headers(calls.at(-1).init.headers).get('x-backy-visitor-session')===token,'Only cookie-derived site visitor token is forwarded');
const firstPayload=await first.text();check(!/PRIVATE_|providerSubject|role|rawToken|bkv_/.test(firstPayload),'Profile response projects public member fields only');
check(first.headers.get('set-cookie')===null && first.headers.get('cache-control')?.includes('no-store'),'Profile does not relay unrelated cookies and remains private/no-store');
for(const method of ['GET','POST','PUT','DELETE']){const before=calls.length;check((await call({displayName:'Denied'},{method})).status===405,`Wrong profile ${method} denied`);check(calls.length===before,'Method denial before discovery/upstream');}
for(const body of [{},[],null,{displayName:120},{displayName:'x',email:'foreign@fixture.invalid'},{displayName:'x',memberId:'foreign'},{displayName:'x',siteId:'foreign'},{displayName:'x',role:'owner'},{displayName:'x',password:'PRIVATE_PASSWORD'},{displayName:'x',accessToken:'PRIVATE_PROVIDER'}, {displayName:'x'.repeat(121)},{displayName:'\nName'},{displayName:'Name\u0085'},{displayName:'Name\u0000'}]){const before=calls.filter(c=>!c.url.pathname.endsWith('/agent-handoff')).length;check((await call(body)).status===400,'Invalid/extra/identity/credential/control/length fields denied');check(calls.filter(c=>!c.url.pathname.endsWith('/agent-handoff')).length===before,'Invalid profile never reaches mutation upstream');}
check((await call({displayName:'   '})).status===200 && persistedName==='','Empty optional name can be cleared');
check((await call({displayName:' '.repeat(200)+'x'.repeat(120)+' '.repeat(200)})).status===200,'Length applies after trim, matching backend contract');
for(const contentType of ['application/jsonp','text/plain','application/x-www-form-urlencoded'])check((await call({displayName:'Name'},{headers:{'content-type':contentType}})).status===415,'Profile accepts exact JSON media type only');
check((await call({}, {raw:'{invalid'})).status===400,'Malformed JSON denied');
check((await call({}, {raw:'{"displayName":"'+'x'.repeat(17000)+'"}'})).status===413,'Profile body budget enforced');
for(const cookie of ['',`backy_admin_session=${token}`,`other_visitor=${token}`,`${cookieName}=invalid`]){const before=calls.filter(c=>!c.url.pathname.endsWith('/agent-handoff')).length;check((await call({displayName:'Denied'},{headers:{cookie,'x-backy-visitor-session':token}})).status===401,'Missing/foreign/operator cookie and forged header cannot authorize profile');check(calls.filter(c=>!c.url.pathname.endsWith('/agent-handoff')).length===before,'Cookie denial precedes profile upstream');}
let before=calls.length;check((await call({displayName:'Denied'},{headers:{origin:'https://foreign.fixture'}})).status===403 && calls.length===before,'Foreign origin denied before contract lookup');
enabled=false;check((await call({displayName:'Denied'})).status===403,'Disabled canonical account policy denied');enabled=true;
configurationValid=false;check((await call({displayName:'Denied'})).status===503,'Incomplete website policy denied');configurationValid=true;
profileAdvertised=false;check((await call({displayName:'Denied'})).status===503,'Missing canonical profile declaration denied');profileAdvertised=true;
profilePath='/api/sites/foreign-site/visitor-auth/profile';check((await call({displayName:'Name'})).status===503,'Foreign-site canonical profile endpoint declaration denied');profilePath=undefined;
profileMethod='POST';check((await call({displayName:'Name'})).status===503,'Non-PATCH canonical profile declaration denied');profileMethod=undefined;
invalidMemberDate=true;check((await call({displayName:'Name'})).status===503,'Malformed profile member response does not relay private nested values');invalidMemberDate=false;
suspendedMember=true;check((await call({displayName:'Name'})).status===503,'Inactive member response never accepted as saved profile');suspendedMember=false;
wrongMember=true;check((await call({displayName:'Name'})).status===503,'Foreign-site member result never reaches browser');wrongMember=false;
upstreamFailure=401;const denied=await call({displayName:'Name'});check(denied.status===401 && !/PRIVATE_/.test(await denied.text()),'Backend session denial stays authoritative and safe');upstreamFailure=503;const failed=await call({displayName:'Name'});check(failed.status===503 && !/PRIVATE_/.test(await failed.text()),'Raw provider/upstream failure text hidden');upstreamFailure=0;

// Actual client component with isolated hooks/network; its real onSubmit is invoked.
function accountHarness(){
 const hooks:any[]=[];let cursor=0,effects:Array<()=>void>=[];
 const clientCalls:any[]=[];let failProfile=false,failRefresh=false,pauseProfile:((value:Response)=>void)|undefined;
 let shouldPause=false;
 const react={...React,useState(initial:any){const i=cursor++;hooks[i]??={value:typeof initial==='function'?initial():initial};return[hooks[i].value,(next:any)=>{hooks[i].value=typeof next==='function'?next(hooks[i].value):next;}];},useRef(initial:any){const i=cursor++;hooks[i]??={value:{current:initial}};return hooks[i].value;},useEffect(callback:()=>void,deps:any[]){const i=cursor++;if(!hooks[i]||!deps.every((v,j)=>Object.is(v,hooks[i].deps[j]))){hooks[i]={deps};effects.push(callback);}}};
 const uiFetch=async(url:string,init:RequestInit)=>{
   clientCalls.push({url,init});const op=url.split('/').at(-1);
   if(op==='profile'){if(shouldPause){shouldPause=false;return new Promise<Response>(resolve=>{pauseProfile=resolve;});}if(failProfile)return Response.json({success:false,error:{message:'Display name could not be saved.'}},{status:400});persistedName=JSON.parse(String(init.body)).displayName.trim();}
   if(op==='session'&&failRefresh)return Response.json({success:false,error:{message:'Session unavailable'}},{status:503});
   return Response.json({success:true,data:{member:{...member(),siteId,status:'active'}}});
 };
 const source=load('examples/custom-frontend-next/src/lib/account.tsx',{'react':react},{fetch:uiFetch,window:{location:{href:origin+'/account',pathname:'/account',hash:'',search:''},history:{replaceState:()=>{}}}});
 function render(){cursor=0;effects=[];const tree=source.BackyAccount({siteId,registrationEnabled:false});for(const effect of effects)effect();return tree;}
 const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));};
 const find=(tree:any,predicate:(n:any)=>boolean):any=>{if(!tree||typeof tree!=='object')return; if(predicate(tree))return tree;for(const child of React.Children.toArray(tree.props?.children)){const found=find(child,predicate);if(found)return found;}};
 const form=(tree:any)=>find(tree,n=>n.type==='form'&&n.props['aria-label']==='Display name profile');
 const input=(tree:any)=>find(form(tree),n=>n.type==='input'&&n.props.name==='displayName');
 const submit=()=>form(render()).props.onSubmit({preventDefault(){}});
 const draft=(name:string)=>input(render()).props.onChange({target:{value:name}});
 return{render,settle,form,input,submit,draft,clientCalls,failProfile:(value:boolean)=>{failProfile=value;},failRefresh:(value:boolean)=>{failRefresh=value;},pause:()=>{shouldPause=true;},resume:(name:string)=>{persistedName=name;pauseProfile?.(Response.json({success:true,data:{member:{...member(),siteId,status:'active'}}}));}};
}
persistedName='Initial display name';const ui=accountHarness();ui.render();await ui.settle();let tree=ui.render();tree=ui.render();
check(ui.input(tree).props.value==='Initial display name','Session-load populates editable display name');
const html=renderToStaticMarkup(tree);check(html.includes('Save display name') && html.includes('aria-label="Display name profile"') && !html.includes('name="email"'),'Actual signed-in UI has accessible display-name form without email-edit controls');
ui.draft('  Saved display name  ');await ui.submit();await ui.settle();tree=ui.render();tree=ui.render();
const profileCall=ui.clientCalls.find(c=>c.url.endsWith('/profile'));
check(profileCall.init.method==='PATCH' && Object.keys(JSON.parse(profileCall.init.body)).join(',')==='displayName','Actual component submits PATCH with only displayName');
check(profileCall.init.credentials==='same-origin' && profileCall.init.cache==='no-store','Actual component uses same-origin cookie/no-store transport');
check(ui.clientCalls.at(-1).url.endsWith('/session'),'Save refreshes current session after mutation');
check(ui.input(tree).props.value==='Saved display name' && renderToStaticMarkup(tree).includes('Display name saved.'),'Saved normalized member appears in UI');
ui.failProfile(true);ui.draft('Rejected draft');await ui.submit();await ui.settle();tree=ui.render();check(ui.input(tree).props.value==='Rejected draft' && renderToStaticMarkup(tree).includes('role="alert"') && persistedName==='Saved display name','Failed save retains draft, shows error and does not claim persistence');ui.failProfile(false);
ui.pause();ui.draft('Later saved name');const pending=ui.submit();tree=ui.render();check(ui.form(tree).props['aria-busy']===true && ui.input(tree).props.disabled===true,'Actual form/input are busy while save is pending');const mutations=ui.clientCalls.filter(c=>c.url.endsWith('/profile')).length;await ui.submit();check(ui.clientCalls.filter(c=>c.url.endsWith('/profile')).length===mutations,'Busy duplicate submit cannot repeat mutation');ui.resume('Later saved name');await pending;await ui.settle();tree=ui.render();tree=ui.render();check(!ui.form(tree).props['aria-busy'] && ui.input(tree).props.value==='Later saved name','Save completion releases busy state with current member');
ui.failRefresh(true);ui.draft('Saved despite refresh outage');await ui.submit();await ui.settle();tree=ui.render();tree=ui.render();const refreshHtml=renderToStaticMarkup(tree);check(refreshHtml.includes('Display name saved.') && refreshHtml.includes('could not be refreshed') && ui.input(tree).props.value==='Saved despite refresh outage','Mutation success remains explicit when follow-up session refresh fails');ui.failRefresh(false);
const reopened=accountHarness();reopened.render();await reopened.settle();reopened.render();tree=reopened.render();check(reopened.input(tree).props.value==='Saved despite refresh outage','Reopened account loads persisted display name through session');
const accountSource=readFileSync(new URL('../examples/custom-frontend-next/src/lib/account.tsx',import.meta.url),'utf8');check(!/localStorage|sessionStorage/.test(accountSource),'No browser credential/token storage introduced');
console.log(`Starter visitor profile: ${checks} actual BFF/component assertions passed; isolated upstream/hook fixtures, no browser/provider proof.`);
