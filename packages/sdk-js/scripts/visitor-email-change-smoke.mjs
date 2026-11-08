import assert from 'node:assert/strict';
import {createBackyClient,BackyApiError} from '../dist/index.js';
let status=0,invalid=false;const calls=[],token='bkv_'+'a'.repeat(43),origin='https://website.fixture';
const client=createBackyClient({baseUrl:'https://backy.fixture',siteId:'site/a',credentials:'include',defaultHeaders:{authorization:'Bearer PRIVATE_OPERATOR','x-backy-admin-key':'PRIVATE_OPERATOR',cookie:'backy_admin_session=PRIVATE_OPERATOR'},fetch:async(input,init)=>{
 const url=new URL(input);calls.push({url,init});const pending=url.pathname.endsWith('/email-change');
 if(status>=400)return Response.json({success:false,error:{code:status===409?'VISITOR_EMAIL_CHANGE_CONFLICT':'VISITOR_AUTHENTICATION_REQUIRED',message:'Unavailable'}},{status});
 return Response.json({success:true,data:{[pending?'confirmationRequired':'emailChanged']:!invalid,signInRequired:true,message:'Sign in afterward'}},{status:status||(pending?202:200)});
}});
let checks=0;const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const initiation={newEmail:'new@fixture.invalid',currentPassword:'PRIVATE_PASSWORD',returnUrl:origin+'/account'},completion={email:'new@fixture.invalid',password:'PRIVATE_PASSWORD'},options={origin,sessionToken:token};
const pending=await client.visitorEmailChange({...initiation,memberId:'foreign',accessToken:'PRIVATE_PROVIDER'},options);
check(pending.data.confirmationRequired===true&&pending.data.signInRequired===true,'202 is pending confirmation and sign-in');check(JSON.stringify(JSON.parse(calls.at(-1).init.body))===JSON.stringify(initiation),'Initiation forwards exact fields only');
const changed=await client.visitorConfirmEmailChange({...completion,memberId:'foreign',returnUrl:'https://foreign.fixture'},{origin});
check(changed.data.emailChanged===true&&changed.data.signInRequired===true,'Completion remains signed-out');check(JSON.stringify(JSON.parse(calls.at(-1).init.body))===JSON.stringify(completion),'Completion forwards exact fields only');
for(const {url,init}of calls){check(url.pathname.startsWith('/api/sites/site%2Fa/visitor-auth/'),'Site is encoded');check(init.method==='POST'&&init.cache==='no-store'&&init.redirect==='error','Private POST without redirects/cache');check(init.credentials==='same-origin','Default operator credentials not inherited');check(init.headers.get('origin')===origin,'Exact Origin transmitted');for(const name of ['authorization','x-backy-admin-key','cookie'])check(init.headers.get(name)===null,'Operator headers excluded');}
check(calls[0].init.headers.get('x-backy-visitor-session')===token&&calls[1].init.headers.get('x-backy-visitor-session')===null,'Initiation opaque session, completion signed-out');
for(const code of [401,409,429,503]){status=code;const before=calls.length;await assert.rejects(client.visitorEmailChange(initiation,options),error=>error instanceof BackyApiError&&error.status===code);checks++;check(calls.length===before+1,'Failure never retried');}status=0;
invalid=true;for(const run of [()=>client.visitorEmailChange(initiation,options),()=>client.visitorConfirmEmailChange(completion,{origin})]){await assert.rejects(run,/Invalid website email-change response/);checks++;}invalid=false;
status=200;await assert.rejects(client.visitorEmailChange(initiation,options),/Invalid website email-change response/);checks++;status=202;await assert.rejects(client.visitorConfirmEmailChange(completion,{origin}),/Invalid website email-change response/);checks++;status=0;
const before=calls.length;await assert.rejects(client.visitorEmailChange(initiation,{sessionToken:'provider-token'}),/opaque website visitor/);checks++;await assert.rejects(client.visitorConfirmEmailChange(completion,{origin:origin+'/path'}),/exact website origin/);checks++;check(calls.length===before,'Invalid client identity/origin never fetch');
console.log(`SDK visitor email change: ${checks} isolated exact transport/outcome assertions passed; no provider proof.`);
