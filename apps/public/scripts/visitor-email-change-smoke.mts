import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server';
import { loadMediaFixture as loadSharedFixture } from './media-storage-recovery-fixture.mts';
import { memoryVisitorFixture } from './visitor-auth-smoke.mts';
import { assertVisitorContract } from './visitor-contract.mjs';
const loadMediaFixture = (relative: string, mocks: Record<string, any>) => loadSharedFixture(relative, mocks, process, { fetch, AbortSignal, TextDecoder, setTimeout, clearTimeout });

/** Actual saved POST wrappers and provider HTTP adapter. Provider accounts are disposable synthetic data. */
export async function runVisitorEmailChangeProof(repositories: any, sites: any[]) {
  const repo = repositories.visitorAccounts, calls: any[] = [], events: string[] = [];
  const user: any = { id: randomUUID(), email: randomUUID()+'@example.test', email_confirmed_at: '2026-01-01T00:00:00Z', user_metadata: { secret: 'fixture-private-metadata' } };
  const password = 'fixture-correct-password', accessToken = 'fixture-provider-access-token', target = randomUUID()+'@example.test';
  let fault = '', putStatus = 200, overrideUser: any = null, pending = '', admitCalls = 0, reconcileCalls = 0;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null, url = new URL(req.url!, 'http://fixture');
    calls.push({ path: url.pathname, query: url.searchParams, method: req.method, body, authorization: req.headers.authorization, key: req.headers.apikey });
    let status = 200, value: any = {};
    if (url.pathname === '/auth/v1/token') {
      assert.equal(url.searchParams.get('grant_type'), 'password'); assert.deepEqual(Object.keys(body).sort(), ['email','password']);
      if (body.email !== user.email || body.password !== password) { status = 400; value = { error: 'fixture-private-credentials', access_token: accessToken }; }
      else value = { access_token: accessToken, refresh_token: 'fixture-provider-refresh-token', user };
    } else if (url.pathname === '/auth/v1/user') {
      assert.equal(req.headers.authorization, `Bearer ${accessToken}`);
      if (req.method === 'PUT') {
        events.push('provider-put'); assert.equal(events.at(-2), 'admission-committed'); assert.deepEqual(Object.keys(body), ['email']);
        assert.equal(url.searchParams.get('redirect_to'), sites[0].settings.visitorAccounts.returnUrls[0]);
        pending = body.email; status = putStatus; value = status === 200 ? { ...user, new_email: pending } : { error: 'fixture-private-provider-error', token: accessToken };
      } else value = overrideUser || user;
    } else if (url.pathname === '/auth/v1/recover') {
      assert.deepEqual(body,{email:user.email});value={};
    } else { status = 404; value = { error: 'fixture-private-path' }; }
    res.writeHead(status, { 'content-type': 'application/json' });
    if (fault && (req.method === 'PUT' || url.pathname === '/auth/v1/token')) {
      if (fault === 'disconnect') { req.socket.destroy(); return; }
      if (fault === 'stalled') { res.write('{'); return; }
      if (fault === 'oversized') { res.end(JSON.stringify({ junk: 'x'.repeat(131073) })); return; }
      if (fault === 'utf8') { res.end(Buffer.from([123,34,97,34,58,34,255,34,125])); return; }
      if (fault === 'array') { res.end('[]'); return; }
      if (fault === 'malformed') { res.end('{broken'); return; }
    }
    res.end(JSON.stringify(value));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert(address && typeof address !== 'string');
  const old = { url: process.env.BACKY_SUPABASE_URL, key: process.env.BACKY_SUPABASE_ANON_KEY, mode: process.env.NODE_ENV };
  process.env.BACKY_SUPABASE_URL = `http://127.0.0.1:${address.port}`; process.env.BACKY_SUPABASE_ANON_KEY = 'fixture-anon-key'; process.env.NODE_ENV = 'test';
  const original = { rate: repo.consumeRateLimit, admission: repo.emailChange.admit, reconcile: repo.emailChange.reconcile, operator: repo.isOperatorIdentity };
  repo.consumeRateLimit = async () => true;
  repo.emailChange.admit = async (...args: any[]) => { admitCalls++; const result = await original.admission(...args); if (result) events.push('admission-committed'); return result; };
  repo.emailChange.reconcile = async (...args:any[]) => { reconcileCalls++; return original.reconcile(...args); };
  let checks = 0;
  const check = async (name: string, action: () => Promise<void>) => { try { await action(); checks++; } catch (error) { throw new Error(`${name}: ${error}`); } };
  try {
    const provider = loadMediaFixture('../src/lib/visitor-auth/provider.ts', {}), sessions = loadMediaFixture('../src/lib/visitor-auth/session.ts', {});
    const existing = loadMediaFixture('../src/lib/visitor-auth/routes.ts', { '@/lib/repositoryRuntime': { getRequiredDatabaseRepositories: async () => repositories }, './provider': provider, './session': sessions });
    const helper = loadMediaFixture('../src/lib/visitor-auth/email-change-routes.ts', { '@/lib/repositoryRuntime': { getRequiredDatabaseRepositories: async () => repositories }, './routes': existing, './provider': provider, './session': sessions });
    const routes = Object.fromEntries(['email-change','confirm-email-change'].map(operation => [operation, loadMediaFixture(`../src/app/api/sites/[siteId]/visitor-auth/${operation}/route.ts`, { '@/lib/visitor-auth/email-change-routes': helper })]));
    const identity = { issuer: `${process.env.BACKY_SUPABASE_URL}/auth/v1`, subject: user.id, email: user.email };
    const member = await repo.enroll(sites[0].id, identity, 'Retained selected name'), other = await repo.enroll(sites[1].id, identity, 'Retained other name');
    let token = '', otherToken = '';
    const issue = async (current = member) => { const value = sessions.newVisitorToken(); assert(await repo.createSession({ siteId: current.siteId, memberId: current.id, tokenHash: sessions.visitorTokenHash(value), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+3600000).toISOString() })); return value; };
    const renew = async () => { token = await issue(); otherToken = await issue(other); };
    await renew();
    const valid = () => ({ newEmail: target, currentPassword: password, returnUrl: sites[0].settings.visitorAccounts.returnUrls[0] });
    const send = async (operation: string, body: any, options: any = {}) => {
      const siteKey = options.siteKey || sites[0].id;
      const request = new NextRequest(`http://backy.local/api/sites/${siteKey}/visitor-auth/${operation}`, { method: options.method || 'POST', headers: { origin: sites[0].settings.visitorAccounts.allowedOrigins[0], 'content-type': 'application/json', cookie: `${sessions.visitorCookieName(sites[0].id)}=${token}`, ...options.headers }, body: options.raw === undefined ? JSON.stringify(body) : options.raw });
      const response = options.method ? await helper.handleVisitorEmailChange(request, siteKey, operation) : await routes[operation].POST(request, { params: Promise.resolve({ siteId: siteKey }) });
      assert.match(response.headers.get('cache-control')!, /private.*no-store/);
      assert.doesNotMatch(await response.clone().text(), /fixture-private|fixture-provider|fixture-anon-key|currentPassword|refresh_token/);
      if (response.status !== 405) assertVisitorContract(operation, response.status, await response.clone().json());
      return response;
    };
    const deny = async (status: number, operation: string, body: any, options: any = {}, beforeProvider = true) => check(`${operation} rejects ${status} ${JSON.stringify(options)} ${JSON.stringify(body).slice(0,70)}`, async () => {
      const count = calls.length, response = await send(operation, body, options); assert.equal(response.status, status); assert.equal(response.headers.get('set-cookie'), null);
      if (beforeProvider) assert.equal(calls.length, count);
      assert(await repo.resolveSession(sites[0].id, sessions.visitorTokenHash(token), new Date().toISOString()));
    });
    for (const operation of ['email-change','confirm-email-change']) {
      const input = operation === 'email-change' ? valid() : { email: target, password };
      for (const origin of ['', 'https://foreign.example.test', sites[0].settings.visitorAccounts.allowedOrigins[0]+'/path']) await deny(403, operation, input, { headers: { origin, 'sec-fetch-site':'same-origin', referer: sites[0].settings.visitorAccounts.allowedOrigins[0]+'/account' } });
      for (const type of ['application/jsonp','text/plain','']) await deny(415, operation, input, { headers: { 'content-type': type } });
      for (const body of [{}, [], {...input, unknown:'x'}, {...input, accessToken}, {...input, emailChangeToken:'forged'}, {...input, siteId: sites[1].id}]) await deny(400, operation, body);
      await deny(400, operation, input, { raw: JSON.stringify(input).replace('{', '{"password":"duplicate",') });
      await deny(400, operation, input, { raw: '{"em\\u0061il":"first","email":"second","password":"fixture-correct-password"}' });
      await deny(400, operation, input, { raw: new Uint8Array([123,34,255,34,58,34,97,34,125]) });
      await deny(413, operation, input, { raw: JSON.stringify({...input, unknown:'x'.repeat(17000)}) });
      await deny(404, operation, input, { siteKey: randomUUID() });
      await deny(405, operation, input, { method:'PATCH' });
    }
    await deny(400,'email-change',{...valid(),newEmail:user.email});
    await deny(400,'email-change',{...valid(),newEmail:'invalid'});
    await deny(400,'email-change',{...valid(),currentPassword:''});
    await deny(400,'email-change',{...valid(),currentPassword:'x'.repeat(1025)});
    await deny(400,'email-change',{...valid(),returnUrl:valid().returnUrl+'/unapproved'});
    for (const headers of [{cookie:''},{cookie:'backy_admin_session=operator',authorization:`Bearer ${accessToken}`},{cookie:'','x-backy-admin-session':token},{cookie:`${sessions.visitorCookieName(sites[1].id)}=${otherToken}`}]) await deny(401,'email-change',valid(),{headers});
    const capability = repo.emailChange; delete repo.emailChange;
    try { await deny(503,'email-change',valid()); await deny(503,'confirm-email-change',{email:target,password}); } finally { repo.emailChange=capability; }
    repo.consumeRateLimit=async()=>false;try { await deny(429,'email-change',valid()); await deny(429,'confirm-email-change',{email:target,password}); } finally { repo.consumeRateLimit=async()=>true; }
    for (const policy of [{...sites[0],isPublished:false},{...sites[0],settings:{visitorAccounts:{...sites[0].settings.visitorAccounts,enabled:false}}}]) {
      const get = repositories.sites.getById; repositories.sites.getById=async(id:string)=>id===sites[0].id?policy:get(id);
      try { await deny(403,'email-change',valid()); } finally { repositories.sites.getById=get; }
    }
    await deny(401,'email-change',{...valid(),currentPassword:'incorrect'},{},false);
    for (const overridden of [{...user,id:randomUUID()},{...user,email:target},{...user,email_confirmed_at:null},{...user,email_confirmed_at:'invalid'},{...user,is_anonymous:true}]) {
      const before=admitCalls;overrideUser=overridden;try{await deny(401,'email-change',valid(),{},false);if(overridden.email===target)assert.equal(admitCalls,before,'Provider current-email mismatch must not reach admission');}finally{overrideUser=null;}
    }
    repo.isOperatorIdentity=async(i:any)=>i.email===target || original.operator(i);
    try { await deny(401,'email-change',valid()); await deny(401,'confirm-email-change',{email:target,password}); } finally { repo.isOperatorIdentity=original.operator; }
    const admit=repo.emailChange.admit;repo.emailChange.admit=async()=>null;
    try{await deny(401,'email-change',valid(),{},false);}finally{repo.emailChange.admit=admit;}
    repo.emailChange.admit=async()=>{throw Object.assign(new Error('fixture-private-database-conflict'),{code:'VISITOR_EMAIL_CHANGE_CONFLICT'});};
    try{await deny(409,'email-change',valid(),{},false);}finally{repo.emailChange.admit=admit;}
    await check('real provider PUT follows committed revocation and leaves local email pending',async()=>{
      const challenge=sessions.newVisitorToken();await repo.createRecoveryChallenge({siteId:sites[1].id,memberId:other.id,tokenHash:sessions.visitorTokenHash(challenge),expiresAt:new Date(Date.now()+900000).toISOString()});
      const response=await send('email-change',valid(),{siteKey:sites[0].slug});assert.equal(response.status,202);assert.deepEqual(Object.keys((await response.json()).data).sort(),['confirmationRequired','message','signInRequired']);assert.match(response.headers.get('set-cookie')!,/Max-Age=0/);
      assert.equal(await repo.resolveSession(sites[0].id,sessions.visitorTokenHash(token),new Date().toISOString()),null);assert.equal(await repo.resolveSession(sites[1].id,sessions.visitorTokenHash(otherToken),new Date().toISOString()),null);
      assert.equal(await repo.consumeRecoveryChallenge(sites[1].id,other.id,sessions.visitorTokenHash(challenge),new Date().toISOString()),false);assert.equal((await repo.getByIdentity(sites[0].id,identity)).email,identity.email);assert.equal(pending,target);
      const put=calls.filter(c=>c.method==='PUT').at(-1);assert.equal(put.key,'fixture-anon-key');assert.equal(put.authorization,`Bearer ${accessToken}`);assert.deepEqual(put.body,{email:target});assert.equal(calls.some(c=>c.path.includes('/admin/')),false);
    });
    await renew();await deny(401,'confirm-email-change',{email:target,password},{},false);
    await check('provider-confirmed email reconciles existing identities and revokes sessions without enrollment',async()=>{
      user.email=target;const response=await send('confirm-email-change',{email:target,password},{headers:{cookie:''}});assert.equal(response.status,200);const data=(await response.json()).data;assert.deepEqual(Object.keys(data).sort(),['emailChanged','message','signInRequired']);assert.equal(data.emailChanged,true);assert.match(response.headers.get('set-cookie')!,/Max-Age=0/);
      const confirmed={...identity,email:target};const saved=await repo.getByIdentity(sites[0].id,confirmed),savedOther=await repo.getByIdentity(sites[1].id,confirmed);assert.equal(saved.id,member.id);assert.equal(savedOther.id,other.id);assert.equal(saved.displayName,'Retained selected name');assert.equal(savedOther.displayName,'Retained other name');assert.equal(saved.status,'active');assert.equal(await repo.resolveSession(sites[0].id,sessions.visitorTokenHash(token),new Date().toISOString()),null);
      assert.equal(await repo.resolveSession(sites[1].id,sessions.visitorTokenHash(otherToken),new Date().toISOString()),null);assert.equal(await repo.getByIdentity(sites[0].id,identity),null);
      assert.equal((await send('confirm-email-change',{email:target,password},{headers:{cookie:''}})).status,200,'Completion retries survive prior synchronization/revocation');
    });
    await check('ordinary login and recovery pass the authoritative expectedEmail grant guard',async()=>{
      const mint=repo.createSession,challenge=repo.createRecoveryChallenge;let mints=0,challenges=0;
      repo.createSession=async(input:any)=>{assert.equal(input.expectedEmail,target);mints++;return mint(input);};repo.createRecoveryChallenge=async(input:any)=>{assert.equal(input.expectedEmail,target);challenges++;return challenge(input);};
      try{
        const request=(operation:string,body:any)=>new NextRequest(`http://backy.local/api/sites/${sites[0].id}/visitor-auth/${operation}`,{method:'POST',headers:{origin:sites[0].settings.visitorAccounts.allowedOrigins[0],'content-type':'application/json'},body:JSON.stringify(body)});
        const login=await existing.handleVisitorAuth(request('login',{email:target,password}),sites[0].id,'login');assert.equal(login.status,200);assertVisitorContract('login',200,await login.clone().json());assert.equal((await login.json()).data.member.id,member.id);assert.equal(mints,1);
        const recovery=await existing.handleVisitorAuth(request('recovery',{email:target,returnUrl:valid().returnUrl}),sites[0].id,'recovery');assert.equal(recovery.status,202);assertVisitorContract('recovery',202,await recovery.json());assert.equal(challenges,1);
      }finally{repo.createSession=mint;repo.createRecoveryChallenge=challenge;}
    });
    await renew();
    await check('provider completion email mismatch never reaches reconciliation',async()=>{const before=reconcileCalls;overrideUser={...user,email:identity.email};try{await deny(401,'confirm-email-change',{email:target,password},{},false);assert.equal(reconcileCalls,before);}finally{overrideUser=null;}});
    const reconcile=repo.emailChange.reconcile;repo.emailChange.reconcile=async()=>null;
    try{await deny(401,'confirm-email-change',{email:target,password},{},false);}finally{repo.emailChange.reconcile=reconcile;}
    repo.emailChange.reconcile=async()=>{throw Object.assign(new Error('fixture-private-conflict'),{code:'VISITOR_EMAIL_CHANGE_CONFLICT'});};
    try{await deny(409,'confirm-email-change',{email:target,password},{},false);}finally{repo.emailChange.reconcile=reconcile;}
    const nextTarget=randomUUID()+'@example.test';
    for(const scenario of ['rejected','disconnect','oversized','utf8','array','malformed','stalled']) await check(`provider ${scenario} after admission clears cookie with safe retry message`,async()=>{
      await renew();fault=scenario==='rejected'?'':scenario;putStatus=scenario==='rejected'?422:200;
      // Fault only the mutation: password/user verification must complete before revocation.
      const requestFault=fault;fault='';const originalAdmission=repo.emailChange.admit;
      repo.emailChange.admit=async(...args:any[])=>{const result=await originalAdmission(...args);fault=requestFault;return result;};
      const started=Date.now();try{const response=await send('email-change',{...valid(),newEmail:nextTarget});assert.equal(response.status,503);assert.match(response.headers.get('set-cookie')!,/Max-Age=0/);assert.match((await response.json()).error.message,/sessions were revoked/i);assert.equal(await repo.resolveSession(sites[0].id,sessions.visitorTokenHash(token),new Date().toISOString()),null);if(scenario==='stalled'){assert(Date.now()-started>=9000);assert(Date.now()-started<14000);}}finally{fault='';putStatus=200;repo.emailChange.admit=originalAdmission;}
    });
    await renew();for(const scenario of ['oversized','utf8','array','malformed']){fault=scenario;try{await deny(503,'email-change',{...valid(),newEmail:nextTarget},{},false);}finally{fault='';}}
    await check('provider body deadline survives a reader whose cancellation never resolves',async()=>{
      let cancellations=0;
      const isolatedProvider=loadSharedFixture('../src/lib/visitor-auth/provider.ts',{},process,{AbortSignal,TextDecoder,setTimeout,clearTimeout,fetch:async()=>({status:200,ok:true,headers:new Headers({'content-type':'application/json'}),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:()=>{cancellations++;return new Promise(()=>{});}})}})});
      const started=Date.now();await assert.rejects(isolatedProvider.requestVisitorProviderEmailChange(accessToken,nextTarget,valid().returnUrl),/Visitor identity provider unavailable/);assert(Date.now()-started>=9000);assert(Date.now()-started<14000);assert(cancellations>0);
    });
    return { checks, boundary:'Actual saved handlers/provider HTTP; synthetic provider and supplied repository; no live provider or email.' };
  } finally {
    repo.consumeRateLimit=original.rate;repo.emailChange.admit=original.admission;repo.emailChange.reconcile=original.reconcile;repo.isOperatorIdentity=original.operator;
    for(const [name,value] of [['BACKY_SUPABASE_URL',old.url],['BACKY_SUPABASE_ANON_KEY',old.key],['NODE_ENV',old.mode]] as const){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture=memoryVisitorFixture(),repo:any=fixture.repositories.visitorAccounts;
  const revoke=async(identity:any)=>{const ids=fixture.members.filter(m=>m.issuer===identity.issuer&&m.subject===identity.subject).map(m=>m.id);let revokedSessions=0,revokedRecoveryChallenges=0;for(let i=fixture.sessions.length-1;i>=0;i--)if(ids.includes(fixture.sessions[i].memberId)){fixture.sessions.splice(i,1);revokedSessions++;}for(let i=fixture.challenges.length-1;i>=0;i--)if(ids.includes(fixture.challenges[i].memberId)){fixture.challenges.splice(i,1);revokedRecoveryChallenges++;}return{revokedSessions,revokedRecoveryChallenges};};
  repo.emailChange={
    admit:async(siteId:string,memberId:string,tokenHash:string,identity:any,target:string)=>{const member=await repo.resolveSession(siteId,tokenHash,new Date().toISOString());if(!member||member.id!==memberId||member.issuer!==identity.issuer||member.subject!==identity.subject||member.email!==identity.email||await repo.isOperatorIdentity(identity)||await repo.isOperatorIdentity({email:target}))return null;const rows=fixture.members.filter(m=>m.issuer===identity.issuer&&m.subject===identity.subject&&m.status!=='removed');if(rows.some(row=>fixture.members.some(m=>m.siteId===row.siteId&&m.email===target&&m.id!==row.id)))throw Object.assign(new Error('Conflict'),{code:'VISITOR_EMAIL_CHANGE_CONFLICT'});return{member,...await revoke(identity)};},
    reconcile:async(siteId:string,identity:any)=>{const rows=fixture.members.filter(m=>m.issuer===identity.issuer&&m.subject===identity.subject),member=rows.find(m=>m.siteId===siteId&&m.status==='active');if(!member||await repo.isOperatorIdentity(identity))return null;const current=rows.filter(m=>m.status!=='removed');if(current.some(row=>fixture.members.some(m=>m.siteId===row.siteId&&m.email===identity.email&&m.id!==row.id)))throw Object.assign(new Error('Conflict'),{code:'VISITOR_EMAIL_CHANGE_CONFLICT'});let synchronizedMemberships=0;for(const row of current)if(row.email!==identity.email){row.email=identity.email;row.updatedAt=new Date().toISOString();synchronizedMemberships++;}return{member,synchronizedMemberships,...await revoke(identity)};},
  };
  console.log(JSON.stringify({ok:true,...await runVisitorEmailChangeProof(fixture.repositories,fixture.sites)}));
}
